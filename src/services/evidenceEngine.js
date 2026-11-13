/**
 * Deterministic Evidence Strength & Missing-Proof Engine
 *
 * Implements rule-based, explainable scoring under the Consumer Protection Act, 2019 (CPA 2019):
 * - Score: 0 - 100 bounded
 * - 4 Independent Capped Pillars:
 *   1. Proof of Purchase / Contract (max 30 pts)
 *   2. Proof of Consideration (max 20 pts)
 *   3. Proof of Defect / Delay / Deficiency (max 30 pts)
 *   4. Written Notice / Prior Communication (max 20 pts)
 * - Thresholds: 0-39 WEAK, 40-69 MODERATE, 70-100 STRONG
 * - Invariant: STRONG does not imply zero missing proofs
 * - Zero reliance on filenames or free-text descriptions (uses document_type exclusively)
 */

const PILLAR_LIMITS = {
  proof_of_purchase: 30,
  proof_of_payment: 20,
  proof_of_defect_or_deficiency: 30,
  written_communication: 20,
};

const DISCLAIMER =
  'The evidence coverage score reflects the completeness of user-provided documentation across key evidentiary pillars. ' +
  'It measures procedural completeness and document coverage; it does not verify document authenticity, guarantee claim validity, ' +
  'or predict the judicial outcome before any Consumer Disputes Redressal Commission.';

/**
 * Evaluates evidence coverage for a case.
 *
 * @param {object} params
 * @param {object} params.caseRecord - Case details (issue_category, claimed_amount, user_narrative)
 * @param {Array<object>} params.documents - Attached case documents with document_type
 * @returns {object} Full evaluation breakdown
 */
function evaluateCaseEvidence({ caseRecord, documents = [] }) {
  const category = (caseRecord?.issue_category || 'GENERAL').trim();

  // 1. Group documents by document_type
  const docTypesPresent = new Set();
  const providedProofs = [];

  for (const doc of documents) {
    const type = doc.document_type || 'OTHER';
    docTypesPresent.add(type);

    let pillar = null;
    if (type === 'TAX_INVOICE' || type === 'ORDER_CONFIRMATION' || type === 'WARRANTY_DOCUMENT') {
      pillar = 'proof_of_purchase';
    } else if (type === 'PAYMENT_RECEIPT') {
      pillar = 'proof_of_payment';
    } else if (
      type === 'DEFECT_EVIDENCE' ||
      type === 'JOB_SHEET_OR_REPORT' ||
      type === 'DELIVERY_PROOF' ||
      type === 'ADVERTISEMENT_OR_OFFER'
    ) {
      pillar = 'proof_of_defect_or_deficiency';
    } else if (type === 'COMMUNICATION_RECORD') {
      pillar = 'written_communication';
    } else {
      pillar = 'supplementary';
    }

    providedProofs.push({
      document_id: String(doc.id),
      document_type: type,
      original_filename: doc.original_filename,
      pillar,
      note:
        type === 'OTHER'
          ? 'Supplementary document on file; does not satisfy a primary statutory evidentiary pillar under CPA 2019.'
          : undefined,
    });
  }

  // --- PILLAR 1: Proof of Purchase / Contract (Max 30) ---
  let p1Raw = 0;
  const hasInvoice = docTypesPresent.has('TAX_INVOICE');
  const hasOrderConfirmation = docTypesPresent.has('ORDER_CONFIRMATION');
  const hasWarranty = docTypesPresent.has('WARRANTY_DOCUMENT');

  if (hasInvoice) {
    p1Raw = 30;
  } else if (hasOrderConfirmation) {
    // Services (agreements/vouchers) earn 25 base, Goods order confirmations earn 20 base
    const basePoints = category === 'DEFICIENCY_IN_SERVICE' ? 25 : 20;
    // Warranty document bonus (+10 pts) applies ONLY when supported by order confirmation
    const warrantyBonus = hasWarranty ? 10 : 0;
    p1Raw = basePoints + warrantyBonus;
  } else {
    // Standalone warranty without transaction document earns 0 points
    p1Raw = 0;
  }
  const p1Score = Math.min(PILLAR_LIMITS.proof_of_purchase, p1Raw);

  // --- PILLAR 2: Proof of Consideration / Payment (Max 20) ---
  let p2Raw = 0;
  if (docTypesPresent.has('PAYMENT_RECEIPT')) {
    p2Raw = 20;
  }
  const p2Score = Math.min(PILLAR_LIMITS.proof_of_payment, p2Raw);

  // --- PILLAR 3: Proof of Defect / Delay / Deficiency / Unfair Trade Practice (Max 30) ---
  let p3Raw = 0;
  if (category === 'DEFECTIVE_PRODUCT') {
    if (docTypesPresent.has('JOB_SHEET_OR_REPORT')) p3Raw += 25;
    if (docTypesPresent.has('DEFECT_EVIDENCE')) p3Raw += 15;
  } else if (category === 'DELAYED_DELIVERY') {
    if (docTypesPresent.has('DELIVERY_PROOF')) p3Raw += 30;
  } else if (category === 'DEFICIENCY_IN_SERVICE') {
    if (docTypesPresent.has('JOB_SHEET_OR_REPORT')) p3Raw += 20;
    if (docTypesPresent.has('DEFECT_EVIDENCE')) p3Raw += 15;
    if (docTypesPresent.has('DELIVERY_PROOF')) p3Raw += 15;
  } else if (category === 'UNFAIR_TRADE_PRACTICE') {
    if (docTypesPresent.has('ADVERTISEMENT_OR_OFFER')) p3Raw += 30;
    if (docTypesPresent.has('DEFECT_EVIDENCE')) p3Raw += 15;
  } else {
    // GENERAL
    if (
      docTypesPresent.has('DEFECT_EVIDENCE') ||
      docTypesPresent.has('JOB_SHEET_OR_REPORT') ||
      docTypesPresent.has('DELIVERY_PROOF') ||
      docTypesPresent.has('ADVERTISEMENT_OR_OFFER')
    ) {
      p3Raw += 30;
    }
  }
  const p3Score = Math.min(PILLAR_LIMITS.proof_of_defect_or_deficiency, p3Raw);

  // --- PILLAR 4: Written Notice / Prior Communication (Max 20) ---
  let p4Raw = 0;
  if (docTypesPresent.has('COMMUNICATION_RECORD')) {
    p4Raw = 20;
  }
  const p4Score = Math.min(PILLAR_LIMITS.written_communication, p4Raw);

  // --- Total Composite Coverage Score (0 - 100) ---
  const totalScore = p1Score + p2Score + p3Score + p4Score;

  // --- Inclusive Strength Level Thresholds ---
  let coverageLevel = 'WEAK';
  if (totalScore >= 70) {
    coverageLevel = 'STRONG';
  } else if (totalScore >= 40) {
    coverageLevel = 'MODERATE';
  } else {
    coverageLevel = 'WEAK';
  }

  // --- Category-Aware Missing Proofs Generation ---
  // Every applicable pillar must be accounted for so zero pillars are not silent
  const missingProofs = [];

  // Pillar 1 Missing Check
  if (!hasInvoice && !hasOrderConfirmation) {
    if (category === 'DEFICIENCY_IN_SERVICE') {
      missingProofs.push({
        proof_type: 'ORDER_CONFIRMATION',
        pillar: 'proof_of_purchase',
        title: 'Service Agreement, Booking Voucher, or Subscription Contract',
        priority: 'CRITICAL',
        legal_context: 'Establishes the contracted scope of service and consumer rights under Section 2(42) of CPA 2019.',
      });
    } else {
      missingProofs.push({
        proof_type: 'TAX_INVOICE',
        pillar: 'proof_of_purchase',
        title: 'Tax Invoice or Retail Bill',
        priority: 'CRITICAL',
        legal_context: 'Establishes consumer standing and proof of purchase under Section 2(7) of CPA 2019.',
      });
    }
  }

  // Pillar 2 Missing Check (Always relevant for consideration proof)
  if (!docTypesPresent.has('PAYMENT_RECEIPT')) {
    missingProofs.push({
      proof_type: 'PAYMENT_RECEIPT',
      pillar: 'proof_of_payment',
      title: 'Payment Confirmation or Bank Receipt',
      priority: 'HIGH',
      legal_context: 'Demonstrates that consideration was paid as required by the statutory definition of a consumer.',
    });
  }

  // Pillar 3 Missing Check (Category-tailored)
  if (category === 'DEFECTIVE_PRODUCT') {
    if (!docTypesPresent.has('DEFECT_EVIDENCE')) {
      missingProofs.push({
        proof_type: 'DEFECT_EVIDENCE',
        pillar: 'proof_of_defect_or_deficiency',
        title: 'Photographs of Product Defect / Damage',
        priority: 'CRITICAL',
        legal_context: 'Substantiates visual proof of product fault or defect under Section 2(10) of CPA 2019.',
      });
    }
    if (!docTypesPresent.has('JOB_SHEET_OR_REPORT')) {
      missingProofs.push({
        proof_type: 'JOB_SHEET_OR_REPORT',
        pillar: 'proof_of_defect_or_deficiency',
        title: 'Authorized Service Center Inspection Report / Job Sheet',
        priority: 'HIGH',
        legal_context: 'Independent technical corroboration proving defect was not caused by user mishandling.',
      });
    }
  } else if (category === 'DELAYED_DELIVERY') {
    if (!docTypesPresent.has('DELIVERY_PROOF')) {
      missingProofs.push({
        proof_type: 'DELIVERY_PROOF',
        pillar: 'proof_of_defect_or_deficiency',
        title: 'Courier Tracking Log / Non-Delivery Proof',
        priority: 'CRITICAL',
        legal_context: 'Proves failure of merchant to deliver goods within the committed delivery timeline.',
      });
    }
  } else if (category === 'DEFICIENCY_IN_SERVICE') {
    if (!docTypesPresent.has('DEFECT_EVIDENCE') && !docTypesPresent.has('JOB_SHEET_OR_REPORT')) {
      missingProofs.push({
        proof_type: 'DEFECT_EVIDENCE',
        pillar: 'proof_of_defect_or_deficiency',
        title: 'Proof of Service Interruption, Error Log, or Workmanship Failure',
        priority: 'CRITICAL',
        legal_context: 'Substantiates deficiency in service execution under Section 2(11) of CPA 2019.',
      });
    }
  } else if (category === 'UNFAIR_TRADE_PRACTICE') {
    if (!docTypesPresent.has('ADVERTISEMENT_OR_OFFER')) {
      missingProofs.push({
        proof_type: 'ADVERTISEMENT_OR_OFFER',
        pillar: 'proof_of_defect_or_deficiency',
        title: 'Promotional Offer Banner, Advertised Price, or MRP Sticker Screenshot',
        priority: 'CRITICAL',
        legal_context: 'Substantiates misleading advertisement or deceptive pricing under Section 2(47) of CPA 2019.',
      });
    }
  } else {
    // GENERAL
    if (
      !docTypesPresent.has('DEFECT_EVIDENCE') &&
      !docTypesPresent.has('JOB_SHEET_OR_REPORT') &&
      !docTypesPresent.has('DELIVERY_PROOF') &&
      !docTypesPresent.has('ADVERTISEMENT_OR_OFFER')
    ) {
      missingProofs.push({
        proof_type: 'DEFECT_EVIDENCE',
        pillar: 'proof_of_defect_or_deficiency',
        title: 'Corroborating Evidence of Dispute',
        priority: 'CRITICAL',
        legal_context: 'Substantiates the core grievance described in the consumer dispute.',
      });
    }
  }

  // Pillar 4 Missing Check
  if (!docTypesPresent.has('COMMUNICATION_RECORD')) {
    missingProofs.push({
      proof_type: 'COMMUNICATION_RECORD',
      pillar: 'written_communication',
      title: 'Written Notice / Grievance Email to Seller',
      priority: 'HIGH',
      legal_context: 'Proves reasonable pre-litigation opportunity was granted to merchant to rectify the grievance.',
    });
  }

  // --- Recommendations Generation ---
  const recommendations = [];
  for (const missing of missingProofs) {
    if (missing.proof_type === 'TAX_INVOICE') {
      recommendations.push({
        priority: missing.priority,
        action: 'Download or retrieve the official tax invoice / cash memo showing GSTIN and transaction date.',
      });
    } else if (missing.proof_type === 'ORDER_CONFIRMATION') {
      recommendations.push({
        priority: missing.priority,
        action: 'Retrieve and upload the signed service contract, booking voucher, or subscription confirmation.',
      });
    } else if (missing.proof_type === 'PAYMENT_RECEIPT') {
      recommendations.push({
        priority: missing.priority,
        action: 'Download bank statement or UPI transaction receipt showing payment to the merchant.',
      });
    } else if (missing.proof_type === 'DEFECT_EVIDENCE') {
      recommendations.push({
        priority: missing.priority,
        action: 'Capture clear photographs (PNG/JPG) of the defect, serial number, and physical damage.',
      });
    } else if (missing.proof_type === 'JOB_SHEET_OR_REPORT') {
      recommendations.push({
        priority: missing.priority,
        action: 'Obtain an official Inspection Job Sheet from the authorized service center detailing technician findings.',
      });
    } else if (missing.proof_type === 'DELIVERY_PROOF') {
      recommendations.push({
        priority: missing.priority,
        action: 'Take a screenshot of the courier tracking status showing delay beyond the committed SLA date.',
      });
    } else if (missing.proof_type === 'ADVERTISEMENT_OR_OFFER') {
      recommendations.push({
        priority: missing.priority,
        action: 'Save copies or screenshots of the promotional flyer, offer terms, or advertised pricing.',
      });
    } else if (missing.proof_type === 'COMMUNICATION_RECORD') {
      recommendations.push({
        priority: missing.priority,
        action: 'Send a formal written notice or email to the merchant granting 7-15 days for resolution before filing.',
      });
    }
  }

  return {
    evidence_coverage_score: totalScore,
    coverage_level: coverageLevel,
    pillar_breakdown: {
      proof_of_purchase: { score: p1Score, max: PILLAR_LIMITS.proof_of_purchase },
      proof_of_payment: { score: p2Score, max: PILLAR_LIMITS.proof_of_payment },
      proof_of_defect_or_deficiency: { score: p3Score, max: PILLAR_LIMITS.proof_of_defect_or_deficiency },
      written_communication: { score: p4Score, max: PILLAR_LIMITS.written_communication },
    },
    provided_proofs: providedProofs,
    missing_proofs: missingProofs,
    recommendations,
    disclaimer: DISCLAIMER,
  };
}

module.exports = {
  PILLAR_LIMITS,
  DISCLAIMER,
  evaluateCaseEvidence,
};
