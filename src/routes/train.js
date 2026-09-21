/**
 * Training & Ingestion Router
 * Handles data ingestion via Web scraping, PDF document parsing, and manual text input.
 * Orchestrates chunking, vector embedding, and persistence asynchronously.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query } = require('../db/database');
const { scrapeWebsite } = require('../core/scraper');
const { parsePDF } = require('../core/pdfParser');
const { chunkText } = require('../core/chunker');
const { generateEmbeddings } = require('../core/embeddings');
const config = require('../config/env');

const router = express.Router();

// Setup Multer for PDF file uploads
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `upload-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB maximum file size
  fileFilter: (_req, file, cb) => {
    const isPdf =
      file.mimetype === 'application/pdf' ||
      path.extname(file.originalname).toLowerCase() === '.pdf';
    if (isPdf) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF documents are supported for upload.'));
    }
  }
});

/**
 * Helper function to persist chunks and vector embeddings to database
 * and update the bot's chunk count and readiness status.
 *
 * @param {string} botId
 * @param {Array<{ content: string, sourceUrl: string|null, sourceType: string, chunkIndex: number }>} chunkItems
 */
async function processAndSaveChunks(botId, chunkItems) {
  if (chunkItems.length === 0) {
    // If no meaningful text was extracted, complete training with 0 new chunks
    await query(`UPDATE bots SET status = 'ready', error_message = NULL, updated_at = NOW() WHERE id = $1`, [botId]);
    return;
  }

  const textsToEmbed = chunkItems.map((item) => item.content);
  const embeddings = await generateEmbeddings(textsToEmbed);

  for (let i = 0; i < chunkItems.length; i++) {
    const item = chunkItems[i];
    const embedding = embeddings[i];

    const insertChunkSql = `
      INSERT INTO chunks (
        bot_id,
        content,
        embedding,
        source_url,
        source_type,
        chunk_index
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;

    // PostgreSQL pg driver accepts JavaScript arrays for FLOAT8[]
    await query(insertChunkSql, [
      botId,
      item.content,
      embedding,
      item.sourceUrl,
      item.sourceType,
      item.chunkIndex
    ]);
  }

  // Update bot status and chunk count
  const updateBotSql = `
    UPDATE bots
    SET
      status = 'ready',
      chunk_count = chunk_count + $1,
      error_message = NULL,
      updated_at = NOW()
    WHERE id = $2
  `;
  await query(updateBotSql, [chunkItems.length, botId]);
  console.log(`✅ Training completed for Bot ${botId}: ${chunkItems.length} chunks indexed.`);
}

/**
 * POST /api/train/url
 * Scrape website from given URL, chunk text, generate embeddings, and store.
 */
router.post('/url', async (req, res, next) => {
  try {
    const { botId, url } = req.body;

    if (!botId || !url) {
      return res.status(400).json({
        success: false,
        error: 'Both botId and url are required.',
        code: 400
      });
    }

    const checkBot = await query(`SELECT id FROM bots WHERE id = $1`, [botId]);
    if (checkBot.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found',
        code: 404
      });
    }

    // Set bot status to training
    await query(`UPDATE bots SET status = 'training', error_message = NULL, updated_at = NOW() WHERE id = $1`, [botId]);

    // Return immediate response to client
    res.json({
      success: true,
      message: 'Training started',
      botId
    });

    // Run scraping & training asynchronously
    setImmediate(async () => {
      try {
        console.log(`🚀 Starting web scraping training for Bot ${botId} from URL: ${url}`);
        const pages = await scrapeWebsite(url, config.maxScrapePages);
        const chunkItems = [];

        for (const page of pages) {
          const rawChunks = chunkText(page.content, config.chunkSize, config.chunkOverlap);
          rawChunks.forEach((chunk, index) => {
            chunkItems.push({
              content: chunk,
              sourceUrl: page.url,
              sourceType: 'url',
              chunkIndex: index
            });
          });
        }

        await processAndSaveChunks(botId, chunkItems);
      } catch (error) {
        console.error(`❌ URL training failed for Bot ${botId}:`, error.message);
        await query(`UPDATE bots SET status = 'error', error_message = $1, updated_at = NOW() WHERE id = $2`, [
          error.message,
          botId
        ]);
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/train/pdf
 * Upload and parse a PDF document, chunk text, generate embeddings, and store.
 */
router.post('/pdf', upload.single('file'), async (req, res, next) => {
  const filePath = req.file ? req.file.path : null;

  try {
    const { botId } = req.body;

    if (!botId || !req.file) {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(400).json({
        success: false,
        error: 'botId and a PDF file upload are required.',
        code: 400
      });
    }

    const checkBot = await query(`SELECT id FROM bots WHERE id = $1`, [botId]);
    if (checkBot.rows.length === 0) {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(404).json({
        success: false,
        error: 'Bot not found',
        code: 404
      });
    }

    // Set bot status to training
    await query(`UPDATE bots SET status = 'training', error_message = NULL, updated_at = NOW() WHERE id = $1`, [botId]);

    // Respond immediately to client
    res.json({
      success: true,
      message: 'Training started',
      botId
    });

    const originalName = req.file.originalname;

    // Run PDF parsing & embedding asynchronously
    setImmediate(async () => {
      try {
        console.log(`📄 Parsing PDF file for Bot ${botId}: ${originalName}`);
        const parsed = await parsePDF(filePath);
        const rawChunks = chunkText(parsed.text, config.chunkSize, config.chunkOverlap);

        const chunkItems = rawChunks.map((chunk, index) => ({
          content: chunk,
          sourceUrl: originalName,
          sourceType: 'pdf',
          chunkIndex: index
        }));

        await processAndSaveChunks(botId, chunkItems);
      } catch (error) {
        console.error(`❌ PDF training failed for Bot ${botId}:`, error.message);
        await query(`UPDATE bots SET status = 'error', error_message = $1, updated_at = NOW() WHERE id = $2`, [
          error.message,
          botId
        ]);
      } finally {
        if (filePath && fs.existsSync(filePath)) {
          fs.unlink(filePath, (err) => {
            if (err) console.warn('Could not delete temporary PDF upload:', err.message);
          });
        }
      }
    });
  } catch (error) {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore
      }
    }
    next(error);
  }
});

/**
 * POST /api/train/text
 * Ingest raw text data directly for a bot.
 */
router.post('/text', async (req, res, next) => {
  try {
    const { botId, text, sourceLabel = 'Manual Input' } = req.body;

    if (!botId || !text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'botId and non-empty text are required.',
        code: 400
      });
    }

    const checkBot = await query(`SELECT id FROM bots WHERE id = $1`, [botId]);
    if (checkBot.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found',
        code: 404
      });
    }

    // Set bot status to training
    await query(`UPDATE bots SET status = 'training', error_message = NULL, updated_at = NOW() WHERE id = $1`, [botId]);

    // Respond immediately
    res.json({
      success: true,
      message: 'Training started',
      botId
    });

    setImmediate(async () => {
      try {
        console.log(`📝 Processing manual text training for Bot ${botId}`);
        const rawChunks = chunkText(text.trim(), config.chunkSize, config.chunkOverlap);

        const chunkItems = rawChunks.map((chunk, index) => ({
          content: chunk,
          sourceUrl: sourceLabel,
          sourceType: 'manual',
          chunkIndex: index
        }));

        await processAndSaveChunks(botId, chunkItems);
      } catch (error) {
        console.error(`❌ Text training failed for Bot ${botId}:`, error.message);
        await query(`UPDATE bots SET status = 'error', error_message = $1, updated_at = NOW() WHERE id = $2`, [
          error.message,
          botId
        ]);
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/train/:botId/status
 * Check current training status, total indexed chunks, and any failure message.
 */
router.get('/:botId/status', async (req, res, next) => {
  try {
    const { botId } = req.params;

    const sql = `SELECT status, chunk_count, error_message FROM bots WHERE id = $1`;
    const result = await query(sql, [botId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found',
        code: 404
      });
    }

    const row = result.rows[0];

    return res.json({
      success: true,
      status: row.status,
      chunkCount: row.chunk_count,
      errorMessage: row.error_message
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
