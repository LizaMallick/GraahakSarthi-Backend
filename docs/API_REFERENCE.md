# GraahakSarthi Backend API Reference Manual

Welcome to the GraahakSarthi Backend API Reference. This documentation covers all 20 currently implemented REST endpoints across Case Management, Document Management, Evidence Strength Evaluation, Case Timeline Builder, and Consumer Loss Calculator.

---

## 1. Getting Started & Integration Guide

### 1.1 Base URL & Default Port
- **Default Server Port:** `5000` (configurable via `PORT` environment variable).
- **Default Local Base URL:** `http://localhost:5000`
- **API Prefix:** `/api`
- **Full Base Path:** `http://localhost:5000/api`

### 1.2 CORS Configuration
The server has CORS enabled across all routes (`server.js`).
- Default allowed origins: `*` (any origin permitted in development).
- Override with `CORS_ORIGIN` in your environment (e.g., `http://localhost:3000` or `http://localhost:5173`).

### 1.3 Local Backend Setup & Environment Variables
To start the backend locally:

1. Clone or navigate to the repository:
   ```bash
   cd D:\GraahakSarthi-Backend
   npm install
   ```
2. Create or verify your `.env` file in the root directory:
   ```env
   # Server Configuration
   PORT=5000
   NODE_ENV=development
   CORS_ORIGIN=*

   # MySQL Database Configuration
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_mysql_password_here
   DB_NAME=graahak_ai
   DB_CONNECTION_LIMIT=10

   # File Upload Directory
   UPLOAD_DIR=uploads
   ```
3. Initialize the database schema:
   ```bash
   npm run db:init
   ```
4. Start the server in watch/development mode:
   ```bash
   npm run dev
   # or: npm start
   ```

### 1.4 Frontend Request Guidelines
- **JSON Endpoints:** Set header `Content-Type: application/json`.
- **File Upload Endpoint (`POST /api/cases/:id/documents`):**
  - Use `multipart/form-data`.
  - When using `fetch()` or `axios`, pass a `FormData` instance as the request body. **Do not** manually set the `Content-Type` header (let the browser calculate the multi-part boundary automatically).
- **Standardized Response Envelopes:**
  - **Success:**
    ```json
    {
      "success": true,
      "message": "Human readable summary",
      "data": { ... } | [ ... ],
      "meta": { ... } // Optional (e.g. pagination)
    }
    ```
  - **Error:**
    ```json
    {
      "success": false,
      "message": "Error description",
      "error": "ERROR_CODE or details",
      "errors": [ "Field-level validation error 1", ... ] // Optional array
    }
    ```

---

## 2. API Endpoints Directory (20 Total)

| Category | Method | Endpoint Path | Description |
|---|---|---|---|
| **Health** | `GET` | `/api/health` | Service uptime and diagnostic check |
| **Case Management** | `POST` | `/api/cases` | Register a new consumer case |
| | `GET` | `/api/cases` | List paginated consumer cases (with filters) |
| | `GET` | `/api/cases/:id` | Retrieve single case details |
| | `PATCH` | `/api/cases/:id` | Update case fields and status |
| | `DELETE` | `/api/cases/:id` | Delete case and all associated documents |
| **Document Management** | `POST` | `/api/cases/:id/documents` | Upload and attach case evidence file |
| | `GET` | `/api/cases/:id/documents` | List attached documents for a case |
| | `GET` | `/api/cases/:id/documents/:docId/file` | Stream document binary for preview or download |
| | `PATCH` | `/api/cases/:id/documents/:docId` | Update document metadata (type, description) |
| | `DELETE` | `/api/cases/:id/documents/:docId` | Delete attached document and unlink file |
| **Evidence Evaluation** | `POST` | `/api/cases/:id/evidence/evaluate` | Evaluate 4 evidentiary pillars & save snapshot |
| | `GET` | `/api/cases/:id/evidence` | Get latest evaluation snapshot or baseline |
| **Case Timeline** | `GET` | `/api/cases/:id/timeline` | Retrieve chronological timeline events |
| | `POST` | `/api/cases/:id/timeline` | Add a manual timeline event |
| | `PATCH` | `/api/cases/:id/timeline/:eventId` | Update a manual timeline event |
| | `DELETE` | `/api/cases/:id/timeline/:eventId` | Delete a manual timeline event |
| **Loss Calculator** | `POST` | `/api/cases/:id/loss/calculate` | Calculate documented loss & interest estimate |
| | `GET` | `/api/cases/:id/loss` | Get latest loss assessment or dynamic baseline |
| | `GET` | `/api/cases/:id/loss/history` | Get reverse-chronological calculation history |

---

## 3. Health Endpoint

### `GET /api/health`
Checks whether the backend process is running and reports uptime.

- **Path Parameters:** None
- **Query Parameters:** None
- **Request Body:** None
- **Success Response (`200 OK`):**
  ```json
  {
    "status": "OK",
    "service": "Graahak AI Backend",
    "timestamp": "2026-11-14T12:00:00.000Z",
    "uptime": 128.45
  }
  ```
- **Possible Errors:** None (`500` if server process crashes).

---

## 4. Case Management APIs

### 4.1 `POST /api/cases`
Creates a new consumer complaint record and atomically records a `SYSTEM_MILESTONE` timeline event.

- **Request Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "title": "Defective Laptop Motherboard",
    "issue_category": "DEFECTIVE_PRODUCT",
    "merchant_name": "ComputeDirect Online India",
    "claimed_amount": 62000.00,
    "user_narrative": "Laptop shut down completely after 3 days. Service center refuses repair."
  }
  ```
  - `title` *(string, required, 1-255 chars)*
  - `issue_category` *(string, required)*. Allowed values:
    - `DEFECTIVE_PRODUCT`
    - `DELAYED_DELIVERY`
    - `DEFICIENCY_IN_SERVICE`
    - `UNFAIR_TRADE_PRACTICE`
    - `GENERAL`
  - `merchant_name` *(string, optional, max 255 chars)*
  - `claimed_amount` *(number, required, >= 0, <= 9999999999.99)*
  - `user_narrative` *(string, required, non-empty)*
- **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Case created successfully.",
    "data": {
      "id": "1",
      "title": "Defective Laptop Motherboard",
      "issue_category": "DEFECTIVE_PRODUCT",
      "merchant_name": "ComputeDirect Online India",
      "claimed_amount": "62000.00",
      "user_narrative": "Laptop shut down completely after 3 days. Service center refuses repair.",
      "status": "PENDING",
      "created_at": "2026-11-14T12:00:00.000Z",
      "updated_at": "2026-11-14T12:00:00.000Z"
    }
  }
  ```
- **Possible Errors:**
  - `400 Bad Request`: Validation failure on missing fields, negative amount, or invalid category.

---

### 4.2 `GET /api/cases`
Retrieves a paginated list of cases with optional status and category filtering.

- **Query Parameters:**
  - `page` *(integer, optional, default: 1)*
  - `limit` *(integer, optional, default: 10, max: 100)*
  - `status` *(string, optional)*: `PENDING`, `ANALYZING`, `ANALYZED`, `RESOLVED`, `CLOSED`
  - `issue_category` *(string, optional)*: One of the 5 allowed categories
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Cases retrieved successfully.",
    "data": [
      {
        "id": "1",
        "title": "Defective Laptop Motherboard",
        "issue_category": "DEFECTIVE_PRODUCT",
        "merchant_name": "ComputeDirect Online India",
        "claimed_amount": "62000.00",
        "status": "PENDING",
        "created_at": "2026-11-14T12:00:00.000Z"
      }
    ],
    "meta": {
      "total": 1,
      "page": 1,
      "limit": 10,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
  ```
- **Possible Errors:**
  - `400 Bad Request`: Invalid page/limit, invalid status, or invalid category.

---

### 4.3 `GET /api/cases/:id`
Retrieves single case details by primary ID.

- **Path Parameters:**
  - `id` *(integer, required)*: Case primary key
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Case retrieved successfully.",
    "data": {
      "id": "1",
      "title": "Defective Laptop Motherboard",
      "issue_category": "DEFECTIVE_PRODUCT",
      "merchant_name": "ComputeDirect Online India",
      "claimed_amount": "62000.00",
      "user_narrative": "Laptop shut down completely after 3 days.",
      "status": "PENDING",
      "created_at": "2026-11-14T12:00:00.000Z",
      "updated_at": "2026-11-14T12:00:00.000Z"
    }
  }
  ```
- **Possible Errors:**
  - `400 Bad Request`: Invalid case ID format.
  - `404 Not Found`: Case does not exist.

---

### 4.4 `PATCH /api/cases/:id`
Updates mutable fields of an existing case.

- **Path Parameters:**
  - `id` *(integer, required)*
- **Request Body (at least one field required):**
  ```json
  {
    "status": "ANALYZING",
    "merchant_name": "Updated Merchant Pvt Ltd",
    "claimed_amount": 65000.00
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Case updated successfully.",
    "data": {
      "id": "1",
      "title": "Defective Laptop Motherboard",
      "status": "ANALYZING",
      "merchant_name": "Updated Merchant Pvt Ltd",
      "claimed_amount": "65000.00",
      "updated_at": "2026-11-14T12:05:00.000Z"
    }
  }
  ```
- **Possible Errors:**
  - `400 Bad Request`: No valid update fields provided, invalid status, or negative amount.
  - `404 Not Found`: Case not found.

---

### 4.5 `DELETE /api/cases/:id`
Permanently deletes a case and all associated child records. Commits the database transaction before unlinking physical files. Any physical files that cannot be unlinked are logged server-side as orphaned paths but do not cause the request to fail.

- **Path Parameters:**
  - `id` *(integer, required)*: Case primary key
- **Request Body:** None
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Case and all associated documents deleted successfully.",
    "data": {
      "deleted": true,
      "id": "1",
      "files_unlinked": 3
    }
  }
  ```
  - `deleted` — always `true` on success.
  - `id` — the deleted case ID as a string.
  - `files_unlinked` — count of physical files successfully removed from `uploads/`.
  - `orphaned_files` *(array, present only if unlink errors occurred)* — list of file paths that could not be removed. Omitted when all files are cleaned up.
- **Cascade Behaviour:** Deleting a case removes all child rows from `case_documents`, `evidence_evaluations`, `case_timeline_events`, and `case_loss_calculations` via MySQL foreign-key `ON DELETE CASCADE`. Physical files are unlinked after the database commit.
- **Path Containment:** Each file path is verified lexically and canonically (symlink-resolved) to be strictly inside the configured `uploads/` directory before deletion. Paths that traverse outside this directory are silently skipped with a server-side warning.
- **Possible Errors:**
  - `400 Bad Request`: Invalid case ID format.
  - `404 Not Found`: Case does not exist.

---

## 5. Document Management APIs

### 5.1 Document Upload Specification
- **Allowed MIME Types:**
  - PDF: `application/pdf`
  - PNG: `image/png`
  - JPEG/JPG: `image/jpeg`, `image/jpg`
  - WebP: `image/webp`
- **File Size Limit:** Maximum **10 MB** (enforced by Multer middleware).
- **File Signature Validation (Magic Number Check):** Every uploaded file is validated against its true binary content signature — not merely its extension or declared MIME type. The first 16 bytes of the stored file are read after upload and checked against the following magic numbers:
  - `%PDF-` (`0x25 0x50 0x44 0x46 0x2D`) — PDF
  - `0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A` — PNG
  - `0xFF 0xD8 0xFF` — JPEG/JPG
  - `RIFF....WEBP` (`0x52 0x49 0x46 0x46` at bytes 0–3 and `0x57 0x45 0x42 0x50` at bytes 8–11) — WebP
  - Files whose content does not match any recognized signature are rejected with `400 Bad Request` and the already-uploaded physical file is immediately unlinked from disk.
- **Recognized `document_type` Classifications:**
  - `TAX_INVOICE` — Tax or retail GST purchase invoice
  - `ORDER_CONFIRMATION` — Order booking or agreement confirmation
  - `PAYMENT_RECEIPT` — Bank statement, card slip, or UPI payment proof
  - `DEFECT_EVIDENCE` — Photograph or video screenshot of defect
  - `JOB_SHEET_OR_REPORT` — Authorized technician service inspection report
  - `DELIVERY_PROOF` — Courier docket, delivery challan, or unboxing record
  - `COMMUNICATION_RECORD` — Grievance email, legal notice, WhatsApp chat log
  - `ADVERTISEMENT_OR_OFFER` — Promotional flyer or misleading advertisement
  - `WARRANTY_DOCUMENT` — Warranty card or terms booklet
  - `OTHER` — Supplementary document (default)

---

### 5.2 `POST /api/cases/:id/documents`
Uploads a document file, saves it to `uploads/`, records metadata in `case_documents`, and atomically triggers a `DOCUMENT_UPLOAD` timeline event.

- **Path Parameters:** `id` *(integer, required)*
- **Content-Type:** `multipart/form-data`
- **Form Fields:**
  - `file` *(binary file, required)*: PDF, PNG, JPG/JPEG, or WebP up to 10MB
  - `document_type` *(string, required)*: One of the 10 allowed types listed above
  - `description` *(string, optional, max 255 chars)*: User notes on document
- **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Document uploaded and attached successfully.",
    "data": {
      "id": "1",
      "case_id": "1",
      "original_filename": "laptop_tax_invoice.pdf",
      "stored_filename": "evidence-1794612046172-136793086.pdf",
      "mime_type": "application/pdf",
      "document_type": "TAX_INVOICE",
      "description": "Retail GST invoice",
      "file_size": 1048576,
      "created_at": "2026-11-14T12:00:00.000Z"
    }
  }
  ```
  *(Note: Internal filesystem `file_path` is strictly omitted from the API response for privacy).*
- **Possible Errors:**
  - `400 Bad Request`: Missing file, file exceeds 10MB (`LIMIT_FILE_SIZE`), unsupported MIME type at upload (`INVALID_FILE_TYPE`), file content signature does not match a recognized format, or invalid `document_type`.
  - `404 Not Found`: Case not found.

---

### 5.3 `GET /api/cases/:id/documents`
Lists all documents attached to a specific case.

- **Path Parameters:** `id` *(integer, required)*
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Case documents retrieved successfully.",
    "data": [
      {
        "id": "1",
        "case_id": "1",
        "original_filename": "laptop_tax_invoice.pdf",
        "stored_filename": "evidence-1794612046172-136793086.pdf",
        "mime_type": "application/pdf",
        "document_type": "TAX_INVOICE",
        "description": "Retail GST invoice",
        "file_size": 1048576,
        "created_at": "2026-11-14T12:00:00.000Z"
      }
    ]
  }
  ```
- **Possible Errors:**
  - `400 Bad Request`: Invalid case ID format.
  - `404 Not Found`: Case not found.

---

### 5.4 `GET /api/cases/:id/documents/:docId/file`
Streams the binary file content of a document for inline preview or forced download. Verifies case ownership and enforces canonical path containment before serving.

- **Path Parameters:**
  - `id` *(integer, required)*: Case ID
  - `docId` *(integer, required)*: Document ID
- **Query Parameters:**
  - `download` *(string, optional)*: Pass `true` or `1` to force a file download (`Content-Disposition: attachment`). Omit or pass any other value to serve inline for browser preview (`Content-Disposition: inline`).
- **Request Body:** None
- **Success Response (`200 OK`):**
  - **Response Body:** Raw binary file content (not a JSON envelope).
  - **`Content-Type`:** Set to the stored `mime_type` of the document (e.g. `application/pdf`, `image/png`, `image/jpeg`, `image/webp`).
  - **`Content-Disposition`:**
    - Inline preview (default): `inline; filename="<original_filename>"; filename*=UTF-8''<url-encoded-filename>`
    - Forced download (`?download=true`): `attachment; filename="<original_filename>"; filename*=UTF-8''<url-encoded-filename>`
  - The original filename is percent-encoded in both `filename=` and `filename*=` parameters to safely handle Unicode filenames.
- **Possible Errors:**
  - `400 Bad Request`: Invalid case ID or document ID format; path containment security violation.
  - `404 Not Found`: Case not found, document not found, document does not belong to this case, or physical file is missing from disk.

---

### 5.5 `PATCH /api/cases/:id/documents/:docId`
Updates the editable metadata of an existing document: `document_type` and/or `description`. All other document fields are immutable. The physical file on disk is not touched.

- **Path Parameters:**
  - `id` *(integer, required)*: Case ID
  - `docId` *(integer, required)*: Document ID
- **Request Body (at least one of the following required):**
  ```json
  {
    "document_type": "PAYMENT_RECEIPT",
    "description": "Updated: UPI payment confirmation screenshot"
  }
  ```
  - `document_type` *(string, optional)*: Must be one of the 10 allowed types listed in §5.1.
  - `description` *(string or null, optional)*: Free-text note; max 255 characters. Pass `null` to clear.
- **Immutable Fields (rejected with `400` if supplied):** `id`, `case_id`, `stored_filename`, `file_path`, `file_size`, `mime_type`, `created_at`.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Document metadata updated successfully.",
    "data": {
      "id": "1",
      "case_id": "1",
      "original_filename": "payment_proof.pdf",
      "stored_filename": "evidence-1794612046172-136793086.pdf",
      "mime_type": "application/pdf",
      "document_type": "PAYMENT_RECEIPT",
      "description": "Updated: UPI payment confirmation screenshot",
      "file_size": 204800,
      "created_at": "2026-11-14T12:00:00.000Z"
    }
  }
  ```
  *(Note: `file_path` is never included in the response).*
- **Possible Errors:**
  - `400 Bad Request`: No valid fields supplied; immutable field supplied; invalid `document_type`; `description` exceeds 255 chars; unexpected body fields.
  - `404 Not Found`: Case not found, document not found, or document does not belong to this case.

---

### 5.6 `DELETE /api/cases/:id/documents/:docId`
Deletes a document record from MySQL and unlinks the physical file from disk. Enforces strict case ownership (preventing cross-case IDOR).

- **Path Parameters:**
  - `id` *(integer, required)*: Case ID
  - `docId` *(integer, required)*: Document ID
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Document deleted successfully.",
    "data": {
      "deleted": true,
      "id": "1",
      "case_id": "1"
    }
  }
  ```
- **Possible Errors:**
  - `400 Bad Request`: Invalid ID format.
  - `404 Not Found`: Case not found, document not found, or document does not belong to this case.

---

## 6. Evidence Strength & Missing-Proof Engine APIs

### 6.1 Scoring Mechanics & Rule Architecture
The engine evaluates case documentation against the statutory requirements of the **Consumer Protection Act, 2019 (CPA 2019)** across 4 independent capped pillars:

1. **Pillar 1: Proof of Purchase / Contract (Max 30 pts):**
   - `TAX_INVOICE` = 30 pts.
   - `ORDER_CONFIRMATION` = 20 pts (Goods) or 25 pts (`DEFICIENCY_IN_SERVICE`).
   - `WARRANTY_DOCUMENT` = +10 pts bonus (only when accompanied by an order confirmation).
2. **Pillar 2: Proof of Consideration / Payment (Max 20 pts):**
   - `PAYMENT_RECEIPT` = 20 pts.
3. **Pillar 3: Proof of Defect, Deficiency, or Non-Delivery (Max 30 pts):**
   - `JOB_SHEET_OR_REPORT` = 25 pts.
   - `DEFECT_EVIDENCE` = 20 pts.
   - `DELIVERY_PROOF` / `ADVERTISEMENT_OR_OFFER` = 15 pts.
   - Capped at 30 pts total.
4. **Pillar 4: Prior Written Notice / Communication (Max 20 pts):**
   - `COMMUNICATION_RECORD` = 20 pts.

**Strength Tiers:**
- `0 - 39`: **WEAK**
- `40 - 69`: **MODERATE**
- `70 - 100`: **STRONG**

*Invariant Rule:* A score of 80 (`STRONG`) may still have missing proofs (e.g. 0 points in Pillar 4). Missing proofs are explicitly detected and reported regardless of overall score.

---

### 6.2 `POST /api/cases/:id/evidence/evaluate`
Executes evidence evaluation, generates missing proof alerts, and atomically persists a snapshot to `evidence_evaluations` and a milestone to `case_timeline_events`.

- **Path Parameters:** `id` *(integer, required)*
- **Request Body:** None
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Evidence evaluation completed successfully.",
    "data": {
      "case_id": "1",
      "evaluation_id": "10",
      "evidence_coverage_score": 50,
      "coverage_level": "MODERATE",
      "pillar_breakdown": {
        "proof_of_purchase": { "score": 30, "max": 30 },
        "proof_of_payment": { "score": 20, "max": 20 },
        "proof_of_defect_or_deficiency": { "score": 0, "max": 30 },
        "written_communication": { "score": 0, "max": 20 }
      },
      "provided_proofs": [
        { "document_id": "1", "document_type": "TAX_INVOICE", "pillar": "proof_of_purchase" },
        { "document_id": "2", "document_type": "PAYMENT_RECEIPT", "pillar": "proof_of_payment" }
      ],
      "missing_proofs": [
        {
          "document_type": "DEFECT_EVIDENCE",
          "priority": "HIGH",
          "reason": "Direct visual proof of defect/damage."
        },
        {
          "document_type": "COMMUNICATION_RECORD",
          "priority": "HIGH",
          "reason": "Proof of grievance communication or legal notice."
        }
      ],
      "recommendations": [
        "Upload photos or videos showing the physical defect.",
        "Upload copies of emails or letters sent to customer care."
      ],
      "disclaimer": "The evidence coverage score reflects the completeness of user-provided documentation...",
      "created_at": "2026-11-14T12:00:00.000Z"
    }
  }
  ```
- **Possible Errors:**
  - `400 Bad Request`: Invalid case ID format.
  - `404 Not Found`: Case not found.

---

### 6.3 `GET /api/cases/:id/evidence`
Retrieves the most recent evaluation snapshot for a case. If none exists, automatically generates and persists a baseline evaluation.

- **Path Parameters:** `id` *(integer, required)*
- **Success Response (`200 OK`):** Same schema as `POST /api/cases/:id/evidence/evaluate`.
- **Possible Errors:**
  - `400 Bad Request`: Invalid case ID format.
  - `404 Not Found`: Case not found.

---

## 7. Case Timeline Builder APIs

### 7.1 Event Types & Immutability Rules
- **System-Generated Source Types (Protected):**
  - `SYSTEM_MILESTONE` — Case creation
  - `DOCUMENT_UPLOAD` — Upload of an evidence file
  - `EVIDENCE_EVALUATION` — Evaluation run
  - *Rules:* System events **cannot** be modified via `PATCH` (`403 Forbidden`) or deleted via `DELETE` (`403 Forbidden`).
- **Manual Source Types (User-Managed):**
  - `USER_INPUT` — General manual event note
  - `COMMUNICATION` — Meeting, call, or email notice
  - `HEARING` — Commission hearing date or notice dispatch
  - *Rules:* Only these 3 values are accepted in `POST /api/cases/:id/timeline`.

---

### 7.2 `GET /api/cases/:id/timeline`
Retrieves chronologically ordered timeline events for a case.

- **Path Parameters:** `id` *(integer, required)*
- **Query Parameters:**
  - `sort` *(string, optional, default: 'ASC')*: `'ASC'` or `'DESC'`
  - `source_type` *(string, optional)*: Filter by event type (e.g. `DOCUMENT_UPLOAD`, `HEARING`)
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Timeline events retrieved successfully.",
    "data": [
      {
        "id": "1",
        "case_id": "1",
        "event_date": "2024-03-01T09:00:00.000Z",
        "title": "Case Registered: Defective Laptop Motherboard",
        "description": "Consumer case registered under category 'DEFECTIVE_PRODUCT'...",
        "source_type": "SYSTEM_MILESTONE",
        "document_id": null,
        "order_index": 0,
        "created_at": "2026-11-14T12:00:00.000Z",
        "linked_document": null
      },
      {
        "id": "2",
        "case_id": "1",
        "event_date": "2024-03-05T10:00:00.000Z",
        "title": "Document Attached: TAX_INVOICE",
        "description": "Uploaded evidence document 'laptop_tax_invoice.pdf'.",
        "source_type": "DOCUMENT_UPLOAD",
        "document_id": "1",
        "order_index": 0,
        "created_at": "2026-11-14T12:05:00.000Z",
        "linked_document": {
          "id": "1",
          "document_type": "TAX_INVOICE",
          "original_filename": "laptop_tax_invoice.pdf",
          "file_size": 1048576,
          "mime_type": "application/pdf"
        }
      }
    ]
  }
  ```
- **Possible Errors:**
  - `400 Bad Request`: Invalid sort parameter or invalid `source_type` filter.
  - `404 Not Found`: Case not found.

---

### 7.3 `POST /api/cases/:id/timeline`
Creates a manual timeline event.

- **Path Parameters:** `id` *(integer, required)*
- **Request Body:**
  ```json
  {
    "event_date": "2024-03-10T11:30:00Z",
    "title": "Formal Grievance Email Sent to Merchant",
    "description": "Sent demand for replacement or full refund within 7 days.",
    "source_type": "COMMUNICATION",
    "document_id": 1,
    "order_index": 1
  }
  ```
  - `event_date` *(string, required)*: Valid ISO 8601 or date format (year 1900-2100)
  - `title` *(string, required, 1-255 chars)*
  - `description` *(string, optional)*
  - `source_type` *(string, optional, default: 'USER_INPUT')*: Must be `USER_INPUT`, `COMMUNICATION`, or `HEARING`
  - `document_id` *(integer, optional)*: If provided, must belong to this case
  - `order_index` *(integer, optional, range: -100000 to 100000)*
- **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Timeline event created successfully.",
    "data": {
      "id": "3",
      "case_id": "1",
      "event_date": "2024-03-10T11:30:00.000Z",
      "title": "Formal Grievance Email Sent to Merchant",
      "description": "Sent demand for replacement...",
      "source_type": "COMMUNICATION",
      "document_id": "1",
      "order_index": 1,
      "linked_document": { ... }
    }
  }
  ```
- **Possible Errors:**
  - `400 Bad Request`: Invalid date, disallowed `source_type`, foreign document ID, or order out-of-bounds.
  - `404 Not Found`: Case not found.

---

### 7.4 `PATCH /api/cases/:id/timeline/:eventId`
Updates fields of a manual timeline event. System events are protected from edits.

- **Path Parameters:**
  - `id` *(integer, required)*: Case ID
  - `eventId` *(integer, required)*: Event ID
- **Request Body (at least one valid field required):**
  ```json
  {
    "title": "Updated Notice: Merchant Acknowledged Grievance",
    "description": "Received tracking number for replacement inspection.",
    "order_index": 2
  }
  ```
  *(Note: `source_type` and `case_id` are strictly immutable; passing them returns `400 Bad Request`).*
- **Success Response (`200 OK`):** Returns the updated event object.
- **Possible Errors:**
  - `400 Bad Request`: Modifying immutable fields (`source_type`, `case_id`), invalid date, or foreign `document_id`.
  - `403 Forbidden`: Attempting to edit a system-generated milestone (`SYSTEM_MILESTONE`, `DOCUMENT_UPLOAD`, `EVIDENCE_EVALUATION`).
  - `404 Not Found`: Case or event not found, or event does not belong to case.

---

### 7.5 `DELETE /api/cases/:id/timeline/:eventId`
Safely deletes a manual timeline event.

- **Path Parameters:** `id` *(integer)*, `eventId` *(integer)*
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Timeline event deleted successfully.",
    "data": {
      "deleted": true,
      "id": "3",
      "case_id": "1"
    }
  }
  ```
- **Possible Errors:**
  - `403 Forbidden`: Attempting to delete a system-generated milestone.
  - `404 Not Found`: Event not found or does not belong to case.

---

## 8. Consumer Loss Calculator APIs

### 8.1 Calculation Engine Specification
- **Internal Decimal Safety:** Uses integer BigInt/paise arithmetic (`100n` paise per rupee) with integer division and rounding half-up. Eliminates floating-point rounding errors.
- **Itemized Expense Inputs:**
  - `purchase_amount`: Purchase price. If omitted/null, automatically falls back to `case.claimed_amount`.
  - `delivery_installation_charges`: Shipping, delivery, and setup costs.
  - `repair_replacement_expenses`: Third-party service or replacement costs.
  - `travel_communication_expenses`: Travel, postage, and telephone expenses.
  - `other_documented_expenses`: Miscellaneous documented costs.
  - `refunds_received`: Any partial refunds or chargebacks already received.
- **Formulas:**
  $$\text{gross\_loss} = \text{purchase} + \text{delivery} + \text{repair} + \text{travel} + \text{other}$$
  $$\text{net\_loss} = \max(0, \text{gross\_loss} - \text{refunds\_received})$$
- **Optional Simple Interest Estimate:**
  - Valid range: `0.00%` to `36.00%` per annum.
  - Date range: `start_date` to `end_date` (defaults to current date if `end_date` omitted).
  $$\text{interest} = \text{round}\left( \text{net\_loss} \times \frac{\text{annual\_rate}}{100} \times \frac{\text{days}}{365} \right)$$
  $$\text{total\_estimated\_claim} = \text{net\_loss} + \text{interest}$$
- **Discretionary Separation:** Does not assign monetary values to mental agony, harassment, or punitive damages. These require separate judicial assessment.

---

### 8.2 `POST /api/cases/:id/loss/calculate`
Calculates consumer monetary loss and persists an evaluation record to `case_loss_calculations`.

- **Path Parameters:** `id` *(integer, required)*
- **Request Body (all fields optional):**
  ```json
  {
    "purchase_amount": 63950.00,
    "delivery_installation_charges": 1500.00,
    "repair_replacement_expenses": 3500.00,
    "travel_communication_expenses": 400.00,
    "other_documented_expenses": 100.00,
    "refunds_received": 5500.00,
    "interest": {
      "annual_rate": 9.0,
      "start_date": "2024-03-01",
      "end_date": "2024-11-01"
    }
  }
  ```
- **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Consumer loss calculation completed and recorded successfully.",
    "data": {
      "id": "1",
      "case_id": "1",
      "itemized_breakdown": {
        "purchase_amount": 63950.00,
        "delivery_installation_charges": 1500.00,
        "repair_replacement_expenses": 3500.00,
        "travel_communication_expenses": 400.00,
        "other_documented_expenses": 100.00
      },
      "gross_loss": 69450.00,
      "refunds_received": 5500.00,
      "net_loss": 63950.00,
      "interest_estimate": {
        "applied": true,
        "annual_rate": 9.0,
        "start_date": "2024-03-01",
        "end_date": "2024-11-01",
        "days": 245,
        "estimated_interest": 3863.28
      },
      "total_estimated_claim": 67813.28,
      "calculation_explanation": "Gross user-reported expenses: ₹69450.00 (Purchase: ₹63950.00, Delivery: ₹1500.00...). Deducted refunds already received: ₹5500.00, yielding net monetary loss: ₹63950.00. Estimated simple interest: ₹3863.28 calculated over 245 days at 9.00% p.a.",
      "disclaimer": "The Consumer Loss Calculator provides an arithmetic calculation of user-reported financial outlays...",
      "created_at": "2026-11-14T12:00:00.000Z"
    }
  }
  ```
- **Possible Errors:**
  - `400 Bad Request`: Negative numbers, interest rate $> 36\%$, invalid date format, `start_date > end_date`, or unexpected body fields.
  - `404 Not Found`: Case not found.

---

### 8.3 `GET /api/cases/:id/loss`
Retrieves the most recent saved loss calculation snapshot. If no calculation has been run yet, dynamically returns a derived baseline calculation.

- **Path Parameters:** `id` *(integer, required)*
- **Success Response (`200 OK` - Baseline Case):**
  ```json
  {
    "success": true,
    "message": "Consumer loss calculation retrieved successfully.",
    "data": {
      "id": null,
      "case_id": "1",
      "is_baseline": true,
      "itemized_breakdown": {
        "purchase_amount": 62000.00,
        "delivery_installation_charges": 0,
        "repair_replacement_expenses": 0,
        "travel_communication_expenses": 0,
        "other_documented_expenses": 0
      },
      "gross_loss": 62000.00,
      "refunds_received": 0,
      "net_loss": 62000.00,
      "interest_estimate": {
        "applied": false,
        "annual_rate": null,
        "start_date": null,
        "end_date": null,
        "days": 0,
        "estimated_interest": 0
      },
      "total_estimated_claim": 62000.00,
      "calculation_explanation": "Purchase amount was not explicitly provided; defaulted to the original case claimed amount. Gross user-reported expenses: ₹62000.00...",
      "created_at": null,
      "disclaimer": "The Consumer Loss Calculator provides an arithmetic calculation..."
    }
  }
  ```
  *(Note: Dynamic baseline returns `id: null`, `is_baseline: true`, `created_at: null`, and is never silently written to the database).*
- **Possible Errors:**
  - `400 Bad Request`: Invalid case ID format.
  - `404 Not Found`: Case not found.

---

### 8.4 `GET /api/cases/:id/loss/history`
Retrieves all historical calculation snapshots for the specified case in reverse-chronological order (`created_at DESC`).

- **Path Parameters:** `id` *(integer, required)*
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Consumer loss calculation history retrieved successfully.",
    "data": [
      {
        "id": "2",
        "case_id": "1",
        "itemized_breakdown": { ... },
        "gross_loss": 69450.00,
        "net_loss": 63950.00,
        "total_estimated_claim": 67813.28,
        "created_at": "2026-11-14T12:05:00.000Z",
        "disclaimer": "..."
      },
      {
        "id": "1",
        "case_id": "1",
        "itemized_breakdown": { ... },
        "gross_loss": 62000.00,
        "net_loss": 62000.00,
        "total_estimated_claim": 62000.00,
        "created_at": "2026-11-14T12:00:00.000Z",
        "disclaimer": "..."
      }
    ]
  }
  ```
- **Possible Errors:**
  - `400 Bad Request`: Invalid case ID format.
  - `404 Not Found`: Case not found.
