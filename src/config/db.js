require("dotenv").config();
const mysql = require("mysql2/promise");

// Create MySQL Connection Pool using environment variables
const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "graahak_ai",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

/**
 * Non-destructive connection test helper.
 * Tests if the database connection pool is operational.
 * Always releases the connection back to the pool in a finally block.
 *
 * @returns {Promise<{ success: boolean, message?: string, error?: any }>}
 */
async function testConnection() {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.query("SELECT 1 + 1 AS result");
        return {
            success: true,
            message: `Successfully connected to database '${process.env.DB_NAME || "graahak_ai"}'`
        };
    } catch (error) {
        return {
            success: false,
            error
        };
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

pool.testConnection = testConnection;

module.exports = pool;
