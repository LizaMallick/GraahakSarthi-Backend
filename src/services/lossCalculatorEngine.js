/**
 * Deterministic Consumer Loss Calculator Engine
 *
 * Implements transparent, decimal-safe arithmetic for consumer monetary loss:
 * - Uses exact integer paise arithmetic (BigInt/integer cents) to eliminate floating-point drift.
 * - Separates documented direct financial losses from optional simple interest estimates.
 * - Does not estimate mental agony, punitive damages, or litigation costs.
 * - Provides clear calculation notes emphasizing user-reported expenses.
 */

const DISCLAIMER =
  'The Consumer Loss Calculator provides an arithmetic calculation of user-reported financial outlays ' +
  'under the Consumer Protection Act, 2019. It strictly separates direct documented monetary loss from discretionary ' +
  'interest estimates. It does not determine judicial entitlement, award mental agony or punitive damages, or guarantee ' +
  'adjudication outcomes before Consumer Disputes Redressal Commissions.';

/**
 * Parses any monetary value (number or string) directly into integer paise without floating-point drift.
 * E.g., "62000.50" -> 6200050n, 1500 -> 150000n.
 *
 * @param {number|string} val
 * @returns {bigint} Paise representation
 */
function parseToPaise(val) {
  if (val === undefined || val === null || val === '') {
    return 0n;
  }
  const str = String(val).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    const num = Number(str);
    if (!Number.isFinite(num) || num < 0) return 0n;
    // Fallback for exponential or other numeric inputs
    const fixed = num.toFixed(2);
    const [intPart, decPart = '00'] = fixed.split('.');
    return BigInt(intPart) * 100n + BigInt(decPart.padEnd(2, '0').slice(0, 2));
  }

  const [intPart, decPart = ''] = str.split('.');
  const normalizedDec = (decPart + '00').slice(0, 2);
  return BigInt(intPart) * 100n + BigInt(normalizedDec);
}

/**
 * Converts BigInt paise back to a decimal number with exactly 2 decimal places.
 *
 * @param {bigint} paise
 * @returns {number}
 */
function paiseToNumber(paise) {
  const isNegative = paise < 0n;
  const absPaise = isNegative ? -paise : paise;
  const intPart = absPaise / 100n;
  const decPart = absPaise % 100n;
  const str = `${isNegative ? '-' : ''}${intPart.toString()}.${decPart.toString().padStart(2, '0')}`;
  return parseFloat(str);
}

/**
 * Formats BigInt paise to a fixed 2-decimal string.
 *
 * @param {bigint} paise
 * @returns {string} E.g. "62000.50"
 */
function formatPaiseToString(paise) {
  const isNegative = paise < 0n;
  const absPaise = isNegative ? -paise : paise;
  const intPart = absPaise / 100n;
  const decPart = absPaise % 100n;
  return `${isNegative ? '-' : ''}${intPart.toString()}.${decPart.toString().padStart(2, '0')}`;
}

/**
 * Calculates consumer financial loss based on itemized user-reported expenses and optional simple interest.
 *
 * @param {object} params
 * @param {number|string} [params.purchaseAmount] - Documented purchase price (or fallback from case.claimed_amount)
 * @param {number|string} [params.deliveryInstallationCharges=0] - Shipping/installation costs
 * @param {number|string} [params.repairReplacementExpenses=0] - Repair or replacement bills
 * @param {number|string} [params.travelCommunicationExpenses=0] - Travel/postage/phone costs
 * @param {number|string} [params.otherDocumentedExpenses=0] - Miscellaneous direct expenses
 * @param {number|string} [params.refundsReceived=0] - Partial reimbursements received
 * @param {object} [params.interest] - Optional interest parameters
 * @param {number} [params.interest.annualRate] - Annual rate in percent (e.g. 9.0 for 9% p.a., max 36.0)
 * @param {string|Date} [params.interest.startDate] - Start date of dispute/notice
 * @param {string|Date} [params.interest.endDate] - End date (defaults to current date)
 * @param {boolean} [params.isFallbackUsed=false] - Whether purchaseAmount was defaulted from case claimed_amount
 * @returns {object} Formatted calculation result
 */
function calculateConsumerLoss({
  purchaseAmount = 0,
  deliveryInstallationCharges = 0,
  repairReplacementExpenses = 0,
  travelCommunicationExpenses = 0,
  otherDocumentedExpenses = 0,
  refundsReceived = 0,
  interest = null,
  isFallbackUsed = false,
}) {
  const purchasePaise = parseToPaise(purchaseAmount);
  const deliveryPaise = parseToPaise(deliveryInstallationCharges);
  const repairPaise = parseToPaise(repairReplacementExpenses);
  const travelPaise = parseToPaise(travelCommunicationExpenses);
  const otherPaise = parseToPaise(otherDocumentedExpenses);
  const refundsPaise = parseToPaise(refundsReceived);

  // 1. Gross documented loss
  const grossPaise = purchasePaise + deliveryPaise + repairPaise + travelPaise + otherPaise;

  // 2. Net documented monetary loss (floored at 0)
  const netPaise = grossPaise > refundsPaise ? grossPaise - refundsPaise : 0n;

  // 3. Optional Simple Interest Calculation
  let interestApplied = false;
  let interestDays = 0;
  let annualRateNum = null;
  let startDateStr = null;
  let endDateStr = null;
  let interestPaise = 0n;

  if (interest && (interest.annual_rate !== undefined || interest.annualRate !== undefined)) {
    const rawRate = interest.annual_rate !== undefined ? interest.annual_rate : interest.annualRate;
    const rate = Number(rawRate);
    if (Number.isFinite(rate) && rate > 0 && rate <= 36) {
      annualRateNum = rate;
      const rawStart = interest.start_date || interest.startDate;
      const rawEnd = interest.end_date || interest.endDate;

      const start = rawStart ? new Date(rawStart) : null;
      const end = rawEnd ? new Date(rawEnd) : new Date();

      if (start && !isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
        interestApplied = true;
        startDateStr = start.toISOString().split('T')[0];
        endDateStr = end.toISOString().split('T')[0];

        const diffMs = end.getTime() - start.getTime();
        interestDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

        if (interestDays > 0 && netPaise > 0n) {
          // Interest = Net * (Rate / 100) * (Days / 365)
          // Scaled integer arithmetic with rounded paise:
          // Rate * 100 to handle up to 2 decimal places in rate (e.g. 9.5% -> 950)
          const rateBasisPoints = BigInt(Math.round(rate * 100)); // 1% = 100 basis points
          // Formula: (netPaise * rateBasisPoints * BigInt(interestDays) + 1825000n) / 3650000n
          // (365 * 10000 = 3650000; adding half divisor for round-half-up)
          const divisor = 3650000n;
          const numerator = netPaise * rateBasisPoints * BigInt(interestDays);
          interestPaise = (numerator + divisor / 2n) / divisor;
        }
      }
    }
  }

  const totalPaise = netPaise + interestPaise;

  // 4. Generate transparent calculation notes
  const notes = [];
  if (isFallbackUsed) {
    notes.push('Purchase amount was not explicitly provided; defaulted to the original case claimed amount.');
  }
  notes.push(
    `Gross user-reported expenses: ₹${formatPaiseToString(grossPaise)} ` +
    `(Purchase: ₹${formatPaiseToString(purchasePaise)}, Delivery: ₹${formatPaiseToString(deliveryPaise)}, ` +
    `Repair: ₹${formatPaiseToString(repairPaise)}, Travel/Comm: ₹${formatPaiseToString(travelPaise)}, ` +
    `Other: ₹${formatPaiseToString(otherPaise)}).`
  );

  if (refundsPaise > 0n) {
    notes.push(
      `Deducted refunds already received: ₹${formatPaiseToString(refundsPaise)}, yielding net monetary loss: ₹${formatPaiseToString(netPaise)}.`
    );
  } else {
    notes.push(`No prior refunds reported; net monetary loss is ₹${formatPaiseToString(netPaise)}.`);
  }

  if (interestApplied) {
    notes.push(
      `Estimated simple interest: ₹${formatPaiseToString(interestPaise)} calculated over ${interestDays} days ` +
      `at ${annualRateNum.toFixed(2)}% p.a. (from ${startDateStr} to ${endDateStr}).`
    );
  }

  return {
    itemized_breakdown: {
      purchase_amount: paiseToNumber(purchasePaise),
      delivery_installation_charges: paiseToNumber(deliveryPaise),
      repair_replacement_expenses: paiseToNumber(repairPaise),
      travel_communication_expenses: paiseToNumber(travelPaise),
      other_documented_expenses: paiseToNumber(otherPaise),
    },
    gross_loss: paiseToNumber(grossPaise),
    refunds_received: paiseToNumber(refundsPaise),
    net_loss: paiseToNumber(netPaise),
    interest_estimate: {
      applied: interestApplied,
      annual_rate: annualRateNum,
      start_date: startDateStr,
      end_date: endDateStr,
      days: interestDays,
      estimated_interest: paiseToNumber(interestPaise),
    },
    total_estimated_claim: paiseToNumber(totalPaise),
    calculation_explanation: notes.join(' '),
    disclaimer: DISCLAIMER,
  };
}

module.exports = {
  calculateConsumerLoss,
  parseToPaise,
  paiseToNumber,
  formatPaiseToString,
  DISCLAIMER,
};
