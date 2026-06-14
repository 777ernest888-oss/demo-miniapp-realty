// Глобальные переменные
let supabaseClient = null;
let currentAgentId = null;
let uploadedFiles = { main: null, gallery: [], floorPlans: [] };
let currentEditData = null;
let isSaving = false; // Флаг сохранения

// ========== 🔥 КОНФИГУРАЦИЯ ==========
const GITHUB_UPLOAD_FUNCTION = 'https://rqiutnpawsmqvmzewamc.supabase.co/functions/v1/upload-to-github';
const GITHUB_DELETE_FUNCTION = 'https://rqiutnpawsmqvmzewamc.supabase.co/functions/v1/delete-from-github';
const GITHUB_FILEINFO_FUNCTION = 'https://rqiutnpawsmqvmzewamc.supabase.co/functions/v1/get-file-info';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/777ernest888-oss/demo-miniapp-realty/main/';
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/777ernest888-oss/demo-miniapp-realty@main/';

// ========== 🔥 КОНВЕРТАЦИЯ URL В CDN ==========
function toCdnUrl(url) {
    if (!url) return url;
    return url.replace(GITHUB_RAW_BASE, CDN_BASE);
}

// ========== 🔥 ФУНКЦИЯ ПРОГРЕВА БАЗЫ ==========
async function warmupDatabase() {
    try {
        console.log('🔥 Прогреваю базу данных...');
        const { error } = await supabaseClient.from('properties').select('id').limit(1);
        if (error) {
            console.warn('⚠️ Ошибка прогрева:', error.message);
        } else {
            console.log('✅ База прогрета!');
        }
    } catch (error) {
        console.error('❌ Ошибка прогрева:', error);
    }
}

// ========== КЭШИРОВАНИЕ ==========
const CACHE_KEYS = {
    properties: 'admin_cache_properties',
    leads: 'admin_cache_leads',
    agentData: 'admin_cache_agent',
    settings: 'admin_cache_settings'
};

const CACHE_TTL = {
    properties: 5 * 60 * 1000,
    leads: 1 * 60 * 1000,
    agentData: 10 * 60 * 1000,
    settings: 10 * 60 * 1000
};
function getCachedData(key) {
    try {
        const cached = localStorage.getItem(key);
        if (!cached) return null;
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp > CACHE_TTL[key]) {
            localStorage.removeItem(key);
            return null;
        }
        return data;
    } catch (e) { return null; }
}

function setCachedData(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() })); } catch (e) {}
}

function invalidateCache(key) {
    try { localStorage.removeItem(key); } catch (e) {}
}

// ========== КАСТОМНОЕ МОДАЛЬНОЕ ОКНО ==========
function showConfirm(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const titleEl = document.getElementById('confirmTitle');
        const messageEl = document.getElementById('confirmMessage');
        const okBtn = document.getElementById('confirmOk');
        const cancelBtn = document.getElementById('confirmCancel');
      
        if (!modal || !titleEl || !messageEl || !okBtn || !cancelBtn) {
            resolve(confirm(message));
            return;
        }
      
        titleEl.textContent = title;
        messageEl.textContent = message;
        modal.classList.remove('hidden');
      
        const cleanup = () => {
            modal.classList.add('hidden');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
        };
      
        const onOk = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };
      
        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);    });
}

// ========== УТИЛИТЫ ==========

// Показывать спиннер
function showSpinner(message = 'Загрузка...') {
    const spinner = document.createElement('div');
    spinner.id = 'globalSpinner';
    spinner.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
    spinner.innerHTML = `
        <div style="background:white;padding:30px;border-radius:10px;text-align:center;">
            <div style="width:50px;height:50px;border:5px solid #f3f3f3;border-top:5px solid #3498db;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 15px;"></div>
            <p style="margin:0;color:#333;">${message}</p>
        </div>
    `;
    document.body.appendChild(spinner);
}

// Скрыть спиннер
function hideSpinner() {
    const spinner = document.getElementById('globalSpinner');
    if (spinner) spinner.remove();
}

// Показать уведомление
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `position:fixed;top:20px;right:20px;padding:15px 25px;background:${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'};color:white;border-radius:8px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,0.15);animation:slideIn 0.3s ease;`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Таймаут для fetch
async function fetchWithTimeout(url, options, timeout = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
   
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {        clearTimeout(timeoutId);
        throw error;
    }
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', async function() {
    try {
        const SUPABASE_URL = 'https://rqiutnpawsmqvmzewamc.supabase.co';
        const SUPABASE_ANON_KEY = 'sb_publishable_K1aNLiU_605Z7WccyWWPbQ_or-QVNbX';
      
        if (!window.supabase) {
            throw new Error('Supabase библиотека не загружена');
        }
      
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase инициализирован');
      
        // Прогрев базы (не блокирующий)
        warmupDatabase().catch(() => {});
      
        await loadProperties();
        await loadAgentData();
        await loadSettings();
    } catch (error) {
        console.error('❌ Ошибка инициализации:', error);
        const container = document.getElementById('propertiesList');
        if (container) {
            container.innerHTML = `<div class="alert alert-error">❌ Ошибка запуска: ${error.message}</div>`;
        }
    }
});

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    const btn = document.querySelector(`[onclick="switchTab('${tabName}')"]`);
    if (btn) btn.classList.add('active');
    const content = document.getElementById(`tab-${tabName}`);
    if (content) content.classList.add('active');

    if (tabName === 'properties') loadProperties();
    if (tabName === 'leads') loadLeads();
}

function showAlert(message, type = 'success') {
    const container = document.getElementById('alertContainer');
    if (!container) {
        showNotification(message, type);
        return;    }
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    container.appendChild(alert);
    setTimeout(() => alert.remove(), 3000);
}

// ========== 🔥 ЗАГРУЗКА В GITHUB ЧЕРЕЗ EDGE FUNCTION ==========
async function uploadToGitHub(file, path) {
    try {
        console.log('📤 Загрузка в GitHub:', path);
       
        const base64 = await fileToBase64(file);
       
        const response = await fetchWithTimeout(GITHUB_UPLOAD_FUNCTION, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseClient.supabaseKey}`,
                'apikey': supabaseClient.supabaseKey
            },
            body: JSON.stringify({
                file: base64,
                path: path,
                commitMessage: `Upload ${path} via admin panel`
            })
        }, 15000); // 15 секунд таймаут
       
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }
       
        const result = await response.json();
       
        if (!result.success) {
            throw new Error(result.error || 'Unknown error');
        }
       
        // Конвертируем в CDN URL
        const publicUrl = toCdnUrl(CDN_BASE + path);
       
        console.log('✅ Файл загружен в GitHub (CDN):', publicUrl);
        return publicUrl;
       
    } catch (error) {
        console.error('❌ Ошибка загрузки в GitHub:', error);
        throw new Error(`Не удалось загрузить фото: ${error.message}. Проверьте интернет-соединение.`);
    }}

// ========== 🔥 УДАЛЕНИЕ ИЗ GITHUB ЧЕРЕЗ EDGE FUNCTION ==========
async function deleteFromGitHub(paths) {
    try {
        console.log('🗑 Удаление из GitHub:', paths);
       
        for (const path of paths) {
            const sha = await getFileSha(path);
           
            if (!sha) {
                console.warn('⚠️ SHA не найден для:', path);
                continue;
            }
           
            const response = await fetchWithTimeout(GITHUB_DELETE_FUNCTION, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseClient.supabaseKey}`,
                    'apikey': supabaseClient.supabaseKey
                },
                body: JSON.stringify({
                    path: path,
                    sha: sha,
                    commitMessage: `Delete ${path} via admin panel`
                })
            }, 10000);
           
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
                console.warn('⚠️ Ошибка удаления:', path, errorData.error);
            }
        }
       
        console.log('✅ Файлы удалены из GitHub');
    } catch (error) {
        console.error('❌ Ошибка удаления из GitHub:', error);
        throw error;
    }
}

// ========== 🔥 ПОЛУЧЕНИЕ SHA ФАЙЛА ==========
async function getFileSha(path) {
    try {
        const response = await fetchWithTimeout(GITHUB_FILEINFO_FUNCTION, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseClient.supabaseKey}`,                'apikey': supabaseClient.supabaseKey
            },
            body: JSON.stringify({ path: path })
        }, 10000);
       
        if (!response.ok) return null;
       
        const result = await response.json();
        return result.sha || null;
    } catch (error) {
        console.error('❌ Ошибка получения SHA:', error);
        return null;
    }
}

// ========== 🔥 КОНВЕРТАЦИЯ ФАЙЛА В BASE64 ==========
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ========== ИЗВЛЕЧЕНИЕ ПУТИ ИЗ CDN URL ==========
function extractPathFromUrl(url) {
    if (!url) return null;
    // CDN URL: https://cdn.jsdelivr.net/gh/777ernest888-oss/demo-miniapp-realty@main/property-images/...
    const cdnMatch = url.match(/demo-miniapp-realty@main\/(.+)$/);
    if (cdnMatch) return cdnMatch[1];
   
    // Raw URL (на всякий случай)
    const rawMatch = url.match(/demo-miniapp-realty\/main\/(.+)$/);
    if (rawMatch) return rawMatch[1];
   
    return null;
}

// ========== ОБЪЕКТЫ ==========
async function loadProperties() {
    const container = document.getElementById('propertiesList');
    if (!supabaseClient) {
        container.innerHTML = '<div class="alert alert-error">Supabase не подключён</div>';
        return;
    }
        showSpinner('Загрузка объектов...');
   
    const cachedData = getCachedData(CACHE_KEYS.properties);
    if (cachedData && cachedData.length > 0) {
        renderPropertiesList(container, cachedData);
    }

    try {
        const { data, error } = await supabaseClient
            .from('properties')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        setCachedData(CACHE_KEYS.properties, data);
        if (!cachedData || JSON.stringify(cachedData) !== JSON.stringify(data)) {
            renderPropertiesList(container, data);
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки объектов:', error);
        if (!cachedData) {
            container.innerHTML = `<div class="alert alert-error">Ошибка: ${error.message}</div>`;
        }
    } finally {
        hideSpinner();
    }
}

function renderPropertiesList(container, data) {
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="alert alert-success">Объектов пока нет. Добавьте первый!</div>';
        return;
    }

    container.innerHTML = '';
    data.forEach(property => {
        const item = document.createElement('div');
        item.className = 'property-item';
        if (!property.active) item.classList.add('property-hidden');
      
        const toggleBtnText = property.active ? '👁 Скрыть' : '👁 Показать';
        const toggleBtnClass = property.active ? 'btn-secondary' : 'btn-success';
        const addressText = property.address || property.district || 'Адрес не указан';
      
        item.innerHTML = `
            <div class="property-info">
                <h3>${property.name || 'Без названия'} ${!property.active ? '<span class="hidden-badge">[СКРЫТ]</span>' : ''}</h3>
                <p>📍 ${addressText}</p>            </div>
            <div class="property-actions">
                <button class="btn ${toggleBtnClass} btn-small" onclick="togglePropertyStatus('${property.id}', ${property.active})">${toggleBtnText}</button>
                <button class="btn btn-primary btn-small" onclick="editProperty('${property.id}')">✏️ Редактировать</button>
                <button class="btn btn-danger btn-small" onclick="deleteProperty('${property.id}')">🗑 Удалить</button>
            </div>
        `;
        container.appendChild(item);
    });
}

async function togglePropertyStatus(id, currentStatus) {
    if (!id) return showAlert('❌ Ошибка: ID не определён', 'error');
    const newStatus = !currentStatus;
    const actionText = newStatus ? 'показать' : 'скрыть';

    const confirmed = await showConfirm('Подтверждение', `Вы уверены, что хотите ${actionText} этот объект?`);
    if (!confirmed) return;

    try {
        showSpinner('Обновление статуса...');
        const { error } = await supabaseClient.from('properties').update({ active: newStatus }).eq('id', id);
        if (error) throw error;
      
        invalidateCache(CACHE_KEYS.properties);
        showAlert(newStatus ? '✅ Объект снова виден!' : '👁 Объект скрыт');
        await loadProperties();
    } catch (error) {
        showAlert('❌ Ошибка: ' + error.message, 'error');
    } finally {
        hideSpinner();
    }
}

// ========== ФОРМА ДОБАВЛЕНИЯ ==========
const addForm = document.getElementById('addPropertyForm');
if (addForm) {
    // Добавляем кнопку "Отмена", если её нет
    let cancelBtn = document.getElementById('cancelAddBtn');
    if (!cancelBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancelAddBtn';
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.style.cssText = 'margin-left:10px;margin-top:10px;';
        cancelBtn.innerHTML = '❌ Отмена';
        cancelBtn.onclick = function() {
            if (isSaving) {
                showAlert('⚠️ Идёт сохранение, подождите...', 'warning');
                return;            }
            addForm.reset();
            uploadedFiles = { main: null, gallery: [], floorPlans: [] };
            document.getElementById('mainImagePreview').innerHTML = '';
            document.getElementById('galleryImagesPreview').innerHTML = '';
            document.getElementById('floorPlansPreview').innerHTML = '';
            switchTab('properties');
        };
        const submitBtn = addForm.querySelector('button[type="submit"]');
        if (submitBtn && !submitBtn.parentNode.querySelector('#cancelAddBtn')) {
            submitBtn.parentNode.insertBefore(cancelBtn, submitBtn.nextSibling);
        }
    }

    addForm.addEventListener('submit', async function(e) {
        e.preventDefault();
       
        if (isSaving) {
            showAlert('⚠️ Сохранение уже идёт, подождите...', 'warning');
            return;
        }
       
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
       
        try {
            isSaving = true;
            submitBtn.textContent = '💾 Сохранение...';
            submitBtn.disabled = true;
       
            const formData = new FormData(e.target);
            const propertyData = {};
          
            for (let [key, value] of formData.entries()) {
                if (key === 'active') {
                    propertyData[key] = document.getElementById('activeCheckbox').checked;
                } else if (['price_from', 'price_to', 'area_min', 'area_max', 'price_per_sqm', 'lat', 'lng'].includes(key)) {
                    propertyData[key] = value && value !== '' ? parseFloat(value) : null;
                } else {
                    propertyData[key] = value;
                }
            }
        
            propertyData.active = document.getElementById('activeCheckbox').checked;
            propertyData.id = 'spb-' + Date.now();
            propertyData.created_at = new Date().toISOString();
        
            if (uploadedFiles.main) {
                showAlert('📤 Загружаем главное фото в GitHub...');
                const path = `property-images/${propertyData.id}/main_${Date.now()}.jpg`;                propertyData.image_main = await uploadToGitHub(uploadedFiles.main, path);
            }
        
            if (uploadedFiles.gallery.length > 0) {
                showAlert('📤 Загружаем галерею в GitHub...');
                const urls = await Promise.all(uploadedFiles.gallery.map((f, i) => {
                    const path = `property-images/${propertyData.id}/gallery_${i}_${Date.now()}.jpg`;
                    return uploadToGitHub(f, path);
                }));
                propertyData.images_gallery = urls.join(',');
            }
        
            if (uploadedFiles.floorPlans.length > 0) {
                showAlert('📤 Загружаем планировки в GitHub...');
                const urls = await Promise.all(uploadedFiles.floorPlans.map((f, i) => {
                    const path = `property-images/${propertyData.id}/plan_${i}_${Date.now()}.jpg`;
                    return uploadToGitHub(f, path);
                }));
                propertyData.floor_plans_images = urls.join(',');
            }
        
            const { error } = await supabaseClient.from('properties').insert([propertyData]);
            if (error) throw error;
        
            invalidateCache(CACHE_KEYS.properties);
            showAlert('✅ Объект успешно добавлен!');
            e.target.reset();
            uploadedFiles = { main: null, gallery: [], floorPlans: [] };
            document.getElementById('mainImagePreview').innerHTML = '';
            document.getElementById('galleryImagesPreview').innerHTML = '';
            document.getElementById('floorPlansPreview').innerHTML = '';
        
            setTimeout(() => switchTab('properties'), 1000);
        } catch (error) {
            showAlert('❌ Ошибка: ' + error.message, 'error');
        } finally {
            isSaving = false;
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
}

function handleFileSelect(input, previewId) {
    const file = input.files[0];
    if (!file) return;
    uploadedFiles.main = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById(previewId).innerHTML = `<img src="${e.target.result}" style="max-width:200px;border-radius:8px;">`;    };
    reader.readAsDataURL(file);
}

function handleFilesSelect(input, previewId) {
    const files = Array.from(input.files);
    if (files.length === 0) return;
    if (previewId === 'galleryImagesPreview') uploadedFiles.gallery = files;
    else uploadedFiles.floorPlans = files;

    const preview = document.getElementById(previewId);
    preview.innerHTML = '';
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.style.cssText = 'width:100px;margin:5px;border-radius:8px;';
            preview.appendChild(img);
        };
        reader.readAsDataURL(file);
    });
}

// ========== РЕДАКТИРОВАНИЕ ==========
async function editProperty(id) {
    try {
        console.log('🔄 Загрузка объекта для редактирования:', id);
       
        showSpinner('Загрузка объекта...');
      
        const { data, error } = await supabaseClient.from('properties').select('*').eq('id', id).single();
        if (error) {
            console.error('❌ Ошибка загрузки объекта:', error);
            throw error;
        }
   
        currentEditData = data;
        switchTab('addProperty');
        const form = document.getElementById('addPropertyForm');
      
        for (let key in data) {
            const input = form.querySelector(`[name="${key}"]`);
            if (input) {
                if (input.type === 'checkbox') input.checked = data[key];
                else input.value = data[key] !== null && data[key] !== undefined ? data[key] : '';
            }
        }
    
        if (data.image_main) {            const cdnUrl = toCdnUrl(data.image_main);
            document.getElementById('mainImagePreview').innerHTML = `
                <div style="position:relative;display:inline-block;">
                    <img src="${cdnUrl}" style="max-width:200px;border-radius:8px;">
                    <button onclick="deleteSingleImage('${data.image_main}', 'main', 0)" style="position:absolute;top:5px;right:5px;background:#e74c3c;color:white;border:none;border-radius:50%;width:30px;height:30px;cursor:pointer;font-size:18px;">×</button>
                </div>`;
        } else {
            document.getElementById('mainImagePreview').innerHTML = '<p style="color:#999;">Главное фото не загружено</p>';
        }
   
        if (data.images_gallery) {
            const gallery = data.images_gallery.split(',');
            document.getElementById('galleryImagesPreview').innerHTML = gallery.map((url, i) => {
                const cdnUrl = toCdnUrl(url);
                return `
                <div style="position:relative;display:inline-block;margin:5px;">
                    <img src="${cdnUrl}" style="width:100px;border-radius:8px;">
                    <button onclick="deleteSingleImage('${url}', 'gallery', ${i})" style="position:absolute;top:2px;right:2px;background:#e74c3c;color:white;border:none;border-radius:50%;width:25px;height:25px;cursor:pointer;font-size:16px;">×</button>
                </div>`;
            }).join('');
        } else {
            document.getElementById('galleryImagesPreview').innerHTML = '<p style="color:#999;">Фото галереи пусто</p>';
        }
   
        if (data.floor_plans_images) {
            const plans = data.floor_plans_images.split(',');
            document.getElementById('floorPlansPreview').innerHTML = plans.map((url, i) => {
                const cdnUrl = toCdnUrl(url);
                return `
                <div style="position:relative;display:inline-block;margin:5px;">
                    <img src="${cdnUrl}" style="width:100px;border-radius:8px;">
                    <button onclick="deleteSingleImage('${url}', 'floorPlans', ${i})" style="position:absolute;top:2px;right:2px;background:#e74c3c;color:white;border:none;border-radius:50%;width:25px;height:25px;cursor:pointer;font-size:16px;">×</button>
                </div>`;
            }).join('');
        } else {
            document.getElementById('floorPlansPreview').innerHTML = '<p style="color:#999;">Планировки не загружены</p>';
        }
   
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.textContent = '💾 Обновить объект';
        submitBtn.disabled = false;
        submitBtn.onclick = async function(ev) {
            ev.preventDefault();
            await updateProperty(id, form);
        };
      
        let cancelBtn = document.getElementById('cancelEditBtn');
        if (!cancelBtn) {
            cancelBtn = document.createElement('button');
            cancelBtn.id = 'cancelEditBtn';            cancelBtn.type = 'button';
            cancelBtn.className = 'btn btn-secondary';
            cancelBtn.style.cssText = 'margin-left:10px;margin-top:10px;';
            cancelBtn.textContent = '❌ Отмена';
            cancelBtn.onclick = function() {
                if (isSaving) {
                    showAlert('⚠️ Идёт сохранение, подождите...', 'warning');
                    return;
                }
                uploadedFiles = { main: null, gallery: [], floorPlans: [] };
                switchTab('properties');
            };
            form.appendChild(cancelBtn);
        }
      
        console.log('✅ Форма редактирования открыта');
    } catch (error) {
        console.error('❌ Ошибка в editProperty:', error);
        showAlert('❌ Ошибка загрузки объекта: ' + error.message, 'error');
    } finally {
        hideSpinner();
    }
}

async function deleteSingleImage(url, type, index) {
    if (!confirm('Удалить это фото?')) return;
    try {
        showSpinner('Удаление фото...');
        const path = extractPathFromUrl(url);
        if (path) await deleteFromGitHub([path]);
      
        const { data: property } = await supabaseClient.from('properties').select('*').eq('id', currentEditData.id).single();
        let updateData = {};
        if (type === 'main') updateData.image_main = null;
        else if (type === 'gallery') {
            const g = property.images_gallery ? property.images_gallery.split(',') : [];
            g.splice(index, 1);
            updateData.images_gallery = g.join(',');
        } else {
            const p = property.floor_plans_images ? property.floor_plans_images.split(',') : [];
            p.splice(index, 1);
            updateData.floor_plans_images = p.join(',');
        }
      
        await supabaseClient.from('properties').update(updateData).eq('id', currentEditData.id);
        invalidateCache(CACHE_KEYS.properties);
        showAlert('✅ Фото удалено!');
        await editProperty(currentEditData.id);
    } catch (error) {
        showAlert('❌ Ошибка: ' + error.message, 'error');    } finally {
        hideSpinner();
    }
}

async function updateProperty(id, form) {
    if (isSaving) {
        showAlert('⚠️ Сохранение уже идёт, подождите...', 'warning');
        return;
    }
   
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
   
    try {
        isSaving = true;
        submitBtn.disabled = true;
        submitBtn.textContent = '💾 Сохранение...';
      
        console.log('🔄 Начало обновления объекта:', id);
      
        const formData = new FormData(form);
        const propertyData = {};
        for (let [key, value] of formData.entries()) {
            if (key === 'active') propertyData[key] = document.getElementById('activeCheckbox').checked;
            else if (['price_from', 'price_to', 'area_min', 'area_max', 'price_per_sqm', 'lat', 'lng'].includes(key)) {
                propertyData[key] = value && value !== '' ? parseFloat(value) : null;
            } else propertyData[key] = value;
        }
        propertyData.active = document.getElementById('activeCheckbox').checked;
   
        if (uploadedFiles.main) {
            console.log('📤 Загрузка нового главного фото в GitHub...');
            try {
                const path = `property-images/${id}/main_${Date.now()}.jpg`;
                propertyData.image_main = await uploadToGitHub(uploadedFiles.main, path);
                console.log('✅ Главное фото загружено:', propertyData.image_main);
            } catch (uploadError) {
                console.error('❌ Ошибка загрузки главного фото:', uploadError);
                throw new Error('Не удалось загрузить фото: ' + uploadError.message);
            }
        }
   
        if (uploadedFiles.gallery.length > 0) {
            console.log('📤 Загрузка фото галереи в GitHub...');
            const existing = currentEditData.images_gallery ? currentEditData.images_gallery.split(',') : [];
            try {
                const newUrls = await Promise.all(
                    uploadedFiles.gallery.map((f, i) => {
                        const path = `property-images/${id}/gallery_${Date.now()}_${i}.jpg`;                        return uploadToGitHub(f, path);
                    })
                );
                propertyData.images_gallery = [...existing, ...newUrls].join(',');
                console.log('✅ Галерея загружена:', newUrls.length, 'фото');
            } catch (uploadError) {
                console.error('❌ Ошибка загрузки галереи:', uploadError);
                throw new Error('Не удалось загрузить галерею: ' + uploadError.message);
            }
        }
   
        if (uploadedFiles.floorPlans.length > 0) {
            console.log('📤 Загрузка планировок в GitHub...');
            const existing = currentEditData.floor_plans_images ? currentEditData.floor_plans_images.split(',') : [];
            try {
                const newUrls = await Promise.all(
                    uploadedFiles.floorPlans.map((f, i) => {
                        const path = `property-images/${id}/plan_${Date.now()}_${i}.jpg`;
                        return uploadToGitHub(f, path);
                    })
                );
                propertyData.floor_plans_images = [...existing, ...newUrls].join(',');
                console.log('✅ Планировки загружены:', newUrls.length, 'фото');
            } catch (uploadError) {
                console.error('❌ Ошибка загрузки планировок:', uploadError);
                throw new Error('Не удалось загрузить планировки: ' + uploadError.message);
            }
        }
   
        console.log('🔄 Обновление объекта в БД...');
        const { data: updatedData, error } = await supabaseClient.from('properties').update(propertyData).eq('id', id).select();
      
        if (error) {
            console.error('❌ Ошибка обновления в БД:', error);
            throw error;
        }
      
        console.log('✅ Объект обновлён:', updatedData);
   
        invalidateCache(CACHE_KEYS.properties);
        showAlert('✅ Объект обновлён!');
      
        uploadedFiles = { main: null, gallery: [], floorPlans: [] };
      
        setTimeout(() => switchTab('properties'), 1000);
    } catch (error) {
        console.error('❌ Ошибка в updateProperty:', error);
        showAlert('❌ Ошибка: ' + error.message, 'error');
    } finally {
        isSaving = false;        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// ========== УДАЛЕНИЕ ==========
async function deleteProperty(id) {
    const confirmed = await showConfirm('Удаление объекта', 'Вы уверены? Все фото будут удалены из GitHub!');
    if (!confirmed) return;
  
    try {
        showSpinner('Удаление объекта...');
        const { data: property } = await supabaseClient.from('properties').select('image_main, images_gallery, floor_plans_images').eq('id', id).single();
      
        const pathsToDelete = [];
        if (property.image_main) { const p = extractPathFromUrl(property.image_main); if (p) pathsToDelete.push(p); }
        if (property.images_gallery) pathsToDelete.push(...property.images_gallery.split(',').map(extractPathFromUrl).filter(Boolean));
        if (property.floor_plans_images) pathsToDelete.push(...property.floor_plans_images.split(',').map(extractPathFromUrl).filter(Boolean));
      
        if (pathsToDelete.length > 0) {
            try { await deleteFromGitHub(pathsToDelete); } catch (e) { console.warn('⚠️ Ошибка удаления файлов:', e); }
        }
      
        const { error } = await supabaseClient.from('properties').delete().eq('id', id);
        if (error) throw error;
      
        invalidateCache(CACHE_KEYS.properties);
        showAlert('✅ Объект удалён!');
        await loadProperties();
    } catch (error) {
        showAlert('❌ Ошибка: ' + error.message, 'error');
    } finally {
        hideSpinner();
    }
}

// ========== АГЕНТ И НАСТРОЙКИ ==========
async function loadAgentData() {
    try {
        const cached = getCachedData(CACHE_KEYS.agentData);
        if (cached && cached.length) fillForm('agentForm', cached[0]);
      
        const { data, error } = await supabaseClient.from('agent_data').select('*').limit(1);
        if (error) return;
        if (data && data.length) {
            currentAgentId = data[0].id;
            setCachedData(CACHE_KEYS.agentData, data);
            fillForm('agentForm', data[0]);
        }
    } catch (e) { console.error(e); }}

function fillForm(formId, data) {
    const form = document.getElementById(formId);
    if (!form) return;
    for (let key in data) {
        const input = form.querySelector(`[name="${key}"]`);
        if (input) input.value = data[key] || '';
    }
}

document.getElementById('agentForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
        if (currentAgentId) await supabaseClient.from('agent_data').update(data).eq('id', currentAgentId);
        else { data.id = 'agent_' + Date.now(); await supabaseClient.from('agent_data').insert([data]); }
        invalidateCache(CACHE_KEYS.agentData);
        showAlert('✅ Данные сохранены!');
    } catch (error) { showAlert('❌ Ошибка: ' + error.message, 'error'); }
});

async function loadSettings() {
    try {
        const cached = getCachedData(CACHE_KEYS.settings);
        if (cached) fillSettingsForm(cached);
      
        const { data, error } = await supabaseClient.from('settings').select('*');
        if (error) return;
        setCachedData(CACHE_KEYS.settings, data);
        fillSettingsForm(data);
    } catch (e) { console.error(e); }
}

function fillSettingsForm(data) {
    const form = document.getElementById('settingsForm');
    if (!form) return;
    data.forEach(s => {
        const input = form.querySelector(`[name="${s.setting_key}"]`);
        if (input) input.value = s.setting_value || '';
    });
}

document.getElementById('settingsForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    try {
        for (let [key, value] of new FormData(e.target)) {
            const { data: existing } = await supabaseClient.from('settings').select('id').eq('setting_key', key).single();
            if (existing) await supabaseClient.from('settings').update({ setting_value: value }).eq('setting_key', key);
            else await supabaseClient.from('settings').insert([{ id: 'setting_' + Date.now(), setting_key: key, setting_value: value }]);        }
        invalidateCache(CACHE_KEYS.settings);
        showAlert('✅ Настройки сохранены!');
    } catch (error) { showAlert('❌ Ошибка', 'error'); }
});

// ========== ЗАЯВКИ ==========
async function loadLeads() {
    const container = document.getElementById('leadsList');
    const cached = getCachedData(CACHE_KEYS.leads);
    if (cached && cached.length) {
        document.getElementById('leadsCount').textContent = cached.length;
        renderLeadsTable(container, cached);
    } else {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#665;">⏳ Загрузка...</div>';
    }
  
    try {
        const { data, error } = await supabaseClient.from('leads').select('*').order('created_at', { ascending: false }).limit(50);
        if (error) throw error;
        setCachedData(CACHE_KEYS.leads, data);
        document.getElementById('leadsCount').textContent = data.length;
        if (!cached || JSON.stringify(cached) !== JSON.stringify(data)) renderLeadsTable(container, data);
    } catch (error) {
        console.error(error);
        if (!cached) container.innerHTML = `<div class="alert alert-error">Ошибка: ${error.message}</div>`;
    }
}

function renderLeadsTable(container, data) {
    if (!data || !data.length) { container.innerHTML = '<div class="alert alert-success">Заявок пока нет</div>'; return; }
    container.innerHTML = `<table class="leads-table"><thead><tr><th>Дата</th><th>Объект</th><th>Имя</th><th>Телефон</th><th>Telegram</th></tr></thead><tbody>${data.map(l => `<tr><td>${l.created_at ? new Date(l.created_at).toLocaleDateString('ru-RU') : '-'}</td><td>${l.title || '-'}</td><td>${l.leadname || '-'}</td><td>${l.leadphone || '-'}</td><td>${l.leadtelegram || '-'}</td></tr>`).join('')}</tbody></table>`;
}

// Добавляем CSS для анимаций
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
`;document.head.appendChild(style);
