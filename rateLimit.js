/**
 * @fileoverview Rate limit tracking — per-account countdown, notifications.
 */

import { storage }      from './storage.js';
import { DEFAULT_PROVIDERS } from './constants.js';
import { formatCountdown, logger } from './utils.js';

/** Map<accountId, intervalId> */
const _timers = new Map();

/**
 * Get the limit duration (ms) for an account.
 * @param {Account}    account
 * @param {Provider[]} providers
 * @returns {number} ms
 */
function getLimitMs(account, providers) {
  if (account.customLimitHours) return account.customLimitHours * 3_600_000;
  const p = [...DEFAULT_PROVIDERS, ...providers].find(p => p.name === account.ai);
  return (p?.limitHours ?? 4) * 3_600_000;
}

/**
 * Calculate remaining ms for a rate-limited account.
 * @param {Account}    account
 * @param {Provider[]} providers
 * @returns {number} ms remaining (0 if reset)
 */
export function getRemainingMs(account, providers) {
  if (account.status !== 'limited') return 0;
  const limitedAt = account.limitedAt ?? account.lastUsed ?? Date.now();
  const limit     = getLimitMs(account, providers);
  const elapsed   = Date.now() - limitedAt;
  return Math.max(0, limit - elapsed);
}

/**
 * Formatted countdown string for display.
 * @param {Account}    account
 * @param {Provider[]} providers
 * @returns {string}
 */
export function getCountdownLabel(account, providers) {
  const ms = getRemainingMs(account, providers);
  if (ms === 0 && account.status === 'limited') return 'Sẵn sàng reset!';
  return ms > 0 ? formatCountdown(ms) : '';
}

/**
 * Start a live countdown tick for a single account card.
 * @param {string}     accountId
 * @param {Account}    account
 * @param {Provider[]} providers
 * @param {Function}   onTick  - called every second with (remainingMs)
 * @param {Function}   onReset - called when countdown hits 0
 */
export function startCountdown(accountId, account, providers, onTick, onReset) {
  stopCountdown(accountId);
  const id = setInterval(async () => {
    const ms = getRemainingMs(account, providers);
    onTick(ms);
    if (ms === 0) {
      stopCountdown(accountId);
      // Auto-update status in DB
      try {
        await storage.accounts.update(accountId, { status: 'active' });
        await storage.activity.log({ type: 'rate_limit_reset', accountId, meta: { ai: account.ai } });
      } catch (e) { logger.error('Failed to auto-reset status', e); }
      onReset();
      // Browser notification
      notify(`${account.name} đã reset!`, `Tài khoản ${account.ai} sẵn sàng sử dụng.`);
    }
  }, 1_000);
  _timers.set(accountId, id);
}

/**
 * Stop countdown for an account.
 * @param {string} accountId
 */
export function stopCountdown(accountId) {
  const id = _timers.get(accountId);
  if (id) { clearInterval(id); _timers.delete(accountId); }
}

/** Stop all running countdowns. */
export function stopAllCountdowns() {
  _timers.forEach(id => clearInterval(id));
  _timers.clear();
}

// ── Notification ──────────────────────────────────────────────────────────────

/**
 * Request notification permission once.
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

/**
 * Show a browser notification.
 * @param {string} title
 * @param {string} body
 */
function notify(title, body) {
  if (Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon: 'icon-192.png' }); }
  catch (e) { logger.warn('Notification failed', e); }
}

// ── Rotation helper ───────────────────────────────────────────────────────────

/**
 * Pick the best available account to rotate to, given current account.
 * @param {Account[]} all
 * @param {string}    currentId
 * @param {'roundrobin'|'leastused'|'random'} [strategy]
 * @returns {Account|null}
 */
export function pickRotationAccount(all, currentId, strategy = 'leastused') {
  const candidates = all.filter(a => a.id !== currentId && a.status === 'active' && !a.archived);
  if (!candidates.length) return null;

  if (strategy === 'random')    return candidates[Math.floor(Math.random() * candidates.length)];
  if (strategy === 'roundrobin') {
    const idx = all.findIndex(a => a.id === currentId);
    for (let i = 1; i <= all.length; i++) {
      const c = all[(idx + i) % all.length];
      if (c && c.status === 'active' && !c.archived) return c;
    }
    return null;
  }
  // leastused (default)
  return candidates.sort((a, b) => (a.usageCount ?? 0) - (b.usageCount ?? 0))[0];
}
