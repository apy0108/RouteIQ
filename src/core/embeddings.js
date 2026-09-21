/**
 * Embeddings Generation Module
 * Integrates with Ollama embeddings API to convert text chunks into vector embeddings.
 */

const axios = require('axios');
const config = require('../config/env');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generates a vector embedding for a single text string using Ollama.
 * Automatically retries once after 1 second on failure.
 *
 * @param {string} text
 * @returns {Promise<number[]>} Float array embedding
 */
async function generateEmbedding(text) {
  const url = `${config.ollama.baseUrl}/api/embeddings`;
  const payload = {
    model: config.ollama.embedModel,
    prompt: text
  };

  try {
    const response = await axios.post(url, payload, { timeout: 15000 });
    if (!response.data || !Array.isArray(response.data.embedding)) {
      throw new Error('Invalid embedding response format from Ollama');
    }
    return response.data.embedding;
  } catch (firstError) {
    console.warn(`⚠️ Ollama embedding attempt failed (${firstError.message}). Retrying in 1s...`);
    await sleep(1000);
    try {
      const retryResponse = await axios.post(url, payload, { timeout: 15000 });
      if (!retryResponse.data || !Array.isArray(retryResponse.data.embedding)) {
        throw new Error('Invalid embedding response format on retry');
      }
      return retryResponse.data.embedding;
    } catch (secondError) {
      console.error(`❌ Ollama embedding generation failed after retry: ${secondError.message}`);
      throw secondError;
    }
  }
}

/**
 * Generates vector embeddings for an array of text strings.
 * Processes in batches of 10 with a 100ms delay between batches.
 *
 * @param {string[]} texts
 * @returns {Promise<number[][]>} Array of float array embeddings
 */
async function generateEmbeddings(texts) {
  const results = [];
  const batchSize = 10;
  const total = texts.length;

  for (let i = 0; i < total; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    for (let j = 0; j < batch.length; j++) {
      const currentIndex = i + j + 1;
      console.log(`Embedding chunk ${currentIndex}/${total}...`);
      const embedding = await generateEmbedding(batch[j]);
      results.push(embedding);
    }

    if (i + batchSize < total) {
      await sleep(100);
    }
  }

  return results;
}

module.exports = {
  generateEmbedding,
  generateEmbeddings
};
