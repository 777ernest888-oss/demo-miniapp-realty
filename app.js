// ==========================================
//  ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ==========================================
let config = {};
let listings = [];
let currentAgentData = {};
let pagesData = {};
let currentModalId = null;
let map = null;
let markers = [];
let currentPage = 'home';
let tg;

// Инициализация Telegram WebApp
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
      initDataUnsafe: { user: {} },
      close: () => window.close(),
      openTelegramLink: (url) => window.open(url)
    };
  }
} catch (e) { console.error(e); }

// ==========================================
//  ✅ ЗАГРУЗКА КОНФИГА (ЕДИНЫЙ ИСТОЧНИК)
// ==========================================
async function loadClientConfig() {
  try {
    const response = await fetch('client-config.json');
    config = await response.json();
    console.log('✅ Client config loaded');
  } catch (error) {
    console.error('❌ Failed to load config:', error);
    alert('Ошибка загрузки конфигурации!');
  }
}

// ==========================================
//  ЗАГРУЗКА ДАННЫХ АГЕНТА
// ==========================================
async function loadAgentData() {  try {
    const res = await fetch(config.sheets.agentData);
    if (!res.ok) throw new Error('Network error');
    const csv = await res.text();
    const parsed = parseCSV(csv);
    if (parsed.length > 0) {
      currentAgentData = parsed[0];
      console.log('✅ Agent data loaded from sheet');
    }
  } catch (e) {
    console.warn('⚠️ Using default agent data:', e);
  }
}

// ==========================================
//  ЗАГРУЗКА ТЕКСТОВ СТРАНИЦ
// ==========================================
async function loadPagesData() {
  try {
    const res = await fetch(config.sheets.pages);
    if (!res.ok) throw new Error('Network error');
    const csv = await res.text();
    const rows = parseCSV(csv);
  
    rows.forEach(row => {
      if (row.page && row.title) {
        pagesData[row.page] = {
          title: row.title,
          content: row.content || ''
        };
      }
    });
    console.log('✅ Pages data loaded');
  } catch (e) {
    console.warn('⚠️ Using default page content:', e);
  }
}

// ==========================================
//  ЗАГРУЗКА ОБЪЕКТОВ ИЗ GOOGLE SHEETS
// ==========================================
async function loadFromGoogleSheets(url) {
  let csvUrl = url.replace('pubhtml', 'pub');
  if (!csvUrl.includes('output=csv')) {
    csvUrl += (csvUrl.includes('?') ? '&' : '?') + 'output=csv';
  }
  const response = await fetch(csvUrl);
  return parseCSV(await response.text());
}
// ==========================================
//  PARSE CSV
// ==========================================
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
    });
    result.push(obj);
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

// ==========================================
//  НАВИГАЦИЯ
// ==========================================
function showBack() {
  const btn = document.getElementById('customBackBtn');
  if (btn) btn.classList.remove('hidden');
}

function hideBack() {
  const btn = document.getElementById('customBackBtn');
  if (btn) btn.classList.add('hidden');
}
function appBack() {
  if (!document.getElementById('consultModal').classList.contains('hidden')) { closeConsultModal(); return; }
  if (!document.getElementById('detailsModal').classList.contains('hidden')) { closeModal(); return; }
  if (!document.getElementById('mapContainer').classList.contains('hidden')) { switchView('list'); return; }
  if (currentPage !== 'home') { showPage('home'); return; }
  if (tg.close) tg.close();
}

function startApp() {
  document.getElementById('welcomeScreen')?.classList.add('hidden');
  document.getElementById('mainContent')?.classList.remove('hidden');
  window.scrollTo(0, 0);
  hideBack();
}

function showPage(pageId) {
  currentPage = pageId;
  closeMenu();

  const mainContent = document.getElementById('mainContent');
  const pageAbout = document.getElementById('page-about');
  const pageContacts = document.getElementById('page-contacts');

  mainContent.classList.add('hidden');
  pageAbout.classList.add('hidden');
  pageContacts.classList.add('hidden');

  if (pageId === 'home') {
    mainContent.classList.remove('hidden');
    hideBack();
  } else if (pageId === 'contacts') {
    renderContactsPage();
    pageContacts.classList.remove('hidden');
    showBack();
  } else {
    const data = pagesData[pageId];
    const targetPage = document.getElementById(`page-${pageId}`);
  
    if (data && targetPage) {
      targetPage.querySelector('.page-header h2').textContent = data.title;
      targetPage.querySelector('.page-content').innerHTML = data.content;
      targetPage.classList.remove('hidden');
      showBack();
    } else {
      if (targetPage) {
        targetPage.querySelector('.page-header h2').textContent = pageId === 'about' ? 'Обо мне' : 'Информация';
        targetPage.querySelector('.page-content').innerHTML = '<p>Информация загружается...</p>';
        targetPage.classList.remove('hidden');
        showBack();      } else {
        mainContent.classList.remove('hidden');
        hideBack();
      }
    }
  }
  window.scrollTo(0, 0);
}

function renderContactsPage() {
  const data = currentAgentData;

  const nameEl = document.getElementById('agentName');
  const roleEl = document.getElementById('agentRole');

  if (data.name && data.name.trim()) { nameEl.textContent = data.name; nameEl.style.display = 'block'; }
  else { nameEl.style.display = 'none'; }

  if (data.role && data.role.trim()) { roleEl.textContent = data.role; roleEl.style.display = 'block'; }
  else { roleEl.style.display = 'none'; }

  const agencyBlock = document.getElementById('agencyBlock');
  const agencyNameEl = document.getElementById('agencyName');
  const agencyAddrEl = document.getElementById('agencyAddress');
  let hasAgency = false;

  if (data.agencyName && data.agencyName.trim()) { agencyNameEl.textContent = data.agencyName; agencyNameEl.style.display = 'block'; hasAgency = true; }
  else { agencyNameEl.style.display = 'none'; }

  if (data.agencyAddress && data.agencyAddress.trim()) { agencyAddrEl.textContent = ' ' + data.agencyAddress; agencyAddrEl.style.display = 'block'; hasAgency = true; }
  else { agencyAddrEl.style.display = 'none'; }

  agencyBlock.style.display = hasAgency ? 'block' : 'none';
}

function openMenu() {
  document.getElementById('menuOverlay').classList.remove('hidden');
  document.getElementById('sideMenu').classList.remove('hidden');
}

function closeMenu() {
  document.getElementById('menuOverlay').classList.add('hidden');
  document.getElementById('sideMenu').classList.add('hidden');
}

function openDirectChat() {
  const username = currentAgentData.telegramUsername || '';
  if (username) {
    if (tg.openTelegramLink) tg.openTelegramLink('https://t.me/' + username);
    else window.open('https://t.me/' + username);  } else {
    tg?.showAlert('❌ Telegram не указан');
  }
}

function callAgent() {
  let phone = currentAgentData.phone;

  if (!phone) {
    tg?.showAlert(' Телефон не указан в таблице');
    return;
  }

  phone = phone.toString();
  let cleanPhone = phone.replace(/[^\d+]/g, '');

  if (cleanPhone.length === 11 && (cleanPhone.startsWith('7') || cleanPhone.startsWith('8'))) {
    cleanPhone = '+' + cleanPhone;
  }

  if (!cleanPhone.startsWith('+') && cleanPhone.length >= 11) {
    cleanPhone = '+' + cleanPhone;
  }

  window.location.href = 'tel:' + cleanPhone;
}

function toggleFilters() {
  const block = document.getElementById('filtersBlock');
  const btn = document.querySelector('.filters-toggle-btn');
  if (block && btn) {
    block.classList.toggle('hidden');
    btn.textContent = block.classList.contains('hidden') ? '🔽 Фильтры' : '🔼 Скрыть фильтры';
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
    hideBack();
  } else {
    listBtn.classList.remove('active');
    mapBtn.classList.add('active');    listContainer.classList.add('hidden');
    mapContainer.classList.remove('hidden');
    showBack();
    setTimeout(() => initMap(), 100);
  }
}

// ==========================================
//  ✅ ГЛАВНАЯ ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ
// ==========================================
async function init() {
  try {
    // 1. Загружаем конфиг (ОБЯЗАТЕЛЬНО первым!)
    await loadClientConfig();

    // 2. Применяем тему сразу, чтобы избежать моргания
    applyTheme();
    applyBranding();

    // 3. Загружаем данные
    await loadAgentData();
    await loadPagesData();

    // 4. Загружаем объекты
    listings = await loadFromGoogleSheets(config.sheets.listings);
    console.log('✅ Listings loaded:', listings.length, 'items');
  
    // 5. Рендерим интерфейс
    renderWelcome();
    renderFilters();
    renderListings(listings.filter(l => l.active));
    initPhoneMask();
    initTelegramMask();
    hideBack();

    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) loadingScreen.classList.add('hidden');
  } catch (error) {
    console.error('Init Error:', error);
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) loadingScreen.classList.add('hidden');
  }
}

// ==========================================
//  БРЕНДИНГ И СТИЛИ
// ==========================================
function applyTheme() {
  if (!config.branding) return;
  document.documentElement.style.setProperty('--primary', config.branding.primaryColor || '#1a365d');  document.documentElement.style.setProperty('--accent', config.branding.accentColor || '#d4af37');
}

function applyBranding() {
  if (!config.branding) return;

  const welcomeContainer = document.getElementById('welcomeBrand');
  const headerContainer = document.getElementById('headerBrand');

  if (welcomeContainer) {
    const customTitle = config.branding.welcomeTitle || config.branding.name;
    const customLogo = config.branding.logo;
    const companyEl = welcomeContainer.querySelector('.brand-company');
if (companyEl) companyEl.textContent = config.branding.name;

    if (customLogo && customLogo !== 'logo.png') {
      const logoImg = welcomeContainer.querySelector('.brand-logo');
      if (logoImg) logoImg.src = customLogo;
    }

    if (customTitle && customTitle.toUpperCase() !== 'КАТАЛОГ НОВОСТРОЕК') {
      const titleEl = welcomeContainer.querySelector('.brand-title');
      if (titleEl) titleEl.textContent = customTitle.toUpperCase();
    }
  }
  if (headerContainer) {
    headerContainer.innerHTML = '';
    if (config.branding.logo) {
      const logo = document.createElement('img');
      logo.src = config.branding.logo;
      logo.className = 'brand-logo';
      logo.alt = 'Logo';
      headerContainer.appendChild(logo);
    }
    if (config.branding.name) {
      const title = document.createElement('h1');
      title.textContent = config.branding.name.toUpperCase();
      title.className = 'brand-title';
      headerContainer.appendChild(title);
    }
  }
}

function renderWelcome() {
  if (!config.features?.showWelcomeScreen) {
    document.getElementById('welcomeScreen')?.classList.add('hidden');
    document.getElementById('mainContent')?.classList.remove('hidden');
    return;
  }
}

// ==========================================//  ФИЛЬТРЫ
// ==========================================
function renderFilters() {
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
  if (metroContainer) {
    metroContainer.innerHTML = '';
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

  document.querySelectorAll('.price-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      if (this.classList.contains('active')) {
        this.classList.remove('active');      } else {
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
  const selectedMetros = Array.from(document.querySelectorAll('input[data-filter="metro"]:checked')).map(cb => cb.value);
  const selectedRooms = Array.from(document.querySelectorAll('input[data-filter="rooms"]:checked')).map(cb => cb.value);

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
  const mapContainer = document.getElementById('mapContainer');
  if (mapContainer && !mapContainer.classList.contains('hidden')) {
    updateMapMarkers(filtered);
  }
}

function resetFilters() {
  document.querySelectorAll('.price-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.filter-checkbox').forEach(cb => cb.checked = false);
  renderListings(listings.filter(l => l.active));
}

// ==========================================
//  ОТРИСОВКА ОБЪЕКТОВ
// ==========================================
function renderListings(data) {
  const container = document.getElementById('listingsContainer');  if (!container) return;
  container.innerHTML = '';

  if (listings.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏗</div>
        <h3>База пуста</h3>
        <p>Объекты ещё не добавлены.</p>
      </div>
    `;
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3>Ничего не найдено</h3>
        <p>По вашему запросу нет объектов.</p>
        <p>Попробуйте изменить параметры поиска или сбросить фильтры.</p>
        <button class="btn-reset-filters" onclick="resetFilters()">🔄 Сбросить фильтры</button>
      </div>
    `;
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

    card.innerHTML = `<img src="${escapeHtml(item.image_main) || ''}" alt="${escapeHtml(item.name) || ''}" class="listing-image" onerror="this.style.display='none'"><div class="listing-info"><h3>${escapeHtml(item.name) || 'Без названия'}</h3><div class="listing-meta"><span>${escapeHtml(item.district) || ''}</span><span>🚇 ${escapeHtml(item.metro) || ''}</span>${rooms ? `<span> ${escapeHtml(rooms)}</span>` : ''}${area ? `<span>📐 ${escapeHtml(area)}</span>` : ''}</div><div class="listing-price">от ${priceDisplay}${priceTo ? ` до ${priceTo} млн ₽` : ''} ${ppsqm ? `<br><span class="price-per-sqm">~${ppsqm} ₽/м²</span>` : ''}</div><div class="listing-status status-${statusKey}">${statusText}</div><button class="tg-btn consult-btn-inline" onclick="openConsultForm('${item.id}', event)"> Получить консультацию</button></div>`;
    container.appendChild(card);
  });
}

// ==========================================
//  КАРТА
// ==========================================
function initMap() {
  if (typeof L === 'undefined') {
    console.error('Leaflet not loaded');
    return;
  }
  const mapContainer = document.getElementById('mapContainer');
  if (!mapContainer) return;

  if (!map) {
    map = L.map('mapContainer').setView([59.9343, 30.3351], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);
  }

  filterListings();

  setTimeout(() => map.invalidateSize(), 150);
}

function updateMapMarkers(filteredItems) {
  if (!map) return;

  markers.forEach(m => map.removeLayer(m));
  markers = [];

  filteredItems.forEach(item => {
    if (!item.active || !item.lat || !item.lng) return;

    let priceDisplay = '?';
    if (typeof item.price_from === 'number') {
      priceDisplay = item.price_from < 1000 ? item.price_from.toFixed(1) : (item.price_from / 1000000).toFixed(1);
    }
      
    const marker = L.marker([item.lat, item.lng]).addTo(map);
    const popupContent = `<div class="map-popup" data-id="${item.id}" style="cursor: pointer;"><b>${item.name}</b><br>от ${priceDisplay} млн ₽<small style="display: block; margin-top: 4px; color: #666;">Нажмите для деталей</small></div>`;
    marker.bindPopup(popupContent);

    marker.on('popupopen', function() {
      const popupEl = document.querySelector(`.map-popup[data-id="${item.id}"]`);
      if (popupEl) {
        popupEl.addEventListener('click', function() {          openDetails(item.id);
        });
      }
    });

    markers.push(marker);
  });

  if (markers.length > 0) {
    const group = new L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.1));
  }
}

// ==========================================
//  МОДАЛЬНОЕ ОКНО ДЕТАЛЕЙ
// ==========================================
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
      const img = document.createElement('img');      img.src = url;
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
    item.images_gallery.split(',').map(u => u.trim()).filter(Boolean).forEach(url => {
      const img = document.createElement('img');
      img.src = url;
      img.className = 'modal-thumb';
      img.onclick = () => window.open(url, '_blank');
      gallery.appendChild(img);
    });
  }

  const modalContent = document.querySelector('#detailsModal .modal-content');
  let btn = document.getElementById('modalConsultBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'modalConsultBtn';
    btn.className = 'tg-btn';
    btn.style.marginTop = '20px';
    btn.style.marginBottom = '40px';
    modalContent.appendChild(btn);
  }
  btn.textContent = ' Получить консультацию';
  btn.onclick = () => openConsultForm(id);
  document.getElementById('detailsModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  showBack();
}

function closeModal() {
  document.getElementById('detailsModal').classList.add('hidden');
  document.body.style.overflow = '';  currentModalId = null;

  if (document.getElementById('mapContainer').classList.contains('hidden')) {
    hideBack();
  }
}

// ==========================================
//  ФОРМА КОНСУЛЬТАЦИИ
// ==========================================
function openConsultForm(id, event) {
  if (event) event.stopPropagation();
  currentModalId = id;
  sendConsultRequest();
}

function sendConsultRequest() {
  const item = listings.find(l => l.id === currentModalId);
  if (!item) return;
  document.getElementById('consultObjectName').textContent = ' ' + item.name;
  document.getElementById('consultName').value = '';
  document.getElementById('consultPhone').value = '+7 (';
  document.getElementById('consultTelegram').value = '';
  document.getElementById('consultModal').classList.remove('hidden');

  showBack();
}

function closeConsultModal() {
  document.getElementById('consultModal').classList.add('hidden');
  document.getElementById('consultForm').reset();

  if (document.getElementById('detailsModal').classList.contains('hidden') &&
      document.getElementById('mapContainer').classList.contains('hidden')) {
    hideBack();
  }
}

function initPhoneMask() {
  const phoneInput = document.getElementById('consultPhone');
  if (!phoneInput) return;
  phoneInput.addEventListener('input', function(e) {
    let x = e.target.value.replace(/\D/g, '').match(/(\d{0,1})(\d{0,3})(\d{0,3})(\d{0,2})(\d{0,2})/);
    e.target.value = !x[2] ? '+7 (' : '+7 (' + x[2] + (x[3] ? ') ' + x[3] : '') + (x[4] ? '-' + x[4] : '') + (x[5] ? '-' + x[5] : '');
  });
  phoneInput.addEventListener('focus', function(e) { if (e.target.value === '') e.target.value = '+7 ('; });
}

function initTelegramMask() {
  const telegramInput = document.getElementById('consultTelegram');  if (!telegramInput) return;

  telegramInput.addEventListener('input', function(e) {
    let val = e.target.value;
    val = val.replace(/[^a-zA-Z0-9_@]/g, '');
    if (val.includes('@') && !val.startsWith('@')) {
      val = '@' + val.replace(/@/g, '');
    }
    if (val.length > 32) val = val.slice(0, 32);
    e.target.value = val;
  });

  telegramInput.addEventListener('paste', function(e) {
    e.preventDefault();
    let paste = (e.clipboardData || window.clipboardData).getData('text');
    paste = paste.replace(/[^a-zA-Z0-9_@]/g, '');
    if (paste.includes('@') && !paste.startsWith('@')) {
      paste = '@' + paste.replace(/@/g, '');
    }
    if (paste.length > 32) paste = paste.slice(0, 32);
    e.target.value = paste;
  });
}

function submitConsultForm(event) {
  event.preventDefault();
  const item = listings.find(l => l.id === currentModalId);
  if (!item) return;

  const name = document.getElementById('consultName').value.trim();
  const phone = document.getElementById('consultPhone').value.trim();
  let telegram = document.getElementById('consultTelegram')?.value.trim() || '';

  if (!name || name.length < 2) {
    tg?.showAlert('❌ Введите имя (минимум 2 символа)');
    return;
  }

  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length < 10 || phoneDigits.length > 15) {  
    tg?.showAlert(' Введите корректный номер телефона');
    return;
  }

  if (telegram) {
    const cyrillicRegex = /[а-яА-ЯёЁ]/;
    if (cyrillicRegex.test(telegram)) {
      tg?.showAlert('❌ Telegram не должен содержать кириллицу');
      return;
    }    const validRegex = /^@?[a-zA-Z0-9_]{3,32}$/;
    if (!validRegex.test(telegram)) {
      tg?.showAlert('❌ Неверный формат Telegram (только латиница, цифры, _)');
      return;
    }
    if (!telegram.startsWith('@')) telegram = '@' + telegram;
  }

  const submitBtn = event.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Отправка...';
  submitBtn.disabled = true;

  // ✅ ИСПРАВЛЕНО: projectId теперь берётся из конфига
  fetch(config.client.scriptUrl, {
    method: 'POST',
    body: JSON.stringify({
      secret: config.client.secretKey,
      projectId: config.client.projectId, // <-- ДИНАМИЧЕСКИЙ ID ПРОЕКТА
      title: item.name,
      leadName: name,
      leadPhone: phone,
      leadTelegram: telegram || 'Не указан'
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      closeConsultModal();
      tg?.showAlert('✅ Заявка отправлена!');
      event.target.reset();
    } else {
      throw new Error(data.error || 'Неизвестная ошибка');
    }
  })
  .catch(err => {  
    console.error('Send error:', err);
    tg?.showAlert('⚠️ Ошибка: ' + err.message);
  })
  .finally(() => {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  });
}

// ==========================================
//  УТИЛИТЫ
// ==========================================
function escapeHtml(text) {
  if (!text) return '';  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==========================================
//  ЗАПУСК ПРИЛОЖЕНИЯ
// ==========================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
