/* ═══════════════════════════════════════════════════
   My Space — app.js  (v2)
   New: Category colors · Weather (Open-Meteo, Fes MA)
        Notebook CRUD · 2026 Design
═══════════════════════════════════════════════════ */
'use strict';

/* ──────────────────────────────────────────────────
   STORAGE
────────────────────────────────────────────────── */
function getData() {
  try { return JSON.parse(localStorage.getItem('myspace') || '{"users":[]}'); }
  catch { return { users: [] }; }
}
function saveData(data) { localStorage.setItem('myspace', JSON.stringify(data)); }

function getCurrentUser() {
  const id = sessionStorage.getItem('currentUserId');
  if (!id) return null;
  return getData().users.find(u => u.id === id) || null;
}
function saveCurrentUser(user) {
  const data = getData();
  const idx  = data.users.findIndex(u => u.id === user.id);
  if (idx !== -1) { data.users[idx] = user; saveData(data); }
}
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }


/* ──────────────────────────────────────────────────
   APP STATE
────────────────────────────────────────────────── */
const state = {
  editingCategoryId:  null,
  editingLinkId:      null,
  editingLinkCatId:   null,
  editingNoteId:      null,
  pendingDeleteFn:    null,
  selectedCatEmoji:   '🌐',
  selectedLinkEmoji:  '🔗',
  selectedCatColor:   '#4af0c4',
  selectedNoteColor:  '#171d2d',
};


/* ──────────────────────────────────────────────────
   DOM HELPERS
────────────────────────────────────────────────── */
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// Auth
const loginForm      = $('login-form');
const registerForm   = $('register-form');
const loginError     = $('login-error');
const registerError  = $('register-error');

// Sidebar
const sidebar        = document.querySelector('.sidebar');
const sidebarOpen    = $('sidebar-open');
const sidebarClose   = $('sidebar-close');
const sidebarAvatar  = $('sidebar-avatar');
const sidebarName    = $('sidebar-name');
const sidebarEmail   = $('sidebar-email');
const logoutBtn      = $('logout-btn');

// Topbar
const greeting       = $('greeting');
const searchInput    = $('search-input');
const searchClear    = $('search-clear');

// Dashboard
const categoriesGrid    = $('categories-grid');
const emptyState        = $('empty-state');
const addCategoryBtn    = $('add-category-btn');
const searchBanner      = $('search-banner');
const searchTermDisplay = $('search-term-display');
const clearSearchBtn    = $('clear-search-btn');

// Profile
const profileAvatar      = $('profile-avatar');
const profileNameInput   = $('profile-name-input');
const profileEmailInput  = $('profile-email-input');
const profilePassInput   = $('profile-password-input');
const saveProfileBtn     = $('save-profile-btn');
const profileError       = $('profile-error');
const profileSuccess     = $('profile-success');
const statCategories     = $('stat-categories');
const statLinks          = $('stat-links');
const statNotes          = $('stat-notes');

// Category modal
const categoryModal      = $('category-modal');
const categoryModalTitle = $('category-modal-title');
const categoryNameInput  = $('category-name-input');
const saveCategoryBtn    = $('save-category-btn');
const categoryModalError = $('category-modal-error');
const catColorPreview    = $('cat-color-preview');

// Link modal
const linkModal      = $('link-modal');
const linkModalTitle = $('link-modal-title');
const linkTitleInput = $('link-title-input');
const linkUrlInput   = $('link-url-input');
const saveLinkBtn    = $('save-link-btn');
const linkModalError = $('link-modal-error');

// Note modal
const noteModal      = $('note-modal');
const noteModalTitle = $('note-modal-title');
const noteTitleInput = $('note-title-input');
const noteContent    = $('note-content-input');
const saveNoteBtn    = $('save-note-btn');
const noteModalError = $('note-modal-error');
const addNoteBtn     = $('add-note-btn');
const notebookGrid   = $('notebook-grid');
const notebookEmpty  = $('notebook-empty');

// Confirm
const confirmModal   = $('confirm-modal');
const confirmMessage = $('confirm-message');
const confirmOkBtn   = $('confirm-ok-btn');

// Toast
const toast = $('toast');


/* ──────────────────────────────────────────────────
   TOAST
────────────────────────────────────────────────── */
let toastTimer;
function showToast(msg, type = 'success') {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className   = `toast show ${type}`;
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 2800);
}


/* ──────────────────────────────────────────────────
   MODALS
────────────────────────────────────────────────── */
function openModal(el)  { el.classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeModal(el) { el.classList.remove('open'); document.body.style.overflow = ''; }

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-modal]');
  if (btn) { closeModal($(btn.dataset.modal)); return; }
  if (e.target.classList.contains('modal-backdrop')) closeModal(e.target);
});


/* ──────────────────────────────────────────────────
   COLOR PICKER helper
────────────────────────────────────────────────── */
function initColorPicker(pickerId, customInputId, previewId, onSelect) {
  const picker = $(pickerId);
  if (!picker) return;

  picker.addEventListener('click', e => {
    const swatch = e.target.closest('.color-swatch');
    if (!swatch) return;
    picker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
    onSelect(swatch.dataset.color);
    if (previewId) $(previewId).style.background = swatch.dataset.color;
  });

  const customInput = $(customInputId);
  if (customInput) {
    customInput.addEventListener('input', () => {
      // Deselect preset swatches
      picker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      onSelect(customInput.value);
      if (previewId) $(previewId).style.background = customInput.value;
    });
  }
}

function resetColorPicker(pickerId, customInputId, previewId, color) {
  const picker = $(pickerId);
  if (!picker) return;
  let found = false;
  picker.querySelectorAll('.color-swatch').forEach(s => {
    const match = s.dataset.color === color;
    s.classList.toggle('active', match);
    if (match) found = true;
  });
  // If color not in presets, update custom input
  const customInput = $(customInputId);
  if (customInput) customInput.value = color;
  if (!found) {
    // no preset active — just update preview
  }
  if (previewId) $(previewId).style.background = color;
}


/* ──────────────────────────────────────────────────
   EMOJI PICKER helper
────────────────────────────────────────────────── */
function initEmojiPicker(pickerId, onSelect) {
  const picker = $(pickerId);
  if (!picker) return;
  picker.addEventListener('click', e => {
    const btn = e.target.closest('.emoji-opt');
    if (!btn) return;
    picker.querySelectorAll('.emoji-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    onSelect(btn.dataset.emoji);
  });
}
function resetEmojiPicker(pickerId, emoji) {
  const picker = $(pickerId);
  if (!picker) return;
  picker.querySelectorAll('.emoji-opt').forEach(b => {
    b.classList.toggle('active', b.dataset.emoji === emoji);
  });
}


/* ──────────────────────────────────────────────────
   WEATHER WIDGET — Open-Meteo (free, no API key)
   Location: Fes, Morocco (34.0331, -5.0003)
────────────────────────────────────────────────── */
const WEATHER_LAT = 34.0331;
const WEATHER_LON = -5.0003;

const WMO_CODES = {
  0:  ['☀️','Clear sky'],      1:  ['🌤','Mainly clear'],
  2:  ['⛅','Partly cloudy'],  3:  ['☁️','Overcast'],
  45: ['🌫','Fog'],            48: ['🌫','Icy fog'],
  51: ['🌦','Light drizzle'],  53: ['🌦','Drizzle'],    55: ['🌧','Dense drizzle'],
  61: ['🌧','Slight rain'],    63: ['🌧','Rain'],        65: ['🌧','Heavy rain'],
  71: ['🌨','Slight snow'],    73: ['❄️','Snow'],        75: ['❄️','Heavy snow'],
  80: ['🌦','Showers'],        81: ['🌧','Rain showers'],82: ['⛈','Heavy showers'],
  95: ['⛈','Thunderstorm'],   96: ['⛈','Hail storm'],  99: ['⛈','Heavy hail'],
};

async function fetchWeather() {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LAT}&longitude=${WEATHER_LON}&current_weather=true&hourly=weathercode&forecast_days=1`;
    const res  = await fetch(url);
    const data = await res.json();
    const cw   = data.current_weather;
    const code = cw.weathercode;
    const [icon, desc] = WMO_CODES[code] || ['🌡','Unknown'];
    const temp = Math.round(cw.temperature);

    $('weather-icon').textContent = icon;
    $('weather-temp').textContent = `${temp}°C`;
    $('weather-desc').textContent = desc;
  } catch {
    $('weather-desc').textContent = 'Unavailable';
  }
}

function startClock() {
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function tick() {
    const now = new Date();
    const h   = String(now.getHours()).padStart(2, '0');
    const m   = String(now.getMinutes()).padStart(2, '0');
    $('clock').textContent = `${h}:${m}`;

    const day  = days[now.getDay()];
    const date = now.getDate();
    const mon  = months[now.getMonth()];
    const yr   = now.getFullYear();
    $('weather-date').textContent = `${day}, ${date} ${mon} ${yr}`;
  }
  tick();
  setInterval(tick, 1000);
}

function initWeather() {
  fetchWeather();
  startClock();
  // Refresh weather every 15 min
  setInterval(fetchWeather, 15 * 60 * 1000);
}


/* ──────────────────────────────────────────────────
   AUTH
────────────────────────────────────────────────── */
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
  const name     = $('reg-name').value.trim();
  const email    = $('reg-email').value.trim().toLowerCase();
  const password = $('reg-password').value;

  if (!name || !email || !password) { registerError.textContent = 'All fields required.'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { registerError.textContent = 'Enter a valid email.'; return; }
  if (password.length < 6) { registerError.textContent = 'Password must be ≥ 6 chars.'; return; }

  const data = getData();
  if (data.users.find(u => u.email === email)) { registerError.textContent = 'Email already registered.'; return; }

  data.users.push({ id: uid(), name, email, password, categories: [], notes: [] });
  saveData(data);
  registerError.textContent = '';
  showToast('Account created! Sign in now.');
  $$('.auth-tab')[0].click();
  $('login-email').value = email;
  $('login-password').focus();
});

loginForm.addEventListener('submit', e => {
  e.preventDefault();
  const email    = $('login-email').value.trim().toLowerCase();
  const password = $('login-password').value;

  if (!email || !password) { loginError.textContent = 'Email and password required.'; return; }

  const user = getData().users.find(u => u.email === email && u.password === password);
  if (!user) { loginError.textContent = 'Invalid email or password.'; return; }

  sessionStorage.setItem('currentUserId', user.id);
  loginError.textContent = '';
  loginForm.reset();
  enterDashboard(user);
});

logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem('currentUserId');
  searchInput.value = '';
  showScreen('auth-screen');
  showToast('Signed out.', 'success');
});


/* ──────────────────────────────────────────────────
   SCREEN & VIEW MANAGEMENT
────────────────────────────────────────────────── */
function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

function enterDashboard(user) {
  // Migrate legacy data — ensure notes array exists
  if (!user.notes) { user.notes = []; saveCurrentUser(user); }

  showScreen('dashboard-screen');
  populateSidebar(user);
  setGreeting(user);
  initWeather();
  renderDashboard();
  showView('dashboard');
}

function showView(name) {
  $$('.view').forEach(v => v.classList.remove('active'));
  $(`view-${name}`).classList.add('active');
  $$('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.view === name));
  if (name === 'profile')  populateProfile();
  if (name === 'notebook') renderNotebook();
}


/* ──────────────────────────────────────────────────
   SIDEBAR
────────────────────────────────────────────────── */
function populateSidebar(user) {
  const init = user.name.charAt(0).toUpperCase();
  sidebarAvatar.textContent = init;
  sidebarName.textContent   = user.name;
  sidebarEmail.textContent  = user.email;
  profileAvatar.textContent = init;
}

function setGreeting(user) {
  const h = new Date().getHours();
  const p = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  greeting.textContent = `Good ${p}, ${user.name.split(' ')[0]}`;
}

// Mobile sidebar overlay
const sidebarOverlay = document.createElement('div');
sidebarOverlay.className = 'sidebar-overlay';
document.body.appendChild(sidebarOverlay);

sidebarOpen.addEventListener('click', () => {
  sidebar.classList.add('open'); sidebarOverlay.classList.add('active');
});
function closeSidebar() {
  sidebar.classList.remove('open'); sidebarOverlay.classList.remove('active');
}
sidebarClose.addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

$$('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    showView(item.dataset.view);
    closeSidebar();
  });
});


/* ──────────────────────────────────────────────────
   DASHBOARD RENDER
────────────────────────────────────────────────── */
function renderDashboard(filterTerm = '') {
  const user = getCurrentUser();
  if (!user) return;

  const term = filterTerm.trim().toLowerCase();
  categoriesGrid.innerHTML = '';
  let totalVisible = 0;

  user.categories.forEach((cat, idx) => {
    const visLinks = term
      ? cat.links.filter(l =>
          l.title.toLowerCase().includes(term) ||
          l.url.toLowerCase().includes(term) ||
          cat.name.toLowerCase().includes(term))
      : cat.links;

    if (term && visLinks.length === 0 && !cat.name.toLowerCase().includes(term)) return;
    totalVisible++;

    const card = buildCategoryCard(cat, visLinks, term);
    card.style.animationDelay = `${idx * 0.04}s`;
    categoriesGrid.appendChild(card);
  });

  emptyState.style.display     = user.categories.length === 0 ? 'block' : 'none';
  categoriesGrid.style.display = user.categories.length === 0 ? 'none'  : 'grid';

  if (term) {
    searchBanner.style.display      = 'flex';
    searchTermDisplay.textContent   = filterTerm;
  } else {
    searchBanner.style.display = 'none';
  }
}

function buildCategoryCard(cat, links, term) {
  const color = cat.color || '#4af0c4';
  const card  = document.createElement('div');
  card.className = 'category-card';
  card.dataset.catId = cat.id;
  // Apply category color as CSS custom property
  card.style.setProperty('--cat-color', color);

  card.innerHTML = `
    <div class="card-header">
      <div class="card-icon">${cat.icon || '🌐'}</div>
      <div class="card-title">${escHtml(cat.name)}</div>
      <div class="card-color-dot"></div>
      <div class="card-actions">
        <button class="card-action-btn edit-cat-btn" data-id="${cat.id}" title="Edit">✏</button>
        <button class="card-action-btn delete delete-cat-btn" data-id="${cat.id}" title="Delete">🗑</button>
      </div>
    </div>
    <div class="links-list">
      ${links.length === 0
        ? '<div class="no-links">// no links yet</div>'
        : links.map(l => buildLinkItemHtml(l, cat.id, term)).join('')}
    </div>
    <div class="add-link-row">
      <button class="btn-add-link add-link-btn" data-cat-id="${cat.id}">+ Add Link</button>
    </div>
  `;
  return card;
}

function buildLinkItemHtml(link, catId, term = '') {
  const title = term
    ? highlightText(escHtml(link.title), term)
    : escHtml(link.title);
  return `
    <div class="link-item" data-link-id="${link.id}">
      <div class="link-icon-wrap">${link.icon || '🔗'}</div>
      <a class="link-anchor" href="${escHtml(link.url)}" target="_blank" rel="noopener noreferrer">${title}</a>
      <div class="link-actions">
        <button class="link-action-btn edit-link-btn" data-link-id="${link.id}" data-cat-id="${catId}" title="Edit">✏</button>
        <button class="link-action-btn delete delete-link-btn" data-link-id="${link.id}" data-cat-id="${catId}" title="Delete">🗑</button>
      </div>
    </div>`;
}


/* ──────────────────────────────────────────────────
   DELEGATED EVENTS (categories grid)
────────────────────────────────────────────────── */
categoriesGrid.addEventListener('click', e => {
  if (e.target.closest('.edit-cat-btn'))   { openEditCategory(e.target.closest('.edit-cat-btn').dataset.id);   return; }
  if (e.target.closest('.delete-cat-btn')) { confirmDeleteCategory(e.target.closest('.delete-cat-btn').dataset.id); return; }
  if (e.target.closest('.add-link-btn'))   { openAddLink(e.target.closest('.add-link-btn').dataset.catId); return; }
  if (e.target.closest('.edit-link-btn'))  { const b = e.target.closest('.edit-link-btn'); openEditLink(b.dataset.linkId, b.dataset.catId); return; }
  if (e.target.closest('.delete-link-btn')){ const b = e.target.closest('.delete-link-btn'); confirmDeleteLink(b.dataset.linkId, b.dataset.catId); return; }
});


/* ──────────────────────────────────────────────────
   CATEGORY CRUD
────────────────────────────────────────────────── */
addCategoryBtn.addEventListener('click', openNewCategory);
$('empty-add-btn').addEventListener('click', openNewCategory);

function openNewCategory() {
  state.editingCategoryId = null;
  state.selectedCatEmoji  = '🌐';
  state.selectedCatColor  = '#4af0c4';
  categoryModalTitle.textContent  = 'New Category';
  categoryNameInput.value         = '';
  categoryModalError.textContent  = '';
  resetColorPicker('cat-color-picker', 'cat-custom-color', 'cat-color-preview', '#4af0c4');
  resetEmojiPicker('cat-emoji-picker', '🌐');
  openModal(categoryModal);
  setTimeout(() => categoryNameInput.focus(), 80);
}

function openEditCategory(catId) {
  const user = getCurrentUser();
  const cat  = user.categories.find(c => c.id === catId);
  if (!cat) return;

  state.editingCategoryId = catId;
  state.selectedCatEmoji  = cat.icon  || '🌐';
  state.selectedCatColor  = cat.color || '#4af0c4';
  categoryModalTitle.textContent  = 'Edit Category';
  categoryNameInput.value         = cat.name;
  categoryModalError.textContent  = '';
  resetColorPicker('cat-color-picker', 'cat-custom-color', 'cat-color-preview', state.selectedCatColor);
  resetEmojiPicker('cat-emoji-picker', state.selectedCatEmoji);
  openModal(categoryModal);
  setTimeout(() => categoryNameInput.focus(), 80);
}

saveCategoryBtn.addEventListener('click', () => {
  const name = categoryNameInput.value.trim();
  if (!name) { categoryModalError.textContent = 'Name is required.'; return; }

  const user = getCurrentUser();
  if (state.editingCategoryId) {
    const cat = user.categories.find(c => c.id === state.editingCategoryId);
    if (cat) { cat.name = name; cat.icon = state.selectedCatEmoji; cat.color = state.selectedCatColor; }
    showToast('Category updated!');
  } else {
    user.categories.push({ id: uid(), name, icon: state.selectedCatEmoji, color: state.selectedCatColor, links: [] });
    showToast('Category created!');
  }
  saveCurrentUser(user);
  closeModal(categoryModal);
  renderDashboard(searchInput.value);
});

function confirmDeleteCategory(catId) {
  const user = getCurrentUser();
  const cat  = user.categories.find(c => c.id === catId);
  confirmMessage.textContent = `Delete category "${cat?.name}"? All its links will be lost.`;
  state.pendingDeleteFn = () => {
    user.categories = user.categories.filter(c => c.id !== catId);
    saveCurrentUser(user);
    closeModal(confirmModal);
    renderDashboard(searchInput.value);
    showToast('Category deleted.', 'error');
  };
  openModal(confirmModal);
}


/* ──────────────────────────────────────────────────
   LINK CRUD
────────────────────────────────────────────────── */
function openAddLink(catId) {
  state.editingLinkId     = null;
  state.editingLinkCatId  = catId;
  state.selectedLinkEmoji = '🔗';
  linkModalTitle.textContent = 'New Link';
  linkTitleInput.value = linkUrlInput.value = '';
  linkModalError.textContent = '';
  resetEmojiPicker('link-emoji-picker', '🔗');
  openModal(linkModal);
  setTimeout(() => linkTitleInput.focus(), 80);
}

function openEditLink(linkId, catId) {
  const user = getCurrentUser();
  const cat  = user.categories.find(c => c.id === catId);
  const link = cat?.links.find(l => l.id === linkId);
  if (!link) return;

  state.editingLinkId     = linkId;
  state.editingLinkCatId  = catId;
  state.selectedLinkEmoji = link.icon || '🔗';
  linkModalTitle.textContent = 'Edit Link';
  linkTitleInput.value = link.title;
  linkUrlInput.value   = link.url;
  linkModalError.textContent = '';
  resetEmojiPicker('link-emoji-picker', state.selectedLinkEmoji);
  openModal(linkModal);
  setTimeout(() => linkTitleInput.focus(), 80);
}

saveLinkBtn.addEventListener('click', () => {
  const title = linkTitleInput.value.trim();
  let   url   = linkUrlInput.value.trim();
  if (!title) { linkModalError.textContent = 'Title required.'; return; }
  if (!url)   { linkModalError.textContent = 'URL required.'; return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  const user = getCurrentUser();
  const cat  = user.categories.find(c => c.id === state.editingLinkCatId);
  if (!cat) return;

  if (state.editingLinkId) {
    const link = cat.links.find(l => l.id === state.editingLinkId);
    if (link) { link.title = title; link.url = url; link.icon = state.selectedLinkEmoji; }
    showToast('Link updated!');
  } else {
    cat.links.push({ id: uid(), title, url, icon: state.selectedLinkEmoji });
    showToast('Link added!');
  }
  saveCurrentUser(user);
  closeModal(linkModal);
  renderDashboard(searchInput.value);
});

function confirmDeleteLink(linkId, catId) {
  const user = getCurrentUser();
  const cat  = user.categories.find(c => c.id === catId);
  const link = cat?.links.find(l => l.id === linkId);
  confirmMessage.textContent = `Delete link "${link?.title}"?`;
  state.pendingDeleteFn = () => {
    cat.links = cat.links.filter(l => l.id !== linkId);
    saveCurrentUser(user);
    closeModal(confirmModal);
    renderDashboard(searchInput.value);
    showToast('Link deleted.', 'error');
  };
  openModal(confirmModal);
}

confirmOkBtn.addEventListener('click', () => {
  if (typeof state.pendingDeleteFn === 'function') {
    state.pendingDeleteFn();
    state.pendingDeleteFn = null;
  }
});


/* ──────────────────────────────────────────────────
   NOTEBOOK CRUD
────────────────────────────────────────────────── */
addNoteBtn.addEventListener('click', openNewNote);
$('notebook-empty-add-btn').addEventListener('click', openNewNote);

function openNewNote() {
  state.editingNoteId    = null;
  state.selectedNoteColor = '#171d2d';
  noteModalTitle.textContent = 'New Note';
  noteTitleInput.value = noteContent.value = '';
  noteModalError.textContent = '';
  resetColorPicker('note-color-picker', 'note-custom-color', null, '#171d2d');
  openModal(noteModal);
  setTimeout(() => noteTitleInput.focus(), 80);
}

function openEditNote(noteId) {
  const user = getCurrentUser();
  const note = user.notes?.find(n => n.id === noteId);
  if (!note) return;

  state.editingNoteId     = noteId;
  state.selectedNoteColor = note.color || '#171d2d';
  noteModalTitle.textContent = 'Edit Note';
  noteTitleInput.value  = note.title;
  noteContent.value     = note.content;
  noteModalError.textContent = '';
  resetColorPicker('note-color-picker', 'note-custom-color', null, state.selectedNoteColor);
  openModal(noteModal);
  setTimeout(() => noteTitleInput.focus(), 80);
}

saveNoteBtn.addEventListener('click', () => {
  const title   = noteTitleInput.value.trim();
  const content = noteContent.value.trim();
  if (!title) { noteModalError.textContent = 'Title required.'; return; }

  const user = getCurrentUser();
  if (!user.notes) user.notes = [];

  const now = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });

  if (state.editingNoteId) {
    const note = user.notes.find(n => n.id === state.editingNoteId);
    if (note) { note.title = title; note.content = content; note.color = state.selectedNoteColor; note.updatedAt = now; }
    showToast('Note updated!');
  } else {
    user.notes.push({ id: uid(), title, content, color: state.selectedNoteColor, createdAt: now, updatedAt: now });
    showToast('Note saved!');
  }
  saveCurrentUser(user);
  closeModal(noteModal);
  renderNotebook();
});

function confirmDeleteNote(noteId) {
  const user = getCurrentUser();
  const note = user.notes?.find(n => n.id === noteId);
  confirmMessage.textContent = `Delete note "${note?.title}"?`;
  state.pendingDeleteFn = () => {
    user.notes = user.notes.filter(n => n.id !== noteId);
    saveCurrentUser(user);
    closeModal(confirmModal);
    renderNotebook();
    showToast('Note deleted.', 'error');
  };
  openModal(confirmModal);
}

function renderNotebook() {
  const user = getCurrentUser();
  if (!user) return;
  const notes = user.notes || [];

  notebookGrid.innerHTML = '';
  notebookEmpty.style.display = notes.length === 0 ? 'block' : 'none';
  notebookGrid.style.display  = notes.length === 0 ? 'none'  : 'grid';

  notes.forEach((note, idx) => {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.style.background = note.color || '#171d2d';
    card.style.animationDelay = `${idx * 0.04}s`;
    card.innerHTML = `
      <div class="note-card-header">
        <div class="note-card-title">${escHtml(note.title)}</div>
        <div class="note-card-actions">
          <button class="card-action-btn edit-note-btn" data-id="${note.id}" title="Edit">✏</button>
          <button class="card-action-btn delete delete-note-btn" data-id="${note.id}" title="Delete">🗑</button>
        </div>
      </div>
      <div class="note-card-body">${escHtml(note.content || '(empty)')}</div>
      <div class="note-card-footer">
        ${note.updatedAt ? `Updated ${note.updatedAt}` : note.createdAt || ''}
      </div>
    `;
    notebookGrid.appendChild(card);
  });
}

notebookGrid.addEventListener('click', e => {
  const editBtn = e.target.closest('.edit-note-btn');
  if (editBtn) { openEditNote(editBtn.dataset.id); return; }
  const delBtn  = e.target.closest('.delete-note-btn');
  if (delBtn)  { confirmDeleteNote(delBtn.dataset.id); return; }
});


/* ──────────────────────────────────────────────────
   SEARCH
────────────────────────────────────────────────── */
searchInput.addEventListener('input', () => {
  const term = searchInput.value;
  searchClear.classList.toggle('visible', term.length > 0);
  renderDashboard(term);
});
searchClear.addEventListener('click', clearSearch);
clearSearchBtn.addEventListener('click', clearSearch);
function clearSearch() {
  searchInput.value = '';
  searchClear.classList.remove('visible');
  renderDashboard('');
}


/* ──────────────────────────────────────────────────
   PROFILE
────────────────────────────────────────────────── */
function populateProfile() {
  const user = getCurrentUser();
  if (!user) return;
  profileAvatar.textContent    = user.name.charAt(0).toUpperCase();
  profileNameInput.value       = user.name;
  profileEmailInput.value      = user.email;
  profilePassInput.value       = '';
  profileError.textContent     = '';
  profileSuccess.textContent   = '';

  const totalLinks = user.categories.reduce((s, c) => s + c.links.length, 0);
  statCategories.textContent = user.categories.length;
  statLinks.textContent      = totalLinks;
  statNotes.textContent      = (user.notes || []).length;
}

saveProfileBtn.addEventListener('click', () => {
  const name  = profileNameInput.value.trim();
  const email = profileEmailInput.value.trim().toLowerCase();
  const pass  = profilePassInput.value;
  profileError.textContent = profileSuccess.textContent = '';

  if (!name)  { profileError.textContent = 'Name required.'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { profileError.textContent = 'Invalid email.'; return; }
  if (pass && pass.length < 6) { profileError.textContent = 'Password ≥ 6 chars.'; return; }

  const data = getData();
  const uid_ = sessionStorage.getItem('currentUserId');
  if (data.users.find(u => u.email === email && u.id !== uid_)) {
    profileError.textContent = 'Email in use.'; return;
  }

  const user = getCurrentUser();
  user.name  = name; user.email = email;
  if (pass) user.password = pass;
  saveCurrentUser(user);
  populateSidebar(user);
  setGreeting(user);
  profileSuccess.textContent = '✓ Saved!';
  showToast('Profile updated!');
});


/* ──────────────────────────────────────────────────
   KEYBOARD SHORTCUTS
────────────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { $$('.modal-backdrop.open').forEach(m => closeModal(m)); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); searchInput.focus(); }
  if (e.key === 'Enter') {
    if (categoryModal.classList.contains('open') && document.activeElement === categoryNameInput) saveCategoryBtn.click();
    if (linkModal.classList.contains('open') && document.activeElement !== linkUrlInput) saveLinkBtn.click();
  }
});


/* ──────────────────────────────────────────────────
   INIT PICKERS (once, on DOM ready)
────────────────────────────────────────────────── */
initColorPicker('cat-color-picker', 'cat-custom-color', 'cat-color-preview', color => {
  state.selectedCatColor = color;
});
initColorPicker('note-color-picker', 'note-custom-color', null, color => {
  state.selectedNoteColor = color;
});
initEmojiPicker('cat-emoji-picker',  emoji => { state.selectedCatEmoji  = emoji; });
initEmojiPicker('link-emoji-picker', emoji => { state.selectedLinkEmoji = emoji; });


/* ──────────────────────────────────────────────────
   UTILITIES
────────────────────────────────────────────────── */
function escHtml(str = '') {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function highlightText(text, term) {
  if (!term) return text;
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${esc})`, 'gi'), '<span class="highlight">$1</span>');
}


/* ──────────────────────────────────────────────────
   DEMO DATA SEED
────────────────────────────────────────────────── */
function seedDemoData() {
  const data = getData();
  if (data.users.length > 0) return;

  data.users.push({
    id: uid(), name: 'Alex Demo',
    email: 'demo@myspace.io', password: 'demo123',
    notes: [
      { id: uid(), title: '💡 Ideas to explore', content: 'Build a habit tracker\nLearn Rust basics\nRead "The Mom Test"', color: '#1a2518', createdAt: '9 Apr 2026', updatedAt: '9 Apr 2026' },
      { id: uid(), title: '📋 Today\'s tasks',    content: '✅ Review pull requests\n⬜ Write documentation\n⬜ Deploy to staging',  color: '#1e1a28', createdAt: '9 Apr 2026', updatedAt: '9 Apr 2026' },
    ],
    categories: [
      { id: uid(), name: 'Social',    icon: '🌐', color: '#4af0c4', links: [
        { id: uid(), title: 'YouTube',    url: 'https://youtube.com',    icon: '▶️' },
        { id: uid(), title: 'Twitter/X',  url: 'https://x.com',          icon: '🐦' },
        { id: uid(), title: 'Reddit',     url: 'https://reddit.com',     icon: '🔴' },
      ]},
      { id: uid(), name: 'Work',      icon: '💼', color: '#6e7ef0', links: [
        { id: uid(), title: 'Gmail',      url: 'https://mail.google.com', icon: '📧' },
        { id: uid(), title: 'Notion',     url: 'https://notion.so',       icon: '📝' },
        { id: uid(), title: 'Slack',      url: 'https://slack.com',       icon: '💬' },
      ]},
      { id: uid(), name: 'Dev Tools', icon: '⚙️', color: '#f0b84a', links: [
        { id: uid(), title: 'GitHub',     url: 'https://github.com',      icon: '💻' },
        { id: uid(), title: 'Stack Overflow', url: 'https://stackoverflow.com', icon: '🔍' },
        { id: uid(), title: 'MDN Docs',   url: 'https://developer.mozilla.org', icon: '📖' },
      ]},
      { id: uid(), name: 'News',      icon: '📰', color: '#f06e9e', links: [
        { id: uid(), title: 'Hacker News',url: 'https://news.ycombinator.com', icon: '🔶' },
        { id: uid(), title: 'BBC News',   url: 'https://bbc.com/news',         icon: '📻' },
      ]},
      { id: uid(), name: 'AI Tools',  icon: '🤖', color: '#c47af0', links: [
        { id: uid(), title: 'Claude',     url: 'https://claude.ai',       icon: '🧠' },
        { id: uid(), title: 'ChatGPT',    url: 'https://chat.openai.com', icon: '💬' },
        { id: uid(), title: 'Perplexity', url: 'https://perplexity.ai',   icon: '🔬' },
      ]},
    ]
  });
  saveData(data);
}


/* ──────────────────────────────────────────────────
   BOOT
────────────────────────────────────────────────── */
function boot() {
  seedDemoData();
  const user = getCurrentUser();
  if (user) enterDashboard(user);
  else showScreen('auth-screen');
}

boot();
