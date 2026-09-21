/**
 * Vector Search Module
 * Computes cosine similarity across text chunk embeddings stored in PostgreSQL.
 */

const { query } = require('../db/database');

/**
 * Calculates cosine similarity between two numerical vectors.
 *
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number} Similarity score (-1.0 to 1.0, typically 0.0 to 1.0 for normalized embeddings)
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) {
    return 0;
  }

  const length = Math.min(vecA.length, vecB.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < length; i++) {
    const valA = vecA[i];
    const valB = vecB[i];
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}

/**
 * Searches for the top-K most relevant chunks for a given bot and query embedding.
 *
 * @param {string} botId - UUID of the bot
 * @param {number[]} queryEmbedding - Vector embedding of user query
 * @param {number} [topK=5] - Maximum number of chunks to return
 * @returns {Promise<Array<{ content: string, sourceUrl: string|null, sourceType: string, score: number }>>}
 */
async function searchChunks(botId, queryEmbedding, topK = 5) {
  const sql = `
    SELECT id, content, embedding, source_url, source_type
    FROM chunks
    WHERE bot_id = $1
  `;
  const result = await query(sql, [botId]);

  if (result.rows.length === 0) {
    return [];
  }

  const scoredChunks = [];

  for (const row of result.rows) {
    // Note: pg returns float8[] as an array of numbers or strings depending on parser
    const embedding = Array.isArray(row.embedding)
      ? row.embedding.map(Number)
      : [];

    const score = cosineSimilarity(queryEmbedding, embedding);

    // Only return chunks with similarity score strictly above relevance threshold 0.3
    if (score > 0.3) {
      scoredChunks.push({
        content: row.content,
        sourceUrl: row.source_url,
        sourceType: row.source_type,
        score
      });
    }
  }

  // Sort descending by similarity score
  scoredChunks.sort((a, b) => b.score - a.score);

  return scoredChunks.slice(0, topK);
}

module.exports = {
  cosineSimilarity,
  searchChunks
};
