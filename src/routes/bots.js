/**
 * Bots Management Router
 * Handles CRUD operations for AI chatbots, bot template instantiation, and widget embed code generation.
 */

const express = require('express');
const { query } = require('../db/database');
const { BOT_TEMPLATES } = require('../templates/botTemplates');
const config = require('../config/env');

const router = express.Router();

/**
 * POST /api/bots
 * Create a new AI bot using a chosen template persona.
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      name,
      botType = 'general',
      websiteUrl,
      description,
      welcomeMessage,
      color = '#6366f1',
      position = 'bottom-right',
      whatsappNumber,
      leadCaptureEnabled = false
    } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Bot name is required.',
        code: 400
      });
    }

    const cleanName = name.trim();
    const selectedTemplate = BOT_TEMPLATES[botType] || BOT_TEMPLATES.general;

    // Populate system prompt with bot name
    const systemPrompt = selectedTemplate.systemPrompt.replace(/\{bot_name\}/g, cleanName);
    const initialWelcome = welcomeMessage && welcomeMessage.trim().length > 0
      ? welcomeMessage.trim()
      : selectedTemplate.welcomeMessage.replace(/\{bot_name\}/g, cleanName);

    const insertSql = `
      INSERT INTO bots (
        name,
        bot_type,
        website_url,
        description,
        system_prompt,
        welcome_message,
        color,
        position,
        whatsapp_number,
        lead_capture_enabled,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
      RETURNING *
    `;

    const values = [
      cleanName,
      botType,
      websiteUrl || null,
      description || null,
      systemPrompt,
      initialWelcome,
      color,
      position,
      whatsappNumber || null,
      Boolean(leadCaptureEnabled)
    ];

    const result = await query(insertSql, values);
    const newBot = result.rows[0];

    return res.status(201).json({
      success: true,
      bot: newBot
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bots/:id
 * Retrieve full bot configuration and chunk count.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const sql = `SELECT * FROM bots WHERE id = $1`;
    const result = await query(sql, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found',
        code: 404
      });
    }

    return res.json({
      success: true,
      bot: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/bots/:id
 * Update bot settings and appearance.
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      welcomeMessage,
      color,
      position,
      whatsappNumber,
      leadCaptureEnabled,
      systemPrompt,
      description,
      websiteUrl
    } = req.body;

    // Check if bot exists
    const checkSql = `SELECT * FROM bots WHERE id = $1`;
    const checkRes = await query(checkSql, [id]);

    if (checkRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found',
        code: 404
      });
    }

    const currentBot = checkRes.rows[0];

    const updatedName = name !== undefined ? name.trim() : currentBot.name;
    const updatedWelcome = welcomeMessage !== undefined ? welcomeMessage : currentBot.welcome_message;
    const updatedColor = color !== undefined ? color : currentBot.color;
    const updatedPosition = position !== undefined ? position : currentBot.position;
    const updatedWhatsapp = whatsappNumber !== undefined ? whatsappNumber : currentBot.whatsapp_number;
    const updatedLeadCapture = leadCaptureEnabled !== undefined ? Boolean(leadCaptureEnabled) : currentBot.lead_capture_enabled;
    const updatedSystemPrompt = systemPrompt !== undefined ? systemPrompt : currentBot.system_prompt;
    const updatedDescription = description !== undefined ? description : currentBot.description;
    const updatedWebsiteUrl = websiteUrl !== undefined ? websiteUrl : currentBot.website_url;

    const updateSql = `
      UPDATE bots
      SET
        name = $1,
        welcome_message = $2,
        color = $3,
        position = $4,
        whatsapp_number = $5,
        lead_capture_enabled = $6,
        system_prompt = $7,
        description = $8,
        website_url = $9,
        updated_at = NOW()
      WHERE id = $10
      RETURNING *
    `;

    const updateValues = [
      updatedName,
      updatedWelcome,
      updatedColor,
      updatedPosition,
      updatedWhatsapp,
      updatedLeadCapture,
      updatedSystemPrompt,
      updatedDescription,
      updatedWebsiteUrl,
      id
    ];

    const result = await query(updateSql, updateValues);

    return res.json({
      success: true,
      bot: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bots/:id/embed-code
 * Retrieve embedding script and instructions for embedding on external websites.
 */
router.get('/:id/embed-code', async (req, res, next) => {
  try {
    const { id } = req.params;

    const checkSql = `SELECT id, name FROM bots WHERE id = $1`;
    const checkRes = await query(checkSql, [id]);

    if (checkRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found',
        code: 404
      });
    }

    const host = req.get('host') || `localhost:${config.port}`;
    const protocol = req.protocol || 'http';
    const baseUrl = `${protocol}://${host}`;

    const scriptTag = `<script src="${baseUrl}/widget/widget.js" data-bot-id="${id}" async></script>`;

    return res.json({
      success: true,
      data: {
        botId: id,
        scriptTag,
        instructions: 'Paste this script tag right before the closing </body> tag on any web page where you want the RouteIQ chat assistant to appear.'
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/bots/:id
 * Permanently delete a bot and cascade delete its chunks, messages, and leads.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const deleteSql = `DELETE FROM bots WHERE id = $1 RETURNING id`;
    const result = await query(deleteSql, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found',
        code: 404
      });
    }

    return res.json({
      success: true,
      message: 'Bot and associated data deleted successfully',
      id
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
