const pool = require('../config/db');

/**
 * Data Access Model for Evidence Evaluations.
 * Persists and retrieves rule-based evidence strength snapshots.
 * Supports optional transaction connections while preserving pool fallback.
 */
class EvidenceModel {
  /**
   * Insert a new evidence evaluation snapshot into evidence_evaluations.
   *
   * @param {object} evalData
   * @param {import('mysql2/promise').Connection|null} [connection=null]
   */
  static async createEvaluation({
    case_id,
    strength_score,
    strength_level,
    verified_proofs,
    missing_proofs,
    recommendations,
  }, connection = null) {
    const client = connection || pool;
    const query = `
      INSERT INTO evidence_evaluations (
        case_id,
        strength_score,
        strength_level,
        verified_proofs,
        missing_proofs,
        recommendations
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    // Ensure objects are converted to valid JSON strings if needed
    const proofsJson = typeof verified_proofs === 'string' ? verified_proofs : JSON.stringify(verified_proofs || []);
    const missingJson = typeof missing_proofs === 'string' ? missing_proofs : JSON.stringify(missing_proofs || []);
    const recsJson = typeof recommendations === 'string' ? recommendations : JSON.stringify(recommendations || []);

    const params = [case_id, strength_score, strength_level, proofsJson, missingJson, recsJson];

    const [result] = await client.query(query, params);
    const insertedId = result.insertId;

    return this.findById(insertedId, connection);
  }

  /**
   * Find an evaluation record by its primary ID.
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
        strength_score,
        strength_level,
        verified_proofs,
        missing_proofs,
        recommendations,
        created_at
      FROM evidence_evaluations
      WHERE id = ?
      LIMIT 1
    `;

    const [rows] = await client.query(query, [id]);
    if (rows.length === 0) return null;

    return this._formatRow(rows[0]);
  }

  /**
   * Retrieve the most recent evaluation snapshot for a case.
   *
   * @param {string|number} case_id
   * @param {import('mysql2/promise').Connection|null} [connection=null]
   */
  static async findLatestByCaseId(case_id, connection = null) {
    const client = connection || pool;
    const query = `
      SELECT
        id,
        case_id,
        strength_score,
        strength_level,
        verified_proofs,
        missing_proofs,
        recommendations,
        created_at
      FROM evidence_evaluations
      WHERE case_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `;

    const [rows] = await client.query(query, [case_id]);
    if (rows.length === 0) return null;

    return this._formatRow(rows[0]);
  }

  /**
   * Retrieve all evaluation snapshots for a case.
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
        strength_score,
        strength_level,
        verified_proofs,
        missing_proofs,
        recommendations,
        created_at
      FROM evidence_evaluations
      WHERE case_id = ?
      ORDER BY created_at DESC, id DESC
    `;

    const [rows] = await client.query(query, [case_id]);
    return rows.map((r) => this._formatRow(r));
  }

  /**
   * Helper to normalize JSON columns safely across MySQL versions.
   */
  static _formatRow(row) {
    if (!row) return null;

    let providedProofs = row.verified_proofs;
    if (typeof providedProofs === 'string') {
      try {
        providedProofs = JSON.parse(providedProofs);
      } catch (e) {
        providedProofs = [];
      }
    }

    let missingProofs = row.missing_proofs;
    if (typeof missingProofs === 'string') {
      try {
        missingProofs = JSON.parse(missingProofs);
      } catch (e) {
        missingProofs = [];
      }
    }

    let recommendations = row.recommendations;
    if (typeof recommendations === 'string') {
      try {
        recommendations = JSON.parse(recommendations);
      } catch (e) {
        recommendations = [];
      }
    }

    return {
      id: row.id,
      case_id: row.case_id,
      strength_score: row.strength_score,
      strength_level: row.strength_level,
      provided_proofs: providedProofs || [],
      missing_proofs: missingProofs || [],
      recommendations: recommendations || [],
      created_at: row.created_at,
    };
  }
}

module.exports = EvidenceModel;
