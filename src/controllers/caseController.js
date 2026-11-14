const CaseService = require('../services/caseService');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * Controller for Case Management endpoints.
 */
class CaseController {
  /**
   * POST /api/cases
   * Create a new consumer case.
   */
  static async createCase(req, res) {
    try {
      const newCase = await CaseService.createCase(req.body);
      return successResponse(res, {
        statusCode: 201,
        message: 'Case created successfully.',
        data: newCase,
      });
    } catch (error) {
      console.error('[CaseController.createCase Error]:', error);
      return errorResponse(res, {
        statusCode: 500,
        message: 'Failed to create case.',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/cases
   * Retrieve cases with pagination and optional filters.
   */
  static async getCases(req, res) {
    try {
      const { page, limit, status, issue_category } = req.validatedQuery || req.query;
      const result = await CaseService.getCases({ page, limit, status, issue_category });

      return successResponse(res, {
        statusCode: 200,
        message: 'Cases retrieved successfully.',
        data: result.cases,
        meta: result.pagination,
      });
    } catch (error) {
      console.error('[CaseController.getCases Error]:', error);
      return errorResponse(res, {
        statusCode: 500,
        message: 'Failed to retrieve cases.',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/cases/:id
   * Retrieve a single case by ID.
   */
  static async getCaseById(req, res) {
    try {
      const { id } = req.params;
      const caseItem = await CaseService.getCaseById(id);

      if (!caseItem) {
        return errorResponse(res, {
          statusCode: 404,
          message: `Case with ID ${id} not found.`,
        });
      }

      return successResponse(res, {
        statusCode: 200,
        message: 'Case retrieved successfully.',
        data: caseItem,
      });
    } catch (error) {
      console.error('[CaseController.getCaseById Error]:', error);
      return errorResponse(res, {
        statusCode: 500,
        message: 'Failed to retrieve case.',
        error: error.message,
      });
    }
  }

  /**
   * PATCH /api/cases/:id
   * Update permitted fields of an existing case.
   */
  static async updateCase(req, res) {
    try {
      const { id } = req.params;
      const updatedCase = await CaseService.updateCase(id, req.body);

      if (!updatedCase) {
        return errorResponse(res, {
          statusCode: 404,
          message: `Case with ID ${id} not found.`,
        });
      }

      return successResponse(res, {
        statusCode: 200,
        message: 'Case updated successfully.',
        data: updatedCase,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[CaseController.updateCase Error]:', error);
      } else {
        console.warn(`[CaseController.updateCase Warning] ${status}:`, error.message);
      }
      return errorResponse(res, {
        statusCode: status,
        message: error.message || 'Failed to update case.',
        error: error.message,
      });
    }
  }

  /**
   * DELETE /api/cases/:id
   * Delete a case, cascade-clean all child records, and unlink physical files.
   */
  static async deleteCase(req, res) {
    try {
      const { id } = req.params;
      const result = await CaseService.deleteCase(id);

      return successResponse(res, {
        statusCode: 200,
        message: 'Case and all associated documents deleted successfully.',
        data: result,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[CaseController.deleteCase Error]:', error);
      } else {
        console.warn(`[CaseController.deleteCase Warning] ${status}:`, error.message);
      }
      return errorResponse(res, {
        statusCode: status,
        message: error.message || 'Failed to delete case.',
        error: error.message,
      });
    }
  }
}

module.exports = CaseController;
