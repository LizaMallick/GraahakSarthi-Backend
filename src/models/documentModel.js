const pool = require('../config/db');

/**
 * Data Access Model for Case Documents.
 * Uses parameterized queries to prevent SQL injection.
 * Supports optional transaction connections while preserving pool fallback.
 */
class DocumentModel {
  /**
   * Insert a new case document record.
   *
   * @param {object} docData
   * @param {import('mysql2/promise').Connection|null} [connection=null]
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
  }, connection = null) {
    const client = connection || pool;
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

    const [result] = await client.query(query, params);
    const insertedId = result.insertId;

    return this.findById(insertedId, connection);
  }

  /**
   * Find all documents belonging to a case.
   * Explicitly omits internal absolute filesystem file_path for security.
   *
   * @param {string|number} case_id
   * @param {import('mysql2/promise').Connection|null} [connection=null]
   */
  static async findByCaseId(case_id, connection = null) {
    const client = connection || pool;
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

    const [rows] = await client.query(query, [case_id]);
    return rows;
  }

  /**
   * Find a single document by its primary ID.
   * Includes internal file_path for service-level operations (e.g. deletion).
   *
   * @param {string|number} id
   * @param {import('mysql2/promise').Connection|null} [connection=null]
   */
  static async findById(id, connection = null) {
    const client = connection || pool;
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

    const [rows] = await client.query(query, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Update document metadata (document_type and/or description) scoped to case.
   *
   * @param {string|number} id
   * @param {string|number} case_id
   * @param {object} fields
   * @param {import('mysql2/promise').Connection|null} [connection=null]
   */
  static async updateMetadataByIdAndCaseId(id, case_id, fields = {}, connection = null) {
    const client = connection || pool;
    const setClauses = [];
    const params = [];

    if (fields.document_type !== undefined) {
      setClauses.push('`document_type` = ?');
      params.push(fields.document_type);
    }

    if (fields.description !== undefined) {
      setClauses.push('`description` = ?');
      params.push(fields.description === null ? null : fields.description);
    }

    if (setClauses.length === 0) {
      return this.findById(id, connection);
    }

    const query = `
      UPDATE case_documents
      SET ${setClauses.join(', ')}
      WHERE id = ? AND case_id = ?
    `;
    params.push(id, case_id);

    await client.query(query, params);
    return this.findById(id, connection);
  }

  /**
   * Delete a document matching both document ID and case ID.
   * Guarantees deletion is scoped to the owning case.
   *
   * @param {string|number} id
   * @param {string|number} case_id
   * @param {import('mysql2/promise').Connection|null} [connection=null]
   */
  static async deleteByIdAndCaseId(id, case_id, connection = null) {
    const client = connection || pool;
    const query = `
      DELETE FROM case_documents
      WHERE id = ? AND case_id = ?
    `;

    const [result] = await client.query(query, [id, case_id]);
    return result.affectedRows > 0;
  }
}

module.exports = DocumentModel;
