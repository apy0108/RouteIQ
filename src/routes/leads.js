/**
 * Leads Management Router
 * Captures customer contact inquiries submitted through the embedded chatbot widget.
 */

const express = require('express');
const { query } = require('../db/database');

const router = express.Router();

/**
 * POST /api/leads
 * Capture and store a customer lead.
 */
router.post('/', async (req, res, next) => {
  try {
    const { botId, name, phone, email, message, sessionId } = req.body;

    if (!botId) {
      return res.status(400).json({
        success: false,
        error: 'botId is required.',
        code: 400
      });
    }

    const hasPhone = typeof phone === 'string' && phone.trim().length > 0;
    const hasEmail = typeof email === 'string' && email.trim().length > 0;

    if (!hasPhone && !hasEmail) {
      return res.status(400).json({
        success: false,
        error: 'At least one contact method (phone number or email) must be provided.',
        code: 400
      });
    }

    // Verify bot exists
    const checkBot = await query('SELECT id FROM bots WHERE id = $1', [botId]);
    if (checkBot.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found',
        code: 404
      });
    }

    const insertSql = `
      INSERT INTO leads (
        bot_id,
        name,
        phone,
        email,
        message,
        session_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [
      botId,
      name ? name.trim() : null,
      hasPhone ? phone.trim() : null,
      hasEmail ? email.trim() : null,
      message ? message.trim() : null,
      sessionId || null
    ];

    const result = await query(insertSql, values);

    return res.status(201).json({
      success: true,
      lead: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/leads/:botId
 * Retrieve all captured leads for a specific bot, ordered by newest first.
 */
router.get('/:botId', async (req, res, next) => {
  try {
    const { botId } = req.params;

    const checkBot = await query('SELECT id FROM bots WHERE id = $1', [botId]);
    if (checkBot.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found',
        code: 404
      });
    }

    const sql = `
      SELECT id, bot_id, name, phone, email, message, session_id, created_at
      FROM leads
      WHERE bot_id = $1
      ORDER BY created_at DESC
    `;

    const result = await query(sql, [botId]);

    return res.json({
      success: true,
      leads: result.rows
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
