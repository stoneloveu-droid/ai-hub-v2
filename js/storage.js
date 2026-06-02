/**
 * @fileoverview Storage layer — IndexedDB via Dexie.js with auto-migration from localStorage.
 *
 * Storage interface (can be swapped for Firebase/Supabase by implementing same methods):
 *   storage.accounts.*  — CRUD for Account objects
 *   storage.activity.*  — append-only activity log
 *   storage.providers.* — custom AI providers
 */

import { DB_NAME, DB_VERSION, STORE, LS_LEGACY } from './constants.js';
import { logger, uid } from './utils.js';

// ── Dexie CDN load ────────────────────────────────────────────────────────────

let Dexie;
async function getDexie() {
  if (Dexie) return Dexie;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/dexie@4/dist/dexie.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
  Dexie = window.Dexie;
  return Dexie;
}

// ── DB schema ─────────────────────────────────────────────────────────────────

let _db = null;

async function getDb() {
  if (_db) return _db;
  const D = await getDexie();
  const db = new D(DB_NAME);

  db.version(1).stores({
    [STORE.ACCOUNTS] : '++_iid, id, ai, status, lastUsed, pinned, favorite, archived',
    [STORE.ACTIVITY] : '++_iid, ts, accountId, type',
    [STORE.PROVIDERS]: 'id, name',
  });

  // v2: add usageCount
  db.version(DB_VERSION).stores({
    [STORE.ACCOUNTS] : '++_iid, id, ai, status, lastUsed, pinned, favorite, archived, usageCount',
    [STORE.ACTIVITY] : '++_iid, ts, accountId, type',
    [STORE.PROVIDERS]: 'id, name',
  });

  await db.open();
  _db = db;
  return db;
}

// ── Migration from localStorage ───────────────────────────────────────────────

/**
 * Migrate old localStorage data to IndexedDB once.
 * @returns {Promise<number>} count of migrated records
 */
async function migrateFromLocalStorage() {
  const raw = localStorage.getItem(LS_LEGACY);
  if (!raw) return 0;
  try {
    const old = JSON.parse(raw);
    if (!Array.isArray(old) || !old.length) return 0;
    const db = await getDb();
    const existing = await db[STORE.ACCOUNTS].count();
    if (existing > 0) { localStorage.removeItem(LS_LEGACY); return 0; }

    const migrated = old.map(a => ({
      ...a,
      id          : a.id || uid(),
      pinned      : a.pinned    ?? false,
      favorite    : a.favorite  ?? false,
      archived    : a.archived  ?? false,
      usageCount  : a.usageCount ?? 0,
      browser     : a.browser   ?? 'chrome',
      _migrated   : true,
    }));
    await db[STORE.ACCOUNTS].bulkAdd(migrated);
    localStorage.removeItem(LS_LEGACY);
    logger.info(`Migrated ${migrated.length} accounts from localStorage`);
    return migrated.length;
  } catch (err) {
    logger.error('Migration failed', err);
    return 0;
  }
}

// ── Account CRUD ──────────────────────────────────────────────────────────────

const accounts = {
  /**
   * List accounts with optional filters.
   * @param {{ archived?: boolean }} [opts]
   * @returns {Promise<Account[]>}
   */
  async list(opts = {}) {
    const db = await getDb();
    let col = db[STORE.ACCOUNTS];
    const all = await col.toArray();
    return all.filter(a => (opts.archived ? a.archived : !a.archived));
  },

  /** @returns {Promise<Account|undefined>} */
  async get(id) {
    const db = await getDb();
    return db[STORE.ACCOUNTS].where('id').equals(id).first();
  },

  /** @returns {Promise<string>} id */
  async add(data) {
    const db = await getDb();
    const record = { ...data, id: data.id || uid(), createdAt: Date.now() };
    await db[STORE.ACCOUNTS].add(record);
    return record.id;
  },

  /** @returns {Promise<void>} */
  async update(id, patch) {
    const db = await getDb();
    await db[STORE.ACCOUNTS].where('id').equals(id).modify(patch);
  },

  /** @returns {Promise<void>} */
  async delete(id) {
    const db = await getDb();
    await db[STORE.ACCOUNTS].where('id').equals(id).delete();
  },

  /** @returns {Promise<void>} */
  async bulkDelete(ids) {
    const db = await getDb();
    await db[STORE.ACCOUNTS].where('id').anyOf(ids).delete();
  },

  /** @returns {Promise<void>} */
  async bulkUpdate(ids, patch) {
    const db = await getDb();
    await db[STORE.ACCOUNTS].where('id').anyOf(ids).modify(patch);
  },

  /** @returns {Promise<Account[]>} full dump for export/sync */
  async dump() {
    const db = await getDb();
    return db[STORE.ACCOUNTS].toArray();
  },

  /** Replace all accounts (used for import/pull). */
  async replace(list) {
    const db = await getDb();
    await db[STORE.ACCOUNTS].clear();
    await db[STORE.ACCOUNTS].bulkAdd(list);
  },

  /** @returns {Promise<number>} */
  async count() {
    const db = await getDb();
    return db[STORE.ACCOUNTS].count();
  },
};

// ── Activity log ──────────────────────────────────────────────────────────────

const activity = {
  /**
   * Append an activity entry.
   * @param {{ type: string, accountId?: string, meta?: object }} entry
   */
  async log(entry) {
    const db = await getDb();
    await db[STORE.ACTIVITY].add({ ...entry, ts: Date.now(), id: uid() });
  },

  /**
   * @param {number} [limit]
   * @returns {Promise<ActivityEntry[]>}
   */
  async recent(limit = 50) {
    const db = await getDb();
    const all = await db[STORE.ACTIVITY].orderBy('ts').reverse().limit(limit).toArray();
    return all;
  },

  async clear() {
    const db = await getDb();
    await db[STORE.ACTIVITY].clear();
  },
};

// ── Custom providers ──────────────────────────────────────────────────────────

const providers = {
  async list() {
    const db = await getDb();
    return db[STORE.PROVIDERS].toArray();
  },
  async add(p) {
    const db = await getDb();
    await db[STORE.PROVIDERS].add({ ...p, id: p.id || uid() });
  },
  async delete(id) {
    const db = await getDb();
    await db[STORE.PROVIDERS].delete(id);
  },
};

// ── Backup / Restore ──────────────────────────────────────────────────────────

/**
 * Export entire DB to a JSON-serialisable object.
 * @returns {Promise<object>}
 */
async function exportAll() {
  const [accs, provs, acts] = await Promise.all([
    accounts.dump(),
    providers.list(),
    activity.recent(500),
  ]);
  return { version: DB_VERSION, exportedAt: Date.now(), accounts: accs, providers: provs, activity: acts };
}

/**
 * Restore from exported object.
 * @param {object} data
 */
async function importAll(data) {
  if (data.accounts) await accounts.replace(data.accounts);
  if (data.providers) {
    const db = await getDb();
    await db[STORE.PROVIDERS].clear();
    if (data.providers.length) await db[STORE.PROVIDERS].bulkAdd(data.providers);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Initialise storage — open DB, run migration, seed providers.
 * @returns {Promise<{ migrated: number }>}
 */
async function init() {
  await getDb();
  const migrated = await migrateFromLocalStorage();
  return { migrated };
}

export const storage = { init, accounts, activity, providers, exportAll, importAll };
