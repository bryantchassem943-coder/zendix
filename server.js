require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const https      = require('https');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 }   = require('uuid');

const app  = express();
const PORT = process.env.PORT || 3000;

process.on('uncaughtException',  function(err) { console.error('FATAL:', err.message); });
process.on('unhandledRejection', function(err) { console.error('REJET:', err); });

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname)));

const GROQ_KEY         = process.env.GROQ_API_KEY;
const SUPABASE_URL     = process.env.SUPABASE_URL;
const SUPABASE_KEY     = process.env.SUPABASE_KEY;
const VERIFY_TOKEN     = process.env.VERIFY_TOKEN    || 'zendix_secret_token';
const ELEVENLABS_KEY   = process.env.ELEVENLABS_API_KEY  || 'sk_2e830af93fd1e9e849227722d7a0b07ac35843f7f98781cd';
const ELEVENLABS_VOICE = process.env.ELEVENLABS_VOICE_ID || 'cgSgspJ2msm6clMCkdW9';
const VOICE_WORD_LIMIT = 100;
const GMAIL_USER       = process.env.GMAIL_USER;
const GMAIL_PASS       = process.env.GMAIL_PASS;
const MEDIA_BUCKET     = 'chat-media';

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const IG_ACCESS_TOKEN   = process.env.IG_ACCESS_TOKEN;

if (!GROQ_KEY)     console.warn('GROQ_API_KEY manquante!');
if (!SUPABASE_URL) console.warn('SUPABASE_URL manquante!');

const supabase = createClient(SUPABASE_URL || '', SUPABASE_KEY || '');

var mailTransporter = null;
if (GMAIL_USER && GMAIL_PASS) {
  mailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  });
  console.log('Email notifications activees:', GMAIL_USER);
}

async function sendHotLeadEmail(toEmail, lead, agencyName) {
  if (!mailTransporter) { console.log('Email hot lead IGNORE: GMAIL_USER/GMAIL_PASS non configures sur le serveur.'); return; }
  if (!toEmail) { console.log('Email hot lead IGNORE: aucun "email de notification" configure pour ce client (onglet Canaux).'); return; }
  try {
    await mailTransporter.sendMail({
      from: '"ZENDIX PRO" <' + GMAIL_USER + '>',
      to: toEmail,
      subject: '🔥 Lead Chaud — ' + (lead.name || 'Nouveau prospect') + ' (' + (lead.score || 0) + '/10)',
      html: `
        <div style="font-family:monospace;background:#04050d;color:#e2e8f0;padding:32px;border-radius:12px;">
          <h2 style="color:#3b82f6;margin-bottom:8px;">🔥 LEAD CHAUD DETECTE</h2>
          <p style="color:#64748b;margin-bottom:24px;">${agencyName || 'ZENDIX PRO'} — NerveCenter Alert</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#64748b;">Nom</td><td style="color:#e2e8f0;font-weight:bold;">${lead.name || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;">Canal</td><td style="color:#e2e8f0;font-weight:bold;text-transform:uppercase;">${lead.channel || 'whatsapp'}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;">Email</td><td style="color:#e2e8f0;">${lead.email || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;">Entreprise</td><td style="color:#e2e8f0;">${lead.company || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;">Budget</td><td style="color:#10b981;font-weight:bold;">${lead.budget || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;">Score</td><td style="color:#fca5a5;font-weight:bold;">${lead.score || 0}/10</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;">Pipeline</td><td style="color:#e2e8f0;">${lead.pipeline_stage || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;">Telephone</td><td style="color:#e2e8f0;">${lead.phone || lead.session_id || '—'}</td></tr>
          </table>
          <div style="margin-top:24px;padding:16px;background:#0d1220;border-radius:8px;border-left:3px solid #10b981;">
            <p style="color:#6ee7b7;margin:0;font-size:0.85rem;">✅ Ce prospect est prêt à être closé. Contactez-le maintenant.</p>
          </div>
          ${lead.channel === 'whatsapp' || !lead.channel ? `<a href="https://wa.me/${lead.phone || ''}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:linear-gradient(135deg,#1d4ed8,#0ea5e9);color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">💬 Ouvrir WhatsApp</a>` : ''}
        </div>
      `
    });
    console.log('Email hot lead envoye a:', toEmail);
  } catch(e) { console.error('Email erreur:', e.message); }
}

function extFromMime(mime) {
  if (!mime) return 'bin';
  var clean = mime.split(';')[0].trim();
  var parts = clean.split('/');
  var ext = parts[1] || 'bin';
  if (ext === 'jpeg') ext = 'jpg';
  if (ext === 'quicktime') ext = 'mov';
  return ext;
}

async function uploadToSupabaseStorage(buffer, mimeType, ext, folder) {
  try {
    var cleanExt = (ext || extFromMime(mimeType)).replace(/[^a-z0-9]/gi, '') || 'bin';
    var fileName = (folder ? folder + '/' : '') + uuidv4() + '.' + cleanExt;
    var up = await supabase.storage.from(MEDIA_BUCKET).upload(fileName, buffer, {
      contentType: mimeType || 'application/octet-stream',
      upsert: false
    });
    if (up.error) { console.error('Supabase storage upload erreur:', up.error.message); return null; }
    var pub = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(fileName);
    return (pub && pub.data && pub.data.publicUrl) ? pub.data.publicUrl : null;
  } catch(e) { console.error('uploadToSupabaseStorage erreur:', e.message); return null; }
}

// ─── TRACKING DES VISITES DU SITE (widget) ────────────────────────────────────
async function trackSiteVisit(clientId, sessionId) {
  try {
    var result = await supabase.from('site_visits').upsert({
      id: uuidv4(),
      client_id: clientId,
      session_id: sessionId,
      created_at: new Date().toISOString()
    }, { onConflict: 'client_id,session_id', ignoreDuplicates: true });
    if (result.error) console.error('trackSiteVisit erreur:', result.error.message);
  } catch(e) { console.error('trackSiteVisit erreur reseau:', e.message); }
}

// ─── GENERATION DE FICHIER .ICS (RDV — zero dependance API tierce) ────────────
function pad2(n) { return (n < 10 ? '0' : '') + n; }

function toICSDate(dateObj) {
  // Format UTC requis par la norme iCalendar : YYYYMMDDTHHMMSSZ
  return dateObj.getUTCFullYear() +
    pad2(dateObj.getUTCMonth() + 1) +
    pad2(dateObj.getUTCDate()) + 'T' +
    pad2(dateObj.getUTCHours()) +
    pad2(dateObj.getUTCMinutes()) +
    pad2(dateObj.getUTCSeconds()) + 'Z';
}

function escapeICSText(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function generateICS(opts) {
  var uid = opts.uid || (uuidv4() + '@zendixpro');
  var now = new Date();
  var start = new Date(opts.startAt);
  var end = new Date(start.getTime() + (opts.durationMinutes || 30) * 60000);

  var lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ZENDIX PRO//RDV//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + uid,
    'DTSTAMP:' + toICSDate(now),
    'DTSTART:' + toICSDate(start),
    'DTEND:' + toICSDate(end),
    'SUMMARY:' + escapeICSText(opts.title || 'Rendez-vous'),
    'DESCRIPTION:' + escapeICSText(opts.description || ''),
    'LOCATION:' + escapeICSText(opts.location || ''),
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return lines.join('\r\n');
}

async function getAgencyConfig(clientId) {
  try {
    var r = await supabase.from('agency_configs').select('*').eq('client_id', clientId).single();
    if (r.data) return r.data;
    return null;
  } catch(e) { return null; }
}

async function getAgencyConfigByPhone(phoneNumberId) {
  try {
    var r = await supabase.from('agency_configs').select('*').eq('phone_number_id', phoneNumberId).single();
    if (r.data) return r.data;
    var def = await supabase.from('agency_configs').select('*').eq('client_id', 'scalmind_ia').single();
    if (def.data) return def.data;
    return null;
  } catch(e) { return null; }
}

async function getAgencyConfigByPageId(pageId) {
  try {
    var r = await supabase.from('agency_configs').select('*').eq('page_id', pageId).single();
    if (r.data) return r.data;
    return null;
  } catch(e) { return null; }
}

async function getAgencyConfigByInstagramId(igAccountId) {
  try {
    var r = await supabase.from('agency_configs').select('*').eq('instagram_account_id', igAccountId).single();
    if (r.data) return r.data;
    return null;
  } catch(e) { return null; }
}

function buildSystemPrompt(config) {
  var base = '';
  if (config && config.agency_name) {
    base += 'Tu es ' + (config.agent_name || 'l\'agent IA') + ' de ' + config.agency_name;
    if (config.agency_desc) base += ', ' + config.agency_desc;
    base += '.\n\n';
    if (config.agency_presentation) base += 'PRESENTATION:\n' + config.agency_presentation + '\n\n';
    if (config.tone) {
      var tones = {
        professionnel: 'serieux et professionnel',
        amical: 'chaleureux et bienveillant',
        dynamique: 'energique et direct',
        luxe: 'elegant et raffine',
        jeune: 'moderne avec des emojis',
        expert: 'technique et analytique'
      };
      base += 'TON: Sois ' + (tones[config.tone] || config.tone) + '.\n\n';
    }
    if (config.services && config.services.length > 0) {
      base += 'NOS SERVICES:\n';
      config.services.forEach(function(s) { base += '- ' + s.name + ': ' + s.price + '\n'; });
      base += '\n';
    }
    if (config.special_instructions) base += 'INSTRUCTIONS:\n' + config.special_instructions + '\n\n';
  } else {
    base += 'Tu es ZENDIX AI, expert en marketing digital.\n\n';
  }
  base += 'Tu reponds en francais. Collecte naturellement le nom, email, entreprise, budget et objectif du prospect. ';
  base += 'Des que le prospect confirme un interet reel (envie de visiter, d\'etre recontacte, de prendre RDV), demande-lui EXPLICITEMENT par quel moyen il prefere etre recontacte (telephone, email ou WhatsApp) avant de le mettre en relation avec un conseiller. ';
  base += 'A la FIN de CHAQUE reponse ajoute EXACTEMENT ce bloc (sans le modifier): ';
  base += '[DATA]{"lead_info":{"nom":null,"email":null,"entreprise":null,"budget":null,"objectif":null,"moyen_contact":null},"lead_score":0,"score_reason":"","info_collected":false}[/DATA]. ';
  base += 'Score 1-10: 1-3 curieux, 4-6 projet vague, 7-8 budget confirme, 9-10 urgent avec email.';
  return base;
}

async function loadHistory(sessionId, clientId) {
  try {
    var r = await supabase.from('chat_history')
      .select('role, message, media_url, media_type, created_at')
      .eq('session_id', sessionId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })
      .limit(30);
    if (r.data && r.data.length > 0) {
      return r.data.map(function(m) {
        return { role: m.role, content: m.message, media_url: m.media_url || null, media_type: m.media_type || null, created_at: m.created_at || null };
      });
    }
    return [];
  } catch(e) { return []; }
}

function toGroqMessages(history) {
  return history.map(function(m) { return { role: m.role, content: m.content }; });
}

async function saveMessage(sessionId, clientId, channel, role, message, mediaUrl, mediaType) {
  try {
    var payload = {
      id: uuidv4(),
      client_id: clientId,
      session_id: sessionId,
      channel: channel || 'whatsapp',
      role: role,
      message: message,
      created_at: new Date().toISOString()
    };
    if (mediaUrl)  payload.media_url  = mediaUrl;
    if (mediaType) payload.media_type = mediaType;
    var result = await supabase.from('chat_history').insert(payload);
    if (result.error) console.error('saveMessage erreur Supabase:', result.error.message);
  } catch(e) { console.error('saveMessage erreur reseau:', e.message); }
}

var sessionCache = new Map();
function getSessionCache(key) {
  if (!sessionCache.has(key)) {
    sessionCache.set(key, { leadInfo:{}, leadScore:0, leadSent:false, turns:0, notifSent:false });
  }
  return sessionCache.get(key);
}

function groqRequest(messages) {
  return new Promise(function(resolve, reject) {
    var body = JSON.stringify({ model:'llama-3.1-8b-instant', messages:messages, temperature:0.8, max_tokens:1024 });
    var options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_KEY,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          var parsed = JSON.parse(data);
          if (parsed.error) reject(new Error('Groq: ' + parsed.error.message));
          else {
            var text = parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
            if (text) resolve(text);
            else reject(new Error('Groq vide'));
          }
        } catch(e) { reject(new Error('Parse: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', function(e) { reject(new Error('Reseau: ' + e.message)); });
    req.write(body);
    req.end();
  });
}

async function sendWithBackoff(messages, maxRetries) {
  maxRetries = maxRetries || 3;
  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await groqRequest(messages); }
    catch(err) {
      var isRate = /429|quota|rate.limit|too many/i.test(String(err));
      if (isRate && attempt < maxRetries) {
        var wait = 3000 * Math.pow(2, attempt);
        await new Promise(function(r) { setTimeout(r, wait); });
      } else throw err;
    }
  }
}

function extractData(raw) {
  var data = { lead_info:{}, lead_score:0, score_reason:'', info_collected:false };

  var clean = raw
    .replace(/\[DATA\][\s\S]*?\[\/DATA\]/gi, '')
    .replace(/\(DATA\)[\s\S]*?\(\/DATA\)/gi, '')
    .replace(/\[DANS LA BASE DE DONNEES\][\s\S]*?\[\/DANS LA BASE DE DONNEES\]/gi, '')
    .replace(/\[DATABASE\][\s\S]*?\[\/DATABASE\]/gi, '')
    .replace(/\[DATA\][\s\S]*/gi, '')
    .replace(/\(DATA\)[\s\S]*/gi, '')
    .replace(/\[DANS LA BASE DE DONNEES\][\s\S]*/gi, '')
    .replace(/\[DATABASE\][\s\S]*/gi, '')
    .trim();

  var patterns = [
    /\[DATA\]([\s\S]*?)\[\/DATA\]/i,
    /\(DATA\)([\s\S]*?)\(\/DATA\)/i,
    /\[DANS LA BASE DE DONNEES\]([\s\S]*?)\[\/DANS LA BASE DE DONNEES\]/i,
    /\[DATABASE\]([\s\S]*?)\[\/DATABASE\]/i,
  ];

  for (var i = 0; i < patterns.length; i++) {
    var match = patterns[i].exec(raw);
    if (match) {
      try { data = JSON.parse(match[1].trim()); } catch(_) {}
      break;
    }
  }

  return { clean: clean, data: data };
}

function extractEmailFromText(text) {
  var m = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g.exec(text);
  return m ? m[0] : null;
}

function formatPhone(phone) {
  var d = phone.replace(/\D/g, '');
  return d.length >= 10 ? '+' + d : phone;
}

function textToSpeech(text) {
  return new Promise(function(resolve, reject) {
    var body = JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability:0.5, similarity_boost:0.75 }
    });
    var options = {
      hostname: 'api.elevenlabs.io',
      path: '/v1/text-to-speech/' + ELEVENLABS_VOICE,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_KEY,
        'Accept': 'audio/mpeg',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    var req = https.request(options, function(res) {
      var chunks = [];
      res.on('data', function(chunk) { chunks.push(chunk); });
      res.on('end', function() {
        var buffer = Buffer.concat(chunks);
        if (res.headers['content-type'] && res.headers['content-type'].includes('audio')) resolve(buffer);
        else reject(new Error('ElevenLabs: ' + buffer.toString().slice(0, 200)));
      });
    });
    req.on('error', function(e) { reject(new Error('ElevenLabs reseau: ' + e.message)); });
    req.write(body);
    req.end();
  });
}

function uploadAudioToMeta(audioBuffer, phoneNumberId, waToken) {
  return new Promise(function(resolve, reject) {
    var boundary = '----ZendixBoundary' + Date.now();
    var part1 = Buffer.from(
      '--' + boundary + '\r\nContent-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp\r\n' +
      '--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="response.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n'
    );
    var part2 = Buffer.from('\r\n--' + boundary + '--\r\n');
    var formBody = Buffer.concat([part1, audioBuffer, part2]);
    var options = {
      hostname: 'graph.facebook.com',
      path: '/v18.0/' + phoneNumberId + '/media',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + waToken,
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': formBody.length
      }
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          var p = JSON.parse(data);
          if (p.id) resolve(p.id);
          else reject(new Error('Upload Meta: ' + data));
        } catch(e) { reject(new Error('Parse upload: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(formBody);
    req.end();
  });
}

function uploadMediaToMeta(buffer, mimeType, filename, phoneNumberId, waToken) {
  return new Promise(function(resolve, reject) {
    var boundary = '----ZendixMediaBoundary' + Date.now();
    var part1 = Buffer.from(
      '--' + boundary + '\r\nContent-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp\r\n' +
      '--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="' + filename + '"\r\nContent-Type: ' + mimeType + '\r\n\r\n'
    );
    var part2 = Buffer.from('\r\n--' + boundary + '--\r\n');
    var formBody = Buffer.concat([part1, buffer, part2]);
    var options = {
      hostname: 'graph.facebook.com',
      path: '/v18.0/' + phoneNumberId + '/media',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + waToken,
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': formBody.length
      }
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          var p = JSON.parse(data);
          if (p.id) resolve(p.id);
          else reject(new Error('Upload media Meta: ' + data));
        } catch(e) { reject(new Error('Parse upload media: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(formBody);
    req.end();
  });
}

function sendWhatsAppImageById(to, mediaId, phoneNumberId, waToken, caption) {
  return new Promise(function(resolve, reject) {
    var imagePayload = { id: mediaId };
    if (caption) imagePayload.caption = caption;
    var body = JSON.stringify({ messaging_product:'whatsapp', to:to, type:'image', image:imagePayload });
    var options = {
      hostname: 'graph.facebook.com',
      path: '/v18.0/' + phoneNumberId + '/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + waToken,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() { console.log('WA image response:', data); resolve(data); });
    });
    req.on('error', function(e) { reject(e); });
    req.write(body);
    req.end();
  });
}

function sendWhatsAppDocumentById(to, mediaId, phoneNumberId, waToken, filename, caption) {
  return new Promise(function(resolve, reject) {
    var docPayload = { id: mediaId, filename: filename || 'document' };
    if (caption) docPayload.caption = caption;
    var body = JSON.stringify({ messaging_product:'whatsapp', to:to, type:'document', document:docPayload });
    var options = {
      hostname: 'graph.facebook.com',
      path: '/v18.0/' + phoneNumberId + '/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + waToken,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() { console.log('WA document response:', data); resolve(data); });
    });
    req.on('error', function(e) { reject(e); });
    req.write(body);
    req.end();
  });
}

function sendWhatsAppAudioById(to, mediaId, phoneNumberId, waToken) {
  return new Promise(function(resolve, reject) {
    var body = JSON.stringify({ messaging_product:'whatsapp', to:to, type:'audio', audio:{id:mediaId} });
    var options = {
      hostname: 'graph.facebook.com',
      path: '/v18.0/' + phoneNumberId + '/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + waToken,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        console.log('WA audio response:', data);
        try {
          var parsed = JSON.parse(data);
          if (parsed.error) reject(new Error('WhatsApp audio: ' + parsed.error.message));
          else resolve(parsed);
        } catch(e) { reject(new Error('WA audio parse: ' + data.slice(0,200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sendWhatsAppMessage(to, message, phoneNumberId, waToken) {
  return new Promise(function(resolve, reject) {
    var body = JSON.stringify({ messaging_product:'whatsapp', to:to, type:'text', text:{body:message} });
    var options = {
      hostname: 'graph.facebook.com',
      path: '/v18.0/' + phoneNumberId + '/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + waToken,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        console.log('WA response:', data);
        try {
          var parsed = JSON.parse(data);
          if (parsed.error) reject(new Error('WhatsApp API: ' + parsed.error.message));
          else resolve(parsed);
        } catch(e) { reject(new Error('WA parse: ' + data.slice(0,200))); }
      });
    });
    req.on('error', function(e) { reject(e); });
    req.write(body);
    req.end();
  });
}

function sendGraphTextMessage(recipientId, text, accessToken) {
  return new Promise(function(resolve, reject) {
    var body = JSON.stringify({ recipient: { id: recipientId }, message: { text: text } });
    var options = {
      hostname: 'graph.facebook.com',
      path: '/v18.0/me/messages?access_token=' + encodeURIComponent(accessToken || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        console.log('Graph msg response:', data);
        try {
          var parsed = JSON.parse(data);
          if (parsed.error) reject(new Error('Graph API: ' + parsed.error.message));
          else resolve(parsed);
        } catch(e) { reject(new Error('Graph parse: ' + data.slice(0,200))); }
      });
    });
    req.on('error', function(e) { reject(e); });
    req.write(body);
    req.end();
  });
}

function getMetaMediaInfo(mediaId, waToken) {
  return new Promise(function(resolve, reject) {
    var options = {
      hostname: 'graph.facebook.com',
      path: '/v18.0/' + mediaId,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + waToken }
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          var parsed = JSON.parse(data);
          if (parsed.url) resolve(parsed);
          else reject(new Error('Info media: ' + data));
        } catch(e) { reject(new Error('Parse info media: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function downloadMetaMedia(mediaUrl, waToken) {
  return new Promise(function(resolve, reject) {
    var urlObj = new URL(mediaUrl);
    var options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + waToken }
    };
    var req = https.request(options, function(res) {
      var chunks = [];
      res.on('data', function(chunk) { chunks.push(chunk); });
      res.on('end', function() { resolve(Buffer.concat(chunks)); });
    });
    req.on('error', reject);
    req.end();
  });
}

async function transcribeAudioBuffer(audioBuffer) {
  var boundary = '----ZendixWhisper' + Date.now();
  var part1 = Buffer.from(
    '--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="audio.ogg"\r\nContent-Type: audio/ogg\r\n\r\n'
  );
  var part2 = Buffer.from(
    '\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3\r\n--' + boundary + '--\r\n'
  );
  var formBody = Buffer.concat([part1, audioBuffer, part2]);

  return new Promise(function(resolve, reject) {
    var options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/audio/transcriptions',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + GROQ_KEY,
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': formBody.length
      }
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          var parsed = JSON.parse(data);
          if (parsed.text) resolve(parsed.text);
          else reject(new Error('Whisper: ' + data));
        } catch(e) { reject(new Error('Parse Whisper: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(formBody);
    req.end();
  });
}

async function sendSmartReply(to, text, phoneNumberId, waToken) {
  var wordCount = text.trim().split(/\s+/).length;
  console.log('Reponse ' + wordCount + ' mots -> ' + (wordCount > VOICE_WORD_LIMIT ? 'VOCAL' : 'TEXTE'));
  if (wordCount > VOICE_WORD_LIMIT) {
    try {
      var audioBuffer = await textToSpeech(text);
      var mediaId = await uploadAudioToMeta(audioBuffer, phoneNumberId, waToken);
      await sendWhatsAppAudioById(to, mediaId, phoneNumberId, waToken);
    } catch(err) {
      console.error('ElevenLabs echec, fallback texte:', err.message);
      await sendWhatsAppMessage(to, text, phoneNumberId, waToken);
    }
  } else {
    await sendWhatsAppMessage(to, text, phoneNumberId, waToken);
  }
}

async function sendReplyByChannel(channel, to, text, ctx) {
  if (channel === 'whatsapp') {
    await sendSmartReply(to, text, ctx.phoneNumberId, ctx.waToken);
  } else if (channel === 'messenger') {
    await sendGraphTextMessage(to, text, ctx.pageToken || PAGE_ACCESS_TOKEN);
  } else if (channel === 'instagram') {
    await sendGraphTextMessage(to, text, ctx.igToken || IG_ACCESS_TOKEN);
  }
}

async function leadExistsDeja(email, sessionId, clientId) {
  try {
    if (email) {
      var r = await supabase.from('leads').select('id').eq('email', email).eq('client_id', clientId).limit(1);
      if (r.data && r.data.length > 0) return true;
    }
    if (sessionId) {
      var r2 = await supabase.from('leads').select('id').eq('session_id', sessionId).eq('client_id', clientId).limit(1);
      if (r2.data && r2.data.length > 0) return true;
    }
    return false;
  } catch(e) { return false; }
}

async function saveToSupabase(leadInfo, score, reason, sessionId, clientId, channel) {
  channel = channel || 'whatsapp';
  var displayName = leadInfo.nom || (leadInfo.whatsapp ? formatPhone(leadInfo.whatsapp) : (leadInfo.social_id || 'Inconnu'));

  var existing = await supabase.from('leads')
    .select('id')
    .eq('session_id', sessionId)
    .eq('client_id', clientId)
    .single();

  // Pas de match par session_id : on verifie par email avant de creer une ligne,
  // pour eviter un doublon si le meme prospect revient depuis un autre appareil/navigateur
  if (!existing.data && leadInfo.email) {
    var byEmail = await supabase.from('leads')
      .select('id')
      .eq('email', leadInfo.email)
      .eq('client_id', clientId)
      .single();
    if (byEmail.data) existing = byEmail;
  }

  if (existing.data) {
    var updatePayload = {
      name: displayName !== 'Inconnu' ? displayName : undefined,
      email: leadInfo.email || undefined,
      company: leadInfo.entreprise || undefined,
      sector: leadInfo.objectif || undefined,
      budget: leadInfo.budget || undefined,
      contact_preference: leadInfo.moyen_contact || undefined,
      score: score,
      status: score >= 9 ? 'hot' : score >= 7 ? 'warm' : 'new',
      pipeline_stage: score >= 9 ? 'CLOSING' : score >= 7 ? 'DEMO_SCHEDULED' : 'PROSPECT',
      channel: channel,
      session_id: sessionId, // rattache la ligne a la conversation la plus recente
    };
    Object.keys(updatePayload).forEach(function(k) { if (updatePayload[k] === undefined) delete updatePayload[k]; });
    var result = await supabase.from('leads').update(updatePayload).eq('id', existing.data.id);
    if (result.error) console.error('Update erreur:', result.error.message);
    else console.log('Lead mis a jour (dedup):', displayName, score + '/10', '[' + channel + ']');
    return Object.assign({ id: existing.data.id, session_id: sessionId, phone: leadInfo.whatsapp || null, client_id: clientId }, updatePayload);
  } else {
    var payload = {
      id: uuidv4(),
      client_id: clientId,
      name: displayName,
      email: leadInfo.email || null,
      company: leadInfo.entreprise || null,
      sector: leadInfo.objectif || null,
      budget: leadInfo.budget || null,
      contact_preference: leadInfo.moyen_contact || null,
      score: score,
      status: score >= 9 ? 'hot' : score >= 7 ? 'warm' : 'new',
      pipeline_stage: score >= 9 ? 'CLOSING' : score >= 7 ? 'DEMO_SCHEDULED' : 'PROSPECT',
      handling_status: 'a_traiter',
      assigned_to: null,
      session_id: sessionId,
      phone: leadInfo.whatsapp || null,
      channel: channel,
      source: 'ZENDIX_AI',
      created_at: new Date().toISOString()
    };
    var result = await supabase.from('leads').insert(payload);
    if (result.error) console.error('Supabase error:', result.error.message);
    else console.log('Lead sauvegarde:', payload.name, score + '/10', 'client:', clientId, '[' + channel + ']');
    return payload;
  }
}

async function saveNotification(clientId, leadId, type, title, description) {
  try {
    await supabase.from('notifications').insert({
      id: uuidv4(),
      client_id: clientId,
      lead_id: leadId || null,
      type: type,
      title: title,
      description: description,
      is_read: false,
      created_at: new Date().toISOString()
    });
  } catch(e) { console.error('saveNotification erreur:', e.message); }
}

// ─── RELANCE AUTOMATIQUE (declenchee par les pings UptimeRobot, 1x/heure max) ──
const RELANCE_DELAY_MS = 48 * 60 * 60 * 1000; // 48h sans reponse avant relance
const RELANCE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // verifie une fois par heure max
var lastRelanceCheckAt = 0;

async function runRelanceCheck() {
  try {
    var cutoff = new Date(Date.now() - RELANCE_DELAY_MS).toISOString();
    var r = await supabase.from('leads')
      .select('*')
      .is('relance_sent_at', null)
      .neq('status', 'archived')
      .not('email', 'is', null)
      .lt('updated_at', cutoff)
      .gt('score', 0);
    var leads = r.data || [];
    if (!leads.length) return;

    if (!mailTransporter) {
      console.log('Relance auto: ' + leads.length + ' lead(s) eligible(s) mais email non configure (GMAIL_USER/GMAIL_PASS manquants)');
      return;
    }

    console.log('Relance auto: ' + leads.length + ' lead(s) eligible(s)');

    for (var i = 0; i < leads.length; i++) {
      var lead = leads[i];
      if (!lead.email) continue;

      var agencyConfig = await getAgencyConfig(lead.client_id);
      var agencyName = (agencyConfig && agencyConfig.agency_name) || 'notre equipe';
      var agentName  = (agencyConfig && agencyConfig.agent_name) || agencyName;
      var firstName  = (lead.name || '').split(' ')[0] || '';
      var needLine   = lead.sector ? (' concernant ' + lead.sector) : '';

      var subject  = firstName ? ('Toujours interesse, ' + firstName + ' ?') : 'Toujours interesse ?';
      var htmlBody =
        '<div style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.6;max-width:520px;">' +
          '<p>Bonjour' + (firstName ? ' ' + firstName : '') + ',</p>' +
          '<p>Vous aviez echange avec ' + agencyName + needLine + '. Etes-vous toujours interesse(e) ?</p>' +
          '<p>N\'hesitez pas a repondre directement a cet email, ou a revenir sur notre site pour continuer la conversation.</p>' +
          '<p>Cordialement,<br>' + agentName + ' — ' + agencyName + '</p>' +
        '</div>';

      try {
        await mailTransporter.sendMail({
          from: '"' + agencyName + '" <' + GMAIL_USER + '>',
          to: lead.email,
          subject: subject,
          html: htmlBody
        });
        await saveMessage(lead.session_id, lead.client_id, 'web', 'assistant', '[Relance automatique par email envoyee a ' + lead.email + ']');
        await supabase.from('leads').update({ relance_sent_at: new Date().toISOString() }).eq('id', lead.id);
        console.log('Relance email envoyee a:', lead.email);
      } catch(sendErr) {
        console.error('Relance email echec pour', lead.email, ':', sendErr.message);
      }
    }
  } catch(e) { console.error('runRelanceCheck erreur:', e.message); }
}

app.use(function(req, res, next) {
  var now = Date.now();
  if (now - lastRelanceCheckAt > RELANCE_CHECK_INTERVAL_MS) {
    lastRelanceCheckAt = now;
    runRelanceCheck();
  }
  next();
});

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.get('/', function(req, res) { res.sendFile(path.join(__dirname, 'index.html')); });

app.get('/webhook', function(req, res) {
  var mode      = req.query['hub.mode'];
  var token     = req.query['hub.verify_token'];
  var challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verifie!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

async function processIncomingText(params) {
  var from = params.from, text = params.text, clientId = params.clientId;
  var agencyConfig = params.agencyConfig, channel = params.channel, sendCtx = params.sendCtx;
  var mediaUrl = params.mediaUrl || null, mediaType = params.mediaType || null;

  console.log(channel.toUpperCase() + ' [' + clientId + '] de', from, ':', text);

  var history = await loadHistory(from, clientId);
  var session = getSessionCache(from + '_' + clientId);
  session.turns++;

  var groqMessages = [{ role:'system', content: buildSystemPrompt(agencyConfig) }];
  groqMessages = groqMessages.concat(toGroqMessages(history));
  groqMessages.push({ role:'user', content: text });

  var rawText = await sendWithBackoff(groqMessages);

  var extracted = extractData(rawText);
  var clean     = extracted.clean;
  var data      = extracted.data;

  await saveMessage(from, clientId, channel, 'user', text, mediaUrl, mediaType);
  await saveMessage(from, clientId, channel, 'assistant', clean);

  if (data.lead_info) {
    var keys = Object.keys(data.lead_info);
    for (var j = 0; j < keys.length; j++) {
      var k = keys[j], v = data.lead_info[k];
      if (v && v !== 'null') session.leadInfo[k] = v;
    }
  }
  if (!session.leadInfo.email) {
    var ef = extractEmailFromText(text);
    if (ef) session.leadInfo.email = ef;
  }
  if (channel === 'whatsapp' && !session.leadInfo.nom) session.leadInfo.whatsapp = from;
  if (channel !== 'whatsapp') session.leadInfo.social_id = from;

  session.leadScore = Math.max(session.leadScore, data.lead_score || 0);
  console.log('Turns:', session.turns, 'Score:', session.leadScore, '[' + channel + ']');

  var savedLead = null;
  if (session.turns >= 1) {
    savedLead = await saveToSupabase(session.leadInfo, session.leadScore, data.score_reason, from, clientId, channel);

    if (session.leadScore >= 7) {
      await saveNotification(clientId, savedLead && savedLead.id, 'hot_lead',
        'Lead chaud — ' + (savedLead ? savedLead.name : from),
        'Score ' + session.leadScore + '/10 sur ' + channel);
    }

    if (!session.notifSent && agencyConfig && agencyConfig.notification_email && session.leadScore >= 7) {
      session.notifSent = true;
      await sendHotLeadEmail(agencyConfig.notification_email, savedLead, agencyConfig.agency_name);
      console.log('Email envoye pour lead:', from, '[' + channel + ']');
    }
  }

  await sendReplyByChannel(channel, from, clean, sendCtx);
}

app.post('/webhook', async function(req, res) {
  res.sendStatus(200);
  try {
    var body = req.body;

    if (body.object === 'whatsapp_business_account') {
      var change = body.entry && body.entry[0] && body.entry[0].changes && body.entry[0].changes[0] && body.entry[0].changes[0].value;
      if (!change) return;
      var msg = change.messages && change.messages[0];
      if (!msg) return;

      var phoneNumberId = change.metadata && change.metadata.phone_number_id;
      var agencyConfig  = await getAgencyConfigByPhone(phoneNumberId);
      var clientId      = agencyConfig ? agencyConfig.client_id : 'scalmind_ia';
      var waToken       = (agencyConfig && agencyConfig.whatsapp_token) || process.env.WHATSAPP_TOKEN;

      var from = msg.from;
      var text = msg.text && msg.text.body;
      var mediaUrl = null, mediaType = null;

      if (!text && msg.type === 'audio') {
        try {
          var audioId = msg.audio && msg.audio.id;
          if (!audioId) return;
          var infoA = await getMetaMediaInfo(audioId, waToken);
          var bufA  = await downloadMetaMedia(infoA.url, waToken);
          mediaUrl  = await uploadToSupabaseStorage(bufA, infoA.mime_type || 'audio/ogg', extFromMime(infoA.mime_type) || 'ogg', 'incoming');
          mediaType = 'audio';
          text = await transcribeAudioBuffer(bufA);
          console.log('Transcription:', text);
        } catch(err) {
          console.error('Whisper erreur:', err.message);
          await sendWhatsAppMessage(from, "Desole, je n'ai pas pu comprendre votre vocal. Pouvez-vous ecrire ?", phoneNumberId, waToken);
          return;
        }
      } else if (!text && msg.type === 'image') {
        try {
          var imgId = msg.image && msg.image.id;
          if (!imgId) return;
          var infoI = await getMetaMediaInfo(imgId, waToken);
          var bufI  = await downloadMetaMedia(infoI.url, waToken);
          mediaUrl  = await uploadToSupabaseStorage(bufI, infoI.mime_type || 'image/jpeg', 'jpg', 'incoming');
          mediaType = 'image';
          text = (msg.image && msg.image.caption) || '[Image reçue]';
        } catch(err) { console.error('Image entrante erreur:', err.message); return; }
      } else if (!text && msg.type === 'document') {
        try {
          var docId = msg.document && msg.document.id;
          if (!docId) return;
          var infoD = await getMetaMediaInfo(docId, waToken);
          var bufD  = await downloadMetaMedia(infoD.url, waToken);
          var docExt = ((msg.document.filename || '').split('.').pop()) || extFromMime(infoD.mime_type);
          mediaUrl  = await uploadToSupabaseStorage(bufD, infoD.mime_type || 'application/pdf', docExt, 'incoming');
          mediaType = 'file';
          text = '[Fichier reçu] ' + (msg.document.filename || 'document');
        } catch(err) { console.error('Document entrant erreur:', err.message); return; }
      }
      if (!text) return;

      await processIncomingText({
        from: from, text: text, clientId: clientId, agencyConfig: agencyConfig, channel: 'whatsapp',
        sendCtx: { phoneNumberId: phoneNumberId, waToken: waToken },
        mediaUrl: mediaUrl, mediaType: mediaType
      });
    }

    else if (body.object === 'page') {
      for (var e1 = 0; e1 < (body.entry || []).length; e1++) {
        var entry = body.entry[e1];
        var pageId = entry.id;
        var agencyConfig2 = await getAgencyConfigByPageId(pageId);
        if (!agencyConfig2) { console.log('Config Messenger introuvable pour page', pageId); continue; }
        var clientId2 = agencyConfig2.client_id;

        for (var m1 = 0; m1 < (entry.messaging || []).length; m1++) {
          var event = entry.messaging[m1];
          if (!event.message || event.message.is_echo) continue;
          var senderId = event.sender && event.sender.id;
          var messageText = event.message && event.message.text;
          if (!senderId || !messageText) continue;

          await processIncomingText({
            from: senderId, text: messageText, clientId: clientId2, agencyConfig: agencyConfig2, channel: 'messenger',
            sendCtx: { pageToken: agencyConfig2.page_access_token || PAGE_ACCESS_TOKEN }
          });
        }
      }
    }

    else if (body.object === 'instagram') {
      for (var e2 = 0; e2 < (body.entry || []).length; e2++) {
        var entryIg = body.entry[e2];
        var igAccountId = entryIg.id;
        var agencyConfig3 = await getAgencyConfigByInstagramId(igAccountId);
        if (!agencyConfig3) { console.log('Config Instagram introuvable pour account', igAccountId); continue; }
        var clientId3 = agencyConfig3.client_id;

        for (var m2 = 0; m2 < (entryIg.messaging || []).length; m2++) {
          var eventIg = entryIg.messaging[m2];
          if (!eventIg.message || eventIg.message.is_echo) continue;
          var senderIdIg = eventIg.sender && eventIg.sender.id;
          var messageTextIg = eventIg.message && eventIg.message.text;
          if (!senderIdIg || !messageTextIg) continue;

          await processIncomingText({
            from: senderIdIg, text: messageTextIg, clientId: clientId3, agencyConfig: agencyConfig3, channel: 'instagram',
            sendCtx: { igToken: agencyConfig3.ig_access_token || IG_ACCESS_TOKEN }
          });
        }
      }
    }

  } catch(err) { console.error('Webhook error:', err.message); }
});

// ─── PIPELINE WEB (widget site) — reutilisable pour texte et vocal ────────────
async function processWebMessage(sessionId, clientId, message, mediaUrl, mediaType) {
  var session = getSessionCache(sessionId + '_' + clientId);
  session.turns++;

  var agencyConfig = await getAgencyConfig(clientId);
  var history      = await loadHistory(sessionId, clientId);
  var messages     = [{ role:'system', content: buildSystemPrompt(agencyConfig) }];
  messages = messages.concat(toGroqMessages(history));
  messages.push({ role:'user', content: message });

  var rawText = await sendWithBackoff(messages);

  var extracted = extractData(rawText);
  var clean     = extracted.clean;
  var data      = extracted.data;

  await saveMessage(sessionId, clientId, 'web', 'user', message, mediaUrl, mediaType);
  await saveMessage(sessionId, clientId, 'web', 'assistant', clean);

  if (data.lead_info) {
    var keys = Object.keys(data.lead_info);
    for (var j = 0; j < keys.length; j++) {
      var k = keys[j], v = data.lead_info[k];
      if (v && v !== 'null') session.leadInfo[k] = v;
    }
  }
  if (!session.leadInfo.email) {
    var ef = extractEmailFromText(message);
    if (ef) session.leadInfo.email = ef;
  }
  session.leadScore = Math.max(session.leadScore, data.lead_score || 0);

  // Le lead web n'apparait au dashboard QUE lorsque l'email a ete capture
  // (contrairement a WhatsApp ou le numero est deja connu des le 1er message)
  var leadSaved = false;
  var savedLead = null;
  if (session.leadInfo.email) {
    savedLead = await saveToSupabase(session.leadInfo, session.leadScore, data.score_reason, sessionId, clientId, 'web');
    leadSaved = true;

    if (session.leadScore >= 7) {
      await saveNotification(clientId, savedLead && savedLead.id, 'hot_lead',
        'Lead chaud — ' + (savedLead ? savedLead.name : sessionId),
        'Score ' + session.leadScore + '/10 sur le site web');
    }

    if (!session.notifSent && agencyConfig && agencyConfig.notification_email && session.leadScore >= 7) {
      session.notifSent = true;
      await sendHotLeadEmail(agencyConfig.notification_email, savedLead, agencyConfig.agency_name);
    }
  }

  return { reply: clean, leadScore: session.leadScore, leadSaved: leadSaved, turns: session.turns };
}

app.post('/api/chat', async function(req, res) {
  var message   = req.body && req.body.message;
  var sessionId = (req.body && req.body.sessionId) || 'default';
  var clientId  = (req.body && req.body.clientId)  || 'scalmind_ia';

  if (!message || !message.trim()) return res.status(400).json({ reply:'Message vide.' });

  try {
    var result = await processWebMessage(sessionId, clientId, message);
    res.json(result);
  } catch(err) {
    var isQuota = /429|quota|rate.limit|too many/i.test(String(err));
    res.status(isQuota ? 429 : 500).json({ reply: isQuota ? 'Limite API. Reessayez.' : 'Erreur: ' + err.message });
  }
});

// ─── API TRACK VISIT (widget site web) ────────────────────────────────────────
app.post('/api/track-visit', async function(req, res) {
  var clientId  = (req.body && req.body.clientId)  || 'scalmind_ia';
  var sessionId = (req.body && req.body.sessionId);
  if (!sessionId) return res.status(400).json({ success:false });
  await trackSiteVisit(clientId, sessionId);
  res.json({ success:true });
});

// ─── API RDV (.ics — zero dependance Google/Outlook) ──────────────────────────
// Genere le fichier .ics, l'enregistre sur le lead (date + statut pipeline),
// et le renvoie en telechargement direct.
app.post('/api/lead/:id/rdv', async function(req, res) {
  var leadId = req.params.id;
  var date = req.body && req.body.date;         // 'YYYY-MM-DD'
  var time = req.body && req.body.time;         // 'HH:MM'
  var durationMinutes = (req.body && parseInt(req.body.durationMinutes, 10)) || 30;
  var title = (req.body && req.body.title) || 'Rendez-vous';
  var location = (req.body && req.body.location) || '';
  var notes = (req.body && req.body.notes) || '';

  if (!date || !time) return res.status(400).json({ error: 'Date et heure requises.' });

  try {
    var leadR = await supabase.from('leads').select('*').eq('id', leadId).single();
    if (leadR.error || !leadR.data) return res.status(404).json({ error: 'Lead introuvable' });
    var lead = leadR.data;

    var startAt = new Date(date + 'T' + time + ':00');
    if (isNaN(startAt.getTime())) return res.status(400).json({ error: 'Date/heure invalide.' });

    var uid = uuidv4() + '@zendixpro';
    var icsContent = generateICS({
      uid: uid,
      startAt: startAt,
      durationMinutes: durationMinutes,
      title: title + (lead.name ? ' — ' + lead.name : ''),
      description: notes || ('Rendez-vous avec ' + (lead.name || 'un prospect') + '.'),
      location: location
    });

    await supabase.from('leads').update({
      pipeline_stage: 'DEMO_SCHEDULED',
      rdv_at: startAt.toISOString(),
      rdv_ics_uid: uid
    }).eq('id', leadId);

    await saveNotification(lead.client_id, leadId, 'rdv_scheduled',
      'RDV planifié — ' + (lead.name || 'Prospect'),
      'Le ' + date + ' à ' + time);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="rdv-' + leadId + '.ics"');
    res.send(icsContent);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat-audio', async function(req, res) {
  var sessionId   = (req.body && req.body.sessionId) || 'default';
  var clientId    = (req.body && req.body.clientId)  || 'scalmind_ia';
  var audioBase64 = req.body && req.body.audio;
  var audioMime   = (req.body && req.body.audioMime) || 'audio/webm';

  if (!audioBase64) return res.status(400).json({ reply:'Audio manquant.' });

  try {
    var audioBuffer = Buffer.from(audioBase64, 'base64');
    var transcribedText = await transcribeAudioBuffer(audioBuffer);
    if (!transcribedText || !transcribedText.trim()) {
      return res.json({ reply: "Désolé, je n'ai pas pu comprendre le message vocal. Pouvez-vous réessayer ou écrire ?", transcribedText: '' });
    }

    var mediaUrl = await uploadToSupabaseStorage(audioBuffer, audioMime, extFromMime(audioMime), 'website');

    var result = await processWebMessage(sessionId, clientId, transcribedText, mediaUrl, 'audio');
    res.json(Object.assign({ transcribedText: transcribedText }, result));
  } catch(err) {
    var isQuota = /429|quota|rate.limit|too many/i.test(String(err));
    res.status(isQuota ? 429 : 500).json({ reply: isQuota ? 'Limite API. Reessayez.' : 'Erreur: ' + err.message, transcribedText: '' });
  }
});

app.get('/api/leads', async function(req, res) {
  var clientId = req.query.clientId || 'scalmind_ia';
  var channel  = req.query.channel;
  try {
    var q = supabase.from('leads').select('*').eq('client_id', clientId).neq('status', 'archived').order('created_at', { ascending:false }).limit(50);
    if (channel) q = q.eq('channel', channel);
    var r = await q;
    res.json(r.data || []);
  } catch(err) { res.json([]); }
});

app.get('/api/leads/archived', async function(req, res) {
  var clientId = req.query.clientId || 'scalmind_ia';
  try {
    var r = await supabase.from('leads').select('*').eq('client_id', clientId).eq('status', 'archived').order('created_at', { ascending:false });
    res.json(r.data || []);
  } catch(err) { res.json([]); }
});

app.patch('/api/lead/:id/archive', async function(req, res) {
  try {
    await supabase.from('leads').update({ status:'archived' }).eq('id', req.params.id);
    res.json({ success:true });
  } catch(err) { res.status(500).json({ error:err.message }); }
});

app.patch('/api/lead/:id/unarchive', async function(req, res) {
  try {
    await supabase.from('leads').update({ status:'new' }).eq('id', req.params.id);
    res.json({ success:true });
  } catch(err) { res.status(500).json({ error:err.message }); }
});

app.post('/api/lead', async function(req, res) {
  var clientId = req.body.clientId || 'scalmind_ia';
  try {
    var payload = {
      id: uuidv4(),
      client_id: clientId,
      name: req.body.name,
      email: req.body.email,
      company: req.body.company,
      sector: req.body.sector,
      channel: req.body.channel || 'whatsapp',
      score: 5,
      status: 'new',
      source: 'MANUAL',
      created_at: new Date().toISOString()
    };
    await supabase.from('leads').insert(payload);
    res.json({ success:true, lead:payload });
  } catch(err) { res.status(500).json({ error:err.message }); }
});

// ─── SUIVI EQUIPE (assignation + statut de prise en charge) ──────────────────
app.patch('/api/lead/:id/handling', async function(req, res) {
  var assignedTo = req.body && req.body.assignedTo;
  var status = req.body && req.body.status;
  var payload = {};
  if (typeof assignedTo !== 'undefined') payload.assigned_to = assignedTo || null;
  if (typeof status !== 'undefined' && status) payload.handling_status = status;
  if (!Object.keys(payload).length) return res.status(400).json({ error: 'Rien a mettre a jour.' });
  try {
    await supabase.from('leads').update(payload).eq('id', req.params.id);
    res.json({ success:true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── DEMANDE DE CONSEILLER PAR SESSION (widget site web — bouton "Parler a un conseiller") ─
// Ne met plus l'IA en pause : cree simplement une notification pour que l'equipe prenne le relais elle-meme.
app.patch('/api/lead/session/:sessionId/pause', async function(req, res) {
  var sessionId = req.params.sessionId;
  var clientId  = req.query.clientId || 'scalmind_ia';
  try {
    var leadR = await supabase.from('leads').select('id, name').eq('session_id', sessionId).eq('client_id', clientId).single();
    var lead = leadR.data;
    await saveNotification(clientId, lead ? lead.id : null, 'human_requested',
      'Demande de conseiller — ' + (lead ? (lead.name || 'Prospect') : sessionId),
      'Le visiteur a demande a parler a un conseiller.');
    res.json({ success:true });
  } catch(err) { res.status(500).json({ error:err.message }); }
});

app.post('/api/lead/:sessionId/reply', async function(req, res) {
  var clientId    = req.body.clientId || 'scalmind_ia';
  var channel     = req.body.channel  || 'whatsapp';
  var text        = req.body.text || '';
  var imageBase64 = req.body.image;
  var imageMime   = req.body.imageMime || 'image/jpeg';
  var fileBase64  = req.body.file;
  var fileMime    = req.body.fileMime || 'application/pdf';
  var fileName    = req.body.fileName || 'document';
  var audioBase64 = req.body.audio;
  var audioMime   = req.body.audioMime || 'audio/ogg';
  var sessionId   = req.params.sessionId;

  if (!text && !imageBase64 && !fileBase64 && !audioBase64) return res.status(400).json({ error:'Texte, image, fichier ou vocal manquant' });

  try {
    var agencyConfig = await getAgencyConfig(clientId);
    var sendCtx = {};
    if (channel === 'whatsapp') {
      sendCtx = { phoneNumberId: agencyConfig && agencyConfig.phone_number_id, waToken: (agencyConfig && agencyConfig.whatsapp_token) || process.env.WHATSAPP_TOKEN };
    } else if (channel === 'messenger') {
      sendCtx = { pageToken: (agencyConfig && agencyConfig.page_access_token) || PAGE_ACCESS_TOKEN };
    } else if (channel === 'instagram') {
      sendCtx = { igToken: (agencyConfig && agencyConfig.ig_access_token) || IG_ACCESS_TOKEN };
    }

    if (audioBase64 && channel === 'whatsapp') {
      var audioBuffer = Buffer.from(audioBase64, 'base64');
      var audioMediaId = await uploadMediaToMeta(audioBuffer, audioMime, 'vocal.' + extFromMime(audioMime), sendCtx.phoneNumberId, sendCtx.waToken);
      var storedAudioUrl = await uploadToSupabaseStorage(audioBuffer, audioMime, extFromMime(audioMime), 'outgoing');
      try {
        await sendWhatsAppAudioById(sessionId, audioMediaId, sendCtx.phoneNumberId, sendCtx.waToken);
        await saveMessage(sessionId, clientId, channel, 'assistant', '[Vocal envoyé]', storedAudioUrl, 'audio');
      } catch(voiceErr) {
        console.error('Vocal refuse par WhatsApp (format non supporte), repli en fichier joint:', voiceErr.message);
        var fallbackMediaId = await uploadMediaToMeta(audioBuffer, audioMime, 'vocal.' + extFromMime(audioMime), sendCtx.phoneNumberId, sendCtx.waToken);
        await sendWhatsAppDocumentById(sessionId, fallbackMediaId, sendCtx.phoneNumberId, sendCtx.waToken, 'vocal.' + extFromMime(audioMime), 'Message vocal');
        await saveMessage(sessionId, clientId, channel, 'assistant', '[Vocal envoyé (fichier)]', storedAudioUrl, 'audio');
      }
    } else if (imageBase64 && channel === 'whatsapp') {
      var buffer = Buffer.from(imageBase64, 'base64');
      var mediaId = await uploadMediaToMeta(buffer, imageMime, 'image.jpg', sendCtx.phoneNumberId, sendCtx.waToken);
      await sendWhatsAppImageById(sessionId, mediaId, sendCtx.phoneNumberId, sendCtx.waToken, text);
      var storedImgUrl = await uploadToSupabaseStorage(buffer, imageMime, 'jpg', 'outgoing');
      await saveMessage(sessionId, clientId, channel, 'assistant', text ? '[Image] ' + text : '[Image envoyée]', storedImgUrl, 'image');
    } else if (fileBase64 && channel === 'whatsapp') {
      var fileBuffer = Buffer.from(fileBase64, 'base64');
      var fileMediaId = await uploadMediaToMeta(fileBuffer, fileMime, fileName, sendCtx.phoneNumberId, sendCtx.waToken);
      await sendWhatsAppDocumentById(sessionId, fileMediaId, sendCtx.phoneNumberId, sendCtx.waToken, fileName, text);
      var storedFileUrl = await uploadToSupabaseStorage(fileBuffer, fileMime, (fileName.split('.').pop() || extFromMime(fileMime)), 'outgoing');
      await saveMessage(sessionId, clientId, channel, 'assistant', '[Fichier] ' + fileName, storedFileUrl, 'file');
    } else {
      await saveMessage(sessionId, clientId, channel, 'assistant', text);
      await sendReplyByChannel(channel, sessionId, text, sendCtx);
    }

    res.json({ success:true });
  } catch(err) { res.status(500).json({ error:err.message }); }
});

app.get('/api/lead/:sessionId/summary', async function(req, res) {
  var clientId = req.query.clientId || 'scalmind_ia';
  try {
    var history = await loadHistory(req.params.sessionId, clientId);
    if (!history || history.length === 0) {
      return res.json({ summary: 'Aucune conversation enregistrée pour ce prospect.' });
    }

    var conv = history.map(function(m) {
      return (m.role === 'user' ? '👤 Patient/Prospect: ' : '🤖 Agent: ') + m.content;
    }).join('\n');

    var prompt =
      'Voici une conversation entre un agent IA et un prospect/patient.\n\n' +
      conv + '\n\n' +
      'Redige un resume sous forme d\'UN SEUL PARAGRAPHE fluide et naturel, sans liste a puces et sans labels ' +
      '(pas de "NOM:", pas de "BUDGET:", pas d\'emojis). Le paragraphe doit raconter qui est ce prospect, ce qu\'il recherche, ' +
      'les informations utiles qu\'il a donnees (contact, budget, entreprise si mentionnee), son niveau d\'interet, ' +
      'et se terminer par un conseil concret pour le conseiller qui va le recontacter. ' +
      'Reste concis (5 a 8 phrases maximum). Reponds en francais.';

    var messages = [
      { role:'system', content:'Tu es un expert en analyse commerciale et closing.' },
      { role:'user', content: prompt }
    ];

    var summary = await sendWithBackoff(messages);
    res.json({ summary: summary });
  } catch(err) {
    console.error('Summary erreur:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/conversation/:sessionId', async function(req, res) {
  var clientId = req.query.clientId || 'scalmind_ia';
  try {
    var history = await loadHistory(req.params.sessionId, clientId);
    res.json(history);
  } catch(err) { res.json([]); }
});

app.get('/api/notifications', async function(req, res) {
  var clientId = req.query.clientId || 'scalmind_ia';
  try {
    var r = await supabase.from('notifications').select('*').eq('client_id', clientId).order('created_at', { ascending:false }).limit(50);
    res.json(r.data || []);
  } catch(err) { res.json([]); }
});

app.patch('/api/notifications/:id/read', async function(req, res) {
  try {
    await supabase.from('notifications').update({ is_read:true }).eq('id', req.params.id);
    res.json({ success:true });
  } catch(err) { res.status(500).json({ error:err.message }); }
});

app.get('/api/stats', async function(req, res) {
  var clientId = req.query.clientId || 'scalmind_ia';
  try {
    var r = await supabase.from('leads').select('score, status, channel, pipeline_stage, created_at').eq('client_id', clientId);
    var leads = r.data || [];
    var total = leads.length;
    var hot = leads.filter(function(l){ return l.status === 'hot'; }).length;
    var warm = leads.filter(function(l){ return l.status === 'warm'; }).length;
    var newCount = leads.filter(function(l){ return l.status === 'new'; }).length;
    var closing = leads.filter(function(l){ return l.pipeline_stage === 'CLOSING'; }).length;
    var demoScheduled = leads.filter(function(l){ return l.pipeline_stage === 'DEMO_SCHEDULED'; }).length;
    var avgScore = total ? (leads.reduce(function(s,l){ return s + (l.score||0); }, 0) / total).toFixed(1) : 0;
    var byChannel = {
      whatsapp: leads.filter(function(l){ return l.channel === 'whatsapp' || !l.channel; }).length,
      instagram: leads.filter(function(l){ return l.channel === 'instagram'; }).length,
      messenger: leads.filter(function(l){ return l.channel === 'messenger'; }).length,
    };

    var visitsR = await supabase.from('site_visits').select('id', { count: 'exact', head: true }).eq('client_id', clientId);
    var siteVisits = visitsR.count || 0;

    var conversionRate = total ? (((hot + closing) / total) * 100).toFixed(1) : 0;

    res.json({
      total: total, hot: hot, warm: warm, new: newCount, closing: closing, demoScheduled: demoScheduled,
      avgScore: avgScore, byChannel: byChannel, siteVisits: siteVisits, conversionRate: conversionRate
    });
  } catch(err) { res.json({}); }
});

app.post('/api/config', async function(req, res) {
  var clientId = req.body.clientId || 'scalmind_ia';
  try {
    var payload = {
      client_id:              clientId,
      phone_number_id:        req.body.phoneNumberId || undefined,
      page_id:                req.body.pageId || undefined,
      instagram_account_id:   req.body.instagramAccountId || undefined,
      whatsapp_token:         req.body.whatsappToken || undefined,
      page_access_token:      req.body.pageAccessToken || undefined,
      ig_access_token:        req.body.igAccessToken || undefined,
      agency_name:            req.body.agencyName    || 'Mon Agence',
      agency_desc:            req.body.agencyDesc    || '',
      agency_presentation:    req.body.agencyPresentation || '',
      tone:                   req.body.tone          || 'professionnel',
      special_instructions:   req.body.specialInstructions || '',
      services:               req.body.services      || [],
      notification_email:     req.body.notificationEmail || null,
      agent_name:             req.body.agentName     || 'Rachel',
      updated_at:             new Date().toISOString()
    };
    Object.keys(payload).forEach(function(k) { if (payload[k] === undefined) delete payload[k]; });

    var result = await supabase.from('agency_configs').upsert(payload, { onConflict: 'client_id' });
    if (result.error) {
      console.error('Config erreur:', result.error.message);
      return res.status(500).json({ error: result.error.message });
    }
    console.log('Config sauvegardee:', clientId);
    res.json({ success:true, clientId: clientId });
  } catch(err) { res.status(500).json({ error:err.message }); }
});

app.get('/api/config', async function(req, res) {
  var clientId = req.query.clientId || 'scalmind_ia';
  try {
    var config = await getAgencyConfig(clientId);
    res.json(config || {});
  } catch(err) { res.json({}); }
});

app.post('/api/assistant/:clientId', async function(req, res) {
  var clientId = req.params.clientId;
  var question = req.body && req.body.question;
  if (!question) return res.status(400).json({ reply: 'Question vide.' });

  try {
    var r = await supabase.from('leads').select('*').eq('client_id', clientId);
    var leads = r.data || [];
    var configR = await getAgencyConfig(clientId);

    var total = leads.length;
    var hot = leads.filter(function(l){ return l.status === 'hot'; }).length;
    var warm = leads.filter(function(l){ return l.status === 'warm'; }).length;
    var closing = leads.filter(function(l){ return l.pipeline_stage === 'CLOSING'; }).length;
    var wa = leads.filter(function(l){ return l.channel === 'whatsapp' || !l.channel; }).length;
    var ig = leads.filter(function(l){ return l.channel === 'instagram'; }).length;
    var fb = leads.filter(function(l){ return l.channel === 'messenger'; }).length;
    var avgScore = total ? (leads.reduce(function(s,l){ return s + (l.score||0); }, 0) / total).toFixed(1) : 0;

    var context =
      'Tu es l\'assistant analytique de ' + (configR && configR.agency_name || 'ZENDIX PRO') + '.\n' +
      'Donnees actuelles:\n' +
      '- Total leads: ' + total + '\n' +
      '- Leads chauds: ' + hot + '\n' +
      '- Leads warm: ' + warm + '\n' +
      '- En closing: ' + closing + '\n' +
      '- WhatsApp: ' + wa + '\n' +
      '- Instagram: ' + ig + '\n' +
      '- Messenger: ' + fb + '\n' +
      '- Score moyen: ' + avgScore + '/10\n' +
      'Reponds de facon concise et professionnelle en francais, sans balises DATA.';

    var reply = await sendWithBackoff([
      { role: 'system', content: context },
      { role: 'user', content: question }
    ]);

    res.json({ reply: reply });
  } catch(err) {
    res.status(500).json({ reply: 'Erreur assistant: ' + err.message });
  }
});

app.get('/api/activity', async function(req, res) {
  var clientId = req.query.clientId || 'scalmind_ia';
  try {
    var since = new Date();
    since.setDate(since.getDate() - 6);
    since.setHours(0,0,0,0);

    var r = await supabase.from('chat_history')
      .select('created_at')
      .eq('client_id', clientId)
      .eq('role', 'user')
      .gte('created_at', since.toISOString());

    var rows = r.data || [];
    var days = [];
    var counts = [0,0,0,0,0,0,0];
    for (var i = 0; i < 7; i++) {
      var d = new Date(since);
      d.setDate(since.getDate() + i);
      days.push(d.toISOString().slice(0,10));
    }
    rows.forEach(function(row) {
      var day = row.created_at.slice(0,10);
      var idx = days.indexOf(day);
      if (idx !== -1) counts[idx]++;
    });

    res.json({ days: days, counts: counts });
  } catch(err) { res.json({ days: [], counts: [0,0,0,0,0,0,0] }); }
});

app.get('/api/health', function(req, res) {
  res.json({
    status: 'ok',
    groq: !!GROQ_KEY,
    supabase: !!SUPABASE_URL,
    elevenlabs: !!ELEVENLABS_KEY,
    nodemailer: !!mailTransporter,
    messenger: !!PAGE_ACCESS_TOKEN,
    instagram: !!IG_ACCESS_TOKEN,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, function() {
  console.log('='.repeat(52));
  console.log('ZENDIX PRO v6.3 — port', PORT);
  console.log('Multi-tenant: ON | Supabase memory: ON');
  console.log('Multi-canal: WhatsApp + Messenger + Instagram');
  console.log('Stockage media permanent: ON (bucket ' + MEDIA_BUCKET + ')');
  console.log('Email notifications:', mailTransporter ? 'ON (' + GMAIL_USER + ')' : 'OFF');
  console.log('ElevenLabs voice: ON (WhatsApp only, >' + VOICE_WORD_LIMIT + ' mots)');
  console.log('RDV .ics: ON (zero dependance Google/Outlook)');
  console.log('='.repeat(52));
});