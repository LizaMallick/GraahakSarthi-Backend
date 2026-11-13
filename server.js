require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { testConnection } = require('./src/config/db');
const caseRoutes = require('./src/routes/caseRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Core Middlewares
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'Graahak AI Backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Case Management APIs
app.use('/api/cases', caseRoutes);

// 404 Route Not Found Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Centralized Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]:', err);
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
  });
});

// Start HTTP Server when executed directly
let server;
if (require.main === module) {
  server = app.listen(PORT, async () => {
    console.log(`[Graahak AI Backend] Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    console.log(`[Graahak AI Backend] Health check available at http://localhost:${PORT}/api/health`);

    // Non-blocking database connection test on startup
    const dbStatus = await testConnection();
    if (dbStatus.success) {
      console.log(`[Database] MySQL pool connected successfully to '${process.env.DB_NAME || 'graahak_ai'}'`);
    } else {
      console.warn(`[Database Warning] MySQL connection failed on startup: ${dbStatus.error ? dbStatus.error.message : 'Unknown error'}`);
    }
  });
}

module.exports = { app, server };
