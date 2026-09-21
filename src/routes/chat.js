/**
 * Chat Router
 * Orchestrates real-time conversational messaging with AI bots using RAG (Retrieval-Augmented Generation).
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db/database');
const { generateEmbedding } = require('../core/embeddings');
const { searchChunks } = require('../core/vectorSearch');
const { generateResponse } = require('../core/llm');

const router = express.Router();

/**
 * POST /api/chat
 * Receive a user message, perform semantic vector retrieval, generate grounded answer, and store conversation.
 */
router.post('/', async (req, res, next) => {
  try {
    const { botId, message, sessionId: incomingSessionId } = req.body;

    if (!botId || !message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'botId and a non-empty message string are required.',
        code: 400
      });
    }

    const sessionId = incomingSessionId || uuidv4();
    const cleanMessage = message.trim();

    // 1. Validate bot exists and is ready
    const botResult = await query('SELECT * FROM bots WHERE id = $1', [botId]);
    if (botResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found',
        code: 404
      });
    }

    const bot = botResult.rows[0];
    if (bot.status !== 'ready') {
      return res.status(400).json({
        success: false,
        error: `Bot is not ready for chat. Current status: ${bot.status}`,
        code: 400
      });
    }

    // 2. Generate vector embedding for user query
    const queryEmbedding = await generateEmbedding(cleanMessage);

    // 3. Search relevant contextual chunks using Cosine Similarity
    const relevantChunks = await searchChunks(botId, queryEmbedding, 5);

    // 4. Fetch recent chat history (last 10 messages for context)
    const historyResult = await query(
      `SELECT role, content FROM chat_messages
       WHERE bot_id = $1 AND session_id = $2
       ORDER BY created_at ASC
       LIMIT 10`,
      [botId, sessionId]
    );
    const chatHistory = historyResult.rows;

    // 5. Generate grounded response using LLM
    const replyText = await generateResponse(bot, relevantChunks, cleanMessage, chatHistory);

    // 6. Deduplicate sources
    const seenUrls = new Set();
    const sources = [];
    const sourceUrlsArray = [];

    for (const chunk of relevantChunks) {
      if (chunk.sourceUrl && !seenUrls.has(chunk.sourceUrl)) {
        seenUrls.add(chunk.sourceUrl);
        sourceUrlsArray.push(chunk.sourceUrl);
        sources.push({
          url: chunk.sourceUrl,
          title: chunk.sourceType === 'pdf' ? `PDF: ${chunk.sourceUrl}` : chunk.sourceUrl
        });
      }
    }

    // 7. Persist both user message and assistant reply in database
    await query(
      `INSERT INTO chat_messages (bot_id, session_id, role, content, sources)
       VALUES ($1, $2, 'user', $3, NULL)`,
      [botId, sessionId, cleanMessage]
    );

    await query(
      `INSERT INTO chat_messages (bot_id, session_id, role, content, sources)
       VALUES ($1, $2, 'assistant', $3, $4)`,
      [botId, sessionId, replyText, sourceUrlsArray.length > 0 ? sourceUrlsArray : null]
    );

    return res.json({
      success: true,
      reply: replyText,
      sources,
      sessionId
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/chat/:botId/history/:sessionId
 * Retrieve chat history for a specific conversation session.
 */
router.get('/:botId/history/:sessionId', async (req, res, next) => {
  try {
    const { botId, sessionId } = req.params;

    const sql = `
      SELECT id, role, content, sources, created_at
      FROM chat_messages
      WHERE bot_id = $1 AND session_id = $2
      ORDER BY created_at ASC
      LIMIT 50
    `;

    const result = await query(sql, [botId, sessionId]);

    return res.json({
      success: true,
      history: result.rows
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
