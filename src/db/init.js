/**
 * Database Initialization Script
 * Executes schema.sql to initialize all database tables, indexes, and triggers.
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('./database');

async function initDatabase() {
  console.log('🗄️  Connecting to database...');
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('📋  Running schema...');
    await pool.query(schemaSql);

    console.log('✅  Tables created successfully');
    console.log('🚀  Database ready');
    process.exit(0);
  } catch (error) {
    console.error('❌  Database initialization failed:', error.message);
    if (error.sql) {
      console.error('SQL Error Context:', error.sql);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDatabase();
