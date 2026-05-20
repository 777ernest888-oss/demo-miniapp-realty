document.addEventListener('DOMContentLoaded', () => {
  // 1. Инициализация Telegram WebApp
  const tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand();
 
  // Применяем бренд
  document.documentElement.style.setProperty('--primary-color', APP_CONFIG.brand.color);
  tg.setHeaderColor(APP_CONFIG.brand.color);
  tg.setBackgroundColor(APP_CONFIG.brand.color);
  document.getElementById('headerTitle').textContent = APP_CONFIG.brand.name;
  document.getElementById('headerLogo').src = APP_CONFIG.brand.logo;
  document.getElementById('modalBtn').href = APP_CONFIG.brand.contactLink;
  document.getElementById('pageTitle').textContent = APP_CONFIG.brand.name;

  // 2. Загрузка данных
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
    document.getElementById('listings').innerHTML = '<div class="loader">Ошибка загрузки данных. Проверьте ссылку.</div>';
    console.error(e);
  }
}

// Надёжный парсер CSV (учитывает кавычки и запятые внутри полей)
function parseCSV(csv) {
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;
 
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const next = csv[i + 1];   
    if (char === '"') {
      if (inQuotes && next === '"') { currentCell += '"'; i++; }
      else { inQuotes = !inQuotes; }
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

// Маппинг строго под ваши 24 колонки
function mapRowToObject(row) {
  const headers = row.slice(0, 24); // Берём ровно 24 колонки
  return {
    id: headers[0],
    name: headers[1],
    district: headers[2],
    metro: headers[3],
    price_from: Number(headers[4]) || 0,
    price_to: Number(headers[5]) || 0,
    rooms: headers[6],
    area_min: Number(headers[7]) || 0,
    area_max: Number(headers[8]) || 0,
    price_per_sqm: Number(headers[9]) || 0,
    completion_soonest: headers[10],
    status: headers[11],
    completion_all: headers[12],
    class: headers[13],
    finishing: headers[14],
    description: headers[15],
    image_main: headers[16] || 'https://via.placeholder.com/600x400?text=No+Image',
    images_gallery: headers[17],
    floor_plans_text: headers[18],
    floor_plans_images: headers[19],
    features: headers[20],
    address: headers[21],
    lat: headers[22],    lng: headers[23],
    active: headers[24]
  };
}

function applyFilters() {
  const roomVal = document.getElementById('filterRooms').value;
  const priceVal = document.getElementById('filterPrice').value;
 
  const filtered = allListings.filter(item => {
    const roomMatch = roomVal === 'all' || item.rooms === roomVal;
    let priceMatch = true;
    if (priceVal !== 'all') {
      const limit = Number(priceVal);
      priceMatch = priceVal.includes('+') ? item.price_from >= limit : item.price_from <= limit;
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

function openModal(id) {  const item = allListings.find(i => String(i.id) === String(id));
  if (!item) return;
 
  document.getElementById('modalImg').src = item.image_main;
  document.getElementById('modalStatus').textContent = item.status;
  document.getElementById('modalStatus').className = `modal-status ${item.status.includes('Продан') ? 'status-sold' : 'status-active'}`;
  document.getElementById('modalTitle').textContent = item.name;
  document.getElementById('modalPrice').textContent = `${formatPrice(item.price_from)} ₽`;
  document.getElementById('modalMeta').innerHTML = `
    <span> ${item.rooms} комн.</span>
    <span>📐 от ${item.area_min} м²</span>
    <span> ${item.district}</span>
    ${item.metro ? `<span>🚇 ${item.metro}</span>` : ''}
  `;
  document.getElementById('modalDesc').textContent = item.description || '';
  document.getElementById('modalDetails').innerHTML = `
    <div class="detail-item"><div class="detail-label">Класс</div><div class="detail-value">${item.class || '-'}</div></div>
    <div class="detail-item"><div class="detail-label">Отделка</div><div class="detail-value">${item.finishing || '-'}</div></div>
    <div class="detail-item"><div class="detail-label">Сдача</div><div class="detail-value">${item.completion_soonest || '-'}</div></div>
    <div class="detail-item"><div class="detail-label">Адрес</div><div class="detail-value">${item.address || '-'}</div></div>
  `;
 
  document.getElementById('modal').classList.remove('hidden');
  if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

function formatPrice(num) {
  return num ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") : '0';
}