/**
 * @fileoverview Account operations — business logic layer above storage.
 */

import { storage }          from './storage.js';
import { DEFAULT_PROVIDERS } from './constants.js';
import { uid, sanitize, parseTags, isValidUrl, clone, logger } from './utils.js';

// ── Provider resolution ───────────────────────────────────────────────────────

let _providers = null;

export async function getAllProviders() {
  if (_providers) return _providers;
  try {
    const custom = await storage.providers.list();
    _providers = [...DEFAULT_PROVIDERS, ...custom];
  } catch (e) {
    // FIXED: allow app to render before login / when offline
    _providers = [...DEFAULT_PROVIDERS];
  }
  return _providers;
}

export function invalidateProviders() { _providers = null; }

export function getProvider(aiName, providers) {
  return providers.find(p => p.name === aiName || p.id === aiName?.toLowerCase());
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate account form data.
 * @param {object} data
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAccount(data) {
  const errors = [];
  if (!sanitize(data.name))   errors.push('Tên tài khoản không được để trống.');
  if (!sanitize(data.ai))     errors.push('Vui lòng chọn loại AI.');
  if (data.url && !isValidUrl(data.url)) errors.push('URL không hợp lệ.');
  if (data.email) {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(data.email)) errors.push('Email không hợp lệ.');
  }
  return { valid: errors.length === 0, errors };
}

// ── CRUD helpers ──────────────────────────────────────────────────────────────

/**
 * Build a clean account object from raw form data.
 * @param {object} raw
 * @returns {Account}
 */
export function buildAccount(raw) {
  return {
    id          : raw.id || uid(),
    name        : sanitize(raw.name),
    ai          : sanitize(raw.ai),
    email       : sanitize(raw.email ?? ''),
    status      : raw.status ?? 'active',
    tags        : Array.isArray(raw.tags) ? raw.tags.map(sanitize) : parseTags(raw.tags ?? ''),
    url         : sanitize(raw.url ?? ''),
    browser     : raw.browser ?? 'chrome',
    profile     : sanitize(raw.profile ?? raw.chromeProfile ?? ''),
    chromePath  : sanitize(raw.chromePath ?? ''),
    note        : sanitize(raw.note ?? ''),
    pinned      : Boolean(raw.pinned),
    favorite    : Boolean(raw.favorite),
    archived    : Boolean(raw.archived),
    usageCount  : Number(raw.usageCount ?? 0),
    lastUsed    : raw.lastUsed ?? null,
    limitedAt   : raw.limitedAt ?? null,
    customLimitHours: raw.customLimitHours ?? null,
    createdAt   : raw.createdAt ?? Date.now(),
  };
}

/**
 * Add a new account, log activity.
 * @param {object} raw - form data
 * @returns {Promise<string>} new id
 */
export async function addAccount(raw) {
  const account = buildAccount(raw);
  const { valid, errors } = validateAccount(account);
  if (!valid) throw new Error(errors.join('\n'));
  await storage.accounts.add(account);
  await storage.activity.log({ type: 'create', accountId: account.id, meta: { name: account.name, ai: account.ai } });
  return account.id;
}

/**
 * Update existing account.
 * @param {string} id
 * @param {object} patch
 */
export async function updateAccount(id, patch) {
  const cleaned = buildAccount({ ...patch, id });
  const { valid, errors } = validateAccount(cleaned);
  if (!valid) throw new Error(errors.join('\n'));
  await storage.accounts.update(id, cleaned);
  await storage.activity.log({ type: 'update', accountId: id, meta: { name: cleaned.name } });
}

/**
 * Delete account by id.
 * @param {string} id
 */
export async function deleteAccount(id) {
  const acc = await storage.accounts.get(id);
  await storage.accounts.delete(id);
  await storage.activity.log({ type: 'delete', accountId: id, meta: { name: acc?.name } });
}

/**
 * Duplicate an account.
 * @param {string} id
 * @returns {Promise<string>} new id
 */
export async function duplicateAccount(id) {
  const acc = await storage.accounts.get(id);
  if (!acc) throw new Error('Account not found');
  const copy = buildAccount({ ...clone(acc), id: null, name: `${acc.name} (copy)`, createdAt: Date.now(), lastUsed: null });
  await storage.accounts.add(copy);
  await storage.activity.log({ type: 'duplicate', accountId: copy.id, meta: { from: id } });
  return copy.id;
}

/**
 * Record a "chat opened" usage event.
 * @param {string} id
 */
export async function recordUsage(id) {
  await storage.accounts.update(id, {
    lastUsed  : Date.now(),
    usageCount: ((await storage.accounts.get(id))?.usageCount ?? 0) + 1,
  });
  await storage.activity.log({ type: 'open_chat', accountId: id });
}

// ── Filter / search ───────────────────────────────────────────────────────────

/**
 * Filter and sort account list.
 * @param {Account[]} list
 * @param {{ q?: string, ai?: string, status?: string, tag?: string, sort?: string, showArchived?: boolean }} filters
 * @returns {Account[]}
 */
export function filterAccounts(list, filters = {}) {
  const { q = '', ai = '', status = '', tag = '', sort = 'pinned', showArchived = false } = filters;
  const query = q.toLowerCase();

  let result = list.filter(a => {
    if (!showArchived && a.archived) return false;
    if (ai     && a.ai !== ai)                     return false;
    if (status && a.status !== status)             return false;
    if (tag    && !(a.tags ?? []).includes(tag))   return false;
    if (query) {
      const hay = [a.name, a.email, a.note, a.profile, ...(a.tags ?? [])].join(' ').toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  result.sort((a, b) => {
    // Pinned always first
    if (sort === 'pinned') {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return (b.lastUsed ?? 0) - (a.lastUsed ?? 0);
    }
    if (sort === 'lastUsed') return (b.lastUsed ?? 0) - (a.lastUsed ?? 0);
    if (sort === 'oldest')   return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    if (sort === 'name')     return a.name.localeCompare(b.name, 'vi');
    if (sort === 'ai')       return a.ai.localeCompare(b.ai);
    if (sort === 'status')   return a.status.localeCompare(b.status);
    if (sort === 'usage')    return (b.usageCount ?? 0) - (a.usageCount ?? 0);
    return 0;
  });

  return result;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

/**
 * Compute dashboard stats.
 * @param {Account[]} all
 * @returns {Stats}
 */
export function computeStats(all) {
  const active   = all.filter(a => a.status === 'active'  && !a.archived).length;
  const limited  = all.filter(a => a.status === 'limited' && !a.archived).length;
  const expired  = all.filter(a => a.status === 'expired' && !a.archived).length;
  const banned   = all.filter(a => a.status === 'banned'  && !a.archived).length;
  const favorite = all.filter(a => a.favorite && !a.archived).length;
  const archived = all.filter(a => a.archived).length;

  const byAI = all
    .filter(a => !a.archived)
    .reduce((acc, a) => { acc[a.ai] = (acc[a.ai] ?? 0) + 1; return acc; }, {});

  const topAI = Object.entries(byAI).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const topAccounts = [...all]
    .filter(a => !a.archived)
    .sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0))
    .slice(0, 5);

  return {
    total: all.filter(a => !a.archived).length,
    active, limited, expired, banned, favorite, archived,
    byAI, topAI, topAccounts,
  };
}
