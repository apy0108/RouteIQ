/**
 * Database Connection & Query Helper Module
 * Manages the PostgreSQL connection pool and query execution.
 */

const { Pool } = require('pg');
const config = require('../config/env');

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Test initial database connection on module load
pool.query('SELECT NOW()')
  .then((res) => {
    console.log('✅ PostgreSQL database connected successfully at:', res.rows[0].now);
  })
  .catch((err) => {
    console.error('❌ Failed to connect to PostgreSQL database:', err.message);
  });

/**
 * Execute a parameterized query against the database pool.
 * Logs execution duration if slow (>1000ms).
 *
 * @param {string} text - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params = []) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`⚠️ Slow query detected (${duration}ms):`, { text, params });
    }
    return res;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`❌ Database query error (${duration}ms):`, {
      message: error.message,
      sql: text,
      params
    });
    error.sql = text;
    throw error;
  }
}

/**
 * Get a single client from the pool for manual transaction control.
 *
 * @returns {Promise<import('pg').PoolClient>}
 */
async function getClient() {
  return await pool.connect();
}

module.exports = {
  pool,
  query,
  getClient
};
