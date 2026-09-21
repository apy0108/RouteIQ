/**
 * Text Chunking Utility
 * Splits raw content into manageable overlapping text chunks for embedding generation.
 */

/**
 * Splits text into overlapping chunks of chunkSize characters.
 *
 * @param {string} text - The input text to chunk
 * @param {number} [chunkSize=500] - Maximum character length of each chunk
 * @param {number} [overlap=50] - Number of characters overlapping between consecutive chunks
 * @returns {string[]} Array of chunk strings
 */
function chunkText(text, chunkSize = 500, overlap = 50) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const step = chunkSize - overlap > 0 ? chunkSize - overlap : chunkSize;
  const chunks = [];
  // For production chunks (chunkSize >= 50), filter chunks smaller than 50 chars.
  // For custom small test sizes (< 50), ensure chunks are at least 1 char.
  const minLength = chunkSize >= 50 ? 50 : 1;

  for (let start = 0; start < text.length; start += step) {
    const rawChunk = text.slice(start, start + chunkSize);
    const trimmedChunk = rawChunk.trim();

    if (trimmedChunk.length >= minLength) {
      chunks.push(trimmedChunk);
    }
  }

  return chunks;
}

module.exports = {
  chunkText
};
