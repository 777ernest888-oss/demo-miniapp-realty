let config = {};
let listings = [];
let currentAgentData = {};
let pagesData = {};
let currentModalId = null;
let map = null;
let markers = [];
let currentPage = 'home';
let tg;
let supabaseClient = null;
const YANDEX_STORAGE_BASE = 'https://storage.yandexcloud.net/property-images/';

// 🔥 ОПТИМИЗАЦИЯ: КЭШИРОВАНИЕ КАТАЛОГА
const CATALOG_CACHE_KEY = 'catalog_properties_cache';
const CATALOG_CACHE_TTL = 5 * 60 * 1000; // 5 минут

function getCatalogCache() {
    try {
        const cached = localStorage.getItem(CATALOG_CACHE_KEY);
        if (!cached) return null;
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp > CATALOG_CACHE_TTL) {
            localStorage.removeItem(CATALOG_CACHE_KEY);
            return null;
        }
        return data;
    } catch (e) {
        return null;
    }
}

function setCatalogCache(data) {
    try {
        localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({
            data: data,
            timestamp: Date.now()
        }));
    } catch (e) { /* ignore */ }
}

function invalidateCatalogCache() {
    try {
        localStorage.removeItem(CATALOG_CACHE_KEY);
    } catch (e) { /* ignore */ }
}

function getImageUrl(sourceUrl) {
    if (!sourceUrl) return '';
    if (sourceUrl.includes('storage.yandexcloud.net')) return sourceUrl;
    if (sourceUrl.includes('github.com') || sourceUrl.includes('raw.githubusercontent.com')) {        const match = sourceUrl.match(/property-images\/(.*)/);
        if (match && match[1]) {
            return YANDEX_STORAGE_BASE + match[1];
        }
    }
    if (sourceUrl.startsWith('property-images/')) {
        return YANDEX_STORAGE_BASE + sourceUrl.replace('property-images/', '');
    }
    if (!sourceUrl.startsWith('http') && !sourceUrl.startsWith('data:')) {
        return YANDEX_STORAGE_BASE + sourceUrl;
    }
    return sourceUrl;
}

function onImgError(e) {
    const img = e.target || e;
    if (img && img.tagName === 'IMG') {
        img.onerror = null;
        img.src = 'data:image/svg+xml;charset=UTF-8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="%23f0f0f0"/><text x="50%" y="50%" font-family="sans-serif" font-size="14" fill="%23999" text-anchor="middle" dy=".3em">Фото отсутствует</text></svg>';
    }
}

try {
    if (window.Telegram && window.Telegram.WebApp) {
        tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
    } else {
        tg = {
            ready: function() {},
            expand: function() {},
            MainButton: { setText: function() {}, show: function() {}, onClick: function() {}, hide: function() {} },
            showAlert: function(msg) { alert(msg); },
            initDataUnsafe: { user: {} },
            close: function() { window.close(); },
            openTelegramLink: function(url) { window.open(url); }
        };
    }
} catch (e) { console.error(e); }

async function loadClientConfig() {
    try {
        const response = await fetch('client-config.json');
        config = await response.json();
        console.log('Client config loaded');
        if (config.supabase && window.supabase) {
            supabaseClient = window.supabase.createClient(
                config.supabase.url,
                config.supabase.anonKey
            );            console.log('Supabase initialized');
        }
    } catch (error) {
        console.error('Failed to load config:', error);
        alert('Ошибка загрузки конфигурации!');
    }
}

async function loadAgentData() {
    try {
        const res = await fetch(config.sheets.agentData);
        if (!res.ok) throw new Error('Network error');
        const csv = await res.text();
        const parsed = parseCSV(csv);
        if (parsed.length > 0) {
            currentAgentData = parsed[0];
            console.log('Agent data loaded');
        }
    } catch (e) { console.warn('Agent data error:', e); }
}

async function loadPagesData() {
    try {
        const res = await fetch(config.sheets.pages);
        if (!res.ok) throw new Error('Network error');
        const csv = await res.text();
        const rows = parseCSV(csv);
        rows.forEach(function(row) {
            if (row.page && row.title) {
                pagesData[row.page] = { title: row.title, content: row.content || '' };
            }
        });
        console.log('Pages data loaded');
    } catch (e) { console.warn('Pages data error:', e); }
}

// 🔥 ОПТИМИЗАЦИЯ: Загрузка с кэшированием
async function loadPropertiesFromSupabase() {
    if (!supabaseClient) return null;
   
    // 1. Сначала показываем кэш (мгновенно!)
    const cached = getCatalogCache();
    if (cached && cached.length > 0) {
        console.log('⚡ Показываем объекты из кэша (' + cached.length + ' шт.)');
        return cached;
    }
   
    // 2. Если кэша нет — грузим из БД
    try {
        const result = await supabaseClient            .from('properties')
            .select('*')
            .eq('active', true)
            .order('created_at', { ascending: false });
       
        if (result.error) throw result.error;
        console.log('Loaded ' + (result.data ? result.data.length : 0) + ' properties from Supabase');
       
        // 3. Сохраняем в кэш
        if (result.data && result.data.length > 0) {
            setCatalogCache(result.data);
        }
       
        return result.data;
    } catch (e) {
        console.error('Supabase load error:', e);
        return null;
    }
}

function parseCSV(csv) {
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]).map(function(h) { return h.trim(); });
    const result = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = parseCSVLine(lines[i]);
        const obj = {};
        headers.forEach(function(header, index) {
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
        else current += char;    }
    result.push(current);
    return result;
}

function showBack() {
    const btn = document.getElementById('headerBackBtn');
    if (btn) btn.classList.remove('hidden');
}

function hideBack() {
    const btn = document.getElementById('headerBackBtn');
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
    document.getElementById('welcomeScreen').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    window.scrollTo(0, 0);
    hideBack();
}

function showPage(pageId) {
    currentPage = pageId;
    closeMenu();
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('page-about').classList.add('hidden');
    document.getElementById('page-contacts').classList.add('hidden');
    if (pageId === 'home') {
        document.getElementById('mainContent').classList.remove('hidden');
        hideBack();
    } else if (pageId === 'contacts') {
        renderContactsPage();
        document.getElementById('page-contacts').classList.remove('hidden');
        showBack();
    } else {
        const data = pagesData[pageId];
        const targetPage = document.getElementById('page-' + pageId);
        if (data && targetPage) {
            targetPage.querySelector('.page-header h2').textContent = data.title;
            targetPage.querySelector('.page-content').innerHTML = data.content;
            if (pageId === 'about') {                let imageSrc = config.branding ? config.branding.agentPhoto : null;
                if (!imageSrc && config.branding && config.branding.logo && config.branding.logo !== 'logo.png') {
                    imageSrc = config.branding.logo;
                }
                if (imageSrc) {
                    const contentDiv = targetPage.querySelector('.page-content');
                    const img = document.createElement('img');
                    const yandexSrc = getImageUrl(imageSrc);
                    img.src = yandexSrc;
                    img.className = 'about-agent-photo';
                    img.alt = 'Фото';
                    img.onerror = onImgError;
                    contentDiv.insertBefore(img, contentDiv.firstChild);
                }
            }
            targetPage.classList.remove('hidden');
            showBack();
        } else {
            if (targetPage) {
                targetPage.querySelector('.page-header h2').textContent = pageId === 'about' ? 'Обо мне' : 'Информация';
                targetPage.querySelector('.page-content').innerHTML = '<p>Информация загружается...</p>';
                targetPage.classList.remove('hidden');
                showBack();
            } else {
                document.getElementById('mainContent').classList.remove('hidden');
                hideBack();
            }
        }
    }
    window.scrollTo(0, 0);
}

function renderContactsPage() {
    const data = currentAgentData;
    document.getElementById('agentName').textContent = data.name || 'Имя Агента';
    document.getElementById('agentRole').textContent = data.role || 'Эксперт по недвижимости';
    const avatarEl = document.querySelector('.agent-avatar');
    avatarEl.innerHTML = '';
    const agentPhoto = config.branding ? config.branding.agentPhoto : null;
    if (agentPhoto && agentPhoto.trim() && agentPhoto !== 'logo.png') {
        const img = document.createElement('img');
        const yandexPhoto = getImageUrl(agentPhoto);
        img.src = yandexPhoto;
        img.alt = data.name || 'Агент';
        img.onerror = onImgError;
        avatarEl.appendChild(img);
    } else if (config.branding && config.branding.logo && config.branding.logo !== 'logo.png') {
        const img = document.createElement('img');
        const yandexLogo = getImageUrl(config.branding.logo);
        img.src = yandexLogo;        img.alt = 'Логотип';
        img.onerror = onImgError;
        avatarEl.appendChild(img);
    } else {
        avatarEl.innerHTML = '';
    }
    const hasAgency = data.agencyName || data.agencyAddress;
    document.getElementById('agencyBlock').style.display = hasAgency ? 'block' : 'none';
    document.getElementById('agencyName').textContent = data.agencyName || '';
    document.getElementById('agencyAddress').textContent = data.agencyAddress ? '📍 ' + data.agencyAddress : '';
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
        tg.openTelegramLink ? tg.openTelegramLink('https://t.me/' + username) : window.open('https://t.me/' + username);
    } else {
        tg.showAlert('❌ Telegram не указан');
    }
}

function callAgent() {
    let phone = currentAgentData.phone;
    if (!phone) { tg.showAlert('Телефон не указан'); return; }
    let cleanPhone = phone.toString().replace(/[^\d+]/g, '');
    if (cleanPhone.length === 11 && (cleanPhone.startsWith('7') || cleanPhone.startsWith('8'))) cleanPhone = '+' + cleanPhone;
    if (!cleanPhone.startsWith('+') && cleanPhone.length >= 11) cleanPhone = '+' + cleanPhone;
    window.location.href = 'tel:' + cleanPhone;
}

function toggleFilters() {
    const block = document.getElementById('filtersBlock');
    const btn = document.querySelector('.filters-toggle-btn');
    block.classList.toggle('hidden');
    btn.textContent = block.classList.contains('hidden') ? '🔽 Фильтры' : '🔼 Скрыть фильтры';
}

function switchView(view) {
    const listBtn = document.getElementById('listViewBtn');
    const mapBtn = document.getElementById('mapViewBtn');    const listContainer = document.getElementById('listingsContainer');
    const mapContainer = document.getElementById('mapContainer');
    if (view === 'list') {
        listBtn.classList.add('active'); mapBtn.classList.remove('active');
        listContainer.classList.remove('hidden'); mapContainer.classList.add('hidden');
        hideBack();
    } else {
        listBtn.classList.remove('active'); mapBtn.classList.add('active');
        listContainer.classList.add('hidden'); mapContainer.classList.remove('hidden');
        showBack();
        setTimeout(function() { initMap(); }, 100);
    }
}

async function init() {
    try {
        await loadClientConfig();
        applyTheme();
        applyBranding();
        await loadAgentData();
        await loadPagesData();
        let propertiesData = await loadPropertiesFromSupabase();
        if (!propertiesData || propertiesData.length === 0) {
            console.warn('No properties in Supabase');
            propertiesData = [];
        }
        listings = propertiesData;
        renderWelcome();
        renderFilters();
        renderListings(listings.filter(function(l) { return l.active; }));
        initPhoneMask();
        initTelegramMask();
        hideBack();
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) loadingScreen.classList.add('hidden');
       
        // 🔥 ОПТИМИЗАЦИЯ: Фоновое обновление кэша
        // Если показали из кэша — в фоне обновляем свежие данные
        const cached = getCatalogCache();
        if (cached && cached.length > 0 && supabaseClient) {
            setTimeout(async function() {
                try {
                    const result = await supabaseClient
                        .from('properties')
                        .select('*')
                        .eq('active', true)
                        .order('created_at', { ascending: false });
                    if (result.data && result.data.length > 0) {
                        setCatalogCache(result.data);
                        // Если данные изменились — перерисовываем                        if (JSON.stringify(result.data) !== JSON.stringify(cached)) {
                            console.log('🔄 Кэш обновлён, перерисовываем');
                            listings = result.data;
                            renderListings(listings.filter(function(l) { return l.active; }));
                            renderFilters();
                        }
                    }
                } catch (e) { /* ignore */ }
            }, 2000); // Через 2 секунды после загрузки
        }
    } catch (error) {
        console.error('Init Error:', error);
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) loadingScreen.classList.add('hidden');
    }
}

function applyTheme() {
    if (!config.branding) return;
    document.documentElement.style.setProperty('--primary', config.branding.primaryColor || '#3D5266');
    document.documentElement.style.setProperty('--accent', config.branding.accentColor || '#3498DB');
}

function applyBranding() {
    if (!config.branding) return;
    const companyEl = document.getElementById('companyName');
    if (companyEl && config.branding.name) companyEl.textContent = config.branding.name;
    const titleEl = document.getElementById('welcomeTitle');
    if (titleEl && config.branding.welcomeTitle) titleEl.textContent = config.branding.welcomeTitle;
    const taglineEl = document.getElementById('welcomeTagline');
    if (taglineEl && config.branding.tagline) taglineEl.textContent = config.branding.tagline;
    const btnEl = document.getElementById('welcomeButton');
    if (btnEl && config.branding.buttonText) btnEl.textContent = config.branding.buttonText;
    const headerTitle = document.getElementById('headerTitle');
    if (headerTitle && config.branding.name) {
        headerTitle.textContent = config.branding.name.toUpperCase();
    }
    const headerLogo = document.querySelector('#headerBrand .brand-logo');
    if (headerLogo && config.branding.logo) {
        const yandexLogo = getImageUrl(config.branding.logo);
        headerLogo.src = yandexLogo;
        headerLogo.onerror = onImgError;
    }
}

function renderWelcome() {
    if (!config.features || !config.features.showWelcomeScreen) {
        document.getElementById('welcomeScreen').classList.add('hidden');
        document.getElementById('mainContent').classList.remove('hidden');
    }}

function renderFilters() {
    const districts = [...new Set(listings.map(function(l) { return l.district; }).filter(Boolean))].sort();
    const districtContainer = document.getElementById('districtCheckboxes');
    if (districtContainer) {
        districtContainer.innerHTML = '';
        districts.forEach(function(d) {
            const label = document.createElement('label');
            label.className = 'checkbox-label';
            label.innerHTML = '<input type="checkbox" value="' + escapeHtml(d) + '" class="filter-checkbox" data-filter="district"><span>' + escapeHtml(d) + '</span>';
            districtContainer.appendChild(label);
        });
    }
    const metros = [...new Set(listings.map(function(l) { return l.metro; }).filter(Boolean))].sort();
    const metroContainer = document.getElementById('metroCheckboxes');
    if (metroContainer) {
        metroContainer.innerHTML = '';
        metros.forEach(function(m) {
            const label = document.createElement('label');
            label.className = 'checkbox-label';
            label.innerHTML = '<input type="checkbox" value="' + escapeHtml(m) + '" class="filter-checkbox" data-filter="metro"><span>' + escapeHtml(m) + '</span>';
            metroContainer.appendChild(label);
        });
    }
    const roomsContainer = document.getElementById('roomsCheckboxes');
    if (roomsContainer) {
        const allRooms = [];
        listings.forEach(function(l) {
            if (l.rooms) {
                String(l.rooms).split(',').map(function(r) { return r.trim(); }).forEach(function(r) { if (r && allRooms.indexOf(r) === -1) allRooms.push(r); });
            }
        });
        allRooms.sort();
        roomsContainer.innerHTML = '';
        allRooms.forEach(function(r) {
            const label = document.createElement('label');
            label.className = 'checkbox-label';
            label.innerHTML = '<input type="checkbox" value="' + escapeHtml(r) + '" class="filter-checkbox" data-filter="rooms"><span>' + escapeHtml(r) + '</span>';
            roomsContainer.appendChild(label);
        });
    }
    document.querySelectorAll('.price-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            if (this.classList.contains('active')) this.classList.remove('active');
            else {
                document.querySelectorAll('.price-btn').forEach(function(b) { b.classList.remove('active'); });
                this.classList.add('active');
            }
            filterListings();        });
    });
    document.querySelectorAll('.filter-checkbox').forEach(function(cb) { cb.addEventListener('change', filterListings); });
}

function filterListings() {
    const activeBtn = document.querySelector('.price-btn.active');
    const maxPrice = activeBtn ? parseFloat(activeBtn.dataset.price) : Infinity;
    const selectedDistricts = Array.from(document.querySelectorAll('input[data-filter="district"]:checked')).map(function(cb) { return cb.value; });
    const selectedMetros = Array.from(document.querySelectorAll('input[data-filter="metro"]:checked')).map(function(cb) { return cb.value; });
    const selectedRooms = Array.from(document.querySelectorAll('input[data-filter="rooms"]:checked')).map(function(cb) { return cb.value; });
    const filtered = listings.filter(function(item) {
        if (!item.active) return false;
        if (typeof item.price_from !== 'number' || item.price_from > maxPrice) return false;
        if (selectedDistricts.length > 0 && selectedDistricts.indexOf(item.district) === -1) return false;
        if (selectedMetros.length > 0 && selectedMetros.indexOf(item.metro) === -1) return false;
        if (selectedRooms.length > 0 && item.rooms) {
            const itemRooms = String(item.rooms).split(',').map(function(r) { return r.trim(); });
            if (!selectedRooms.some(function(r) { return itemRooms.indexOf(r) !== -1; })) return false;
        }
        return true;
    });
    renderListings(filtered);
    const mapContainer = document.getElementById('mapContainer');
    if (mapContainer && !mapContainer.classList.contains('hidden')) updateMapMarkers(filtered);
}

function resetFilters() {
    document.querySelectorAll('.price-btn').forEach(function(btn) { btn.classList.remove('active'); });
    document.querySelectorAll('.filter-checkbox').forEach(function(cb) { cb.checked = false; });
    renderListings(listings.filter(function(l) { return l.active; }));
}

// 🔥 ОПТИМИЗАЦИЯ: Lazy loading для изображений
function renderListings(data) {
    const container = document.getElementById('listingsContainer');
    if (!container) return;
    container.innerHTML = '';
    if (listings.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">🏗️</div><h3>База пуста</h3><p>Объекты ещё не добавлены.</p></div>';
        return;
    }
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><h3>Ничего не найдено</h3><p>Попробуйте изменить параметры поиска.</p><button class="btn-reset-filters" onclick="resetFilters()">Сбросить фильтры</button></div>';
        return;
    }
    data.forEach(function(item) {
        let priceDisplay = '?';
        if (typeof item.price_from === 'number') {
            priceDisplay = item.price_from < 1000 ? item.price_from.toFixed(1) + ' млн ₽' : (item.price_from / 1000000).toFixed(1) + ' млн ₽';        }
        const priceTo = typeof item.price_to === 'number' ? item.price_to.toFixed(1) : '';
        const ppsqm = typeof item.price_per_sqm === 'number' ? Math.round(item.price_per_sqm).toLocaleString('ru-RU') : '';
        const area = (typeof item.area_min === 'number' && typeof item.area_max === 'number') ? item.area_min + '–' + item.area_max + ' м²' : '';
        const statusKey = (item.status || 'other').toString().replace(/\s+/g, '-');
        const statusText = item.status === 'Сдан' ? '✅ Сдан' : item.status === 'Строится' ? '🏗️ Строится' : '🟡 Частично сдан';
        const yandexMain = getImageUrl(item.image_main);
        const card = document.createElement('div');
        card.className = 'listing-card';
        card.onclick = function(e) { if (!e.target.closest('.consult-btn-inline')) openDetails(item.id); };
        // 🔥 LAZY LOADING: loading="lazy" для картинок
        card.innerHTML = '<img src="' + escapeHtml(yandexMain) + '" alt="' + escapeHtml(item.name) + '" class="listing-image" loading="lazy" onerror="onImgError(event)">' +
            '<div class="listing-info">' +
            '<h3>' + (escapeHtml(item.name) || 'Без названия') + '</h3>' +
            '<div class="listing-meta">' +
            '<span>📍 ' + (escapeHtml(item.district) || '') + '</span>' +
            '<span>🚇 ' + (escapeHtml(item.metro) || '') + '</span>' +
            (item.rooms ? '<span>🚪 ' + escapeHtml(item.rooms) + '</span>' : '') +
            (area ? '<span>📐 ' + escapeHtml(area) + '</span>' : '') +
            '</div>' +
            '<div class="listing-price">от ' + priceDisplay + (priceTo ? ' до ' + priceTo + ' млн ₽' : '') + (ppsqm ? '<br><span class="price-per-sqm">~' + ppsqm + ' ₽/м²</span>' : '') + '</div>' +
            '<div class="listing-status status-' + statusKey + '">' + statusText + '</div>' +
            '<button class="tg-btn consult-btn-inline" onclick="openConsultForm(\'' + item.id + '\', event)">📞 Получить консультацию</button>' +
            '</div>';
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
    filterListings();
    setTimeout(function() { map.invalidateSize(); }, 150);
}

function updateMapMarkers(filteredItems) {
    if (!map) return;
    markers.forEach(function(m) { map.removeLayer(m); });
    markers = [];
    filteredItems.forEach(function(item) {
        if (!item.active || !item.lat || !item.lng) return;
        let priceDisplay = '?';
        if (typeof item.price_from === 'number') {
            priceDisplay = item.price_from < 1000 ? item.price_from.toFixed(1) : (item.price_from / 1000000).toFixed(1);
        }        const marker = L.marker([item.lat, item.lng]).addTo(map);
        const popupContent = '<div class="map-popup" data-id="' + item.id + '" style="cursor:pointer;"><b>' + item.name + '</b><br>от ' + priceDisplay + ' млн ₽</div>';
        marker.bindPopup(popupContent);
        marker.on('popupopen', function() {
            const popupEl = document.querySelector('.map-popup[data-id="' + item.id + '"]');
            if (popupEl) popupEl.addEventListener('click', function() { openDetails(item.id); });
        });
        markers.push(marker);
    });
    if (markers.length > 0) {
        const group = new L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

function openDetails(id) {
    const item = listings.find(function(l) { return l.id === id; });
    if (!item) return;
    currentModalId = id;
    document.getElementById('modalTitle').textContent = item.name || '';
    let priceDisplay = '?';
    if (typeof item.price_from === 'number') {
        priceDisplay = item.price_from < 1000 ? item.price_from.toFixed(1) : (item.price_from / 1000000).toFixed(1);
    }
    const ppsqm = typeof item.price_per_sqm === 'number' ? Math.round(item.price_per_sqm).toLocaleString('ru-RU') : '';
    document.getElementById('modalPrice').innerHTML = 'от <b>' + priceDisplay + '</b> млн ₽' + (ppsqm ? '<span class="price-per-sqm">~' + ppsqm + ' ₽/м²</span>' : '');
    document.getElementById('modalMeta').innerHTML = '<div class="meta-row"><span>📍 ' + (escapeHtml(item.address) || '') + '</span></div><div class="meta-row"><span>🚇 м. ' + (escapeHtml(item.metro) || '') + '</span></div><div class="meta-row"><span>🏗️ Класс: ' + (escapeHtml(item.class) || '') + '</span></div><div class="meta-row"><span>🔨 Отделка: ' + (escapeHtml(item.finishing) || '') + '</span></div><div class="meta-row"><span>📅 Срок сдачи: ' + (escapeHtml(item.completion_soonest) || '') + (item.completion_soonest && item.completion_all ? ' - ' : '') + (escapeHtml(item.completion_all) || '') + '</span></div>';
    document.getElementById('modalDescription').textContent = item.description || 'Описание отсутствует';
    document.getElementById('modalFeatures').innerHTML = item.features ? '<ul>' + item.features.split(',').map(function(f) { return '<li>' + escapeHtml(f.trim()) + '</li>'; }).join('') + '</ul>' : '<p style="color: var(--text-secondary);">Информация уточняется</p>';
    const galleryContainer = document.getElementById('modalGallery');
    galleryContainer.innerHTML = '';
    let allImages = [];
    if (item.image_main) allImages.push(item.image_main);
    if (item.images_gallery) {
        allImages = allImages.concat(item.images_gallery.split(',').map(function(u) { return u.trim(); }).filter(function(u) { return u; }));
    }
    if (allImages.length > 0) {
        const track = document.createElement('div');
        track.className = 'carousel-track';
        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'carousel-dots';
        allImages.forEach(function(url, index) {
            const slide = document.createElement('div');
            slide.className = 'slide';
            const img = document.createElement('img');
            const yandexUrl = getImageUrl(url);
            img.src = yandexUrl;
            img.onclick = function() { window.open(yandexUrl, '_blank'); };
            img.onerror = onImgError;
            slide.appendChild(img);            track.appendChild(slide);
            const dot = document.createElement('div');
            dot.className = 'dot ' + (index === 0 ? 'active' : '');
            dot.onclick = function() { track.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' }); };
            dotsContainer.appendChild(dot);
        });
        galleryContainer.appendChild(track);
        galleryContainer.appendChild(dotsContainer);
        track.addEventListener('scroll', function() {
            const index = Math.round(track.scrollLeft / track.offsetWidth);
            dotsContainer.querySelectorAll('.dot').forEach(function(d, i) { d.classList.toggle('active', i === index); });
        });
    } else {
        galleryContainer.innerHTML = '<p style="color: var(--text-secondary); text-align:center; padding: 20px;">Фото нет</p>';
    }
    const plansContainer = document.getElementById('modalFloorPlans');
    plansContainer.innerHTML = '';
    let plansImages = [];
    if (item.floor_plans_images) {
        plansImages = item.floor_plans_images.split(',').map(function(u) { return u.trim(); }).filter(function(u) { return u; });
    }
    if (plansImages.length > 0) {
        const title = document.createElement('h3');
        title.className = 'plans-section-title';
        title.textContent = '📐 Планировки';
        plansContainer.appendChild(title);
        const plansTrack = document.createElement('div');
        plansTrack.className = 'carousel-track';
        plansImages.forEach(function(url) {
            const slide = document.createElement('div');
            slide.className = 'slide';
            slide.style.flex = '0 0 85%';
            const img = document.createElement('img');
            const yandexUrl = getImageUrl(url);
            img.src = yandexUrl;
            img.style.height = '200px';
            img.onclick = function() { window.open(yandexUrl, '_blank'); };
            img.onerror = onImgError;
            slide.appendChild(img);
            plansTrack.appendChild(slide);
        });
        plansContainer.appendChild(plansTrack);
    } else if (item.floor_plans_text) {
        plansContainer.innerHTML = '<h3 class="plans-section-title">📐 Планировки</h3><p class="floor-plans-text">' + item.floor_plans_text + '</p>';
    }
    const modalContent = document.querySelector('#detailsModal .modal-content');
    let btn = document.getElementById('modalConsultBtn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'modalConsultBtn';        btn.className = 'tg-btn';
        btn.style.marginTop = '20px';
        btn.style.marginBottom = '40px';
        modalContent.appendChild(btn);
    }
    btn.textContent = '📞 Получить консультацию';
    btn.onclick = function() { openConsultForm(id); };
    document.getElementById('detailsModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    showBack();
}

function closeModal() {
    document.getElementById('detailsModal').classList.add('hidden');
    document.body.style.overflow = '';
    currentModalId = null;
    if (document.getElementById('mapContainer').classList.contains('hidden')) hideBack();
}

function openConsultForm(id, event) {
    if (event) event.stopPropagation();
    currentModalId = id;
    const item = listings.find(function(l) { return l.id === id; });
    if (item) {
        document.getElementById('consultObjectName').textContent = '🏢 ' + item.name;
        document.getElementById('consultName').value = '';
        document.getElementById('consultPhone').value = '+7 (';
        document.getElementById('consultTelegram').value = '';
        document.getElementById('consultModal').classList.remove('hidden');
        showBack();
    }
}

function closeConsultModal() {
    document.getElementById('consultModal').classList.add('hidden');
    document.getElementById('consultForm').reset();
    if (document.getElementById('detailsModal').classList.contains('hidden') && document.getElementById('mapContainer').classList.contains('hidden')) hideBack();
}

function initPhoneMask() {
    const input = document.getElementById('consultPhone');
    if (!input) return;
    input.addEventListener('input', function(e) {
        let x = e.target.value.replace(/\D/g, '').match(/(\d{0,1})(\d{0,3})(\d{0,3})(\d{0,2})(\d{0,2})/);
        e.target.value = !x[2] ? '+7 (' : '+7 (' + x[2] + (x[3] ? ') ' + x[3] : '') + (x[4] ? '-' + x[4] : '') + (x[5] ? '-' + x[5] : '');
    });
    input.addEventListener('focus', function(e) { if (e.target.value === '') e.target.value = '+7 ('; });
}

function initTelegramMask() {    const input = document.getElementById('consultTelegram');
    if (!input) return;
    input.addEventListener('input', function(e) {
        let val = e.target.value.replace(/[^a-zA-Z0-9_@]/g, '');
        if (val.includes('@') && !val.startsWith('@')) val = '@' + val.replace(/@/g, '');
        if (val.length > 32) val = val.slice(0, 32);
        e.target.value = val;
    });
}

function submitConsultForm(event) {
    event.preventDefault();
    try {
        console.log('📱 Отправка заявки (мобильная версия)');
        const item = listings.find(function(l) { return l.id === currentModalId; });
        if (!item) {
            console.error('Объект не найден:', currentModalId);
            tg.showAlert('❌ Ошибка: объект не найден');
            return;
        }
        const name = document.getElementById('consultName').value.trim();
        const phone = document.getElementById('consultPhone').value.trim();
        let telegram = document.getElementById('consultTelegram').value.trim() || '';
        if (!name || name.length < 2) {
            tg.showAlert('❌ Введите имя');
            return;
        }
        if (phone.replace(/\D/g, '').length < 10) {
            tg.showAlert('❌ Введите корректный телефон');
            return;
        }
        if (telegram && /[а-яА-ЯёЁ]/.test(telegram)) {
            tg.showAlert('❌ Telegram только латиницей');
            return;
        }
        const submitBtn = event.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Отправка...';
        submitBtn.disabled = true;
        if (!supabaseClient) {
            console.error('❌ Supabase client не инициализирован!');
            tg.showAlert('⚠️ Ошибка подключения. Попробуйте позже.');
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            return;
        }
        const supabasePayload = {
            secret: config.client.secretKey,
            projectid: config.client.projectId,
            title: item.name,            leadname: name,
            leadphone: phone,
            leadtelegram: telegram || 'Не указан'
        };
        console.log('📤 Отправка:', supabasePayload);
        supabaseClient
            .from('leads')
            .insert([supabasePayload])
            .then(function(result) {
                console.log('✅ Результат:', result);
                if (result.error) {
                    console.error('❌ Ошибка Supabase:', result.error);
                    tg.showAlert('⚠️ Ошибка: ' + result.error.message);
                    submitBtn.textContent = originalText;
                    submitBtn.disabled = false;
                    return;
                }
                // 🔥 ОПТИМИЗАЦИЯ: Инвалидируем кэш каталога при новой заявке (не обязательно, но на всякий случай)
                if (config.supabase && config.supabase.url) {
                    fetch(config.supabase.url + '/functions/v1/notify-lead', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + config.supabase.anonKey,
                            'apikey': config.supabase.anonKey
                        },
                        body: JSON.stringify({
                            leadname: name,
                            leadphone: phone,
                            leadtelegram: telegram || 'Не указан',
                            title: item.name
                        })
                    }).catch(function() { /* игнорируем ошибки уведомления */ });
                }
                closeConsultModal();
                setTimeout(function() {
                    tg.showAlert('✅ Заявка отправлена! Мы свяжемся с вами в ближайшее время.');
                }, 100);
            })
            .catch(function(err) {
                console.error('❌ Ошибка:', err);
                tg.showAlert('⚠️ Ошибка отправки. Проверьте интернет-соединение.');
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            });
    } catch (e) {
        console.error('❌ Критическая ошибка:', e);
        tg.showAlert('⚠️ Произошла ошибка. Попробуйте позже.');
    }
}
async function submitLeadToSupabase(payload) {
    console.log('📥 Отправка в Supabase leads...');
    if (!supabaseClient) {
        console.error('❌ Supabase client не инициализирован!');
        return null;
    }
    try {
        const result = await supabaseClient.from('leads').insert([payload]);
        console.log('📥 Результат:', result);
        if (result.error) {
            console.error('❌ Ошибка Supabase:', result.error);
            throw result.error;
        }
        console.log('✅ Успешно сохранено!');
        return { success: true };
    } catch (e) {
        console.error('Supabase lead error:', e);
        return null;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
