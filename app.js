/* ═══════════════════════════════════════════════════
   My Space — app.js v4
   DATA FLOW:
     1. On boot: fetch data.json → load into memory + localStorage
     2. Every change: save to localStorage (instant)
     3. Export: download updated data.json to disk
     4. Import: upload a data.json → replace all data
     5. Reload: re-fetch data.json from disk (discards localStorage)
═══════════════════════════════════════════════════ */
'use strict';

/* ══════════════════════════════════════════════════
   STORAGE — dual layer: memory + localStorage backup
══════════════════════════════════════════════════ */

// In-memory master copy
let _db = { users: [] };

/** Read from memory */
function getData() { return _db; }

/** Write to memory AND localStorage */
function saveData(data) {
  _db = data;
  try { localStorage.setItem('myspace_cache', JSON.stringify(data)); } catch(e) {}
  updateDataPill('saving');
  clearTimeout(_pillTimer);
  _pillTimer = setTimeout(() => updateDataPill('saved'), 800);
}

let _pillTimer;

function updateDataPill(state) {
  const pill = $('data-pill');
  const txt  = $('data-pill-text');
  if (!pill) return;
  pill.className = `data-pill ${state}`;
  txt.textContent = state === 'saving' ? 'Saving…' : 'Saved to cache';
}

function getCurrentUser() {
  const id = sessionStorage.getItem('currentUserId');
  if (!id) return null;
  return getData().users.find(u => u.id === id) || null;
}
function saveCurrentUser(user) {
  const data = getData();
  const i = data.users.findIndex(u => u.id === user.id);
  if (i !== -1) { data.users[i] = user; saveData(data); }
}
function uid() { return Math.random().toString(36).slice(2,10) + Date.now().toString(36); }

/* ══════════════════════════════════════════════════
   BOOT — fetch data.json → fallback to localStorage cache
══════════════════════════════════════════════════ */
async function loadData() {
  // 1. Try to fetch data.json from the project folder
  try {
    const res  = await fetch('./data.json?_=' + Date.now()); // cache-busting
    if (res.ok) {
      const json = await res.json();
      // Validate structure
      if (json && Array.isArray(json.users)) {
        _db = json;
        // Also persist to localStorage cache
        localStorage.setItem('myspace_cache', JSON.stringify(_db));
        setDataSourceBadge('📄 data.json loaded', true);
        return 'json';
      }
    }
  } catch(e) { /* file not found or CORS — fall through */ }

  // 2. Fallback: try localStorage cache
  try {
    const cached = localStorage.getItem('myspace_cache');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.users)) {
        _db = parsed;
        setDataSourceBadge('💾 Browser cache loaded', false);
        return 'cache';
      }
    }
  } catch(e) {}

  // 3. Nothing found — start fresh
  _db = { users: [] };
  setDataSourceBadge('✨ New data — no file yet', false);
  return 'fresh';
}

function setDataSourceBadge(text, ok) {
  const badge = $('data-source-badge');
  const txt   = $('data-source-text');
  if (!badge || !txt) return;
  txt.textContent = text;
  badge.style.borderColor = ok ? 'rgba(74,240,196,0.2)' : 'rgba(240,184,74,0.2)';
  badge.style.color        = ok ? 'var(--accent)' : 'var(--warn)';
}

/* ══════════════════════════════════════════════════
   EXPORT — download data.json
══════════════════════════════════════════════════ */
function exportDataJson() {
  const data   = getData();
  const output = {
    _info: {
      app:         'My Space Dashboard',
      version:     '4.0',
      exportedAt:  new Date().toISOString(),
      description: 'Keep this file next to index.html, style.css and app.js.'
    },
    users: data.users
  };
  const json = JSON.stringify(output, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'data.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ data.json downloaded! Replace your old file.', 'success');
}

/* ══════════════════════════════════════════════════
   IMPORT — load a data.json file
══════════════════════════════════════════════════ */
function handleImportFile(file) {
  if (!file || !file.name.endsWith('.json')) {
    showToast('Please select a .json file.', 'error'); return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed || !Array.isArray(parsed.users)) {
        showToast('Invalid data.json format.', 'error'); return;
      }
      _db = parsed;
      localStorage.setItem('myspace_cache', JSON.stringify(_db));
      showToast(`✅ Imported! ${_db.users.length} user(s) loaded.`, 'success');
      setDataSourceBadge('⬆ Imported from file', true);
      // If current user still exists, stay logged in; else log out
      const uid_ = sessionStorage.getItem('currentUserId');
      const still = _db.users.find(u => u.id === uid_);
      if (!still) {
        sessionStorage.removeItem('currentUserId');
        showScreen('auth-screen');
      } else {
        renderDashboard();
        renderNotebook();
        populateProfile();
        refreshDataView();
      }
    } catch(err) { showToast('Could not parse JSON file.', 'error'); }
  };
  reader.readAsText(file);
}

/* ══════════════════════════════════════════════════
   RELOAD FROM data.json
══════════════════════════════════════════════════ */
async function reloadFromJsonFile() {
  try {
    const res = await fetch('./data.json?_=' + Date.now());
    if (!res.ok) throw new Error('File not found');
    const json = await res.json();
    if (!json || !Array.isArray(json.users)) throw new Error('Bad format');
    _db = json;
    localStorage.setItem('myspace_cache', JSON.stringify(_db));
    showToast('✅ Reloaded from data.json', 'success');
    setDataSourceBadge('📄 data.json reloaded', true);
    const uid_ = sessionStorage.getItem('currentUserId');
    const still = _db.users.find(u => u.id === uid_);
    if (!still) { sessionStorage.removeItem('currentUserId'); showScreen('auth-screen'); }
    else { renderDashboard(); renderNotebook(); populateProfile(); refreshDataView(); }
  } catch(err) {
    showToast('Could not load data.json — make sure the file is in the same folder.', 'error');
  }
}

/* ══════════════════════════════════════════════════
   DATA VIEW REFRESH
══════════════════════════════════════════════════ */
function refreshDataView() {
  const data = getData();

  // Summary stats for export card
  const totalUsers = data.users.length;
  const totalCats  = data.users.reduce((s, u) => s + (u.categories||[]).length, 0);
  const totalLinks = data.users.reduce((s, u) => s + (u.categories||[]).reduce((ss, c) => ss + (c.links||[]).length, 0), 0);
  const totalNotes = data.users.reduce((s, u) => s + (u.notes||[]).length, 0);
  const exportMeta = $('export-meta');
  if (exportMeta) exportMeta.textContent = `${totalUsers} users · ${totalCats} categories · ${totalLinks} links · ${totalNotes} notes`;

  // JSON preview (pretty-print, limit depth for readability)
  const preview = $('json-preview');
  if (preview) {
    preview.textContent = JSON.stringify(data, null, 2);
  }

  // Users table
  const tbody = $('users-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  data.users.forEach((user, idx) => {
    const cats  = (user.categories || []).length;
    const links = (user.categories || []).reduce((s, c) => s + (c.links || []).length, 0);
    const notes = (user.notes || []).length;
    const tr    = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td class="td-name">${escHtml(user.name)}</td>
      <td class="td-email">${escHtml(user.email)}</td>
      <td class="td-num">${cats}</td>
      <td class="td-num">${links}</td>
      <td class="td-num">${notes}</td>
      <td>
        <div class="td-actions">
          <button class="tbl-btn delete-user-btn" data-uid="${user.id}">Delete</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });

  // Delete user from table
  tbody.querySelectorAll('.delete-user-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const uid_ = btn.dataset.uid;
      const user = data.users.find(u => u.id === uid_);
      confirmMessage.textContent = `Delete user "${user?.name}" and ALL their data?`;
      state.pendingDeleteFn = () => {
        const d = getData();
        d.users = d.users.filter(u => u.id !== uid_);
        saveData(d);
        // If deleting self, log out
        if (uid_ === sessionStorage.getItem('currentUserId')) {
          sessionStorage.removeItem('currentUserId');
          closeModal(confirmModal);
          showScreen('auth-screen');
        } else {
          closeModal(confirmModal);
          refreshDataView();
        }
        showToast('User deleted.', 'error');
      };
      openModal(confirmModal);
    });
  });
}

/* ══════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════ */
const state = {
  editingCategoryId:  null,
  editingLinkId:      null,
  editingLinkCatId:   null,
  editingNoteId:      null,
  viewingNoteId:      null,
  pendingDeleteFn:    null,
  selectedCatEmoji:   '🌐',
  selectedLinkEmoji:  '🔗',
  selectedCatColor:   '#4af0c4',
  selectedNoteColor:  '#171d2d',
};

/* ══════════════════════════════════════════════════
   DOM REFS
══════════════════════════════════════════════════ */
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const loginForm      = $('login-form');
const registerForm   = $('register-form');
const loginError     = $('login-error');
const registerError  = $('register-error');
const sidebar        = document.querySelector('.sidebar');
const sidebarOpen    = $('sidebar-open');
const sidebarClose   = $('sidebar-close');
const sidebarAvatar  = $('sidebar-avatar');
const sidebarName    = $('sidebar-name');
const sidebarEmail   = $('sidebar-email');
const logoutBtn      = $('logout-btn');
const greeting       = $('greeting');
const searchInput    = $('search-input');
const searchClear    = $('search-clear');
const categoriesGrid = $('categories-grid');
const emptyState     = $('empty-state');
const addCategoryBtn = $('add-category-btn');
const searchBanner   = $('search-banner');
const searchTermDisplay = $('search-term-display');
const clearSearchBtn = $('clear-search-btn');
const profileAvatar  = $('profile-avatar');
const profileNameInput  = $('profile-name-input');
const profileEmailInput = $('profile-email-input');
const profilePassInput  = $('profile-password-input');
const saveProfileBtn = $('save-profile-btn');
const profileError   = $('profile-error');
const profileSuccess = $('profile-success');
const statCategories = $('stat-categories');
const statLinks      = $('stat-links');
const statNotes      = $('stat-notes');
const categoryModal  = $('category-modal');
const categoryModalTitle = $('category-modal-title');
const categoryNameInput  = $('category-name-input');
const saveCategoryBtn    = $('save-category-btn');
const categoryModalError = $('category-modal-error');
const linkModal      = $('link-modal');
const linkModalTitle = $('link-modal-title');
const linkTitleInput = $('link-title-input');
const linkUrlInput   = $('link-url-input');
const saveLinkBtn    = $('save-link-btn');
const linkModalError = $('link-modal-error');
const noteModal      = $('note-modal');
const noteModalTitle = $('note-modal-title');
const noteTitleInput = $('note-title-input');
const noteEditor     = $('note-editor');
const saveNoteBtn    = $('save-note-btn');
const noteModalError = $('note-modal-error');
const addNoteBtn     = $('add-note-btn');
const notebookGrid   = $('notebook-grid');
const notebookEmpty  = $('notebook-empty');
const noteViewModal  = $('note-view-modal');
const noteViewTitle  = $('note-view-title');
const noteViewContent = $('note-view-content');
const noteViewEditBtn = $('note-view-edit-btn');
const confirmModal   = $('confirm-modal');
const confirmMessage = $('confirm-message');
const confirmOkBtn   = $('confirm-ok-btn');
const toast          = $('toast');

/* ══════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════ */
let toastTimer;
function showToast(msg, type = 'success') {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className   = `toast show ${type}`;
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3200);
}

/* ══════════════════════════════════════════════════
   MODALS
══════════════════════════════════════════════════ */
function openModal(el)  { el.classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeModal(el) { el.classList.remove('open'); document.body.style.overflow = ''; }

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-modal]');
  if (btn) { closeModal($(btn.dataset.modal)); return; }
  if (e.target.classList.contains('modal-backdrop')) closeModal(e.target);
});

/* ══════════════════════════════════════════════════
   COLOR / EMOJI PICKERS
══════════════════════════════════════════════════ */
function initColorPicker(pickerId, customInputId, previewId, onSelect) {
  const picker = $(pickerId); if (!picker) return;
  picker.addEventListener('click', e => {
    const sw = e.target.closest('.color-swatch'); if (!sw) return;
    picker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    sw.classList.add('active'); onSelect(sw.dataset.color);
    if (previewId && $(previewId)) $(previewId).style.background = sw.dataset.color;
  });
  const ci = $(customInputId);
  if (ci) ci.addEventListener('input', () => {
    picker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    onSelect(ci.value);
    if (previewId && $(previewId)) $(previewId).style.background = ci.value;
  });
}
function resetColorPicker(pickerId, customInputId, previewId, color) {
  const picker = $(pickerId); if (!picker) return;
  let found = false;
  picker.querySelectorAll('.color-swatch').forEach(s => {
    const m = s.dataset.color === color; s.classList.toggle('active', m); if (m) found = true;
  });
  const ci = $(customInputId); if (ci) ci.value = color;
  if (previewId && $(previewId)) $(previewId).style.background = color;
}
function initEmojiPicker(pickerId, onSelect) {
  const picker = $(pickerId); if (!picker) return;
  picker.addEventListener('click', e => {
    const btn = e.target.closest('.emoji-opt'); if (!btn) return;
    picker.querySelectorAll('.emoji-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); onSelect(btn.dataset.emoji);
  });
}
function resetEmojiPicker(pickerId, emoji) {
  const picker = $(pickerId); if (!picker) return;
  picker.querySelectorAll('.emoji-opt').forEach(b => b.classList.toggle('active', b.dataset.emoji === emoji));
}

/* ══════════════════════════════════════════════════
   RICH TEXT EDITOR
══════════════════════════════════════════════════ */
function initRichEditor() {
  $$('#editor-toolbar .tb[data-cmd]').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      document.execCommand(btn.dataset.cmd, false, null);
      updateToolbarState();
    });
  });
  $('block-format').addEventListener('change', function() {
    noteEditor.focus();
    document.execCommand('formatBlock', false, `<${this.value}>`);
    updateToolbarState();
  });
  $('font-family').addEventListener('change', function() {
    noteEditor.focus(); document.execCommand('fontName', false, this.value);
  });
  $('font-size').addEventListener('change', function() {
    noteEditor.focus(); applyInlineStyle('font-size', this.value);
  });
  $('text-color-picker').addEventListener('input', function() {
    noteEditor.focus(); document.execCommand('foreColor', false, this.value);
    $('text-color-icon').style.borderBottom = `3px solid ${this.value}`;
  });
  $('bg-color-picker').addEventListener('input', function() {
    noteEditor.focus(); document.execCommand('hiliteColor', false, this.value);
    $('bg-color-icon').style.background = this.value + '44';
  });
  $('insert-link-btn').addEventListener('mousedown', e => {
    e.preventDefault();
    const url = prompt('Enter URL:', 'https://');
    if (url) { noteEditor.focus(); document.execCommand('createLink', false, url); }
  });
  $('insert-hr-btn').addEventListener('mousedown', e => {
    e.preventDefault(); noteEditor.focus();
    document.execCommand('insertHTML', false, '<hr/>');
  });
  noteEditor.addEventListener('keyup', updateToolbarState);
  noteEditor.addEventListener('mouseup', updateToolbarState);
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === noteEditor) updateToolbarState();
  });
  try { document.execCommand('styleWithCSS', false, true); } catch(e) {}
}
function applyInlineStyle(prop, value) {
  const sel = window.getSelection(); if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0); if (range.collapsed) return;
  const span = document.createElement('span');
  span.style[prop] = value;
  try { range.surroundContents(span); } catch(e) {
    document.execCommand('insertHTML', false, `<span style="${prop}:${value}">${range.toString()}</span>`);
  }
}
function updateToolbarState() {
  ['bold','italic','underline','strikeThrough','superscript','subscript',
   'insertUnorderedList','insertOrderedList','justifyLeft','justifyCenter','justifyRight','justifyFull']
  .forEach(cmd => {
    const btn = document.querySelector(`#editor-toolbar .tb[data-cmd="${cmd}"]`);
    if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
  });
}

/* ══════════════════════════════════════════════════
   WEATHER
══════════════════════════════════════════════════ */
const WMO = {
  0:['☀️','Clear sky'],1:['🌤','Mainly clear'],2:['⛅','Partly cloudy'],3:['☁️','Overcast'],
  45:['🌫','Fog'],48:['🌫','Icy fog'],51:['🌦','Light drizzle'],53:['🌦','Drizzle'],55:['🌧','Dense drizzle'],
  61:['🌧','Slight rain'],63:['🌧','Rain'],65:['🌧','Heavy rain'],
  71:['🌨','Slight snow'],73:['❄️','Snow'],75:['❄️','Heavy snow'],
  80:['🌦','Showers'],81:['🌧','Rain showers'],82:['⛈','Heavy showers'],
  95:['⛈','Thunderstorm'],96:['⛈','Hail'],99:['⛈','Heavy hail'],
};
async function fetchWeather() {
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=34.0331&longitude=-5.0003&current_weather=true&forecast_days=1');
    const d = await r.json(); const cw = d.current_weather;
    const [icon, desc] = WMO[cw.weathercode] || ['🌡','Unknown'];
    $('weather-icon').textContent = icon;
    $('weather-temp').textContent = `${Math.round(cw.temperature)}°C`;
    $('weather-desc').textContent = desc;
  } catch { $('weather-desc').textContent = 'Unavailable'; }
}
function startClock() {
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const tick = () => {
    const n = new Date();
    $('clock').textContent = `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
    $('weather-date').textContent = `${DAYS[n.getDay()]}, ${n.getDate()} ${MONS[n.getMonth()]} ${n.getFullYear()}`;
  };
  tick(); setInterval(tick, 1000);
}
function initWeather() { fetchWeather(); startClock(); setInterval(fetchWeather, 900000); }

/* ══════════════════════════════════════════════════
   AUTH
══════════════════════════════════════════════════ */
$$('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.auth-tab').forEach(t => t.classList.remove('active'));
    $$('.auth-form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    $(`${tab.dataset.tab}-form`).classList.add('active');
    loginError.textContent = registerError.textContent = '';
  });
});
registerForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = $('reg-name').value.trim(), email = $('reg-email').value.trim().toLowerCase(), password = $('reg-password').value;
  if (!name||!email||!password){registerError.textContent='All fields required.';return}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){registerError.textContent='Enter a valid email.';return}
  if(password.length<6){registerError.textContent='Password ≥ 6 chars.';return}
  const data = getData();
  if(data.users.find(u=>u.email===email)){registerError.textContent='Email already registered.';return}
  data.users.push({id:uid(),name,email,password,categories:[],notes:[]});
  saveData(data);
  showToast('Account created! Sign in now.');
  $$('.auth-tab')[0].click(); $('login-email').value=email;
});
loginForm.addEventListener('submit', e => {
  e.preventDefault();
  const email = $('login-email').value.trim().toLowerCase(), password = $('login-password').value;
  if(!email||!password){loginError.textContent='All fields required.';return}
  const user = getData().users.find(u=>u.email===email&&u.password===password);
  if(!user){loginError.textContent='Invalid email or password.';return}
  sessionStorage.setItem('currentUserId',user.id);
  loginError.textContent=''; loginForm.reset();
  enterDashboard(user);
});
logoutBtn.addEventListener('click',()=>{
  sessionStorage.removeItem('currentUserId');
  searchInput.value=''; showScreen('auth-screen');
  showToast('Signed out.','success');
});

/* ══════════════════════════════════════════════════
   SCREENS / VIEWS
══════════════════════════════════════════════════ */
function showScreen(id) { $$('.screen').forEach(s=>s.classList.remove('active')); $(id).classList.add('active'); }
function enterDashboard(user) {
  if(!user.notes){user.notes=[];saveCurrentUser(user);}
  showScreen('dashboard-screen');
  populateSidebar(user); setGreeting(user); initWeather();
  renderDashboard(); showView('dashboard');
}
function showView(name) {
  $$('.view').forEach(v=>v.classList.remove('active')); $(`view-${name}`).classList.add('active');
  $$('.nav-item').forEach(i=>i.classList.toggle('active',i.dataset.view===name));
  if(name==='profile')  populateProfile();
  if(name==='notebook') renderNotebook();
  if(name==='data')     refreshDataView();
}

/* ══════════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════════ */
function populateSidebar(user) {
  const init=user.name.charAt(0).toUpperCase();
  sidebarAvatar.textContent=init; sidebarName.textContent=user.name;
  sidebarEmail.textContent=user.email; profileAvatar.textContent=init;
}
function setGreeting(user) {
  const h=new Date().getHours();
  const p=h<12?'morning':h<18?'afternoon':'evening';
  greeting.textContent=`Good ${p}, ${user.name.split(' ')[0]}`;
}
const sidebarOverlay=document.createElement('div');
sidebarOverlay.className='sidebar-overlay'; document.body.appendChild(sidebarOverlay);
sidebarOpen.addEventListener('click',()=>{sidebar.classList.add('open');sidebarOverlay.classList.add('active');});
function closeSidebar(){sidebar.classList.remove('open');sidebarOverlay.classList.remove('active');}
sidebarClose.addEventListener('click',closeSidebar);
sidebarOverlay.addEventListener('click',closeSidebar);
$$('.nav-item').forEach(item=>{item.addEventListener('click',e=>{e.preventDefault();showView(item.dataset.view);closeSidebar();});});

/* ══════════════════════════════════════════════════
   DATA MANAGER BUTTONS
══════════════════════════════════════════════════ */
// Export buttons (sidebar quick + data view)
document.addEventListener('click', e => {
  if (e.target.closest('#quick-export-btn') || e.target.closest('#export-btn')) { exportDataJson(); }
});

// Import
$('import-file-input').addEventListener('change', function() {
  if (this.files[0]) { handleImportFile(this.files[0]); this.value=''; }
});

// Reload
$('reload-json-btn').addEventListener('click', () => {
  confirmMessage.textContent = 'Reload data from data.json? Unsaved browser changes will be lost.';
  state.pendingDeleteFn = async () => {
    closeModal(confirmModal);
    await reloadFromJsonFile();
  };
  openModal(confirmModal);
});

// Copy JSON
$('copy-json-btn').addEventListener('click', () => {
  const text = JSON.stringify(getData(), null, 2);
  navigator.clipboard.writeText(text).then(() => showToast('JSON copied!', 'success'));
});

/* ══════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════ */
function renderDashboard(filterTerm='') {
  const user=getCurrentUser(); if(!user) return;
  const term=filterTerm.trim().toLowerCase();
  categoriesGrid.innerHTML='';
  user.categories.forEach((cat,idx)=>{
    const visLinks=term?cat.links.filter(l=>l.title.toLowerCase().includes(term)||l.url.toLowerCase().includes(term)||cat.name.toLowerCase().includes(term)):cat.links;
    if(term&&visLinks.length===0&&!cat.name.toLowerCase().includes(term)) return;
    const card=buildCategoryCard(cat,visLinks,term);
    card.style.animationDelay=`${idx*0.04}s`;
    categoriesGrid.appendChild(card);
  });
  emptyState.style.display=user.categories.length===0?'block':'none';
  categoriesGrid.style.display=user.categories.length===0?'none':'grid';
  searchBanner.style.display=term?'flex':'none';
  if(term) searchTermDisplay.textContent=filterTerm;
}

function buildCategoryCard(cat,links,term) {
  const color=cat.color||'#4af0c4';
  const card=document.createElement('div');
  card.className='category-card'; card.dataset.catId=cat.id;
  card.style.setProperty('--cat-color',color);
  const header=document.createElement('div');
  header.className='card-header';
  header.innerHTML=`<div class="card-icon">${cat.icon||'🌐'}</div><div class="card-title">${escHtml(cat.name)}</div><div class="card-color-dot"></div><div class="card-actions"><button class="card-action-btn edit-cat-btn" data-id="${cat.id}" title="Edit">✏</button><button class="card-action-btn delete delete-cat-btn" data-id="${cat.id}" title="Delete">🗑</button></div>`;
  card.appendChild(header);
  if(links.length>5){
    const badge=document.createElement('div');
    badge.className='links-count-badge';
    badge.innerHTML=`<span>${links.length}</span> links — scroll to see all`;
    card.appendChild(badge);
  }
  const wrap=document.createElement('div'); wrap.className='links-list-wrap';
  const list=document.createElement('div'); list.className='links-list';
  if(links.length===0){list.innerHTML='<div class="no-links">// no links yet</div>';}
  else{
    links.forEach(link=>{
      const item=document.createElement('div'); item.className='link-item';
      item.innerHTML=`<div class="link-icon-wrap">${link.icon||'🔗'}</div><a class="link-anchor" href="${escHtml(link.url)}" target="_blank" rel="noopener noreferrer">${term?highlightText(escHtml(link.title),term):escHtml(link.title)}</a><div class="link-actions"><button class="link-action-btn edit-link-btn" data-link-id="${link.id}" data-cat-id="${cat.id}">✏</button><button class="link-action-btn delete delete-link-btn" data-link-id="${link.id}" data-cat-id="${cat.id}">🗑</button></div>`;
      list.appendChild(item);
    });
  }
  list.addEventListener('scroll',()=>{
    const atBottom=list.scrollHeight-list.scrollTop<=list.clientHeight+4;
    wrap.classList.toggle('scrollable',!atBottom&&links.length>5);
  });
  if(links.length>5) wrap.classList.add('scrollable');
  wrap.appendChild(list); card.appendChild(wrap);
  const addRow=document.createElement('div'); addRow.className='add-link-row';
  addRow.innerHTML=`<button class="btn-add-link add-link-btn" data-cat-id="${cat.id}">+ Add Link</button>`;
  card.appendChild(addRow);
  return card;
}

categoriesGrid.addEventListener('click',e=>{
  if(e.target.closest('.edit-cat-btn'))    {openEditCategory(e.target.closest('.edit-cat-btn').dataset.id);return;}
  if(e.target.closest('.delete-cat-btn')) {confirmDeleteCategory(e.target.closest('.delete-cat-btn').dataset.id);return;}
  if(e.target.closest('.add-link-btn'))   {openAddLink(e.target.closest('.add-link-btn').dataset.catId);return;}
  if(e.target.closest('.edit-link-btn'))  {const b=e.target.closest('.edit-link-btn');openEditLink(b.dataset.linkId,b.dataset.catId);return;}
  if(e.target.closest('.delete-link-btn')){const b=e.target.closest('.delete-link-btn');confirmDeleteLink(b.dataset.linkId,b.dataset.catId);return;}
});

/* ══════════════════════════════════════════════════
   CATEGORY CRUD
══════════════════════════════════════════════════ */
addCategoryBtn.addEventListener('click',openNewCategory);
$('empty-add-btn').addEventListener('click',openNewCategory);
function openNewCategory(){state.editingCategoryId=null;state.selectedCatEmoji='🌐';state.selectedCatColor='#4af0c4';categoryModalTitle.textContent='New Category';categoryNameInput.value='';categoryModalError.textContent='';resetColorPicker('cat-color-picker','cat-custom-color','cat-color-preview','#4af0c4');resetEmojiPicker('cat-emoji-picker','🌐');openModal(categoryModal);setTimeout(()=>categoryNameInput.focus(),80);}
function openEditCategory(catId){const user=getCurrentUser();const cat=user.categories.find(c=>c.id===catId);if(!cat)return;state.editingCategoryId=catId;state.selectedCatEmoji=cat.icon||'🌐';state.selectedCatColor=cat.color||'#4af0c4';categoryModalTitle.textContent='Edit Category';categoryNameInput.value=cat.name;categoryModalError.textContent='';resetColorPicker('cat-color-picker','cat-custom-color','cat-color-preview',state.selectedCatColor);resetEmojiPicker('cat-emoji-picker',state.selectedCatEmoji);openModal(categoryModal);setTimeout(()=>categoryNameInput.focus(),80);}
saveCategoryBtn.addEventListener('click',()=>{const name=categoryNameInput.value.trim();if(!name){categoryModalError.textContent='Name is required.';return;}const user=getCurrentUser();if(state.editingCategoryId){const cat=user.categories.find(c=>c.id===state.editingCategoryId);if(cat){cat.name=name;cat.icon=state.selectedCatEmoji;cat.color=state.selectedCatColor;}showToast('Category updated!');}else{user.categories.push({id:uid(),name,icon:state.selectedCatEmoji,color:state.selectedCatColor,links:[]});showToast('Category created!');}saveCurrentUser(user);closeModal(categoryModal);renderDashboard(searchInput.value);});
function confirmDeleteCategory(catId){const user=getCurrentUser();const cat=user.categories.find(c=>c.id===catId);confirmMessage.textContent=`Delete category "${cat?.name}"? All links will be lost.`;state.pendingDeleteFn=()=>{user.categories=user.categories.filter(c=>c.id!==catId);saveCurrentUser(user);closeModal(confirmModal);renderDashboard(searchInput.value);showToast('Category deleted.','error');};openModal(confirmModal);}

/* ══════════════════════════════════════════════════
   LINK CRUD
══════════════════════════════════════════════════ */
function openAddLink(catId){state.editingLinkId=null;state.editingLinkCatId=catId;state.selectedLinkEmoji='🔗';linkModalTitle.textContent='New Link';linkTitleInput.value=linkUrlInput.value='';linkModalError.textContent='';resetEmojiPicker('link-emoji-picker','🔗');openModal(linkModal);setTimeout(()=>linkTitleInput.focus(),80);}
function openEditLink(linkId,catId){const user=getCurrentUser();const cat=user.categories.find(c=>c.id===catId);const link=cat?.links.find(l=>l.id===linkId);if(!link)return;state.editingLinkId=linkId;state.editingLinkCatId=catId;state.selectedLinkEmoji=link.icon||'🔗';linkModalTitle.textContent='Edit Link';linkTitleInput.value=link.title;linkUrlInput.value=link.url;linkModalError.textContent='';resetEmojiPicker('link-emoji-picker',state.selectedLinkEmoji);openModal(linkModal);setTimeout(()=>linkTitleInput.focus(),80);}
saveLinkBtn.addEventListener('click',()=>{const title=linkTitleInput.value.trim();let url=linkUrlInput.value.trim();if(!title){linkModalError.textContent='Title required.';return;}if(!url){linkModalError.textContent='URL required.';return;}if(!/^https?:\/\//i.test(url))url='https://'+url;const user=getCurrentUser();const cat=user.categories.find(c=>c.id===state.editingLinkCatId);if(!cat)return;if(state.editingLinkId){const link=cat.links.find(l=>l.id===state.editingLinkId);if(link){link.title=title;link.url=url;link.icon=state.selectedLinkEmoji;}showToast('Link updated!');}else{cat.links.push({id:uid(),title,url,icon:state.selectedLinkEmoji});showToast('Link added!');}saveCurrentUser(user);closeModal(linkModal);renderDashboard(searchInput.value);});
function confirmDeleteLink(linkId,catId){const user=getCurrentUser();const cat=user.categories.find(c=>c.id===catId);const link=cat?.links.find(l=>l.id===linkId);confirmMessage.textContent=`Delete link "${link?.title}"?`;state.pendingDeleteFn=()=>{cat.links=cat.links.filter(l=>l.id!==linkId);saveCurrentUser(user);closeModal(confirmModal);renderDashboard(searchInput.value);showToast('Link deleted.','error');};openModal(confirmModal);}
confirmOkBtn.addEventListener('click',()=>{if(typeof state.pendingDeleteFn==='function'){state.pendingDeleteFn();state.pendingDeleteFn=null;}});

/* ══════════════════════════════════════════════════
   NOTEBOOK CRUD
══════════════════════════════════════════════════ */
addNoteBtn.addEventListener('click',openNewNote);
$('notebook-empty-add-btn').addEventListener('click',openNewNote);
function openNewNote(){state.editingNoteId=null;state.selectedNoteColor='#171d2d';noteModalTitle.textContent='New Note';noteTitleInput.value='';noteEditor.innerHTML='';noteModalError.textContent='';resetColorPicker('note-color-picker','note-custom-color',null,'#171d2d');openModal(noteModal);setTimeout(()=>noteTitleInput.focus(),80);}
function openEditNote(noteId){const user=getCurrentUser();const note=user.notes?.find(n=>n.id===noteId);if(!note)return;state.editingNoteId=noteId;state.selectedNoteColor=note.color||'#171d2d';noteModalTitle.textContent='Edit Note';noteTitleInput.value=note.title;noteEditor.innerHTML=note.content||'';noteModalError.textContent='';resetColorPicker('note-color-picker','note-custom-color',null,state.selectedNoteColor);openModal(noteModal);setTimeout(()=>noteTitleInput.focus(),80);}
function openViewNote(noteId){const user=getCurrentUser();const note=user.notes?.find(n=>n.id===noteId);if(!note)return;state.viewingNoteId=noteId;noteViewTitle.textContent=note.title;noteViewContent.innerHTML=note.content||'<p><em>Empty note</em></p>';openModal(noteViewModal);}
noteViewEditBtn.addEventListener('click',()=>{closeModal(noteViewModal);openEditNote(state.viewingNoteId);});
saveNoteBtn.addEventListener('click',()=>{const title=noteTitleInput.value.trim();const content=noteEditor.innerHTML.trim();if(!title){noteModalError.textContent='Title required.';return;}const user=getCurrentUser();if(!user.notes)user.notes=[];const now=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});if(state.editingNoteId){const note=user.notes.find(n=>n.id===state.editingNoteId);if(note){note.title=title;note.content=content;note.color=state.selectedNoteColor;note.updatedAt=now;}showToast('Note updated!');}else{user.notes.push({id:uid(),title,content,color:state.selectedNoteColor,createdAt:now,updatedAt:now});showToast('Note saved!');}saveCurrentUser(user);closeModal(noteModal);renderNotebook();});
function confirmDeleteNote(noteId){const user=getCurrentUser();const note=user.notes?.find(n=>n.id===noteId);confirmMessage.textContent=`Delete note "${note?.title}"?`;state.pendingDeleteFn=()=>{user.notes=user.notes.filter(n=>n.id!==noteId);saveCurrentUser(user);closeModal(confirmModal);renderNotebook();showToast('Note deleted.','error');};openModal(confirmModal);}
function renderNotebook(){const user=getCurrentUser();if(!user)return;const notes=user.notes||[];notebookGrid.innerHTML='';notebookEmpty.style.display=notes.length===0?'block':'none';notebookGrid.style.display=notes.length===0?'none':'grid';notes.forEach((note,idx)=>{const card=document.createElement('div');card.className='note-card';card.style.background=note.color||'#171d2d';card.style.animationDelay=`${idx*0.04}s`;card.innerHTML=`<div class="note-card-header"><div class="note-card-title">${escHtml(note.title)}</div><div class="note-card-actions"><button class="card-action-btn edit-note-btn" data-id="${note.id}">✏</button><button class="card-action-btn delete delete-note-btn" data-id="${note.id}">🗑</button></div></div><div class="note-card-body">${note.content||'<em style="color:var(--txt-muted)">Empty note</em>'}</div><div class="note-card-footer"><span>${note.updatedAt?`Updated ${note.updatedAt}`:note.createdAt||''}</span><button class="note-card-open-btn open-note-btn" data-id="${note.id}">Open ↗</button></div>`;notebookGrid.appendChild(card);});}
notebookGrid.addEventListener('click',e=>{if(e.target.closest('.edit-note-btn')){openEditNote(e.target.closest('.edit-note-btn').dataset.id);return;}if(e.target.closest('.delete-note-btn')){confirmDeleteNote(e.target.closest('.delete-note-btn').dataset.id);return;}if(e.target.closest('.open-note-btn')){openViewNote(e.target.closest('.open-note-btn').dataset.id);return;}});

/* ══════════════════════════════════════════════════
   SEARCH
══════════════════════════════════════════════════ */
searchInput.addEventListener('input',()=>{const t=searchInput.value;searchClear.classList.toggle('visible',t.length>0);renderDashboard(t);});
searchClear.addEventListener('click',clearSearch); clearSearchBtn.addEventListener('click',clearSearch);
function clearSearch(){searchInput.value='';searchClear.classList.remove('visible');renderDashboard('');}

/* ══════════════════════════════════════════════════
   PROFILE
══════════════════════════════════════════════════ */
function populateProfile(){const user=getCurrentUser();if(!user)return;profileAvatar.textContent=user.name.charAt(0).toUpperCase();profileNameInput.value=user.name;profileEmailInput.value=user.email;profilePassInput.value='';profileError.textContent=profileSuccess.textContent='';statCategories.textContent=user.categories.length;statLinks.textContent=user.categories.reduce((s,c)=>s+c.links.length,0);statNotes.textContent=(user.notes||[]).length;}
saveProfileBtn.addEventListener('click',()=>{const name=profileNameInput.value.trim();const email=profileEmailInput.value.trim().toLowerCase();const pass=profilePassInput.value;profileError.textContent=profileSuccess.textContent='';if(!name){profileError.textContent='Name required.';return;}if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){profileError.textContent='Invalid email.';return;}if(pass&&pass.length<6){profileError.textContent='Password ≥ 6 chars.';return;}const data=getData();const uid_=sessionStorage.getItem('currentUserId');if(data.users.find(u=>u.email===email&&u.id!==uid_)){profileError.textContent='Email in use.';return;}const user=getCurrentUser();user.name=name;user.email=email;if(pass)user.password=pass;saveCurrentUser(user);populateSidebar(user);setGreeting(user);profileSuccess.textContent='✓ Saved!';showToast('Profile updated!');});

/* ══════════════════════════════════════════════════
   KEYBOARD
══════════════════════════════════════════════════ */
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){$$('.modal-backdrop.open').forEach(m=>closeModal(m));return;}
  if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();searchInput.focus();}
  if(e.key==='Enter'&&document.activeElement!==noteEditor){
    if(categoryModal.classList.contains('open')&&document.activeElement===categoryNameInput)saveCategoryBtn.click();
    if(linkModal.classList.contains('open')&&document.activeElement!==linkUrlInput)saveLinkBtn.click();
  }
  // Ctrl+E = quick export
  if((e.ctrlKey||e.metaKey)&&e.key==='e'){e.preventDefault();exportDataJson();}
});

/* ══════════════════════════════════════════════════
   UTILS
══════════════════════════════════════════════════ */
function escHtml(str=''){return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function highlightText(text,term){if(!term)return text;return text.replace(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`,'gi'),'<span class="highlight">$1</span>');}

/* ══════════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════════ */
async function boot() {
  // Show loading screen, initialize pickers and editor while data loads
  initColorPicker('cat-color-picker','cat-custom-color','cat-color-preview',c=>{state.selectedCatColor=c;});
  initColorPicker('note-color-picker','note-custom-color',null,c=>{state.selectedNoteColor=c;});
  initEmojiPicker('cat-emoji-picker',e=>{state.selectedCatEmoji=e;});
  initEmojiPicker('link-emoji-picker',e=>{state.selectedLinkEmoji=e;});
  initRichEditor();

  // Load data (json → cache → fresh)
  await loadData();

  // Hide loading screen with fade
  const loadingScreen = $('loading-screen');
  loadingScreen.classList.add('fade-out');
  setTimeout(() => { loadingScreen.style.display = 'none'; }, 420);

  // Check session
  const userId = sessionStorage.getItem('currentUserId');
  const user   = userId ? getData().users.find(u => u.id === userId) : null;

  if (user) { enterDashboard(user); }
  else      { showScreen('auth-screen'); }
}

boot();
