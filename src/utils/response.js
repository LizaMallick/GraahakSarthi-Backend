/**
 * Standardized API response formatters for Graahak AI Backend.
 * Ensures consistent response envelopes across all endpoints.
 */

/**
 * Send a standardized success JSON response.
 *
 * @param {import('express').Response} res - Express response object
 * @param {object} options
 * @param {number} [options.statusCode=200] - HTTP status code
 * @param {string} [options.message='Success'] - Human-readable success message
 * @param {any} [options.data=null] - Main response payload
 * @param {object|null} [options.meta=null] - Optional pagination or context metadata
 */
function successResponse(res, { statusCode = 200, message = 'Success', data = null, meta = null } = {}) {
  const payload = {
    success: true,
    message,
    data,
  };

  if (meta !== null && typeof meta === 'object') {
    payload.meta = meta;
  }

  return res.status(statusCode).json(payload);
}

/**
 * Send a standardized error JSON response.
 *
 * @param {import('express').Response} res - Express response object
 * @param {object} options
 * @param {number} [options.statusCode=500] - HTTP status code
 * @param {string} [options.message='An error occurred'] - Human-readable error message
 * @param {string|object|null} [options.error=null] - Error code or technical details
 * @param {Array<any>|null} [options.errors=null] - Detailed field-level validation errors
 */
function errorResponse(res, { statusCode = 500, message = 'An error occurred', error = null, errors = null } = {}) {
  const payload = {
    success: false,
    message,
  };

  if (error !== null) {
    payload.error = typeof error === 'object' && error.message ? error.message : error;
  }

  if (Array.isArray(errors) && errors.length > 0) {
    payload.errors = errors;
  }

  return res.status(statusCode).json(payload);
}

module.exports = {
  successResponse,
  errorResponse,
};
