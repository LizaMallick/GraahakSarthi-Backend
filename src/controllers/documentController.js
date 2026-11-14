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
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[DocumentController.uploadDocument Error]:', error);
      } else {
        console.warn(`[DocumentController.uploadDocument Warning] ${status}:`, error.message);
      }
      return errorResponse(res, {
        statusCode: status,
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
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[DocumentController.getDocuments Error]:', error);
      } else {
        console.warn(`[DocumentController.getDocuments Warning] ${status}:`, error.message);
      }
      return errorResponse(res, {
        statusCode: status,
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
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[DocumentController.deleteDocument Error]:', error);
      } else {
        console.warn(`[DocumentController.deleteDocument Warning] ${status}:`, error.message);
      }
      return errorResponse(res, {
        statusCode: status,
        message: error.message || 'Failed to delete document.',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/cases/:id/documents/:docId/file
   * Stream document binary for inline preview or attachment download.
   */
  static async getDocumentFile(req, res) {
    try {
      const { id: caseId, docId } = req.params;
      const isDownload = req.query.download === 'true' || req.query.download === '1';

      const fileInfo = await DocumentService.getDocumentFile({ caseId, docId });

      res.setHeader('Content-Type', fileInfo.mimeType);
      const disposition = isDownload ? 'attachment' : 'inline';
      const encodedFilename = encodeURIComponent(fileInfo.originalFilename);
      res.setHeader(
        'Content-Disposition',
        `${disposition}; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
      );

      return res.sendFile(fileInfo.filePath);
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[DocumentController.getDocumentFile Error]:', error);
      } else {
        console.warn(`[DocumentController.getDocumentFile Warning] ${status}:`, error.message);
      }
      return errorResponse(res, {
        statusCode: status,
        message: error.message || 'Failed to retrieve document file.',
        error: error.message,
      });
    }
  }

  /**
   * PATCH /api/cases/:id/documents/:docId
   * Update document metadata (document_type, description).
   */
  static async updateDocument(req, res) {
    try {
      const { id: caseId, docId } = req.params;
      const { document_type, description } = req.body;

      const updated = await DocumentService.updateDocumentMetadata({
        caseId,
        docId,
        documentType: document_type,
        description,
      });

      return successResponse(res, {
        statusCode: 200,
        message: 'Document metadata updated successfully.',
        data: updated,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[DocumentController.updateDocument Error]:', error);
      } else {
        console.warn(`[DocumentController.updateDocument Warning] ${status}:`, error.message);
      }
      return errorResponse(res, {
        statusCode: status,
        message: error.message || 'Failed to update document metadata.',
        error: error.message,
      });
    }
  }
}

module.exports = DocumentController;
