const pool = require('../config/db');

/**
 * Data Access Model for Case Documents.
 * Uses parameterized queries to prevent SQL injection.
 */
class DocumentModel {
  /**
   * Insert a new case document record.
   */
  static async createDocument({
    case_id,
    original_filename,
    stored_filename,
    file_path,
    mime_type,
    file_size,
    document_type = 'OTHER',
    description = null,
  }) {
    const query = `
      INSERT INTO case_documents (
        case_id,
        original_filename,
        stored_filename,
        file_path,
        mime_type,
        document_type,
        description,
        file_size
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      case_id,
      original_filename,
      stored_filename,
      file_path,
      mime_type,
      document_type,
      description,
      file_size,
    ];

    const [result] = await pool.query(query, params);
    const insertedId = result.insertId;

    return this.findById(insertedId);
  }

  /**
   * Find all documents belonging to a case.
   * Explicitly omits internal absolute filesystem file_path for security.
   */
  static async findByCaseId(case_id) {
    const query = `
      SELECT
        id,
        case_id,
        original_filename,
        stored_filename,
        mime_type,
        document_type,
        description,
        file_size,
        created_at
      FROM case_documents
      WHERE case_id = ?
      ORDER BY created_at ASC
    `;

    const [rows] = await pool.query(query, [case_id]);
    return rows;
  }

  /**
   * Find a single document by its primary ID.
   * Includes internal file_path for service-level operations (e.g. deletion).
   */
  static async findById(id) {
    const query = `
      SELECT
        id,
        case_id,
        original_filename,
        stored_filename,
        file_path,
        mime_type,
        document_type,
        description,
        file_size,
        created_at
      FROM case_documents
      WHERE id = ?
      LIMIT 1
    `;

    const [rows] = await pool.query(query, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Delete a document matching both document ID and case ID.
   * Guarantees deletion is scoped to the owning case.
   */
  static async deleteByIdAndCaseId(id, case_id) {
    const query = `
      DELETE FROM case_documents
      WHERE id = ? AND case_id = ?
    `;

    const [result] = await pool.query(query, [id, case_id]);
    return result.affectedRows > 0;
  }
}

module.exports = DocumentModel;
