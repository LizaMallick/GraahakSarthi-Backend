const LossCalculatorService = require('../services/lossCalculatorService');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * Controller for Consumer Loss Calculator endpoints.
 */
class LossCalculatorController {
  /**
   * POST /api/cases/:id/loss/calculate
   */
  static async calculateLoss(req, res) {
    try {
      const caseId = req.params.id;
      const result = await LossCalculatorService.calculateAndSaveLoss(caseId, req.body);

      return successResponse(res, {
        statusCode: 201,
        message: 'Consumer loss calculation completed and recorded successfully.',
        data: result,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[LossCalculatorController.calculateLoss Error]:', error);
      } else {
        console.warn(`[LossCalculatorController.calculateLoss Warning] ${status}:`, error.message);
      }
      return errorResponse(res, {
        statusCode: status,
        message: error.message || 'Failed to calculate consumer loss.',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/cases/:id/loss
   */
  static async getLoss(req, res) {
    try {
      const caseId = req.params.id;
      const result = await LossCalculatorService.getLatestLoss(caseId);

      return successResponse(res, {
        statusCode: 200,
        message: 'Consumer loss calculation retrieved successfully.',
        data: result,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[LossCalculatorController.getLoss Error]:', error);
      } else {
        console.warn(`[LossCalculatorController.getLoss Warning] ${status}:`, error.message);
      }
      return errorResponse(res, {
        statusCode: status,
        message: error.message || 'Failed to retrieve consumer loss.',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/cases/:id/loss/history
   */
  static async getLossHistory(req, res) {
    try {
      const caseId = req.params.id;
      const history = await LossCalculatorService.getLossHistory(caseId);

      return successResponse(res, {
        statusCode: 200,
        message: 'Consumer loss calculation history retrieved successfully.',
        data: history,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[LossCalculatorController.getLossHistory Error]:', error);
      } else {
        console.warn(`[LossCalculatorController.getLossHistory Warning] ${status}:`, error.message);
      }
      return errorResponse(res, {
        statusCode: status,
        message: error.message || 'Failed to retrieve calculation history.',
        error: error.message,
      });
    }
  }
}

module.exports = LossCalculatorController;
