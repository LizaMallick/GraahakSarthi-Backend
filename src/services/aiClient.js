require('dotenv').config();
const axios = require('axios');

const AI_SERVICE_BASE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const AI_SERVICE_TIMEOUT = parseInt(process.env.AI_SERVICE_TIMEOUT_MS, 10) || 30000;

// Pre-configured Axios instance for Anubhav's Python FastAPI AI Microservice
const apiClient = axios.create({
  baseURL: AI_SERVICE_BASE_URL,
  timeout: AI_SERVICE_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

/**
 * Check connectivity to the external Python FastAPI AI service.
 *
 * @returns {Promise<{ isHealthy: boolean, status: number|string, message: string }>}
 */
async function checkHealth() {
  try {
    const response = await apiClient.get('/health', { timeout: 5000 });
    return {
      isHealthy: true,
      status: response.status,
      message: 'AI microservice is reachable and healthy',
    };
  } catch (error) {
    return {
      isHealthy: false,
      status: error.code || (error.response ? error.response.status : 'UNREACHABLE'),
      message: `AI service unreachable at ${AI_SERVICE_BASE_URL}: ${error.message}`,
    };
  }
}

/**
 * Send case facts and document metadata to Anubhav's AI service for RAG & legal analysis.
 *
 * @param {object} payload
 * @param {number|string} payload.caseId - Case reference ID
 * @param {string} payload.userNarrative - Consumer dispute description
 * @param {Array<string>} [payload.extractedDocuments=[]] - Document names or OCR summaries
 * @returns {Promise<object>} AI intelligence output
 */
async function analyzeCase({ caseId, userNarrative, extractedDocuments = [] }) {
  try {
    const response = await apiClient.post('/ai/v1/analyze-case', {
      case_id: caseId,
      user_narrative: userNarrative,
      extracted_documents: extractedDocuments,
    });
    return response.data;
  } catch (error) {
    console.error(`[AI Client Error] Failed to call /ai/v1/analyze-case: ${error.message}`);

    // If microservice is offline or timing out, return structured fallback without crashing the backend
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return {
        status: 'OFFLINE_FALLBACK',
        message: 'AI microservice is currently unreachable. Fallback analysis generated.',
        issue_category: 'GENERAL_CONSUMER_DISPUTE',
        timeline: [
          {
            date: new Date().toISOString().split('T')[0],
            event: 'Case intake recorded in system',
            verification_status: 'PENDING_AI_VERIFICATION',
          },
        ],
        missing_proof: [
          'Purchase Tax Invoice / Bill',
          'Payment Confirmation / Bank Receipt',
          'Written Communication / Notice to Opposite Party',
        ],
        rag_citations: [
          {
            act: 'Consumer Protection Act, 2019',
            section: 'Section 2(7)',
            explanation: 'General consumer rights and defect definitions under CPA 2019.',
          },
        ],
      };
    }

    throw error;
  }
}

module.exports = {
  apiClient,
  checkHealth,
  analyzeCase,
};
