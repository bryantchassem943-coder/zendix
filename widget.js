(function() {
  var scriptTag = document.currentScript || (function() {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var CLIENT_ID       = scriptTag.getAttribute('data-client-id') || 'scalmind_ia';
  var API_BASE         = scriptTag.getAttribute('data-api-base') || 'https://zendix-pro.onrender.com';
  var PRIMARY_COLOR   = scriptTag.getAttribute('data-color') || '#1d4ed8';
  var PRIMARY_COLOR_2 = scriptTag.getAttribute('data-color-2') || '#0ea5e9';
  var TEASER_TEXT      = scriptTag.getAttribute('data-teaser') || 'Besoin d\'aide ? Je suis en ligne 👋';
  var TEASER_DELAY     = parseInt(scriptTag.getAttribute('data-teaser-delay') || '4000', 10);

  var SESSION_KEY = 'zendix_widget_session_' + CLIENT_ID;
  var TEASER_SEEN_KEY = 'zendix_widget_teaser_seen_' + CLIENT_ID;
  var sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = 'web_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  // ── STYLES ──
  var style = document.createElement('style');
  style.textContent =
    '#zdx-widget-launcher { position:fixed; bottom:22px; right:22px; z-index:999999; display:flex; flex-direction:column; align-items:flex-end; gap:12px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif; }' +

    '#zdx-widget-teaser { max-width:250px; background:#fff; border-radius:14px 14px 4px 14px; box-shadow:0 8px 28px rgba(0,0,0,0.16); padding:13px 16px; font-size:13.5px; color:#1e293b; line-height:1.4; cursor:pointer; opacity:0; transform:translateY(10px) scale(0.95); transition:opacity .35s ease, transform .35s ease; pointer-events:none; position:relative; }' +
    '#zdx-widget-teaser.zdx-show { opacity:1; transform:translateY(0) scale(1); pointer-events:auto; }' +
    '#zdx-widget-teaser .zdx-teaser-close { position:absolute; top:-7px; right:-7px; width:20px; height:20px; border-radius:50%; background:#fff; border:1px solid #e2e8f0; color:#94a3b8; font-size:12px; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 1px 4px rgba(0,0,0,0.1); }' +

    '#zdx-widget-bubble { position:relative; width:62px; height:62px; border-radius:50%; background:linear-gradient(135deg,' + PRIMARY_COLOR + ',' + PRIMARY_COLOR_2 + '); box-shadow:0 6px 22px rgba(29,78,216,0.35); display:flex; align-items:center; justify-content:center; cursor:pointer; border:none; padding:0; transition:transform .18s; animation:zdxEntrance .5s cubic-bezier(.34,1.56,.64,1) .2s backwards; }' +
    '#zdx-widget-bubble:hover { transform:scale(1.07); }' +
    '#zdx-widget-bubble svg { width:26px; height:26px; fill:#fff; transition:opacity .15s, transform .15s; }' +
    '#zdx-widget-bubble .zdx-icon-close { position:absolute; opacity:0; transform:scale(0.5) rotate(-45deg); }' +
    '#zdx-widget-bubble.zdx-active .zdx-icon-chat { opacity:0; transform:scale(0.5) rotate(45deg); }' +
    '#zdx-widget-bubble.zdx-active .zdx-icon-close { opacity:1; transform:scale(1) rotate(0deg); }' +
    '@keyframes zdxEntrance { 0% { transform:scale(0); opacity:0; } 100% { transform:scale(1); opacity:1; } }' +
    '#zdx-widget-ring { position:absolute; inset:0; border-radius:50%; border:2px solid ' + PRIMARY_COLOR_2 + '; opacity:0; pointer-events:none; }' +
    '#zdx-widget-ring.zdx-pulse { animation:zdxRing 1.6s ease-out; }' +
    '@keyframes zdxRing { 0% { transform:scale(1); opacity:0.7; } 100% { transform:scale(1.6); opacity:0; } }' +
    '#zdx-widget-bubble.zdx-wiggle { animation:zdxWiggle .5s ease; }' +
    '@keyframes zdxWiggle { 0%,100% { transform:rotate(0); } 20% { transform:rotate(-9deg) scale(1.04); } 40% { transform:rotate(8deg) scale(1.04); } 60% { transform:rotate(-6deg); } 80% { transform:rotate(4deg); } }' +
    '#zdx-widget-badge { position:absolute; top:-3px; right:-3px; width:16px; height:16px; border-radius:50%; background:#ef4444; border:2px solid #fff; }' +
    '#zdx-widget-badge.zdx-hidden { display:none; }' +

    '#zdx-widget-panel { position:fixed; bottom:96px; right:22px; width:368px; max-width:92vw; height:540px; max-height:76vh; background:#fff; border-radius:18px; box-shadow:0 16px 48px rgba(0,0,0,0.25); display:flex; flex-direction:column; overflow:hidden; z-index:999999; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif; opacity:0; transform:translateY(16px) scale(0.97); pointer-events:none; transition:opacity .22s ease, transform .22s ease; transform-origin:bottom right; }' +
    '#zdx-widget-panel.zdx-open { opacity:1; transform:translateY(0) scale(1); pointer-events:auto; }' +

    '#zdx-widget-header { background:linear-gradient(135deg,' + PRIMARY_COLOR + ',' + PRIMARY_COLOR_2 + '); padding:18px; color:#fff; display:flex; align-items:center; gap:12px; flex-shrink:0; }' +
    '#zdx-widget-avatar { width:38px; height:38px; border-radius:50%; background:rgba(255,255,255,0.22); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:15px; flex-shrink:0; }' +
    '#zdx-widget-header .zdx-header-text { flex:1; min-width:0; }' +
    '#zdx-widget-header .zdx-title { font-weight:700; font-size:14.5px; }' +
    '#zdx-widget-header .zdx-sub { font-size:11.5px; opacity:0.88; margin-top:1px; display:flex; align-items:center; gap:5px; }' +
    '#zdx-widget-header .zdx-online-dot { width:7px; height:7px; border-radius:50%; background:#4ade80; display:inline-block; }' +
    '#zdx-widget-close-x { cursor:pointer; opacity:0.9; font-size:20px; background:none; border:none; color:#fff; padding:4px; line-height:1; flex-shrink:0; }' +
    '#zdx-widget-close-x:hover { opacity:1; }' +

    '#zdx-widget-body { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; background:#f8fafc; }' +
    '.zdx-msg { max-width:80%; padding:9px 13px; border-radius:14px; font-size:13.5px; line-height:1.45; white-space:pre-wrap; word-wrap:break-word; animation:zdxMsgIn .2s ease; }' +
    '@keyframes zdxMsgIn { 0% { opacity:0; transform:translateY(6px); } 100% { opacity:1; transform:translateY(0); } }' +
    '.zdx-msg.zdx-bot { background:#fff; color:#1e293b; align-self:flex-start; border-bottom-left-radius:4px; box-shadow:0 1px 2px rgba(0,0,0,0.06); }' +
    '.zdx-msg.zdx-user { background:linear-gradient(135deg,' + PRIMARY_COLOR + ',' + PRIMARY_COLOR_2 + '); color:#fff; align-self:flex-end; border-bottom-right-radius:4px; }' +
    '.zdx-msg.zdx-user.zdx-recording-msg { opacity:0.65; font-style:italic; }' +

    '#zdx-widget-inputrow { display:flex; align-items:center; gap:8px; padding:12px; border-top:1px solid #eef1f4; background:#fff; flex-shrink:0; }' +
    '#zdx-widget-input { flex:1; border:1px solid #e2e8f0; border-radius:20px; padding:9px 14px; font-size:13.5px; outline:none; font-family:inherit; min-width:0; }' +
    '#zdx-widget-input:focus { border-color:' + PRIMARY_COLOR + '; }' +
    '.zdx-icon-btn { width:36px; height:36px; border-radius:50%; border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; padding:0; transition:background .15s; }' +
    '#zdx-widget-mic { background:#f1f5f9; color:#64748b; }' +
    '#zdx-widget-mic:hover { background:#e2e8f0; }' +
    '#zdx-widget-mic.zdx-recording { background:#fee2e2; color:#dc2626; animation:zdxPulse 1s infinite; }' +
    '@keyframes zdxPulse { 0%,100%{opacity:1;} 50%{opacity:0.5;} }' +
    '#zdx-widget-send { background:linear-gradient(135deg,' + PRIMARY_COLOR + ',' + PRIMARY_COLOR_2 + '); color:#fff; }' +
    '#zdx-widget-send:hover { filter:brightness(1.08); }' +

    '.zdx-typing { display:flex; gap:4px; padding:10px 13px; }' +
    '.zdx-typing span { width:6px; height:6px; border-radius:50%; background:#94a3b8; animation:zdxTyping 1.2s infinite ease-in-out; }' +
    '.zdx-typing span:nth-child(2) { animation-delay:.15s; }' +
    '.zdx-typing span:nth-child(3) { animation-delay:.3s; }' +
    '@keyframes zdxTyping { 0%,60%,100%{ transform:translateY(0); opacity:0.4; } 30%{ transform:translateY(-4px); opacity:1; } }' +

    '@media (max-width:480px) { #zdx-widget-panel { width:94vw; right:3vw; height:74vh; bottom:90px; } #zdx-widget-teaser { max-width:220px; } }';
  document.head.appendChild(style);

  // ── CONTENEUR ──
  var launcher = document.createElement('div');
  launcher.id = 'zdx-widget-launcher';
  launcher.innerHTML =
    '<div id="zdx-widget-teaser"><span id="zdx-teaser-text"></span><div class="zdx-teaser-close">&times;</div></div>' +
    '<button id="zdx-widget-bubble" aria-label="Ouvrir le chat">' +
      '<div id="zdx-widget-ring"></div>' +
      '<svg class="zdx-icon-chat" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.03 2 11c0 2.42 1.09 4.63 2.88 6.26L4 22l5.2-1.3c.9.2 1.83.3 2.8.3 5.52 0 10-4.03 10-9S17.52 2 12 2z"/></svg>' +
      '<svg class="zdx-icon-close" viewBox="0 0 24 24"><path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"/></svg>' +
      '<div id="zdx-widget-badge"></div>' +
    '</button>';
  document.body.appendChild(launcher);

  var teaser = document.getElementById('zdx-widget-teaser');
  var teaserText = document.getElementById('zdx-teaser-text');
  var teaserClose = launcher.querySelector('.zdx-teaser-close');
  var bubble = document.getElementById('zdx-widget-bubble');
  var badge = document.getElementById('zdx-widget-badge');
  var ring = document.getElementById('zdx-widget-ring');

  teaserText.textContent = TEASER_TEXT;

  // ── PANNEAU DE CHAT ──
  var panel = document.createElement('div');
  panel.id = 'zdx-widget-panel';
  panel.innerHTML =
    '<div id="zdx-widget-header">' +
      '<div id="zdx-widget-avatar">Z</div>' +
      '<div class="zdx-header-text"><div class="zdx-title" id="zdx-agent-name">Assistant</div><div class="zdx-sub"><span class="zdx-online-dot"></span><span id="zdx-agency-name">En ligne</span></div></div>' +
      '<button id="zdx-widget-close-x" aria-label="Fermer">&times;</button>' +
    '</div>' +
    '<div id="zdx-widget-body"></div>' +
    '<div id="zdx-widget-inputrow">' +
      '<button class="zdx-icon-btn" id="zdx-widget-mic" title="Message vocal" aria-label="Enregistrer un vocal">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>' +
      '</button>' +
      '<input id="zdx-widget-input" placeholder="Écrivez votre message…" autocomplete="off">' +
      '<button class="zdx-icon-btn" id="zdx-widget-send" title="Envoyer" aria-label="Envoyer">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>' +
      '</button>' +
    '</div>';
  document.body.appendChild(panel);

  var bodyEl   = document.getElementById('zdx-widget-body');
  var inputEl  = document.getElementById('zdx-widget-input');
  var micBtn   = document.getElementById('zdx-widget-mic');
  var sendBtn  = document.getElementById('zdx-widget-send');
  var closeX   = document.getElementById('zdx-widget-close-x');
  var avatarEl = document.getElementById('zdx-widget-avatar');

  var isOpen = false;
  var historyLoaded = false;

  function scrollToBottom() { bodyEl.scrollTop = bodyEl.scrollHeight; }

  function addMessage(role, text, elId) {
    var div = document.createElement('div');
    div.className = 'zdx-msg ' + (role === 'user' ? 'zdx-user' : 'zdx-bot');
    if (elId) div.id = elId;
    div.textContent = text;
    bodyEl.appendChild(div);
    scrollToBottom();
    return div;
  }

  function addTyping() {
    var div = document.createElement('div');
    div.className = 'zdx-msg zdx-bot zdx-typing';
    div.id = 'zdx-typing-indicator';
    div.innerHTML = '<span></span><span></span><span></span>';
    bodyEl.appendChild(div);
    scrollToBottom();
  }
  function removeTyping() {
    var t = document.getElementById('zdx-typing-indicator');
    if (t) t.remove();
  }

  function zdxFetch(url, options) {
    options = options || {};
    options.headers = Object.assign({ 'ngrok-skip-browser-warning': 'true' }, options.headers || {});
    return fetch(url, options);
  }

  function loadConfig() {
    zdxFetch(API_BASE + '/api/config?clientId=' + encodeURIComponent(CLIENT_ID))
      .then(function(r) { return r.json(); })
      .then(function(c) {
        var agentName = c.agent_name || 'Assistant';
        var agencyName = c.agency_name || '';
        document.getElementById('zdx-agent-name').textContent = agentName;
        document.getElementById('zdx-agency-name').textContent = agencyName || 'En ligne';
        avatarEl.textContent = (agentName || 'Z').charAt(0).toUpperCase();
      })
      .catch(function() {});
  }

  function loadHistory() {
    if (historyLoaded) return;
    historyLoaded = true;
    zdxFetch(API_BASE + '/api/conversation/' + encodeURIComponent(sessionId) + '?clientId=' + encodeURIComponent(CLIENT_ID))
      .then(function(r) { return r.json(); })
      .then(function(history) {
        if (history && history.length) {
          bodyEl.innerHTML = '';
          history.forEach(function(m) { addMessage(m.role === 'assistant' ? 'bot' : 'user', m.content); });
        } else {
          addMessage('bot', 'Bonjour ! Comment puis-je vous aider ?');
        }
      })
      .catch(function() { addMessage('bot', 'Bonjour ! Comment puis-je vous aider ?'); });
  }

  function hideTeaser() {
    teaser.classList.remove('zdx-show');
    sessionStorage.setItem(TEASER_SEEN_KEY, '1');
  }

  function openPanel() {
    isOpen = true;
    panel.classList.add('zdx-open');
    bubble.classList.add('zdx-active');
    badge.classList.add('zdx-hidden');
    hideTeaser();
    loadHistory();
    setTimeout(function() { inputEl.focus(); }, 150);
  }
  function closePanel() {
    isOpen = false;
    panel.classList.remove('zdx-open');
    bubble.classList.remove('zdx-active');
  }
  function togglePanel() { isOpen ? closePanel() : openPanel(); }

  bubble.addEventListener('click', togglePanel);
  closeX.addEventListener('click', closePanel);
  teaser.addEventListener('click', openPanel);
  teaserClose.addEventListener('click', function(e) { e.stopPropagation(); hideTeaser(); });

  // ── BULLE DE TEASING AUTOMATIQUE (une fois par session navigateur) ──
  if (!sessionStorage.getItem(TEASER_SEEN_KEY)) {
    setTimeout(function() {
      if (!isOpen) { teaser.classList.add('zdx-show'); }
    }, TEASER_DELAY);
  } else {
    badge.classList.add('zdx-hidden');
  }

  // ── ATTENTION PERIODIQUE : relance visuelle discrete (anneau + wiggle) toutes les 12s tant que le chat est ferme ──
  setInterval(function() {
    if (isOpen) return;
    ring.classList.remove('zdx-pulse');
    bubble.classList.remove('zdx-wiggle');
    // force le reflow pour pouvoir rejouer l'animation CSS
    void ring.offsetWidth;
    ring.classList.add('zdx-pulse');
    bubble.classList.add('zdx-wiggle');
  }, 12000);

  function sendText() {
    var text = inputEl.value.trim();
    if (!text) return;
    addMessage('user', text);
    inputEl.value = '';
    addTyping();
    zdxFetch(API_BASE + '/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sessionId: sessionId, clientId: CLIENT_ID })
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        removeTyping();
        addMessage('bot', data.reply || 'Désolé, une erreur est survenue.');
      })
      .catch(function() {
        removeTyping();
        addMessage('bot', 'Connexion impossible pour le moment. Réessayez.');
      });
  }

  sendBtn.addEventListener('click', sendText);
  inputEl.addEventListener('keydown', function(e) { if (e.key === 'Enter') sendText(); });

  // ── VOCAL (transcription uniquement, reponse toujours en texte) ──
  var mediaRecorder = null, chunks = [], isRecording = false;

  function toggleRecording() {
    if (isRecording) { mediaRecorder.stop(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      addMessage('bot', "Votre navigateur ne supporte pas l'enregistrement vocal. Écrivez votre message.");
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
      chunks = [];
      var mimes = ['audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus', 'audio/webm'];
      var chosen = '';
      for (var i = 0; i < mimes.length; i++) {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported(mimes[i])) { chosen = mimes[i]; break; }
      }
      mediaRecorder = chosen ? new MediaRecorder(stream, { mimeType: chosen }) : new MediaRecorder(stream);
      mediaRecorder.ondataavailable = function(e) { if (e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = function() {
        stream.getTracks().forEach(function(t) { t.stop(); });
        isRecording = false;
        micBtn.classList.remove('zdx-recording');
        var blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        var reader = new FileReader();
        reader.onload = function() {
          var base64 = reader.result.split(',')[1];
          sendAudio(base64, blob.type);
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorder.start();
      isRecording = true;
      micBtn.classList.add('zdx-recording');
    }).catch(function() {
      addMessage('bot', "Impossible d'accéder au micro. Vérifiez les autorisations de votre navigateur.");
    });
  }

  function sendAudio(base64, mime) {
    var tempId = 'zdx-temp-' + Date.now();
    var div = addMessage('user', 'Message vocal…', tempId);
    div.classList.add('zdx-recording-msg');
    addTyping();
    zdxFetch(API_BASE + '/api/chat-audio', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId, clientId: CLIENT_ID, audio: base64, audioMime: mime })
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        removeTyping();
        var el = document.getElementById(tempId);
        if (el) {
          el.textContent = data.transcribedText || 'Message vocal';
          el.classList.remove('zdx-recording-msg');
        }
        addMessage('bot', data.reply || 'Désolé, une erreur est survenue.');
      })
      .catch(function() {
        removeTyping();
        var el = document.getElementById(tempId);
        if (el) { el.textContent = "Erreur d'envoi du vocal"; el.classList.remove('zdx-recording-msg'); }
      });
  }

  micBtn.addEventListener('click', toggleRecording);

  loadConfig();
})();