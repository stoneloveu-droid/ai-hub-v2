/**
 * @fileoverview Main app orchestrator — wires all modules together.
 * Exposed as window.App for inline HTML event handlers.
 */

import { storage }          from './js/storage.js';
import { loadSettings, saveSettings, getSettings, applyTheme } from './js/settings.js'; // FIXED: removed Gist token helpers (unused after Firebase)
import { addAccount, updateAccount, deleteAccount, duplicateAccount, recordUsage, filterAccounts, computeStats, getAllProviders, buildAccount } from './js/accounts.js';
import { getAccountUrl, buildCommand, openDirect, copyToClipboard, getOpenOptions } from './js/browserLauncher.js';
import { requestNotificationPermission, pickRotationAccount } from './js/rateLimit.js';
import { toast, openOverlay, closeOverlay, renderStats, renderAIChips, renderCards, renderBulkBar, showSkeleton, setToggle } from './js/ui.js'; // FIXED: remove legacy sync helpers
import { val, setVal, debounce, sanitize, parseTags, logger } from './js/utils.js';
import { STATUS, THEME, OPEN_MODE, TAGS_PRESET } from './js/constants.js'; // FIXED: remove SYNC_INTERVAL (Gist auto-sync removed)

// ── State ─────────────────────────────────────────────────────────────────────

let _accounts   = [];
let _providers  = [];
let _editId     = null;
let _deleteId   = null;
let _openId     = null;
let _activeAI   = '';
let _selected   = new Set();

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  showSkeleton();

  // Settings (sync)
  const s = loadSettings();
  applyTheme(s.theme ?? THEME.SYSTEM);
  setToggle('alwaysAskToggle',    s.alwaysAsk);
  setToggle('settingsAlwaysAsk',  s.alwaysAsk);

  // Storage (async)
  try {
    await storage.init(); // FIXED: Firebase init (no local migration)
  } catch (e) {
    toast(e.message, 'err'); // FIXED: surface missing Firebase config / auth issues
  }

  storage.onUserChanged(async (u) => { // FIXED: react to auth changes
    setAuthUI(u);
    if (u) {
      _providers = await getAllProviders();
      await refreshAccounts();
    } else {
      _providers = await getAllProviders();
    }
  });
  setAuthUI(storage.getUser());

  // Notifications
  await requestNotificationPermission();

  // Overlay click-outside
  document.querySelectorAll('.overlay').forEach(ov => {
    ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'); });
  });

  // Close buttons (data-close) // FIXED: wire all [data-close] buttons to closeOverlay
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-close');
      closeOverlay(id);
    });
  });

  // PWA install prompt
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    window._installPrompt = e;
    document.getElementById('installBanner')?.classList.remove('hidden');
  });

  logger.info('AI Account Hub v2 initialised');
}

function setAuthUI(user) { // FIXED: simple login UI
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const userLabel = document.getElementById('userLabel');
  if (loginBtn) loginBtn.classList.toggle('hidden', !!user);
  if (logoutBtn) logoutBtn.classList.toggle('hidden', !user);
  if (userLabel) userLabel.textContent = user ? (user.displayName || user.email || 'Đã đăng nhập') : 'Chưa đăng nhập';
}

// ── Data refresh ──────────────────────────────────────────────────────────────

async function refreshAccounts() {
  try { // FIXED: require auth
    _accounts = await storage.accounts.list();
    renderView();
  } catch (e) {
    toast(e.message, 'warn');
  }
}

function renderView() {
  const filters = {
    q           : document.getElementById('searchInput')?.value ?? '',
    ai          : _activeAI,
    status      : document.getElementById('filterStatus')?.value ?? '',
    tag         : document.getElementById('filterTag')?.value ?? '',
    sort        : document.getElementById('sortSelect')?.value ?? 'pinned',
    showArchived: document.getElementById('showArchived')?.checked ?? false,
  };

  const filtered = filterAccounts(_accounts, filters);
  const stats    = computeStats(_accounts);
  const aiList   = [...new Set(_accounts.filter(a => !a.archived).map(a => a.ai))];

  renderStats(stats);
  renderAIChips(aiList, _activeAI, ai => { _activeAI = ai; renderView(); });
  renderCards(filtered, _providers, {
    onOpen          : openChat,
    onEdit          : openEdit,
    onDelete        : confirmDelete,
    onDuplicate     : doDuplicate,
    onToggleFav     : (id, v) => patchAccount(id, { favorite: v }),
    onTogglePin     : (id, v) => patchAccount(id, { pinned:   v }),
    onSelect        : (id, checked) => { checked ? _selected.add(id) : _selected.delete(id); renderBulkActions(); },
    onCountdownReset: id => { refreshAccounts(); toast('Tài khoản đã reset!', 'ok'); },
  }, _selected);

  renderBulkActions();
}

async function patchAccount(id, patch) {
  await storage.accounts.update(id, patch);
  await refreshAccounts();
}

// ── Open chat ─────────────────────────────────────────────────────────────────

function openChat(id) {
  _openId = id;
  const acc = _accounts.find(a => a.id === id);
  if (!acc) return;

  const url  = getAccountUrl(acc, _providers);
  const s    = getSettings();

  if (!s.alwaysAsk) {
    if (s.defaultOpenMode === OPEN_MODE.BROWSER && acc.profile) { showCmdSheet(acc, url); }
    else { doOpenDirect(acc, url); }
    return;
  }

  // Build options sheet
  const opts    = getOpenOptions(acc, url);
  const sheet   = document.getElementById('openOptionList');
  if (!sheet) return;
  sheet.innerHTML = '';
  opts.forEach(opt => {
    const row  = document.createElement('div');
    row.className = 'open-opt';
    const ico  = document.createElement('div');
    ico.className = 'open-opt-icon';
    ico.style.background = opt.bg;
    ico.innerHTML = `<i class="ti ${opt.icon}" style="color:${opt.color};font-size:18px"></i>`;
    const txt  = document.createElement('div');
    txt.className = 'open-opt-text';
    const tl   = document.createElement('div'); tl.className = 'open-opt-title'; tl.textContent = opt.title;
    const sb   = document.createElement('div'); sb.className = 'open-opt-sub';   sb.textContent = opt.sub;
    txt.appendChild(tl); txt.appendChild(sb);
    const arr  = document.createElement('i'); arr.className = 'ti ti-chevron-right open-opt-arrow';
    row.appendChild(ico); row.appendChild(txt); row.appendChild(arr);
    row.addEventListener('click', () => {
      closeOverlay('openOverlay');
      if (opt.id === OPEN_MODE.DIRECT) doOpenDirect(acc, url);
      else if (opt.id === OPEN_MODE.BROWSER) showCmdSheet(acc, url);
      else if (opt.id === 'copy') { copyToClipboard(url).then(() => toast('Đã copy URL!', 'ok')); }
    });
    sheet.appendChild(row);
  });

  // Account name
  const titleEl = document.getElementById('openTitle');
  if (titleEl) titleEl.textContent = acc.name;
  const subEl   = document.getElementById('openSub');
  if (subEl)   subEl.textContent = url;

  setToggle('alwaysAskToggle', getSettings().alwaysAsk);
  openOverlay('openOverlay');
}

function doOpenDirect(acc, url) {
  recordUsage(acc.id).then(refreshAccounts);
  openDirect(url);
}

function showCmdSheet(acc, url) {
  recordUsage(acc.id).then(refreshAccounts);
  const cmdL = buildCommand(acc, url, 'linux');
  const cmdW = buildCommand(acc, url, 'win');
  const info = document.getElementById('cmdInfo');
  if (info) {
    info.textContent = '';
    const b = document.createElement('strong'); b.textContent = acc.name;
    const sp = document.createTextNode(` · Profile: ${acc.profile}`);
    info.appendChild(b); info.appendChild(sp);
  }
  const lt = document.getElementById('cmdLinuxText');
  const wt = document.getElementById('cmdWinText');
  if (lt) lt.textContent = cmdL;
  if (wt) wt.textContent = cmdW;
  openOverlay('cmdOverlay');
}

// ── Form: Add / Edit ──────────────────────────────────────────────────────────

function openAdd() {
  _editId = null;
  document.getElementById('formTitle')?.classList.remove('hidden');
  document.getElementById('formTitle').textContent = 'Thêm tài khoản mới';
  ['fName','fEmail','fUrl','fProfile','fChromePath','fTags','fNote'].forEach(id => setVal(id, ''));
  setVal('fAI',     'ChatGPT');
  setVal('fStatus', STATUS.ACTIVE);
  setVal('fBrowser','chrome');
  openOverlay('formOverlay');
  setTimeout(() => document.getElementById('fName')?.focus(), 100);
}

function openEdit(id) {
  const acc = _accounts.find(a => a.id === id);
  if (!acc) return;
  _editId = id;
  document.getElementById('formTitle').textContent = 'Sửa tài khoản';
  setVal('fName',       acc.name);
  setVal('fAI',         acc.ai);
  setVal('fEmail',      acc.email ?? '');
  setVal('fStatus',     acc.status);
  setVal('fTags',       (acc.tags ?? []).join(', '));
  setVal('fUrl',        acc.url ?? '');
  setVal('fBrowser',    acc.browser ?? 'chrome');
  setVal('fProfile',    acc.profile ?? '');
  setVal('fChromePath', acc.chromePath ?? '');
  setVal('fNote',       acc.note ?? '');
  openOverlay('formOverlay');
}

async function saveAccount() {
  const raw = {
    name       : val('fName'),
    ai         : val('fAI'),
    email      : val('fEmail'),
    status     : val('fStatus'),
    tags       : val('fTags'),
    url        : val('fUrl'),
    browser    : val('fBrowser'),
    profile    : val('fProfile'),
    chromePath : val('fChromePath'),
    note       : val('fNote'),
  };
  try {
    if (_editId) {
      await updateAccount(_editId, raw);
      toast('Đã cập nhật tài khoản', 'ok');
    } else {
      await addAccount(raw);
      toast('Đã thêm tài khoản mới', 'ok');
    }
    closeOverlay('formOverlay');
    await refreshAccounts();
  } catch (e) {
    toast(e.message, 'err');
  }
}

function closeForm() { closeOverlay('formOverlay'); }

// ── Delete ────────────────────────────────────────────────────────────────────

function confirmDelete(id) {
  _deleteId = id;
  const acc = _accounts.find(a => a.id === id);
  const nameEl = document.getElementById('deleteAccName');
  if (nameEl) nameEl.textContent = acc?.name ?? '';
  openOverlay('deleteOverlay');
}

async function doDelete() {
  if (!_deleteId) return;
  try {
    await deleteAccount(_deleteId);
    toast('Đã xóa tài khoản', 'ok');
    closeOverlay('deleteOverlay');
    await refreshAccounts();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    _deleteId = null;
  }
}

async function doDuplicate(id) {
  try {
    await duplicateAccount(id);
    toast('Đã nhân bản tài khoản', 'ok');
    await refreshAccounts();
  } catch (e) {
    toast(e.message, 'err');
  }
}

// ── Bulk actions ──────────────────────────────────────────────────────────────

function renderBulkActions() {
  renderBulkBar(_selected.size, {
    onSelectAll  : async () => { _accounts.forEach(a => _selected.add(a.id)); renderView(); },
    onBulkStatus : () => openOverlay('bulkStatusOverlay'),
    onBulkTag    : () => openOverlay('bulkTagOverlay'),
    onBulkArchive: async () => { await storage.accounts.bulkUpdate([..._selected], { archived: true }); _selected.clear(); await refreshAccounts(); toast('Đã archive', 'ok'); },
    onBulkDelete : async () => { if (!confirm(`Xóa ${_selected.size} tài khoản?`)) return; await storage.accounts.bulkDelete([..._selected]); _selected.clear(); await refreshAccounts(); toast('Đã xóa', 'ok'); },
    onClear      : () => { _selected.clear(); renderView(); },
  });
}

async function applyBulkStatus() {
  const status = val('bulkStatusSel');
  if (!status) return;
  await storage.accounts.bulkUpdate([..._selected], { status });
  _selected.clear();
  closeOverlay('bulkStatusOverlay');
  await refreshAccounts();
  toast(`Đã cập nhật trạng thái: ${status}`, 'ok');
}

async function applyBulkTag() {
  const tag = val('bulkTagInput');
  if (!tag) return;
  const ids = [..._selected];
  for (const id of ids) {
    const acc = _accounts.find(a => a.id === id);
    if (!acc) continue;
    const tags = [...new Set([...(acc.tags ?? []), sanitize(tag)])];
    await storage.accounts.update(id, { tags });
  }
  _selected.clear();
  closeOverlay('bulkTagOverlay');
  await refreshAccounts();
  toast('Đã thêm tag hàng loạt', 'ok');
}

// ── Settings ──────────────────────────────────────────────────────────────────

async function openSettings() {
  const s = getSettings();
  setVal('sChromePath',    s.chromePath ?? '');
  setVal('sChromePathWin', s.chromePathWin ?? '');
  setVal('defaultOpenMode', s.defaultOpenMode ?? OPEN_MODE.DIRECT);
  setToggle('settingsAlwaysAsk', s.alwaysAsk);

  // Theme radio
  document.querySelectorAll('input[name="themeRadio"]').forEach(r => { r.checked = r.value === (s.theme ?? THEME.SYSTEM); });

  openOverlay('settingsOverlay');
}

async function saveSettings_() {
  const chromePath    = val('sChromePath');
  const chromePathWin = val('sChromePathWin');
  const mode          = val('defaultOpenMode');
  const theme         = document.querySelector('input[name="themeRadio"]:checked')?.value ?? THEME.SYSTEM;

  saveSettings({ chromePath, chromePathWin, defaultOpenMode: mode, theme }); // FIXED: removed gist settings
  applyTheme(theme);

  closeOverlay('settingsOverlay');
  toast('Đã lưu cài đặt', 'ok');
}

function toggleAlwaysAsk() {
  const s = getSettings();
  saveSettings({ alwaysAsk: !s.alwaysAsk });
  setToggle('alwaysAskToggle',   !s.alwaysAsk);
  setToggle('settingsAlwaysAsk', !s.alwaysAsk);
  toast(!s.alwaysAsk ? 'Sẽ hỏi cách mở mỗi lần' : 'Dùng phương thức mặc định', 'info');
}

function toggleSettingsAlwaysAsk() {
  const s = getSettings();
  saveSettings({ alwaysAsk: !s.alwaysAsk });
  setToggle('alwaysAskToggle',   !s.alwaysAsk);
  setToggle('settingsAlwaysAsk', !s.alwaysAsk);
}

function saveDefaultMode() {
  saveSettings({ defaultOpenMode: val('defaultOpenMode') });
}

// ── Auth (Google) ─────────────────────────────────────────────────────────────

async function signIn() { // FIXED: Google login via Firebase
  try {
    await storage.signIn();
    toast('Đăng nhập thành công', 'ok');
    await refreshAccounts();
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function signOut() { // FIXED: logout
  try {
    await storage.signOut();
    _accounts = [];
    renderView();
    toast('Đã đăng xuất', 'info');
  } catch (e) {
    toast(e.message, 'err');
  }
}

// ── Cmd modal helpers ─────────────────────────────────────────────────────────

async function copyCmd(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const ok = await copyToClipboard(el.textContent);
  toast(ok ? 'Đã copy lệnh!' : 'Không thể copy', ok ? 'ok' : 'err');
}

function directOpenFromCmd() {
  const acc = _accounts.find(a => a.id === _openId);
  if (acc) openDirect(getAccountUrl(acc, _providers));
  closeOverlay('cmdOverlay');
}

// ── Export / Import ───────────────────────────────────────────────────────────

async function exportData() {
  const data = await storage.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `ai-hub-backup-${Date.now()}.json`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  toast('Đã export dữ liệu', 'ok');
}

function importData() { document.getElementById('importFile')?.click(); }

async function handleImport(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await storage.importAll(data);
    await refreshAccounts();
    toast(`Import thành công ${data.accounts?.length ?? 0} tài khoản`, 'ok');
  } catch (err) {
    toast(`Import thất bại: ${err.message}`, 'err');
  } finally {
    e.target.value = '';
  }
}

async function clearAllData() {
  if (!confirm('Xóa TOÀN BỘ dữ liệu? Hành động không thể hoàn tác!')) return;
  await storage.accounts.replace([]);
  await storage.activity.clear();
  _selected.clear();
  await refreshAccounts();
  toast('Đã xóa toàn bộ dữ liệu', 'ok');
  closeOverlay('settingsOverlay');
}

// ── PWA install ───────────────────────────────────────────────────────────────

async function installApp() {
  const prompt = window._installPrompt;
  if (!prompt) return;
  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  if (outcome === 'accepted') {
    document.getElementById('installBanner')?.classList.add('hidden');
    window._installPrompt = null;
  }
}

// ── Close helpers ─────────────────────────────────────────────────────────────

function closeOpen()   { closeOverlay('openOverlay');   }
function closeOv(id)   { closeOverlay(id); }

// ── Expose to window (for inline handlers in HTML) ────────────────────────────

window.App = {
  // Init
  init,
  // Render
  render: debounce(renderView, 200),
  // Auth
  signIn, signOut,
  // Account CRUD
  openAdd, openEdit, saveAccount, closeForm,
  confirmDelete, doDelete, doDuplicate,
  // Open chat
  openChat, closeOpen, directOpenFromCmd, copyCmd,
  // Bulk
  applyBulkStatus, applyBulkTag,
  // Settings
  openSettings, saveSettings: saveSettings_,
  toggleAlwaysAsk, toggleSettingsAlwaysAsk,
  saveDefaultMode,
  // Data
  exportData, importData, handleImport, clearAllData,
  // PWA
  installApp,
  // Util
  closeOverlay: closeOv,
};

// Auto-start
document.addEventListener('DOMContentLoaded', init);

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      newSW?.addEventListener('statechange', () => {
        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Phiên bản mới có sẵn! Tải lại để cập nhật.', 'info');
        }
      });
    });
  });
}
