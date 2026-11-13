const CaseModel = require('../models/caseModel');

/**
 * Service Layer for Case Management.
 * Handles business logic independent of HTTP transport.
 */
class CaseService {
  /**
   * Create a new consumer case.
   */
  static async createCase(caseData) {
    return CaseModel.createCase(caseData);
  }

  /**
   * Retrieve paginated cases with optional filters.
   */
  static async getCases({ page = 1, limit = 10, status, issue_category } = {}) {
    return CaseModel.findAll({ page, limit, status, issue_category });
  }

  /**
   * Retrieve a single case by its primary ID.
   */
  static async getCaseById(id) {
    return CaseModel.findById(id);
  }

  /**
   * Update fields of an existing case.
   * Returns null if case does not exist.
   */
  static async updateCase(id, updateData) {
    const existingCase = await CaseModel.findById(id);
    if (!existingCase) {
      return null;
    }

    return CaseModel.updateById(id, updateData);
  }

  /**
   * Delete a case by ID (for automated test cleanup).
   */
  static async deleteCase(id) {
    return CaseModel.deleteById(id);
  }
}

module.exports = CaseService;
