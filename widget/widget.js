/**
 * RouteIQ Production-Ready Embeddable Chatbot Widget
 * Pure Vanilla JavaScript & Scoped CSS — Zero external dependencies.
 *
 * Usage:
 * <script src="http://YOUR_ORACLE_IP:3000/widget/widget.js" data-bot-id="YOUR_BOT_ID" async></script>
 */

const ROUTEIQ_API = 'http://YOUR_ORACLE_IP:3000';

(function() {
  'use strict';

  try {
    // 1. Locate the widget's script tag to extract data-bot-id and dynamic API base URL
    const currentScript =
      document.currentScript ||
      document.querySelector('script[data-bot-id]') ||
      document.querySelector('script[src*="widget.js"]');

    if (!currentScript) return;

    const botId = currentScript.getAttribute('data-bot-id');
    if (!botId) {
      // Silently exit if no bot ID is provided
      return;
    }

    // Determine API origin: prefer script origin if valid, fallback to ROUTEIQ_API
    let apiBase = ROUTEIQ_API;
    try {
      if (currentScript.src && currentScript.src.startsWith('http')) {
        const scriptUrl = new URL(currentScript.src);
        apiBase = scriptUrl.origin;
      }
    } catch {
      apiBase = ROUTEIQ_API;
    }

    // Storage Keys
    const SESSION_KEY = `routeiq_session_${botId}`;
    const MESSAGES_KEY = `routeiq_messages_${botId}`;
    const LEAD_DISMISSED_KEY = `routeiq_lead_dismissed_${botId}`;

    // Get or initialize Session ID
    let sessionId = '';
    try {
      sessionId = localStorage.getItem(SESSION_KEY);
      if (!sessionId) {
        sessionId = 'riq_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem(SESSION_KEY, sessionId);
      }
    } catch {
      sessionId = 'riq_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    }

    // State Variables
    let botConfig = null;
    let isOpen = false;
    let userMessageCount = 0;
    let isTyping = false;

    // Helper: Save messages to localStorage (keep last 20)
    function saveMessageHistory(messages) {
      try {
        const trimmed = messages.slice(-20);
        localStorage.setItem(MESSAGES_KEY, JSON.stringify(trimmed));
      } catch {}
    }

    // Helper: Load message history from localStorage
    function loadMessageHistory() {
      try {
        const raw = localStorage.getItem(MESSAGES_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    }

    // 2. Fetch Bot Configuration from RouteIQ API
    fetch(`${apiBase}/api/bots/${botId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!data.success || !data.bot) return;
        botConfig = data.bot;
        initWidget(botConfig);
      })
      .catch((err) => {
        console.warn('[RouteIQ Widget] Initialization failed:', err.message);
      });

    // 3. Main Widget Initialization and DOM Creation
    function initWidget(bot) {
      const primaryColor = bot.color || '#6366f1';
      const position = bot.position === 'bottom-left' ? 'bottom-left' : 'bottom-right';
      const isLeft = position === 'bottom-left';
      const botName = bot.name || 'AI Assistant';
      const welcomeMsg = bot.welcome_message || bot.welcomeMessage || 'Hi! How can I help you today?';
      const whatsappNumber = bot.whatsapp_number || bot.whatsappNumber;
      const leadCaptureEnabled = Boolean(bot.lead_capture_enabled || bot.leadCaptureEnabled);

      // Inject Scoped Stylesheet
      const styleTag = document.createElement('style');
      styleTag.id = 'routeiq-styles';
      styleTag.textContent = `
        #routeiq-container {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 14px;
          line-height: 1.4;
          box-sizing: border-box;
        }
        #routeiq-container * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        #routeiq-bubble {
          position: fixed;
          bottom: 20px;
          ${isLeft ? 'left: 20px;' : 'right: 20px;'}
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: ${primaryColor};
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
          cursor: pointer;
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          user-select: none;
        }
        #routeiq-bubble:hover {
          transform: scale(1.08);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
        }
        #routeiq-bubble:active {
          transform: scale(0.95);
        }
        #routeiq-bubble svg {
          width: 28px;
          height: 28px;
          fill: #ffffff;
          transition: transform 0.2s ease;
        }
        #routeiq-window {
          position: fixed;
          bottom: 86px;
          ${isLeft ? 'left: 20px;' : 'right: 20px;'}
          width: 360px;
          height: 520px;
          max-height: calc(100vh - 100px);
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18), 0 0 1px rgba(0,0,0,0.1);
          z-index: 999998;
          display: none;
          flex-direction: column;
          overflow: hidden;
        }
        #routeiq-window.riq-open {
          display: flex;
        }
        .riq-header {
          background: ${primaryColor};
          color: #ffffff;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-radius: 16px 16px 0 0;
          user-select: none;
        }
        .riq-header-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .riq-avatar {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 15px;
        }
        .riq-header-title {
          font-weight: 600;
          font-size: 15px;
          color: #ffffff;
        }
        .riq-header-status {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.85);
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .riq-status-dot {
          width: 7px;
          height: 7px;
          background: #4ade80;
          border-radius: 50%;
          display: inline-block;
        }
        .riq-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .riq-icon-btn {
          background: transparent;
          border: none;
          color: #ffffff;
          cursor: pointer;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s ease;
        }
        .riq-icon-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .riq-messages {
          flex: 1;
          overflow-y: auto;
          max-height: 340px;
          word-wrap: break-word;
          overflow-wrap: break-word;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: #f8fafc;
        }
        .riq-msg-row {
          display: flex;
          flex-direction: column;
          max-width: 100%;
        }
        .riq-msg-row.riq-user {
          align-self: flex-end;
          align-items: flex-end;
        }
        .riq-msg-row.riq-bot {
          align-self: flex-start;
          align-items: flex-start;
        }
        .riq-msg-bubble,
        .riq-user-msg,
        .riq-bot-msg {
          max-width: 80%;
          word-break: break-word;
          white-space: pre-wrap;
          padding: 10px 14px;
          font-size: 14px;
          line-height: 1.45;
        }
        .riq-user-msg,
        .riq-user .riq-msg-bubble {
          background: ${primaryColor};
          color: #ffffff;
          border-radius: 16px 16px 4px 16px;
        }
        .riq-bot-msg,
        .riq-bot .riq-msg-bubble {
          background: #ffffff;
          color: #1e293b;
          border: 1px solid #e2e8f0;
          border-radius: 16px 16px 16px 4px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .riq-sources {
          margin-top: 4px;
        }
        .riq-sources strong,
        .riq-sources-label {
          font-weight: bold;
          font-size: 11px;
          display: block;
          color: #475569;
        }
        .riq-sources a {
          font-size: 11px;
          color: #6366f1;
          display: block;
          margin-top: 4px;
          word-break: break-all;
          text-decoration: none;
        }
        .riq-sources a:hover {
          text-decoration: underline;
        }
        .riq-typing {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 10px 14px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px 16px 16px 4px;
          align-self: flex-start;
          width: fit-content;
        }
        .riq-dot {
          width: 6px;
          height: 6px;
          background: #94a3b8;
          border-radius: 50%;
          animation: riq-bounce 1.4s infinite ease-in-out both;
        }
        .riq-dot:nth-child(1) { animation-delay: -0.32s; }
        .riq-dot:nth-child(2) { animation-delay: -0.16s; }
        @keyframes riq-bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
        .riq-lead-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.06);
          margin-top: 4px;
          width: 100%;
        }
        .riq-lead-title {
          font-weight: 600;
          font-size: 13px;
          color: #1e293b;
        }
        .riq-lead-input {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 13px;
          outline: none;
        }
        .riq-lead-input:focus {
          border-color: ${primaryColor};
        }
        .riq-lead-actions {
          display: flex;
          gap: 6px;
          margin-top: 4px;
        }
        .riq-lead-btn-submit {
          flex: 1;
          background: ${primaryColor};
          color: #ffffff;
          border: none;
          border-radius: 6px;
          padding: 7px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .riq-lead-btn-cancel {
          background: #f1f5f9;
          color: #64748b;
          border: none;
          border-radius: 6px;
          padding: 7px 10px;
          font-size: 12px;
          cursor: pointer;
        }
        .riq-input-area {
          border-top: 1px solid #e2e8f0;
          padding: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          background: #ffffff;
        }
        .riq-input,
        textarea.riq-input,
        input.riq-input {
          flex: 1;
          min-height: 40px;
          border-radius: 24px;
          border: 1px solid #cbd5e1;
          padding: 10px 14px;
          font-size: 14px;
          outline: none;
          color: #1e293b;
          background: #f8fafc;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .riq-input:focus,
        textarea.riq-input:focus,
        input.riq-input:focus {
          border-color: ${primaryColor};
          background: #ffffff;
        }
        .riq-send-btn {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: ${primaryColor};
          border: none;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.15s ease, opacity 0.15s ease;
          flex-shrink: 0;
        }
        .riq-send-btn:hover {
          transform: scale(1.05);
        }
        .riq-send-btn:active {
          transform: scale(0.95);
        }
        .riq-send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
        @media (max-width: 480px) {
          #routeiq-window {
            width: 100vw !important;
            height: 100% !important;
            max-height: 100vh !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            border-radius: 0 !important;
          }
          .riq-header {
            border-radius: 0 !important;
          }
          #routeiq-bubble {
            bottom: 16px;
            ${isLeft ? 'left: 16px;' : 'right: 16px;'}
          }
        }
      `;
      document.head.appendChild(styleTag);

      // Create Container
      const container = document.createElement('div');
      container.id = 'routeiq-container';

      // SVG Icons
      const chatIconSvg = `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;
      const closeIconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      const sendIconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
      const whatsappIconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.698.058-2.128-.535-1.785-.741-2.92-2.58-3.007-2.7-.087-.116-.713-.951-.713-1.815 0-.865.452-1.29.613-1.464.161-.174.351-.217.469-.217.118 0 .236.002.339.006.109.006.255-.041.398.303.145.348.498 1.215.542 1.303.044.088.073.191.015.306-.058.117-.088.19-.175.293-.088.102-.185.228-.264.307-.088.087-.18.182-.078.358.102.175.454.75 0.974 1.213.67.597 1.235.782 1.41.87.175.088.277.073.38-.045.103-.117.439-.512.556-.688.117-.175.234-.146.394-.088.16.059 1.02.481 1.196.569.175.088.293.131.336.205.044.073.044.423-.1 0.828z"/></svg>`;

      // HTML Template
      container.innerHTML = `
        <div id="routeiq-bubble" title="Chat with ${botName}">
          ${chatIconSvg}
        </div>
        <div id="routeiq-window">
          <div class="riq-header">
            <div class="riq-header-info">
              <div class="riq-avatar">${botName.charAt(0).toUpperCase()}</div>
              <div>
                <div class="riq-header-title">${botName}</div>
                <div class="riq-header-status">
                  <span class="riq-status-dot"></span> Online
                </div>
              </div>
            </div>
            <div class="riq-header-actions">
              ${
                whatsappNumber
                  ? `<a href="https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}" target="_blank" rel="noopener noreferrer" class="riq-icon-btn" title="Chat on WhatsApp">${whatsappIconSvg}</a>`
                  : ''
              }
              <button class="riq-icon-btn riq-close-btn" title="Close chat">${closeIconSvg}</button>
            </div>
          </div>
          <div class="riq-messages" id="riq-messages-list"></div>
          <div class="riq-input-area">
            <input type="text" class="riq-input" id="riq-user-input" placeholder="Ask a question..." autocomplete="off" />
            <button class="riq-send-btn" id="riq-send-btn" title="Send message">
              ${sendIconSvg}
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(container);

      // DOM Elements
      const bubbleEl = container.querySelector('#routeiq-bubble');
      const windowEl = container.querySelector('#routeiq-window');
      const closeBtn = container.querySelector('.riq-close-btn');
      const messagesList = container.querySelector('#riq-messages-list');
      const inputEl = container.querySelector('#riq-user-input');
      const sendBtn = container.querySelector('#riq-send-btn');

      // Scroll Helper
      function scrollToBottom() {
        messagesList.scrollTop = messagesList.scrollHeight;
      }

      // Append Message to DOM
      function renderMessage(role, text, sources = []) {
        const row = document.createElement('div');
        row.className = `riq-msg-row riq-${role}`;

        const bubble = document.createElement('div');
        bubble.className = `riq-msg-bubble riq-${role}-msg`;
        bubble.textContent = text;
        row.appendChild(bubble);

        if (role === 'bot' && sources && sources.length > 0) {
          const sourcesDiv = document.createElement('div');
          sourcesDiv.className = 'riq-sources';

          const label = document.createElement('strong');
          label.className = 'riq-sources-label';
          label.textContent = 'Sources:';
          sourcesDiv.appendChild(label);

          sources.forEach((s) => {
            const link = document.createElement('a');
            const url = typeof s === 'string' ? s : (s.url || '#');
            const title = typeof s === 'string' ? s : (s.title || s.url || url);
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = title;
            sourcesDiv.appendChild(link);
          });
          row.appendChild(sourcesDiv);
        }

        messagesList.appendChild(row);
        scrollToBottom();
      }

      // Typing Indicator Management
      let typingEl = null;
      function showTyping() {
        if (typingEl) return;
        isTyping = true;
        typingEl = document.createElement('div');
        typingEl.className = 'riq-typing';
        typingEl.innerHTML = `<span class="riq-dot"></span><span class="riq-dot"></span><span class="riq-dot"></span>`;
        messagesList.appendChild(typingEl);
        scrollToBottom();
      }

      function hideTyping() {
        if (typingEl && typingEl.parentNode) {
          typingEl.parentNode.removeChild(typingEl);
        }
        typingEl = null;
        isTyping = false;
      }

      // Render Lead Capture Card
      function renderLeadCaptureCard() {
        const dismissed = sessionStorage.getItem(LEAD_DISMISSED_KEY);
        if (dismissed) return;

        const card = document.createElement('div');
        card.className = 'riq-lead-card';
        card.innerHTML = `
          <div class="riq-lead-title">Want us to follow up with you?</div>
          <input type="text" class="riq-lead-input riq-lead-name" placeholder="Your Name" />
          <input type="text" class="riq-lead-input riq-lead-contact" placeholder="Phone or Email" />
          <div class="riq-lead-actions">
            <button class="riq-lead-btn-submit">Submit</button>
            <button class="riq-lead-btn-cancel">Maybe later</button>
          </div>
        `;

        const submitBtn = card.querySelector('.riq-lead-btn-submit');
        const cancelBtn = card.querySelector('.riq-lead-btn-cancel');
        const nameIn = card.querySelector('.riq-lead-name');
        const contactIn = card.querySelector('.riq-lead-contact');

        cancelBtn.addEventListener('click', () => {
          sessionStorage.setItem(LEAD_DISMISSED_KEY, 'true');
          card.remove();
        });

        submitBtn.addEventListener('click', () => {
          const name = nameIn.value.trim();
          const contact = contactIn.value.trim();
          if (!contact) {
            contactIn.style.borderColor = '#ef4444';
            return;
          }

          const isEmail = contact.includes('@');
          const payload = {
            botId,
            name: name || 'Website Visitor',
            phone: isEmail ? null : contact,
            email: isEmail ? contact : null,
            sessionId
          };

          fetch(`${apiBase}/api/leads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
            .then(() => {
              sessionStorage.setItem(LEAD_DISMISSED_KEY, 'true');
              card.innerHTML = `<div style="font-size: 13px; color: #16a34a; font-weight: 500;">✓ Thanks! We'll be in touch.</div>`;
              setTimeout(() => card.remove(), 2500);
            })
            .catch(() => {
              card.remove();
            });
        });

        messagesList.appendChild(card);
        scrollToBottom();
      }

      // Load Saved Chat History or Show Welcome Message
      const savedMessages = loadMessageHistory();
      if (savedMessages.length > 0) {
        savedMessages.forEach((m) => renderMessage(m.role, m.text, m.sources));
      } else {
        renderMessage('bot', welcomeMsg);
        saveMessageHistory([{ role: 'bot', text: welcomeMsg }]);
      }

      // Window Visibility Toggle
      function openChat() {
        isOpen = true;
        windowEl.style.display = 'flex';
        windowEl.classList.add('riq-open');
        setTimeout(() => {
          inputEl.focus();
          scrollToBottom();
        }, 100);
      }

      function closeChat() {
        isOpen = false;
        windowEl.style.display = 'none';
        windowEl.classList.remove('riq-open');
      }

      function toggleChat() {
        if (isOpen) {
          closeChat();
        } else {
          openChat();
        }
      }

      bubbleEl.addEventListener('click', toggleChat);
      closeBtn.addEventListener('click', closeChat);

      // Handle Sending User Messages
      function sendMessage() {
        const text = inputEl.value.trim();
        if (!text || isTyping) return;

        // 1. Clear input immediately
        inputEl.value = '';

        // 2. Display user message
        renderMessage('user', text);
        userMessageCount++;

        const currentHistory = loadMessageHistory();
        currentHistory.push({ role: 'user', text });
        saveMessageHistory(currentHistory);

        // 3. Show typing indicator
        showTyping();

        // 4. Send to RouteIQ API
        fetch(`${apiBase}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            botId,
            message: text,
            sessionId
          })
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          })
          .then((data) => {
            hideTyping();
            if (data.success && data.reply) {
              renderMessage('bot', data.reply, data.sources || []);
              currentHistory.push({ role: 'bot', text: data.reply, sources: data.sources || [] });
              saveMessageHistory(currentHistory);

              // 5. Lead Capture trigger after 3 user messages
              if (leadCaptureEnabled && userMessageCount === 3) {
                renderLeadCaptureCard();
              }
            } else {
              renderMessage('bot', data.error || "Sorry, I'm having trouble connecting. Please try again.");
            }
          })
          .catch(() => {
            hideTyping();
            renderMessage('bot', "Sorry, I'm having trouble connecting. Please try again.");
          });
      }

      sendBtn.addEventListener('click', sendMessage);
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendMessage();
        }
      });
    }
  } catch (globalError) {
    // Fail completely silent to prevent any disturbance on the host website
    console.warn('[RouteIQ Widget] Error:', globalError.message);
  }
})();
