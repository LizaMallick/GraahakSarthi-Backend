const pool = require('../config/db');

/**
 * Data Access Model for Consumer Loss Calculations.
 * Persists and retrieves itemized financial loss snapshots.
 * Supports optional transaction connections while preserving pool fallback.
 */
class LossCalculationModel {
  /**
   * Insert a new loss calculation snapshot into case_loss_calculations.
   */
  static async createCalculation({
    case_id,
    purchase_amount,
    delivery_installation_charges,
    repair_replacement_expenses,
    travel_communication_expenses,
    other_documented_expenses,
    refunds_received,
    gross_loss,
    net_loss,
    annual_interest_rate = null,
    interest_start_date = null,
    interest_end_date = null,
    interest_days = 0,
    estimated_interest = 0,
    total_estimated_claim = 0,
    expense_breakdown = null,
    calculation_notes = null,
  }, connection = null) {
    const client = connection || pool;

    const breakdownJson =
      typeof expense_breakdown === 'string'
        ? expense_breakdown
        : JSON.stringify(expense_breakdown || {});

    const query = `
      INSERT INTO case_loss_calculations (
        case_id,
        purchase_amount,
        delivery_installation_charges,
        repair_replacement_expenses,
        travel_communication_expenses,
        other_documented_expenses,
        refunds_received,
        gross_loss,
        net_loss,
        annual_interest_rate,
        interest_start_date,
        interest_end_date,
        interest_days,
        estimated_interest,
        total_estimated_claim,
        expense_breakdown,
        calculation_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      case_id,
      purchase_amount,
      delivery_installation_charges,
      repair_replacement_expenses,
      travel_communication_expenses,
      other_documented_expenses,
      refunds_received,
      gross_loss,
      net_loss,
      annual_interest_rate,
      interest_start_date,
      interest_end_date,
      interest_days,
      estimated_interest,
      total_estimated_claim,
      breakdownJson,
      calculation_notes,
    ];

    const [result] = await client.query(query, params);
    return this.findById(result.insertId, connection);
  }

  /**
   * Find an evaluation record by primary ID.
   */
  static async findById(id, connection = null) {
    const client = connection || pool;
    const query = `
      SELECT *
      FROM case_loss_calculations
      WHERE id = ?
      LIMIT 1
    `;
    const [rows] = await client.query(query, [id]);
    if (!rows || rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  /**
   * Retrieve the most recent calculation snapshot for a case.
   */
  static async findLatestByCaseId(caseId, connection = null) {
    const client = connection || pool;
    const query = `
      SELECT *
      FROM case_loss_calculations
      WHERE case_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `;
    const [rows] = await client.query(query, [caseId]);
    if (!rows || rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  /**
   * Retrieve all historical calculation snapshots for a case in reverse chronological order.
   */
  static async findHistoryByCaseId(caseId, connection = null) {
    const client = connection || pool;
    const query = `
      SELECT *
      FROM case_loss_calculations
      WHERE case_id = ?
      ORDER BY created_at DESC, id DESC
    `;
    const [rows] = await client.query(query, [caseId]);
    return (rows || []).map((row) => this.mapRow(row));
  }

  /**
   * Format raw database row into sanitized API presentation object.
   */
  static mapRow(row) {
    if (!row) return null;

    let breakdown = row.expense_breakdown;
    if (typeof breakdown === 'string') {
      try {
        breakdown = JSON.parse(breakdown);
      } catch (e) {
        breakdown = {};
      }
    }

    const interestApplied = Boolean(row.annual_interest_rate && Number(row.annual_interest_rate) > 0);

    return {
      id: String(row.id),
      case_id: String(row.case_id),
      itemized_breakdown: breakdown || {
        purchase_amount: parseFloat(row.purchase_amount) || 0,
        delivery_installation_charges: parseFloat(row.delivery_installation_charges) || 0,
        repair_replacement_expenses: parseFloat(row.repair_replacement_expenses) || 0,
        travel_communication_expenses: parseFloat(row.travel_communication_expenses) || 0,
        other_documented_expenses: parseFloat(row.other_documented_expenses) || 0,
      },
      gross_loss: parseFloat(row.gross_loss) || 0,
      refunds_received: parseFloat(row.refunds_received) || 0,
      net_loss: parseFloat(row.net_loss) || 0,
      interest_estimate: {
        applied: interestApplied,
        annual_rate: row.annual_interest_rate !== null ? parseFloat(row.annual_interest_rate) : null,
        start_date: row.interest_start_date ? new Date(row.interest_start_date).toISOString().split('T')[0] : null,
        end_date: row.interest_end_date ? new Date(row.interest_end_date).toISOString().split('T')[0] : null,
        days: Number(row.interest_days) || 0,
        estimated_interest: parseFloat(row.estimated_interest) || 0,
      },
      total_estimated_claim: parseFloat(row.total_estimated_claim) || 0,
      calculation_explanation: row.calculation_notes,
      created_at: row.created_at,
    };
  }
}

module.exports = LossCalculationModel;
