/* ═══════════════════════════════════════════════════
   My Space PRO — app.js v5  (Cloud Sync Edition)
   
   ARCHITECTURE:
   ┌─────────────────────────────────────────────────┐
   │  Each user gets their OWN storage key:          │
   │  "user:email@example.com"  →  { userData }      │
   │                                                  │
   │  Registry key "users:registry" tracks all       │
   │  registered accounts (email + hashed password)  │
   │                                                  │
   │  LOGIN FROM ANY DEVICE:                         │
   │  → Pull from storage by email key               │
   │  → All categories, notes, links are there       │
   │                                                  │
   │  EVERY SAVE:                                    │
   │  → Writes to storage immediately (real-time)    │
   │  → Same key → same data on any device           │
   └─────────────────────────────────────────────────┘
   
   Storage keys:
   - "users:registry"  → [{id, name, email, passwordHash}]
   - "user:{email}"    → {id, name, email, categories, notes, ...}
   
   Local only (session):
   - sessionStorage: currentUserEmail
   - localStorage:   fast cache (secondary)
═══════════════════════════════════════════════════ */
'use strict';

/* ══════════════════════════════════════════════════
   CLOUD STORAGE LAYER
   Wraps window.storage (artifact persistent storage)
   with graceful fallback to localStorage
══════════════════════════════════════════════════ */

const Cloud = {
  _hasCloud: typeof window !== 'undefined' && typeof window.storage !== 'undefined',

  async get(key) {
    if (this._hasCloud) {
      try {
        const res = await window.storage.get(key);
        if (res && res.value) return JSON.parse(res.value);
      } catch(e) {}
    }
    // Fallback: localStorage
    try {
      const val = localStorage.getItem('cloud:' + key);
      return val ? JSON.parse(val) : null;
    } catch(e) { return null; }
  },

  async set(key, value) {
    const json = JSON.stringify(value);
    if (this._hasCloud) {
      try {
        await window.storage.set(key, json);
      } catch(e) {}
    }
    // Always also write to localStorage as cache
    try { localStorage.setItem('cloud:' + key, json); } catch(e) {}
  },

  async delete(key) {
    if (this._hasCloud) {
      try { await window.storage.delete(key); } catch(e) {}
    }
    try { localStorage.removeItem('cloud:' + key); } catch(e) {}
  }
};

/* ══════════════════════════════════════════════════
   USER REGISTRY
   Stores the list of all accounts: [{id, name, email, passwordHash}]
   Key: "users:registry" (shared=false per user session is fine;
   we use email-keyed user data as the main source of truth)
══════════════════════════════════════════════════ */

async function getRegistry() {
  return await Cloud.get('users:registry') || [];
}

async function saveRegistry(reg) {
  await Cloud.set('users:registry', reg);
}

function hashPassword(pw) {
  // Simple deterministic hash (not cryptographic — for local-only use)
  let hash = 0;
  for (let i = 0; i < pw.length; i++) {
    hash = ((hash << 5) - hash) + pw.charCodeAt(i);
    hash |= 0;
  }
  return 'h' + Math.abs(hash).toString(36) + pw.length.toString(36);
}

/* ══════════════════════════════════════════════════
   USER DATA STORAGE
   Each user's full data at key "user:{email}"
══════════════════════════════════════════════════ */

function userKey(email) {
  return 'user:' + email.toLowerCase().trim();
}

async function loadUserData(email) {
  return await Cloud.get(userKey(email));
}

async function saveUserData(userData) {
  await Cloud.set(userKey(userData.email), userData);
  // Update local memory
  _currentUser = userData;
}

/* ══════════════════════════════════════════════════
   IN-MEMORY CURRENT USER
══════════════════════════════════════════════════ */
let _currentUser = null;

function getCurrentUser() { return _currentUser; }

async function saveCurrentUser(user) {
  _currentUser = user;
  setSyncState('syncing');
  await saveUserData(user);
  setSyncState('synced');
  updateDataPill('synced');
}

function uid() { return Math.random().toString(36).slice(2,10) + Date.now().toString(36); }

/* ══════════════════════════════════════════════════
   SYNC STATE UI
══════════════════════════════════════════════════ */
let _pillTimer;

function setSyncState(state) {
  const dot  = $('sync-dot');
  const txt  = $('sync-status-text');
  if (!dot || !txt) return;
  dot.className = 'sync-dot ' + state;
  const labels = { syncing:'Syncing…', synced:'Synced ✓', error:'Sync error', offline:'Offline' };
  txt.textContent = labels[state] || state;
}

function updateDataPill(state) {
  const pill = $('data-pill');
  const txt  = $('data-pill-text');
  if (!pill) return;
  pill.className = `data-pill ${state}`;
  const labels = { syncing:'Syncing…', synced:'Synced ✓', error:'Sync Error', saving:'Saving…', saved:'Saved' };
  txt.textContent = labels[state] || state;
  if (state === 'synced' || state === 'saved') {
    clearTimeout(_pillTimer);
    _pillTimer = setTimeout(() => {
      if (pill) pill.className = 'data-pill synced';
      if (txt) txt.textContent = 'Synced ✓';
    }, 2000);
  }
}

/* ══════════════════════════════════════════════════
   EXPORT — download user's data as userN.json
══════════════════════════════════════════════════ */
function exportUserJson() {
  const user = getCurrentUser();
  if (!user) return;
  const output = {
    _info: {
      app:         'My Space PRO',
      version:     '5.0',
      exportedAt:  new Date().toISOString(),
      userEmail:   user.email,
      description: 'Personal data export. Import to restore.'
    },
    userData: user
  };
  const json = JSON.stringify(output, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  // Generate filename: user1.json / user2.json based on name
  const safeName = (user.name || user.email).replace(/[^a-z0-9]/gi,'_').toLowerCase();
  a.download = `${safeName}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`✅ ${a.download} downloaded!`, 'success');
}

/* ══════════════════════════════════════════════════
   IMPORT — restore from backup JSON
══════════════════════════════════════════════════ */
function handleImportFile(file) {
  if (!file || !file.name.endsWith('.json')) {
    showToast('Please select a .json file.', 'error'); return;
  }
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const parsed = JSON.parse(e.target.result);
      // Support both old data.json format and new user export format
      let userData = null;
      if (parsed.userData && parsed.userData.email) {
        userData = parsed.userData;
      } else if (parsed.users && Array.isArray(parsed.users)) {
        // Old format: find matching user
        const cur = getCurrentUser();
        const match = parsed.users.find(u => u.email === cur?.email);
        if (match) userData = match;
        else {
          showToast('No matching user found in old backup.', 'error'); return;
        }
      }
      if (!userData) { showToast('Invalid backup format.', 'error'); return; }
      // Make sure email matches current user
      const cur = getCurrentUser();
      if (cur && userData.email !== cur.email) {
        showToast('This backup belongs to a different account.', 'warn'); return;
      }
      userData.id = userData.id || uid();
      await saveCurrentUser(userData);
      showToast(`✅ Data restored! ${(userData.categories||[]).length} categories, ${(userData.notes||[]).length} notes.`, 'success');
      renderDashboard(searchInput.value);
      renderNotebook();
      populateProfile();
      refreshDataView();
    } catch(err) { showToast('Could not parse JSON file.', 'error'); }
  };
  reader.readAsText(file);
}

/* ══════════════════════════════════════════════════
   FORCE SYNC — pull latest from cloud
══════════════════════════════════════════════════ */
async function forceSyncFromCloud() {
  const cur = getCurrentUser();
  if (!cur) return;
  setSyncState('syncing');
  updateDataPill('syncing');
  const fresh = await loadUserData(cur.email);
  if (fresh) {
    _currentUser = fresh;
    setSyncState('synced');
    updateDataPill('synced');
    showToast('✅ Synced from cloud!', 'success');
    renderDashboard(searchInput.value);
    renderNotebook();
    populateProfile();
    refreshDataView();
  } else {
    setSyncState('error');
    updateDataPill('error');
    showToast('No cloud data found. Your local data is safe.', 'warn');
  }
}

/* ══════════════════════════════════════════════════
   DATA MANAGER VIEW
══════════════════════════════════════════════════ */
function refreshDataView() {
  const user = getCurrentUser();
  if (!user) return;

  // Update file badge with user's name
  const badge = $('user-file-badge');
  if (badge) {
    const safeName = (user.name || user.email).replace(/[^a-z0-9]/gi,'_').toLowerCase();
    badge.textContent = `${safeName}.json`;
  }

  // Stats
  const cats  = (user.categories || []).length;
  const links = (user.categories || []).reduce((s, c) => s + (c.links || []).length, 0);
  const notes = (user.notes || []).length;
  const exportMeta = $('export-meta');
  if (exportMeta) exportMeta.textContent = `${cats} categories · ${links} links · ${notes} notes`;

  // Cloud info
  const cloudSub = $('cloud-info-sub');
  if (cloudSub) {
    const hasCloud = Cloud._hasCloud;
    cloudSub.textContent = hasCloud
      ? `Your data is stored in the cloud under your account (${user.email}). Log in from any device with the same email to access your data.`
      : `Using browser localStorage as storage. Data is device-specific. Cloud sync requires the artifact storage environment.`;
  }

  // JSON preview — mask password
  const preview = $('json-preview');
  if (preview) {
    const safe = JSON.parse(JSON.stringify(user));
    if (safe.password) safe.password = '••••••';
    if (safe.passwordHash) safe.passwordHash = '••••••';
    preview.textContent = JSON.stringify(safe, null, 2);
  }
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
const sidebarOverlay = $('sidebar-overlay');
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
   AUTH — Register
══════════════════════════════════════════════════ */
registerForm.addEventListener('submit', async e => {
  e.preventDefault();
  const name  = $('reg-name').value.trim();
  const email = $('reg-email').value.trim().toLowerCase();
  const pass  = $('reg-password').value;
  registerError.textContent = '';

  if (!name)  { registerError.textContent = 'Name is required.'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { registerError.textContent = 'Invalid email.'; return; }
  if (pass.length < 6) { registerError.textContent = 'Password must be ≥ 6 characters.'; return; }

  setSyncStateBadge('☁️', 'Checking account…');

  // Check if email already registered
  const registry = await getRegistry();
  if (registry.find(u => u.email === email)) {
    registerError.textContent = 'An account with this email already exists. Please sign in.';
    setSyncStateBadge('☁️', 'Cloud sync ready');
    return;
  }

  // Create new user record
  const newUser = {
    id:           uid(),
    name,
    email,
    passwordHash: hashPassword(pass),
    categories:   [],
    notes:        [],
    createdAt:    new Date().toISOString()
  };

  // Save to registry
  registry.push({ id: newUser.id, name, email, passwordHash: newUser.passwordHash });
  await saveRegistry(registry);

  // Save user's own data file
  await Cloud.set(userKey(email), newUser);

  showToast(`✅ Account created! Welcome, ${name}!`, 'success');
  await enterDashboard(newUser);
});

/* ══════════════════════════════════════════════════
   AUTH — Login
══════════════════════════════════════════════════ */
loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('login-email').value.trim().toLowerCase();
  const pass  = $('login-password').value;
  loginError.textContent = '';

  if (!email || !pass) { loginError.textContent = 'Please fill in all fields.'; return; }

  setSyncStateBadge('☁️', 'Signing in…');

  // Check registry
  const registry = await getRegistry();
  const account  = registry.find(u => u.email === email);
  if (!account || account.passwordHash !== hashPassword(pass)) {
    loginError.textContent = 'Invalid email or password.';
    setSyncStateBadge('☁️', 'Cloud sync ready');
    return;
  }

  // Load user's full data from cloud
  setSyncStateBadge('⬆', 'Loading your data…');
  let userData = await loadUserData(email);
  if (!userData) {
    // Fallback: construct from registry entry
    userData = { id: account.id, name: account.name, email, passwordHash: account.passwordHash, categories: [], notes: [] };
  }

  showToast(`✅ Welcome back, ${userData.name}!`, 'success');
  await enterDashboard(userData);
});

function setSyncStateBadge(icon, text) {
  const badge = $('data-source-badge');
  const txt   = $('data-source-text');
  if (!badge || !txt) return;
  badge.querySelector('.ds-icon').textContent = icon;
  txt.textContent = text;
}

/* ══════════════════════════════════════════════════
   SCREENS
══════════════════════════════════════════════════ */
function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

async function enterDashboard(user) {
  _currentUser = user;
  sessionStorage.setItem('currentUserEmail', user.email);

  populateSidebar(user);
  setGreeting(user);
  showScreen('dashboard-screen');
  renderDashboard('');
  renderNotebook();
  populateProfile();
  refreshDataView();
  setSyncState('synced');
  updateDataPill('synced');
  initWeather();
  initClock();
}

function populateSidebar(user) {
  sidebarAvatar.textContent = user.name.charAt(0).toUpperCase();
  sidebarName.textContent   = user.name;
  sidebarEmail.textContent  = user.email;
}

function setGreeting(user) {
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  greeting.textContent = `${g}, ${user.name.split(' ')[0]} 👋`;
}

/* ══════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════ */
document.querySelector('.sidebar-nav').addEventListener('click', e => {
  const item = e.target.closest('.nav-item');
  if (!item) return;
  e.preventDefault();
  const view = item.dataset.view;
  $$('.nav-item').forEach(i => i.classList.remove('active'));
  item.classList.add('active');
  $$('.view').forEach(v => v.classList.remove('active'));
  $('view-' + view).classList.add('active');
  if (view === 'data') refreshDataView();
  if (view === 'profile') populateProfile();
  if (window.innerWidth <= 768) closeSidebar();
});

// Auth tabs
$$('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    $$('.auth-form').forEach(f => f.classList.remove('active'));
    $(`${tab.dataset.tab}-form`).classList.add('active');
  });
});

// Sidebar
sidebarOpen.addEventListener('click', openSidebar);
sidebarClose.addEventListener('click', closeSidebar);
if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
function openSidebar()  { sidebar.classList.add('open'); if(sidebarOverlay) sidebarOverlay.classList.add('active'); }
function closeSidebar() { sidebar.classList.remove('open'); if(sidebarOverlay) sidebarOverlay.classList.remove('active'); }

// Logout
logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem('currentUserEmail');
  _currentUser = null;
  showScreen('auth-screen');
  loginError.textContent = '';
  $('login-email').value = '';
  $('login-password').value = '';
  showToast('Signed out successfully.', 'success');
});

// Quick export
$('quick-export-btn').addEventListener('click', exportUserJson);
$('export-btn')?.addEventListener('click', exportUserJson);

// Import
$('import-file')?.addEventListener('change', e => { if(e.target.files[0]) handleImportFile(e.target.files[0]); });

// Force sync
$('reload-btn')?.addEventListener('click', forceSyncFromCloud);

/* ══════════════════════════════════════════════════
   DASHBOARD RENDER
══════════════════════════════════════════════════ */
function renderDashboard(query = '') {
  const user = getCurrentUser();
  if (!user) return;
  const cats = user.categories || [];
  const term = (query || '').toLowerCase().trim();

  if (searchBanner && searchTermDisplay) {
    searchBanner.style.display  = term ? 'flex' : 'none';
    searchTermDisplay.textContent = term;
  }

  const filtered = term
    ? cats.map(cat => {
        const links = (cat.links || []).filter(l =>
          l.title.toLowerCase().includes(term) || l.url.toLowerCase().includes(term) || cat.name.toLowerCase().includes(term));
        return links.length || cat.name.toLowerCase().includes(term) ? { ...cat, links: links.length ? links : cat.links } : null;
      }).filter(Boolean)
    : cats;

  emptyState.style.display     = filtered.length === 0 && !term ? 'block' : 'none';
  categoriesGrid.style.display = filtered.length === 0 && !term ? 'none'  : 'grid';
  categoriesGrid.innerHTML     = '';

  filtered.forEach((cat, idx) => {
    const links = cat.links || [];
    const card  = document.createElement('div');
    card.className = 'category-card';
    card.style.setProperty('--cat-color', cat.color || '#4af0c4');
    card.style.animationDelay = `${idx * 0.04}s`;

    const linksHtml = links.length
      ? links.map((l, li) => `
          <div class="link-item" style="animation-delay:${li*0.03}s">
            <div class="link-icon-wrap">${escHtml(l.icon||'🔗')}</div>
            <a href="${escHtml(l.url)}" class="link-anchor" target="_blank" rel="noopener">${term ? highlightText(escHtml(l.title),term) : escHtml(l.title)}</a>
            <div class="link-actions">
              <button class="link-action-btn edit-link-btn" data-lid="${l.id}" data-cid="${cat.id}" title="Edit">✏</button>
              <button class="link-action-btn delete delete-link-btn" data-lid="${l.id}" data-cid="${cat.id}" title="Delete">🗑</button>
            </div>
          </div>`).join('')
      : `<div class="no-links">No links yet</div>`;

    card.innerHTML = `
      <div class="card-header">
        <div class="card-icon">${escHtml(cat.icon||'🌐')}</div>
        <div class="card-title">${term ? highlightText(escHtml(cat.name),term) : escHtml(cat.name)}</div>
        <div class="card-color-dot"></div>
        <div class="card-actions">
          <button class="card-action-btn edit-cat-btn" data-id="${cat.id}" title="Edit category">✏</button>
          <button class="card-action-btn delete delete-cat-btn" data-id="${cat.id}" title="Delete category">🗑</button>
        </div>
      </div>
      <div class="links-count-badge">
        <span>${links.length} link${links.length!==1?'s':''}</span>
      </div>
      <div class="links-list-wrap">
        <div class="links-list">${linksHtml}</div>
      </div>
      <div class="add-link-row">
        <button class="btn-add-link" data-cid="${cat.id}">+ Add Link</button>
      </div>`;

    // Scroll shadow
    const list = card.querySelector('.links-list');
    const wrap = card.querySelector('.links-list-wrap');
    list.addEventListener('scroll', () => wrap.classList.toggle('scrollable', list.scrollTop > 0));

    categoriesGrid.appendChild(card);
  });

  // Event delegation
  categoriesGrid.addEventListener('click', handleDashboardClick);
}

function handleDashboardClick(e) {
  if (e.target.closest('.edit-cat-btn'))  { openEditCategory(e.target.closest('.edit-cat-btn').dataset.id); return; }
  if (e.target.closest('.delete-cat-btn')){ confirmDeleteCategory(e.target.closest('.delete-cat-btn').dataset.id); return; }
  if (e.target.closest('.btn-add-link'))  { openAddLink(e.target.closest('.btn-add-link').dataset.cid); return; }
  if (e.target.closest('.edit-link-btn')) { const b=e.target.closest('.edit-link-btn'); openEditLink(b.dataset.lid,b.dataset.cid); return; }
  if (e.target.closest('.delete-link-btn')){ const b=e.target.closest('.delete-link-btn'); confirmDeleteLink(b.dataset.lid,b.dataset.cid); return; }
}

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
  picker.querySelectorAll('.color-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === color);
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
   CATEGORY CRUD
══════════════════════════════════════════════════ */
addCategoryBtn.addEventListener('click', openNewCategory);
$('empty-add-btn').addEventListener('click', openNewCategory);

function openNewCategory() {
  state.editingCategoryId=null; state.selectedCatEmoji='🌐'; state.selectedCatColor='#4af0c4';
  categoryModalTitle.textContent='New Category'; categoryNameInput.value=''; categoryModalError.textContent='';
  resetColorPicker('cat-color-picker','cat-custom-color','cat-color-preview','#4af0c4');
  resetEmojiPicker('cat-emoji-picker','🌐');
  openModal(categoryModal); setTimeout(()=>categoryNameInput.focus(),80);
}
function openEditCategory(catId) {
  const user=getCurrentUser(); const cat=user.categories.find(c=>c.id===catId); if(!cat)return;
  state.editingCategoryId=catId; state.selectedCatEmoji=cat.icon||'🌐'; state.selectedCatColor=cat.color||'#4af0c4';
  categoryModalTitle.textContent='Edit Category'; categoryNameInput.value=cat.name; categoryModalError.textContent='';
  resetColorPicker('cat-color-picker','cat-custom-color','cat-color-preview',state.selectedCatColor);
  resetEmojiPicker('cat-emoji-picker',state.selectedCatEmoji);
  openModal(categoryModal); setTimeout(()=>categoryNameInput.focus(),80);
}
saveCategoryBtn.addEventListener('click', async () => {
  const name = categoryNameInput.value.trim();
  if(!name){categoryModalError.textContent='Name is required.';return;}
  const user = getCurrentUser();
  if(state.editingCategoryId){
    const cat = user.categories.find(c=>c.id===state.editingCategoryId);
    if(cat){cat.name=name;cat.icon=state.selectedCatEmoji;cat.color=state.selectedCatColor;}
    showToast('Category updated!');
  } else {
    user.categories.push({id:uid(),name,icon:state.selectedCatEmoji,color:state.selectedCatColor,links:[]});
    showToast('Category created!');
  }
  await saveCurrentUser(user);
  closeModal(categoryModal);
  renderDashboard(searchInput.value);
});
function confirmDeleteCategory(catId) {
  const user=getCurrentUser(); const cat=user.categories.find(c=>c.id===catId);
  confirmMessage.textContent=`Delete category "${cat?.name}"? All links will be lost.`;
  state.pendingDeleteFn=async ()=>{
    user.categories=user.categories.filter(c=>c.id!==catId);
    await saveCurrentUser(user);
    closeModal(confirmModal); renderDashboard(searchInput.value); showToast('Category deleted.','error');
  }; openModal(confirmModal);
}

/* ══════════════════════════════════════════════════
   LINK CRUD
══════════════════════════════════════════════════ */
function openAddLink(catId) {
  state.editingLinkId=null; state.editingLinkCatId=catId; state.selectedLinkEmoji='🔗';
  linkModalTitle.textContent='New Link'; linkTitleInput.value=linkUrlInput.value=''; linkModalError.textContent='';
  resetEmojiPicker('link-emoji-picker','🔗'); openModal(linkModal); setTimeout(()=>linkTitleInput.focus(),80);
}
function openEditLink(linkId,catId) {
  const user=getCurrentUser(); const cat=user.categories.find(c=>c.id===catId); const link=cat?.links.find(l=>l.id===linkId); if(!link)return;
  state.editingLinkId=linkId; state.editingLinkCatId=catId; state.selectedLinkEmoji=link.icon||'🔗';
  linkModalTitle.textContent='Edit Link'; linkTitleInput.value=link.title; linkUrlInput.value=link.url; linkModalError.textContent='';
  resetEmojiPicker('link-emoji-picker',state.selectedLinkEmoji); openModal(linkModal); setTimeout(()=>linkTitleInput.focus(),80);
}
saveLinkBtn.addEventListener('click', async () => {
  const title=linkTitleInput.value.trim(); let url=linkUrlInput.value.trim();
  if(!title){linkModalError.textContent='Title required.';return;}
  if(!url){linkModalError.textContent='URL required.';return;}
  if(!/^https?:\/\//i.test(url)) url='https://'+url;
  const user=getCurrentUser(); const cat=user.categories.find(c=>c.id===state.editingLinkCatId); if(!cat)return;
  if(state.editingLinkId){
    const link=cat.links.find(l=>l.id===state.editingLinkId);
    if(link){link.title=title;link.url=url;link.icon=state.selectedLinkEmoji;} showToast('Link updated!');
  } else {
    cat.links.push({id:uid(),title,url,icon:state.selectedLinkEmoji}); showToast('Link added!');
  }
  await saveCurrentUser(user); closeModal(linkModal); renderDashboard(searchInput.value);
});
function confirmDeleteLink(linkId,catId) {
  const user=getCurrentUser(); const cat=user.categories.find(c=>c.id===catId); const link=cat?.links.find(l=>l.id===linkId);
  confirmMessage.textContent=`Delete link "${link?.title}"?`;
  state.pendingDeleteFn=async ()=>{
    cat.links=cat.links.filter(l=>l.id!==linkId);
    await saveCurrentUser(user); closeModal(confirmModal); renderDashboard(searchInput.value); showToast('Link deleted.','error');
  }; openModal(confirmModal);
}
confirmOkBtn.addEventListener('click', async () => {
  if(typeof state.pendingDeleteFn==='function'){await state.pendingDeleteFn();state.pendingDeleteFn=null;}
});

/* ══════════════════════════════════════════════════
   NOTEBOOK CRUD
══════════════════════════════════════════════════ */
addNoteBtn.addEventListener('click', openNewNote);
$('notebook-empty-add-btn').addEventListener('click', openNewNote);

function openNewNote() {
  state.editingNoteId=null; state.selectedNoteColor='#171d2d';
  noteModalTitle.textContent='New Note'; noteTitleInput.value=''; noteEditor.innerHTML=''; noteModalError.textContent='';
  resetColorPicker('note-color-picker','note-custom-color',null,'#171d2d');
  openModal(noteModal); setTimeout(()=>noteTitleInput.focus(),80);
}
function openEditNote(noteId) {
  const user=getCurrentUser(); const note=user.notes?.find(n=>n.id===noteId); if(!note)return;
  state.editingNoteId=noteId; state.selectedNoteColor=note.color||'#171d2d';
  noteModalTitle.textContent='Edit Note'; noteTitleInput.value=note.title; noteEditor.innerHTML=note.content||''; noteModalError.textContent='';
  resetColorPicker('note-color-picker','note-custom-color',null,state.selectedNoteColor);
  openModal(noteModal); setTimeout(()=>noteTitleInput.focus(),80);
}
function openViewNote(noteId) {
  const user=getCurrentUser(); const note=user.notes?.find(n=>n.id===noteId); if(!note)return;
  state.viewingNoteId=noteId; noteViewTitle.textContent=note.title;
  noteViewContent.innerHTML=note.content||'<p><em>Empty note</em></p>';
  openModal(noteViewModal);
}
noteViewEditBtn.addEventListener('click',()=>{closeModal(noteViewModal);openEditNote(state.viewingNoteId);});

saveNoteBtn.addEventListener('click', async () => {
  const title=noteTitleInput.value.trim(); const content=noteEditor.innerHTML.trim();
  if(!title){noteModalError.textContent='Title required.';return;}
  const user=getCurrentUser(); if(!user.notes) user.notes=[];
  const now=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  if(state.editingNoteId){
    const note=user.notes.find(n=>n.id===state.editingNoteId);
    if(note){note.title=title;note.content=content;note.color=state.selectedNoteColor;note.updatedAt=now;}
    showToast('Note updated!');
  } else {
    user.notes.push({id:uid(),title,content,color:state.selectedNoteColor,createdAt:now,updatedAt:now});
    showToast('Note saved!');
  }
  await saveCurrentUser(user); closeModal(noteModal); renderNotebook();
});

function confirmDeleteNote(noteId) {
  const user=getCurrentUser(); const note=user.notes?.find(n=>n.id===noteId);
  confirmMessage.textContent=`Delete note "${note?.title}"?`;
  state.pendingDeleteFn=async ()=>{
    user.notes=user.notes.filter(n=>n.id!==noteId);
    await saveCurrentUser(user); closeModal(confirmModal); renderNotebook(); showToast('Note deleted.','error');
  }; openModal(confirmModal);
}

function renderNotebook() {
  const user=getCurrentUser(); if(!user)return;
  const notes=user.notes||[];
  notebookGrid.innerHTML='';
  notebookEmpty.style.display=notes.length===0?'block':'none';
  notebookGrid.style.display=notes.length===0?'none':'grid';
  notes.forEach((note,idx)=>{
    const card=document.createElement('div');
    card.className='note-card'; card.style.background=note.color||'#171d2d';
    card.style.animationDelay=`${idx*0.04}s`;
    card.innerHTML=`
      <div class="note-card-header">
        <div class="note-card-title">${escHtml(note.title)}</div>
        <div class="note-card-actions">
          <button class="card-action-btn edit-note-btn" data-id="${note.id}">✏</button>
          <button class="card-action-btn delete delete-note-btn" data-id="${note.id}">🗑</button>
        </div>
      </div>
      <div class="note-card-body">${note.content||'<em style="color:var(--txt-muted)">Empty note</em>'}</div>
      <div class="note-card-footer">
        <span>${note.updatedAt?`Updated ${note.updatedAt}`:note.createdAt||''}</span>
        <button class="note-card-open-btn open-note-btn" data-id="${note.id}">Open ↗</button>
      </div>`;
    notebookGrid.appendChild(card);
  });
}
notebookGrid.addEventListener('click',e=>{
  if(e.target.closest('.edit-note-btn')){openEditNote(e.target.closest('.edit-note-btn').dataset.id);return;}
  if(e.target.closest('.delete-note-btn')){confirmDeleteNote(e.target.closest('.delete-note-btn').dataset.id);return;}
  if(e.target.closest('.open-note-btn')){openViewNote(e.target.closest('.open-note-btn').dataset.id);return;}
});

/* ══════════════════════════════════════════════════
   SEARCH
══════════════════════════════════════════════════ */
searchInput.addEventListener('input',()=>{
  const t=searchInput.value;
  searchClear.classList.toggle('visible',t.length>0);
  renderDashboard(t);
});
searchClear.addEventListener('click',clearSearch);
clearSearchBtn.addEventListener('click',clearSearch);
function clearSearch(){searchInput.value='';searchClear.classList.remove('visible');renderDashboard('');}

/* ══════════════════════════════════════════════════
   PROFILE
══════════════════════════════════════════════════ */
function populateProfile() {
  const user=getCurrentUser(); if(!user)return;
  profileAvatar.textContent=user.name.charAt(0).toUpperCase();
  profileNameInput.value=user.name; profileEmailInput.value=user.email; profilePassInput.value='';
  profileError.textContent=profileSuccess.textContent='';
  statCategories.textContent=(user.categories||[]).length;
  statLinks.textContent=(user.categories||[]).reduce((s,c)=>s+c.links.length,0);
  statNotes.textContent=(user.notes||[]).length;
}
saveProfileBtn.addEventListener('click', async () => {
  const name=profileNameInput.value.trim();
  const email=profileEmailInput.value.trim().toLowerCase();
  const pass=profilePassInput.value;
  profileError.textContent=profileSuccess.textContent='';
  if(!name){profileError.textContent='Name required.';return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){profileError.textContent='Invalid email.';return;}
  if(pass&&pass.length<6){profileError.textContent='Password ≥ 6 chars.';return;}

  const user=getCurrentUser();
  const oldEmail=user.email;

  // If email changed, update registry and move data key
  if(email !== oldEmail) {
    const registry=await getRegistry();
    const entry=registry.find(u=>u.id===user.id);
    if(registry.find(u=>u.email===email&&u.id!==user.id)){profileError.textContent='Email already in use.';return;}
    if(entry) entry.email=email;
    user.email=email;
    await saveRegistry(registry);
    // Copy data to new key, delete old key
    await Cloud.set(userKey(email), user);
    await Cloud.delete(userKey(oldEmail));
    sessionStorage.setItem('currentUserEmail', email);
  }

  user.name=name; user.email=email;
  if(pass) user.passwordHash=hashPassword(pass);
  await saveCurrentUser(user);
  populateSidebar(user);
  setGreeting(user);
  profileSuccess.textContent='✓ Saved & synced!';
  showToast('Profile updated!');
});

/* ══════════════════════════════════════════════════
   RICH TEXT EDITOR
══════════════════════════════════════════════════ */
function initRichEditor() {
  const toolbar = $('editor-toolbar');
  if (!toolbar) return;

  toolbar.addEventListener('click', e => {
    const btn = e.target.closest('.tb[data-cmd]');
    if (btn) { e.preventDefault(); document.execCommand(btn.dataset.cmd, false, null); noteEditor.focus(); }
  });

  $('block-format')?.addEventListener('change', e => {
    document.execCommand('formatBlock', false, e.target.value); noteEditor.focus();
  });
  $('font-family')?.addEventListener('change', e => {
    document.execCommand('fontName', false, e.target.value); noteEditor.focus();
  });
  $('font-size')?.addEventListener('change', e => {
    document.execCommand('fontSize', false, '7');
    const sel = window.getSelection();
    if (sel.rangeCount) {
      const range = sel.getRangeAt(0);
      const span = document.createElement('span');
      span.style.fontSize = e.target.value;
      try { range.surroundContents(span); } catch(err) {}
    }
    noteEditor.focus();
  });

  $('text-color-picker')?.addEventListener('input', e => {
    document.execCommand('foreColor', false, e.target.value);
    $('text-color-icon').style.borderBottomColor = e.target.value;
  });
  $('bg-color-picker')?.addEventListener('input', e => {
    document.execCommand('backColor', false, e.target.value);
    $('bg-color-icon').style.background = e.target.value + '44';
  });

  $('insert-link-btn')?.addEventListener('click', () => {
    const url = prompt('Enter URL:'); if(url) document.execCommand('createLink', false, url);
    noteEditor.focus();
  });
  $('insert-hr-btn')?.addEventListener('click', () => {
    document.execCommand('insertHorizontalRule'); noteEditor.focus();
  });
}

/* ══════════════════════════════════════════════════
   WEATHER + CLOCK
══════════════════════════════════════════════════ */
function initClock() {
  function tick() {
    const now = new Date();
    const cl  = $('clock');
    const dt  = $('weather-date');
    if(cl) cl.textContent = now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    if(dt) dt.textContent = now.toLocaleDateString([],{weekday:'short',day:'numeric',month:'short',year:'numeric'});
  }
  tick(); setInterval(tick, 1000);
}

async function initWeather() {
  try {
    const res  = await fetch('https://api.open-meteo.com/v1/forecast?latitude=34.037&longitude=-5.001&current_weather=true');
    const data = await res.json();
    const cw   = data.current_weather;
    const icons = { 0:'☀️',1:'🌤',2:'⛅',3:'☁️',45:'🌫',48:'🌫',51:'🌦',61:'🌧',71:'🌨',80:'🌦',95:'⛈' };
    const wc = cw.weathercode;
    const icon = icons[wc] || icons[Math.floor(wc/10)*10] || '🌡';
    const wi = $('weather-icon'); const wt = $('weather-temp'); const wd = $('weather-desc');
    if(wi) wi.textContent = icon;
    if(wt) wt.textContent = `${Math.round(cw.temperature)}°C`;
    if(wd) wd.textContent = cw.windspeed < 10 ? 'calm winds' : `${Math.round(cw.windspeed)} km/h wind`;
  } catch(e) {
    const wt=$('weather-temp'); if(wt) wt.textContent='--°C';
  }
}

/* ══════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
══════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if(e.key==='Escape'){ $$('.modal-backdrop.open').forEach(m=>closeModal(m)); return; }
  if((e.ctrlKey||e.metaKey)&&e.key==='k'){ e.preventDefault(); searchInput.focus(); }
  if((e.ctrlKey||e.metaKey)&&e.key==='e'){ e.preventDefault(); exportUserJson(); }
  if(e.key==='Enter'&&document.activeElement!==noteEditor){
    if(categoryModal.classList.contains('open')&&document.activeElement===categoryNameInput) saveCategoryBtn.click();
    if(linkModal.classList.contains('open')&&document.activeElement!==linkUrlInput) saveLinkBtn.click();
  }
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
  // Init pickers and editor
  initColorPicker('cat-color-picker','cat-custom-color','cat-color-preview',c=>{state.selectedCatColor=c;});
  initColorPicker('note-color-picker','note-custom-color',null,c=>{state.selectedNoteColor=c;});
  initEmojiPicker('cat-emoji-picker',e=>{state.selectedCatEmoji=e;});
  initEmojiPicker('link-emoji-picker',e=>{state.selectedLinkEmoji=e;});
  initRichEditor();

  // Check for returning session
  const savedEmail = sessionStorage.getItem('currentUserEmail');
  if (savedEmail) {
    setSyncStateBadge('☁️', 'Resuming session…');
    const userData = await loadUserData(savedEmail);
    if (userData) {
      const loadingScreen = $('loading-screen');
      loadingScreen.classList.add('fade-out');
      setTimeout(()=>{ loadingScreen.style.display='none'; }, 420);
      await enterDashboard(userData);
      return;
    }
  }

  // Check if there's any account data from old data.json import
  // (migration support)
  setSyncStateBadge('☁️', 'Cloud sync ready');

  const loadingScreen = $('loading-screen');
  loadingScreen.classList.add('fade-out');
  setTimeout(()=>{ loadingScreen.style.display='none'; }, 420);
  showScreen('auth-screen');
}

boot();
