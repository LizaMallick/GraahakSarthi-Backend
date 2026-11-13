# Graahak AI Backend

AI-powered Consumer Case Intelligence and Resolution Assistant Backend Service.

## Technology Stack

- **Runtime:** Node.js (CommonJS)
- **Web Framework:** Express.js 5
- **Database:** MySQL (using `mysql2`)
- **AI Microservice Client:** Axios (communicating with existing Python FastAPI AI service)
- **File Uploads:** Multer (multipart/form-data for consumer case documents)

---

## Project Structure

```
GraahakSarthi-Backend/
├── .env.example              # Environment variables template
├── .gitignore                # Git ignore rules for node_modules, env, and uploads
├── package.json              # Project manifest and scripts
├── package-lock.json         # Dependency lockfile
├── README.md                 # Project documentation and architectural guide
├── server.js                 # Application entrypoint and HTTP server bootstrap
├── database/                 # Database migrations, seed files, and SQL schemas
├── docs/                     # Architecture documentation and API specifications
├── tests/                    # Unit, integration, and end-to-end test suites
├── uploads/                  # Temporary file upload directory (git-ignored)
└── src/
    ├── config/               # Database, environment, and external service configurations
    ├── controllers/          # HTTP request handlers (orchestrating inputs and responses)
    ├── middleware/           # Express middleware (upload handlers, auth, error handling)
    ├── models/               # Data access layer and MySQL query abstractions
    ├── routes/               # API route definitions and endpoint mappings
    ├── services/             # Core business logic and external integrations (FastAPI AI service)
    ├── utils/                # Reusable utilities, response helpers, and constants
    └── validators/           # Request schema validations and input sanitizers
```

---

## Directory & File Responsibilities

| Directory / File | Description & Purpose |
| :--- | :--- |
| `server.js` | Express server bootstrap file. Sets up global middleware (`cors`, `express.json`), mounts routes, defines `/api/health`, and manages error handling. |
| `src/config/` | Centralized configurations: database connection pools (`mysql2`), environment variable loaders, and external FastAPI client settings. |
| `src/controllers/` | Presentation layer: extracts parameters from requests, delegates processing to services, and sends standardized HTTP responses. |
| `src/routes/` | API routing layer: maps REST endpoints to controller actions and attaches endpoint-specific middleware. |
| `src/services/` | Business logic layer: encapsulates domain logic, case intelligence workflows, and Axios integrations with the Python FastAPI AI service. |
| `src/middleware/` | Custom middleware functions, including Multer document upload filters/storage, authentication, and error interceptors. |
| `src/models/` | Data access layer: manages SQL queries, connection pooling, and entity representations for MySQL. |
| `src/validators/` | Validation schemas and logic to ensure incoming request payloads adhere to expected formats before reaching controllers. |
| `src/utils/` | Shared utilities: standard API response wrappers, file path handlers, logging utilities, and helper functions. |
| `database/` | Database DDL scripts, migration definitions, and seed data for MySQL setup. |
| `tests/` | Automated test suites: unit tests for services/utilities and integration tests for API endpoints. |
| `docs/` | System architecture documentation, flowcharts, data schemas, and API documentation. |
| `uploads/` | Storage destination for consumer case documents (PDFs, images) uploaded via Multer. Excluded from version control. |
| `.env.example` | Template containing all required and optional environment variables for local development and deployment. |
| `.gitignore` | Prevents sensitive files (`.env`), dependencies (`node_modules`), and confidential case documents (`uploads/*`) from being committed. |

---

## Getting Started

### 1. Prerequisites

- Node.js (v18+ recommended)
- MySQL Server (v8.0+)
- Python FastAPI AI Service (running independently)

### 2. Environment Configuration

Copy the example environment file and update the values:

```bash
cp .env.example .env
```

### 3. Running the Server

Start in production mode:
```bash
npm start
```

Start in development mode with auto-reload:
```bash
npm run dev
```

### 4. Health Check

Verify that the server is running properly:

```bash
curl http://localhost:5000/api/health
```

Expected response:
```json
{
  "status": "OK",
  "service": "Graahak AI Backend",
  "timestamp": "2026-11-13T07:56:23.117Z",
  "uptime": 0.314
}
```
