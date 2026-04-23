/* ============================================================
   MoM App — app.js
   Minutes of Meeting — Pure JS, no frameworks
   ============================================================ */

'use strict';

// ============================================================
// STATE
// ============================================================
let records    = [];
let activeId   = null;
let theme      = 'word';
let listMode   = 'all';
let saveTimer  = null;
let undoTimer  = null;
let deletedMoM = null;
let importBuf  = null;

const THEMES = ['word', 'dark'];

function toBoolean(value) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0' || value == null) return false;
  return Boolean(value);
}

function normalizeAction(action = {}) {
  return {
    task: action.task || '',
    owner: action.owner || '',
    due: action.due || '',
    completed: toBoolean(action.completed),
  };
}

function normalizeRecord(record = {}) {
  return {
    ...record,
    actions: Array.isArray(record.actions) ? record.actions.map(normalizeAction) : [],
  };
}

// ============================================================
// INIT
// ============================================================
function init() {
  records  = JSON.parse(localStorage.getItem('mom_records') || '[]').map(normalizeRecord);
  theme    = localStorage.getItem('mom_theme')     || 'word';
  activeId = localStorage.getItem('mom_active_id') || null;
  listMode = localStorage.getItem('mom_list_mode') || 'all';

  if (!THEMES.includes(theme)) {
    theme = 'word';
    localStorage.setItem('mom_theme', theme);
  }

  if (!['all', 'followups', 'tasks'].includes(listMode)) {
    listMode = 'all';
    localStorage.setItem('mom_list_mode', listMode);
  }

  persist();

  applyTheme();
  setupDatePickers();
  syncListModeUI();
  renderList();
  renderTaskDashboard();

  if (listMode === 'tasks') {
    showTaskDashboard();
  } else if (activeId && records.find(r => r.id === activeId)) {
    loadEditor(activeId);
  } else {
    showEmptyState();
  }

  setupKeyboardShortcuts();
}

// ============================================================
// THEME
// ============================================================
function applyTheme() {
  document.body.setAttribute('data-theme', theme);
}

function cycleTheme() {
  const i = THEMES.indexOf(theme);
  theme = THEMES[(i + 1) % THEMES.length];
  localStorage.setItem('mom_theme', theme);
  applyTheme();
}

// ============================================================
// UUID
// ============================================================
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ============================================================
// DATE / TIME HELPERS
// ============================================================
function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function todayDateLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function currentTime() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatDate(d) {
  if (!d) return '';
  const [, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(day, 10)}`;
}

function followUpStatus(dateStr) {
  if (!dateStr) return '';
  const today = todayDateLocal();
  if (dateStr < today) return 'overdue';
  if (dateStr === today) return 'today';
  return 'upcoming';
}

function followUpStatusLabel(status) {
  return ({
    overdue: 'Overdue',
    today: 'Today',
    upcoming: 'Upcoming'
  })[status] || '';
}

function taskDueStatus(dateStr) {
  if (!dateStr) return 'nodue';
  const today = todayDateLocal();
  if (dateStr < today) return 'overdue';
  if (dateStr === today) return 'today';
  return 'upcoming';
}

function taskDueStatusLabel(status) {
  return ({
    overdue: 'Overdue',
    today: 'Today',
    upcoming: 'Upcoming',
    nodue: 'No due date'
  })[status] || 'No due date';
}

function taskUrgencyRank(action) {
  return ({
    overdue: 0,
    today: 1,
    upcoming: 2,
    nodue: 3
  })[taskDueStatus(action.due)];
}

function compareTasksByUrgency(a, b) {
  const rankDiff = taskUrgencyRank(a) - taskUrgencyRank(b);
  if (rankDiff !== 0) return rankDiff;

  const aDue = a.due || '9999-12-31';
  const bDue = b.due || '9999-12-31';
  if (aDue !== bDue) return aDue.localeCompare(bDue);

  return (a.task || '').localeCompare(b.task || '');
}

function compareMeetingsByTaskUrgency(a, b) {
  const aTasks = getSortedIncompleteActions(a);
  const bTasks = getSortedIncompleteActions(b);

  const leadCompare = compareTasksByUrgency(aTasks[0], bTasks[0]);
  if (leadCompare !== 0) return leadCompare;

  const countCompare = aTasks.length - bTasks.length;
  if (countCompare !== 0) return countCompare;

  return (a.title || '').localeCompare(b.title || '');
}

// ============================================================
// CUSTOM DATE / TIME PICKER ENGINE
// ============================================================
const MONTHS_LONG  = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
                      'Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_ABBR     = ['Su','Mo','Tu','We','Th','Fr','Sa'];

// Registries:  wrapId → state object
const dpState = {};  // date pickers
const tpState = {};  // time pickers

// ── Display formatters ──
function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}

function formatTimeDisplay(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12    = h % 12 || 12;
  return `${h12}:${pad(m)} ${period}`;
}

// ── Close all open pickers ──
function closeAllPickers() {
  document.querySelectorAll('.dp-popup, .tp-popup')
    .forEach(el => el.classList.add('hidden'));
}

// ── Position popup anchored to the trigger while staying on-screen ──
function positionPopup(wrapId, popEl) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;

  const rect  = wrap.getBoundingClientRect();
  const popW  = popEl.offsetWidth  || 280;
  const popH  = popEl.offsetHeight || 300;
  const vw    = window.innerWidth;
  const vh    = window.innerHeight;
  const GAP   = 8;
  const EDGE  = 10;

  const spaceBelow = vh - rect.bottom - EDGE;
  const spaceAbove = rect.top - EDGE;

  // Default: open below the trigger
  let top  = rect.bottom + GAP;
  let left = rect.left;

  // Prefer below; flip only when above has clearly more room.
  if (spaceBelow < popH && spaceAbove > spaceBelow) {
    top = rect.top - popH - GAP;
  }

  // Keep within viewport if neither side fully fits.
  top = Math.min(top, vh - popH - EDGE);
  top = Math.max(EDGE, top);

  // If there isn't enough space to the right, align the popup's right edge
  // with the trigger so it still feels attached to the field.
  if (left + popW > vw - EDGE) left = rect.right - popW;

  // Keep within right edge after alignment adjustment
  if (left + popW > vw - EDGE) left = vw - popW - EDGE;

  // Keep within left edge
  if (left < EDGE) left = EDGE;

  popEl.style.top  = `${top}px`;
  popEl.style.left = `${left}px`;
}

// ──────────────────────────────
// DATE PICKER
// ──────────────────────────────
function initDatePicker(wrapId, onSelect) {
  const now = new Date();
  dpState[wrapId] = { value: '', viewY: now.getFullYear(), viewM: now.getMonth(), onSelect };
}

function dpSetValue(wrapId, dateStr) {
  const s = dpState[wrapId];
  if (!s) return;
  s.value = dateStr || '';
  if (dateStr) {
    const [y, m] = dateStr.split('-').map(Number);
    s.viewY = y;
    s.viewM = m - 1;
  }
  const el = document.getElementById(`${wrapId}-val`);
  if (!el) return;
  const display = formatDateDisplay(dateStr);
  el.textContent = display || 'Select date';
  el.classList.toggle('dp-placeholder', !display);
}

function dpOpen(wrapId) {
  closeAllPickers();
  dpRender(wrapId);
  const pop = document.getElementById(`${wrapId}-pop`);
  pop.classList.remove('hidden');
  positionPopup(wrapId, pop);
}

function dpRender(wrapId) {
  const s   = dpState[wrapId];
  const pop = document.getElementById(`${wrapId}-pop`);
  if (!s || !pop) return;

  const { viewY: y, viewM: m, value } = s;
  const today    = new Date();
  const firstDay = new Date(y, m, 1).getDay();
  const lastDay  = new Date(y, m + 1, 0).getDate();

  let cells = '';
  for (let i = 0; i < firstDay; i++) {
    cells += `<div class="dp-cell dp-empty"></div>`;
  }
  for (let d = 1; d <= lastDay; d++) {
    const ds  = `${y}-${pad(m + 1)}-${pad(d)}`;
    let   cls = 'dp-cell';
    if (today.getFullYear() === y && today.getMonth() === m && today.getDate() === d) cls += ' dp-today';
    if (value === ds) cls += ' dp-selected';
    cells += `<div class="${cls}" onclick="dpPick('${wrapId}','${ds}')">${d}</div>`;
  }

  pop.innerHTML = `
    <div class="dp-header">
      <button class="dp-nav" onclick="dpNav('${wrapId}',-1)">&#8249;</button>
      <span class="dp-my">${MONTHS_LONG[m]} ${y}</span>
      <button class="dp-nav" onclick="dpNav('${wrapId}',1)">&#8250;</button>
    </div>
    <div class="dp-grid">
      ${DAY_ABBR.map(n => `<div class="dp-dn">${n}</div>`).join('')}
      ${cells}
    </div>
    <div class="dp-foot">
      <button class="dp-foot-btn" onclick="dpPick('${wrapId}','')">Clear</button>
      <button class="dp-foot-btn dp-foot-today" onclick="dpPick('${wrapId}','${todayDate()}')">Today</button>
    </div>`;
}

function dpNav(wrapId, dir) {
  const s = dpState[wrapId];
  if (!s) return;
  s.viewM += dir;
  if (s.viewM > 11) { s.viewM = 0;  s.viewY++; }
  if (s.viewM <  0) { s.viewM = 11; s.viewY--; }
  dpRender(wrapId);
}

function dpPick(wrapId, dateStr) {
  const s = dpState[wrapId];
  if (!s) return;
  dpSetValue(wrapId, dateStr);
  document.getElementById(`${wrapId}-pop`).classList.add('hidden');
  if (s.onSelect) s.onSelect(dateStr);
}

// ──────────────────────────────
// TIME PICKER  (single-column slot list — click once to confirm + close)
// ──────────────────────────────

// All 30-min slots across 24h, pre-built once
const TIME_SLOTS = (() => {
  const slots = [];
  for (let h = 0; h < 24; h++) {
    slots.push(`${pad(h)}:00`);
    slots.push(`${pad(h)}:30`);
  }
  return slots; // 48 entries
})();

function initTimePicker(wrapId, onSelect) {
  tpState[wrapId] = { value: '', onSelect };
}

function tpSetValue(wrapId, timeStr) {
  const s = tpState[wrapId];
  if (!s) return;
  s.value = timeStr || '';
  const el = document.getElementById(`${wrapId}-val`);
  if (!el) return;
  const display = formatTimeDisplay(timeStr);
  el.textContent = display || 'Select time';
  el.classList.toggle('dp-placeholder', !display);
}

function tpOpen(wrapId) {
  closeAllPickers();
  tpRender(wrapId);
  const pop = document.getElementById(`${wrapId}-pop`);
  pop.classList.remove('hidden');
  positionPopup(wrapId, pop);
  // Scroll the selected (or nearest) slot into the centre of the list
  setTimeout(() => {
    const sel = pop.querySelector('.tp-item.tp-sel') || pop.querySelector('.tp-item');
    if (sel) sel.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, 20);
}

function tpRender(wrapId) {
  const s   = tpState[wrapId];
  const pop = document.getElementById(`${wrapId}-pop`);
  if (!s || !pop) return;

  const items = TIME_SLOTS.map(slot => {
    const isSel = s.value === slot;
    return `<div class="tp-item${isSel ? ' tp-sel' : ''}" onclick="tpPick('${wrapId}','${slot}')">${formatTimeDisplay(slot)}</div>`;
  }).join('');

  pop.innerHTML = `<div class="tp-list">${items}</div>`;
}

// Single action: pick a slot → update display → close → save
function tpPick(wrapId, timeStr) {
  const s = tpState[wrapId];
  if (!s) return;
  tpSetValue(wrapId, timeStr);
  document.getElementById(`${wrapId}-pop`).classList.add('hidden');
  if (s.onSelect) s.onSelect(timeStr);
}

// ── Wire up pickers for main editor fields ──
function setupDatePickers() {
  initDatePicker('dp-date',     v => handleChange('date', v));
  initTimePicker('tp-time',     v => handleChange('time', v));
  initDatePicker('dp-followup', v => handleChange('nextFollowUp', v));

  // Close pickers when clicking outside any picker
  document.addEventListener('click', e => {
    if (!e.target.closest('.dp-wrap') && !e.target.closest('.tp-wrap')) {
      closeAllPickers();
    }
  });
}

// ============================================================
// ESCAPE HTML
// ============================================================
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// SAVE TO LOCALSTORAGE
// ============================================================
function persist() {
  localStorage.setItem('mom_records', JSON.stringify(records));
}

// ============================================================
// "SAVED" INDICATOR
// ============================================================
function flashSaved() {
  const el = document.getElementById('saved-indicator');
  el.classList.add('visible');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => el.classList.remove('visible'), 2000);
}

// ============================================================
// CREATE NEW MOM
// ============================================================
function createNewMoM() {
  const mom = {
    id:            uuid(),
    title:         '',
    date:          todayDate(),
    time:          currentTime(),
    attendees:     '',
    discussion:    '',
    actions:       [],
    nextFollowUp:  '',
    followUpNotes: '',
    createdAt:     new Date().toISOString(),
    updatedAt:     new Date().toISOString(),
  };

  records.unshift(mom);
  persist();
  if (listMode === 'tasks') {
    listMode = 'all';
    localStorage.setItem('mom_list_mode', listMode);
    syncListModeUI();
  }
  renderList();
  renderTaskDashboard();
  loadEditor(mom.id);
  closeSidebar();

  setTimeout(() => {
    const t = document.getElementById('title-input');
    if (t) t.focus();
  }, 60);
}

// ============================================================
// OPEN / LOAD EDITOR
// ============================================================
function loadEditor(id) {
  const mom = records.find(r => r.id === id);
  if (!mom) return;

  activeId = id;
  localStorage.setItem('mom_active_id', id);

  document.getElementById('tasks-dashboard').style.display = 'none';
  document.getElementById('empty-state').style.display  = 'none';
  document.getElementById('editor-wrap').style.display  = 'block';

  document.getElementById('title-input').value          = mom.title         || '';
  document.getElementById('attendees-input').value      = mom.attendees     || '';
  document.getElementById('discussion-input').value     = mom.discussion    || '';
  document.getElementById('followup-notes-input').value = mom.followUpNotes || '';

  dpSetValue('dp-date',     mom.date          || '');
  tpSetValue('tp-time',     mom.time          || '');
  dpSetValue('dp-followup', mom.nextFollowUp  || '');

  renderActions(mom.actions || []);
  renderList(); // refresh active highlight
  renderTaskDashboard(document.getElementById('search').value.toLowerCase().trim());
}

function showEmptyState() {
  document.getElementById('tasks-dashboard').style.display = 'none';
  document.getElementById('empty-state').style.display = 'flex';
  document.getElementById('editor-wrap').style.display = 'none';
  activeId = null;
  localStorage.removeItem('mom_active_id');
  renderList();
}

// ============================================================
// FIELD CHANGE HANDLER (auto-save)
// ============================================================
function handleChange(field, value) {
  const mom = records.find(r => r.id === activeId);
  if (!mom) return;
  mom[field]    = value;
  mom.updatedAt = new Date().toISOString();
  persist();
  flashSaved();
  renderList(); // keep preview fresh
  renderTaskDashboard(document.getElementById('search').value.toLowerCase().trim());
}

// ============================================================
// ACTION ITEMS
// ============================================================
function renderActions(actions) {
  const container = document.getElementById('actions-list');
  container.innerHTML = '';

  actions.forEach((action, idx) => {
    const wrapId = `dp-action-${idx}`;
    const row    = document.createElement('div');
    row.className = 'action-row' + (action.completed ? ' completed' : '');
    row.innerHTML = `
      <label class="action-check-wrap" title="Mark action complete">
        <input type="checkbox"
               class="action-checkbox"
               ${action.completed ? 'checked' : ''}
               onchange="toggleActionComplete(${idx}, this.checked)">
        <span class="action-check-ui"></span>
      </label>
      <input type="text"
             class="action-task-input"
             placeholder="Task description"
             value="${esc(action.task || '')}"
             oninput="updateAction(${idx}, 'task', this.value)">
      <input type="text"
             class="col-owner"
             placeholder="Owner"
             value="${esc(action.owner || '')}"
             oninput="updateAction(${idx}, 'owner', this.value)">
      <div class="dp-wrap dp-compact" id="${wrapId}">
        <button class="dp-trigger" onclick="dpOpen('${wrapId}')">
          <span class="dp-val${action.due ? '' : ' dp-placeholder'}"
                id="${wrapId}-val">${action.due ? formatDateDisplay(action.due) : 'Due date'}</span>
          <span class="dp-chevron">⌄</span>
        </button>
        <div class="dp-popup hidden" id="${wrapId}-pop"></div>
      </div>
      <button class="action-del-btn"
              title="Remove action"
              onclick="removeAction(${idx})">✕</button>
    `;
    container.appendChild(row);

    // Initialise the date picker for this action row
    initDatePicker(wrapId, dateStr => updateAction(idx, 'due', dateStr));
    dpState[wrapId].value = action.due || '';
    if (action.due) {
      const [y, m] = action.due.split('-').map(Number);
      dpState[wrapId].viewY = y;
      dpState[wrapId].viewM = m - 1;
    }
  });
}

function addAction() {
  const mom = records.find(r => r.id === activeId);
  if (!mom) return;
  mom.actions.push({ task: '', owner: '', due: '', completed: false });
  mom.updatedAt = new Date().toISOString();
  persist();
  renderActions(mom.actions);
  renderList();
  renderTaskDashboard(document.getElementById('search').value.toLowerCase().trim());
  flashSaved();

  setTimeout(() => {
    const rows = document.querySelectorAll('.action-row');
    if (rows.length) rows[rows.length - 1].querySelector('input').focus();
  }, 40);
}

function updateAction(idx, field, value) {
  const mom = records.find(r => r.id === activeId);
  if (!mom || !mom.actions[idx]) return;
  mom.actions[idx][field] = value;
  mom.updatedAt = new Date().toISOString();
  persist();
  renderList();
  renderTaskDashboard(document.getElementById('search').value.toLowerCase().trim());
  flashSaved();
}

function toggleActionComplete(idx, completed) {
  updateAction(idx, 'completed', completed);
  const mom = records.find(r => r.id === activeId);
  if (!mom) return;
  renderActions(mom.actions);
}

function removeAction(idx) {
  const mom = records.find(r => r.id === activeId);
  if (!mom) return;
  mom.actions.splice(idx, 1);
  mom.updatedAt = new Date().toISOString();
  persist();
  renderActions(mom.actions);
  renderList();
  renderTaskDashboard(document.getElementById('search').value.toLowerCase().trim());
  flashSaved();
}

// ============================================================
// DELETE MOM
// ============================================================
function confirmDelete() {
  showOverlay('delete-overlay');
}

function deleteMoM() {
  closeOverlay('delete-overlay');
  const idx = records.findIndex(r => r.id === activeId);
  if (idx === -1) return;

  // Deep-copy for undo
  deletedMoM = JSON.parse(JSON.stringify({ ...records[idx], _idx: idx }));
  records.splice(idx, 1);
  persist();
  showEmptyState();

  // Show undo banner
  const banner = document.getElementById('undo-banner');
  banner.classList.add('visible');
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    banner.classList.remove('visible');
    deletedMoM = null;
  }, 5000);
}

function undoDelete() {
  if (!deletedMoM) return;
  clearTimeout(undoTimer);
  const { _idx, ...mom } = deletedMoM;
  records.splice(_idx, 0, mom);
  persist();
  renderList();
  loadEditor(mom.id);
  document.getElementById('undo-banner').classList.remove('visible');
  deletedMoM = null;
}

// ============================================================
// SEARCH / FILTER LIST
// ============================================================
function filterList() {
  const q = document.getElementById('search').value.toLowerCase().trim();
  renderList(q);
  renderTaskDashboard(q);
}

function setListMode(mode) {
  if (!['all', 'followups', 'tasks'].includes(mode) || listMode === mode) return;
  listMode = mode;
  localStorage.setItem('mom_list_mode', listMode);
  syncListModeUI();
  const query = document.getElementById('search').value.toLowerCase().trim();
  renderList(query);
  renderTaskDashboard(query);

  if (listMode === 'tasks') {
    showTaskDashboard();
  } else if (activeId && records.find(r => r.id === activeId)) {
    loadEditor(activeId);
  } else {
    showEmptyState();
  }
}

function syncListModeUI() {
  const allBtn = document.getElementById('list-mode-all');
  const followBtn = document.getElementById('list-mode-followups');
  const tasksBtn = document.getElementById('list-mode-tasks');
  if (!allBtn || !followBtn || !tasksBtn) return;
  allBtn.classList.toggle('active', listMode === 'all');
  followBtn.classList.toggle('active', listMode === 'followups');
  tasksBtn.classList.toggle('active', listMode === 'tasks');
}

function matchesListQuery(mom, query) {
  if (!query) return true;
  return [
    mom.title,
    mom.attendees,
    mom.discussion,
    mom.followUpNotes
  ].some(value => (value || '').toLowerCase().includes(query));
}

function getIncompleteActions(mom) {
  return (mom.actions || []).filter(action => !action.completed);
}

function getSortedIncompleteActions(mom) {
  return getIncompleteActions(mom).slice().sort(compareTasksByUrgency);
}

function matchesTaskQuery(mom, query) {
  if (!query) return true;

  const taskValues = [];
  getIncompleteActions(mom).forEach(action => {
    taskValues.push(action.task, action.owner);
  });

  return [
    mom.title,
    mom.followUpNotes,
    ...taskValues
  ].some(value => (value || '').toLowerCase().includes(query));
}

function buildDefaultListItem(mom) {
  const preview = (mom.discussion || '').slice(0, 60);
  return `
    <div class="mom-item-title">${esc(mom.title || 'Untitled Meeting')}</div>
    <div class="mom-item-meta">${formatDate(mom.date)}${mom.time ? ' · ' + mom.time : ''}</div>
    ${preview ? `<div class="mom-item-preview">${esc(preview)}</div>` : ''}
  `;
}

function buildFollowUpListItem(mom) {
  const status = followUpStatus(mom.nextFollowUp);
  const notesPreview = (mom.followUpNotes || '').slice(0, 80);
  return `
    <div class="mom-item-head">
      <div class="mom-item-title">${esc(mom.title || 'Untitled Meeting')}</div>
      <span class="followup-badge ${status}">${followUpStatusLabel(status)}</span>
    </div>
    <div class="mom-item-meta">Follow-up · ${formatDateDisplay(mom.nextFollowUp)}</div>
    ${notesPreview ? `<div class="mom-item-preview">${esc(notesPreview)}</div>` : ''}
  `;
}

function buildTaskListItem(mom) {
  const tasks = getSortedIncompleteActions(mom);
  const tasksHtml = tasks.map(action => {
    const metaParts = [];
    if (action.owner) metaParts.push(`Owner · ${esc(action.owner)}`);
    if (action.due) metaParts.push(`Due · ${esc(formatDateDisplay(action.due))}`);

    return `
      <div class="task-item">
        <div class="task-item-check" aria-hidden="true"></div>
        <div class="task-item-body">
          <div class="task-item-title">${esc(action.task || 'Untitled task')}</div>
          ${metaParts.length ? `<div class="task-item-meta">${metaParts.join(' · ')}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="task-group-head">
      <div class="task-group-title">${esc(mom.title || 'Untitled Meeting')}</div>
      <div class="task-group-count">${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}</div>
    </div>
    <div class="task-group-items">${tasksHtml}</div>
    ${mom.nextFollowUp ? `
      <div class="task-group-followup">
        <span class="task-group-followup-label">Next Follow-up</span>
        <span class="followup-badge ${followUpStatus(mom.nextFollowUp)}">${esc(formatDateDisplay(mom.nextFollowUp))}</span>
      </div>
    ` : ''}
  `;
}

function openMeetingFromTasks(id) {
  if (!records.find(r => r.id === id)) return;
  if (listMode === 'tasks') {
    listMode = 'all';
    localStorage.setItem('mom_list_mode', listMode);
    syncListModeUI();
  }
  renderList(document.getElementById('search').value.toLowerCase().trim());
  loadEditor(id);
  closeSidebar();
}

function buildTaskDashboardSection(mom) {
  const tasks = getSortedIncompleteActions(mom);
  const tasksHtml = tasks.map(action => {
    const status = taskDueStatus(action.due);
    const meta = [];
    if (action.owner) meta.push(`Owner · ${esc(action.owner)}`);
    if (action.due) meta.push(`Due · ${esc(formatDateDisplay(action.due))}`);

    return `
      <button class="task-dashboard-item" type="button" onclick="openMeetingFromTasks('${mom.id}')">
        <span class="task-dashboard-item-check" aria-hidden="true"></span>
        <span class="task-dashboard-item-body">
          <span class="task-dashboard-item-top">
            <span class="task-dashboard-item-title">${esc(action.task || 'Untitled task')}</span>
            <span class="task-status-badge ${status}">${taskDueStatusLabel(status)}</span>
          </span>
          ${meta.length ? `<span class="task-dashboard-item-meta">${meta.join(' · ')}</span>` : ''}
        </span>
      </button>
    `;
  }).join('');

  return `
    <section class="task-dashboard-group">
      <button class="task-dashboard-group-head" type="button" onclick="openMeetingFromTasks('${mom.id}')">
        <span class="task-dashboard-group-title-wrap">
          <span class="task-dashboard-group-title">${esc(mom.title || 'Untitled Meeting')}</span>
          <span class="task-dashboard-group-subtitle">${tasks.length} ${tasks.length === 1 ? 'active task' : 'active tasks'}</span>
        </span>
        <span class="task-dashboard-group-open">Open</span>
      </button>
      <div class="task-dashboard-group-items">${tasksHtml}</div>
      ${mom.nextFollowUp ? `
        <div class="task-dashboard-followup">
          <span class="task-dashboard-followup-label">Next Follow-up</span>
          <span class="followup-badge ${followUpStatus(mom.nextFollowUp)}">${esc(formatDateDisplay(mom.nextFollowUp))}</span>
        </div>
      ` : ''}
    </section>
  `;
}

function renderTaskDashboard(query = '') {
  const dashboard = document.getElementById('tasks-dashboard');
  const list = document.getElementById('tasks-dashboard-list');
  const summary = document.getElementById('tasks-dashboard-summary');
  if (!dashboard || !list || !summary) return;

  const meetings = records
    .filter(mom => getIncompleteActions(mom).length > 0 && matchesTaskQuery(mom, query))
    .sort(compareMeetingsByTaskUrgency);
  const taskCount = meetings.reduce((count, mom) => count + getIncompleteActions(mom).length, 0);

  summary.textContent = taskCount
    ? `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'} across ${meetings.length} ${meetings.length === 1 ? 'meeting' : 'meetings'}`
    : (query ? 'No matching tasks' : 'No active tasks');

  if (meetings.length === 0) {
    list.innerHTML = `<div class="tasks-dashboard-empty">${
      query ? 'No tasks match this search.' : 'No active tasks right now.'
    }</div>`;
    return;
  }

  list.innerHTML = meetings.map(buildTaskDashboardSection).join('');
}

function showTaskDashboard() {
  document.getElementById('editor-wrap').style.display = 'none';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('tasks-dashboard').style.display = 'block';
}

// ============================================================
// RENDER SIDEBAR LIST
// ============================================================
function renderList(query = '') {
  const container = document.getElementById('mom-list');
  container.innerHTML = '';

  if (listMode === 'followups') {
    const items = records
      .filter(mom => mom.nextFollowUp && matchesListQuery(mom, query))
      .sort((a, b) => {
        if (a.nextFollowUp === b.nextFollowUp) {
          return (b.updatedAt || '').localeCompare(a.updatedAt || '');
        }
        return a.nextFollowUp.localeCompare(b.nextFollowUp);
      });

    if (items.length === 0) {
      container.innerHTML = `<div class="no-results">${
        query ? 'No follow-ups found' : 'No follow-ups scheduled'
      }</div>`;
      return;
    }

    let lastStatus = '';
    items.forEach(mom => {
      const status = followUpStatus(mom.nextFollowUp);
      if (status !== lastStatus) {
        const group = document.createElement('div');
        group.className = 'list-group-label';
        group.textContent = followUpStatusLabel(status);
        container.appendChild(group);
        lastStatus = status;
      }

      const div = document.createElement('div');
      div.className = 'mom-item followup-item' + (mom.id === activeId ? ' active' : '');
      div.onclick = () => { loadEditor(mom.id); closeSidebar(); };
      div.innerHTML = buildFollowUpListItem(mom);
      container.appendChild(div);
    });
    return;
  }

  if (listMode === 'tasks') {
    const items = records
      .filter(mom => getIncompleteActions(mom).length > 0 && matchesTaskQuery(mom, query))
      .sort(compareMeetingsByTaskUrgency);

    if (items.length === 0) {
      container.innerHTML = `<div class="no-results">${
        query ? 'No tasks found' : 'No active tasks'
      }</div>`;
      return;
    }

    items.forEach(mom => {
      const div = document.createElement('div');
      div.className = 'mom-item task-sidebar-item' + (mom.id === activeId ? ' active' : '');
      div.onclick = () => { openMeetingFromTasks(mom.id); };
      const topTask = getSortedIncompleteActions(mom)[0];
      const topStatus = topTask ? taskDueStatus(topTask.due) : 'nodue';
      div.innerHTML = `
        <div class="mom-item-head">
          <div class="mom-item-title">${esc(mom.title || 'Untitled Meeting')}</div>
          <span class="task-status-badge compact ${topStatus}">${taskDueStatusLabel(topStatus)}</span>
        </div>
        <div class="mom-item-meta">${getIncompleteActions(mom).length} ${
          getIncompleteActions(mom).length === 1 ? 'active task' : 'active tasks'
        }</div>
        ${mom.nextFollowUp ? `<div class="mom-item-preview">Follow-up · ${esc(formatDateDisplay(mom.nextFollowUp))}</div>` : ''}
      `;
      container.appendChild(div);
    });
    return;
  }

  let items = records.filter(mom => matchesListQuery(mom, query));

  if (items.length === 0) {
    container.innerHTML = '<div class="no-results">No meetings found</div>';
    return;
  }

  items.forEach(mom => {
    const div = document.createElement('div');
    div.className = 'mom-item' + (mom.id === activeId ? ' active' : '');
    div.onclick = () => { loadEditor(mom.id); closeSidebar(); };
    div.innerHTML = buildDefaultListItem(mom);
    container.appendChild(div);
  });
}

// ============================================================
// EXPORT JSON
// ============================================================
function exportJSON() {
  const filename = `mom-records-${todayDate()}.json`;
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// IMPORT JSON
// ============================================================
function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error('Expected an array');
      importBuf = data;

      const existingIds = new Set(records.map(r => r.id));
      const newCount    = data.filter(r => !existingIds.has(r.id)).length;
      const replaceCount = data.filter(r =>  existingIds.has(r.id)).length;

      document.getElementById('import-preview').innerHTML =
        `Found <strong>${data.length}</strong> meeting${data.length !== 1 ? 's' : ''}. ` +
        `<strong>${newCount}</strong> new, ` +
        `<strong>${replaceCount}</strong> will replace existing.`;

      showOverlay('import-overlay');
    } catch (err) {
      alert('Invalid file. Please use a valid MoM JSON export.');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

function confirmImport() {
  if (!importBuf) return;
  const map = {};
  records.forEach(r    => { map[r.id] = normalizeRecord(r); });
  importBuf.forEach(r  => { map[r.id] = normalizeRecord(r); });

  records = Object.values(map).sort((a, b) =>
    (b.date || '') > (a.date || '') ? 1 : -1
  );

  persist();
  renderList();
  renderTaskDashboard(document.getElementById('search').value.toLowerCase().trim());
  closeOverlay('import-overlay');
  importBuf = null;
}

// ============================================================
// OVERLAY HELPERS
// ============================================================
function showOverlay(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeOverlay(id) {
  document.getElementById(id).classList.add('hidden');
}

function closeAllOverlays() {
  document.querySelectorAll('.overlay:not(.hidden)').forEach(o => o.classList.add('hidden'));
}

function showShortcuts() {
  showOverlay('shortcuts-overlay');
}

// ============================================================
// MOBILE SIDEBAR
// ============================================================
function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const open     = sidebar.classList.toggle('open');
  backdrop.style.display = open ? 'block' : 'none';
}

function closeSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  sidebar.classList.remove('open');
  backdrop.style.display = 'none';
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    const tag    = document.activeElement.tagName.toLowerCase();
    const typing = ['input', 'textarea'].includes(tag);

    // ESC — close overlays / sidebar / pickers
    if (e.key === 'Escape') {
      closeAllOverlays();
      closeAllPickers();
      closeSidebar();
      return;
    }

    // Cmd/Ctrl + F — focus search
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      document.getElementById('search').focus();
      return;
    }

    if (typing) return;

    // N — new MoM
    if (e.key === 'n' || e.key === 'N') {
      createNewMoM();
      return;
    }

    // D — export/download
    if (e.key === 'd' || e.key === 'D') {
      exportJSON();
    }
  });
}

// ============================================================
// PDF EXPORT
// ============================================================

/** Format "2026-04-09" → "April 9, 2026" */
function formatDateLong(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  return `${months[m - 1]} ${d}, ${y}`;
}

/** Format "14:30" → "2:30 PM" */
function formatTime12(timeStr) {
  if (!timeStr) return '';
  let [h, min] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(min).padStart(2,'0')} ${ampm}`;
}

function buildPrintHTML(mom) {
  const metaParts = [];
  if (mom.date)      metaParts.push(formatDateLong(mom.date));
  if (mom.time)      metaParts.push(formatTime12(mom.time));
  if (mom.attendees) metaParts.push(`Attendees: ${mom.attendees}`);

  let actionsHTML = '';
  if (mom.actions && mom.actions.length) {
    const rows = mom.actions.map(a => `
      <tr>
        <td class="pv-td">${a.completed ? '&#10003; ' : ''}${escHtml(a.task  || '')}</td>
        <td class="pv-td">${escHtml(a.owner || '')}</td>
        <td class="pv-td">${a.completed ? 'Done' : (formatDateLong(a.due) || '')}</td>
      </tr>`).join('');
    actionsHTML = `
      <div class="pv-section-title">Action Items</div>
      <table class="pv-table">
        <thead>
          <tr>
            <th class="pv-th">Task</th>
            <th class="pv-th">Owner</th>
            <th class="pv-th">Due Date</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  let followupHTML = '';
  if (mom.nextFollowUp || mom.followUpNotes) {
    followupHTML = `
      <hr class="pv-rule">
      <div class="pv-section-title">Follow-up</div>
      <div class="pv-followup-row">
        ${mom.nextFollowUp ? `<div><strong>Next meeting:</strong> ${formatDateLong(mom.nextFollowUp)}</div>` : ''}
        ${mom.followUpNotes ? `<div><strong>Notes:</strong> ${escHtml(mom.followUpNotes)}</div>` : ''}
      </div>`;
  }

  return `
    <div class="pv-header">
      <div class="pv-title">${escHtml(mom.title || 'Untitled Meeting')}</div>
      <div class="pv-meta">${metaParts.join(' · ')}</div>
    </div>

    ${mom.discussion ? `
    <div class="pv-section-title">Discussion Notes</div>
    <div class="pv-text">${escHtml(mom.discussion)}</div>
    ` : ''}

    ${actionsHTML ? `<hr class="pv-rule">${actionsHTML}` : ''}
    ${followupHTML}

    <div class="pv-footer">
      Minutes of Meeting · ${new Date().toLocaleDateString()}
    </div>`;
}

function exportPDF() {
  const mom = records.find(r => r.id === activeId);
  if (!mom) return;
  const pv = document.getElementById('print-view');
  pv.innerHTML = buildPrintHTML(mom);
  window.print();
}

// ============================================================
// EMAIL COPY — rich HTML + plain text
// ============================================================

function buildEmailHTML(mom) {
  const metaParts = [];
  if (mom.date)      metaParts.push(`<strong>Date:</strong> ${formatDateLong(mom.date)}`);
  if (mom.time)      metaParts.push(`<strong>Time:</strong> ${formatTime12(mom.time)}`);
  if (mom.attendees) metaParts.push(`<strong>Attendees:</strong> ${escHtml(mom.attendees)}`);

  let actionsHTML = '';
  if (mom.actions && mom.actions.length) {
    const rows = mom.actions.map(a => `
      <tr>
        <td style="padding:6px 10px;border:1px solid #ddd;vertical-align:top;${a.completed ? 'color:#666;text-decoration:line-through;' : ''}">${a.completed ? '&#10003; ' : ''}${escHtml(a.task  || '')}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;vertical-align:top;">${escHtml(a.owner || '')}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;vertical-align:top;white-space:nowrap;">${a.completed ? 'Done' : (formatDateLong(a.due) || '—')}</td>
      </tr>`).join('');
    actionsHTML = `
      <h3 style="font-family:sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#555;margin:20px 0 6px;">Action Items</h3>
      <table style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:13px;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;font-weight:600;">Task</th>
            <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;font-weight:600;">Owner</th>
            <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;font-weight:600;">Due Date</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  let followupHTML = '';
  if (mom.nextFollowUp || mom.followUpNotes) {
    followupHTML = `
      <hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0;">
      <h3 style="font-family:sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#555;margin:0 0 6px;">Follow-up</h3>
      <p style="font-family:sans-serif;font-size:13px;color:#333;margin:0 0 4px;">
        ${mom.nextFollowUp ? `<strong>Next meeting:</strong> ${formatDateLong(mom.nextFollowUp)}<br>` : ''}
        ${mom.followUpNotes ? `<strong>Notes:</strong> ${escHtml(mom.followUpNotes)}` : ''}
      </p>`;
  }

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:0 auto;color:#111;background:#fff;padding:28px 32px;border:1px solid #e0e0e0;border-radius:8px;">
  <h1 style="font-size:22px;font-weight:700;margin:0 0 6px;color:#111;">${escHtml(mom.title || 'Untitled Meeting')}</h1>
  <p style="font-size:13px;color:#666;margin:0 0 18px;">${metaParts.join(' &nbsp;·&nbsp; ')}</p>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:0 0 18px;">

  ${mom.discussion ? `
  <h3 style="font-family:sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#555;margin:0 0 8px;">Discussion Notes</h3>
  <p style="font-family:sans-serif;font-size:13px;color:#333;white-space:pre-wrap;margin:0 0 16px;line-height:1.6;">${escHtml(mom.discussion)}</p>
  ` : ''}

  ${actionsHTML}
  ${followupHTML}

  <p style="font-size:11px;color:#bbb;margin-top:24px;border-top:1px solid #eee;padding-top:10px;">
    Minutes of Meeting · ${new Date().toLocaleDateString()}
  </p>
</div>`;
}

function buildEmailText(mom) {
  const lines = [];
  lines.push(`MINUTES OF MEETING`);
  lines.push(`==================`);
  lines.push(`Title: ${mom.title || 'Untitled Meeting'}`);
  if (mom.date)      lines.push(`Date: ${formatDateLong(mom.date)}`);
  if (mom.time)      lines.push(`Time: ${formatTime12(mom.time)}`);
  if (mom.attendees) lines.push(`Attendees: ${mom.attendees}`);
  lines.push('');

  if (mom.discussion) {
    lines.push('DISCUSSION NOTES');
    lines.push('----------------');
    lines.push(mom.discussion);
    lines.push('');
  }

  if (mom.actions && mom.actions.length) {
    lines.push('ACTION ITEMS');
    lines.push('------------');
    mom.actions.forEach((a, i) => {
      const due = a.completed ? ' (Done)' : (a.due ? ` (Due: ${formatDateLong(a.due)})` : '');
      const owner = a.owner ? ` — ${a.owner}` : '';
      const prefix = a.completed ? '[x]' : '[ ]';
      lines.push(`${i + 1}. ${prefix} ${a.task || ''}${owner}${due}`);
    });
    lines.push('');
  }

  if (mom.nextFollowUp || mom.followUpNotes) {
    lines.push('FOLLOW-UP');
    lines.push('---------');
    if (mom.nextFollowUp) lines.push(`Next Meeting: ${formatDateLong(mom.nextFollowUp)}`);
    if (mom.followUpNotes) lines.push(`Notes: ${mom.followUpNotes}`);
    lines.push('');
  }

  lines.push(`---`);
  lines.push(`Generated by MoM App · ${new Date().toLocaleDateString()}`);
  return lines.join('\n');
}

async function copyForEmail() {
  const mom = records.find(r => r.id === activeId);
  if (!mom) return;
  const html = buildEmailHTML(mom);
  const text = buildEmailText(mom);
  await copyToClipboard(html, text);
  showToast('📋 Rich HTML copied — paste into Gmail or Outlook');
}

async function copyPlainText() {
  const mom = records.find(r => r.id === activeId);
  if (!mom) return;
  const text = buildEmailText(mom);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  showToast('📄 Plain text copied — paste anywhere');
}

async function copyToClipboard(html, plainText) {
  try {
    const htmlBlob  = new Blob([html],      { type: 'text/html'  });
    const textBlob  = new Blob([plainText], { type: 'text/plain' });
    await navigator.clipboard.write([
      new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })
    ]);
  } catch {
    // Fallback: plain text only
    try {
      await navigator.clipboard.writeText(plainText);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = plainText;
      ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('copy-toast');
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2800);
}

/** HTML-escape helper */
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ============================================================
// BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', init);
