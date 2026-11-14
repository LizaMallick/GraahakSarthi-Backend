const { errorResponse } = require('../utils/response');

const ALLOWED_BODY_FIELDS = new Set([
  'purchase_amount',
  'delivery_installation_charges',
  'repair_replacement_expenses',
  'travel_communication_expenses',
  'other_documented_expenses',
  'refunds_received',
  'interest',
]);

const ALLOWED_INTEREST_FIELDS = new Set(['annual_rate', 'start_date', 'end_date']);

/**
 * Validates non-negative monetary number or numeric string.
 */
function isValidMoney(val) {
  if (val === undefined || val === null) return true; // Optional field
  const num = Number(val);
  return Number.isFinite(num) && num >= 0 && num <= 9999999999.99;
}

/**
 * Validates ISO date string format.
 */
function isValidDate(val) {
  if (val === undefined || val === null || String(val).trim() === '') return false;
  const ts = Date.parse(val);
  if (isNaN(ts)) return false;
  const year = new Date(ts).getUTCFullYear();
  return year >= 1900 && year <= 2100;
}

/**
 * Validation middleware for POST /api/cases/:id/loss/calculate
 */
function validateCalculateLoss(req, res, next) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'Request body must be a valid JSON object.',
    });
  }

  const errors = [];

  // 1. Check for unexpected top-level fields
  for (const key of Object.keys(req.body)) {
    if (!ALLOWED_BODY_FIELDS.has(key)) {
      errors.push(`Unexpected field '${key}' in request body.`);
    }
  }

  // 2. Validate monetary amounts
  const moneyFields = [
    'purchase_amount',
    'delivery_installation_charges',
    'repair_replacement_expenses',
    'travel_communication_expenses',
    'other_documented_expenses',
    'refunds_received',
  ];

  for (const field of moneyFields) {
    if (req.body[field] !== undefined && !isValidMoney(req.body[field])) {
      errors.push(`${field} must be a valid non-negative number not exceeding 9999999999.99.`);
    }
  }

  // 3. Validate optional interest block
  if (req.body.interest !== undefined && req.body.interest !== null) {
    if (typeof req.body.interest !== 'object' || Array.isArray(req.body.interest)) {
      errors.push('interest must be a valid JSON object.');
    } else {
      for (const k of Object.keys(req.body.interest)) {
        if (!ALLOWED_INTEREST_FIELDS.has(k)) {
          errors.push(`Unexpected field '${k}' in interest object.`);
        }
      }

      const { annual_rate, start_date, end_date } = req.body.interest;

      if (annual_rate !== undefined && annual_rate !== null) {
        const rate = Number(annual_rate);
        if (!Number.isFinite(rate) || rate < 0 || rate > 36) {
          errors.push('interest.annual_rate must be a positive number not exceeding 36.00% per annum.');
        }
      }

      if (start_date !== undefined && start_date !== null && !isValidDate(start_date)) {
        errors.push('interest.start_date must be a valid date string (YYYY-MM-DD or ISO 8601).');
      }

      if (end_date !== undefined && end_date !== null && !isValidDate(end_date)) {
        errors.push('interest.end_date must be a valid date string (YYYY-MM-DD or ISO 8601).');
      }

      if (start_date && end_date && isValidDate(start_date) && isValidDate(end_date)) {
        if (new Date(start_date) > new Date(end_date)) {
          errors.push('interest.start_date cannot be later than interest.end_date.');
        }
      }
    }
  }

  if (errors.length > 0) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'Validation failed for loss calculation request.',
      errors,
    });
  }

  next();
}

module.exports = {
  validateCalculateLoss,
};
