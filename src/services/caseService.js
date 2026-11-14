const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const CaseModel = require('../models/caseModel');
const DocumentModel = require('../models/documentModel');
const TimelineService = require('./timelineService');

/**
 * Service Layer for Case Management.
 * Handles business logic independent of HTTP transport.
 * Manages database transactions for atomic case creation and milestone recording.
 */
class CaseService {
  /**
   * Create a new consumer case and record automatic creation milestone within a single transaction.
   */
  static async createCase(caseData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const newCase = await CaseModel.createCase(caseData, connection);
      await TimelineService.recordCaseCreatedMilestone(newCase, connection);

      await connection.commit();
      return newCase;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Retrieve paginated cases with optional filters.
   */
  static async getCases({ page = 1, limit = 10, status, issue_category } = {}) {
    return CaseModel.findAll({ page, limit, status, issue_category });
  }

  /**
   * Retrieve a single case by its primary ID.
   */
  static async getCaseById(id) {
    return CaseModel.findById(id);
  }

  /**
   * Update fields of an existing case.
   * Returns null if case does not exist.
   */
  static async updateCase(id, updateData) {
    const existingCase = await CaseModel.findById(id);
    if (!existingCase) {
      return null;
    }

    return CaseModel.updateById(id, updateData);
  }

  /**
   * Delete a case by ID.
   * Uses a database transaction for case and child-record deletion.
   * Commits the database transaction before unlinking physical files.
   * If physical file cleanup fails, logs the orphaned file paths safely for retry.
   * Never deletes files outside the canonical uploads directory.
   */
  static async deleteCase(id) {
    // 1. Verify case exists
    const existingCase = await CaseModel.findById(id);
    if (!existingCase) {
      const error = new Error(`Case with ID ${id} not found.`);
      error.statusCode = 404;
      throw error;
    }

    // 2. Fetch all document file paths belonging to this case before deletion
    const caseDocs = await DocumentModel.findByCaseId(id);
    const filePathsToUnlink = [];

    // Verify paths are strictly contained within canonical uploads/
    const uploadDirConfig = process.env.UPLOAD_DIR || 'uploads';
    const uploadDirResolved = path.resolve(uploadDirConfig);
    let realUploadDir = uploadDirResolved;
    try {
      realUploadDir = await fs.promises.realpath(uploadDirResolved);
    } catch (e) {
      realUploadDir = uploadDirResolved;
    }

    // Need raw file_paths which findByCaseId excludes for security
    // Query directly within transaction or inspect documents
    const connection = await pool.getConnection();
    let unlinkedCount = 0;
    const orphanedFiles = [];

    try {
      await connection.beginTransaction();

      // Get internal file_path records for unlinking
      const [docRows] = await connection.query(
        'SELECT id, file_path FROM case_documents WHERE case_id = ?',
        [id]
      );

      for (const row of docRows) {
        if (row.file_path) {
          const targetFile = path.resolve(row.file_path);
          const lexicalRelative = path.relative(uploadDirResolved, targetFile);

          if (!lexicalRelative.startsWith('..') && !path.isAbsolute(lexicalRelative)) {
            try {
              const realTarget = await fs.promises.realpath(targetFile);
              const canonicalRelative = path.relative(realUploadDir, realTarget);
              if (!canonicalRelative.startsWith('..') && !path.isAbsolute(canonicalRelative)) {
                filePathsToUnlink.push(realTarget);
              } else {
                console.warn(`[CaseService Security Warning] Skipping file outside canonical uploads dir: ${targetFile}`);
              }
            } catch (err) {
              if (err.code !== 'ENOENT') {
                console.warn(`[CaseService Warning] Failed to resolve target file ${targetFile}:`, err.message);
              }
            }
          } else {
            console.warn(`[CaseService Security Warning] Skipping path traversal attempt: ${targetFile}`);
          }
        }
      }

      // Delete the case from MySQL (foreign keys cascade to child tables)
      await CaseModel.deleteById(id, connection);

      // Commit DB transaction first
      await connection.commit();
    } catch (dbError) {
      await connection.rollback();
      throw dbError;
    } finally {
      connection.release();
    }

    // 3. Unlink physical files on disk after DB commit
    for (const filePath of filePathsToUnlink) {
      try {
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
          unlinkedCount++;
        }
      } catch (unlinkErr) {
        if (unlinkErr.code !== 'ENOENT') {
          console.error(`[CaseService Orphaned File Error] Failed to unlink physical file ${filePath}:`, unlinkErr.message);
          orphanedFiles.push(filePath);
        }
      }
    }

    return {
      deleted: true,
      id: String(id),
      files_unlinked: unlinkedCount,
      orphaned_files: orphanedFiles.length > 0 ? orphanedFiles : undefined,
    };
  }
}

module.exports = CaseService;
