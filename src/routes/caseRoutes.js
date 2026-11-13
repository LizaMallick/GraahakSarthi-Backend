const express = require('express');
const router = express.Router();
const CaseController = require('../controllers/caseController');
const DocumentController = require('../controllers/documentController');
const EvidenceController = require('../controllers/evidenceController');
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
} = require('../validators/documentValidator');

// --- Case Management Routes (Phase 3) ---
// POST /api/cases - Create a new consumer case
router.post('/', validateCreateCase, CaseController.createCase);

// GET /api/cases - Retrieve paginated and filtered cases
router.get('/', validateGetCasesQuery, CaseController.getCases);

// GET /api/cases/:id - Retrieve a single case by ID
router.get('/:id', validateCaseId, CaseController.getCaseById);

// PATCH /api/cases/:id - Update an existing case by ID
router.patch('/:id', validateCaseId, validateUpdateCase, CaseController.updateCase);

// --- Document Management Routes (Phase 4B) ---
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

module.exports = router;
