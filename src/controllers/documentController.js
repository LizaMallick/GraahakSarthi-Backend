const DocumentService = require('../services/documentService');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * Controller for Case Document Management endpoints.
 */
class DocumentController {
  /**
   * POST /api/cases/:id/documents
   * Upload and attach a document to a case.
   */
  static async uploadDocument(req, res) {
    try {
      const { id: caseId } = req.params;
      const { document_type, description } = req.body;
      const file = req.file;

      const document = await DocumentService.uploadDocument({
        caseId,
        file,
        documentType: document_type,
        description,
      });

      return successResponse(res, {
        statusCode: 201,
        message: 'Document uploaded and attached successfully.',
        data: document,
      });
    } catch (error) {
      console.error('[DocumentController.uploadDocument Error]:', error);
      return errorResponse(res, {
        statusCode: error.statusCode || 500,
        message: error.message || 'Failed to upload document.',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/cases/:id/documents
   * Retrieve all documents attached to a case.
   */
  static async getDocuments(req, res) {
    try {
      const { id: caseId } = req.params;
      const documents = await DocumentService.getDocumentsByCaseId(caseId);

      return successResponse(res, {
        statusCode: 200,
        message: 'Case documents retrieved successfully.',
        data: documents,
      });
    } catch (error) {
      console.error('[DocumentController.getDocuments Error]:', error);
      return errorResponse(res, {
        statusCode: error.statusCode || 500,
        message: error.message || 'Failed to retrieve case documents.',
        error: error.message,
      });
    }
  }

  /**
   * DELETE /api/cases/:id/documents/:docId
   * Safely delete a case document.
   */
  static async deleteDocument(req, res) {
    try {
      const { id: caseId, docId } = req.params;
      const result = await DocumentService.deleteDocument({ caseId, docId });

      return successResponse(res, {
        statusCode: 200,
        message: 'Document deleted successfully.',
        data: result,
      });
    } catch (error) {
      console.error('[DocumentController.deleteDocument Error]:', error);
      return errorResponse(res, {
        statusCode: error.statusCode || 500,
        message: error.message || 'Failed to delete document.',
        error: error.message,
      });
    }
  }
}

module.exports = DocumentController;
