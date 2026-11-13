require("dotenv").config();
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

/**
 * Safe database creation and schema migration script.
 * Executes database/init.sql using CREATE TABLE IF NOT EXISTS.
 * Never drops or modifies existing databases, tables, or records.
 */
async function initializeDatabase() {
  const host = process.env.DB_HOST || "localhost";
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER || "root";
  const password = process.env.DB_PASSWORD;
  const targetDb = process.env.DB_NAME || "graahak_ai";

  console.log(`[Database Init] Connecting to MySQL at ${host}:${port} as user '${user}'...`);

  let connection;
  try {
    // Connect to MySQL server with multipleStatements enabled for schema execution
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: true,
    });

    console.log(`[Database Init] Checking if database '${targetDb}' exists...`);
    const [dbRows] = await connection.query(
      "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?",
      [targetDb]
    );

    if (dbRows && dbRows.length > 0) {
      console.log(`[Database Init] Database '${targetDb}' exists.`);
    } else {
      console.log(`[Database Init] Database '${targetDb}' does not exist. Creating safely...`);
      await connection.query(
        `CREATE DATABASE IF NOT EXISTS \`${targetDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
      console.log(`[Database Init] Database '${targetDb}' created successfully with utf8mb4 encoding.`);
    }

    // Read SQL schema file
    const sqlPath = path.join(__dirname, "init.sql");
    console.log(`[Database Init] Reading schema definition from ${sqlPath}...`);
    const sqlContent = fs.readFileSync(sqlPath, "utf8");

    // Execute schema statements
    console.log(`[Database Init] Executing table creation statements (CREATE TABLE IF NOT EXISTS)...`);
    await connection.query(sqlContent);
    console.log(`[Database Init] Schema execution completed successfully.`);

    // Verify created tables in target database
    const [tables] = await connection.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?",
      [targetDb]
    );

    const tableNames = tables.map((t) => t.TABLE_NAME || t.table_name);
    console.log(`[Database Init] Verified tables in '${targetDb}': ${tableNames.join(", ")}`);

    return {
      success: true,
      database: targetDb,
      tables: tableNames,
    };
  } catch (error) {
    console.error(`[Database Init Error] Failed to initialize database schema: ${error.message}`);
    return {
      success: false,
      error,
    };
  } finally {
    if (connection) {
      await connection.end();
      console.log("[Database Init] Connection closed.");
    }
  }
}

if (require.main === module) {
  initializeDatabase().then((res) => {
    if (!res.success) {
      process.exit(1);
    }
  });
}

module.exports = initializeDatabase;
