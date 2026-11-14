const pool = require('../config/db');

/**
 * Data Access Model for Case Timeline Events.
 * Uses parameterized queries to prevent SQL injection and preserves referential integrity.
 * Supports optional transaction connections while preserving pool fallback.
 */
class TimelineModel {
  /**
   * Helper to format a JS Date or date string to MySQL DATETIME format (YYYY-MM-DD HH:MM:SS)
   */
  static formatDateTime(val) {
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) {
      throw new Error(`Invalid date provided for timeline event: ${val}`);
    }
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }

  /**
   * Insert a new timeline event.
   */
  static async createEvent({
    case_id,
    event_date,
    title,
    description = null,
    source_type = 'USER_INPUT',
    document_id = null,
    order_index = 0,
  }, connection = null) {
    const client = connection || pool;
    const formattedDate = this.formatDateTime(event_date);

    const query = `
      INSERT INTO case_timeline_events (
        case_id,
        event_date,
        title,
        description,
        source_type,
        document_id,
        order_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      case_id,
      formattedDate,
      title,
      description,
      source_type,
      document_id || null,
      order_index || 0,
    ];

    const [result] = await client.query(query, params);
    return this.findById(result.insertId, connection);
  }

  /**
   * Find a single timeline event by its primary ID, with joined document metadata.
   * Internal file_path and stored_filename are strictly excluded.
   */
  static async findById(id, connection = null) {
    const client = connection || pool;
    const query = `
      SELECT 
        cte.id,
        cte.case_id,
        cte.event_date,
        cte.title,
        cte.description,
        cte.source_type,
        cte.document_id,
        cte.order_index,
        cte.created_at,
        cte.updated_at,
        cd.document_type AS linked_document_type,
        cd.original_filename AS linked_original_filename,
        cd.file_size AS linked_file_size,
        cd.mime_type AS linked_mime_type
      FROM case_timeline_events cte
      LEFT JOIN case_documents cd ON cte.document_id = cd.id
      WHERE cte.id = ?
    `;

    const [rows] = await client.query(query, [id]);
    if (!rows || rows.length === 0) {
      return null;
    }

    return this.mapRow(rows[0]);
  }

  /**
   * Find all timeline events for a case, sorted chronologically with optional filtering.
   */
  static async findByCaseId(caseId, { source_type, sort = 'ASC' } = {}, connection = null) {
    const client = connection || pool;
    const direction = String(sort).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const params = [caseId];
    let whereClause = 'WHERE cte.case_id = ?';

    if (source_type) {
      whereClause += ' AND cte.source_type = ?';
      params.push(source_type);
    }

    const query = `
      SELECT 
        cte.id,
        cte.case_id,
        cte.event_date,
        cte.title,
        cte.description,
        cte.source_type,
        cte.document_id,
        cte.order_index,
        cte.created_at,
        cte.updated_at,
        cd.document_type AS linked_document_type,
        cd.original_filename AS linked_original_filename,
        cd.file_size AS linked_file_size,
        cd.mime_type AS linked_mime_type
      FROM case_timeline_events cte
      LEFT JOIN case_documents cd ON cte.document_id = cd.id
      ${whereClause}
      ORDER BY cte.event_date ${direction}, cte.order_index ${direction}, cte.id ${direction}
    `;

    const [rows] = await client.query(query, params);
    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Find the most recent event of a given source_type for a case.
   */
  static async findLatestBySourceType(caseId, sourceType, connection = null) {
    const client = connection || pool;
    const query = `
      SELECT 
        cte.id,
        cte.case_id,
        cte.event_date,
        cte.title,
        cte.description,
        cte.source_type,
        cte.document_id,
        cte.order_index,
        cte.created_at,
        cte.updated_at
      FROM case_timeline_events cte
      WHERE cte.case_id = ? AND cte.source_type = ?
      ORDER BY cte.id DESC
      LIMIT 1
    `;

    const [rows] = await client.query(query, [caseId, sourceType]);
    if (!rows || rows.length === 0) {
      return null;
    }

    return this.mapRow(rows[0]);
  }

  /**
   * Check if a duplicate case creation event already exists.
   */
  static async findDuplicateCaseCreated(caseId, connection = null) {
    const client = connection || pool;
    const query = `
      SELECT id 
      FROM case_timeline_events 
      WHERE case_id = ? AND source_type = 'SYSTEM_MILESTONE' AND title LIKE 'Case Registered%'
      LIMIT 1
    `;
    const [rows] = await client.query(query, [caseId]);
    return rows.length > 0;
  }

  /**
   * Check if an event already exists for a specific uploaded document.
   */
  static async findByDocumentId(documentId, connection = null) {
    const client = connection || pool;
    const query = `
      SELECT id 
      FROM case_timeline_events 
      WHERE document_id = ? AND source_type = 'DOCUMENT_UPLOAD'
      LIMIT 1
    `;
    const [rows] = await client.query(query, [documentId]);
    return rows.length > 0;
  }

  /**
   * Update an existing timeline event by ID.
   */
  static async updateById(id, fields = {}, connection = null) {
    const client = connection || pool;
    const setClauses = [];
    const params = [];

    if (fields.event_date !== undefined) {
      setClauses.push('`event_date` = ?');
      params.push(this.formatDateTime(fields.event_date));
    }

    if (fields.title !== undefined) {
      setClauses.push('`title` = ?');
      params.push(fields.title.trim());
    }

    if (fields.description !== undefined) {
      setClauses.push('`description` = ?');
      params.push(fields.description === null ? null : fields.description.trim());
    }

    if (fields.document_id !== undefined) {
      setClauses.push('`document_id` = ?');
      params.push(fields.document_id || null);
    }

    if (fields.order_index !== undefined) {
      setClauses.push('`order_index` = ?');
      params.push(Number(fields.order_index) || 0);
    }

    if (setClauses.length === 0) {
      return this.findById(id, connection);
    }

    const query = `
      UPDATE case_timeline_events
      SET ${setClauses.join(', ')}
      WHERE id = ?
    `;
    params.push(id);

    await client.query(query, params);
    return this.findById(id, connection);
  }

  /**
   * Delete a timeline event by its primary ID.
   */
  static async deleteById(id, connection = null) {
    const client = connection || pool;
    const query = 'DELETE FROM case_timeline_events WHERE id = ?';
    const [result] = await client.query(query, [id]);
    return result.affectedRows > 0;
  }

  /**
   * Transform raw database row into sanitized API presentation object.
   */
  static mapRow(row) {
    const event = {
      id: String(row.id),
      case_id: String(row.case_id),
      event_date: row.event_date instanceof Date ? row.event_date.toISOString() : String(row.event_date),
      title: row.title,
      description: row.description,
      source_type: row.source_type,
      document_id: row.document_id ? String(row.document_id) : null,
      order_index: Number(row.order_index) || 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
      linked_document: null,
    };

    if (row.document_id && row.linked_document_type) {
      event.linked_document = {
        id: String(row.document_id),
        document_type: row.linked_document_type,
        original_filename: row.linked_original_filename,
        file_size: Number(row.linked_file_size) || 0,
        mime_type: row.linked_mime_type || null,
      };
    }

    return event;
  }
}

module.exports = TimelineModel;
