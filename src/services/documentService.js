const path = require('path');
const fs = require('fs');
const DocumentModel = require('../models/documentModel');
const CaseModel = require('../models/caseModel');

/**
 * Service Layer for Case Document Management.
 * Implements business logic, file containment security, and transactional cleanup.
 */
class DocumentService {
  /**
   * Upload and register a document for a case.
   * Cleans up physical file if case lookup or DB insertion fails.
   */
  static async uploadDocument({ caseId, file, documentType, description }) {
    // 1. Verify that the parent case exists
    const caseItem = await CaseModel.findById(caseId);
    if (!caseItem) {
      if (file && file.path) {
        try {
          await fs.promises.unlink(file.path);
        } catch (err) {
          // Ignore ENOENT
        }
      }
      const error = new Error(`Case with ID ${caseId} not found.`);
      error.statusCode = 404;
      throw error;
    }

    // 2. Persist metadata in database
    try {
      const docRecord = await DocumentModel.createDocument({
        case_id: caseId,
        original_filename: file.originalname,
        stored_filename: file.filename,
        file_path: file.path,
        mime_type: file.mimetype,
        file_size: file.size,
        document_type: documentType || 'OTHER',
        description: description || null,
      });

      // 3. Return sanitized response (never expose absolute filesystem paths)
      const sanitized = { ...docRecord };
      delete sanitized.file_path;
      return sanitized;
    } catch (dbError) {
      // Clean up physical file on database failure
      if (file && file.path) {
        try {
          await fs.promises.unlink(file.path);
        } catch (unlinkErr) {
          // Ignore ENOENT
        }
      }
      throw dbError;
    }
  }

  /**
   * Retrieve all documents attached to a case.
   * Verifies case existence and returns metadata without internal file paths.
   */
  static async getDocumentsByCaseId(caseId) {
    const caseItem = await CaseModel.findById(caseId);
    if (!caseItem) {
      const error = new Error(`Case with ID ${caseId} not found.`);
      error.statusCode = 404;
      throw error;
    }

    return DocumentModel.findByCaseId(caseId);
  }

  /**
   * Safely delete a document.
   * Verifies case ownership, verifies path containment within uploads/,
   * deletes database record first, then unlinks physical file safely.
   */
  static async deleteDocument({ caseId, docId }) {
    // 1. Verify case exists
    const caseItem = await CaseModel.findById(caseId);
    if (!caseItem) {
      const error = new Error(`Case with ID ${caseId} not found.`);
      error.statusCode = 404;
      throw error;
    }

    // 2. Verify document exists
    const document = await DocumentModel.findById(docId);
    if (!document) {
      const error = new Error(`Document with ID ${docId} not found.`);
      error.statusCode = 404;
      throw error;
    }

    // 3. Verify Case Ownership (prevent IDOR / cross-case deletion)
    if (String(document.case_id) !== String(caseId)) {
      const error = new Error(`Document with ID ${docId} does not belong to case ${caseId}.`);
      error.statusCode = 404;
      throw error;
    }

    // 4. Secure Filesystem Path Verification (Containment & Symlink Defense)
    const uploadDirConfig = process.env.UPLOAD_DIR || 'uploads';
    const uploadDirResolved = path.resolve(uploadDirConfig);
    const targetFileResolved = path.resolve(document.file_path);

    // Lexical containment check
    const lexicalRelative = path.relative(uploadDirResolved, targetFileResolved);
    if (lexicalRelative.startsWith('..') || path.isAbsolute(lexicalRelative)) {
      const error = new Error('Security Violation: File path is outside designated uploads directory.');
      error.statusCode = 400;
      throw error;
    }

    // Canonical containment check (resolves symlinks)
    let realUploadDir = uploadDirResolved;
    try {
      realUploadDir = await fs.promises.realpath(uploadDirResolved);
    } catch (e) {
      realUploadDir = uploadDirResolved;
    }

    let fileExistsOnDisk = true;
    try {
      const realTargetFile = await fs.promises.realpath(targetFileResolved);
      const canonicalRelative = path.relative(realUploadDir, realTargetFile);
      if (canonicalRelative.startsWith('..') || path.isAbsolute(canonicalRelative)) {
        const error = new Error('Security Violation: Canonical target path escapes uploads directory via symlink.');
        error.statusCode = 400;
        throw error;
      }

      const stat = await fs.promises.stat(realTargetFile);
      if (!stat.isFile()) {
        const error = new Error('Security Violation: Target path is not a regular file.');
        error.statusCode = 400;
        throw error;
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        fileExistsOnDisk = false;
      } else if (err.statusCode) {
        throw err;
      } else {
        console.warn(`[DocumentService] Path verification warning for ${targetFileResolved}:`, err.message);
      }
    }

    // 5. Delete Database Record First (Guarantees DB integrity over filesystem)
    await DocumentModel.deleteByIdAndCaseId(docId, caseId);

    // 6. Safely Unlink Physical File (with ENOENT handling)
    if (fileExistsOnDisk) {
      try {
        await fs.promises.unlink(targetFileResolved);
      } catch (unlinkErr) {
        if (unlinkErr.code !== 'ENOENT') {
          console.warn(`[DocumentService Warning] Failed to unlink ${targetFileResolved}:`, unlinkErr.message);
        }
      }
    }

    return {
      deleted: true,
      id: docId,
      case_id: caseId,
    };
  }
}

module.exports = DocumentService;
