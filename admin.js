// admin.js v1.6.0 - Cloudflare Workers вместо Edge Functions
const ADMIN_USER_ID = '2038206387';
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/777ernest888-oss/demo-miniapp-realty@main/';
// URL вашего Cloudflare Worker
const WORKER_URL = 'https://upload-to-github.777ernest888.workers.dev';
const MOBILE_TIMEOUT = 60000;
const DESKTOP_TIMEOUT = 30000;

let config = {};
let db = null;
let tg = window.Telegram.WebApp;
let currentUser = null;
let editingPropertyId = null;
let uploadedPhotos = { main: null, gallery: [], plans: [] };

function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           tg.platform === 'android' || tg.platform === 'ios';
}

function getTimeout() {
    return isMobile() ? MOBILE_TIMEOUT : DESKTOP_TIMEOUT;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function toCdnUrl(url) {
    if (!url) return '';
    if (url.startsWith('https://cdn.jsdelivr.net/gh/')) return url;
    if (url.startsWith('https://raw.githubusercontent.com/')) {
        const parts = url.split('/');
        return `https://cdn.jsdelivr.net/gh/${parts[3]}/${parts[4]}@${parts[5]}/${parts.slice(6).join('/')}`;
    }
    if (url.startsWith('property-images/')) return CDN_BASE + url;
    return url;
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
function showLoading(message) {
    if (document.getElementById('loadingOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;justify-content:center;align-items:center;flex-direction:column;gap:20px;';
    overlay.innerHTML = '<div style="width:50px;height:50px;border:5px solid #f3f3f3;border-top:5px solid #3498db;border-radius:50%;animation:spin 1s linear infinite;"></div><div style="color:white;font-size:18px;font-weight:600;">' + (message || 'Загрузка...') + '</div><style>@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>';
    document.body.appendChild(overlay);
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.remove();
}

function showError(message) {
    console.error('', message);
    alert(message || 'Произошла ошибка');
}

function showSuccess(message) {
    console.log('✅', message);
    alert('✅ ' + message);
}

async function initializeApp() {
    try {
        console.log('🚀 Инициализация админки...');
       
        const configResponse = await fetch('client-config.json');
        const rawConfig = await configResponse.json();
       
        config = {
            supabaseUrl: rawConfig.supabase?.url || rawConfig.supabaseUrl,
            supabaseAnonKey: rawConfig.supabase?.anonKey || rawConfig.supabaseAnonKey,
            ...rawConfig
        };
       
        console.log('✅ Конфиг загружен');
       
        if (!config.supabaseUrl || !config.supabaseAnonKey) {
            throw new Error('Не найдены данные для подключения к Supabase');
        }
       
        tg.expand();
        tg.ready();
       
        db = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
        console.log('✅ Supabase клиент создан');
                try {
            const { data: { user } } = await db.auth.getUser();
            currentUser = user;
            if (user && user.id !== ADMIN_USER_ID) {
                showAuthError();
                return;
            }
        } catch (authError) {
            console.log('ℹ️ Тестовый режим');
        }
       
        await loadProperties();
        await warmupDatabase();
       
        console.log('✅ Админка готова');
        hideLoading();
    } catch (error) {
        console.error('❌ Ошибка инициализации:', error);
        showError('Ошибка: ' + error.message);
        hideLoading();
    }
}

function showAuthError() {
    document.body.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;background:#f5f5f5;"><div style="background:white;padding:30px;border-radius:12px;text-align:center;box-shadow:0 4px 6px rgba(0,0,0,0.1);"><h2 style="color:#dc3545;margin-bottom:15px;">⛔ Доступ запрещён</h2><p style="color:#666;margin-bottom:20px;">У вас нет прав доступа</p><button onclick="window.close()" style="padding:10px 20px;background:#dc3545;color:white;border:none;border-radius:6px;cursor:pointer;">Закрыть</button></div></div>';
}

async function loadProperties() {
    showLoading('Загрузка объектов...');
    try {
        const { data, error } = await db.from('properties').select('*').order('created_at', { ascending: false });
        hideLoading();
        if (error) throw error;
        console.log(' Загружено объектов:', data ? data.length : 0);
        renderProperties(data || []);
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        hideLoading();
        showError('Не удалось загрузить объекты: ' + error.message);
    }
}

function renderProperties(properties) {
    const container = document.getElementById('propertiesList');
    if (!container) return;
   
    if (properties.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">Нет объектов. Создайте первый!</p>';
        return;
    }   
    container.innerHTML = properties.map(prop => {
        const isActive = prop.active !== false;
        const name = prop.name || 'Без названия';
        const address = prop.address || prop.district || 'Адрес не указан';
       
        return `<div class="property-card" style="background:white;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
            <div style="flex:1;">
                <h3 style="margin:0 0 10px 0;color:#333;font-size:18px;">${escapeHtml(name)}</h3>
                <p style="margin:5px 0;color:#666;font-size:14px;">📍 ${escapeHtml(address)}</p>
                <div style="margin-top:15px;display:flex;gap:10px;flex-wrap:wrap;">
                    <button onclick="toggleProperty('${prop.id}',${isActive})" style="padding:8px 16px;border:none;border-radius:6px;cursor:pointer;background:${isActive ? '#6c757d' : '#28a745'};color:white;font-size:14px;">${isActive ? ' Скрыть' : '✅ Показать'}</button>
                    <button onclick="editProperty('${prop.id}')" style="padding:8px 16px;border:none;border-radius:6px;cursor:pointer;background:#17a2b8;color:white;font-size:14px;">✏️ Редактировать</button>
                    <button onclick="deleteProperty('${prop.id}')" style="padding:8px 16px;border:none;border-radius:6px;cursor:pointer;background:#dc3545;color:white;font-size:14px;">🗑 Удалить</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

function showAddForm() {
    editingPropertyId = null;
    uploadedPhotos = { main: null, gallery: [], plans: [] };
   
    const formHtml = `<div id="propertyFormOverlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;justify-content:center;align-items:flex-start;padding:20px;overflow-y:auto;">
        <div style="background:white;border-radius:12px;padding:30px;width:100%;max-width:600px;margin:20px 0;">
            <h2 style="margin:0 0 20px 0;color:#333;">📝 Новый объект</h2>
            <form id="propertyForm" onsubmit="saveProperty(event)">
                <div style="margin-bottom:15px;">
                    <label style="display:block;margin-bottom:5px;font-weight:600;color:#333;">Название ЖК *</label>
                    <input type="text" name="name" required placeholder="ЖК «Аристократ»" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:16px;box-sizing:border-box;">
                </div>
                <div style="margin-bottom:15px;">
                    <label style="display:block;margin-bottom:5px;font-weight:600;color:#333;">Адрес (улица + дом) *</label>
                    <input type="text" name="address" required placeholder="ул. Примерная, д. 1" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:16px;box-sizing:border-box;">
                </div>
                <div style="margin-bottom:20px;">
                    <label style="display:block;margin-bottom:10px;font-weight:600;color:#333;">📷 Главное фото *</label>
                    <input type="file" id="mainPhotoInput" accept="image/*" onchange="handleMainPhotoSelect(event)" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;">
                    <div id="mainPhotoPreview" style="margin-top:10px;"></div>
                </div>
                <div style="margin-bottom:20px;">
                    <label style="display:block;margin-bottom:10px;font-weight:600;color:#333;"> Галерея (минимум 2 фото)</label>
                    <input type="file" id="galleryInput" accept="image/*" multiple onchange="handleGallerySelect(event)" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;">
                    <div id="galleryPreview" style="margin-top:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;"></div>
                </div>
                <div style="margin-bottom:20px;">
                    <label style="display:block;margin-bottom:10px;font-weight:600;color:#333;">📐 Планировки</label>
                    <input type="file" id="plansInput" accept="image/*" multiple onchange="handlePlansSelect(event)" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;">
                    <div id="plansPreview" style="margin-top:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;"></div>                </div>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button type="button" onclick="closePropertyForm()" style="padding:12px 24px;background:#6c757d;color:white;border:none;border-radius:6px;cursor:pointer;font-size:16px;">❌ Отмена</button>
                    <button type="submit" id="savePropertyBtn" style="padding:12px 24px;background:#28a745;color:white;border:none;border-radius:6px;cursor:pointer;font-size:16px;">💾 Сохранить</button>
                </div>
            </form>
        </div>
    </div>`;
   
    const oldForm = document.getElementById('propertyFormOverlay');
    if (oldForm) oldForm.remove();
   
    document.body.insertAdjacentHTML('beforeend', formHtml);
}

function closePropertyForm() {
    const form = document.getElementById('propertyFormOverlay');
    if (form) form.remove();
    editingPropertyId = null;
    uploadedPhotos = { main: null, gallery: [], plans: [] };
}

function handleMainPhotoSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showError('Выберите изображение'); return; }
    if (file.size > 5 * 1024 * 1024) { showError('Файл больше 5 МБ'); return; }
   
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('mainPhotoPreview').innerHTML = '<div style="position:relative;display:inline-block;"><img src="' + e.target.result + '" style="max-width:200px;border-radius:8px;"><button type="button" onclick="document.getElementById(\'mainPhotoInput\').value=\'\';document.getElementById(\'mainPhotoPreview\').innerHTML=\'\'" style="position:absolute;top:5px;right:5px;width:24px;height:24px;background:#dc3545;color:white;border:none;border-radius:50%;cursor:pointer;">×</button></div>';
    };
    reader.readAsDataURL(file);
    uploadedPhotos.main = file;
}

function handleGallerySelect(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
   
    const validFiles = files.filter(file => {
        if (!file.type.startsWith('image/')) { showError('Файл ' + file.name + ' не изображение'); return false; }
        if (file.size > 5 * 1024 * 1024) { showError('Файл ' + file.name + ' больше 5 МБ'); return false; }
        return true;
    });
   
    if (validFiles.length === 0) return;
   
    const preview = document.getElementById('galleryPreview');
    validFiles.forEach((file, idx) => {        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.style.position = 'relative';
            div.innerHTML = '<img src="' + e.target.result + '" style="width:100%;height:100px;object-fit:cover;border-radius:6px;"><button type="button" onclick="this.parentElement.remove()" style="position:absolute;top:5px;right:5px;width:24px;height:24px;background:#dc3545;color:white;border:none;border-radius:50%;cursor:pointer;">×</button>';
            preview.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
   
    uploadedPhotos.gallery = [...uploadedPhotos.gallery, ...validFiles];
}

function handlePlansSelect(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
   
    const validFiles = files.filter(file => {
        if (!file.type.startsWith('image/')) { showError('Файл ' + file.name + ' не изображение'); return false; }
        if (file.size > 5 * 1024 * 1024) { showError('Файл ' + file.name + ' больше 5 МБ'); return false; }
        return true;
    });
   
    if (validFiles.length === 0) return;
   
    const preview = document.getElementById('plansPreview');
    validFiles.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.style.position = 'relative';
            div.innerHTML = '<img src="' + e.target.result + '" style="width:100%;height:100px;object-fit:cover;border-radius:6px;"><button type="button" onclick="this.parentElement.remove()" style="position:absolute;top:5px;right:5px;width:24px;height:24px;background:#dc3545;color:white;border:none;border-radius:50%;cursor:pointer;">×</button>';
            preview.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
   
    uploadedPhotos.plans = [...uploadedPhotos.plans, ...validFiles];
}

async function saveProperty(event) {
    event.preventDefault();
   
    if (!editingPropertyId && !uploadedPhotos.main) {
        showError('Загрузите главное фото');
        return;
    }
   
    const saveBtn = document.getElementById('savePropertyBtn');
    const originalBtnText = saveBtn.innerHTML;   
    try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '⏳ Сохранение...';
       
        const form = event.target;
        const formData = new FormData(form);
       
        const propertyData = {
            name: formData.get('name'),
            address: formData.get('address'),
            updated_at: new Date().toISOString()
        };
       
        console.log('📝 Данные объекта:', propertyData);
       
        const photoFolderId = editingPropertyId || 'spb-' + Date.now();
       
        if (uploadedPhotos.main || uploadedPhotos.gallery.length > 0 || uploadedPhotos.plans.length > 0) {
            console.log('📤 Загрузка фото...');
            const uploadedUrls = await uploadPhotosToGitHub(photoFolderId);
            if (uploadedUrls.main) propertyData.image_main = uploadedUrls.main;
            if (uploadedUrls.gallery && uploadedUrls.gallery.length > 0) propertyData.images_gallery = uploadedUrls.gallery;
            if (uploadedUrls.plans && uploadedUrls.plans.length > 0) propertyData.floor_plans_images = uploadedUrls.plans;
        }
       
        console.log('💾 Сохранение в БД...');
        let result;
        if (editingPropertyId) {
            result = await db.from('properties').update(propertyData).eq('id', editingPropertyId).select();
        } else {
            propertyData.id = photoFolderId;
            propertyData.created_at = new Date().toISOString();
            propertyData.active = true;
            result = await db.from('properties').insert([propertyData]).select();
        }
       
        if (result.error) {
            console.error('Ошибка БД:', result.error);
            throw result.error;
        }
       
        console.log('✅ Сохранено');
        closePropertyForm();
        await loadProperties();
        showSuccess(editingPropertyId ? 'Объект обновлён' : 'Объект создан');
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        showError('Ошибка: ' + (error.message || 'Неизвестная ошибка'));
    } finally {        saveBtn.disabled = false;
        saveBtn.innerHTML = originalBtnText;
    }
}

// НОВЫЙ КОД: загрузка через Cloudflare Worker
async function uploadPhotosToGitHub(folderId) {
    const uploadedUrls = { main: null, gallery: [], plans: [] };
    const timeout = getTimeout();
   
    console.log('⏱ Таймаут загрузки:', timeout / 1000, 'сек');
    console.log('🔗 Worker URL:', WORKER_URL);
   
    if (uploadedPhotos.main) {
        console.log('📤 Загрузка главного фото...');
        const base64 = await fileToBase64(uploadedPhotos.main);
        const fileName = 'main_' + Date.now() + '.jpg';
        const path = 'property-images/' + folderId + '/' + fileName;
       
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
       
        try {
            const response = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'upload', path: path, content: base64.split(',')[1] }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
           
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error('Ошибка загрузки: ' + response.status + ' ' + errorText);
            }
           
            const data = await response.json();
            uploadedUrls.main = CDN_BASE + path;
            console.log('✅ Главное фото загружено:', uploadedUrls.main);
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Превышено время загрузки (' + (timeout/1000) + ' сек). Попробуйте уменьшить размер фото.');
            }
            throw error;
        }
    }
   
    for (let i = 0; i < uploadedPhotos.gallery.length; i++) {
        const file = uploadedPhotos.gallery[i];        console.log('📤 Загрузка галереи ' + (i+1) + '/' + uploadedPhotos.gallery.length);
        const base64 = await fileToBase64(file);
        const fileName = 'gallery_' + i + '_' + Date.now() + '.jpg';
        const path = 'property-images/' + folderId + '/' + fileName;
       
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
       
        try {
            const response = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'upload', path: path, content: base64.split(',')[1] }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
           
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error('Ошибка загрузки: ' + response.status);
            }
           
            uploadedUrls.gallery.push(CDN_BASE + path);
            console.log('✅ Фото галереи ' + (i+1) + ' загружено');
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Превышено время загрузки галереи');
            }
            throw error;
        }
    }
   
    for (let i = 0; i < uploadedPhotos.plans.length; i++) {
        const file = uploadedPhotos.plans[i];
        console.log('📤 Загрузка плана ' + (i+1) + '/' + uploadedPhotos.plans.length);
        const base64 = await fileToBase64(file);
        const fileName = 'plan_' + i + '_' + Date.now() + '.jpg';
        const path = 'property-images/' + folderId + '/' + fileName;
       
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
       
        try {
            const response = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'upload', path: path, content: base64.split(',')[1] }),
                signal: controller.signal
            });            clearTimeout(timeoutId);
           
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error('Ошибка загрузки: ' + response.status);
            }
           
            uploadedUrls.plans.push(CDN_BASE + path);
            console.log('✅ План ' + (i+1) + ' загружен');
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Превышено время загрузки планов');
            }
            throw error;
        }
    }
   
    return uploadedUrls;
}

async function editProperty(id) {
    showLoading('Загрузка...');
    try {
        const { data: property, error } = await db.from('properties').select('*').eq('id', id).single();
        hideLoading();
       
        if (error) throw error;
        if (!property) { showError('Объект не найден'); return; }
       
        console.log('✏️ Редактирование объекта:', property);
       
        editingPropertyId = id;
        uploadedPhotos = { main: null, gallery: [], plans: [] };
       
        const formHtml = `<div id="propertyFormOverlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;justify-content:center;align-items:flex-start;padding:20px;overflow-y:auto;">
            <div style="background:white;border-radius:12px;padding:30px;width:100%;max-width:600px;margin:20px 0;">
                <h2 style="margin:0 0 20px 0;color:#333;">✏️ Редактирование</h2>
                <form id="propertyForm" onsubmit="saveProperty(event)">
                    <div style="margin-bottom:15px;">
                        <label style="display:block;margin-bottom:5px;font-weight:600;color:#333;">Название ЖК *</label>
                        <input type="text" name="name" required value="${escapeHtml(property.name || '')}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:16px;box-sizing:border-box;">
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="display:block;margin-bottom:5px;font-weight:600;color:#333;">Адрес (улица + дом) *</label>
                        <input type="text" name="address" required value="${escapeHtml(property.address || '')}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:16px;box-sizing:border-box;">
                    </div>
                   
                    ${property.image_main ? '<div style="margin-bottom:20px;"><label style="display:block;margin-bottom:10px;font-weight:600;color:#333;">📷 Текущее главное фото</label><img src="' + toCdnUrl(property.image_main) + '" alt="Главное фото" style="max-width:100%;border-radius:8px;margin-bottom:10px;"><button type="button" onclick="removeCurrentMainPhoto()" style="padding:6px 12px;background:#dc3545;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;">🗑 Удалить фото</button></div>' : ''}
                                        <div style="margin-bottom:20px;">
                        <label style="display:block;margin-bottom:10px;font-weight:600;color:#333;">📷 ${property.image_main ? 'Заменить главное фото' : 'Главное фото *'}</label>
                        <input type="file" id="mainPhotoInput" accept="image/*" onchange="handleMainPhotoSelect(event)" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;">
                        <div id="mainPhotoPreview" style="margin-top:10px;"></div>
                    </div>
                   
                    ${property.images_gallery && property.images_gallery.length > 0 ? '<div style="margin-bottom:20px;"><label style="display:block;margin-bottom:10px;font-weight:600;color:#333;">📸 Текущая галерея (' + property.images_gallery.length + ' фото)</label><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px;">' + property.images_gallery.map((photo, idx) => '<div style="position:relative;"><img src="' + toCdnUrl(photo) + '" alt="Галерея" style="width:100%;height:100px;object-fit:cover;border-radius:6px;"><button type="button" onclick="removeCurrentGalleryPhoto(' + idx + ')" style="position:absolute;top:5px;right:5px;width:24px;height:24px;background:#dc3545;color:white;border:none;border-radius:50%;cursor:pointer;font-size:12px;">×</button></div>').join('') + '</div></div>' : ''}
                   
                    <div style="margin-bottom:20px;">
                        <label style="display:block;margin-bottom:10px;font-weight:600;color:#333;"> ${property.images_gallery && property.images_gallery.length > 0 ? 'Добавить в галерею' : 'Галерея'}</label>
                        <input type="file" id="galleryInput" accept="image/*" multiple onchange="handleGallerySelect(event)" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;">
                        <div id="galleryPreview" style="margin-top:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;"></div>
                    </div>
                   
                    ${property.floor_plans_images && property.floor_plans_images.length > 0 ? '<div style="margin-bottom:20px;"><label style="display:block;margin-bottom:10px;font-weight:600;color:#333;">📐 Текущие планы (' + property.floor_plans_images.length + ' фото)</label><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px;">' + property.floor_plans_images.map((photo, idx) => '<div style="position:relative;"><img src="' + toCdnUrl(photo) + '" alt="План" style="width:100%;height:100px;object-fit:cover;border-radius:6px;"><button type="button" onclick="removeCurrentPlanPhoto(' + idx + ')" style="position:absolute;top:5px;right:5px;width:24px;height:24px;background:#dc3545;color:white;border:none;border-radius:50%;cursor:pointer;font-size:12px;">×</button></div>').join('') + '</div></div>' : ''}
                   
                    <div style="margin-bottom:20px;">
                        <label style="display:block;margin-bottom:10px;font-weight:600;color:#333;">📐 ${property.floor_plans_images && property.floor_plans_images.length > 0 ? 'Добавить план' : 'Планы'}</label>
                        <input type="file" id="plansInput" accept="image/*" multiple onchange="handlePlansSelect(event)" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;">
                        <div id="plansPreview" style="margin-top:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;"></div>
                    </div>
                   
                    <div style="display:flex;gap:10px;justify-content:flex-end;">
                        <button type="button" onclick="closePropertyForm()" style="padding:12px 24px;background:#6c757d;color:white;border:none;border-radius:6px;cursor:pointer;font-size:16px;">❌ Отмена</button>
                        <button type="submit" id="savePropertyBtn" style="padding:12px 24px;background:#28a745;color:white;border:none;border-radius:6px;cursor:pointer;font-size:16px;">💾 Обновить</button>
                    </div>
                </form>
            </div>
        </div>`;
       
        const oldForm = document.getElementById('propertyFormOverlay');
        if (oldForm) oldForm.remove();
       
        document.body.insertAdjacentHTML('beforeend', formHtml);
       
        console.log('✅ Форма открыта');
    } catch (error) {
        console.error('Ошибка:', error);
        hideLoading();
        showError('Не удалось загрузить объект: ' + error.message);
    }
}

async function removeCurrentMainPhoto() {
    if (!editingPropertyId) return;
    if (!confirm('Удалить главное фото?')) return;
   
    try {
        const { data: property } = await db.from('properties').select('image_main').eq('id', editingPropertyId).single();
                if (property && property.image_main) {
            const path = property.image_main.replace(CDN_BASE, '');
            await deleteFileFromGitHub(path);
        }
       
        await db.from('properties').update({ image_main: null }).eq('id', editingPropertyId);
       
        showSuccess('Главное фото удалено');
        await editProperty(editingPropertyId);
    } catch (error) {
        console.error('Ошибка:', error);
        showError('Ошибка удаления фото: ' + error.message);
    }
}

async function removeCurrentGalleryPhoto(index) {
    if (!editingPropertyId) return;
    if (!confirm('Удалить фото из галереи?')) return;
   
    try {
        const { data: property } = await db.from('properties').select('images_gallery').eq('id', editingPropertyId).single();
       
        if (property && property.images_gallery && property.images_gallery[index]) {
            const path = property.images_gallery[index].replace(CDN_BASE, '');
            await deleteFileFromGitHub(path);
           
            property.images_gallery.splice(index, 1);
           
            await db.from('properties').update({ images_gallery: property.images_gallery }).eq('id', editingPropertyId);
        }
       
        showSuccess('Фото удалено');
        await editProperty(editingPropertyId);
    } catch (error) {
        console.error('Ошибка:', error);
        showError('Ошибка удаления фото: ' + error.message);
    }
}

async function removeCurrentPlanPhoto(index) {
    if (!editingPropertyId) return;
    if (!confirm('Удалить план?')) return;
   
    try {
        const { data: property } = await db.from('properties').select('floor_plans_images').eq('id', editingPropertyId).single();
       
        if (property && property.floor_plans_images && property.floor_plans_images[index]) {
            const path = property.floor_plans_images[index].replace(CDN_BASE, '');
            await deleteFileFromGitHub(path);
                        property.floor_plans_images.splice(index, 1);
           
            await db.from('properties').update({ floor_plans_images: property.floor_plans_images }).eq('id', editingPropertyId);
        }
       
        showSuccess('План удалён');
        await editProperty(editingPropertyId);
    } catch (error) {
        console.error('Ошибка:', error);
        showError('Ошибка удаления фото: ' + error.message);
    }
}

// НОВЫЙ КОД: удаление через Cloudflare Worker
async function deleteFileFromGitHub(path) {
    // Сначала получаем SHA файла
    const getInfoResponse = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-info', path: path })
    });
   
    if (!getInfoResponse.ok) {
        throw new Error('Файл не найден');
    }
   
    const infoData = await getInfoResponse.json();
   
    // Теперь удаляем
    const deleteResponse = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', path: path, sha: infoData.sha })
    });
   
    if (!deleteResponse.ok) {
        throw new Error('Ошибка удаления');
    }
   
    console.log('✅ Удалено:', path);
}

async function deleteProperty(id) {
    if (!confirm('️ Удалить объект? Все фото будут удалены!')) return;
   
    showLoading('Удаление...');
    try {
        const { data: property, error: fetchError } = await db.from('properties').select('*').eq('id', id).single();
        if (fetchError) throw fetchError;
        if (!property) throw new Error('Объект не найден');       
        const photosToDelete = [];
        if (property.image_main) photosToDelete.push(property.image_main);
        if (property.images_gallery) photosToDelete.push(...property.images_gallery);
        if (property.floor_plans_images) photosToDelete.push(...property.floor_plans_images);
       
        console.log('🗑 Удаление ' + photosToDelete.length + ' фото...');
        for (let i = 0; i < photosToDelete.length; i++) {
            try {
                const path = photosToDelete[i].replace(CDN_BASE, '');
                await deleteFileFromGitHub(path);
            } catch (e) {
                console.warn('Не удалил фото:', photosToDelete[i]);
            }
        }
       
        const deleteResult = await db.from('properties').delete().eq('id', id);
        if (deleteResult.error) throw deleteResult.error;
       
        console.log('✅ Удалено');
        await loadProperties();
        hideLoading();
        showSuccess('Объект удалён');
    } catch (error) {
        console.error('Ошибка:', error);
        hideLoading();
        showError('Ошибка: ' + error.message);
    }
}

async function toggleProperty(id, currentStatus) {
    const newStatus = !currentStatus;
    showLoading(newStatus ? 'Публикация...' : 'Скрытие...');
   
    try {
        const result = await db.from('properties').update({ active: newStatus, updated_at: new Date().toISOString() }).eq('id', id);
        if (result.error) throw result.error;
       
        console.log('✅ Статус изменён');
        await loadProperties();
        hideLoading();
        showSuccess(newStatus ? 'Объект опубликован' : 'Объект скрыт');
    } catch (error) {
        console.error('Ошибка:', error);
        hideLoading();
        showError('Ошибка изменения статуса: ' + error.message);
    }
}

async function warmupDatabase() {    try {
        await db.from('properties').select('id').limit(1);
        console.log('✅ БД прогрета');
    } catch (error) {
        console.error('Прогрев БД:', error);
    }
}

function switchTab(tabName) {
    console.log('Вкладка:', tabName);
    if (tabName === 'addProperty') {
        showAddForm();
    }
}

document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});
