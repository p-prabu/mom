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
let theme      = 'soft';
let saveTimer  = null;
let undoTimer  = null;
let deletedMoM = null;
let importBuf  = null;

const THEMES = ['soft', 'light', 'dark'];

// ============================================================
// INIT
// ============================================================
function init() {
  records  = JSON.parse(localStorage.getItem('mom_records') || '[]');
  theme    = localStorage.getItem('mom_theme')     || 'soft';
  activeId = localStorage.getItem('mom_active_id') || null;

  applyTheme();
  setupDatePickers();
  renderList();

  if (activeId && records.find(r => r.id === activeId)) {
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

// ── Position popup using fixed viewport coordinates ──
// (popup is position:fixed so it escapes overflow:auto ancestors)
function positionPopup(wrapId, popEl) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;

  const rect  = wrap.getBoundingClientRect();
  const popW  = popEl.offsetWidth  || 280;
  const popH  = popEl.offsetHeight || 300;
  const vw    = window.innerWidth;
  const vh    = window.innerHeight;
  const GAP   = 6;

  // Default: open below the trigger
  let top  = rect.bottom + GAP;
  let left = rect.left;

  // Flip above if not enough space below
  if (top + popH > vh - 8) top = rect.top - popH - GAP;

  // Keep within right edge
  if (left + popW > vw - 8) left = vw - popW - 8;

  // Keep within left edge
  if (left < 8) left = 8;

  popEl.style.top  = `${Math.max(8, top)}px`;
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
  renderList();
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
}

function showEmptyState() {
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
    row.className = 'action-row';
    row.innerHTML = `
      <input type="text"
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
  mom.actions.push({ task: '', owner: '', due: '' });
  mom.updatedAt = new Date().toISOString();
  persist();
  renderActions(mom.actions);
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
  flashSaved();
}

function removeAction(idx) {
  const mom = records.find(r => r.id === activeId);
  if (!mom) return;
  mom.actions.splice(idx, 1);
  mom.updatedAt = new Date().toISOString();
  persist();
  renderActions(mom.actions);
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
}

// ============================================================
// RENDER SIDEBAR LIST
// ============================================================
function renderList(query = '') {
  const container = document.getElementById('mom-list');
  container.innerHTML = '';

  let items = records;
  if (query) {
    items = records.filter(r =>
      (r.title      || '').toLowerCase().includes(query) ||
      (r.attendees  || '').toLowerCase().includes(query) ||
      (r.discussion || '').toLowerCase().includes(query)
    );
  }

  if (items.length === 0) {
    container.innerHTML = '<div class="no-results">No meetings found</div>';
    return;
  }

  items.forEach(mom => {
    const div = document.createElement('div');
    div.className = 'mom-item' + (mom.id === activeId ? ' active' : '');
    div.onclick = () => { loadEditor(mom.id); closeSidebar(); };

    const preview = (mom.discussion || '').slice(0, 60);
    div.innerHTML = `
      <div class="mom-item-title">${esc(mom.title || 'Untitled Meeting')}</div>
      <div class="mom-item-meta">${formatDate(mom.date)}${mom.time ? ' · ' + mom.time : ''}</div>
      ${preview ? `<div class="mom-item-preview">${esc(preview)}</div>` : ''}
    `;
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
  records.forEach(r    => { map[r.id] = r; });
  importBuf.forEach(r  => { map[r.id] = r; });

  records = Object.values(map).sort((a, b) =>
    (b.date || '') > (a.date || '') ? 1 : -1
  );

  persist();
  renderList();
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
        <td class="pv-td">${escHtml(a.task  || '')}</td>
        <td class="pv-td">${escHtml(a.owner || '')}</td>
        <td class="pv-td">${formatDateLong(a.due) || ''}</td>
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
        <td style="padding:6px 10px;border:1px solid #ddd;vertical-align:top;">${escHtml(a.task  || '')}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;vertical-align:top;">${escHtml(a.owner || '')}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;vertical-align:top;white-space:nowrap;">${formatDateLong(a.due) || '—'}</td>
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
      const due = a.due ? ` (Due: ${formatDateLong(a.due)})` : '';
      const owner = a.owner ? ` — ${a.owner}` : '';
      lines.push(`${i + 1}. ${a.task || ''}${owner}${due}`);
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
