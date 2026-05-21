document.addEventListener('DOMContentLoaded', () => {
  // Telegram SDK (безопасная инициализация)
  let tg = null;
  try { if (window.Telegram?.WebApp) { tg = window.Telegram.WebApp; tg.ready(); tg.expand(); } } catch(e){}

  // Применяем бренд
  document.documentElement.style.setProperty('--c', APP_CONFIG.brand.color);
  document.getElementById('wLogo').src = APP_CONFIG.brand.logo;
  document.getElementById('wTitle').textContent = APP_CONFIG.brand.name;
  document.getElementById('hTitle').textContent = APP_CONFIG.brand.name;
  document.getElementById('hLogo').src = APP_CONFIG.brand.logo;
  document.getElementById('mBtn').href = APP_CONFIG.brand.contactLink;
 
  if (tg) { try { tg.setHeaderColor(APP_CONFIG.brand.color); } catch(e){} }

  // Переход с welcome на каталог
  document.getElementById('wBtn').onclick = () => {
    document.getElementById('welcome').classList.add('hidden');
    ['header','filters','list'].forEach(id => document.getElementById(id).classList.remove('hidden'));
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
  };

  loadData();
  document.getElementById('fRooms').onchange = applyFilters;
  document.getElementById('fPrice').onchange = applyFilters;
});

let DATA = [];

async function loadData() {
  try {
    const res = await fetch(APP_CONFIG.sheetUrl);
    const csv = await res.text();
    DATA = parseCSV(csv).slice(1).map(row => ({
      id: row[0], name: row[1], district: row[2], metro: row[3],
      price_from: safeNum(row[4]), price_to: safeNum(row[5]), rooms: row[6],
      area_min: safeNum(row[7]), area_max: safeNum(row[8]), price_per_sqm: safeNum(row[9]),
      completion_soonest: row[10], status: row[11], completion_all: row[12],
      class: row[13], finishing: row[14], description: row[15],
      image_main: row[16] || 'https://via.placeholder.com/600x400?text=No+Image',
      images_gallery: row[17], floor_plans_text: row[18], floor_plans_images: row[19],
      features: row[20], address: row[21], lat: row[22], lng: row[23], active: row[24]
    })).filter(i => String(i.active).toUpperCase() === 'TRUE');
    render(DATA);
  } catch(e) {
    document.getElementById('list').innerHTML = '<div style="padding:20px;text-align:center">Ошибка загрузки таблицы</div>';
  }
}

function parseCSV(t) {  const r=[]; let row=[], cell='', q=false;
  for(let i=0;i<t.length;i++){
    const c=t[i], n=t[i+1];
    if(c==='"'){ if(q&&n==='"'){cell+='"';i++} else q=!q }
    else if((c===','||c==='\n'||c==='\r')&&!q){
      if(c==='\r'&&n==='\n')i++;
      row.push(cell.trim()); cell='';
      if(c==='\n'||c==='\r'){ if(row.length)r.push(row); row=[] }
    } else cell+=c;
  }
  if(cell||row.length){ row.push(cell.trim()); r.push(row) }
  return r;
}

function safeNum(v){ return v ? Number(v.replace(/[^0-9.-]/g,'')) : 0 }
function fmtPrice(n){ return n ? new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽' : '0 ₽' }

function applyFilters(){
  const r=document.getElementById('fRooms').value, p=document.getElementById('fPrice').value;
  const f=DATA.filter(i=>{
    const rm=r==='all'||i.rooms===r;
    let pr=true;
    if(p!=='all'){ const l=Number(p)*1e6; pr=p.includes('+')?i.price_from>=l:i.price_from<=l }
    return rm&&pr;
  });
  render(f);
}

function render(items){
  const el=document.getElementById('list');
  if(!items.length){ el.innerHTML='<div style="padding:20px;text-align:center">Нет объектов</div>'; return }
  el.innerHTML=items.map(i=>`
    <article class="card" onclick="openModal('${i.id}')">
      <img src="${i.image_main}" loading="lazy">
      <div class="card-body">
        <span class="badge ${i.status.includes('Продан')||i.status.includes('Снят')?'badge-sold':'badge-ok'}">${i.status}</span>
        <h3>${i.name}</h3>
        <div class="price">${fmtPrice(i.price_from)}</div>
        <div class="meta"><span>${i.rooms}</span><span>•</span><span>от ${i.area_min} м²</span><span>•</span><span>${i.district}</span></div>
        ${i.metro?`<div class="metro">🚇 ${i.metro}</div>`:''}
      </div>
    </article>`).join('');
}

function openModal(id){
  const i=DATA.find(x=>String(x.id)===String(id)); if(!i)return;
  document.getElementById('mImg').src=i.image_main;
  document.getElementById('mStatus').textContent=i.status;
  document.getElementById('mStatus').className=`badge ${i.status.includes('Продан')?'badge-sold':'badge-ok'}`;
  document.getElementById('mTitle').textContent=i.name;  document.getElementById('mPrice').textContent=fmtPrice(i.price_from);
  document.getElementById('mMeta').innerHTML=`<span>🏠 ${i.rooms}</span><span> от ${i.area_min} м²</span><span>📍 ${i.district}</span>${i.metro?`<span>🚇 ${i.metro}</span>`:''}`;
  document.getElementById('mDesc').textContent=i.description||'';
  document.getElementById('mDetails').innerHTML=`
    <div class="det"><span>Класс</span><span>${i.class||'-'}</span></div>
    <div class="det"><span>Отделка</span><span>${i.finishing||'-'}</span></div>
    <div class="det"><span>Сдача</span><span>${i.completion_soonest||'-'}</span></div>
    <div class="det"><span>Адрес</span><span>${i.address||'-'}</span></div>`;
 
  // Кнопка: устанавливаем ссылку динамически
  const btn=document.getElementById('mBtn');
  btn.href=APP_CONFIG.brand.contactLink;
  btn.onclick=(e)=>{
    e.preventDefault();
    if(window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(btn.href);
    else window.open(btn.href,'_blank');
  };
 
  document.getElementById('modal').classList.remove('hidden');
  if(window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
}

function closeModal(){ document.getElementById('modal').classList.add('hidden') }
document.getElementById('modal').onclick=e=>{ if(e.target===e.currentTarget) closeModal() };
