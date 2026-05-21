document.addEventListener('DOMContentLoaded', () => {
  // 1. БЕЗОПАСНАЯ инициализация Telegram WebApp
  let tg = null;
  try {
    if (window.Telegram && window.Telegram.WebApp) {
      tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
    }
  } catch (e) {
    console.log('Telegram WebApp не доступен');
  }
 
  // Применяем бренд из config.js
  document.documentElement.style.setProperty('--primary-color', APP_CONFIG.brand.color);
 
  // Welcome Screen
  document.getElementById('welcomeLogo').src = APP_CONFIG.brand.logo;
  document.getElementById('welcomeTitle').textContent = APP_CONFIG.brand.name;
  document.getElementById('welcomeSubtitle').textContent = 'Каталог новостроек Санкт-Петербурга. Подберём квартиру под ваш бюджет!';
 
  // Header
  if (tg) {
    try {
      tg.setHeaderColor(APP_CONFIG.brand.color);
    } catch (e) {
      console.log('Не удалось установить цвет хедера');
    }
  }
  document.getElementById('headerTitle').textContent = APP_CONFIG.brand.name;
  document.getElementById('headerLogo').src = APP_CONFIG.brand.logo;
  document.getElementById('pageTitle').textContent = APP_CONFIG.brand.name;

  // 2. Загрузка данных из Google Sheets
  loadData();

  // 3. Обработчики фильтров
  document.getElementById('filterRooms').addEventListener('change', applyFilters);
  document.getElementById('filterPrice').addEventListener('change', applyFilters);
});

let allListings = [];

async function loadData() {
  try {
    const res = await fetch(APP_CONFIG.sheetUrl);
    const csv = await res.text();
    allListings = parseCSV(csv)
      .map(row => mapRowToObject(row))
      .filter(item => String(item.active).toLowerCase() === 'true');   
    renderListings(allListings);
  } catch (e) {
    console.error('Ошибка загрузки:', e);
    document.getElementById('listings').innerHTML =
      '<div class="loader">Ошибка загрузки данных. Проверьте подключение к таблице.</div>';
  }
}

function parseCSV(csv) {
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;
 
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const next = csv[i + 1];
   
    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === ',' || char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      currentRow.push(currentCell.trim());
      currentCell = '';
      if (char === '\n' || char === '\r') {
        if (currentRow.length > 0) rows.push(currentRow);
        currentRow = [];
      }
    } else {
      currentCell += char;
    }
  }
  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }
  return rows;
}

function mapRowToObject(row) {
  return {
    id: row[0],
    name: row[1],
    district: row[2],    metro: row[3],
    price_from: Number(row[4]) || 0,
    price_to: Number(row[5]) || 0,
    rooms: row[6],
    area_min: Number(row[7]) || 0,
    area_max: Number(row[8]) || 0,
    price_per_sqm: Number(row[9]) || 0,
    completion_soonest: row[10],
    status: row[11],
    completion_all: row[12],
    class: row[13],
    finishing: row[14],
    description: row[15],
    image_main: row[16] || 'https://via.placeholder.com/600x400?text=No+Image',
    images_gallery: row[17],
    floor_plans_text: row[18],
    floor_plans_images: row[19],
    features: row[20],
    address: row[21],
    lat: row[22],
    lng: row[23],
    active: row[24]
  };
}

function closeWelcome() {
  document.getElementById('welcomeScreen').classList.add('hidden');
  document.getElementById('appHeader').classList.remove('hidden');
  document.getElementById('filtersContainer').classList.remove('hidden');
  document.getElementById('listings').classList.remove('hidden');
}

function applyFilters() {
  const roomVal = document.getElementById('filterRooms').value;
  const priceVal = document.getElementById('filterPrice').value;
 
  const filtered = allListings.filter(item => {
    const roomMatch = roomVal === 'all' || item.rooms === roomVal;
    let priceMatch = true;
    if (priceVal !== 'all') {
      const limit = Number(priceVal) * 1000000;
      if (priceVal.includes('+')) {
        priceMatch = item.price_from >= limit;
      } else {
        priceMatch = item.price_from <= limit;
      }
    }
    return roomMatch && priceMatch;
  });
    renderListings(filtered);
}

function renderListings(items) {
  const container = document.getElementById('listings');
  if (items.length === 0) {
    container.innerHTML = '<div class="loader">Нет объектов по выбранным фильтрам</div>';
    return;
  }
 
  container.innerHTML = items.map(item => `
    <article class="card" onclick="openModal('${item.id}')">
      <img src="${item.image_main}" alt="${item.name}" class="card-img" loading="lazy">
      <div class="card-body">
        <span class="card-status ${item.status.includes('Продан') || item.status.includes('Снят') ? 'status-sold' : 'status-active'}">${item.status}</span>
        <h3 class="card-title">${item.name}</h3>
        <div class="card-price">${formatPrice(item.price_from)} ₽</div>
        <div class="card-meta">
          <span>${item.rooms} комн.</span>
          <span>•</span>
          <span>от ${item.area_min} м²</span>
          <span>•</span>
          <span>${item.district}</span>
        </div>
        ${item.metro ? `<div class="card-district">🚇 ${item.metro}</div>` : ''}
      </div>
    </article>
  `).join('');
}

function openModal(id) {
  const item = allListings.find(i => String(i.id) === String(id));
  if (!item) return;
 
  document.getElementById('modalImg').src = item.image_main;
  document.getElementById('modalStatus').textContent = item.status;
  document.getElementById('modalStatus').className = `modal-status ${item.status.includes('Продан') || item.status.includes('Снят') ? 'status-sold' : 'status-active'}`;
  document.getElementById('modalTitle').textContent = item.name;
  document.getElementById('modalPrice').textContent = `${formatPrice(item.price_from)} ₽`;
  document.getElementById('modalMeta').innerHTML = `
    <span>🏠 ${item.rooms} комн.</span>
    <span>📐 от ${item.area_min} м²</span>
    <span>📍 ${item.district}</span>
    ${item.metro ? `<span>🚇 ${item.metro}</span>` : ''}
  `;
  document.getElementById('modalDesc').textContent = item.description || '';
  document.getElementById('modalDetails').innerHTML = `
    <div class="detail-item"><div class="detail-label">Класс</div><div class="detail-value">${item.class || '-'}</div></div>
    <div class="detail-item"><div class="detail-label">Отделка</div><div class="detail-value">${item.finishing || '-'}</div></div>
    <div class="detail-item"><div class="detail-label">Сдача</div><div class="detail-value">${item.completion_soonest || '-'}</div></div>    <div class="detail-item"><div class="detail-label">Адрес</div><div class="detail-value">${item.address || '-'}</div></div>
  `;
 
  // Настраиваем кнопку с рабочим обработчиком
  const contactBtn = document.getElementById('contactBtn');
  contactBtn.onclick = () => openTelegramBot();
 
  document.getElementById('modal').classList.remove('hidden');
 
  try {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
  } catch (e) {}
}

function openTelegramBot() {
  // Правильное открытие Telegram бота
  window.location.href = APP_CONFIG.brand.contactLink;
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    closeModal();
  }
});

function formatPrice(num) {
  if (!num) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
