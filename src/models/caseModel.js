const pool = require('../config/db');

/**
 * Data Access Model for Cases.
 * Uses parameterized queries to prevent SQL injection.
 * Supports optional transaction connections while preserving pool fallback.
 */
class CaseModel {
  /**
   * Create a new consumer case record.
   *
   * @param {object} caseData
   * @param {import('mysql2/promise').Connection|null} [connection=null]
   */
  static async createCase({
    title,
    issue_category,
    merchant_name,
    claimed_amount,
    user_narrative,
    status = 'PENDING',
  }, connection = null) {
    const client = connection || pool;
    const query = `
      INSERT INTO cases (
        title,
        issue_category,
        merchant_name,
        claimed_amount,
        user_narrative,
        status
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    const params = [
      title,
      issue_category,
      merchant_name,
      claimed_amount,
      user_narrative,
      status,
    ];

    const [result] = await client.query(query, params);
    const insertedId = result.insertId;

    return this.findById(insertedId, connection);
  }

  /**
   * Find a single case by its primary ID.
   *
   * @param {string|number} id
   * @param {import('mysql2/promise').Connection|null} [connection=null]
   */
  static async findById(id, connection = null) {
    const client = connection || pool;
    const query = `
      SELECT
        id,
        title,
        issue_category,
        merchant_name,
        claimed_amount,
        user_narrative,
        status,
        created_at,
        updated_at
      FROM cases
      WHERE id = ?
      LIMIT 1
    `;

    const [rows] = await client.query(query, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Find all cases matching optional filters with pagination.
   *
   * @param {object} options
   * @param {import('mysql2/promise').Connection|null} [connection=null]
   */
  static async findAll({ page = 1, limit = 10, status, issue_category } = {}, connection = null) {
    const client = connection || pool;
    const whereClauses = [];
    const queryParams = [];

    if (status) {
      whereClauses.push('status = ?');
      queryParams.push(status);
    }

    if (issue_category) {
      whereClauses.push('issue_category = ?');
      queryParams.push(issue_category);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // 1. Get total matching count
    const countQuery = `SELECT COUNT(*) AS total FROM cases ${whereSql}`;
    const [countResult] = await client.query(countQuery, queryParams);
    const total = countResult[0].total;

    // 2. Fetch paginated slice
    const offset = (page - 1) * limit;
    const dataQuery = `
      SELECT
        id,
        title,
        issue_category,
        merchant_name,
        claimed_amount,
        user_narrative,
        status,
        created_at,
        updated_at
      FROM cases
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [cases] = await client.query(dataQuery, [...queryParams, Number(limit), Number(offset)]);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      cases,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Update permitted fields of an existing case by its ID.
   *
   * @param {string|number} id
   * @param {object} fields
   * @param {import('mysql2/promise').Connection|null} [connection=null]
   */
  static async updateById(id, fields, connection = null) {
    const client = connection || pool;
    const fieldEntries = Object.entries(fields);
    if (fieldEntries.length === 0) {
      return this.findById(id, connection);
    }

    const setClauses = [];
    const params = [];

    for (const [key, value] of fieldEntries) {
      setClauses.push(`\`${key}\` = ?`);
      params.push(value);
    }

    params.push(id);
    const query = `UPDATE cases SET ${setClauses.join(', ')} WHERE id = ?`;

    await client.query(query, params);
    return this.findById(id, connection);
  }

  /**
   * Delete a case by ID (helper primarily for test cleanup).
   *
   * @param {string|number} id
   * @param {import('mysql2/promise').Connection|null} [connection=null]
   */
  static async deleteById(id, connection = null) {
    const client = connection || pool;
    const [result] = await client.query('DELETE FROM cases WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = CaseModel;
