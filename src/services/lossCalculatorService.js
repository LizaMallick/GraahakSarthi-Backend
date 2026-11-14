const CaseModel = require('../models/caseModel');
const LossCalculationModel = require('../models/lossCalculationModel');
const { calculateConsumerLoss, DISCLAIMER } = require('./lossCalculatorEngine');

/**
 * Service Layer for Consumer Financial Loss Calculations.
 */
class LossCalculatorService {
  /**
   * Run loss calculation and persist snapshot for a specific case.
   */
  static async calculateAndSaveLoss(caseId, inputData, connection = null) {
    // 1. Verify case exists
    const caseItem = await CaseModel.findById(caseId, connection);
    if (!caseItem) {
      const error = new Error(`Case with ID ${caseId} not found.`);
      error.statusCode = 404;
      throw error;
    }

    // 2. Resolve purchase amount:
    // If purchase_amount is omitted/undefined, use caseItem.claimed_amount as fallback.
    // Never add claimed_amount on top of an explicitly supplied purchase_amount.
    let isFallbackUsed = false;
    let effectivePurchase = inputData.purchase_amount;

    if (effectivePurchase === undefined || effectivePurchase === null) {
      effectivePurchase = caseItem.claimed_amount || 0;
      isFallbackUsed = true;
    }

    // 3. Perform deterministic loss calculation
    const calculation = calculateConsumerLoss({
      purchaseAmount: effectivePurchase,
      deliveryInstallationCharges: inputData.delivery_installation_charges || 0,
      repairReplacementExpenses: inputData.repair_replacement_expenses || 0,
      travelCommunicationExpenses: inputData.travel_communication_expenses || 0,
      otherDocumentedExpenses: inputData.other_documented_expenses || 0,
      refundsReceived: inputData.refunds_received || 0,
      interest: inputData.interest || null,
      isFallbackUsed,
    });

    // 4. Persist calculation snapshot
    const savedRecord = await LossCalculationModel.createCalculation({
      case_id: caseId,
      purchase_amount: calculation.itemized_breakdown.purchase_amount,
      delivery_installation_charges: calculation.itemized_breakdown.delivery_installation_charges,
      repair_replacement_expenses: calculation.itemized_breakdown.repair_replacement_expenses,
      travel_communication_expenses: calculation.itemized_breakdown.travel_communication_expenses,
      other_documented_expenses: calculation.itemized_breakdown.other_documented_expenses,
      refunds_received: calculation.refunds_received,
      gross_loss: calculation.gross_loss,
      net_loss: calculation.net_loss,
      annual_interest_rate: calculation.interest_estimate.annual_rate,
      interest_start_date: calculation.interest_estimate.start_date,
      interest_end_date: calculation.interest_estimate.end_date,
      interest_days: calculation.interest_estimate.days,
      estimated_interest: calculation.interest_estimate.estimated_interest,
      total_estimated_claim: calculation.total_estimated_claim,
      expense_breakdown: calculation.itemized_breakdown,
      calculation_notes: calculation.calculation_explanation,
    }, connection);

    return {
      ...savedRecord,
      disclaimer: DISCLAIMER,
    };
  }

  /**
   * Retrieve the latest loss calculation snapshot.
   * If none exists yet, returns a baseline calculation derived from claimed_amount with id: null.
   * Does NOT silently persist the baseline to the database.
   */
  static async getLatestLoss(caseId, connection = null) {
    const caseItem = await CaseModel.findById(caseId, connection);
    if (!caseItem) {
      const error = new Error(`Case with ID ${caseId} not found.`);
      error.statusCode = 404;
      throw error;
    }

    const latest = await LossCalculationModel.findLatestByCaseId(caseId, connection);
    if (latest) {
      return {
        ...latest,
        is_baseline: false,
        disclaimer: DISCLAIMER,
      };
    }

    // Baseline calculation on the fly without persistence
    const baseline = calculateConsumerLoss({
      purchaseAmount: caseItem.claimed_amount || 0,
      deliveryInstallationCharges: 0,
      repairReplacementExpenses: 0,
      travelCommunicationExpenses: 0,
      otherDocumentedExpenses: 0,
      refundsReceived: 0,
      interest: null,
      isFallbackUsed: true,
    });

    return {
      id: null,
      case_id: String(caseId),
      is_baseline: true,
      itemized_breakdown: baseline.itemized_breakdown,
      gross_loss: baseline.gross_loss,
      refunds_received: baseline.refunds_received,
      net_loss: baseline.net_loss,
      interest_estimate: baseline.interest_estimate,
      total_estimated_claim: baseline.total_estimated_claim,
      calculation_explanation: baseline.calculation_explanation,
      created_at: null,
      disclaimer: DISCLAIMER,
    };
  }

  /**
   * Retrieve calculation history for a case.
   */
  static async getLossHistory(caseId, connection = null) {
    const caseItem = await CaseModel.findById(caseId, connection);
    if (!caseItem) {
      const error = new Error(`Case with ID ${caseId} not found.`);
      error.statusCode = 404;
      throw error;
    }

    const history = await LossCalculationModel.findHistoryByCaseId(caseId, connection);
    return history.map((record) => ({
      ...record,
      disclaimer: DISCLAIMER,
    }));
  }
}

module.exports = LossCalculatorService;
