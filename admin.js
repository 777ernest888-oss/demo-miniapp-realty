// admin.js v1.1.0
// Telegram Mini App Realty - Admin Panel

// ============================================
// КОНФИГУРАЦИЯ
// ============================================
const ADMIN_USER_ID = '2038206387';
const GITHUB_REPO = '777ernest888-oss/demo-miniapp-realty';
const GITHUB_BRANCH = 'main';
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/777ernest888-oss/demo-miniapp-realty@main/';
const MOBILE_TIMEOUT = 25000; // 25 секунд для мобильных
const DESKTOP_TIMEOUT = 15000; // 15 секунд для ПК

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================
let tg = window.Telegram.WebApp;
let supabase;
let currentUser = null;
let editingPropertyId = null;
let uploadedPhotos = {
    main: null,
    gallery: [],
    plans: []
};

// Проверка на мобильное устройство
function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           tg.platform === 'android' ||
           tg.platform === 'ios';
}

function getTimeout() {
    return isMobile() ? MOBILE_TIMEOUT : DESKTOP_TIMEOUT;
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('🚀 Инициализация админки...');
       
        // Настройка Telegram WebApp
        tg.expand();
        tg.ready();
       
        // Инициализация Supabase
        const configResponse = await fetch('client-config.json');
        const config = await configResponse.json();
                supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
        console.log('✅ Supabase инициализирован');
       
        // Проверка авторизации
        const { data: { user } } = await supabase.auth.getUser();
        currentUser = user;
       
        if (user) {
            console.log('👤 Пользователь:', user.id);
            if (user.id !== ADMIN_USER_ID) {
                showAuthError();
                return;
            }
        } else {
            console.log('ℹ️ Открыто вне Telegram (тестовый режим)');
        }
       
        // Загрузка объектов
        await loadProperties();
       
        // Прогрев базы
        await warmupDatabase();
       
        console.log('✅ Админка готова к работе');
       
    } catch (error) {
        console.error('❌ Ошибка инициализации:', error);
        showError('Ошибка загрузки админки. Обновите страницу.');
    }
});

// ============================================
// АВТОРИЗАЦИЯ
// ============================================
function showAuthError() {
    document.body.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; height: 100vh; background: #f5f5f5;">
            <div style="background: white; padding: 30px; border-radius: 12px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <h2 style="color: #dc3545; margin-bottom: 15px;">⛔ Доступ запрещён</h2>
                <p style="color: #666; margin-bottom: 20px;">У вас нет прав доступа к админке</p>
                <button onclick="window.close()" style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 6px; cursor: pointer;">Закрыть</button>
            </div>
        </div>
    `;
}

// ============================================
// ЗАГРУЗКА ОБЪЕКТОВ
// ============================================
async function loadProperties() {    showLoading('Загрузка объектов...');
   
    try {
        const { data, error } = await supabase
            .from('properties')
            .select('*')
            .order('created_at', { ascending: false });
       
        hideLoading();
       
        if (error) throw error;
       
        renderProperties(data || []);
       
    } catch (error) {
        console.error('Ошибка загрузки объектов:', error);
        hideLoading();
        showError('Не удалось загрузить объекты. Проверьте соединение.');
    }
}

function renderProperties(properties) {
    const container = document.getElementById('propertiesList');
    if (!container) return;
   
    if (properties.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">Нет объектов. Создайте первый!</p>';
        return;
    }
   
    container.innerHTML = properties.map(prop => {
        const mainPhoto = prop.main_photo ? toCdnUrl(prop.main_photo) : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="150"%3E%3Crect fill="%23ddd" width="200" height="150"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EНет фото%3C/text%3E%3C/svg%3E';
        const isActive = prop.active !== false;
       
        return `
            <div class="property-card" style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                    <img src="${mainPhoto}" alt="${prop.title}" style="width: 200px; height: 150px; object-fit: cover; border-radius: 8px;">
                    <div style="flex: 1; min-width: 250px;">
                        <h3 style="margin: 0 0 10px 0; color: #333;">${prop.title}</h3>
                        <p style="margin: 5px 0; color: #666;">📍 ${prop.address || prop.district}</p>
                        <p style="margin: 5px 0; color: #666;">💰 ${prop.price ? prop.price.toLocaleString('ru-RU') : '—'} ₽</p>
                        <p style="margin: 5px 0; color: #666;">🏠 ${prop.rooms || '—'} комн.</p>
                        <p style="margin: 5px 0; color: #666;">📐 ${prop.area || '—'} м²</p>
                        <p style="margin: 5px 0; color: #666;">🏢 ${prop.floor || '—'}/${prop.total_floors || '—'} этаж</p>
                        <div style="margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;">
                            <button onclick="toggleProperty('${prop.id}', ${isActive})"
                                    style="padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; background: ${isActive ? '#6c757d' : '#28a745'}; color: white; font-size: 14px;">
                                ${isActive ? '🙈 Скрыть' : '✅ Показать'}
                            </button>                            <button onclick="editProperty('${prop.id}')"
                                    style="padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; background: #17a2b8; color: white; font-size: 14px;">
                                ✏️ Редактировать
                            </button>
                            <button onclick="deleteProperty('${prop.id}')"
                                    style="padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; background: #dc3545; color: white; font-size: 14px;">
                                🗑 Удалить
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// ФОРМА ДОБАВЛЕНИЯ/РЕДАКТИРОВАНИЯ
// ============================================
function showAddForm() {
    editingPropertyId = null;
    uploadedPhotos = { main: null, gallery: [], plans: [] };
   
    const formHtml = `
        <div id="propertyFormOverlay" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 1000; display: flex; justify-content: center; align-items: flex-start; padding: 20px; overflow-y: auto;">
            <div style="background: white; border-radius: 12px; padding: 30px; width: 100%; max-width: 600px; margin: 20px 0;">
                <h2 style="margin: 0 0 20px 0; color: #333;">📝 Новый объект</h2>
               
                <form id="propertyForm" onsubmit="saveProperty(event)">
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">Название *</label>
                        <input type="text" name="title" required
                               style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; box-sizing: border-box;">
                    </div>
                   
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">Адрес (улица + дом) *</label>
                        <input type="text" name="address" required
                               style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; box-sizing: border-box;">
                    </div>
                   
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">Цена (₽) *</label>
                            <input type="number" name="price" required
                                   style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; box-sizing: border-box;">
                        </div>
                       
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">Комнат *</label>                            <input type="number" name="rooms" required min="1"
                                   style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; box-sizing: border-box;">
                        </div>
                    </div>
                   
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">Площадь (м²) *</label>
                            <input type="number" name="area" required step="0.1"
                                   style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; box-sizing: border-box;">
                        </div>
                       
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">Этаж *</label>
                            <input type="text" name="floor" required placeholder="5/12"
                                   style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; box-sizing: border-box;">
                        </div>
                    </div>
                   
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">Описание</label>
                        <textarea name="description" rows="4"
                                  style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; box-sizing: border-box;"></textarea>
                    </div>
                   
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 10px; font-weight: 600; color: #333;">📷 Главное фото</label>
                        <input type="file" id="mainPhotoInput" accept="image/*" onchange="handleMainPhotoSelect(event)"
                               style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
                        <div id="mainPhotoPreview" style="margin-top: 10px;"></div>
                    </div>
                   
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 10px; font-weight: 600; color: #333;">📸 Галерея</label>
                        <input type="file" id="galleryInput" accept="image/*" multiple onchange="handleGallerySelect(event)"
                               style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
                        <div id="galleryPreview" style="margin-top: 10px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;"></div>
                    </div>
                   
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 10px; font-weight: 600; color: #333;">📐 Планы</label>
                        <input type="file" id="plansInput" accept="image/*" multiple onchange="handlePlansSelect(event)"
                               style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
                        <div id="plansPreview" style="margin-top: 10px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;"></div>
                    </div>
                   
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button type="button" onclick="closePropertyForm()"
                                style="padding: 12px 24px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px;">
                            ❌ Отмена                        </button>
                        <button type="submit" id="savePropertyBtn"
                                style="padding: 12px 24px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px;">
                            💾 Сохранить
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
   
    // Удаляем старую форму если есть
    const oldForm = document.getElementById('propertyFormOverlay');
    if (oldForm) oldForm.remove();
   
    // Добавляем новую форму
    document.body.insertAdjacentHTML('beforeend', formHtml);
}

function closePropertyForm() {
    const form = document.getElementById('propertyFormOverlay');
    if (form) {
        form.remove();
    }
    editingPropertyId = null;
    uploadedPhotos = { main: null, gallery: [], plans: [] };
}

async function editProperty(id) {
    showLoading('Загрузка объекта...');
   
    try {
        const { data: property, error } = await supabase
            .from('properties')
            .select('*')
            .eq('id', id)
            .single();
       
        hideLoading();
       
        if (error) throw error;
        if (!property) {
            showError('Объект не найден');
            return;
        }
       
        editingPropertyId = id;
       
        // Сбрасываем загруженные фото
        uploadedPhotos = { main: null, gallery: [], plans: [] };       
        const formHtml = `
            <div id="propertyFormOverlay" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 1000; display: flex; justify-content: center; align-items: flex-start; padding: 20px; overflow-y: auto;">
                <div style="background: white; border-radius: 12px; padding: 30px; width: 100%; max-width: 600px; margin: 20px 0;">
                    <h2 style="margin: 0 0 20px 0; color: #333;">✏️ Редактирование объекта</h2>
                   
                    <form id="propertyForm" onsubmit="saveProperty(event)">
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">Название *</label>
                            <input type="text" name="title" required value="${property.title || ''}"
                                   style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; box-sizing: border-box;">
                        </div>
                       
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">Адрес (улица + дом) *</label>
                            <input type="text" name="address" required value="${property.address || ''}"
                                   style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; box-sizing: border-box;">
                        </div>
                       
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div style="margin-bottom: 15px;">
                                <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">Цена (₽) *</label>
                                <input type="number" name="price" required value="${property.price || ''}"
                                       style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; box-sizing: border-box;">
                            </div>
                           
                            <div style="margin-bottom: 15px;">
                                <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">Комнат *</label>
                                <input type="number" name="rooms" required min="1" value="${property.rooms || ''}"
                                       style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; box-sizing: border-box;">
                            </div>
                        </div>
                       
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div style="margin-bottom: 15px;">
                                <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">Площадь (м²) *</label>
                                <input type="number" name="area" required step="0.1" value="${property.area || ''}"
                                       style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; box-sizing: border-box;">
                            </div>
                           
                            <div style="margin-bottom: 15px;">
                                <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">Этаж *</label>
                                <input type="text" name="floor" required value="${property.floor || ''}" placeholder="5/12"
                                       style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; box-sizing: border-box;">
                            </div>
                        </div>
                       
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">Описание</label>
                            <textarea name="description" rows="4"                                       style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; box-sizing: border-box;">${property.description || ''}</textarea>
                        </div>
                       
                        ${property.main_photo ? `
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 10px; font-weight: 600; color: #333;">📷 Текущее главное фото</label>
                            <img src="${toCdnUrl(property.main_photo)}" alt="Главное фото" style="max-width: 100%; border-radius: 8px; margin-bottom: 10px;">
                            <button type="button" onclick="removeCurrentMainPhoto()"
                                    style="padding: 6px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
                                🗑 Удалить фото
                            </button>
                        </div>
                        ` : ''}
                       
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 10px; font-weight: 600; color: #333;">📷 ${property.main_photo ? 'Заменить главное фото' : 'Главное фото'}</label>
                            <input type="file" id="mainPhotoInput" accept="image/*" onchange="handleMainPhotoSelect(event)"
                                   style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
                            <div id="mainPhotoPreview" style="margin-top: 10px;"></div>
                        </div>
                       
                        ${property.gallery && property.gallery.length > 0 ? `
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 10px; font-weight: 600; color: #333;">📸 Текущая галерея (${property.gallery.length} фото)</label>
                            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 10px;">
                                ${property.gallery.map((photo, idx) => `
                                    <div style="position: relative;">
                                        <img src="${toCdnUrl(photo)}" alt="Галерея" style="width: 100%; height: 100px; object-fit: cover; border-radius: 6px;">
                                        <button type="button" onclick="removeCurrentGalleryPhoto(${idx})"
                                                style="position: absolute; top: 5px; right: 5px; width: 24px; height: 24px; background: #dc3545; color: white; border: none; border-radius: 50%; cursor: pointer; font-size: 12px;">×</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        ` : ''}
                       
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 10px; font-weight: 600; color: #333;">📸 ${property.gallery && property.gallery.length > 0 ? 'Добавить в галерею' : 'Галерея'}</label>
                            <input type="file" id="galleryInput" accept="image/*" multiple onchange="handleGallerySelect(event)"
                                   style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
                            <div id="galleryPreview" style="margin-top: 10px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;"></div>
                        </div>
                       
                        ${property.plans && property.plans.length > 0 ? `
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 10px; font-weight: 600; color: #333;">📐 Текущие планы (${property.plans.length} фото)</label>
                            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 10px;">
                                ${property.plans.map((photo, idx) => `
                                    <div style="position: relative;">
                                        <img src="${toCdnUrl(photo)}" alt="План" style="width: 100%; height: 100px; object-fit: cover; border-radius: 6px;">                                        <button type="button" onclick="removeCurrentPlanPhoto(${idx})"
                                                style="position: absolute; top: 5px; right: 5px; width: 24px; height: 24px; background: #dc3545; color: white; border: none; border-radius: 50%; cursor: pointer; font-size: 12px;">×</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        ` : ''}
                       
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 10px; font-weight: 600; color: #333;">📐 ${property.plans && property.plans.length > 0 ? 'Добавить план' : 'Планы'}</label>
                            <input type="file" id="plansInput" accept="image/*" multiple onchange="handlePlansSelect(event)"
                                   style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
                            <div id="plansPreview" style="margin-top: 10px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;"></div>
                        </div>
                       
                        <div style="display: flex; gap: 10px; justify-content: flex-end;">
                            <button type="button" onclick="closePropertyForm()"
                                    style="padding: 12px 24px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px;">
                                ❌ Отмена
                            </button>
                            <button type="submit" id="savePropertyBtn"
                                    style="padding: 12px 24px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px;">
                                💾 Обновить
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
       
        // Удаляем старую форму если есть
        const oldForm = document.getElementById('propertyFormOverlay');
        if (oldForm) oldForm.remove();
       
        // Добавляем новую форму
        document.body.insertAdjacentHTML('beforeend', formHtml);
       
        console.log('✅ Форма редактирования открыта');
       
    } catch (error) {
        console.error('Ошибка загрузки объекта:', error);
        hideLoading();
        showError('Не удалось загрузить объект для редактирования');
    }
}

// ============================================
// РАБОТА С ФОТО
// ============================================
function handleMainPhotoSelect(event) {    const file = event.target.files[0];
    if (!file) return;
   
    // Валидация
    if (!file.type.startsWith('image/')) {
        showError('Пожалуйста, выберите изображение');
        return;
    }
   
    if (file.size > 5 * 1024 * 1024) {
        showError('Размер файла не должен превышать 5 МБ');
        return;
    }
   
    // Предпросмотр
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('mainPhotoPreview');
        preview.innerHTML = `
            <div style="position: relative; display: inline-block;">
                <img src="${e.target.result}" alt="Preview" style="max-width: 200px; border-radius: 8px;">
                <button type="button" onclick="document.getElementById('mainPhotoInput').value=''; document.getElementById('mainPhotoPreview').innerHTML=''"
                        style="position: absolute; top: 5px; right: 5px; width: 24px; height: 24px; background: #dc3545; color: white; border: none; border-radius: 50%; cursor: pointer;">×</button>
            </div>
        `;
    };
    reader.readAsDataURL(file);
   
    // Сохраняем файл
    uploadedPhotos.main = file;
}

function handleGallerySelect(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
   
    // Валидация
    const validFiles = files.filter(file => {
        if (!file.type.startsWith('image/')) {
            showError(`Файл "${file.name}" не является изображением`);
            return false;
        }
        if (file.size > 5 * 1024 * 1024) {
            showError(`Файл "${file.name}" превышает 5 МБ`);
            return false;
        }
        return true;
    });
   
    if (validFiles.length === 0) return;   
    // Предпросмотр
    const preview = document.getElementById('galleryPreview');
    validFiles.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.style.position = 'relative';
            div.innerHTML = `
                <img src="${e.target.result}" alt="Preview" style="width: 100%; height: 100px; object-fit: cover; border-radius: 6px;">
                <button type="button" onclick="this.parentElement.remove()"
                        style="position: absolute; top: 5px; right: 5px; width: 24px; height: 24px; background: #dc3545; color: white; border: none; border-radius: 50%; cursor: pointer;">×</button>
            `;
            preview.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
   
    // Добавляем к загруженным
    uploadedPhotos.gallery = [...uploadedPhotos.gallery, ...validFiles];
}

function handlePlansSelect(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
   
    // Валидация
    const validFiles = files.filter(file => {
        if (!file.type.startsWith('image/')) {
            showError(`Файл "${file.name}" не является изображением`);
            return false;
        }
        if (file.size > 5 * 1024 * 1024) {
            showError(`Файл "${file.name}" превышает 5 МБ`);
            return false;
        }
        return true;
    });
   
    if (validFiles.length === 0) return;
   
    // Предпросмотр
    const preview = document.getElementById('plansPreview');
    validFiles.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.style.position = 'relative';
            div.innerHTML = `
                <img src="${e.target.result}" alt="Preview" style="width: 100%; height: 100px; object-fit: cover; border-radius: 6px;">                <button type="button" onclick="this.parentElement.remove()"
                        style="position: absolute; top: 5px; right: 5px; width: 24px; height: 24px; background: #dc3545; color: white; border: none; border-radius: 50%; cursor: pointer;">×</button>
            `;
            preview.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
   
    // Добавляем к загруженным
    uploadedPhotos.plans = [...uploadedPhotos.plans, ...validFiles];
}

// ============================================
// СОХРАНЕНИЕ ОБЪЕКТА
// ============================================
async function saveProperty(event) {
    event.preventDefault();
   
    const form = event.target;
    const formData = new FormData(form);
   
    // Проверка главного фото для нового объекта
    if (!editingPropertyId && !uploadedPhotos.main) {
        showError('Пожалуйста, загрузите главное фото');
        return;
    }
   
    const saveBtn = document.getElementById('savePropertyBtn');
    const originalBtnText = saveBtn.innerHTML;
   
    try {
        // Блокируем кнопку
        saveBtn.disabled = true;
        saveBtn.innerHTML = '⏳ Сохранение...';
       
        const propertyData = {
            title: formData.get('title'),
            address: formData.get('address'),
            price: parseFloat(formData.get('price')),
            rooms: parseInt(formData.get('rooms')),
            area: parseFloat(formData.get('area')),
            floor: formData.get('floor'),
            description: formData.get('description'),
            updated_at: new Date().toISOString()
        };
       
        // Генерируем ID для папки с фото
        const photoFolderId = editingPropertyId || `spb-${Date.now()}`;
       
        // Загрузка фото        if (uploadedPhotos.main || uploadedPhotos.gallery.length > 0 || uploadedPhotos.plans.length > 0) {
            console.log('📤 Загрузка фото...');
           
            const uploadedUrls = await uploadPhotosToGitHub(photoFolderId);
           
            if (uploadedUrls.main) {
                propertyData.main_photo = uploadedUrls.main;
            }
            if (uploadedUrls.gallery && uploadedUrls.gallery.length > 0) {
                propertyData.gallery = uploadedUrls.gallery;
            }
            if (uploadedUrls.plans && uploadedUrls.plans.length > 0) {
                propertyData.plans = uploadedUrls.plans;
            }
        }
       
        // Сохранение в БД
        console.log('💾 Сохранение в базу данных...');
       
        let result;
        if (editingPropertyId) {
            // Обновление существующего
            result = await supabase
                .from('properties')
                .update(propertyData)
                .eq('id', editingPropertyId)
                .select();
        } else {
            // Создание нового
            propertyData.id = photoFolderId;
            propertyData.created_at = new Date().toISOString();
            propertyData.active = true;
           
            result = await supabase
                .from('properties')
                .insert([propertyData])
                .select();
        }
       
        if (result.error) throw result.error;
       
        console.log('✅ Объект сохранён');
       
        // Закрываем форму
        closePropertyForm();
       
        // Перезагружаем список
        await loadProperties();
       
        // Показываем успех        showSuccess(editingPropertyId ? 'Объект обновлён' : 'Объект создан');
       
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        showError('Ошибка сохранения: ' + error.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalBtnText;
    }
}

async function uploadPhotosToGitHub(folderId) {
    const uploadedUrls = {
        main: null,
        gallery: [],
        plans: []
    };
   
    const timeout = getTimeout();
   
    // Главное фото
    if (uploadedPhotos.main) {
        console.log('📤 Загрузка главного фото...');
        const base64 = await fileToBase64(uploadedPhotos.main);
        const fileName = `main_${Date.now()}.jpg`;
        const path = `property-images/${folderId}/${fileName}`;
       
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
       
        try {
            const response = await fetch(`${config.supabaseUrl}/functions/v1/upload-to-github`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: path,
                    content: base64.split(',')[1]
                }),
                signal: controller.signal
            });
           
            clearTimeout(timeoutId);
           
            if (!response.ok) throw new Error('Ошибка загрузки главного фото');
           
            uploadedUrls.main = CDN_BASE + path;
            console.log('✅ Главное фото загружено:', uploadedUrls.main);
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Превышено время загрузки фото. Проверьте соединение.');            }
            throw error;
        }
    }
   
    // Галерея
    for (let i = 0; i < uploadedPhotos.gallery.length; i++) {
        const file = uploadedPhotos.gallery[i];
        console.log(`📤 Загрузка фото галереи ${i + 1}/${uploadedPhotos.gallery.length}...`);
       
        const base64 = await fileToBase64(file);
        const fileName = `gallery_${i}_${Date.now()}.jpg`;
        const path = `property-images/${folderId}/${fileName}`;
       
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
       
        try {
            const response = await fetch(`${config.supabaseUrl}/functions/v1/upload-to-github`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: path,
                    content: base64.split(',')[1]
                }),
                signal: controller.signal
            });
           
            clearTimeout(timeoutId);
           
            if (!response.ok) throw new Error(`Ошибка загрузки фото галереи ${i + 1}`);
           
            uploadedUrls.gallery.push(CDN_BASE + path);
            console.log(`✅ Фото галереи ${i + 1} загружено`);
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Превышено время загрузки фото. Проверьте соединение.');
            }
            throw error;
        }
    }
   
    // Планы
    for (let i = 0; i < uploadedPhotos.plans.length; i++) {
        const file = uploadedPhotos.plans[i];
        console.log(`📤 Загрузка плана ${i + 1}/${uploadedPhotos.plans.length}...`);
       
        const base64 = await fileToBase64(file);
        const fileName = `plan_${i}_${Date.now()}.jpg`;
        const path = `property-images/${folderId}/${fileName}`;       
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
       
        try {
            const response = await fetch(`${config.supabaseUrl}/functions/v1/upload-to-github`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: path,
                    content: base64.split(',')[1]
                }),
                signal: controller.signal
            });
           
            clearTimeout(timeoutId);
           
            if (!response.ok) throw new Error(`Ошибка загрузки плана ${i + 1}`);
           
            uploadedUrls.plans.push(CDN_BASE + path);
            console.log(`✅ План ${i + 1} загружен`);
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Превышено время загрузки фото. Проверьте соединение.');
            }
            throw error;
        }
    }
   
    return uploadedUrls;
}

// ============================================
// УДАЛЕНИЕ ФОТО (для существующих объектов)
// ============================================
async function removeCurrentMainPhoto() {
    if (!editingPropertyId) return;
   
    if (!confirm('Удалить главное фото?')) return;
   
    try {
        const { data: property } = await supabase
            .from('properties')
            .select('main_photo')
            .eq('id', editingPropertyId)
            .single();
       
        if (property && property.main_photo) {
            // Удаляем из GitHub
            const path = property.main_photo.replace(CDN_BASE, '');            await deleteFileFromGitHub(path);
        }
       
        // Обновляем в БД
        await supabase
            .from('properties')
            .update({ main_photo: null })
            .eq('id', editingPropertyId);
       
        showSuccess('Главное фото удалено');
        await editProperty(editingPropertyId); // Перезагружаем форму
       
    } catch (error) {
        console.error('Ошибка удаления:', error);
        showError('Ошибка удаления фото');
    }
}

async function removeCurrentGalleryPhoto(index) {
    if (!editingPropertyId) return;
   
    if (!confirm('Удалить это фото из галереи?')) return;
   
    try {
        const { data: property } = await supabase
            .from('properties')
            .select('gallery')
            .eq('id', editingPropertyId)
            .single();
       
        if (property && property.gallery && property.gallery[index]) {
            // Удаляем из GitHub
            const path = property.gallery[index].replace(CDN_BASE, '');
            await deleteFileFromGitHub(path);
           
            // Удаляем из массива
            property.gallery.splice(index, 1);
           
            // Обновляем в БД
            await supabase
                .from('properties')
                .update({ gallery: property.gallery })
                .eq('id', editingPropertyId);
        }
       
        showSuccess('Фото удалено из галереи');
        await editProperty(editingPropertyId); // Перезагружаем форму
       
    } catch (error) {
        console.error('Ошибка удаления:', error);        showError('Ошибка удаления фото');
    }
}

async function removeCurrentPlanPhoto(index) {
    if (!editingPropertyId) return;
   
    if (!confirm('Удалить этот план?')) return;
   
    try {
        const { data: property } = await supabase
            .from('properties')
            .select('plans')
            .eq('id', editingPropertyId)
            .single();
       
        if (property && property.plans && property.plans[index]) {
            // Удаляем из GitHub
            const path = property.plans[index].replace(CDN_BASE, '');
            await deleteFileFromGitHub(path);
           
            // Удаляем из массива
            property.plans.splice(index, 1);
           
            // Обновляем в БД
            await supabase
                .from('properties')
                .update({ plans: property.plans })
                .eq('id', editingPropertyId);
        }
       
        showSuccess('План удалён');
        await editProperty(editingPropertyId); // Перезагружаем форму
       
    } catch (error) {
        console.error('Ошибка удаления:', error);
        showError('Ошибка удаления фото');
    }
}

async function deleteFileFromGitHub(path) {
    try {
        // Получаем SHA файла
        const shaResponse = await fetch(`${config.supabaseUrl}/functions/v1/get-file-info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: path })
        });
       
        if (!shaResponse.ok) throw new Error('Не удалось получить информацию о файле');       
        const shaData = await shaResponse.json();
       
        // Удаляем файл
        const deleteResponse = await fetch(`${config.supabaseUrl}/functions/v1/delete-from-github`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: path,
                sha: shaData.sha
            })
        });
       
        if (!deleteResponse.ok) throw new Error('Ошибка удаления файла');
       
        console.log('✅ Файл удалён из GitHub:', path);
       
    } catch (error) {
        console.error('Ошибка удаления из GitHub:', error);
        throw error;
    }
}

// ============================================
// УДАЛЕНИЕ ОБЪЕКТА
// ============================================
async function deleteProperty(id) {
    if (!confirm('⚠️ Вы уверены, что хотите удалить этот объект?\n\nВсе фото будут удалены безвозвратно!')) {
        return;
    }
   
    showLoading('Удаление объекта...');
   
    try {
        // Получаем объект
        const { data: property, error: fetchError } = await supabase
            .from('properties')
            .select('*')
            .eq('id', id)
            .single();
       
        if (fetchError) throw fetchError;
        if (!property) throw new Error('Объект не найден');
       
        // Удаляем все фото из GitHub
        const photosToDelete = [];
        if (property.main_photo) photosToDelete.push(property.main_photo);
        if (property.gallery) photosToDelete.push(...property.gallery);
        if (property.plans) photosToDelete.push(...property.plans);
                console.log('🗑 Удаление фото...', photosToDelete.length);
       
        for (const photoUrl of photosToDelete) {
            try {
                const path = photoUrl.replace(CDN_BASE, '');
                await deleteFileFromGitHub(path);
            } catch (error) {
                console.warn('Не удалось удалить фото:', photoUrl, error);
                // Продолжаем удаление даже если одно фото не удалилось
            }
        }
       
        // Удаляем из БД
        const { error: deleteError } = await supabase
            .from('properties')
            .delete()
            .eq('id', id);
       
        if (deleteError) throw deleteError;
       
        console.log('✅ Объект удалён');
       
        // Перезагружаем список
        await loadProperties();
       
        hideLoading();
        showSuccess('Объект удалён');
       
    } catch (error) {
        console.error('Ошибка удаления:', error);
        hideLoading();
        showError('Ошибка удаления объекта: ' + error.message);
    }
}

// ============================================
// ИЗМЕНЕНИЕ СТАТУСА (скрыть/показать)
// ============================================
async function toggleProperty(id, currentStatus) {
    const newStatus = !currentStatus;
   
    showLoading(newStatus ? 'Публикация объекта...' : 'Скрытие объекта...');
   
    try {
        const { error } = await supabase
            .from('properties')
            .update({
                active: newStatus,
                updated_at: new Date().toISOString()
            })            .eq('id', id);
       
        if (error) throw error;
       
        console.log(`✅ Объект ${newStatus ? 'опубликован' : 'скрыт'}`);
       
        // Перезагружаем список
        await loadProperties();
       
        hideLoading();
        showSuccess(newStatus ? 'Объект опубликован' : 'Объект скрыт');
       
    } catch (error) {
        console.error('Ошибка изменения статуса:', error);
        hideLoading();
        showError('Ошибка изменения статуса');
    }
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function toCdnUrl(url) {
    if (!url) return '';
   
    // Если уже CDN URL
    if (url.startsWith('https://cdn.jsdelivr.net/gh/')) {
        return url;
    }
   
    // Если raw GitHub URL
    if (url.startsWith('https://raw.githubusercontent.com/')) {
        const parts = url.split('/');
        const user = parts[3];
        const repo = parts[4];
        const branch = parts[5];
        const path = parts.slice(6).join('/');
        return `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${path}`;
    }
   
    // Если относительный путь    if (url.startsWith('property-images/')) {
        return CDN_BASE + url;
    }
   
    return url;
}

function showLoading(message = 'Загрузка...') {
    const overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.7);
        z-index: 9999;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        gap: 20px;
    `;
   
    overlay.innerHTML = `
        <div style="width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <div style="color: white; font-size: 18px; font-weight: 600;">${message}</div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;
   
    document.body.appendChild(overlay);
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.remove();
    }
}

function showError(message) {
    tg.showAlert(message);
    console.error('❌', message);
}
function showSuccess(message) {
    tg.showPopup({
        title: '✅ Успешно',
        message: message,
        buttons: [{ type: 'ok' }]
    });
}

async function warmupDatabase() {
    console.log('🔥 Прогрев базы данных...');
    try {
        await supabase.from('properties').select('id').limit(1);
        console.log('✅ База прогрета!');
    } catch (error) {
        console.error('Ошибка прогрева БД:', error);
    }
}

// Глобальная переменная для config (нужна для uploadPhotosToGitHub)
let config = {};

// Инициализация config при загрузке
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const configResponse = await fetch('client-config.json');
        config = await configResponse.json();
    } catch (error) {
        console.error('Ошибка загрузки конфига:', error);
    }
});
