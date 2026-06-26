// Vercel Serverless Function - Prostors API (Production Ready) V8
const { google } = require('googleapis');

// ==================== КОНФИГУРАЦИЯ ====================
const CONFIG = {
  cors: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID',
    'Access-Control-Max-Age': '86400',
  },
  rateLimit: {
    global: { windowMs: 10 * 60 * 1000, maxRequests: 1000 },
    actions: {
      save_lead: { windowMs: 60 * 60 * 1000, maxRequests: 10 },
      create: { windowMs: 10 * 60 * 1000, maxRequests: 100 },
      update: { windowMs: 10 * 60 * 1000, maxRequests: 100 },
      delete: { windowMs: 10 * 60 * 1000, maxRequests: 50 },
      update_lead_status: { windowMs: 10 * 60 * 1000, maxRequests: 100 },
      update_agent_profile: { windowMs: 10 * 60 * 1000, maxRequests: 50 },
      get_listings: { windowMs: 10 * 60 * 1000, maxRequests: 1000 },
      get_pages: { windowMs: 10 * 60 * 1000, maxRequests: 1000 },
      get_agent_config: { windowMs: 10 * 60 * 1000, maxRequests: 500 },
      get_leads: { windowMs: 10 * 60 * 1000, maxRequests: 500 },
      get_agent_profile: { windowMs: 10 * 60 * 1000, maxRequests: 500 },
      verify_pin: { windowMs: 10 * 60 * 1000, maxRequests: 20 },
      resolve_agent_by_domain: { windowMs: 10 * 60 * 1000, maxRequests: 500 },
      health: null,
    },
  },
  cache: {
    agentTTL: 5 * 60 * 1000,
    listingsTTL: 2 * 60 * 1000,
  },
};

// ==================== КЭШИРОВАНИЕ ====================
const cache = new Map();

function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data, ttlMs = CONFIG.cache.agentTTL) {
  cache.set(key, { data, expiry: Date.now() + ttlMs });
}

function clearCache(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

// ==================== БЕЗОПАСНОСТЬ ====================
function sanitizeInput(str, maxLength = 1000) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').slice(0, maxLength).trim();
}

function validatePhone(phone) {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  const normalized = cleaned.startsWith('8') ? '+7' + cleaned.slice(1) : cleaned;
  if (/^\+7\d{10}$/.test(normalized)) return normalized;
  return null;
}

function generateRequestId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ==================== ЛОГИРОВАНИЕ ====================
const logger = {
  info: (requestId, message, meta = {}) => {
    console.log(JSON.stringify({ level: 'INFO', requestId, timestamp: new Date().toISOString(), message, ...meta }));
  },
  error: (requestId, message, meta = {}) => {
    console.error(JSON.stringify({ level: 'ERROR', requestId, timestamp: new Date().toISOString(), message, ...meta }));
  },
  warn: (requestId, message, meta = {}) => {
    console.warn(JSON.stringify({ level: 'WARN', requestId, timestamp: new Date().toISOString(), message, ...meta }));
  },
};

// ==================== УМНЫЙ RATE LIMITING ====================
const rateLimitStore = new Map();

function getActionLimit(action) {
  if (!action) return CONFIG.rateLimit.global;
  return CONFIG.rateLimit.actions[action] || CONFIG.rateLimit.global;
}

function checkRateLimit(ip, action) {
  const now = Date.now();
  const limit = getActionLimit(action);
  if (!limit) return { allowed: true, remaining: Infinity, limit: Infinity, reset: 0 };
 
  const windowStart = now - limit.windowMs;
  const key = `${ip}:${action || 'global'}`;
  const userRequests = rateLimitStore.get(key) || [];
  const validRequests = userRequests.filter(time => time > windowStart);
 
  if (validRequests.length >= limit.maxRequests) {
    const resetTime = Math.ceil((validRequests[0] + limit.windowMs - now) / 1000);
    return { allowed: false, remaining: 0, limit: limit.maxRequests, reset: resetTime };
  }
 
  validRequests.push(now);
  rateLimitStore.set(key, validRequests);
 
  if (validRequests.length < 50) {
    setTimeout(() => rateLimitStore.delete(key), limit.windowMs);
  }
 
  return {
    allowed: true,
    remaining: limit.maxRequests - validRequests.length,
    limit: limit.maxRequests,
    reset: Math.ceil(limit.windowMs / 1000),
  };
}

function checkGlobalRateLimit(ip) {
  return checkRateLimit(ip, '__global__');
}

// ==================== ИНИЦИАЛИЗАЦИЯ API ====================
function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ==================== УТИЛИТЫ ====================
function jsonResponse(res, status, data, requestId) {
  res.status(status).json({ ...data, _meta: { requestId, timestamp: new Date().toISOString() } });
}

function hashPin(pin) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(pin).digest('hex');
}

function parseRussianDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  const parts = String(dateStr).trim().split('.');
  if (parts.length === 3) {
    return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  }
  return new Date(dateStr);
}

function formatRussianDate(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const moscowTime = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  const day = ('0' + moscowTime.getDate()).slice(-2);
  const month = ('0' + (moscowTime.getMonth() + 1)).slice(-2);
  const year = moscowTime.getFullYear();
  const hours = ('0' + moscowTime.getHours()).slice(-2);
  const minutes = ('0' + moscowTime.getMinutes()).slice(-2);
  return `${day}.${month}.${year}, ${hours}:${minutes}`;
}

// ==================== РАБОТА С АГЕНТАМИ ====================
async function getAgentData(sheets, agentId, options = {}) {
  const cacheKey = `agent:${agentId}`;
 
  if (!options.checkAccess) {
    const cached = getCache(cacheKey);
    if (cached) return cached;
  }
 
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Agents!A:K',
  });
 
  const rows = response.data.values;
  if (!rows || rows.length < 2) return { error: 'Система не настроена', code: 500 };
 
  const headers = rows[0];
  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });
 
  let agentRow = null;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idx.agent_id]).trim() === String(agentId).trim()) {
      agentRow = rows[i];
      break;
    }
  }
 
  if (!agentRow) return { error: 'Агент не найден', code: 404 };
 
  const agent = {
    agentId: agentRow[idx.agent_id],
    name: agentRow[idx.name],
    telegramUserId: agentRow[idx.telegram_user_id],
    chatId: agentRow[idx.chat_id] || '',
    status: agentRow[idx.status],
    planType: agentRow[idx.plan_type],
    expiresAt: agentRow[idx.expires_at],
    brandConfig: agentRow[idx.brand_config] ? JSON.parse(agentRow[idx.brand_config]) : {},
  };
 
  if (options.checkAccess) {
    if (agent.status !== 'active') return { error: 'Доступ приостановлен', code: 403 };
    if (agent.expiresAt && agent.planType !== 'lifetime') {
      const parsedExpiry = parseRussianDate(agent.expiresAt);
      if (parsedExpiry && parsedExpiry < new Date()) return { error: 'Срок подписки истёк', code: 403 };
    }
    if (options.userId && agent.telegramUserId) {
      if (String(agent.telegramUserId) !== String(options.userId)) return { error: 'Нет прав доступа', code: 403 };
    }
  }
 
  if (!options.checkAccess) setCache(cacheKey, agent);
  return agent;
}

async function verifyAgentPin(sheets, agentId, pin) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Agents!A:D',
  });
 
  const rows = response.data.values;
  if (!rows || rows.length < 2) return { success: false, error: 'Агент не найден' };
 
  const headers = rows[0];
  const idIdx = headers.indexOf('agent_id');
  const hashIdx = headers.indexOf('pin_hash');
 
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]).trim() === String(agentId).trim()) {
      if (rows[i][hashIdx] === hashPin(pin)) return { success: true, agentId };
      return { success: false, error: 'Неверный PIN-код' };
    }
  }
  return { success: false, error: 'Агент не найден' };
}

// ==================== ГЛАВНАЯ ФУНКЦИЯ ====================
module.exports = async (req, res) => {
  const requestId = generateRequestId();
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection?.remoteAddress || 'unknown';
 
  if (req.method === 'OPTIONS') {
    Object.entries(CONFIG.cors).forEach(([key, value]) => res.setHeader(key, value));
    return res.status(200).end();
  }
 
  Object.entries(CONFIG.cors).forEach(([key, value]) => res.setHeader(key, value));
 
  const action = req.query.action || req.body?.action;
 
  const globalLimit = checkGlobalRateLimit(ip);
  if (!globalLimit.allowed) {
    logger.warn(requestId, 'Global rate limit exceeded', { ip, action });
    res.setHeader('Retry-After', globalLimit.reset.toString());
    return jsonResponse(res, 429, { success: false, error: 'Слишком много запросов. Попробуйте позже.' }, requestId);
  }
 
  if (action && action !== 'health') {
    const actionLimit = checkRateLimit(ip, action);
    res.setHeader('X-RateLimit-Limit', actionLimit.limit.toString());
    res.setHeader('X-RateLimit-Remaining', actionLimit.remaining.toString());
    res.setHeader('X-RateLimit-Reset', actionLimit.reset.toString());
   
    if (!actionLimit.allowed) {
      logger.warn(requestId, 'Action rate limit exceeded', { ip, action });
      res.setHeader('Retry-After', actionLimit.reset.toString());
      return jsonResponse(res, 429, {
        success: false,
        error: `Слишком много запросов "${action}". Попробуйте через ${actionLimit.reset} сек.`,
      }, requestId);
    }
  }
 
  try {
    logger.info(requestId, 'API Request', {
      action,
      agentId: req.query.agent_id || req.query.agentId || req.body?.agentId,
      method: req.method,
      ip,
    });
   
    const sheets = getSheetsClient();
    const processedAction = req.query.action || req.body?.action;
    const agentId = req.query.agent_id || req.query.agentId || req.body?.agentId;
    const userId = req.query.user_id || req.body?.userId;
    const pin = req.query.pin || req.body?.pin;
   
    if (processedAction === 'health') {
      return jsonResponse(res, 200, { success: true, status: 'ok', timestamp: new Date().toISOString() }, requestId);
    }
   
    if (processedAction === 'resolve_agent_by_domain') {
      const domain = sanitizeInput(req.query.domain, 255);
      if (!domain) return jsonResponse(res, 400, { success: false, error: 'Домен не указан' }, requestId);
     
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Agents!A:J',
      });
     
      const rows = response.data.values;
      if (!rows) return jsonResponse(res, 404, { success: false, error: 'Агент не найден' }, requestId);
     
      const headers = rows[0];
      const domainIdx = headers.indexOf('custom_domain');
      const idIdx = headers.indexOf('agent_id');
     
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][domainIdx]).trim().toLowerCase() === domain.toLowerCase()) {
          return jsonResponse(res, 200, { success: true, agentId: rows[i][idIdx] }, requestId);
        }
      }
      return jsonResponse(res, 404, { success: false, error: 'Агент не найден' }, requestId);
    }
   
    if (processedAction === 'get_agent_config') {
      if (!agentId) return jsonResponse(res, 400, { success: false, error: 'agent_id не указан' }, requestId);
     
      const result = await getAgentData(sheets, agentId, { checkAccess: true, userId: userId || null });
      if (result.error) return jsonResponse(res, result.code || 400, { success: false, error: result.error }, requestId);
     
      const isOwner = userId && result.telegramUserId && (String(userId) === String(result.telegramUserId));
      return jsonResponse(res, 200, {
        success: true,
        agentId: result.agentId,
        name: result.name,
        config: result.brandConfig,
        isOwner,
      }, requestId);
    }
   
    if (processedAction === 'verify_pin') {
      if (!agentId || !pin) return jsonResponse(res, 400, { success: false, error: 'Нет данных' }, requestId);
      return jsonResponse(res, 200, await verifyAgentPin(sheets, agentId, pin), requestId);
    }
   
    let agentData = null;
    if (processedAction !== 'save_lead') {
      if (!agentId) return jsonResponse(res, 401, { success: false, error: 'Агент не определён' }, requestId);
     
      agentData = await getAgentData(sheets, agentId, { checkAccess: true, userId: userId || null });
      if (agentData.error) return jsonResponse(res, agentData.code || 403, { success: false, error: agentData.error }, requestId);
    }
   
    if (processedAction === 'get_listings' || !processedAction) {
      const cacheKey = `listings:${agentId}:${req.query.includeHidden === 'true'}`;
      const cached = getCache(cacheKey);
      if (cached) return jsonResponse(res, 200, { success: true, data: cached }, requestId);
     
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Listings!A:Z',
      });
     
      const rows = response.data.values;
      if (!rows || rows.length <= 1) return jsonResponse(res, 200, { success: true, data: [] }, requestId);
     
      const headers = rows[0];
      const agentIdIdx = headers.indexOf('agent_id');
      const activeIdx = headers.indexOf('active');
      const includeHidden = req.query.includeHidden === 'true';
     
      const SECRET_COLUMNS = ['Контакты собственника (ФИО, Телефон)', 'Размер комиссии/Условия', 'Заметки для себя (скрытые)'];
      const secretIndexes = SECRET_COLUMNS.map(c => headers.indexOf(c)).filter(i => i !== -1);
     
      const result = [];
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][agentIdIdx]).trim() !== String(agentId).trim()) continue;
        if (!includeHidden && activeIdx !== -1 && rows[i][activeIdx] !== 'TRUE' && rows[i][activeIdx] !== true) continue;
       
        const row = {};
        headers.forEach((h, idx) => {
          if (secretIndexes.indexOf(idx) === -1) row[h] = rows[i][idx];
        });
        result.push(row);
      }
     
      setCache(cacheKey, result, CONFIG.cache.listingsTTL);
      return jsonResponse(res, 200, { success: true, data: result }, requestId);
    }
   
    if (processedAction === 'get_leads') {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Leads!A:H',
      });
     
      const rows = response.data.values;
      if (!rows || rows.length <= 1) return jsonResponse(res, 200, { success: true, data: [] }, requestId);
     
      const headers = rows[0];
      const agentIdx = headers.indexOf('agent_id');
      const leads = [];
     
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][agentIdx]).trim() === String(agentId).trim()) {
          leads.push({
            id: rows[i][1],
            timestamp: rows[i][2],
            objectName: rows[i][3],
            clientName: rows[i][4],
            clientPhone: rows[i][5],
            clientTelegram: rows[i][6],
            status: rows[i][7],
          });
        }
      }
      leads.reverse();
      return jsonResponse(res, 200, { success: true, data: leads }, requestId);
    }
   
    if (processedAction === 'get_agent_profile') {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'AgentData!A:H',
      });
      const rows = response.data.values;
      if (!rows || rows.length < 2) return jsonResponse(res, 200, { success: true, data: {} }, requestId);
     
      const headers = rows[0];
      const agentIdx = headers.indexOf('agent_id');
     
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][agentIdx]).trim() === String(agentId).trim()) {
          const profile = {};
          headers.forEach((h, idx) => { profile[h] = rows[i][idx]; });
          return jsonResponse(res, 200, { success: true, data: profile }, requestId);
        }
      }
      return jsonResponse(res, 200, { success: true, data: {} }, requestId);
    }
   
    if (processedAction === 'get_pages') {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Pages!A:D',
      });
      const rows = response.data.values;
      if (!rows || rows.length <= 1) return jsonResponse(res, 200, { success: true, data: [] }, requestId);
     
      const headers = rows[0];
      const agentIdx = headers.indexOf('agent_id');
      const pages = [];
     
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][agentIdx]).trim() === String(agentId).trim()) {
          pages.push({
            agent_id: rows[i][0],
            page: rows[i][1],
            title: rows[i][2],
            content: rows[i][3],
          });
        }
      }
      return jsonResponse(res, 200, { success: true, data: pages }, requestId);
    }
   
    if (req.method !== 'POST') {
      return jsonResponse(res, 405, { success: false, error: 'Метод не разрешён' }, requestId);
    }
   
    if (processedAction !== 'save_lead') {
      const initData = req.body?.initData;
      let isAuthorized = false;
     
      if (initData) isAuthorized = true;
      if (!isAuthorized && req.body?.pin) {
        const pinResult = await verifyAgentPin(sheets, agentId, req.body.pin);
        if (pinResult.success) isAuthorized = true;
      }
     
      if (!isAuthorized) return jsonResponse(res, 401, { success: false, error: 'Ошибка авторизации' }, requestId);
    }
   
    if (processedAction === 'create') {
      const data = req.body;
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Listings!1:1',
      });
      const headers = response.data.values[0];
     
      const newRow = headers.map(h => {
        if (h === 'agent_id') return agentId;
        if (h === 'created_at' || h === 'updated_at') return formatRussianDate(new Date());
        return sanitizeInput(data[h], 500) || '';
      });
     
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Listings!A:Z',
        valueInputOption: 'USER_ENTERED',
        resource: { values: [newRow] },
      });
     
      clearCache(`listings:${agentId}`);
      return jsonResponse(res, 200, { success: true, id: data.id || 'new-' + Date.now() }, requestId);
    }
   
    if (processedAction === 'update') {
      const data = req.body;
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Listings!A:Z',
      });
      const rows = response.data.values;
      const headers = rows[0];
      const idIdx = headers.indexOf('id');
      const agentIdx = headers.indexOf('agent_id');
     
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][idIdx]).trim() === String(data.id).trim()) {
          if (String(rows[i][agentIdx]).trim() !== String(agentId).trim()) {
            return jsonResponse(res, 403, { success: false, error: 'Чужой объект' }, requestId);
          }
         
          const updateRow = headers.map((h, idx) => {
            if (data.hasOwnProperty(h) && h !== 'agent_id') return sanitizeInput(data[h], 500);
            if (h === 'updated_at') return formatRussianDate(new Date());
            return rows[i][idx];
          });
         
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Listings!A${i + 1}:Z${i + 1}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [updateRow] },
          });
         
          clearCache(`listings:${agentId}`);
          return jsonResponse(res, 200, { success: true }, requestId);
        }
      }
      return jsonResponse(res, 404, { success: false, error: 'Не найдено' }, requestId);
    }
   
    if (processedAction === 'delete') {
      const data = req.body;
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Listings!A:Z',
      });
      const rows = response.data.values;
      const headers = rows[0];
      const idIdx = headers.indexOf('id');
      const agentIdx = headers.indexOf('agent_id');
     
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][idIdx]).trim() === String(data.id).trim()) {
          if (String(rows[i][agentIdx]).trim() !== String(agentId).trim()) {
            return jsonResponse(res, 403, { success: false, error: 'Чужой объект' }, requestId);
          }
         
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
              requests: [{
                deleteDimension: {
                  range: {
                    sheetId: 0,
                    dimension: 'ROWS',
                    startIndex: i,
                    endIndex: i + 1,
                  },
                },
              }],
            },
          });
         
          clearCache(`listings:${agentId}`);
          return jsonResponse(res, 200, { success: true }, requestId);
        }
      }
      return jsonResponse(res, 404, { success: false, error: 'Не найдено' }, requestId);
    }
   
    // === СОХРАНЕНИЕ ЗАЯВКИ (ПУБЛИЧНЫЙ МЕТОД) ===
    if (processedAction === 'save_lead') {
      const requestData = req.body.data || req.body;
     
      const clientName = sanitizeInput(requestData.clientName, 100);
      if (!clientName || clientName.length < 2) {
        return jsonResponse(res, 400, { success: false, error: 'Введите имя' }, requestId);
      }
     
      const clientPhone = validatePhone(requestData.clientPhone);
      if (!clientPhone) {
        return jsonResponse(res, 400, { success: false, error: 'Введите корректный телефон' }, requestId);
      }
     
      const clientTelegram = sanitizeInput(requestData.clientTelegram || '', 50);
      const objectName = sanitizeInput(requestData.objectName || '', 200);
      const phoneForSheets = "'" + clientPhone;
      const timestamp = formatRussianDate(new Date());
      const leadId = 'lead-' + Date.now();
     
      // Получаем chatId агента БЕЗ проверки доступа
      const agentInfo = await getAgentData(sheets, agentId);
      const chatId = agentInfo.chatId || '';
     
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Leads!A:H',
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[
            agentId,
            leadId,
            timestamp,
            objectName,
            clientName,
            phoneForSheets,
            clientTelegram || 'Не указан',
            'Новая',
          ]],
        },
      });
     
      // Отправка уведомления в Telegram
      const token = process.env.TELEGRAM_NOTIFICATION_BOT_TOKEN;
      if (token && chatId) {
        const msg = `<b>🔔 Новая заявка!</b>\n\n` +
                   `<b>Объект:</b> ${objectName || '-'}\n` +
                   `<b>Имя:</b> ${clientName}\n` +
                   `<b>Телефон:</b> ${clientPhone}\n` +
                   `<b>Telegram:</b> ${clientTelegram || '-'}`;
       
        try {
          const tgResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' }),
          });
         
          if (!tgResponse.ok) {
            logger.warn(requestId, 'Telegram notification failed', { status: tgResponse.status, chatId });
          }
        } catch (tgErr) {
          logger.warn(requestId, 'Telegram notification error', { error: tgErr.message });
        }
      }
     
      logger.info(requestId, 'Lead saved', { leadId, agentId, clientName, clientPhone });
      return jsonResponse(res, 200, { success: true, id: leadId }, requestId);
    }
   
    if (processedAction === 'update_lead_status') {
      const data = req.body;
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Leads!A:H',
      });
      const rows = response.data.values;
      const headers = rows[0];
      const idIdx = headers.indexOf('id');
      const agentIdx = headers.indexOf('agent_id');
      const statusIdx = headers.indexOf('status');
     
      const statusMap = {
        'new': 'Новая',
        'contacted': 'Обзвонена',
        'completed': 'Завершена',
        'cancelled': 'Отменена',
      };
     
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][idIdx]) === String(data.id)) {
          if (String(rows[i][agentIdx]).trim() !== String(agentId).trim()) {
            return jsonResponse(res, 403, { success: false, error: 'Чужая заявка' }, requestId);
          }
         
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Leads!${String.fromCharCode(65 + statusIdx)}${i + 1}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[statusMap[data.status] || data.status]] },
          });
         
          return jsonResponse(res, 200, { success: true }, requestId);
        }
      }
      return jsonResponse(res, 404, { success: false, error: 'Заявка не найдена' }, requestId);
    }
   
    if (processedAction === 'update_agent_profile') {
      const data = req.body;
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'AgentData!A:H',
      });
      const rows = response.data.values;
      const headers = rows[0];
      const agentIdx = headers.indexOf('agent_id');
     
      const rowData = [
        agentId,
        sanitizeInput(data.name, 100),
        sanitizeInput(data.role, 100),
        sanitizeInput(data.agencyName, 200),
        sanitizeInput(data.agencyAddress, 300),
        sanitizeInput(data.telegramUsername, 50),
        sanitizeInput(data.phone, 20),
        sanitizeInput(data.photoUrl, 500),
      ];
     
      let updated = false;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][agentIdx]).trim() === String(agentId).trim()) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `AgentData!A${i + 1}:H${i + 1}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [rowData] },
          });
          updated = true;
          break;
        }
      }
     
      if (!updated) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: 'AgentData!A:H',
          valueInputOption: 'USER_ENTERED',
          resource: { values: [rowData] },
        });
      }
     
      clearCache(`agent:${agentId}`);
      return jsonResponse(res, 200, { success: true }, requestId);
    }
   
    return jsonResponse(res, 400, { success: false, error: 'Неизвестное действие' }, requestId);
   
  } catch (error) {
    logger.error(requestId, 'API Error', {
      message: error.message,
      stack: error.stack,
      code: error.code,
    });
   
    return jsonResponse(res, 500, {
      success: false,
      error: 'Внутренняя ошибка сервера',
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack,
        details: error.message,
      }),
    }, requestId);
  }
};
