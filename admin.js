// Глобальные переменные
let supabaseClient = null;
let currentAgentId = null;
let uploadedFiles = {
    main: null,
    gallery: [],
    floorPlans: []
};

// При загрузке страницы — инициализируем Supabase
document.addEventListener('DOMContentLoaded', async function() {
    const SUPABASE_URL = 'https://rqiutnpawsmqvmzewamc.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_K1aNLiU_605Z7WccyWWPbQ_or-QVNbX';
   
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
   
    // Загружаем всё параллельно (быстрее)
    await Promise.all([
        loadProperties(),
        loadAgentData(),
        loadSettings(),
        loadLeads()
    ]);
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
function showAlert(message, type = 'success') {
    const container = document.getElementById('alertContainer');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    container.appendChild(alert);
    setTimeout(() => alert.remove(), 3000);
}

// Форматирование ценыfunction formatPrice(price) {
    if (!price) return '0';
    return parseInt(price).toLocaleString('ru-RU');
}

// ========== ОБЪЕКТЫ ==========

async function loadProperties() {
    const container = document.getElementById('propertiesList');
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#666;">⏳ Загрузка...</div>';
   
    if (!supabaseClient) {
        container.innerHTML = '<div class="alert alert-error">Supabase не подключён</div>';
        return;
    }
   
    const { data, error } = await supabaseClient
        .from('properties')
        .select('id, name, district, metro, price_from, active')
        .order('created_at', { ascending: false });
   
    if (error) {
        container.innerHTML = `<div class="alert alert-error">Ошибка: ${error.message}</div>`;
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
// Добавление объекта
document.getElementById('addPropertyForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
   
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
   
    propertyData.id = 'spb-' + Date.now();
    propertyData.created_at = new Date().toISOString();
    if (propertyData.active === undefined) propertyData.active = true;
   
    try {
        const { error } = await supabaseClient.from('properties').insert([propertyData]);
       
        if (error) throw error;
       
        showAlert('✅ Объект успешно добавлен!');
        e.target.reset();
        uploadedFiles = { main: null, gallery: [], floorPlans: [] };
        document.getElementById('mainImagePreview').innerHTML = '';
        document.getElementById('galleryImagesPreview').innerHTML = '';
        document.getElementById('floorPlansPreview').innerHTML = '';
       
        setTimeout(() => switchTab('properties'), 1000);
    } catch (error) {
        showAlert('❌ Ошибка: ' + error.message, 'error');
    }
});

// Обработка выбора файла
function handleFileSelect(input, previewId) {
    const file = input.files[0];
    if (!file) return;
   
    uploadedFiles.main = file;
   
    const preview = document.getElementById(previewId);
    const reader = new FileReader();    reader.onload = function(e) {
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
            img.style.margin = '5px';
            img.style.borderRadius = '8px';
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
   
    switchTab('addProperty');
   
    const form = document.getElementById('addPropertyForm');
    for (let key in data) {        const input = form.querySelector(`[name="${key}"]`);
        if (input) {
            if (input.type === 'checkbox') {
                input.checked = data[key];
            } else {
                input.value = data[key] !== null && data[key] !== undefined ? data[key] : '';
            }
        }
    }
   
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.textContent = '💾 Обновить объект';
    submitBtn.onclick = function(ev) {
        ev.preventDefault();
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
        } else if (['price_from', 'price_to', 'area_min', 'area_max', 'price_per_sqm'].includes(key)) {
            propertyData[key] = value ? parseFloat(value) : null;
        } else if (['lat', 'lng'].includes(key)) {
            propertyData[key] = value ? parseFloat(value) : null;
        } else {
            propertyData[key] = value;
        }
    }
   
    const { error } = await supabaseClient
        .from('properties')
        .update(propertyData)
        .eq('id', id);
   
    if (error) {
        showAlert('❌ Ошибка: ' + error.message, 'error');
        return;
    }
   
    showAlert('✅ Объект обновлён!');
    setTimeout(() => switchTab('properties'), 1000);
}

// Удаление объектаasync function deleteProperty(id) {
    if (!confirm('Вы уверены, что хотите удалить этот объект?')) return;
   
    const { error } = await supabaseClient
        .from('properties')
        .delete()
        .eq('id', id);
   
    if (error) {
        showAlert('❌ Ошибка: ' + error.message, 'error');
        return;
    }
   
    showAlert('✅ Объект удалён!');
    loadProperties();
}

// ========== ДАННЫЕ АГЕНТА ==========

async function loadAgentData() {
    const { data, error } = await supabaseClient
        .from('agent_data')
        .select('*')
        .limit(1);
   
    if (error) return;
   
    if (data && data.length > 0) {
        currentAgentId = data[0].id;
        const form = document.getElementById('agentForm');
        for (let key in data[0]) {
            const input = form.querySelector(`[name="${key}"]`);
            if (input) input.value = data[0][key] || '';
        }
    }
}

document.getElementById('agentForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
   
    const formData = new FormData(e.target);
    const agentData = {};
    for (let [key, value] of formData.entries()) {
        agentData[key] = value;
    }
   
    try {
        if (currentAgentId) {
            await supabaseClient
                .from('agent_data')                .update(agentData)
                .eq('id', currentAgentId);
        } else {
            agentData.id = crypto.randomUUID();
            await supabaseClient.from('agent_data').insert([agentData]);
        }
        showAlert('✅ Данные агента сохранены!');
    } catch (error) {
        showAlert('❌ Ошибка: ' + error.message, 'error');
    }
});

// ========== НАСТРОЙКИ ==========

async function loadSettings() {
    const { data, error } = await supabaseClient.from('settings').select('*');
    if (error) return;
   
    const form = document.getElementById('settingsForm');
    data.forEach(setting => {
        const input = form.querySelector(`[name="${setting.setting_key}"]`);
        if (input) input.value = setting.setting_value || '';
    });
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
        showAlert('✅ Настройки сохранены!');
    } catch (error) {        showAlert('❌ Ошибка сохранения настроек', 'error');
    }
});

// ========== ЗАЯВКИ ==========

async function loadLeads() {
    const container = document.getElementById('leadsList');
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#666;">⏳ Загрузка...</div>';
   
    const { data, error } = await supabaseClient
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
   
    if (error) {
        container.innerHTML = `<div class="alert alert-error">Ошибка: ${error.message}</div>`;
        return;
    }
   
    document.getElementById('leadsCount').textContent = data ? data.length : 0;
   
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
                <th>Телефон</th>
                <th>Telegram</th>
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
            `).join('')}        </tbody>
    `;
   
    container.innerHTML = '';
    container.appendChild(table);
}
