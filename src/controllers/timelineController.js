const TimelineService = require('../services/timelineService');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * Controller for Case Timeline endpoints.
 */
class TimelineController {
  /**
   * GET /api/cases/:id/timeline
   * Retrieve chronologically ordered timeline events for a case.
   */
  static async getTimeline(req, res) {
    try {
      const caseId = req.params.id;
      const { source_type, sort } = req.query;

      const events = await TimelineService.getTimeline(caseId, { source_type, sort });

      return successResponse(res, {
        statusCode: 200,
        message: 'Timeline events retrieved successfully.',
        data: events,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[TimelineController.getTimeline Error]:', error);
      } else {
        console.warn(`[TimelineController.getTimeline Warning] ${status}:`, error.message);
      }
      return errorResponse(res, {
        statusCode: status,
        message: error.message || 'Failed to retrieve timeline events.',
        error: error.message,
      });
    }
  }

  /**
   * POST /api/cases/:id/timeline
   * Create a manual timeline event.
   */
  static async createEvent(req, res) {
    try {
      const caseId = req.params.id;
      const createdEvent = await TimelineService.createEvent(caseId, req.body);

      return successResponse(res, {
        statusCode: 201,
        message: 'Timeline event created successfully.',
        data: createdEvent,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[TimelineController.createEvent Error]:', error);
      } else {
        console.warn(`[TimelineController.createEvent Warning] ${status}:`, error.message);
      }
      return errorResponse(res, {
        statusCode: status,
        message: error.message || 'Failed to create timeline event.',
        error: error.message,
      });
    }
  }

  /**
   * PATCH /api/cases/:id/timeline/:eventId
   * Update a manual timeline event.
   */
  static async updateEvent(req, res) {
    try {
      const { id: caseId, eventId } = req.params;
      const updatedEvent = await TimelineService.updateEvent(caseId, eventId, req.body);

      return successResponse(res, {
        statusCode: 200,
        message: 'Timeline event updated successfully.',
        data: updatedEvent,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[TimelineController.updateEvent Error]:', error);
      } else {
        console.warn(`[TimelineController.updateEvent Warning] ${status}:`, error.message);
      }
      return errorResponse(res, {
        statusCode: status,
        message: error.message || 'Failed to update timeline event.',
        error: error.message,
      });
    }
  }

  /**
   * DELETE /api/cases/:id/timeline/:eventId
   * Delete a manual timeline event.
   */
  static async deleteEvent(req, res) {
    try {
      const { id: caseId, eventId } = req.params;
      const result = await TimelineService.deleteEvent(caseId, eventId);

      return successResponse(res, {
        statusCode: 200,
        message: 'Timeline event deleted successfully.',
        data: result,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[TimelineController.deleteEvent Error]:', error);
      } else {
        console.warn(`[TimelineController.deleteEvent Warning] ${status}:`, error.message);
      }
      return errorResponse(res, {
        statusCode: status,
        message: error.message || 'Failed to delete timeline event.',
        error: error.message,
      });
    }
  }
}

module.exports = TimelineController;
