const path = require('path');
const fs = require('fs');
const upload = require('../middleware/upload');
const { errorResponse } = require('../utils/response');

const ALLOWED_DOCUMENT_TYPES = new Set([
  'TAX_INVOICE',
  'ORDER_CONFIRMATION',
  'PAYMENT_RECEIPT',
  'DEFECT_EVIDENCE',
  'JOB_SHEET_OR_REPORT',
  'DELIVERY_PROOF',
  'COMMUNICATION_RECORD',
  'ADVERTISEMENT_OR_OFFER',
  'WARRANTY_DOCUMENT',
  'OTHER',
]);

const POSITIVE_INT_REGEX = /^[1-9]\d*$/;

/**
 * Middleware wrapper to handle Multer file upload errors gracefully.
 * Intercepts LIMIT_FILE_SIZE and INVALID_FILE_TYPE, returning standard HTTP 400 responses.
 */
function handleUploadMiddleware(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return errorResponse(res, {
          statusCode: 400,
          message: 'File size exceeds maximum allowed limit of 10MB.',
          error: 'LIMIT_FILE_SIZE',
        });
      }

      if (err.code === 'INVALID_FILE_TYPE' || (err.message && err.message.includes('Invalid file type'))) {
        return errorResponse(res, {
          statusCode: 400,
          message: err.message || 'Invalid file type. Only PDF, PNG, and JPG/JPEG files are accepted.',
          error: 'INVALID_FILE_TYPE',
        });
      }

      return errorResponse(res, {
        statusCode: 400,
        message: err.message || 'File upload failed.',
        error: err.code || 'UPLOAD_ERROR',
      });
    }

    return next();
  });
}

/**
 * Validates document upload payload (POST /api/cases/:id/documents).
 * Ensures a file was attached and document_type adheres to the strict allowlist.
 * Automatically cleans up the uploaded file if validation fails.
 */
function validateDocumentUpload(req, res, next) {
  const errors = [];

  // Check file presence
  if (!req.file) {
    errors.push('A valid file attachment is required (field name: "file").');
  }

  // Check document_type
  const { document_type, description } = req.body || {};
  if (!document_type || typeof document_type !== 'string' || !document_type.trim()) {
    errors.push(`document_type is required and must be one of: ${Array.from(ALLOWED_DOCUMENT_TYPES).join(', ')}.`);
  } else if (!ALLOWED_DOCUMENT_TYPES.has(document_type.trim())) {
    errors.push(`Invalid document_type '${document_type}'. Allowed values: ${Array.from(ALLOWED_DOCUMENT_TYPES).join(', ')}.`);
  }

  // Check optional description
  if (description !== undefined && description !== null) {
    if (typeof description !== 'string') {
      errors.push('description must be a string if provided.');
    } else if (description.trim().length > 255) {
      errors.push('description must not exceed 255 characters.');
    }
  }

  if (errors.length > 0) {
    // Clean up uploaded physical file immediately if validation failed
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkErr) {
        // ignore error if file was already removed
      }
    }

    return errorResponse(res, {
      statusCode: 400,
      message: 'Validation failed for document upload.',
      errors,
    });
  }

  // Sanitize validated values
  req.body.document_type = document_type.trim();
  req.body.description = description && typeof description === 'string' ? description.trim() : null;

  return next();
}

/**
 * Validates document ID path parameter (e.g., DELETE /api/cases/:id/documents/:docId).
 * Preserves ID as a decimal string for BIGINT compatibility.
 */
function validateDocId(req, res, next) {
  const { docId } = req.params;
  const trimmedDocId = docId !== undefined && docId !== null ? String(docId).trim() : '';

  if (!trimmedDocId || !POSITIVE_INT_REGEX.test(trimmedDocId)) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'Invalid document ID format. ID must be a positive integer.',
    });
  }

  req.params.docId = trimmedDocId;
  return next();
}

module.exports = {
  ALLOWED_DOCUMENT_TYPES,
  handleUploadMiddleware,
  validateDocumentUpload,
  validateDocId,
};
