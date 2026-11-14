const express = require('express');
const router = express.Router();
const CaseController = require('../controllers/caseController');
const DocumentController = require('../controllers/documentController');
const EvidenceController = require('../controllers/evidenceController');
const TimelineController = require('../controllers/timelineController');
const LossCalculatorController = require('../controllers/lossCalculatorController');
const {
  validateCreateCase,
  validateGetCasesQuery,
  validateCaseId,
  validateUpdateCase,
} = require('../validators/caseValidator');
const {
  handleUploadMiddleware,
  validateDocumentUpload,
  validateDocId,
  validateUpdateDocument,
} = require('../validators/documentValidator');
const {
  validateEventId,
  validateCreateEvent,
  validateUpdateEvent,
  validateGetTimelineQuery,
} = require('../validators/timelineValidator');
const {
  validateCalculateLoss,
} = require('../validators/lossValidator');

// --- Case Management Routes (Phase 3) ---
// POST /api/cases - Create a new consumer case
router.post('/', validateCreateCase, CaseController.createCase);

// GET /api/cases - Retrieve paginated and filtered cases
router.get('/', validateGetCasesQuery, CaseController.getCases);

// GET /api/cases/:id - Retrieve a single case by ID
router.get('/:id', validateCaseId, CaseController.getCaseById);

// PATCH /api/cases/:id - Update an existing case by ID
router.patch('/:id', validateCaseId, validateUpdateCase, CaseController.updateCase);

// DELETE /api/cases/:id - Delete a case and clean up all associated documents
router.delete('/:id', validateCaseId, CaseController.deleteCase);

// --- Document Management Routes (Phase 4B & Phase 7) ---
// POST /api/cases/:id/documents - Upload and attach a document to a case
router.post(
  '/:id/documents',
  validateCaseId,
  handleUploadMiddleware,
  validateDocumentUpload,
  DocumentController.uploadDocument
);

// GET /api/cases/:id/documents - Retrieve all documents attached to a case
router.get(
  '/:id/documents',
  validateCaseId,
  DocumentController.getDocuments
);

// GET /api/cases/:id/documents/:docId/file - Stream document binary for inline preview or download
router.get(
  '/:id/documents/:docId/file',
  validateCaseId,
  validateDocId,
  DocumentController.getDocumentFile
);

// PATCH /api/cases/:id/documents/:docId - Update document metadata (document_type, description)
router.patch(
  '/:id/documents/:docId',
  validateCaseId,
  validateDocId,
  validateUpdateDocument,
  DocumentController.updateDocument
);

// DELETE /api/cases/:id/documents/:docId - Safely delete a case document
router.delete(
  '/:id/documents/:docId',
  validateCaseId,
  validateDocId,
  DocumentController.deleteDocument
);

// --- Evidence Evaluation Routes (Phase 4C) ---
// POST /api/cases/:id/evidence/evaluate - Evaluate evidence and persist snapshot
router.post(
  '/:id/evidence/evaluate',
  validateCaseId,
  EvidenceController.evaluateEvidence
);

// GET /api/cases/:id/evidence - Retrieve latest evidence evaluation
router.get(
  '/:id/evidence',
  validateCaseId,
  EvidenceController.getEvidence
);

// --- Case Timeline Routes (Phase 5) ---
// GET /api/cases/:id/timeline - Retrieve chronologically ordered timeline events
router.get(
  '/:id/timeline',
  validateCaseId,
  validateGetTimelineQuery,
  TimelineController.getTimeline
);

// POST /api/cases/:id/timeline - Create a manual timeline event
router.post(
  '/:id/timeline',
  validateCaseId,
  validateCreateEvent,
  TimelineController.createEvent
);

// PATCH /api/cases/:id/timeline/:eventId - Update a manual timeline event
router.patch(
  '/:id/timeline/:eventId',
  validateCaseId,
  validateEventId,
  validateUpdateEvent,
  TimelineController.updateEvent
);

// DELETE /api/cases/:id/timeline/:eventId - Delete a manual timeline event
router.delete(
  '/:id/timeline/:eventId',
  validateCaseId,
  validateEventId,
  TimelineController.deleteEvent
);

// --- Consumer Loss Calculator Routes (Phase 6) ---
// POST /api/cases/:id/loss/calculate - Calculate and persist consumer financial loss snapshot
router.post(
  '/:id/loss/calculate',
  validateCaseId,
  validateCalculateLoss,
  LossCalculatorController.calculateLoss
);

// GET /api/cases/:id/loss - Retrieve latest consumer loss calculation or fallback baseline
router.get(
  '/:id/loss',
  validateCaseId,
  LossCalculatorController.getLoss
);

// GET /api/cases/:id/loss/history - Retrieve calculation history snapshots
router.get(
  '/:id/loss/history',
  validateCaseId,
  LossCalculatorController.getLossHistory
);

module.exports = router;
