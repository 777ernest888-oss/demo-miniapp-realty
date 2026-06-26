// Vercel Serverless Function - Prostors API
const { google } = require('googleapis');

// CORS заголовки
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Инициализация Google Sheets API
function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Утилиты
function jsonResponse(res, status, data) {
  res.status(status).json({
    headers: corsHeaders,
    body: JSON.stringify(data),
  });
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
  return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear();
}

// Проверка доступа агента
async function checkAgentAccess(sheets, agentId, userId) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Agents!A:K',
  });

  const rows = response.data.values;
  if (!rows || rows.length < 2) return { allowed: false, error: 'Система не настроена' };

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

  if (!agentRow) return { allowed: false, error: 'Агент не найден' };
  if (agentRow[idx.status] !== 'active') return { allowed: false, error: 'Доступ приостановлен' };

  const expiresAt = agentRow[idx.expires_at];
  if (expiresAt && agentRow[idx.plan_type] !== 'lifetime') {
    const parsedExpiry = parseRussianDate(expiresAt);
    if (parsedExpiry && parsedExpiry < new Date()) {
      return { allowed: false, error: 'Срок подписки истёк' };
    }
  }

  if (userId && agentRow[idx.telegram_user_id]) {
    if (String(agentRow[idx.telegram_user_id]) !== String(userId)) {
      return { allowed: false, error: 'Нет прав доступа к этому агенту' };
    }
  }

  let brandConfig = {};
  try {
    brandConfig = agentRow[idx.brand_config] ? JSON.parse(agentRow[idx.brand_config]) : {};
  } catch (e) {
    brandConfig = {};
  }

  return {
    allowed: true,
    agentId: agentRow[idx.agent_id],
    name: agentRow[idx.name],
    telegramUserId: agentRow[idx.telegram_user_id],
    chatId: agentRow[idx.chat_id] || '',
    config: brandConfig,
  };
}

// Проверка PIN
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
      if (rows[i][hashIdx] === hashPin(pin)) {
        return { success: true, agentId: agentId };
      }
      return { success: false, error: 'Неверный PIN-код' };
    }
  }
  return { success: false, error: 'Агент не найден' };
}

// Главная функция
module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    // === ЛОГИРОВАНИЕ ДЛЯ ОТЛАДКИ ===
    console.log('=== API Request ===');
    console.log('Action:', req.query.action);
    console.log('Agent ID:', req.query.agent_id || req.query.agentId);
    console.log('User ID:', req.query.user_id || req.query.userId);
    console.log('Spreadsheet ID:', SPREADSHEET_ID);
    console.log('Request method:', req.method);
    console.log('Query:', JSON.stringify(req.query));
    console.log('Body:', JSON.stringify(req.body));

    const sheets = getSheetsClient();
    const action = req.query.action || req.body?.action;
    const agentId = req.query.agent_id || req.query.agentId || req.body?.agentId;
    const userId = req.query.user_id || req.body?.userId;
    const pin = req.query.pin || req.body?.pin;

    console.log('Processed action:', action);
    console.log('Processed agentId:', agentId);

    // 1. Поиск агента по домену
    if (action === 'resolve_agent_by_domain') {
      const domain = req.query.domain;
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Agents!A:J',
      });
      const rows = response.data.values;
      if (!rows) return res.json({ success: false, error: 'Агент не найден' });

      const headers = rows[0];
      const domainIdx = headers.indexOf('custom_domain');
      const idIdx = headers.indexOf('agent_id');

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][domainIdx]).trim().toLowerCase() === String(domain).trim().toLowerCase()) {
          return res.json({ success: true, agentId: rows[i][idIdx] });
        }
      }
      return res.json({ success: false, error: 'Агент не найден' });
    }

    // 2. Получение конфига агента
    if (action === 'get_agent_config') {
      console.log('Getting agent config for:', agentId);
      const result = await checkAgentAccess(sheets, agentId, userId || null);
      console.log('Agent access result:', result);
      if (!result.allowed) return res.json({ success: false, error: result.error });
      const isOwner = userId && result.telegramUserId && (String(userId) === String(result.telegramUserId));
      return res.json({
        success: true,
        agentId: result.agentId,
        name: result.name,
        config: result.config,
        isOwner: isOwner,
      });
    }

    // 3. Верификация PIN
    if (action === 'verify_pin') {
      if (!agentId || !pin) return res.json({ success: false, error: 'Нет данных' });
      return res.json(await verifyAgentPin(sheets, agentId, pin));
    }

    // Проверка доступа для остальных методов
    const access = await checkAgentAccess(sheets, agentId, userId);
    if (!access.allowed) return res.json({ success: false, error: access.error, code: 403 });

    // 4. Список объектов
    if (action === 'get_listings' || !action) {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Listings!A:Z',
      });
      const rows = response.data.values;
      if (!rows || rows.length <= 1) return res.json({ success: true, data: [] });

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
      return res.json({ success: true, data: result });
    }

    // 5. Заявки
    if (action === 'get_leads') {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Leads!A:H',
      });
      const rows = response.data.values;
      if (!rows || rows.length <= 1) return res.json({ success: true, data: [] });

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
      return res.json({ success: true, data: leads });
    }

    // 6. Профиль агента
    if (action === 'get_agent_profile') {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'AgentData!A:H',
      });
      const rows = response.data.values;
      if (!rows || rows.length < 2) return res.json({ success: true, data: {} });

      const headers = rows[0];
      const agentIdx = headers.indexOf('agent_id');

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][agentIdx]).trim() === String(agentId).trim()) {
          const profile = {};
          headers.forEach((h, idx) => { profile[h] = rows[i][idx]; });
          return res.json({ success: true, data: profile });
        }
      }
      return res.json({ success: true, data: {} });
    }

    // 7. Страницы
    if (action === 'get_pages') {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Pages!A:D',
      });
      const rows = response.data.values;
      if (!rows || rows.length <= 1) return res.json({ success: true, data: [] });

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
      return res.json({ success: true, data: pages });
    }

    // POST методы требуют авторизации
    if (req.method !== 'POST') {
      return res.json({ success: false, error: 'Метод не разрешён' });
    }

// POST методы
    if (req.method !== 'POST') {
      return res.json({ success: false, error: 'Метод не разрешён' });
    }

    // Заявки не требуют авторизации (любой клиент может отправить)
    if (action !== 'save_lead') {
      // Для остальных POST действий нужна авторизация
      const initData = req.body?.initData;
      let isAuthorized = false;

      if (initData) {
        isAuthorized = true; // TODO: добавить полную проверку HMAC
      }

      if (!isAuthorized && req.body?.pin) {
        const pinResult = await verifyAgentPin(sheets, agentId, req.body.pin);
        if (pinResult.success) isAuthorized = true;
      }

      if (!isAuthorized) {
        return res.json({ success: false, error: 'Ошибка авторизации', code: 401 });
      }
    }

    // 8. Создание объекта
    if (action === 'create') {
      const data = req.body;
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Listings!1:1',
      });
      const headers = response.data.values[0];

      const newRow = headers.map(h => {
        if (h === 'agent_id') return agentId;
        if (h === 'created_at' || h === 'updated_at') return formatRussianDate(new Date());
        return data[h] || '';
      });

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Listings!A:Z',
        valueInputOption: 'USER_ENTERED',
        resource: { values: [newRow] },
      });

      return res.json({ success: true, id: data.id || 'new-' + Date.now() });
    }

    // 9. Обновление объекта
    if (action === 'update') {
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
            return res.json({ success: false, error: 'Чужой объект' });
          }

          const updateRow = headers.map((h, idx) => {
            if (data.hasOwnProperty(h) && h !== 'agent_id') return data[h];
            if (h === 'updated_at') return formatRussianDate(new Date());
            return rows[i][idx];
          });

          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Listings!A${i + 1}:Z${i + 1}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [updateRow] },
          });

          return res.json({ success: true });
        }
      }
      return res.json({ success: false, error: 'Не найдено' });
    }

    // 10. Удаление объекта
    if (action === 'delete') {
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
            return res.json({ success: false, error: 'Чужой объект' });
          }

          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
              requests: [{
                deleteDimension: {
                  range: {
                    sheetId: 0, // ID листа Listings
                    dimension: 'ROWS',
                    startIndex: i,
                    endIndex: i + 1,
                  },
                },
              }],
            },
          });

          return res.json({ success: true });
        }
      }
      return res.json({ success: false, error: 'Не найдено' });
    }

    // 11. Сохранение заявки
    if (action === 'save_lead') {
      const data = req.body.data || req.body;
      const timestamp = formatRussianDate(new Date());
      const leadId = 'lead-' + Date.now();

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Leads!A:H',
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[
            agentId,
            leadId,
            timestamp,
            data.objectName || '',
            data.clientName || '',
            data.clientPhone || '',
            data.clientTelegram || 'Не указан',
            'Новая',
          ]],
        },
      });

      // Уведомление агенту
      const token = process.env.TELEGRAM_NOTIFICATION_BOT_TOKEN;
      const chatId = access.chatId;
      if (token && chatId) {
        const msg = `<b>🔔 Новая заявка!</b>\n\n🏢 ${data.objectName || '-'}\n👤 ${data.clientName || '-'}\n📞 ${data.clientPhone || '-'}\n💬 ${data.clientTelegram || '-'}`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' }),
        });
      }

      return res.json({ success: true, id: leadId });
    }

    // 12. Обновление статуса заявки
    if (action === 'update_lead_status') {
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
            return res.json({ success: false, error: 'Чужая заявка' });
          }

          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Leads!${String.fromCharCode(65 + statusIdx)}${i + 1}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[statusMap[data.status] || data.status]] },
          });

          return res.json({ success: true });
        }
      }
      return res.json({ success: false, error: 'Заявка не найдена' });
    }

    // 13. Обновление профиля
    if (action === 'update_agent_profile') {
      const data = req.body;
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'AgentData!A:H',
      });
      const rows = response.data.values;
      const headers = rows[0];
      const agentIdx = headers.indexOf('agent_id');

      const rowData = [agentId, data.name, data.role, data.agencyName, data.agencyAddress, data.telegramUsername, data.phone, data.photoUrl];

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

      return res.json({ success: true });
    }

    // Если действие не распознано
    return res.json({ success: false, error: 'Неизвестное действие' });

  } catch (error) {
    // === ЛОГИРОВАНИЕ ОШИБОК ===
    console.error('=== API ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error code:', error.code);
    console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      code: error.code
    });
  }
};
