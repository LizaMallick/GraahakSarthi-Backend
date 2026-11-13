const { errorResponse } = require('../utils/response');

const ALLOWED_CATEGORIES = new Set([
  'DEFECTIVE_PRODUCT',
  'DELAYED_DELIVERY',
  'DEFICIENCY_IN_SERVICE',
  'UNFAIR_TRADE_PRACTICE',
  'GENERAL',
]);

const ALLOWED_STATUSES = new Set([
  'PENDING',
  'ANALYZING',
  'ANALYZED',
  'RESOLVED',
  'CLOSED',
]);

const MAX_CLAIMED_AMOUNT = 9999999999.99;
const POSITIVE_INT_REGEX = /^[1-9]\d*$/;

/**
 * Validates whether a value is a valid claimed amount:
 * - not null, undefined, or empty/whitespace-only string
 * - numeric, finite, non-negative, and <= 9999999999.99 (DECIMAL(12,2))
 */
function isValidClaimedAmount(val) {
  if (val === undefined || val === null) return false;
  if (typeof val === 'string' && val.trim() === '') return false;
  const num = Number(val);
  return Number.isFinite(num) && num >= 0 && num <= MAX_CLAIMED_AMOUNT;
}

/**
 * Validates request body for creating a consumer case (POST /api/cases).
 */
function validateCreateCase(req, res, next) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'Request body must be a valid JSON object.',
    });
  }

  const { title, issue_category, merchant_name, claimed_amount, user_narrative } = req.body;
  const errors = [];

  // Title: required, string, 1-255 chars
  if (title === undefined || title === null || typeof title !== 'string' || title.trim().length === 0) {
    errors.push('title is required and must be a non-empty string.');
  } else if (title.trim().length > 255) {
    errors.push('title must not exceed 255 characters.');
  }

  // Issue Category: required, must be in ALLOWED_CATEGORIES
  if (!issue_category || typeof issue_category !== 'string') {
    errors.push(`issue_category is required and must be one of: ${Array.from(ALLOWED_CATEGORIES).join(', ')}.`);
  } else if (!ALLOWED_CATEGORIES.has(issue_category.trim())) {
    errors.push(`Invalid issue_category '${issue_category}'. Allowed values: ${Array.from(ALLOWED_CATEGORIES).join(', ')}.`);
  }

  // Claimed Amount: required, numeric, >= 0, <= 9999999999.99
  if (claimed_amount === undefined || claimed_amount === null || (typeof claimed_amount === 'string' && claimed_amount.trim() === '')) {
    errors.push('claimed_amount is required.');
  } else if (!isValidClaimedAmount(claimed_amount)) {
    errors.push('claimed_amount must be a valid non-negative number not exceeding 9999999999.99.');
  }

  // User Narrative: required, string, non-empty
  if (user_narrative === undefined || user_narrative === null || typeof user_narrative !== 'string' || user_narrative.trim().length === 0) {
    errors.push('user_narrative is required and must be a non-empty text description.');
  }

  // Merchant Name: optional, if provided must be string <= 255 chars
  if (merchant_name !== undefined && merchant_name !== null) {
    if (typeof merchant_name !== 'string') {
      errors.push('merchant_name must be a string if provided.');
    } else if (merchant_name.length > 255) {
      errors.push('merchant_name must not exceed 255 characters.');
    }
  }

  if (errors.length > 0) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'Validation failed for case creation.',
      errors,
    });
  }

  // Sanitize trimmed values onto request
  req.body.title = title.trim();
  req.body.issue_category = issue_category.trim();
  req.body.claimed_amount = Number(claimed_amount);
  req.body.user_narrative = user_narrative.trim();
  if (merchant_name !== undefined && merchant_name !== null) {
    req.body.merchant_name = merchant_name.trim();
  } else {
    req.body.merchant_name = null;
  }

  return next();
}

/**
 * Validates query parameters for listing consumer cases (GET /api/cases).
 * Does not mutate req.query; stores validated values in req.validatedQuery.
 */
function validateGetCasesQuery(req, res, next) {
  const errors = [];
  const { page, limit, status, issue_category } = req.query || {};

  let parsedPage = 1;
  let parsedLimit = 10;

  if (page !== undefined) {
    const pageStr = typeof page === 'string' ? page.trim() : String(page);
    if (!POSITIVE_INT_REGEX.test(pageStr)) {
      errors.push("Query parameter 'page' must be a positive integer greater than or equal to 1.");
    } else {
      parsedPage = parseInt(pageStr, 10);
    }
  }

  if (limit !== undefined) {
    const limitStr = typeof limit === 'string' ? limit.trim() : String(limit);
    if (!POSITIVE_INT_REGEX.test(limitStr) || parseInt(limitStr, 10) > 100) {
      errors.push("Query parameter 'limit' must be an integer between 1 and 100.");
    } else {
      parsedLimit = parseInt(limitStr, 10);
    }
  }

  if (status !== undefined) {
    if (typeof status !== 'string' || !ALLOWED_STATUSES.has(status.trim())) {
      errors.push(`Invalid status filter '${status}'. Allowed values: ${Array.from(ALLOWED_STATUSES).join(', ')}.`);
    }
  }

  if (issue_category !== undefined) {
    if (typeof issue_category !== 'string' || !ALLOWED_CATEGORIES.has(issue_category.trim())) {
      errors.push(`Invalid issue_category filter '${issue_category}'. Allowed values: ${Array.from(ALLOWED_CATEGORIES).join(', ')}.`);
    }
  }

  if (errors.length > 0) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'Invalid query parameters.',
      errors,
    });
  }

  req.validatedQuery = {
    page: parsedPage,
    limit: parsedLimit,
    status: status && typeof status === 'string' ? status.trim() : undefined,
    issue_category: issue_category && typeof issue_category === 'string' ? issue_category.trim() : undefined,
  };

  return next();
}

/**
 * Validates path parameter ID (e.g., GET/PATCH /api/cases/:id).
 * Preserves ID as a decimal string to prevent BIGINT precision loss.
 */
function validateCaseId(req, res, next) {
  const { id } = req.params;
  const trimmedId = id !== undefined && id !== null ? String(id).trim() : '';

  if (!trimmedId || !POSITIVE_INT_REGEX.test(trimmedId)) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'Invalid case ID format. ID must be a positive integer.',
    });
  }

  req.params.id = trimmedId;
  return next();
}

/**
 * Validates request body for updating a consumer case (PATCH /api/cases/:id).
 */
function validateUpdateCase(req, res, next) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'Request body must be a valid JSON object.',
    });
  }

  const { title, issue_category, merchant_name, claimed_amount, user_narrative, status } = req.body;
  const errors = [];

  // Ensure body is not empty
  const updateKeys = Object.keys(req.body);
  if (updateKeys.length === 0) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'Request body cannot be empty. At least one field must be provided for update.',
    });
  }

  // Restrict to permitted fields
  const allowedUpdateFields = new Set([
    'title',
    'issue_category',
    'merchant_name',
    'claimed_amount',
    'user_narrative',
    'status',
  ]);

  for (const key of updateKeys) {
    if (!allowedUpdateFields.has(key)) {
      errors.push(`Field '${key}' is not permitted for updates.`);
    }
  }

  // Validate title if present
  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      errors.push('title must be a non-empty string.');
    } else if (title.trim().length > 255) {
      errors.push('title must not exceed 255 characters.');
    }
  }

  // Validate issue_category if present
  if (issue_category !== undefined) {
    if (typeof issue_category !== 'string' || !ALLOWED_CATEGORIES.has(issue_category.trim())) {
      errors.push(`Invalid issue_category '${issue_category}'. Allowed values: ${Array.from(ALLOWED_CATEGORIES).join(', ')}.`);
    }
  }

  // Validate merchant_name if present
  if (merchant_name !== undefined && merchant_name !== null) {
    if (typeof merchant_name !== 'string') {
      errors.push('merchant_name must be a string.');
    } else if (merchant_name.length > 255) {
      errors.push('merchant_name must not exceed 255 characters.');
    }
  }

  // Validate claimed_amount if present
  if (claimed_amount !== undefined) {
    if (!isValidClaimedAmount(claimed_amount)) {
      errors.push('claimed_amount must be a valid non-negative number not exceeding 9999999999.99.');
    }
  }

  // Validate user_narrative if present
  if (user_narrative !== undefined) {
    if (typeof user_narrative !== 'string' || user_narrative.trim().length === 0) {
      errors.push('user_narrative must be a non-empty text description.');
    }
  }

  // Validate status if present
  if (status !== undefined) {
    if (typeof status !== 'string' || !ALLOWED_STATUSES.has(status.trim())) {
      errors.push(`Invalid status '${status}'. Allowed values: ${Array.from(ALLOWED_STATUSES).join(', ')}.`);
    }
  }

  if (errors.length > 0) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'Validation failed for case update.',
      errors,
    });
  }

  // Sanitize fields
  if (title !== undefined) req.body.title = title.trim();
  if (issue_category !== undefined) req.body.issue_category = issue_category.trim();
  if (merchant_name !== undefined) req.body.merchant_name = merchant_name !== null ? merchant_name.trim() : null;
  if (claimed_amount !== undefined) req.body.claimed_amount = Number(claimed_amount);
  if (user_narrative !== undefined) req.body.user_narrative = user_narrative.trim();
  if (status !== undefined) req.body.status = status.trim();

  return next();
}

module.exports = {
  ALLOWED_CATEGORIES,
  ALLOWED_STATUSES,
  validateCreateCase,
  validateGetCasesQuery,
  validateCaseId,
  validateUpdateCase,
};
