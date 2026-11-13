const CaseModel = require('../models/caseModel');
const DocumentModel = require('../models/documentModel');
const EvidenceModel = require('../models/evidenceModel');
const { evaluateCaseEvidence, DISCLAIMER } = require('./evidenceEngine');

/**
 * Service Layer for Evidence Strength & Missing-Proof Evaluation.
 * Orchestrates case data, document models, and the rule-based evidence engine.
 */
class EvidenceService {
  /**
   * Run the rule-based evidence evaluation engine for a case and persist snapshot.
   */
  static async evaluateCaseEvidence(caseId) {
    // 1. Verify that the case exists
    const caseItem = await CaseModel.findById(caseId);
    if (!caseItem) {
      const error = new Error(`Case with ID ${caseId} not found.`);
      error.statusCode = 404;
      throw error;
    }

    // 2. Fetch all documents currently attached to this case
    const documents = await DocumentModel.findByCaseId(caseId);

    // 3. Execute rule-based deterministic evaluation
    const evaluation = evaluateCaseEvidence({
      caseRecord: caseItem,
      documents,
    });

    // 4. Persist snapshot in evidence_evaluations table
    const savedSnapshot = await EvidenceModel.createEvaluation({
      case_id: caseId,
      strength_score: evaluation.evidence_coverage_score,
      strength_level: evaluation.coverage_level,
      verified_proofs: evaluation.provided_proofs,
      missing_proofs: evaluation.missing_proofs,
      recommendations: evaluation.recommendations,
    });

    return {
      case_id: String(caseId),
      evaluation_id: String(savedSnapshot.id),
      evidence_coverage_score: evaluation.evidence_coverage_score,
      coverage_level: evaluation.coverage_level,
      pillar_breakdown: evaluation.pillar_breakdown,
      provided_proofs: evaluation.provided_proofs,
      missing_proofs: evaluation.missing_proofs,
      recommendations: evaluation.recommendations,
      created_at: savedSnapshot.created_at,
      disclaimer: DISCLAIMER,
    };
  }

  /**
   * Retrieve the latest evidence evaluation for a case.
   * If none exists yet, automatically generates and persists an initial baseline evaluation.
   */
  static async getCaseEvidence(caseId) {
    // 1. Verify case exists
    const caseItem = await CaseModel.findById(caseId);
    if (!caseItem) {
      const error = new Error(`Case with ID ${caseId} not found.`);
      error.statusCode = 404;
      throw error;
    }

    // 2. Check for existing evaluation snapshot
    const latestSnapshot = await EvidenceModel.findLatestByCaseId(caseId);
    if (!latestSnapshot) {
      // Run initial baseline evaluation if no snapshot exists yet
      return this.evaluateCaseEvidence(caseId);
    }

    // 3. Fetch documents to populate pillar breakdown
    const documents = await DocumentModel.findByCaseId(caseId);
    const liveEvaluation = evaluateCaseEvidence({
      caseRecord: caseItem,
      documents,
    });

    return {
      case_id: String(caseId),
      evaluation_id: String(latestSnapshot.id),
      evidence_coverage_score: latestSnapshot.strength_score,
      coverage_level: latestSnapshot.strength_level,
      pillar_breakdown: liveEvaluation.pillar_breakdown,
      provided_proofs: latestSnapshot.provided_proofs,
      missing_proofs: latestSnapshot.missing_proofs,
      recommendations: latestSnapshot.recommendations,
      created_at: latestSnapshot.created_at,
      disclaimer: DISCLAIMER,
    };
  }
}

module.exports = EvidenceService;
