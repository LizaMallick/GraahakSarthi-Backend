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
 * Inspects initial bytes (magic numbers) of a file buffer to verify true content signature.
 * Prevents forged file extensions or spoofed MIME types.
 *
 * @param {Buffer} buffer
 * @returns {string|null} Detected MIME type or null if unrecognized
 */
function detectFileSignature(buffer) {
  if (!buffer || buffer.length < 4) return null;

  // PDF: %PDF- (0x25 0x50 0x44 0x46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }

  // PNG: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
    buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A
  ) {
    return 'image/png';
  }

  // JPEG / JPG: 0xFF 0xD8 0xFF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }

  // WEBP: "RIFF" at 0-3 and "WEBP" at 8-11
  // RIFF: 0x52 0x49 0x46 0x46, WEBP: 0x57 0x45 0x42 0x50
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Validates document upload payload (POST /api/cases/:id/documents).
 * Ensures a file was attached, verifies magic signature, and validates document_type.
 * Automatically cleans up the uploaded file if validation fails.
 */
function validateDocumentUpload(req, res, next) {
  const errors = [];

  // Check file presence
  if (!req.file) {
    errors.push('A valid file attachment is required (field name: "file").');
  } else {
    // Validate actual file signature (magic numbers)
    try {
      const fd = fs.openSync(req.file.path, 'r');
      const headerBuf = Buffer.alloc(16);
      const bytesRead = fs.readSync(fd, headerBuf, 0, 16, 0);
      fs.closeSync(fd);

      const detectedType = detectFileSignature(headerBuf.subarray(0, bytesRead));
      if (!detectedType) {
        errors.push('Invalid file content signature. File contents do not match accepted PDF, PNG, JPG/JPEG, or WEBP formats.');
      }
    } catch (readErr) {
      errors.push('Failed to inspect uploaded file content.');
    }
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

/**
 * Validates document metadata update payload (PATCH /api/cases/:id/documents/:docId).
 * Allows document_type and description. Rejects unexpected or immutable fields.
 */
function validateUpdateDocument(req, res, next) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'Request body must be a valid JSON object.',
    });
  }

  const errors = [];
  const allowedFields = new Set(['document_type', 'description']);

  // Disallow immutable fields
  const immutableFields = ['id', 'case_id', 'stored_filename', 'file_path', 'file_size', 'mime_type', 'created_at'];
  for (const field of immutableFields) {
    if (req.body[field] !== undefined) {
      errors.push(`Field '${field}' is immutable and cannot be updated.`);
    }
  }

  for (const key of Object.keys(req.body)) {
    if (!allowedFields.has(key) && !immutableFields.includes(key)) {
      errors.push(`Unexpected field '${key}' in request body.`);
    }
  }

  const { document_type, description } = req.body;

  if (document_type === undefined && description === undefined && errors.length === 0) {
    errors.push('At least one valid field (document_type, description) must be provided for update.');
  }

  if (document_type !== undefined) {
    if (typeof document_type !== 'string' || !document_type.trim()) {
      errors.push(`document_type must be a valid string from: ${Array.from(ALLOWED_DOCUMENT_TYPES).join(', ')}.`);
    } else if (!ALLOWED_DOCUMENT_TYPES.has(document_type.trim())) {
      errors.push(`Invalid document_type '${document_type}'. Allowed values: ${Array.from(ALLOWED_DOCUMENT_TYPES).join(', ')}.`);
    }
  }

  if (description !== undefined && description !== null) {
    if (typeof description !== 'string') {
      errors.push('description must be a string if provided.');
    } else if (description.trim().length > 255) {
      errors.push('description cannot exceed 255 characters.');
    }
  }

  if (errors.length > 0) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'Validation failed for document update.',
      errors,
    });
  }

  if (document_type !== undefined) {
    req.body.document_type = document_type.trim();
  }
  if (description !== undefined) {
    req.body.description = description && typeof description === 'string' ? description.trim() : null;
  }

  return next();
}

module.exports = {
  ALLOWED_DOCUMENT_TYPES,
  detectFileSignature,
  handleUploadMiddleware,
  validateDocumentUpload,
  validateDocId,
  validateUpdateDocument,
};
