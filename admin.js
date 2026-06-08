// Конфигурация Supabase
const SUPABASE_URL = 'https://rqiutnpawsmqvmzewamc.supabase.co'; // Замени на свой URL
const SUPABASE_ANON_KEY = 'sb_publishable_K1aNLiU_605Z7WccyWWPbQ_or-QVNbX'; // Замени на свой ключ
const YANDEX_STORAGE_BASE = 'https://storage.yandexcloud.net/property-images/';

// Инициализация Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Глобальные переменные
let currentAgentId = null;
let uploadedFiles = {
    main: null,
    gallery: [],
    floorPlans: []
};

// При загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    loadProperties();
    loadAgentData();
    loadSettings();
    loadLeads();
});

// Переключение вкладок
function switchTab(tabName) {
    // Убираем активный класс со всех кнопок и контента
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
   
    // Активируем нужную вкладку
    document.querySelector(`[onclick="switchTab('${tabName}')"]`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');
   
    // Если перешли на вкладку с объектами или заявками - перезагружаем данные
    if (tabName === 'properties') loadProperties();
    if (tabName === 'leads') loadLeads();
}

// Показ уведомления
function showAlert(message, type = 'success') {
    const container = document.getElementById('alertContainer');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    container.appendChild(alert);
   
    setTimeout(() => alert.remove(), 5000);
}
// Загрузка списка объектов
async function loadProperties() {
    const container = document.getElementById('propertiesList');
    container.innerHTML = '<div class="loading">Загрузка...</div>';
   
    const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false });
   
    if (error) {
        container.innerHTML = '<div class="alert alert-error">Ошибка загрузки: ' + error.message + '</div>';
        return;
    }
   
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="alert alert-success">Объектов пока нет. Добавьте первый!</div>';
        return;
    }
   
    container.innerHTML = '';
    data.forEach(property => {
        const item = document.createElement('div');
        item.className = 'property-item';
        item.innerHTML = `
            <div class="property-info">
                <h3>${property.name || 'Без названия'}</h3>
                <p>📍 ${property.district || ''} ${property.metro ? '| м. ' + property.metro : ''}</p>
                <p>💰 от ${formatPrice(property.price_from)} ₽ ${property.active ? '✅' : '❌'}</p>
            </div>
            <div class="property-actions">
                <button class="btn btn-primary btn-small" onclick="editProperty('${property.id}')">✏️ Редактировать</button>
                <button class="btn btn-danger btn-small" onclick="deleteProperty('${property.id}')">🗑 Удалить</button>
            </div>
        `;
        container.appendChild(item);
    });
}

// Форматирование цены
function formatPrice(price) {
    if (!price) return '0';
    return parseInt(price).toLocaleString('ru-RU');
}

// Добавление объекта
document.getElementById('addPropertyForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
   
    const formData = new FormData(e.target);    const propertyData = {};
   
    // Собираем данные из формы
    for (let [key, value] of formData.entries()) {
        if (key === 'active') {
            propertyData[key] = document.getElementById('activeCheckbox').checked;
        } else if (key === 'price_from' || key === 'price_to' || key === 'area_min' || key === 'area_max') {
            propertyData[key] = value ? parseFloat(value) : null;
        } else if (key === 'lat' || key === 'lng') {
            propertyData[key] = value ? parseFloat(value) : null;
        } else {
            propertyData[key] = value;
        }
    }
   
    // Генерируем ID
    propertyData.id = 'spb-' + Date.now();
    propertyData.created_at = new Date().toISOString();
    propertyData.active = propertyData.active !== undefined ? propertyData.active : true;
   
    // Загружаем фото в Яндекс Облако
    try {
        if (uploadedFiles.main) {
            const mainImageUrl = await uploadToYandex(uploadedFiles.main, propertyData.id + '/main.jpg');
            propertyData.image_main = mainImageUrl;
        }
       
        if (uploadedFiles.gallery.length > 0) {
            const galleryUrls = [];
            for (let i = 0; i < uploadedFiles.gallery.length; i++) {
                const url = await uploadToYandex(uploadedFiles.gallery[i], propertyData.id + '/gallery_' + i + '.jpg');
                galleryUrls.push(url);
            }
            propertyData.images_gallery = galleryUrls.join(',');
        }
       
        if (uploadedFiles.floorPlans.length > 0) {
            const plansUrls = [];
            for (let i = 0; i < uploadedFiles.floorPlans.length; i++) {
                const url = await uploadToYandex(uploadedFiles.floorPlans[i], propertyData.id + '/plan_' + i + '.jpg');
                plansUrls.push(url);
            }
            propertyData.floor_plans_images = plansUrls.join(',');
        }
       
        // Сохраняем в базу
        const { error } = await supabase.from('properties').insert([propertyData]);
       
        if (error) throw error;
                showAlert('✅ Объект успешно добавлен!');
        e.target.reset();
        uploadedFiles = { main: null, gallery: [], floorPlans: [] };
        document.getElementById('mainImagePreview').innerHTML = '';
        document.getElementById('galleryImagesPreview').innerHTML = '';
        document.getElementById('floorPlansPreview').innerHTML = '';
       
        // Переключаемся на вкладку со списком
        setTimeout(() => switchTab('properties'), 1000);
       
    } catch (error) {
        showAlert('❌ Ошибка сохранения: ' + error.message, 'error');
        console.error(error);
    }
});

// Загрузка файла в Яндекс Облако
async function uploadToYandex(file, path) {
    // Здесь нужна реализация загрузки через серверную функцию
    // Так как прямая загрузка в Yandex Cloud требует подписи запросов
    // Для простоты возвращаем временный URL
   
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', path);
   
    // TODO: Здесь должен быть вызов Edge Function для загрузки в Yandex Cloud
    // Пока возвращаем заглушку
    return YANDEX_STORAGE_BASE + path;
}

// Обработка выбора файла
function handleFileSelect(input, previewId) {
    const file = input.files[0];
    if (!file) return;
   
    uploadedFiles.main = file;
   
    const preview = document.getElementById(previewId);
    const reader = new FileReader();
    reader.onload = function(e) {
        preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
    };
    reader.readAsDataURL(file);
}

// Обработка выбора нескольких файлов
function handleFilesSelect(input, previewId) {
    const files = Array.from(input.files);
    if (files.length === 0) return;   
    const isGallery = previewId === 'galleryImagesPreview';
    const isFloorPlans = previewId === 'floorPlansPreview';
   
    if (isGallery) {
        uploadedFiles.gallery = files;
    } else if (isFloorPlans) {
        uploadedFiles.floorPlans = files;
    }
   
    const preview = document.getElementById(previewId);
    preview.innerHTML = '';
   
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.style.width = '100px';
            img.style.margin = '5px';
            img.style.borderRadius = '8px';
            preview.appendChild(img);
        };
        reader.readAsDataURL(file);
    });
}

// Редактирование объекта
async function editProperty(id) {
    const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('id', id)
        .single();
   
    if (error) {
        showAlert('❌ Ошибка загрузки объекта', 'error');
        return;
    }
   
    // Переключаемся на вкладку добавления
    switchTab('addProperty');
   
    // Заполняем форму данными
    const form = document.getElementById('addPropertyForm');
    for (let key in data) {
        const input = form.querySelector(`[name="${key}"]`);
        if (input) {
            if (input.type === 'checkbox') {
                input.checked = data[key];            } else {
                input.value = data[key] || '';
            }
        }
    }
   
    // Меняем текст кнопки
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.textContent = '💾 Обновить объект';
    submitBtn.onclick = function(e) {
        e.preventDefault();
        updateProperty(id, form);
    };
}

// Обновление объекта
async function updateProperty(id, form) {
    const formData = new FormData(form);
    const propertyData = {};
   
    for (let [key, value] of formData.entries()) {
        if (key === 'active') {
            propertyData[key] = document.getElementById('activeCheckbox').checked;
        } else if (key === 'price_from' || key === 'price_to' || key === 'area_min' || key === 'area_max') {
            propertyData[key] = value ? parseFloat(value) : null;
        } else if (key === 'lat' || key === 'lng') {
            propertyData[key] = value ? parseFloat(value) : null;
        } else {
            propertyData[key] = value;
        }
    }
   
    const { error } = await supabase
        .from('properties')
        .update(propertyData)
        .eq('id', id);
   
    if (error) {
        showAlert('❌ Ошибка обновления: ' + error.message, 'error');
        return;
    }
   
    showAlert('✅ Объект успешно обновлён!');
    setTimeout(() => switchTab('properties'), 1000);
}

// Удаление объекта
async function deleteProperty(id) {
    if (!confirm('Вы уверены, что хотите удалить этот объект?')) return;
        const { error } = await supabase
        .from('properties')
        .delete()
        .eq('id', id);
   
    if (error) {
        showAlert('❌ Ошибка удаления: ' + error.message, 'error');
        return;
    }
   
    showAlert('✅ Объект удалён!');
    loadProperties();
}

// Загрузка данных агента
async function loadAgentData() {
    const { data, error } = await supabase
        .from('agent_data')
        .select('*')
        .limit(1);
   
    if (error) {
        console.error('Ошибка загрузки данных агента:', error);
        return;
    }
   
    if (data && data.length > 0) {
        currentAgentId = data[0].id;
        const form = document.getElementById('agentForm');
       
        for (let key in data[0]) {
            const input = form.querySelector(`[name="${key}"]`);
            if (input) {
                input.value = data[0][key] || '';
            }
        }
    }
}

// Сохранение данных агента
document.getElementById('agentForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
   
    const formData = new FormData(e.target);
    const agentData = {};
   
    for (let [key, value] of formData.entries()) {
        agentData[key] = value;
    }
        try {
        if (currentAgentId) {
            // Обновляем существующую запись
            const { error } = await supabase
                .from('agent_data')
                .update(agentData)
                .eq('id', currentAgentId);
           
            if (error) throw error;
        } else {
            // Создаём новую запись
            agentData.id = crypto.randomUUID();
            const { error } = await supabase.from('agent_data').insert([agentData]);
           
            if (error) throw error;
        }
       
        showAlert('✅ Данные агента сохранены!');
    } catch (error) {
        showAlert('❌ Ошибка сохранения: ' + error.message, 'error');
    }
});

// Загрузка настроек
async function loadSettings() {
    const { data, error } = await supabase
        .from('settings')
        .select('*');
   
    if (error) {
        console.error('Ошибка загрузки настроек:', error);
        return;
    }
   
    const form = document.getElementById('settingsForm');
    data.forEach(setting => {
        const input = form.querySelector(`[name="${setting.setting_key}"]`);
        if (input) {
            input.value = setting.setting_value || '';
        }
    });
}

// Сохранение настроек
document.getElementById('settingsForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
   
    const formData = new FormData(e.target);
   
    try {        for (let [key, value] of formData.entries()) {
            // Проверяем, существует ли настройка
            const { data: existing } = await supabase
                .from('settings')
                .select('id')
                .eq('setting_key', key)
                .single();
           
            if (existing) {
                // Обновляем
                await supabase
                    .from('settings')
                    .update({ setting_value: value })
                    .eq('setting_key', key);
            } else {
                // Создаём
                await supabase.from('settings').insert([{
                    id: crypto.randomUUID(),
                    setting_key: key,
                    setting_value: value
                }]);
            }
        }
       
        showAlert('✅ Настройки сохранены!');
    } catch (error) {
        showAlert('❌ Ошибка сохранения настроек', 'error');
    }
});

// Загрузка заявок
async function loadLeads() {
    const container = document.getElementById('leadsList');
    container.innerHTML = '<div class="loading">Загрузка...</div>';
   
    const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });
   
    if (error) {
        container.innerHTML = '<div class="alert alert-error">Ошибка загрузки: ' + error.message + '</div>';
        return;
    }
   
    document.getElementById('leadsCount').textContent = data ? data.length : 0;
   
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="alert alert-success">Заявок пока нет</div>';
        return;    }
   
    const table = document.createElement('table');
    table.className = 'leads-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Дата</th>
                <th>Объект</th>
                <th>Имя</th>
                <th>Телефон</th>
                <th>Telegram</th>
            </tr>
        </thead>
        <tbody>
            ${data.map(lead => `
                <tr>
                    <td>${new Date(lead.created_at).toLocaleDateString('ru-RU')}</td>
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