let tg;
try {
  if (window.Telegram && window.Telegram.WebApp) {
    tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
  } else {
    tg = {
      ready: () => {},
      expand: () => {},
      MainButton: { setText: () => {}, show: () => {}, onClick: () => {}, hide: () => {} },
      showAlert: (msg) => alert(msg),
      initDataUnsafe: { user: {} }
    };
  }
} catch (e) { console.error(e); }

let config = {};
let listings = [];
let currentModalId = null;
let map = null;
let markers = [];

function startApp() {
  document.getElementById('welcomeScreen')?.classList.add('hidden');
  document.getElementById('mainContent')?.classList.remove('hidden');
  window.scrollTo(0, 0);
}

function toggleFilters() {
  const block = document.getElementById('filtersBlock');
  const btn = document.querySelector('.filters-toggle-btn');
  if (block && btn) {
    block.classList.toggle('hidden');
    btn.textContent = block.classList.contains('hidden') ? '🔽 Фильтры' : ' Скрыть фильтры';
  }
}

function switchView(view) {
  const listBtn = document.getElementById('listViewBtn');
  const mapBtn = document.getElementById('mapViewBtn');
  const listContainer = document.getElementById('listingsContainer');
  const mapContainer = document.getElementById('mapContainer');
  if (view === 'list') {
    listBtn.classList.add('active');
    mapBtn.classList.remove('active');
    listContainer.classList.remove('hidden');
    mapContainer.classList.add('hidden');
  } else {
    listBtn.classList.remove('active');    mapBtn.classList.add('active');
    listContainer.classList.add('hidden');
    mapContainer.classList.remove('hidden');
    setTimeout(() => initMap(), 100);
  }
}

async function init() {
  try {
    const configRes = await fetch('config.json');
    config = await configRes.json();
    if (config.data?.sheetUrl) {
      listings = await loadFromGoogleSheets(config.data.sheetUrl);
    }
    applyTheme();
    renderWelcome();
    renderFilters();
    // Фильтруем только активные объекты при старте
    renderListings(listings.filter(l => l.active));
    initPhoneMask();
  } catch (error) {
    console.error('Init Error:', error);
  }
}

async function loadFromGoogleSheets(url) {
  let csvUrl = url.replace('pubhtml', 'pub');
  if (!csvUrl.includes('output=csv')) {
    csvUrl += (csvUrl.includes('?') ? '&' : '?') + 'output=csv';
  }
  const response = await fetch(csvUrl);
  return parseCSV(await response.text());
}

function parseCSV(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const obj = {};
    headers.forEach((header, index) => {
      let value = values[index] !== undefined ? values[index].trim() : '';
      if (value === 'TRUE') value = true;
      else if (value === 'FALSE') value = false;
      else if (!isNaN(value) && value !== '') value = Number(value);
      obj[header] = value;
    });    result.push(obj);
  }
  return result;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
    else current += char;
  }
  result.push(current);
  return result;
}

function applyTheme() {
  if (!config.brand) return;
  document.documentElement.style.setProperty('--primary', config.brand.primaryColor || '#1a365d');
  document.documentElement.style.setProperty('--accent', config.brand.accentColor || '#d4af37');
}

function renderWelcome() {
  if (!config.features?.showWelcomeScreen) {
    document.getElementById('welcomeScreen')?.classList.add('hidden');
    document.getElementById('mainContent')?.classList.remove('hidden');
    return;
  }
}

function renderFilters() {
  // Исправлено: убраны пробелы в l =>
  const districts = [...new Set(listings.map(l => l.district).filter(Boolean))].sort();
  const districtContainer = document.getElementById('districtCheckboxes');
  if (districtContainer) {
    districtContainer.innerHTML = '';
    districts.forEach(d => {
      const label = document.createElement('label');
      label.className = 'checkbox-label';
      label.innerHTML = `<input type="checkbox" value="${escapeHtml(d)}" class="filter-checkbox" data-filter="district"><span>${escapeHtml(d)}</span>`;
      districtContainer.appendChild(label);
    });
  }
 
  const metros = [...new Set(listings.map(l => l.metro).filter(Boolean))].sort();
  const metroContainer = document.getElementById('metroCheckboxes');
  if (metroContainer) {    metroContainer.innerHTML = '';
    metros.forEach(m => {
      const label = document.createElement('label');
      label.className = 'checkbox-label';
      label.innerHTML = `<input type="checkbox" value="${escapeHtml(m)}" class="filter-checkbox" data-filter="metro"><span>${escapeHtml(m)}</span>`;
      metroContainer.appendChild(label);
    });
  }
 
  const roomsContainer = document.getElementById('roomsCheckboxes');
  if (roomsContainer) {
    const allRooms = [];
    listings.forEach(l => {
      if (l.rooms) {
        const roomList = String(l.rooms).split(',').map(r => r.trim());
        roomList.forEach(r => { if (r && !allRooms.includes(r)) allRooms.push(r); });
      }
    });
    allRooms.sort();
    roomsContainer.innerHTML = '';
    allRooms.forEach(r => {
      const label = document.createElement('label');
      label.className = 'checkbox-label';
      label.innerHTML = `<input type="checkbox" value="${escapeHtml(r)}" class="filter-checkbox" data-filter="rooms"><span>${escapeHtml(r)}</span>`;
      roomsContainer.appendChild(label);
    });
  }
 
  // Кнопки цены
  document.querySelectorAll('.price-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      if (this.classList.contains('active')) {
        this.classList.remove('active');
      } else {
        document.querySelectorAll('.price-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
      }
      filterListings();
    });
  });
 
  document.querySelectorAll('.filter-checkbox').forEach(cb => cb.addEventListener('change', filterListings));
}

function filterListings() {
  const activeBtn = document.querySelector('.price-btn.active');
  const maxPrice = activeBtn ? parseFloat(activeBtn.dataset.price) : Infinity;
 
  const selectedDistricts = Array.from(document.querySelectorAll('input[data-filter="district"]:checked')).map(cb => cb.value);
  const selectedMetros = Array.from(document.querySelectorAll('input[data-filter="metro"]:checked')).map(cb => cb.value);  const selectedRooms = Array.from(document.querySelectorAll('input[data-filter="rooms"]:checked')).map(cb => cb.value);
 
  const filtered = listings.filter(item => {
    if (!item.active) return false;
    if (typeof item.price_from !== 'number' || item.price_from > maxPrice) return false;
    if (selectedDistricts.length > 0 && !selectedDistricts.includes(item.district)) return false;
    if (selectedMetros.length > 0 && !selectedMetros.includes(item.metro)) return false;
    if (selectedRooms.length > 0 && item.rooms) {
      const itemRooms = String(item.rooms).split(',').map(r => r.trim());
      const hasMatch = selectedRooms.some(r => itemRooms.includes(r));
      if (!hasMatch) return false;
    }
    return true;
  });
  renderListings(filtered);
}

function renderListings(data) {
  const container = document.getElementById('listingsContainer');
  if (!container) return;
  container.innerHTML = '';
  if (!data || data.length === 0) {
    container.innerHTML = `<div class="empty-state">${config.texts?.emptyState || 'Нет объектов'}</div>`;
    return;
  }
 
  data.forEach(item => {
    let priceDisplay = '?';
    if (typeof item.price_from === 'number') {
      if (item.price_from < 1000) {
        priceDisplay = `${item.price_from.toFixed(1)} млн ₽`;
      } else {
        priceDisplay = `${(item.price_from / 1000000).toFixed(1)} млн ₽`;
      }
    }
   
    const priceTo = typeof item.price_to === 'number' ? item.price_to.toFixed(1) : '';
    const ppsqm = typeof item.price_per_sqm === 'number' ? Math.round(item.price_per_sqm).toLocaleString('ru-RU') : '';
    const area = (typeof item.area_min === 'number' && typeof item.area_max === 'number') ? `${item.area_min}–${item.area_max} м²` : '';
    const rooms = item.rooms || '';
    const statusKey = (item.status || 'other').toString().replace(/\s+/g, '-');
    const statusText = item.status === 'Сдан' ? '✅ Сдан' : item.status === 'Строится' ? '🏗 Строится' : '🟡 Частично сдан';
   
    const card = document.createElement('div');
    card.className = 'listing-card';
    card.onclick = function(e) {
      if (!e.target.closest('.consult-btn-inline')) openDetails(item.id);
    };
   
    card.innerHTML = `<img src="${escapeHtml(item.image_main) || ''}" alt="${escapeHtml(item.name) || ''}" class="listing-image" onerror="this.style.display='none'"><div class="listing-info"><h3>${escapeHtml(item.name) || 'Без названия'}</h3><div class="listing-meta"><span>${escapeHtml(item.district) || ''}</span><span>🚇 ${escapeHtml(item.metro) || ''}</span>${rooms ? `<span>🚪 ${escapeHtml(rooms)}</span>` : ''}${area ? `<span>📐 ${escapeHtml(area)}</span>` : ''}</div><div class="listing-price">от ${priceDisplay}${priceTo ? ` до ${priceTo} млн ₽` : ''} ${ppsqm ? `<span class="price-per-sqm">~${ppsqm} ₽/м²</span>` : ''}</div><div class="listing-status status-${statusKey}">${statusText}</div><button class="tg-btn consult-btn-inline" onclick="openConsultForm('${item.id}', event)">📞 Получить консультацию</button></div>`;   
    container.appendChild(card);
  });
}

function initMap() {
  if (typeof L === 'undefined') return;
  const mapContainer = document.getElementById('mapContainer');
  if (!mapContainer) return;
  if (!map) {
    map = L.map('mapContainer').setView([59.9343, 30.3351], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
  }
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  const activeListings = listings.filter(l => l.active && l.lat && l.lng);
  activeListings.forEach(item => {
    let priceDisplay = '?';
    if (typeof item.price_from === 'number') {
      priceDisplay = item.price_from < 1000 ? item.price_from.toFixed(1) : (item.price_from / 1000000).toFixed(1);
    }
    const marker = L.marker([item.lat, item.lng]).addTo(map).bindPopup(`<b>${item.name}</b><br>от ${priceDisplay} млн ₽`);
    markers.push(marker);
  });
  if (markers.length > 0) {
    map.fitBounds(new L.featureGroup(markers).getBounds().pad(0.1));
  }
  setTimeout(() => map.invalidateSize(), 150);
}

function openDetails(id) {
  const item = listings.find(l => l.id === id);
  if (!item) return;
  currentModalId = id;
  document.getElementById('modalTitle').textContent = item.name || '';
 
  let priceDisplay = '?';
  if (typeof item.price_from === 'number') {
    priceDisplay = item.price_from < 1000 ? item.price_from.toFixed(1) : (item.price_from / 1000000).toFixed(1);
  }
  const ppsqm = typeof item.price_per_sqm === 'number' ? Math.round(item.price_per_sqm).toLocaleString('ru-RU') : '';
  document.getElementById('modalPrice').innerHTML = `от <b>${priceDisplay}</b> млн ₽ ${ppsqm ? `<span class="price-per-sqm">~${ppsqm} ₽/м²</span>` : ''}`;
 
  document.getElementById('modalMeta').innerHTML = `<div class="meta-row"><span>📍 ${escapeHtml(item.address) || ''}</span></div><div class="meta-row"><span>🚇 ${escapeHtml(item.metro) || ''}</span></div><div class="meta-row"><span>🏗 ${escapeHtml(item.class) || ''} • ${escapeHtml(item.finishing) || ''}</span></div><div class="meta-row"><span>📅 ${escapeHtml(item.completion_soonest || item.completion_all) || ''}</span></div>`;
 
  document.getElementById('modalDescription').textContent = item.description || 'Описание отсутствует';
 
  const featuresDiv = document.getElementById('modalFeatures');
  featuresDiv.innerHTML = item.features ? `<ul>${item.features.split(',').map(f => `<li>${escapeHtml(f.trim())}</li>`).join('')}</ul>` : '<p style="color: var(--text-secondary)">Информация уточняется</p>';
    const plansContainer = document.getElementById('modalFloorPlans');
  plansContainer.innerHTML = '';
  if (item.floor_plans_text) {
    const textDiv = document.createElement('div');
    textDiv.className = 'floor-plans-text';
    textDiv.textContent = item.floor_plans_text;
    plansContainer.appendChild(textDiv);
  }
  if (item.floor_plans_images) {
    const galleryDiv = document.createElement('div');
    galleryDiv.className = 'floor-plans-gallery';
    item.floor_plans_images.split(',').map(u => u.trim()).filter(Boolean).forEach(url => {
      const img = document.createElement('img');
      img.src = url;
      img.className = 'floor-plan-image';
      img.onclick = () => window.open(url, '_blank');
      galleryDiv.appendChild(img);
    });
    plansContainer.appendChild(galleryDiv);
  }
  if (!item.floor_plans_text && !item.floor_plans_images) {
    plansContainer.innerHTML = '<p style="color: var(--text-secondary)">Информация уточняется</p>';
  }
 
  const gallery = document.getElementById('modalGallery');
  gallery.innerHTML = '';
  if (item.image_main) {
    const mainImg = document.createElement('img');
    mainImg.src = item.image_main;
    mainImg.className = 'modal-main-image';
    gallery.appendChild(mainImg);
  }
  if (item.images_gallery) {
    item.images_gallery.split(',').map(u => u.trim()).filter(Boolean).forEach(url').map(u => u.trim()).filter(Boolean).forEach(url
