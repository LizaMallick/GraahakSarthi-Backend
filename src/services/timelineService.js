const TimelineModel = require('../models/timelineModel');
const CaseModel = require('../models/caseModel');
const DocumentModel = require('../models/documentModel');

const SYSTEM_SOURCE_TYPES = new Set([
  'SYSTEM_MILESTONE',
  'DOCUMENT_UPLOAD',
  'EVIDENCE_EVALUATION',
]);

/**
 * Service Layer for Case Timeline Events and Automatic Milestones.
 */
class TimelineService {
  /**
   * Retrieve chronologically ordered timeline events for a case.
   */
  static async getTimeline(caseId, { source_type, sort = 'ASC' } = {}, connection = null) {
    const caseItem = await CaseModel.findById(caseId, connection);
    if (!caseItem) {
      const error = new Error(`Case with ID ${caseId} not found.`);
      error.statusCode = 404;
      throw error;
    }

    return TimelineModel.findByCaseId(caseId, { source_type, sort }, connection);
  }

  /**
   * Create a manual timeline event.
   */
  static async createEvent(caseId, { event_date, title, description, source_type = 'USER_INPUT', document_id = null, order_index = 0 }, connection = null) {
    const caseItem = await CaseModel.findById(caseId, connection);
    if (!caseItem) {
      const error = new Error(`Case with ID ${caseId} not found.`);
      error.statusCode = 404;
      throw error;
    }

    // Verify linked document belongs to this case
    if (document_id) {
      const doc = await DocumentModel.findById(document_id, connection);
      if (!doc || String(doc.case_id) !== String(caseId)) {
        const error = new Error(`Document with ID ${document_id} does not belong to case ${caseId}.`);
        error.statusCode = 400;
        throw error;
      }
    }

    return TimelineModel.createEvent({
      case_id: caseId,
      event_date,
      title: title.trim(),
      description: description ? description.trim() : null,
      source_type: source_type ? source_type.trim() : 'USER_INPUT',
      document_id: document_id || null,
      order_index: order_index || 0,
    }, connection);
  }

  /**
   * Update a manual timeline event.
   */
  static async updateEvent(caseId, eventId, updateData, connection = null) {
    const caseItem = await CaseModel.findById(caseId, connection);
    if (!caseItem) {
      const error = new Error(`Case with ID ${caseId} not found.`);
      error.statusCode = 404;
      throw error;
    }

    const existingEvent = await TimelineModel.findById(eventId, connection);
    if (!existingEvent || String(existingEvent.case_id) !== String(caseId)) {
      const error = new Error(`Timeline event with ID ${eventId} not found for case ${caseId}.`);
      error.statusCode = 404;
      throw error;
    }

    // Disallow modification of system-generated events
    if (SYSTEM_SOURCE_TYPES.has(existingEvent.source_type)) {
      const error = new Error('System-generated timeline events cannot be modified.');
      error.statusCode = 403;
      throw error;
    }

    // If updating document_id, verify document belongs to this case
    if (updateData.document_id) {
      const doc = await DocumentModel.findById(updateData.document_id, connection);
      if (!doc || String(doc.case_id) !== String(caseId)) {
        const error = new Error(`Document with ID ${updateData.document_id} does not belong to case ${caseId}.`);
        error.statusCode = 400;
        throw error;
      }
    }

    return TimelineModel.updateById(eventId, updateData, connection);
  }

  /**
   * Safely delete a manual timeline event.
   */
  static async deleteEvent(caseId, eventId, connection = null) {
    const caseItem = await CaseModel.findById(caseId, connection);
    if (!caseItem) {
      const error = new Error(`Case with ID ${caseId} not found.`);
      error.statusCode = 404;
      throw error;
    }

    const existingEvent = await TimelineModel.findById(eventId, connection);
    if (!existingEvent || String(existingEvent.case_id) !== String(caseId)) {
      const error = new Error(`Timeline event with ID ${eventId} not found for case ${caseId}.`);
      error.statusCode = 404;
      throw error;
    }

    // Disallow deletion of system-generated events
    if (SYSTEM_SOURCE_TYPES.has(existingEvent.source_type)) {
      const error = new Error('System-generated timeline events cannot be deleted.');
      error.statusCode = 403;
      throw error;
    }

    await TimelineModel.deleteById(eventId, connection);
    return {
      deleted: true,
      id: String(eventId),
      case_id: String(caseId),
    };
  }

  // --- Automatic Milestone Hooks ---

  /**
   * Record automatic milestone when a new case is created.
   * Propagates errors to caller so parent transaction can roll back.
   */
  static async recordCaseCreatedMilestone(caseItem, connection = null) {
    const isDuplicate = await TimelineModel.findDuplicateCaseCreated(caseItem.id, connection);
    if (isDuplicate) return null;

    const title = `Case Registered: ${caseItem.title}`.slice(0, 255);
    const amountStr = Number(caseItem.claimed_amount || 0).toFixed(2);
    const description = `Consumer case registered under category '${caseItem.issue_category}' with claimed amount ₹${amountStr}.`;

    return TimelineModel.createEvent({
      case_id: caseItem.id,
      event_date: caseItem.created_at || new Date(),
      title,
      description,
      source_type: 'SYSTEM_MILESTONE',
      document_id: null,
      order_index: 0,
    }, connection);
  }

  /**
   * Record automatic milestone when an evidence document is uploaded.
   * Propagates errors to caller so parent transaction can roll back.
   */
  static async recordDocumentUploadMilestone({ caseId, document }, connection = null) {
    const isDuplicate = await TimelineModel.findByDocumentId(document.id, connection);
    if (isDuplicate) return null;

    const docType = document.document_type || 'OTHER';
    const title = `Document Attached: ${docType}`.slice(0, 255);
    const description =
      document.description ||
      `Uploaded evidence document '${document.original_filename}' (${docType}).`;

    return TimelineModel.createEvent({
      case_id: caseId,
      event_date: document.created_at || new Date(),
      title,
      description,
      source_type: 'DOCUMENT_UPLOAD',
      document_id: document.id,
      order_index: 0,
    }, connection);
  }

  /**
   * Record automatic milestone when evidence is evaluated.
   * Avoids duplicate identical consecutive evaluations.
   * Propagates errors to caller so parent transaction can roll back.
   */
  static async recordEvidenceEvaluationMilestone({ caseId, evaluation }, connection = null) {
    const expectedTitle = `Evidence Evaluated: ${evaluation.coverage_level} (${evaluation.evidence_coverage_score}/100)`;

    const latest = await TimelineModel.findLatestBySourceType(caseId, 'EVIDENCE_EVALUATION', connection);
    if (latest && latest.title === expectedTitle) {
      // Consecutive identical evaluation - skip duplicate event
      return null;
    }

    const missingCount = Array.isArray(evaluation.missing_proofs) ? evaluation.missing_proofs.length : 0;
    const description = `Evaluated 4 evidence pillars: Coverage score ${evaluation.evidence_coverage_score}/100 (${evaluation.coverage_level}). Identified ${missingCount} missing proof type(s).`;

    return TimelineModel.createEvent({
      case_id: caseId,
      event_date: new Date(),
      title: expectedTitle.slice(0, 255),
      description,
      source_type: 'EVIDENCE_EVALUATION',
      document_id: null,
      order_index: 0,
    }, connection);
  }
}

module.exports = TimelineService;
