const EvidenceService = require('../services/evidenceService');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * Controller for Evidence Strength & Missing-Proof Evaluation endpoints.
 */
class EvidenceController {
  /**
   * POST /api/cases/:id/evidence/evaluate
   * Trigger rule-based evidence evaluation and persist snapshot.
   */
  static async evaluateEvidence(req, res) {
    try {
      const { id: caseId } = req.params;
      const evaluation = await EvidenceService.evaluateCaseEvidence(caseId);

      return successResponse(res, {
        statusCode: 200,
        message: 'Evidence evaluated successfully.',
        data: evaluation,
      });
    } catch (error) {
      console.error('[EvidenceController.evaluateEvidence Error]:', error);
      return errorResponse(res, {
        statusCode: error.statusCode || 500,
        message: error.message || 'Failed to evaluate case evidence.',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/cases/:id/evidence
   * Retrieve latest evidence evaluation for a case.
   */
  static async getEvidence(req, res) {
    try {
      const { id: caseId } = req.params;
      const evaluation = await EvidenceService.getCaseEvidence(caseId);

      return successResponse(res, {
        statusCode: 200,
        message: 'Evidence evaluation retrieved successfully.',
        data: evaluation,
      });
    } catch (error) {
      console.error('[EvidenceController.getEvidence Error]:', error);
      return errorResponse(res, {
        statusCode: error.statusCode || 500,
        message: error.message || 'Failed to retrieve case evidence.',
        error: error.message,
      });
    }
  }
}

module.exports = EvidenceController;
