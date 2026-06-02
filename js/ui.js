/**
 * @fileoverview UI renderer — DOM creation, card rendering, modals, toasts.
 * Uses createElement instead of innerHTML for security.
 */

import { STATUS_META, TOAST_MS, DEFAULT_PROVIDERS } from './constants.js';
import { timeAgo, el, setText, sanitize }           from './utils.js';
import { getCountdownLabel, getRemainingMs, startCountdown, stopAllCountdowns } from './rateLimit.js';

// ── Toast ─────────────────────────────────────────────────────────────────────

/**
 * Show a toast notification.
 * @param {string} msg
 * @param {'ok'|'err'|'info'|'warn'} [type]
 */
export function toast(msg, type = 'ok') {
  const container = document.getElementById('toaster');
  if (!container) return;

  const iconMap = { ok: 'ti-check', err: 'ti-alert-circle', info: 'ti-info-circle', warn: 'ti-alert-triangle' };
  const t   = el('div', ['toast', `toast-${type}`]);
  const ico = el('i', ['ti', iconMap[type] ?? 'ti-check']);
  const txt = el('span');
  txt.textContent = msg;
  t.appendChild(ico);
  t.appendChild(txt);
  container.appendChild(t);
  setTimeout(() => t.classList.add('toast-out'), TOAST_MS - 300);
  setTimeout(() => t.remove(), TOAST_MS);
}

// ── Overlay helpers ───────────────────────────────────────────────────────────

/** @param {string} id */
export function openOverlay(id) {
  document.getElementById(id)?.classList.add('open');
}

/** @param {string} id */
export function closeOverlay(id) {
  document.getElementById(id)?.classList.remove('open');
}

/** Close all overlays */
export function closeAllOverlays() {
  document.querySelectorAll('.overlay.open').forEach(el => el.classList.remove('open'));
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

/**
 * Render stats row.
 * @param {Stats} stats
 */
export function renderStats(stats) {
  const container = document.getElementById('statsRow');
  if (!container) return;
  container.innerHTML = '';

  const items = [
    { n: stats.total,    l: 'Tổng',     color: '' },
    { n: stats.active,   l: 'Active',   color: 'var(--green)' },
    { n: stats.limited,  l: 'Limited',  color: 'var(--amber)' },
    { n: stats.expired + stats.banned, l: 'Hết hạn', color: 'var(--red)' },
    { n: stats.favorite, l: 'Yêu thích',color: '#E67E22' },
    { n: stats.archived, l: 'Archived', color: 'var(--text-muted)' },
  ];

  items.forEach(({ n, l, color }) => {
    const card = el('div', ['stat-card']);
    const num  = el('div', ['stat-n'], String(n));
    if (color) num.style.color = color;
    const lbl  = el('div', ['stat-l'], l);
    card.appendChild(num);
    card.appendChild(lbl);
    container.appendChild(card);
  });
}

// ── AI chips ─────────────────────────────────────────────────────────────────

/**
 * Render AI filter chips.
 * @param {string[]} aiList
 * @param {string}   active
 * @param {Function} onClick
 */
export function renderAIChips(aiList, active, onClick) {
  const container = document.getElementById('aiChips');
  if (!container) return;
  container.innerHTML = '';

  [{ key: '', label: 'Tất cả' }, ...aiList.map(a => ({ key: a, label: a }))].forEach(({ key, label }) => {
    const chip = el('button', ['chip', ...(active === key ? ['active'] : [])], label);
    chip.addEventListener('click', () => onClick(key));
    container.appendChild(chip);
  });
}

// ── Card rendering ────────────────────────────────────────────────────────────

/**
 * Render all account cards.
 * @param {Account[]}  accounts
 * @param {Provider[]} providers
 * @param {object}     handlers - { onOpen, onEdit, onDelete, onDuplicate, onToggleFav, onTogglePin, onSelect }
 * @param {Set<string>} selected
 */
export function renderCards(accounts, providers, handlers, selected = new Set()) {
  stopAllCountdowns();
  const container = document.getElementById('cardsList');
  if (!container) return;
  container.innerHTML = '';

  setText('resultLabel', `${accounts.length} tài khoản`);

  if (!accounts.length) {
    const empty = el('div', ['empty']);
    const ico   = el('i',   ['ti', 'ti-robot-off']);
    const msg   = el('div', [], 'Không tìm thấy tài khoản');
    const sub   = el('div', ['empty-sub'], 'Thử thay đổi bộ lọc hoặc thêm tài khoản mới');
    empty.appendChild(ico);
    empty.appendChild(msg);
    empty.appendChild(sub);
    container.appendChild(empty);
    return;
  }

  accounts.forEach(acc => {
    const card = buildCard(acc, providers, handlers, selected.has(acc.id));
    container.appendChild(card);
  });
}

/**
 * Build a single account card DOM node.
 */
function buildCard(acc, providers, handlers, isSelected) {
  const provider = providers.find(p => p.name === acc.ai) ?? DEFAULT_PROVIDERS[0];
  const sm       = STATUS_META[acc.status] ?? STATUS_META.active;

  const card = el('div', ['card', ...(acc.pinned ? ['card-pinned'] : []), ...(isSelected ? ['card-selected'] : [])]);
  card.dataset.id = acc.id;

  // ── Top row ──
  const top  = el('div', ['card-top']);
  const icon = el('div', ['ai-icon']);
  icon.style.background = provider.bg ?? '#eee';
  icon.textContent       = provider.emoji ?? '🤖';

  // Checkbox (visible when any selected)
  const cb = document.createElement('input');
  cb.type      = 'checkbox';
  cb.className = 'card-checkbox';
  cb.checked   = isSelected;
  cb.addEventListener('change', () => handlers.onSelect?.(acc.id, cb.checked));
  icon.appendChild(cb);

  const info = el('div', ['card-info']);
  const name = el('div', ['card-name'], acc.name);
  name.title  = acc.name;
  const type = el('div', ['card-type'], acc.ai);
  info.appendChild(name);
  info.appendChild(type);

  const actions = el('div', ['card-btns']);

  // Pin / Fav / Duplicate / Edit / Delete
  const pinBtn = el('button', ['btn', 'btn-icon', 'btn-sm', ...(acc.pinned ? ['active'] : [])]);
  pinBtn.title = acc.pinned ? 'Bỏ ghim' : 'Ghim';
  pinBtn.innerHTML = `<i class="ti ${acc.pinned ? 'ti-pin-filled' : 'ti-pin'}"></i>`;
  pinBtn.addEventListener('click', e => { e.stopPropagation(); handlers.onTogglePin?.(acc.id, !acc.pinned); });

  const favBtn = el('button', ['btn', 'btn-icon', 'btn-sm', ...(acc.favorite ? ['btn-fav-active'] : [])]);
  favBtn.title = acc.favorite ? 'Bỏ yêu thích' : 'Yêu thích';
  favBtn.innerHTML = `<i class="ti ${acc.favorite ? 'ti-star-filled' : 'ti-star'}"></i>`;
  favBtn.addEventListener('click', e => { e.stopPropagation(); handlers.onToggleFav?.(acc.id, !acc.favorite); });

  const dupBtn = el('button', ['btn', 'btn-icon', 'btn-sm']);
  dupBtn.title = 'Nhân bản'; dupBtn.innerHTML = '<i class="ti ti-copy"></i>';
  dupBtn.addEventListener('click', e => { e.stopPropagation(); handlers.onDuplicate?.(acc.id); });

  const editBtn = el('button', ['btn', 'btn-icon', 'btn-sm']);
  editBtn.title = 'Sửa'; editBtn.innerHTML = '<i class="ti ti-edit"></i>';
  editBtn.addEventListener('click', e => { e.stopPropagation(); handlers.onEdit?.(acc.id); });

  const delBtn = el('button', ['btn', 'btn-icon', 'btn-sm', 'btn-danger']);
  delBtn.title = 'Xóa'; delBtn.innerHTML = '<i class="ti ti-trash"></i>';
  delBtn.addEventListener('click', e => { e.stopPropagation(); handlers.onDelete?.(acc.id); });

  actions.append(pinBtn, favBtn, dupBtn, editBtn, delBtn);
  top.append(icon, info, actions);

  // ── Meta row ──
  const meta = el('div', ['card-meta']);
  const badge = el('span', ['sbadge', sm.cls]);
  const dot   = el('span', ['sdot']);
  dot.style.background = sm.dot;
  badge.appendChild(dot);
  badge.appendChild(document.createTextNode(sm.label));
  meta.appendChild(badge);

  if (acc.email) {
    const emailEl = el('span', ['card-email']);
    emailEl.innerHTML = '<i class="ti ti-mail"></i>';
    emailEl.appendChild(document.createTextNode(acc.email));
    meta.appendChild(emailEl);
  }

  if (acc.profile) {
    const profileEl = el('span', ['card-profile']);
    profileEl.innerHTML = `<i class="ti ti-brand-chrome"></i>`;
    profileEl.appendChild(document.createTextNode(acc.profile));
    meta.appendChild(profileEl);
  }

  // ── Countdown ──
  const countdownEl = el('div', ['card-countdown', 'hidden']);
  if (acc.status === 'limited') {
    countdownEl.classList.remove('hidden');
    const ms = getRemainingMs(acc, providers);
    if (ms > 0) {
      const cdIco = el('i', ['ti', 'ti-clock']);
      const cdTxt = el('span', [], formatCountdown(ms));
      countdownEl.appendChild(cdIco);
      countdownEl.appendChild(cdTxt);
      startCountdown(acc.id, acc, providers,
        (ms) => { if (cdTxt.isConnected) cdTxt.textContent = ms > 0 ? formatCountdown(ms) : 'Reset!'; },
        ()   => { handlers.onCountdownReset?.(acc.id); }
      );
    } else {
      countdownEl.textContent = 'Sẵn sàng reset!';
    }
  }

  // ── Tags ──
  const tagsEl = el('div', ['tags']);
  (acc.tags ?? []).forEach(tag => {
    const t = el('span', ['tag'], tag);
    tagsEl.appendChild(t);
  });

  // ── Note ──
  const noteEl = acc.note ? el('div', ['card-note'], acc.note) : null;

  // ── Footer ──
  const foot   = el('div', ['card-foot']);
  const time   = el('span', ['card-time']);
  time.innerHTML = '<i class="ti ti-clock"></i>';
  time.appendChild(document.createTextNode(timeAgo(acc.lastUsed)));

  const openBtn = el('button', ['btn', 'btn-open'], '');
  const openIco = el('i', ['ti', 'ti-external-link']);
  openBtn.appendChild(openIco);
  openBtn.appendChild(document.createTextNode(' Mở Chat'));
  openBtn.addEventListener('click', e => { e.stopPropagation(); handlers.onOpen?.(acc.id); });

  foot.appendChild(time);

  if (acc.usageCount) {
    const usage = el('span', ['card-usage'], `${acc.usageCount}×`);
    foot.appendChild(usage);
  }

  foot.appendChild(openBtn);

  // ── Assemble ──
  card.appendChild(top);
  card.appendChild(meta);
  if (countdownEl && acc.status === 'limited') card.appendChild(countdownEl);
  if (tagsEl.childNodes.length) card.appendChild(tagsEl);
  if (noteEl) card.appendChild(noteEl);
  card.appendChild(foot);

  return card;
}

// Helper to import formatCountdown without circular deps
function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

// ── Bulk action bar ───────────────────────────────────────────────────────────

/**
 * Show / hide bulk action bar.
 * @param {number}   count
 * @param {Function} handlers
 */
export function renderBulkBar(count, handlers) {
  let bar = document.getElementById('bulkBar');
  if (!bar) {
    bar = el('div', ['bulk-bar']);
    bar.id = 'bulkBar';
    document.getElementById('app')?.appendChild(bar);
  }
  if (count === 0) { bar.classList.remove('open'); return; }
  bar.classList.add('open');
  bar.innerHTML = '';

  const lbl    = el('span', ['bulk-count'], `${count} đã chọn`);
  const selAll = el('button', ['btn', 'btn-sm'], 'Chọn tất cả');
  selAll.addEventListener('click', handlers.onSelectAll);

  const statBtn = el('button', ['btn', 'btn-sm'], 'Đổi trạng thái');
  statBtn.addEventListener('click', handlers.onBulkStatus);

  const tagBtn = el('button', ['btn', 'btn-sm'], 'Gán tag');
  tagBtn.addEventListener('click', handlers.onBulkTag);

  const archBtn = el('button', ['btn', 'btn-sm'], 'Archive');
  archBtn.addEventListener('click', handlers.onBulkArchive);

  const delBtn = el('button', ['btn', 'btn-sm', 'btn-danger'], '');
  delBtn.innerHTML = '<i class="ti ti-trash"></i> Xóa';
  delBtn.addEventListener('click', handlers.onBulkDelete);

  const clr = el('button', ['btn', 'btn-sm', 'btn-icon']);
  clr.innerHTML = '<i class="ti ti-x"></i>';
  clr.title = 'Bỏ chọn';
  clr.addEventListener('click', handlers.onClear);

  bar.append(lbl, selAll, statBtn, tagBtn, archBtn, delBtn, clr);
}

// ── Skeleton loading ──────────────────────────────────────────────────────────

/** Show skeleton placeholders while loading. */
export function showSkeleton(count = 4) {
  const container = document.getElementById('cardsList');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const sk = el('div', ['card', 'skeleton']);
    sk.innerHTML = `
      <div class="skeleton-top">
        <div class="skeleton-icon sk-pulse"></div>
        <div class="skeleton-lines">
          <div class="sk-line sk-pulse" style="width:60%"></div>
          <div class="sk-line sk-pulse" style="width:40%"></div>
        </div>
      </div>
      <div class="sk-line sk-pulse" style="width:30%;margin:8px 0"></div>
      <div class="sk-line sk-pulse" style="width:80%;margin-bottom:8px"></div>
      <div class="sk-line sk-pulse" style="width:45%"></div>
    `;
    container.appendChild(sk);
  }
}

// ── Sync button state ─────────────────────────────────────────────────────────

export function setSyncing(active) {
  const btn = document.getElementById('syncBtn');
  if (!btn) return;
  btn.classList.toggle('syncing', active);
  btn.disabled = active;
}

// ── Toggle helper ─────────────────────────────────────────────────────────────

/**
 * Set toggle button on/off state.
 * @param {string}  id
 * @param {boolean} on
 */
export function setToggle(id, on) {
  const btn = document.getElementById(id);
  if (btn) btn.className = `toggle ${on ? 'on' : ''}`.trim();
}
