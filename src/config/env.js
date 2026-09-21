/**
 * Environment Configuration and Validation Module
 * Loads environment variables from .env and exports a structured config object.
 */

const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const requiredEnvVars = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'OLLAMA_BASE_URL',
  'OLLAMA_CHAT_MODEL',
  'OLLAMA_EMBED_MODEL'
];

// Validate presence of required environment variables
const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  },
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL.replace(/\/$/, ''),
    chatModel: process.env.OLLAMA_CHAT_MODEL,
    embedModel: process.env.OLLAMA_EMBED_MODEL
  },
  maxScrapePages: parseInt(process.env.MAX_SCRAPE_PAGES || '10', 10),
  chunkSize: parseInt(process.env.CHUNK_SIZE || '500', 10),
  chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '50', 10)
};

module.exports = config;
