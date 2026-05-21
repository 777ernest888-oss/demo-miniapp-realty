document.addEventListener('DOMContentLoaded', () => {
  // Пробуем инициализировать Telegram, но не зависим от него
  let tg = null;
  try {
    if (window.Telegram && window.Telegram.WebApp) {
      tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
    }
  } catch (e) {
    console.log('Telegram не доступен, работаем без него');
  }
 
  document.documentElement.style.setProperty('--primary-color', APP_CONFIG.brand.color);
 
  document.getElementById('welcomeLogo').src = APP_CONFIG.brand.logo;
  document.getElementById('welcomeTitle').textContent = APP_CONFIG.brand.name;
  document.getElementById('welcomeSubtitle').textContent = 'Каталог новостроек Санкт-Петербурга';
 
  if (tg) {
    try { tg.setHeaderColor(APP_CONFIG.brand.color); } catch (e) {}
  }
 
  document.getElementById('headerTitle').textContent = APP_CONFIG.brand.name;
  document.getElementById('headerLogo').src = APP_CONFIG.brand.logo;

  loadData();
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
    document.getElementById('listings').innerHTML =
      '<div class="loader">Ошибка загрузки данных</div>';
  }
}

function parseCSV(csv) {
  const rows = [];
  let currentRow = [], currentCell = '', inQuotes = false; 
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i], next = csv[i + 1];
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
    } else { currentCell += char; }
  }
  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }
  return rows;
}

function mapRowToObject(row) {
  return {
    id: row[0], name: row[1], district: row[2], metro: row[3],
    price_from: Number(row[4]) || 0, rooms: row[6],
    area_min: Number(row[7]) || 0, class: row[13],
    finishing: row[14], description: row[15],
    image_main: row[16] || 'https://via.placeholder.com/600x400',
    status: row[11], completion_soonest: row[10], address: row[21], active: row[24]
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
      priceMatch = priceVal.includes('+') ? item.price_from >= limit : item.price_from <= limit;    }
    return roomMatch && priceMatch;
  });
  renderListings(filtered);
}

function renderListings(items) {
  const container = document.getElementById('listings');
  if (items.length === 0) {
    container.innerHTML = '<div class="loader">Нет объектов</div>';
    return;
  }
  container.innerHTML = items.map(item => `
    <article class="card" onclick="openModal('${item.id}')">
      <img src="${item.image_main}" class="card-img">
      <div class="card-body">
        <span class="card-status ${item.status.includes('Продан') ? 'status-sold' : 'status-active'}">${item.status}</span>
        <h3 class="card-title">${item.name}</h3>
        <div class="card-price">${formatPrice(item.price_from)} ₽</div>
        <div class="card-meta">
          <span>${item.rooms} комн.</span><span>•</span>
          <span>от ${item.area_min} м²</span><span>•</span>
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
  document.getElementById('modalTitle').textContent = item.name;
  document.getElementById('modalPrice').textContent = `${formatPrice(item.price_from)} ₽`;
  document.getElementById('modalDesc').textContent = item.description || '';
 
  // ГЛАВНОЕ: Простая ссылка без Telegram SDK
  const contactLink = document.getElementById('contactLink');
  contactLink.href = APP_CONFIG.brand.contactLink;
  contactLink.target = '_blank';
  contactLink.rel = 'noopener noreferrer';
 
  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');}

document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

function formatPrice(num) {
  return num ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") : '0';
}
