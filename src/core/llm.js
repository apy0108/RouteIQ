/**
 * LLM Integration Module
 * Interacts with the Ollama Chat API (e.g. gemma2:2b) to generate context-grounded conversational answers.
 */

const axios = require('axios');
const config = require('../config/env');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Builds the grounded system prompt and contextual message for the LLM.
 *
 * @param {object} botConfig - Bot settings object
 * @param {Array<{ content: string, sourceUrl?: string, sourceType?: string }>} context - Retrieved chunks
 * @returns {string} Complete formatted system instructions
 */
function buildSystemInstruction(botConfig, context) {
  const rawPrompt = botConfig.system_prompt || botConfig.systemPrompt || 'You are a helpful assistant for {bot_name}.';
  const botName = botConfig.name || 'Assistant';
  const personalizedPrompt = rawPrompt.replace(/\{bot_name\}/g, botName);

  let contextSection = 'No business context available.';
  if (context && context.length > 0) {
    contextSection = context
      .map((chunk, idx) => {
        const source = chunk.sourceUrl ? ` (Source: ${chunk.sourceUrl})` : '';
        return `[Chunk ${idx + 1}${source}]:\n${chunk.content}`;
      })
      .join('\n\n');
  }

  return `${personalizedPrompt}

=== GROUNDED BUSINESS CONTEXT ===
${contextSection}
================================

CRITICAL INSTRUCTIONS:
1. Ground every answer strictly in the business context provided above.
2. If the user's question cannot be answered using the provided context, politely inform them that you do not have that specific information and suggest contacting the business directly.
3. Keep responses helpful, concise, and professional.
4. Do not mention "chunks" or "provided context" to the customer; speak naturally on behalf of the business.`;
}

/**
 * Generates an AI response from Ollama with timeout handling and automatic single-retry.
 *
 * @param {object} botConfig - Bot configuration (name, system_prompt, etc.)
 * @param {Array<{ content: string, sourceUrl?: string }>} context - Relevant context chunks
 * @param {string} userMessage - User's current input message
 * @param {Array<{ role: string, content: string }>} [chatHistory=[]] - Recent conversation history
 * @returns {Promise<string>} Generated AI response
 */
async function generateResponse(botConfig, context = [], userMessage, chatHistory = []) {
  const systemInstruction = buildSystemInstruction(botConfig, context);

  // Take the last 6 messages of chat history for contextual continuity
  const recentHistory = (chatHistory || []).slice(-6).map((msg) => ({
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: msg.content
  }));

  const messages = [
    { role: 'system', content: systemInstruction },
    ...recentHistory,
    { role: 'user', content: userMessage }
  ];

  const payload = {
    model: config.ollama.chatModel,
    messages,
    stream: false,
    options: {
      temperature: 0.3
    }
  };

  const endpoint = `${config.ollama.baseUrl}/api/chat`;

  const makeRequest = async () => {
    const response = await axios.post(endpoint, payload, {
      timeout: 30000 // 30 seconds timeout
    });

    if (!response.data || !response.data.message || typeof response.data.message.content !== 'string') {
      throw new Error('Invalid response structure from Ollama chat API');
    }

    return response.data.message.content.trim();
  };

  let responseText;

  try {
    responseText = await makeRequest();
  } catch (firstErr) {
    console.warn(`⚠️ Ollama chat request failed (${firstErr.message}). Retrying in 1.5s...`);
    await sleep(1500);
    try {
      responseText = await makeRequest();
    } catch (secondErr) {
      console.error(`❌ Ollama chat generation failed on retry: ${secondErr.message}`);
      throw new Error(`LLM generation failed: ${secondErr.message}`);
    }
  }

  // If relevant source URLs exist in context, append them to the response if not already present
  const validSourceUrls = Array.from(
    new Set(context.map((c) => c.sourceUrl).filter((url) => typeof url === 'string' && url.startsWith('http')))
  );

  if (validSourceUrls.length > 0) {
    const hasSourcesMentioned = validSourceUrls.some((url) => responseText.includes(url));
    if (!hasSourcesMentioned) {
      const sourceLinks = validSourceUrls.map((url) => `- ${url}`).join('\n');
      responseText = `${responseText}\n\nSources:\n${sourceLinks}`;
    }
  }

  return responseText;
}

module.exports = {
  generateResponse
};
