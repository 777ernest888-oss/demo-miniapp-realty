var config = window.config || {};
var listings = window.listings || [];
var currentAgentData = window.currentAgentData || {};
var pagesData = window.pagesData || {};
var currentModalId = window.currentModalId || null;
var map = window.map || null;
var markers = window.markers || [];
var currentPage = window.currentPage || 'home';
var tg = window.tg;
var AGENT_ID = window.AGENT_ID || '';
var AGENT_CONFIG = window.AGENT_CONFIG || null;
var CACHE_KEY = window.CACHE_KEY || 'app_cache_v1';
var CACHE_TTL = window.CACHE_TTL || (5 * 60 * 1000);

function getCachedData() {
    try {
        var cached = JSON.parse(localStorage.getItem(CACHE_KEY));
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;
    } catch(e) {}
    return null;
}

function setCachedData(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: data })); } catch(e) {}
}

function getImageUrl(url) { return url && url.startsWith('http') ? url : ''; }

function onImgError(e) {
    var img = e.target;
    if (img && img.tagName === 'IMG') {
        img.onerror = null;
        img.src = 'data:image/svg+xml;charset=UTF-8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="%23f0f0f0"/><text x="50%" y="50%" font-family="sans-serif" font-size="14" fill="%23999" text-anchor="middle" dy=".3em">Фото</text></svg>';
    }
}

try {
    if (window.Telegram && window.Telegram.WebApp) {
        tg = window.Telegram.WebApp; tg.ready(); tg.expand();
    } else {
        tg = { ready:function(){}, expand:function(){}, showAlert:function(m){alert(m)}, initDataUnsafe:{user:{}}, close:function(){window.close()}, openTelegramLink:function(u){window.open(u)} };
    }
} catch(e) {}

async function loadClientConfig() {
    try {
        var r = await fetch('client-config.json?v=2.0.8');
        config = await r.json();
    } catch(e) { alert('Ошибка загрузки конфигурации!'); }
}

async function initAgent() {
    var params = new URLSearchParams(window.location.search);
    var agentParam = params.get('agent');
    if (!config.client || !config.client.scriptUrl) { showErrorScreen('Ошибка конфигурации'); return false; }
    try {
        if (agentParam) { AGENT_ID = agentParam; }
        else { showErrorScreen('Агент не определён'); return false; }
        if (!AGENT_ID) { showErrorScreen('Агент не определён'); return false; }
        var userId = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user.id : '';
        var r = await fetch(config.client.scriptUrl + '?action=get_agent_config&agent_id=' + encodeURIComponent(AGENT_ID) + '&user_id=' + userId);
        var d = await r.json();
        if (d.success) {
            AGENT_CONFIG = d.config; applyBrandConfig(AGENT_CONFIG);
            var adminBtn = document.getElementById('adminMenuItem');
            if (adminBtn) adminBtn.style.display = (d.isOwner || params.get('admin')==='1') ? 'block' : 'none';
            return true;
        } else { showErrorScreen(d.error); return false; }
    } catch(e) { showErrorScreen('Ошибка подключения'); return false; }
}

function applyBrandConfig(c) {
    if (!c) return;
    var root = document.documentElement;
    if (c.primaryColor) root.style.setProperty('--primary', c.primaryColor);
    if (c.accentColor) root.style.setProperty('--accent', c.accentColor);
    if (c.appName) { document.title = c.appName; var h = document.getElementById('headerTitle'); if(h) h.textContent = c.appName.toUpperCase(); }
    if (c.welcomeTitle) { var el = document.getElementById('welcomeTitle'); if(el) el.textContent = c.welcomeTitle; }
    if (c.tagline) { var el = document.getElementById('welcomeTagline'); if(el) el.textContent = c.tagline; }
    if (c.buttonText) { var el = document.getElementById('welcomeButton'); if(el) el.textContent = c.buttonText; }
}

function showErrorScreen(msg) {
    document.body.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:20px;text-align:center;"><div style="font-size:48px;margin-bottom:20px;">🔒</div><h1 style="font-size:24px;margin-bottom:12px;">Доступ ограничен</h1><p style="color:#7F8C8D;">'+msg+'</p></div>';
}

async function loadPagesData() {
    try {
        if (!config.client || !config.client.scriptUrl) return;
        var r = await fetch(config.client.scriptUrl + '?action=get_pages&agent_id=' + encodeURIComponent(AGENT_ID));
        var d = await r.json();
        if (d.success && d.data) d.data.forEach(function(row) { if(row.page && row.title) pagesData[row.page] = {title:row.title, content:row.content||''}; });
    } catch(e) {}
}

function showBack() { var b = document.getElementById('headerBackBtn'); if(b) b.classList.remove('hidden'); }
function hideBack() { var b = document.getElementById('headerBackBtn'); if(b) b.classList.add('hidden'); }
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
    window.scrollTo(0,0); hideBack();
}

function showPage(pageId) {
    currentPage = pageId; closeMenu();
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('page-about').classList.add('hidden');
    document.getElementById('page-contacts').classList.add('hidden');
    if (pageId === 'home') { document.getElementById('mainContent').classList.remove('hidden'); hideBack(); }
    else if (pageId === 'contacts') { renderContactsPage(); document.getElementById('page-contacts').classList.remove('hidden'); showBack(); }
    else {
        var data = pagesData[pageId]; var target = document.getElementById('page-'+pageId);
        if (data && target) { target.querySelector('.page-header h2').textContent = data.title; target.querySelector('.page-content').innerHTML = data.content; target.classList.remove('hidden'); showBack(); }
        else { document.getElementById('mainContent').classList.remove('hidden'); hideBack(); }
    }
    window.scrollTo(0,0);
}

function renderContactsPage() {
    var d = currentAgentData;
    document.getElementById('agentName').textContent = d.name || 'Имя Агента';
    document.getElementById('agentRole').textContent = d.role || 'Эксперт по недвижимости';
}

function openMenu() { document.getElementById('menuOverlay').classList.remove('hidden'); document.getElementById('sideMenu').classList.remove('hidden'); }
function closeMenu() { document.getElementById('menuOverlay').classList.add('hidden'); document.getElementById('sideMenu').classList.add('hidden'); }
function openDirectChat() { var u = currentAgentData.telegramUsername||''; if(u) window.open('https://t.me/'+u); else tg.showAlert('Telegram не указан'); }
function callAgent() { var p = currentAgentData.phone; if(!p){tg.showAlert('Телефон не указан');return;} window.location.href='tel:'+p.replace(/[^\d+]/g,''); }
function toggleFilters() { var b=document.getElementById('filtersBlock'); b.classList.toggle('hidden'); document.querySelector('.filters-toggle-btn').textContent = b.classList.contains('hidden')?'🔽 Фильтры':'🔼 Скрыть фильтры'; }
function switchView(v) {
    var lb=document.getElementById('listViewBtn'), mb=document.getElementById('mapViewBtn'), lc=document.getElementById('listingsContainer'), mc=document.getElementById('mapContainer');
    if(v==='list'){lb.classList.add('active');mb.classList.remove('active');lc.classList.remove('hidden');mc.classList.add('hidden');hideBack();}
    else{lb.classList.remove('active');mb.classList.add('active');lc.classList.add('hidden');mc.classList.remove('hidden');showBack();setTimeout(initMap,100);}
}

async function init() {
    var ls = document.getElementById('loadingScreen');
    if(ls) ls.classList.remove('hidden');
    await loadClientConfig();
    var ok = await initAgent();
    if(!ok) { if(ls) ls.classList.add('hidden'); return; }
    var cached = getCachedData();
    if(cached) { listings = cached.listings||[]; currentAgentData = cached.agentData||{}; }
    else {
        try {
            var r = await fetch(config.client.scriptUrl+'?action=get_listings&agent_id='+encodeURIComponent(AGENT_ID));
            var d = await r.json();
            if(d.success) { listings=d.data||[]; setCachedData({listings:listings,agentData:{}}); }
        } catch(e) {}
    }
    await loadPagesData();
    renderWelcome(); renderFilters(); renderListings(listings.filter(function(l){return l.active;})); initPhoneMask(); initTelegramMask(); hideBack();
    if(ls) ls.classList.add('hidden');
}

function renderWelcome() {
    // По умолчанию показываем Welcome Screen. Если в конфиге явно false - пропускаем.
    var show = true;
    if (config.features && config.features.showWelcomeScreen === false) show = false;
    if (show) {
        document.getElementById('welcomeScreen').classList.remove('hidden');
        document.getElementById('mainContent').classList.add('hidden');
    } else {
        document.getElementById('welcomeScreen').classList.add('hidden');
        document.getElementById('mainContent').classList.remove('hidden');
    }
}

function renderFilters() {
    var districts=[], metros=[], rooms=[];
    listings.forEach(function(l){if(l.district&&districts.indexOf(l.district)===-1)districts.push(l.district);if(l.metro&&metros.indexOf(l.metro)===-1)metros.push(l.metro);});
    districts.sort(); metros.sort();
    var dc=document.getElementById('districtCheckboxes'); if(dc){dc.innerHTML='';districts.forEach(function(d){var lb=document.createElement('label');lb.className='checkbox-label';lb.innerHTML='<input type="checkbox" value="'+escapeHtml(d)+'" class="filter-checkbox" data-filter="district"><span>'+escapeHtml(d)+'</span>';dc.appendChild(lb);});}
    var mc=document.getElementById('metroCheckboxes'); if(mc){mc.innerHTML='';metros.forEach(function(m){var lb=document.createElement('label');lb.className='checkbox-label';lb.innerHTML='<input type="checkbox" value="'+escapeHtml(m)+'" class="filter-checkbox" data-filter="metro"><span>'+escapeHtml(m)+'</span>';mc.appendChild(lb);});}
    document.querySelectorAll('.price-btn').forEach(function(b){b.addEventListener('click',function(){if(this.classList.contains('active'))this.classList.remove('active');else{document.querySelectorAll('.price-btn').forEach(function(x){x.classList.remove('active');});this.classList.add('active');}filterListings();});});
    document.querySelectorAll('.filter-checkbox').forEach(function(c){c.addEventListener('change',filterListings);});
}

function filterListings() {
    var ab=document.querySelector('.price-btn.active'); var mp=ab?parseFloat(ab.dataset.price)/1e6:Infinity;
    var sd=Array.from(document.querySelectorAll('input[data-filter="district"]:checked')).map(function(c){return c.value;});
    var sm=Array.from(document.querySelectorAll('input[data-filter="metro"]:checked')).map(function(c){return c.value;});
    var f=listings.filter(function(i){
        if(!i.active)return false; if(typeof i.price_from==='number'&&i.price_from>mp)return false;
        if(sd.length>0&&sd.indexOf(i.district)===-1)return false; if(sm.length>0&&sm.indexOf(i.metro)===-1)return false; return true;
    });
    renderListings(f);
}

function resetFilters() { document.querySelectorAll('.price-btn').forEach(function(b){b.classList.remove('active');}); document.querySelectorAll('.filter-checkbox').forEach(function(c){c.checked=false;}); renderListings(listings.filter(function(l){return l.active;})); }

function renderListings(data) {
    var c=document.getElementById('listingsContainer'); if(!c)return; c.innerHTML='';
    if(listings.length===0){c.innerHTML='<div class="empty-state"><div class="empty-icon">🏗️</div><h3>База пуста</h3></div>';return;}
    if(!data||data.length===0){c.innerHTML='<div class="empty-state"><div class="empty-icon">🔍</div><h3>Ничего не найдено</h3><button class="btn-reset-filters" onclick="resetFilters()">Сбросить</button></div>';return;}
    data.forEach(function(item){
        var price = typeof item.price_from==='number' ? (item.price_from<1000?item.price_from.toFixed(1)+' млн ₽':(item.price_from/1e6).toFixed(1)+' млн ₽') : '?';
        var card=document.createElement('div'); card.className='listing-card';
        card.onclick=function(e){if(!e.target.closest('.consult-btn-inline'))openDetails(item.id);};
        card.innerHTML='<img src="'+getImageUrl(item.image_main)+'" class="listing-image" onerror="onImgError(event)"><div class="listing-info"><h3>'+(escapeHtml(item.name)||'Без названия')+'</h3><div class="listing-meta"><span>📍 '+(escapeHtml(item.district)||'')+'</span></div><div class="listing-price">от '+price+'</div><button class="tg-btn consult-btn-inline" onclick="openConsultForm(\''+item.id+'\',event)">📞 Консультация</button></div>';
        c.appendChild(card);
    });
}

function initMap() { if(typeof L==='undefined')return; var mc=document.getElementById('mapContainer'); if(!mc||map)return; map=L.map('mapContainer').setView([59.9343,30.3351],11); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map); filterListings(); setTimeout(function(){map.invalidateSize();},150); }

function openDetails(id) {
    var item=listings.find(function(l){return l.id===id;}); if(!item)return; currentModalId=id;
    document.getElementById('modalTitle').textContent=item.name||'';
    var price=typeof item.price_from==='number'?(item.price_from<1000?item.price_from.toFixed(1):(item.price_from/1e6).toFixed(1)):'?';
    document.getElementById('modalPrice').innerHTML='от <b>'+price+'</b> млн ₽';
    document.getElementById('modalDescription').textContent=item.description||'';
    var gc=document.getElementById('modalGallery'); gc.innerHTML='';
    var imgs=[]; if(item.image_main)imgs.push(item.image_main); if(item.images_gallery)imgs=imgs.concat(item.images_gallery.split(',').filter(Boolean));
    if(imgs.length>0){var track=document.createElement('div');track.className='carousel-track';imgs.forEach(function(u){var s=document.createElement('div');s.className='slide';var img=document.createElement('img');img.src=getImageUrl(u);img.onclick=function(){var fu=getImageUrl(u);if(fu&&fu.startsWith('http')){/Android|iPhone|iPad/i.test(navigator.userAgent)?window.location.href=fu:window.open(fu,'_blank');}};img.onerror=onImgError;s.appendChild(img);track.appendChild(s);});gc.appendChild(track);}
    document.getElementById('detailsModal').classList.remove('hidden'); document.body.style.overflow='hidden'; showBack();
}

function closeModal(){document.getElementById('detailsModal').classList.add('hidden');document.body.style.overflow='';currentModalId=null;if(document.getElementById('mapContainer').classList.contains('hidden'))hideBack();}
function openConsultForm(id,e){if(e)e.stopPropagation();currentModalId=id;var item=listings.find(function(l){return l.id===id;});if(item){document.getElementById('consultObjectName').textContent='🏢 '+item.name;document.getElementById('consultName').value='';document.getElementById('consultPhone').value='+7 (';document.getElementById('consultTelegram').value='';document.getElementById('consultModal').classList.remove('hidden');showBack();}}
function closeConsultModal(){document.getElementById('consultModal').classList.add('hidden');document.getElementById('consultForm').reset();if(document.getElementById('detailsModal').classList.contains('hidden')&&document.getElementById('mapContainer').classList.contains('hidden'))hideBack();}
function initPhoneMask(){var i=document.getElementById('consultPhone');if(!i)return;i.addEventListener('input',function(e){var x=e.target.value.replace(/\D/g,'').match(/(\d{0,1})(\d{0,3})(\d{0,3})(\d{0,2})(\d{0,2})/);e.target.value=!x[2]?'+7 (':'+7 ('+x[2]+(x[3]?') '+x[3]:'')+(x[4]?'-'+x[4]:'')+(x[5]?'-'+x[5]:'');});i.addEventListener('focus',function(e){if(e.target.value==='')e.target.value='+7 (';});}
function initTelegramMask(){var i=document.getElementById('consultTelegram');if(!i)return;i.addEventListener('input',function(e){var v=e.target.value.replace(/[^a-zA-Z0-9_@]/g,'');if(v.includes('@')&&!v.startsWith('@'))v='@'+v.replace(/@/g,'');e.target.value=v.slice(0,32);});}

function submitConsultForm(event) {
    event.preventDefault();
    var item=listings.find(function(l){return l.id===currentModalId;}); if(!item){tg.showAlert('Объект не найден');return;}
    var name=document.getElementById('consultName').value.trim();
    var phone=document.getElementById('consultPhone').value.trim();
    var telegram=document.getElementById('consultTelegram').value.trim()||'';
    if(!name||name.length<2){tg.showAlert('Введите имя');return;}
    if(phone.replace(/\D/g,'').length<11){tg.showAlert('❌ Телефон должен содержать 11 цифр');return;}
    if(telegram&&/[а-яА-ЯёЁ]/.test(telegram)){tg.showAlert('Telegram только латиницей');return;}
    var sb=event.target.querySelector('button[type="submit"]'); sb.textContent='Отправка...'; sb.disabled=true;
    fetch(config.client.scriptUrl,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'save_lead',agentId:AGENT_ID,data:{objectName:item.name,clientName:name,clientPhone:phone,clientTelegram:telegram||'Не указан'}})})
    .then(function(){sb.textContent='Отправить заявку';sb.disabled=false;document.getElementById('consultForm').reset();closeConsultModal();setTimeout(function(){tg.showAlert('✅ Заявка отправлена!');},100);})
    .catch(function(err){tg.showAlert('Ошибка: '+err.message);sb.textContent='Отправить заявку';sb.disabled=false;});
}

function escapeHtml(t){if(!t)return'';var d=document.createElement('div');d.textContent=t;return d.innerHTML;}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
