/**
 * PDF Parser Module
 * Extracts text and metadata from PDF files using pdf-parse.
 */

const fs = require('fs');
const pdfParse = require('pdf-parse');

/**
 * Parses and extracts clean text content from a PDF document.
 *
 * @param {string} filePath - Absolute or relative path to PDF file
 * @returns {Promise<{ text: string, pageCount: number, wordCount: number }>}
 */
async function parsePDF(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`PDF file not found at path: ${filePath}`);
  }

  const dataBuffer = fs.readFileSync(filePath);

  try {
    const pdfData = await pdfParse(dataBuffer);

    const rawText = pdfData.text || '';
    const pageCount = pdfData.numpages || 1;

    // Clean text: strip excessive whitespace and standalone page number lines
    const cleanedText = rawText
      .replace(/(\r\n|\n|\r)/gm, '\n')
      .replace(/^\s*\d+\s*$/gm, '') // Remove standalone page numbers
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '\n\n')
      .trim();

    const words = cleanedText.split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    return {
      text: cleanedText,
      pageCount,
      wordCount
    };
  } catch (error) {
    if (error.name === 'PasswordException' || /password/i.test(error.message)) {
      throw new Error('The uploaded PDF is password protected and cannot be processed.');
    }
    throw new Error(`Failed to parse PDF document: ${error.message}`);
  }
}

module.exports = {
  parsePDF
};
