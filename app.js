let config = {};
let listings = [];
let currentAgentData = {};
let pagesData = {};
let currentModalId = null;
let map = null;
let markers = [];
let currentPage = 'home';
let tg;
let AGENT_ID = '';
let AGENT_CONFIG = null;

function getImageUrl(sourceUrl) {
    if (!sourceUrl) return '';
   
    // Конвертация GitHub blob ссылок в raw
    if (sourceUrl.includes('github.com') && sourceUrl.includes('/blob/')) {
        return sourceUrl
            .replace('github.com', 'raw.githubusercontent.com')
            .replace('/blob/', '/');
    }
   
    if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) return sourceUrl;
    return sourceUrl;
}

function onImgError(e) {
    const img = e.target || e;
    if (img && img.tagName === 'IMG') {
        img.onerror = null;
        img.src = 'data:image/svg+xml;charset=UTF-8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="%23f0f0f0"/><text x="50%" y="50%" font-family="sans-serif" font-size="14" fill="%23999" text-anchor="middle" dy=".3em">Фото</text></svg>';
    }
}

try {
    if (window.Telegram && window.Telegram.WebApp) {
        tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
    } else {
        tg = {
            ready: function() {}, expand: function() {},
            MainButton: { setText: function() {}, show: function() {}, onClick: function() {}, hide: function() {} },
            showAlert: function(msg) { alert(msg); },
            initDataUnsafe: { user: {} },
            close: function() { window.close(); },
            openTelegramLink: function(url) { window.open(url); }
        };
    }
} catch (e) { console.error('[TG] Init error:', e); }

async function loadClientConfig() {
    try {
        const response = await fetch('client-config.json?v=2.0.1');
        config = await response.json();
        console.log('[loadClientConfig] ✅ Config загружен:', config);
    } catch (error) {
        console.error('[loadClientConfig] ❌ Error:', error);
        alert('Ошибка загрузки конфигурации!');
    }
}

async function initAgent() {
    var params = new URLSearchParams(window.location.search);
    var agentParam = params.get('agent');
    var hostname = window.location.hostname;

    if (!config.client || !config.client.scriptUrl) {
        console.error('[initAgent] ❌ Config не загружен:', config);
        showErrorScreen('Ошибка загрузки конфигурации. Обновите страницу.');
        return false;
    }

    try {
        if (agentParam) {
            AGENT_ID = agentParam;
            console.log('[initAgent] Agent из URL:', AGENT_ID);
        }
        else if (hostname && hostname !== 'prostors.ru' && !hostname.endsWith('.prostors.ru') && !hostname.includes('github.io')) {
            console.log('[initAgent] Кастомный домен:', hostname);
            var response = await fetch(config.client.scriptUrl + '?action=resolve_agent_by_domain&domain=' + encodeURIComponent(hostname));
            var data = await response.json();
            if (data.success && data.agentId) {
                AGENT_ID = data.agentId;
                console.log('[initAgent] ✅ Найден агент по домену:', AGENT_ID);
            } else {
                showErrorScreen('Домен не привязан ни к одному агенту');
                return false;
            }
        }
        else {
            console.log('[initAgent] Главная страница экосистемы');
            showEcosystemPage();
            return false;
        }

        if (!AGENT_ID) { showErrorScreen('Агент не определён'); return false; }

        var userId = '';
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user) {
            userId = window.Telegram.WebApp.initDataUnsafe.user.id;
        }
        console.log('[initAgent] Запрос get_agent_config | agent_id:', AGENT_ID, '| user_id:', userId);

        var response = await fetch(config.client.scriptUrl + '?action=get_agent_config&agent_id=' + encodeURIComponent(AGENT_ID) + '&user_id=' + userId);
        if (!response.ok) {
            console.error('[initAgent] ❌ HTTP error:', response.status);
            showErrorScreen('Ошибка сервера: ' + response.status);
            return false;
        }
        var data = await response.json();
        console.log('[initAgent] Ответ сервера:', data);

        if (data.success) {
            AGENT_CONFIG = data.config;
            applyBrandConfig(AGENT_CONFIG);
            var adminBtn = document.getElementById('adminMenuItem');
            if (adminBtn) {
                adminBtn.style.display = data.isOwner ? 'block' : 'none';
                console.log('[initAgent] Кнопка админки:', data.isOwner ? '✅ показана' : '❌ скрыта');
            }
            return true;
        } else {
            console.error('[initAgent] ❌ Ошибка:', data.error);
            showErrorScreen('Ошибка: ' + data.error);
            return false;
        }
    } catch (e) {
        console.error('[initAgent] ❌ Exception:', e);
        showErrorScreen('Ошибка подключения к серверу');
        return false;
    }
}

function showEcosystemPage() {
    var welcomeScreen = document.getElementById('welcomeScreen');
    var loadingScreen = document.getElementById('loadingScreen');
    var mainContent = document.getElementById('mainContent');
    if (welcomeScreen) welcomeScreen.style.display = 'none';
    if (loadingScreen) loadingScreen.style.display = 'none';
    if (mainContent) mainContent.style.display = 'none';
    var ecoPage = document.getElementById('ecosystemPage');
    if (ecoPage) { ecoPage.style.display = 'flex'; ecoPage.classList.remove('hidden'); }
}

function applyBrandConfig(brandConfig) {
    if (!brandConfig) return;
    var root = document.documentElement;
    if (brandConfig.primaryColor) root.style.setProperty('--primary', brandConfig.primaryColor);
    if (brandConfig.accentColor) root.style.setProperty('--accent', brandConfig.accentColor);
    if (brandConfig.appName) {
        document.title = brandConfig.appName;
        var headerTitle = document.getElementById('headerTitle');
        if (headerTitle) headerTitle.textContent = brandConfig.appName.toUpperCase();
        var companyName = document.getElementById('companyName');
        if (companyName) companyName.textContent = brandConfig.appName;
    }
    if (brandConfig.welcomeTitle) { var el = document.getElementById('welcomeTitle'); if (el) el.textContent = brandConfig.welcomeTitle; }
    if (brandConfig.tagline) { var el = document.getElementById('welcomeTagline'); if (el) el.textContent = brandConfig.tagline; }
    if (brandConfig.buttonText) { var el = document.getElementById('welcomeButton'); if (el) el.textContent = brandConfig.buttonText; }
    if (brandConfig.logoUrl) { var el = document.querySelector('#headerBrand .brand-logo'); if (el) { el.src = getImageUrl(brandConfig.logoUrl); el.onerror = onImgError; } }
    if (brandConfig.agentPhotoUrl) { var el = document.querySelector('.agent-photo'); if (el) el.src = getImageUrl(brandConfig.agentPhotoUrl); }
}

function showErrorScreen(message) {
    document.body.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:20px;text-align:center;">' +
        '<div style="font-size:48px;margin-bottom:20px;">🔒</div>' +
        '<h1 style="font-size:24px;margin-bottom:12px;">Доступ ограничен</h1>' +
        '<p style="color:#7F8C8D;margin-bottom:20px;">' + message + '</p>' +
        '<p style="color:#95A5A6;font-size:14px;">Обратитесь к администратору</p></div>';
}

async function loadAgentData() {
    try {
        if (!config.sheets || !config.sheets.agentData) return;
        const res = await fetch(config.sheets.agentData);
        if (!res.ok) throw new Error('Network error');
        const csv = await res.text();
        const parsed = parseCSV(csv);
        if (parsed.length > 0) currentAgentData = parsed[0];
        console.log('[loadAgentData] ✅ Загружено:', currentAgentData);
    } catch (e) { console.warn('[loadAgentData] ⚠️ Error:', e); }
}

async function loadPagesData() {
    try {
        if (!config.sheets || !config.sheets.pages) return;
        const res = await fetch(config.sheets.pages);
        if (!res.ok) throw new Error('Network error');
        const csv = await res.text();
        const rows = parseCSV(csv);
        rows.forEach(function(row) {
            if (row.page && row.title) pagesData[row.page] = { title: row.title, content: row.content || '' };
        });
        console.log('[loadPagesData] ✅ Загружено страниц:', Object.keys(pagesData).length);
    } catch (e) { console.warn('[loadPagesData] ⚠️ Error:', e); }
}

async function loadPropertiesFromScript() {
    if (!config.client || !config.client.scriptUrl) { console.log('[loadProperties] No scriptUrl'); return []; }
    try {
        var url = config.client.scriptUrl;
        if (url.includes('?')) {
            url += '&action=get_listings';
        } else {
            url += '?action=get_listings';
        }
        if (AGENT_ID) url += '&agent_id=' + AGENT_ID;
       
        console.log('[loadProperties] Fetching:', url);
        const response = await fetch(url);
        if (!response.ok) { console.error('[loadProperties] ❌ HTTP:', response.status); return []; }
        const data = await response.json();
       
        // Поддержка обоих форматов: Vercel API и старый Apps Script
        let properties = [];
       
        if (data.success && Array.isArray(data.data)) {
            // Формат Vercel API: {success: true, data: [{...}, {...}]}
            properties = data.data;
            console.log('[loadProperties] ✅ Vercel API формат, загружено', properties.length, 'объектов');
        } else if (Array.isArray(data) && data.length > 1) {
            // Формат Apps Script: [[headers], [row1], [row2], ...]
            const headers = data[0];
            const rows = data.slice(1);
            properties = rows.map(function(row) {
                const obj = {};
                headers.forEach(function(header, i) { obj[header] = row[i]; });
                return obj;
            });
            console.log('[loadProperties] ✅ Apps Script формат, загружено', properties.length, 'объектов');
        } else if (data.error) {
            console.error('[loadProperties] ❌ Script error:', data.error);
            return [];
        } else {
            console.warn('[loadProperties] ⚠️ Неизвестный формат данных:', data);
            return [];
        }
       
        return properties;
    } catch (e) { console.error('[loadProperties] ❌ Exception:', e); return []; }
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
    const result = []; let current = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
        else current += char;
    }
    result.push(current);
    return result;
}

function showBack() { var btn = document.getElementById('headerBackBtn'); if (btn) btn.classList.remove('hidden'); }
function hideBack() { var btn = document.getElementById('headerBackBtn'); if (btn) btn.classList.add('hidden'); }
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
    window.scrollTo(0, 0); hideBack();
}

function showPage(pageId) {
    currentPage = pageId; closeMenu();
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('page-about').classList.add('hidden');
    document.getElementById('page-contacts').classList.add('hidden');
    if (pageId === 'home') { document.getElementById('mainContent').classList.remove('hidden'); hideBack(); }
    else if (pageId === 'contacts') { renderContactsPage(); document.getElementById('page-contacts').classList.remove('hidden'); showBack(); }
    else {
        const data = pagesData[pageId];
        const targetPage = document.getElementById('page-' + pageId);
        if (data && targetPage) {
            targetPage.querySelector('.page-header h2').textContent = data.title;
            targetPage.querySelector('.page-content').innerHTML = data.content;
            if (pageId === 'about') {
                let imageSrc = AGENT_CONFIG && AGENT_CONFIG.agentPhotoUrl ? AGENT_CONFIG.agentPhotoUrl : (config.branding ? config.branding.agentPhoto : null);
                if (!imageSrc && config.branding && config.branding.logo && config.branding.logo !== 'logo.png') imageSrc = config.branding.logo;
                if (imageSrc) {
                    const contentDiv = targetPage.querySelector('.page-content');
                    const img = document.createElement('img');
                    img.src = getImageUrl(imageSrc); img.className = 'about-agent-photo'; img.alt = 'Фото'; img.onerror = onImgError;
                    contentDiv.insertBefore(img, contentDiv.firstChild);
                }
            }
            targetPage.classList.remove('hidden'); showBack();
        } else {
            if (targetPage) {
                targetPage.querySelector('.page-header h2').textContent = pageId === 'about' ? 'Обо мне' : 'Информация';
                targetPage.querySelector('.page-content').innerHTML = '<p>Информация загружается...</p>';
                targetPage.classList.remove('hidden'); showBack();
            } else { document.getElementById('mainContent').classList.remove('hidden'); hideBack(); }
        }
    }
    window.scrollTo(0, 0);
}

function renderContactsPage() {
    const data = currentAgentData;
    document.getElementById('agentName').textContent = data.name || 'Имя Агента';
    document.getElementById('agentRole').textContent = data.role || 'Эксперт по недвижимости';
    const avatarEl = document.querySelector('.agent-avatar'); avatarEl.innerHTML = '';
    const agentPhoto = AGENT_CONFIG && AGENT_CONFIG.agentPhotoUrl ? AGENT_CONFIG.agentPhotoUrl : (config.branding ? config.branding.agentPhoto : null);
    if (agentPhoto && agentPhoto.trim() && agentPhoto !== 'logo.png') {
        const img = document.createElement('img'); img.src = getImageUrl(agentPhoto); img.alt = data.name || 'Агент'; img.onerror = onImgError; avatarEl.appendChild(img);
    } else if (config.branding && config.branding.logo && config.branding.logo !== 'logo.png') {
        const img = document.createElement('img'); img.src = getImageUrl(config.branding.logo); img.alt = 'Логотип'; img.onerror = onImgError; avatarEl.appendChild(img);
    }
    const hasAgency = data.agencyName || data.agencyAddress;
    document.getElementById('agencyBlock').style.display = hasAgency ? 'block' : 'none';
    document.getElementById('agencyName').textContent = data.agencyName || '';
    document.getElementById('agencyAddress').textContent = data.agencyAddress ? '📍 ' + data.agencyAddress : '';
}

function openMenu() { document.getElementById('menuOverlay').classList.remove('hidden'); document.getElementById('sideMenu').classList.remove('hidden'); }
function closeMenu() { document.getElementById('menuOverlay').classList.add('hidden'); document.getElementById('sideMenu').classList.add('hidden'); }

function openDirectChat() {
    const username = currentAgentData.telegramUsername || '';
    if (username) { tg.openTelegramLink ? tg.openTelegramLink('https://t.me/' + username) : window.open('https://t.me/' + username); }
    else { tg.showAlert('❌ Telegram не указан'); }
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
    const mapBtn = document.getElementById('mapViewBtn');
    const listContainer = document.getElementById('listingsContainer');
    const mapContainer = document.getElementById('mapContainer');
    if (view === 'list') {
        listBtn.classList.add('active'); mapBtn.classList.remove('active');
        listContainer.classList.remove('hidden'); mapContainer.classList.add('hidden'); hideBack();
    } else {
        listBtn.classList.remove('active'); mapBtn.classList.add('active');
        listContainer.classList.add('hidden'); mapContainer.classList.remove('hidden'); showBack();
        setTimeout(function() { initMap(); }, 100);
    }
}

async function init() {
    try {
        console.log('[init] 🚀 Начинаю загрузку...');
        await loadClientConfig();
        console.log('[init] Config загружен:', config);
        var agentOk = await initAgent();
        if (!agentOk) {
            var loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) loadingScreen.classList.add('hidden');
            return;
        }
        applyTheme(); applyBranding();
        await loadAgentData(); await loadPagesData();
        let propertiesData = await loadPropertiesFromScript();
        if (!propertiesData || propertiesData.length === 0) propertiesData = [];
        listings = propertiesData;
        renderWelcome(); renderFilters();
        renderListings(listings.filter(function(l) { return l.active === true || l.active === 'TRUE'; }));
        initPhoneMask(); initTelegramMask(); hideBack();
        var loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) loadingScreen.classList.add('hidden');
        console.log('[init] ✅ Загрузка завершена');
    } catch (error) {
        console.error('[init] ❌ Init Error:', error);
        var loadingScreen = document.getElementById('loadingScreen');
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
    var el;
    el = document.getElementById('companyName'); if (el && config.branding.name) el.textContent = config.branding.name;
    el = document.getElementById('welcomeTitle'); if (el && config.branding.welcomeTitle) el.textContent = config.branding.welcomeTitle;
    el = document.getElementById('welcomeTagline'); if (el && config.branding.tagline) el.textContent = config.branding.tagline;
    el = document.getElementById('welcomeButton'); if (el && config.branding.buttonText) el.textContent = config.branding.buttonText;
    el = document.getElementById('headerTitle'); if (el && config.branding.name) el.textContent = config.branding.name.toUpperCase();
    el = document.querySelector('#headerBrand .brand-logo'); if (el && config.branding.logo) { el.src = getImageUrl(config.branding.logo); el.onerror = onImgError; }
}

function renderWelcome() {
    if (!config.features || !config.features.showWelcomeScreen) {
        document.getElementById('welcomeScreen').classList.add('hidden');
        document.getElementById('mainContent').classList.remove('hidden');
    }
}

function renderFilters() {
    const districts = [...new Set(listings.map(function(l) { return l.district; }).filter(Boolean))].sort();
    var dc = document.getElementById('districtCheckboxes');
    if (dc) { dc.innerHTML = ''; districts.forEach(function(d) { var label = document.createElement('label'); label.className = 'checkbox-label'; label.innerHTML = '<input type="checkbox" value="' + escapeHtml(d) + '" class="filter-checkbox" data-filter="district"><span>' + escapeHtml(d) + '</span>'; dc.appendChild(label); }); }
    const metros = [...new Set(listings.map(function(l) { return l.metro; }).filter(Boolean))].sort();
    var mc = document.getElementById('metroCheckboxes');
    if (mc) { mc.innerHTML = ''; metros.forEach(function(m) { var label = document.createElement('label'); label.className = 'checkbox-label'; label.innerHTML = '<input type="checkbox" value="' + escapeHtml(m) + '" class="filter-checkbox" data-filter="metro"><span>' + escapeHtml(m) + '</span>'; mc.appendChild(label); }); }
    var rc = document.getElementById('roomsCheckboxes');
    if (rc) {
        var allRooms = [];
        listings.forEach(function(l) { if (l.rooms) String(l.rooms).split(',').map(function(r) { return r.trim(); }).forEach(function(r) { if (r && allRooms.indexOf(r) === -1) allRooms.push(r); }); });
        allRooms.sort(); rc.innerHTML = '';
        allRooms.forEach(function(r) { var label = document.createElement('label'); label.className = 'checkbox-label'; label.innerHTML = '<input type="checkbox" value="' + escapeHtml(r) + '" class="filter-checkbox" data-filter="rooms"><span>' + escapeHtml(r) + '</span>'; rc.appendChild(label); });
    }
    document.querySelectorAll('.price-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            if (this.classList.contains('active')) this.classList.remove('active');
            else { document.querySelectorAll('.price-btn').forEach(function(b) { b.classList.remove('active'); }); this.classList.add('active'); }
            filterListings();
        });
    });
    document.querySelectorAll('.filter-checkbox').forEach(function(cb) { cb.addEventListener('change', filterListings); });
}

function filterListings() {
    const activeBtn = document.querySelector('.price-btn.active');
    const maxPrice = activeBtn ? parseFloat(activeBtn.dataset.price) / 1000000 : Infinity;
    console.log('[filterListings] maxPrice (млн):', maxPrice);
    const selectedDistricts = Array.from(document.querySelectorAll('input[data-filter="district"]:checked')).map(function(cb) { return cb.value; });
    const selectedMetros = Array.from(document.querySelectorAll('input[data-filter="metro"]:checked')).map(function(cb) { return cb.value; });
    const selectedRooms = Array.from(document.querySelectorAll('input[data-filter="rooms"]:checked')).map(function(cb) { return cb.value; });
    const filtered = listings.filter(function(item) {
        if (item.active !== true && item.active !== 'TRUE') return false;
        if (typeof item.price_from === 'number' && item.price_from > maxPrice) return false;
        if (selectedDistricts.length > 0 && selectedDistricts.indexOf(item.district) === -1) return false;
        if (selectedMetros.length > 0 && selectedMetros.indexOf(item.metro) === -1) return false;
        if (selectedRooms.length > 0 && item.rooms) {
            var itemRooms = String(item.rooms).split(',').map(function(r) { return r.trim(); });
            if (!selectedRooms.some(function(r) { return itemRooms.indexOf(r) !== -1; })) return false;
        }
        return true;
    });
    console.log('[filterListings] Показано:', filtered.length, 'из', listings.length);
    renderListings(filtered);
    var mapContainer = document.getElementById('mapContainer');
    if (mapContainer && !mapContainer.classList.contains('hidden')) updateMapMarkers(filtered);
}

function resetFilters() {
    document.querySelectorAll('.price-btn').forEach(function(btn) { btn.classList.remove('active'); });
    document.querySelectorAll('.filter-checkbox').forEach(function(cb) { cb.checked = false; });
    renderListings(listings.filter(function(l) { return l.active === true || l.active === 'TRUE'; }));
}

function renderListings(data) {
    var container = document.getElementById('listingsContainer');
    if (!container) return;
    container.innerHTML = '';
    if (listings.length === 0) { container.innerHTML = '<div class="empty-state"><div class="empty-icon">🏗️</div><h3>База пуста</h3><p>Объекты ещё не добавлены.</p></div>'; return; }
    if (!data || data.length === 0) { container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><h3>Ничего не найдено</h3><p>Попробуйте изменить параметры поиска.</p><button class="btn-reset-filters" onclick="resetFilters()">Сбросить фильтры</button></div>'; return; }
    data.forEach(function(item) {
        var priceDisplay = '?';
        if (typeof item.price_from === 'number') priceDisplay = item.price_from < 1000 ? item.price_from.toFixed(1) + ' млн ₽' : (item.price_from / 1000000).toFixed(1) + ' млн ₽';
        var priceTo = typeof item.price_to === 'number' ? item.price_to.toFixed(1) : '';
        var ppsqm = typeof item.price_per_sqm === 'number' ? Math.round(item.price_per_sqm).toLocaleString('ru-RU') : '';
        var area = (typeof item.area_min === 'number' && typeof item.area_max === 'number') ? item.area_min + '–' + item.area_max + ' м²' : '';
        var statusKey = (item.status || 'other').toString().replace(/\s+/g, '-');
        var statusText = item.status === 'Сдан' ? '✅ Сдан' : item.status === 'Строится' ? '🏗️ Строится' : '🟡 Частично сдан';
        var imageUrl = getImageUrl(item.image_main);
        var card = document.createElement('div');
        card.className = 'listing-card';
        card.onclick = function(e) { if (!e.target.closest('.consult-btn-inline')) openDetails(item.id); };
        card.innerHTML = '<img src="' + imageUrl + '" alt="' + escapeHtml(item.name) + '" class="listing-image" onerror="onImgError(event)">' +
            '<div class="listing-info"><h3>' + (escapeHtml(item.name) || 'Без названия') + '</h3>' +
            '<div class="listing-meta"><span>📍 ' + (escapeHtml(item.district) || '') + '</span><span>🚇 ' + (escapeHtml(item.metro) || '') + '</span>' +
            (item.rooms ? '<span>🚪 ' + escapeHtml(item.rooms) + '</span>' : '') + (area ? '<span>📐 ' + escapeHtml(area) + '</span>' : '') + '</div>' +
            '<div class="listing-price">от ' + priceDisplay + (priceTo ? ' до ' + priceTo + ' млн ₽' : '') + (ppsqm ? '<br><span class="price-per-sqm">~' + ppsqm + ' ₽/м²</span>' : '') + '</div>' +
            '<div class="listing-status status-' + statusKey + '">' + statusText + '</div>' +
            '<button class="tg-btn consult-btn-inline" onclick="openConsultForm(\'' + item.id + '\', event)">📞 Получить консультацию</button></div>';
        container.appendChild(card);
    });
}

function initMap() {
    if (typeof L === 'undefined') return;
    var mapContainer = document.getElementById('mapContainer');
    if (!mapContainer) return;
    if (!map) { map = L.map('mapContainer').setView([59.9343, 30.3351], 11); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map); }
    filterListings();
    setTimeout(function() { map.invalidateSize(); }, 150);
}

function updateMapMarkers(filteredItems) {
    if (!map) return;
    markers.forEach(function(m) { map.removeLayer(m); }); markers = [];
    filteredItems.forEach(function(item) {
        if (item.active !== true && item.active !== 'TRUE') return;
        if (!item.lat || !item.lng) return;
        var priceDisplay = '?';
        if (typeof item.price_from === 'number') priceDisplay = item.price_from < 1000 ? item.price_from.toFixed(1) : (item.price_from / 1000000).toFixed(1);
        var marker = L.marker([item.lat, item.lng]).addTo(map);
        marker.bindPopup('<div class="map-popup" data-id="' + item.id + '" style="cursor:pointer;"><b>' + item.name + '</b><br>от ' + priceDisplay + ' млн ₽</div>');
        marker.on('popupopen', function() { var el = document.querySelector('.map-popup[data-id="' + item.id + '"]'); if (el) el.addEventListener('click', function() { openDetails(item.id); }); });
        markers.push(marker);
    });
    if (markers.length > 0) { var group = new L.featureGroup(markers); map.fitBounds(group.getBounds().pad(0.1)); }
}

function openDetails(id) {
    var item = listings.find(function(l) { return l.id === id; }); if (!item) return;
    currentModalId = id;
    document.getElementById('modalTitle').textContent = item.name || '';
    var priceDisplay = '?';
    if (typeof item.price_from === 'number') priceDisplay = item.price_from < 1000 ? item.price_from.toFixed(1) : (item.price_from / 1000000).toFixed(1);
    var ppsqm = typeof item.price_per_sqm === 'number' ? Math.round(item.price_per_sqm).toLocaleString('ru-RU') : '';
    document.getElementById('modalPrice').innerHTML = 'от <b>' + priceDisplay + '</b> млн ₽' + (ppsqm ? '<span class="price-per-sqm">~' + ppsqm + ' ₽/м²</span>' : '');
    document.getElementById('modalMeta').innerHTML = '<div class="meta-row"><span>📍 ' + (escapeHtml(item.address) || '') + '</span></div><div class="meta-row"><span>🚇 м. ' + (escapeHtml(item.metro) || '') + '</span></div><div class="meta-row"><span>🏗️ Класс: ' + (escapeHtml(item.class) || '') + '</span></div><div class="meta-row"><span>🎨 Отделка: ' + (escapeHtml(item.finishing) || '') + '</span></div><div class="meta-row"><span>📅 Срок сдачи: ' + (escapeHtml(item.completion_soonest) || '') + (item.completion_soonest && item.completion_all ? ' - ' : '') + (escapeHtml(item.completion_all) || '') + '</span></div>';
    document.getElementById('modalDescription').textContent = item.description || 'Описание отсутствует';
    document.getElementById('modalFeatures').innerHTML = item.features ? '<ul>' + item.features.split(',').map(function(f) { return '<li>' + escapeHtml(f.trim()) + '</li>'; }).join('') + '</ul>' : '<p style="color:var(--text-secondary);">Информация уточняется</p>';
    var gc = document.getElementById('modalGallery'); gc.innerHTML = '';
    var allImages = []; if (item.image_main) allImages.push(item.image_main);
    if (item.images_gallery) allImages = allImages.concat(item.images_gallery.split(',').map(function(u) { return u.trim(); }).filter(function(u) { return u; }));
    if (allImages.length > 0) {
        var track = document.createElement('div'); track.className = 'carousel-track';
        var dots = document.createElement('div'); dots.className = 'carousel-dots';
        allImages.forEach(function(url, idx) {
            var slide = document.createElement('div'); slide.className = 'slide';
            var img = document.createElement('img'); img.src = getImageUrl(url); img.onclick = function() { window.open(getImageUrl(url), '_blank'); }; img.onerror = onImgError;
            slide.appendChild(img); track.appendChild(slide);
            var dot = document.createElement('div'); dot.className = 'dot ' + (idx === 0 ? 'active' : ''); dot.onclick = function() { track.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' }); }; dots.appendChild(dot);
        });
        gc.appendChild(track); gc.appendChild(dots);
        track.addEventListener('scroll', function() { var i = Math.round(track.scrollLeft / track.offsetWidth); dots.querySelectorAll('.dot').forEach(function(d, j) { d.classList.toggle('active', j === i); }); });
    } else { gc.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:20px;">Фото нет</p>'; }
    var pc = document.getElementById('modalFloorPlans'); pc.innerHTML = '';
    var plansImages = item.floor_plans_images ? item.floor_plans_images.split(',').map(function(u) { return u.trim(); }).filter(function(u) { return u; }) : [];
    if (plansImages.length > 0) {
        var t = document.createElement('h3'); t.className = 'plans-section-title'; t.textContent = '📐 Планировки'; pc.appendChild(t);
        var pt = document.createElement('div'); pt.className = 'carousel-track';
        plansImages.forEach(function(url) { var s = document.createElement('div'); s.className = 'slide'; s.style.flex = '0 0 85%'; var img = document.createElement('img'); img.src = getImageUrl(url); img.style.height = '200px'; img.onclick = function() { window.open(getImageUrl(url), '_blank'); }; img.onerror = onImgError; s.appendChild(img); pt.appendChild(s); });
        pc.appendChild(pt);
    } else if (item.floor_plans_text) { pc.innerHTML = '<h3 class="plans-section-title">📐 Планировки</h3><p class="floor-plans-text">' + item.floor_plans_text + '</p>'; }
    var mc = document.querySelector('#detailsModal .modal-content');
    var btn = document.getElementById('modalConsultBtn');
    if (!btn) { btn = document.createElement('button'); btn.id = 'modalConsultBtn'; btn.className = 'tg-btn'; btn.style.marginTop = '20px'; btn.style.marginBottom = '40px'; mc.appendChild(btn); }
    btn.textContent = '📞 Получить консультацию'; btn.onclick = function() { openConsultForm(id); };
    document.getElementById('detailsModal').classList.remove('hidden'); document.body.style.overflow = 'hidden'; showBack();
}

function closeModal() { document.getElementById('detailsModal').classList.add('hidden'); document.body.style.overflow = ''; currentModalId = null; if (document.getElementById('mapContainer').classList.contains('hidden')) hideBack(); }

function openConsultForm(id, event) {
    if (event) event.stopPropagation();
    currentModalId = id;
    var item = listings.find(function(l) { return l.id === id; });
    if (item) {
        document.getElementById('consultObjectName').textContent = '🏢 ' + item.name;
        document.getElementById('consultName').value = '';
        document.getElementById('consultPhone').value = '+7 (';
        document.getElementById('consultTelegram').value = '';
        var sb = document.querySelector('#consultForm button[type="submit"]');
        if (sb) { sb.textContent = 'Отправить заявку'; sb.disabled = false; }
        document.getElementById('consultModal').classList.remove('hidden'); showBack();
    }
}

function closeConsultModal() {
    document.getElementById('consultModal').classList.add('hidden');
    document.getElementById('consultForm').reset();
    var sb = document.querySelector('#consultForm button[type="submit"]');
    if (sb) { sb.textContent = 'Отправить заявку'; sb.disabled = false; }
    if (document.getElementById('detailsModal').classList.contains('hidden') && document.getElementById('mapContainer').classList.contains('hidden')) hideBack();
}

function initPhoneMask() {
    var input = document.getElementById('consultPhone'); if (!input) return;
    input.addEventListener('input', function(e) {
        var x = e.target.value.replace(/\D/g, '').match(/(\d{0,1})(\d{0,3})(\d{0,3})(\d{0,2})(\d{0,2})/);
        e.target.value = !x[2] ? '+7 (' : '+7 (' + x[2] + (x[3] ? ') ' + x[3] : '') + (x[4] ? '-' + x[4] : '') + (x[5] ? '-' + x[5] : '');
    });
    input.addEventListener('focus', function(e) { if (e.target.value === '') e.target.value = '+7 ('; });
}

function initTelegramMask() {
    var input = document.getElementById('consultTelegram'); if (!input) return;
    input.addEventListener('input', function(e) {
        var val = e.target.value.replace(/[^a-zA-Z0-9_@]/g, '');
        if (val.includes('@') && !val.startsWith('@')) val = '@' + val.replace(/@/g, '');
        if (val.length > 32) val = val.slice(0, 32);
        e.target.value = val;
    });
}

function submitConsultForm(event) {
    event.preventDefault();
    try {
        var item = listings.find(function(l) { return l.id === currentModalId; });
        if (!item) { tg.showAlert('❌ Ошибка: объект не найден'); return; }
        var name = document.getElementById('consultName').value.trim();
        var phone = document.getElementById('consultPhone').value.trim();
        var telegram = document.getElementById('consultTelegram').value.trim() || '';
        if (!name || name.length < 2) { tg.showAlert('⚠️ Введите имя'); return; }
        if (phone.replace(/\D/g, '').length < 10) { tg.showAlert('❌ Введите корректный телефон'); return; }
        if (telegram && /[а-яА-ЯёЁ]/.test(telegram)) { tg.showAlert('❌ Telegram только латиницей'); return; }
        if (!AGENT_ID) { tg.showAlert('❌ Ошибка: агент не определён'); return; }
      
        console.log('[submitConsultForm] ✅ Данные собраны');
        console.log('[submitConsultForm] AGENT_ID:', AGENT_ID);
      
        var sb = event.target.querySelector('button[type="submit"]');
        var originalText = sb.textContent;
        sb.textContent = 'Отправка...';
        sb.disabled = true;
      
        var payload = {
            action: 'save_lead',
            agentId: AGENT_ID,
            data: {
                objectName: item.name,
                clientName: name,
                clientPhone: phone,
                clientTelegram: telegram || 'Не указан'
            }
        };
      
        fetch(config.client.scriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        })
        .then(function() {
            console.log('[submitConsultForm] ✅ Запрос отправлен (opaque response)');
            sb.textContent = originalText;
            sb.disabled = false;
            document.getElementById('consultForm').reset();
            closeConsultModal();
            setTimeout(function() { tg.showAlert('✅ Заявка отправлена!'); }, 100);
        })
        .catch(function(err) {
            console.error('[submitConsultForm]  Error:', err);
            tg.showAlert('️ Ошибка отправки: ' + err.message);
            sb.textContent = originalText;
            sb.disabled = false;
        });
    } catch (e) {
        console.error('[submitConsultForm] ❌ Exception:', e);
        tg.showAlert('⚠️ Произошла ошибка.');
    }
}

function escapeHtml(text) { if (!text) return ''; var div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
