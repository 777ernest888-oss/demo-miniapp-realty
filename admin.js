// Глобальные переменные
let supabaseClient = null;
let currentAgentId = null;
let uploadedFiles = {
    main: null,
    gallery: [],
    floorPlans: []
};
let uploadedUrls = {
    main: null,
    gallery: [],
    floorPlans: []
};
let currentEditData = null;

// ========== КЭШИРОВАНИЕ ==========
const CACHE_KEYS = {
    properties: 'admin_cache_properties',
    leads: 'admin_cache_leads',
    agentData: 'admin_cache_agent',
    settings: 'admin_cache_settings'
};

// TTL кэша (в миллисекундах)
const CACHE_TTL = {
    properties: 5 * 60 * 1000,    // 5 минут
    leads: 1 * 60 * 1000,         // 1 минута
    agentData: 10 * 60 * 1000,    // 10 минут
    settings: 10 * 60 * 1000      // 10 минут
};

function getCachedData(key) {
    try {
        const cached = localStorage.getItem(key);
        if (!cached) return null;
       
        const { data, timestamp } = JSON.parse(cached);
        const now = Date.now();
       
        if (now - timestamp > CACHE_TTL[key]) {
            // Кэш устарел
            localStorage.removeItem(key);
            return null;
        }
       
        return data;
    } catch (e) {
        console.warn('Ошибка чтения кэша:', e);
        return null;
    }}

function setCachedData(key, data) {
    try {
        const cache = {
            data: data,
            timestamp: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(cache));
    } catch (e) {
        console.warn('Ошибка записи кэша:', e);
    }
}

function invalidateCache(key) {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        console.warn('Ошибка очистки кэша:', e);
    }
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', async function() {
    const SUPABASE_URL = 'https://rqiutnpawsmqvmzewamc.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_K1aNLiU_605Z7WccyWWPbQ_or-QVNbX';
   
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }

    // Грузим данные последовательно
    await loadProperties();
    await loadAgentData();
    await loadSettings();
});

// Переключение вкладок
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.querySelector(`[onclick="switchTab('${tabName}')"]`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');

    if (tabName === 'properties') loadProperties();
    if (tabName === 'leads') loadLeads();
}

// Показ уведомления
function showAlert(message, type = 'success') {    const container = document.getElementById('alertContainer');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    container.appendChild(alert);
    setTimeout(() => alert.remove(), 3000);
}

// Форматирование цены
function formatPrice(price) {
    if (!price) return '0';
    return parseInt(price).toLocaleString('ru-RU');
}

// Загрузка файла в Яндекс Облако через Edge Function
async function uploadToYandex(file, path) {
    const SUPABASE_URL = 'https://rqiutnpawsmqvmzewamc.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_K1aNLiU_605Z7WccyWWPbQ_or-QVNbX';
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', path);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/upload-to-yandex`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY
        },
        body: formData
    });

    const result = await response.json();

    if (!result.success) {
        throw new Error(result.error || 'Failed to upload');
    }

    return result.url;
}

// Удаление файлов из Яндекс Облака
async function deleteFromYandex(paths) {
    const SUPABASE_URL = 'https://rqiutnpawsmqvmzewamc.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_K1aNLiU_605Z7WccyWWPbQ_or-QVNbX';
    const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-from-yandex`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'        },
        body: JSON.stringify({ paths: paths })
    });

    const result = await response.json();

    if (!result.success) {
        throw new Error(result.error || 'Failed to delete');
    }
}

// Извлечение пути из URL Яндекс Облака
function extractPathFromUrl(url) {
    if (!url) return null;
    const match = url.match(/property-images\/(.+)$/);
    return match ? match[1] : null;
}

// Удаление отдельного изображения
async function deleteSingleImage(url, type, index) {
    if (!confirm('Удалить это фото?')) return;
    try {
        const path = extractPathFromUrl(url);
        if (!path) throw new Error('Не удалось получить путь к файлу');
      
        await deleteFromYandex([path]);
      
        const { data: property } = await supabaseClient
            .from('properties')
            .select('*')
            .eq('id', currentEditData.id)
            .single();
      
        if (!property) throw new Error('Объект не найден');
      
        let updateData = {};
      
        if (type === 'main') {
            updateData.image_main = null;
        } else if (type === 'gallery') {
            const gallery = property.images_gallery ? property.images_gallery.split(',') : [];
            gallery.splice(index, 1);
            updateData.images_gallery = gallery.join(',');
        } else if (type === 'floorPlans') {
            const plans = property.floor_plans_images ? property.floor_plans_images.split(',') : [];
            plans.splice(index, 1);
            updateData.floor_plans_images = plans.join(',');
        }
      
        const { error } = await supabaseClient            .from('properties')
            .update(updateData)
            .eq('id', currentEditData.id);
      
        if (error) throw error;
      
        // Инвалидируем кэш
        invalidateCache(CACHE_KEYS.properties);
      
        showAlert('✅ Фото удалено!');
        await editProperty(currentEditData.id);
      
    } catch (error) {
        showAlert('❌ Ошибка: ' + error.message, 'error');
    }
}

// Переключение статуса объекта (скрыть/показать)
async function togglePropertyStatus(id, currentStatus) {
    if (!id) {
        showAlert('❌ Ошибка: ID объекта не определён', 'error');
        return;
    }
    const newStatus = !currentStatus;
    const actionText = newStatus ? 'показать' : 'скрыть';

    if (!confirm(`Вы уверены, что хотите ${actionText} этот объект?`)) return;

    try {
        console.log('🔄 Обновляем объект:', id, 'новый статус:', newStatus);
      
        const { error } = await supabaseClient
            .from('properties')
            .update({ active: newStatus })
            .eq('id', id);
      
        if (error) {
            console.error('❌ Ошибка обновления:', error);
            throw error;
        }
      
        console.log('✅ Статус обновлён!');
      
        // Инвалидируем кэш
        invalidateCache(CACHE_KEYS.properties);
      
        showAlert(newStatus ? '✅ Объект снова виден в каталоге!' : '👁 Объект скрыт из каталога');
        loadProperties();
    } catch (error) {
        console.error('Ошибка при переключении статуса:', error);        showAlert('❌ Ошибка: ' + error.message, 'error');
    }
}

// ========== ОБЪЕКТЫ (С КЭШИРОВАНИЕМ) ==========
async function loadProperties() {
    const container = document.getElementById('propertiesList');
   
    if (!supabaseClient) {
        container.innerHTML = '<div class="alert alert-error">Supabase не подключён</div>';
        return;
    }

    // 1. Сначала показываем кэш (если есть) — мгновенно!
    const cachedData = getCachedData(CACHE_KEYS.properties);
    if (cachedData && cachedData.length > 0) {
        console.log(' Показываем объекты из кэша');
        renderPropertiesList(container, cachedData);
    } else {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#666;">⏳ Загрузка...</div>';
    }

    // 2. Делаем запрос к Supabase (в фоне)
    try {
        const { data, error } = await supabaseClient
            .from('properties')
            .select('id, name, district, metro, price_from, active')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('❌ Ошибка загрузки объектов:', error);
            if (!cachedData) {
                container.innerHTML = `<div class="alert alert-error">Ошибка: ${error.message}</div>`;
            }
            return;
        }

        // 3. Сохраняем в кэш
        setCachedData(CACHE_KEYS.properties, data);

        // 4. Если данные изменились — перерисовываем
        if (!cachedData || JSON.stringify(cachedData) !== JSON.stringify(data)) {
            console.log(' Обновляем список объектов из БД');
            renderPropertiesList(container, data);
        }
    } catch (error) {
        console.error(' Критическая ошибка:', error);
        if (!cachedData) {
            container.innerHTML = `<div class="alert alert-error">Ошибка загрузки: ${error.message}</div>`;        }
    }
}

// Вынесенная функция отрисовки списка объектов
function renderPropertiesList(container, data) {
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="alert alert-success">Объектов пока нет. Добавьте первый!</div>';
        return;
    }

    container.innerHTML = '';
    data.forEach(property => {
        const item = document.createElement('div');
        item.className = 'property-item';
      
        if (!property.active) {
            item.classList.add('property-hidden');
        }
      
        const toggleBtnText = property.active ? '👁 Скрыть' : '👁 Показать';
        const toggleBtnClass = property.active ? 'btn-secondary' : 'btn-success';
      
        item.innerHTML = `
            <div class="property-info">
                <h3>${property.name || 'Без названия'} ${!property.active ? '<span class="hidden-badge">[СКРЫТ]</span>' : ''}</h3>
                <p>📍 ${property.district || ''} ${property.metro ? '| м. ' + property.metro : ''}</p>
                <p>💰 от ${formatPrice(property.price_from)} ₽ ${property.active ? '✅' : '❌'}</p>
            </div>
            <div class="property-actions">
                <button class="btn ${toggleBtnClass} btn-small" onclick="togglePropertyStatus('${property.id}', ${property.active})">${toggleBtnText}</button>
                <button class="btn btn-primary btn-small" onclick="editProperty('${property.id}')">✏️ Редактировать</button>
                <button class="btn btn-danger btn-small" onclick="deleteProperty('${property.id}')"> Удалить</button>
            </div>
        `;
        container.appendChild(item);
    });
}

// Добавление объекта
document.getElementById('addPropertyForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = '💾 Сохранение...';
    submitBtn.disabled = true;

    try {
        const formData = new FormData(e.target);
        const propertyData = {};      
        for (let [key, value] of formData.entries()) {
            if (key === 'active') {
                propertyData[key] = document.getElementById('activeCheckbox').checked;
            } else if (['price_from', 'price_to', 'area_min', 'area_max', 'price_per_sqm'].includes(key)) {
                propertyData[key] = value ? parseFloat(value) : null;
            } else if (['lat', 'lng'].includes(key)) {
                propertyData[key] = value ? parseFloat(value) : null;
            } else {
                propertyData[key] = value;
            }
        }
      
        propertyData.active = document.getElementById('activeCheckbox').checked;
        propertyData.id = 'spb-' + Date.now();
        propertyData.created_at = new Date().toISOString();
      
        if (uploadedFiles.main) {
            showAlert('📤 Загружаем главное фото...');
            const mainPath = `${propertyData.id}/main_${Date.now()}.jpg`;
            propertyData.image_main = await uploadToYandex(uploadedFiles.main, mainPath);
        }
      
        if (uploadedFiles.gallery.length > 0) {
            showAlert('📤 Загружаем галерею...');
            const galleryUrls = [];
            for (let i = 0; i < uploadedFiles.gallery.length; i++) {
                const path = `${propertyData.id}/gallery_${i}_${Date.now()}.jpg`;
                const url = await uploadToYandex(uploadedFiles.gallery[i], path);
                galleryUrls.push(url);
            }
            propertyData.images_gallery = galleryUrls.join(',');
        }
      
        if (uploadedFiles.floorPlans.length > 0) {
            showAlert('📤 Загружаем планировки...');
            const plansUrls = [];
            for (let i = 0; i < uploadedFiles.floorPlans.length; i++) {
                const path = `${propertyData.id}/plan_${i}_${Date.now()}.jpg`;
                const url = await uploadToYandex(uploadedFiles.floorPlans[i], path);
                plansUrls.push(url);
            }
            propertyData.floor_plans_images = plansUrls.join(',');
        }
      
        const { error } = await supabaseClient.from('properties').insert([propertyData]);
      
        if (error) throw error;
      
        // Инвалидируем кэш        invalidateCache(CACHE_KEYS.properties);
      
        showAlert('✅ Объект успешно добавлен!');
        e.target.reset();
        uploadedFiles = { main: null, gallery: [], floorPlans: [] };
        uploadedUrls = { main: null, gallery: [], floorPlans: [] };
        document.getElementById('mainImagePreview').innerHTML = '';
        document.getElementById('galleryImagesPreview').innerHTML = '';
        document.getElementById('floorPlansPreview').innerHTML = '';
      
        setTimeout(() => switchTab('properties'), 1000);
    } catch (error) {
        showAlert('❌ Ошибка: ' + error.message, 'error');
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});

// Обработка выбора файла
function handleFileSelect(input, previewId) {
    const file = input.files[0];
    if (!file) return;
    uploadedFiles.main = file;

    const preview = document.getElementById(previewId);
    const reader = new FileReader();
    reader.onload = function(e) {
        preview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-width:200px;border-radius:8px;">`;
    };
    reader.readAsDataURL(file);
}

function handleFilesSelect(input, previewId) {
    const files = Array.from(input.files);
    if (files.length === 0) return;
    const isGallery = previewId === 'galleryImagesPreview';
    const isFloorPlans = previewId === 'floorPlansPreview';
    if (isGallery) uploadedFiles.gallery = files;
    else if (isFloorPlans) uploadedFiles.floorPlans = files;

    const preview = document.getElementById(previewId);
    preview.innerHTML = '';

    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.style.width = '100px';
            img.style.margin = '5px';            img.style.borderRadius = '8px';
            preview.appendChild(img);
        };
        reader.readAsDataURL(file);
    });
}

// Редактирование объекта
async function editProperty(id) {
    const { data, error } = await supabaseClient
        .from('properties')
        .select('*')
        .eq('id', id)
        .single();
   
    if (error) {
        showAlert('❌ Ошибка: ' + error.message, 'error');
        return;
    }

    currentEditData = data;
    switchTab('addProperty');

    const form = document.getElementById('addPropertyForm');
    for (let key in data) {
        const input = form.querySelector(`[name="${key}"]`);
        if (input) {
            if (input.type === 'checkbox') {
                input.checked = data[key];
            } else {
                input.value = data[key] !== null && data[key] !== undefined ? data[key] : '';
            }
        }
    }
  
    if (data.image_main) {
        document.getElementById('mainImagePreview').innerHTML = `
            <div style="position:relative;display:inline-block;">
                <img src="${data.image_main}" style="max-width:200px;border-radius:8px;">
                <button onclick="deleteSingleImage('${data.image_main}', 'main', 0)"
                    style="position:absolute;top:5px;right:5px;background:#e74c3c;color:white;border:none;border-radius:50%;width:30px;height:30px;cursor:pointer;font-size:18px;line-height:1;">×</button>
            </div>
        `;
    }

    if (data.images_gallery) {
        const gallery = data.images_gallery.split(',');
        let galleryHTML = '';
        gallery.forEach((url, index) => {
            galleryHTML += `                <div style="position:relative;display:inline-block;margin:5px;">
                    <img src="${url}" style="width:100px;border-radius:8px;">
                    <button onclick="deleteSingleImage('${url}', 'gallery', ${index})"
                        style="position:absolute;top:2px;right:2px;background:#e74c3c;color:white;border:none;border-radius:50%;width:25px;height:25px;cursor:pointer;font-size:16px;line-height:1;">×</button>
                </div>
            `;
        });
        document.getElementById('galleryImagesPreview').innerHTML = galleryHTML;
    }

    if (data.floor_plans_images) {
        const plans = data.floor_plans_images.split(',');
        let plansHTML = '';
        plans.forEach((url, index) => {
            plansHTML += `
                <div style="position:relative;display:inline-block;margin:5px;">
                    <img src="${url}" style="width:100px;border-radius:8px;">
                    <button onclick="deleteSingleImage('${url}', 'floorPlans', ${index})"
                        style="position:absolute;top:2px;right:2px;background:#e74c3c;color:white;border:none;border-radius:50%;width:25px;height:25px;cursor:pointer;font-size:16px;line-height:1;">×</button>
                </div>
            `;
        });
        document.getElementById('floorPlansPreview').innerHTML = plansHTML;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.textContent = '💾 Обновить объект';
    submitBtn.onclick = async function(ev) {
        ev.preventDefault();
        await updateProperty(id, form);
    };
}

// Обновление объекта
async function updateProperty(id, form) {
    const formData = new FormData(form);
    const propertyData = {};
    for (let [key, value] of formData.entries()) {
        if (key === 'active') {
            propertyData[key] = document.getElementById('activeCheckbox').checked;
        } else if (['price_from', 'price_to', 'area_min', 'area_max', 'price_per_sqm'].includes(key)) {
            propertyData[key] = value ? parseFloat(value) : null;
        } else if (['lat', 'lng'].includes(key)) {
            propertyData[key] = value ? parseFloat(value) : null;
        } else {
            propertyData[key] = value;
        }
    }

    propertyData.active = document.getElementById('activeCheckbox').checked;
    if (uploadedFiles.main) {
        showAlert('📤 Загружаем новое главное фото...');
        const mainPath = `${id}/main_${Date.now()}.jpg`;
        propertyData.image_main = await uploadToYandex(uploadedFiles.main, mainPath);
    }

    if (uploadedFiles.gallery.length > 0) {
        showAlert('📤 Добавляем фото в галерею...');
        const existingGallery = currentEditData.images_gallery ? currentEditData.images_gallery.split(',') : [];
        for (let i = 0; i < uploadedFiles.gallery.length; i++) {
            const path = `${id}/gallery_${Date.now()}_${i}.jpg`;
            const url = await uploadToYandex(uploadedFiles.gallery[i], path);
            existingGallery.push(url);
        }
        propertyData.images_gallery = existingGallery.join(',');
    }

    if (uploadedFiles.floorPlans.length > 0) {
        showAlert('📤 Добавляем планировки...');
        const existingPlans = currentEditData.floor_plans_images ? currentEditData.floor_plans_images.split(',') : [];
        for (let i = 0; i < uploadedFiles.floorPlans.length; i++) {
            const path = `${id}/plan_${Date.now()}_${i}.jpg`;
            const url = await uploadToYandex(uploadedFiles.floorPlans[i], path);
            existingPlans.push(url);
        }
        propertyData.floor_plans_images = existingPlans.join(',');
    }

    console.log('🔄 Обновляем объект:', id, 'данные:', propertyData);

    const { error } = await supabaseClient
        .from('properties')
        .update(propertyData)
        .eq('id', id);

    if (error) {
        console.error(' Ошибка обновления:', error);
        showAlert(' Ошибка: ' + error.message, 'error');
        return;
    }

    // Инвалидируем кэш
    invalidateCache(CACHE_KEYS.properties);

    showAlert('✅ Объект обновлён!');
    setTimeout(() => switchTab('properties'), 1000);
}

// Удаление объекта (с картинками!)
async function deleteProperty(id) {
    if (!confirm('Вы уверены, что хотите удалить этот объект? Все фото будут удалены из облака!')) return;
    try {
        const { data: property, error: fetchError } = await supabaseClient
            .from('properties')
            .select('image_main, images_gallery, floor_plans_images')
            .eq('id', id)
            .single();
      
        if (fetchError) throw fetchError;
      
        const pathsToDelete = [];
      
        if (property.image_main) {
            const path = extractPathFromUrl(property.image_main);
            if (path) pathsToDelete.push(path);
        }
      
        if (property.images_gallery) {
            const galleryPaths = property.images_gallery.split(',').map(extractPathFromUrl).filter(Boolean);
            pathsToDelete.push(...galleryPaths);
        }
      
        if (property.floor_plans_images) {
            const plansPaths = property.floor_plans_images.split(',').map(extractPathFromUrl).filter(Boolean);
            pathsToDelete.push(...plansPaths);
        }
      
        if (pathsToDelete.length > 0) {
            showAlert('🗑 Удаляем фото из облака...');
            try {
                await deleteFromYandex(pathsToDelete);
            } catch (uploadError) {
                console.warn('⚠️ Не удалось удалить файлы из облака:', uploadError.message);
            }
        }
      
        const { error } = await supabaseClient
            .from('properties')
            .delete()
            .eq('id', id);
      
        if (error) throw error;
      
        // Инвалидируем кэш
        invalidateCache(CACHE_KEYS.properties);
      
        showAlert('✅ Объект и все его фото удалены!');
        loadProperties();
    } catch (error) {        showAlert('❌ Ошибка при удалении: ' + error.message, 'error');
    }
}

// ========== ДАННЫЕ АГЕНТА (С КЭШИРОВАНИЕМ) ==========
async function loadAgentData() {
    try {
        // Сначала показываем кэш
        const cachedData = getCachedData(CACHE_KEYS.agentData);
        if (cachedData && cachedData.length > 0) {
            console.log('⚡ Показываем данные агента из кэша');
            currentAgentId = cachedData[0].id;
            const form = document.getElementById('agentForm');
            for (let key in cachedData[0]) {
                const input = form.querySelector(`[name="${key}"]`);
                if (input) input.value = cachedData[0][key] || '';
            }
        }

        // Делаем запрос к БД
        const { data, error } = await supabaseClient
            .from('agent_data')
            .select('*')
            .limit(1);
       
        if (error) {
            console.error('Ошибка загрузки данных агента:', error);
            return;
        }

        if (data && data.length > 0) {
            currentAgentId = data[0].id;
            setCachedData(CACHE_KEYS.agentData, data);
           
            const form = document.getElementById('agentForm');
            for (let key in data[0]) {
                const input = form.querySelector(`[name="${key}"]`);
                if (input) input.value = data[0][key] || '';
            }
        }
    } catch (error) {
        console.error('Критическая ошибка loadAgentData:', error);
    }
}

document.getElementById('agentForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const agentData = {};
    for (let [key, value] of formData.entries()) {        agentData[key] = value;
    }

    try {
        if (currentAgentId) {
            await supabaseClient
                .from('agent_data')
                .update(agentData)
                .eq('id', currentAgentId);
        } else {
            agentData.id = crypto.randomUUID();
            await supabaseClient.from('agent_data').insert([agentData]);
        }
       
        // Инвалидируем кэш
        invalidateCache(CACHE_KEYS.agentData);
       
        showAlert('✅ Данные агента сохранены!');
    } catch (error) {
        showAlert('❌ Ошибка: ' + error.message, 'error');
    }
});

// ========== НАСТРОЙКИ (С КЭШИРОВАНИЕМ) ==========
async function loadSettings() {
    try {
        // Сначала показываем кэш
        const cachedData = getCachedData(CACHE_KEYS.settings);
        if (cachedData && cachedData.length > 0) {
            console.log('⚡ Показываем настройки из кэша');
            const form = document.getElementById('settingsForm');
            cachedData.forEach(setting => {
                const input = form.querySelector(`[name="${setting.setting_key}"]`);
                if (input) input.value = setting.setting_value || '';
            });
        }

        // Делаем запрос к БД
        const { data, error } = await supabaseClient.from('settings').select('*');
        if (error) {
            console.error('Ошибка загрузки настроек:', error);
            return;
        }
       
        setCachedData(CACHE_KEYS.settings, data);
       
        const form = document.getElementById('settingsForm');
        data.forEach(setting => {
            const input = form.querySelector(`[name="${setting.setting_key}"]`);
            if (input) input.value = setting.setting_value || '';        });
    } catch (error) {
        console.error('Критическая ошибка loadSettings:', error);
    }
}

document.getElementById('settingsForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const formData = new FormData(e.target);

    try {
        for (let [key, value] of formData.entries()) {
            const { data: existing } = await supabaseClient
                .from('settings')
                .select('id')
                .eq('setting_key', key)
                .single();
          
            if (existing) {
                await supabaseClient.from('settings').update({ setting_value: value }).eq('setting_key', key);
            } else {
                await supabaseClient.from('settings').insert([{
                    id: crypto.randomUUID(),
                    setting_key: key,
                    setting_value: value
                }]);
            }
        }
       
        // Инвалидируем кэш
        invalidateCache(CACHE_KEYS.settings);
       
        showAlert('✅ Настройки сохранены!');
    } catch (error) {
        showAlert('❌ Ошибка сохранения настроек', 'error');
    }
});

// ========== ЗАЯВКИ (С КЭШИРОВАНИЕМ) ==========
async function loadLeads() {
    const container = document.getElementById('leadsList');
   
    // Сначала показываем кэш
    const cachedData = getCachedData(CACHE_KEYS.leads);
    if (cachedData && cachedData.length > 0) {
        console.log('⚡ Показываем заявки из кэша');
        document.getElementById('leadsCount').textContent = cachedData.length;
        renderLeadsTable(container, cachedData);
    } else {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#666;">⏳ Загрузка...</div>';    }
   
    try {
        const { data, error } = await supabaseClient
            .from('leads')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('❌ Ошибка загрузки заявок:', error);
            if (!cachedData) {
                container.innerHTML = `<div class="alert alert-error">Ошибка: ${error.message}</div>`;
            }
            return;
        }

        // Сохраняем в кэш
        setCachedData(CACHE_KEYS.leads, data);
        document.getElementById('leadsCount').textContent = data.length;

        // Перерисовываем если данные изменились
        if (!cachedData || JSON.stringify(cachedData) !== JSON.stringify(data)) {
            console.log('🔄 Обновляем заявки из БД');
            renderLeadsTable(container, data);
        }
    } catch (error) {
        console.error('❌ Критическая ошибка loadLeads:', error);
        if (!cachedData) {
            container.innerHTML = `<div class="alert alert-error">Ошибка загрузки заявок: ${error.message}. Попробуйте обновить страницу.</div>`;
        }
    }
}

// Вынесенная функция отрисовки таблицы заявок
function renderLeadsTable(container, data) {
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="alert alert-success">Заявок пока нет</div>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'leads-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Дата</th>
                <th>Объект</th>
                <th>Имя</th>
                <th>Телефон</th>                <th>Telegram</th>
            </tr>
        </thead>
        <tbody>
            ${data.map(lead => `
                <tr>
                    <td>${lead.created_at ? new Date(lead.created_at).toLocaleDateString('ru-RU') : '-'}</td>
                    <td>${lead.title || '-'}</td>
                    <td>${lead.leadname || '-'}</td>
                    <td>${lead.leadphone || '-'}</td>
                    <td>${lead.leadtelegram || '-'}</td>
                </tr>
            `).join('')}
        </tbody>
    `;

    container.innerHTML = '';
    container.appendChild(table);
}
