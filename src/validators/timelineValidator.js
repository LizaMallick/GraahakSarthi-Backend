const { errorResponse } = require('../utils/response');

const POSITIVE_INT_REGEX = /^[1-9]\d*$/;
const MIN_ORDER_INDEX = -100000;
const MAX_ORDER_INDEX = 100000;

const ALLOWED_MANUAL_SOURCE_TYPES = new Set([
  'USER_INPUT',
  'COMMUNICATION',
  'HEARING',
]);

const ALL_ALLOWED_SOURCE_TYPES = new Set([
  'USER_INPUT',
  'SYSTEM_MILESTONE',
  'DOCUMENT_UPLOAD',
  'EVIDENCE_EVALUATION',
  'COMMUNICATION',
  'HEARING',
]);

const ALLOWED_CREATE_FIELDS = new Set([
  'event_date',
  'title',
  'description',
  'source_type',
  'document_id',
  'order_index',
]);

const ALLOWED_UPDATE_FIELDS = new Set([
  'event_date',
  'title',
  'description',
  'document_id',
  'order_index',
]);

/**
 * Validates whether an input represents a valid parseable calendar date.
 * Requires year between 1900 and 2100.
 */
function isValidDateString(val) {
  if (val === undefined || val === null) return false;
  if (typeof val !== 'string' && !(val instanceof Date)) return false;
  const str = String(val).trim();
  if (str === '') return false;
  const ts = Date.parse(str);
  if (isNaN(ts)) return false;
  const d = new Date(ts);
  const year = d.getUTCFullYear();
  return Number.isFinite(year) && year >= 1900 && year <= 2100;
}

/**
 * Validate eventId route parameter.
 */
function validateEventId(req, res, next) {
  const { eventId } = req.params;
  if (!eventId || !POSITIVE_INT_REGEX.test(String(eventId).trim())) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'Invalid timeline event ID format. Must be a positive integer.',
      error: 'INVALID_EVENT_ID',
    });
  }
  next();
}

/**
 * Validate request body for creating a manual timeline event (POST /api/cases/:id/timeline).
 */
function validateCreateEvent(req, res, next) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'Request body must be a valid JSON object.',
    });
  }

  const errors = [];

  // Reject unexpected request-body fields
  for (const key of Object.keys(req.body)) {
    if (!ALLOWED_CREATE_FIELDS.has(key)) {
      errors.push(
        `Unexpected field '${key}' in request body. Allowed fields: ${Array.from(ALLOWED_CREATE_FIELDS).join(', ')}.`
      );
    }
  }

  const { event_date, title, description, source_type, document_id, order_index } = req.body;

  // event_date: Required, valid ISO 8601 or date format
  if (event_date === undefined || event_date === null || String(event_date).trim() === '') {
    errors.push('event_date is required and must be a valid date.');
  } else if (!isValidDateString(event_date)) {
    errors.push('event_date must be a valid parseable ISO 8601 or date string with year between 1900 and 2100.');
  }

  // title: Required, non-empty string, max 255 chars
  if (title === undefined || title === null || typeof title !== 'string' || title.trim().length === 0) {
    errors.push('title is required and must be a non-empty string.');
  } else if (title.trim().length > 255) {
    errors.push('title cannot exceed 255 characters.');
  }

  // description: Optional string
  if (description !== undefined && description !== null && typeof description !== 'string') {
    errors.push('description must be a string if provided.');
  }

  // source_type: Optional, but restricted to manual types
  if (source_type !== undefined && source_type !== null) {
    if (typeof source_type !== 'string' || !ALLOWED_MANUAL_SOURCE_TYPES.has(source_type.trim())) {
      errors.push(
        `Invalid source_type '${source_type}'. Allowed values for manual events: ${Array.from(ALLOWED_MANUAL_SOURCE_TYPES).join(', ')}.`
      );
    }
  }

  // document_id: Optional, positive integer if provided
  if (document_id !== undefined && document_id !== null) {
    if (!POSITIVE_INT_REGEX.test(String(document_id).trim())) {
      errors.push('document_id must be a positive integer if provided.');
    }
  }

  // order_index: Optional integer within range [-100000, 100000]
  if (order_index !== undefined && order_index !== null) {
    const num = Number(order_index);
    if (!Number.isInteger(num) || num < MIN_ORDER_INDEX || num > MAX_ORDER_INDEX) {
      errors.push(`order_index must be an integer between ${MIN_ORDER_INDEX} and ${MAX_ORDER_INDEX}.`);
    }
  }

  if (errors.length > 0) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'Validation failed for timeline event creation.',
      errors,
    });
  }

  next();
}

/**
 * Validate request body for updating a timeline event (PATCH /api/cases/:id/timeline/:eventId).
 */
function validateUpdateEvent(req, res, next) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'Request body must be a valid JSON object.',
    });
  }

  const errors = [];

  // Strictly disallow modifying source_type or case_id
  if (req.body.source_type !== undefined || req.body.case_id !== undefined) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'Modifying source_type or case_id is not allowed.',
      error: 'IMMUTABLE_FIELD',
    });
  }

  // Reject unexpected request-body fields
  for (const key of Object.keys(req.body)) {
    if (!ALLOWED_UPDATE_FIELDS.has(key)) {
      errors.push(
        `Unexpected field '${key}' in request body. Allowed fields: ${Array.from(ALLOWED_UPDATE_FIELDS).join(', ')}.`
      );
    }
  }

  const { event_date, title, description, document_id, order_index } = req.body;

  // Require at least one valid field to update
  const hasUpdateField =
    event_date !== undefined ||
    title !== undefined ||
    description !== undefined ||
    document_id !== undefined ||
    order_index !== undefined;

  if (!hasUpdateField && errors.length === 0) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'At least one field (event_date, title, description, document_id, order_index) must be provided for update.',
    });
  }

  if (event_date !== undefined) {
    if (!isValidDateString(event_date)) {
      errors.push('event_date must be a valid parseable ISO 8601 or date string with year between 1900 and 2100.');
    }
  }

  if (title !== undefined) {
    if (title === null || typeof title !== 'string' || title.trim().length === 0) {
      errors.push('title must be a non-empty string.');
    } else if (title.trim().length > 255) {
      errors.push('title cannot exceed 255 characters.');
    }
  }

  if (description !== undefined && description !== null && typeof description !== 'string') {
    errors.push('description must be a string or null.');
  }

  if (document_id !== undefined && document_id !== null) {
    if (!POSITIVE_INT_REGEX.test(String(document_id).trim())) {
      errors.push('document_id must be a positive integer or null.');
    }
  }

  if (order_index !== undefined && order_index !== null) {
    const num = Number(order_index);
    if (!Number.isInteger(num) || num < MIN_ORDER_INDEX || num > MAX_ORDER_INDEX) {
      errors.push(`order_index must be an integer between ${MIN_ORDER_INDEX} and ${MAX_ORDER_INDEX}.`);
    }
  }

  if (errors.length > 0) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'Validation failed for timeline event update.',
      errors,
    });
  }

  next();
}

/**
 * Validate query parameters for listing timeline events (GET /api/cases/:id/timeline).
 */
function validateGetTimelineQuery(req, res, next) {
  const { sort, source_type } = req.query;
  const errors = [];

  if (sort !== undefined && sort !== null) {
    const upperSort = String(sort).trim().toUpperCase();
    if (upperSort !== 'ASC' && upperSort !== 'DESC') {
      errors.push("sort query parameter must be either 'ASC' or 'DESC'.");
    }
  }

  if (source_type !== undefined && source_type !== null) {
    const trimmed = String(source_type).trim();
    if (!ALL_ALLOWED_SOURCE_TYPES.has(trimmed)) {
      errors.push(
        `Invalid source_type filter '${trimmed}'. Allowed values: ${Array.from(ALL_ALLOWED_SOURCE_TYPES).join(', ')}.`
      );
    }
  }

  if (errors.length > 0) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'Invalid timeline query parameters.',
      errors,
    });
  }

  next();
}

module.exports = {
  validateEventId,
  validateCreateEvent,
  validateUpdateEvent,
  validateGetTimelineQuery,
};
