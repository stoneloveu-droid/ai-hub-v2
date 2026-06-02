/**
 * @fileoverview Storage layer — Firebase (Google login) + Cloud Firestore.
 *
 * This is the "simple, free, effective" path:
 * - Auth: Google via Firebase Authentication
 * - Sync: Firestore per-user collections
 *
 * NOTE: No build step, so we use Firebase ESM from the official CDN.
 */

import { FIREBASE_CONFIG, APP_VERSION } from './constants.js';
import { logger, uid } from './utils.js';

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as _signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  limit,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

// ── Firebase singletons ───────────────────────────────────────────────────────

let _app  = null;
let _auth = null;
let _db   = null;
let _user = null;

function hasFirebaseConfig() {
  return !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
}

function ensureFirebase() {
  if (_app && _auth && _db) return;
  if (!hasFirebaseConfig()) {
    throw new Error('Firebase chưa được cấu hình. Hãy thêm FIREBASE_CONFIG trong js/constants.js');
  }
  _app  = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  _auth = getAuth(_app);
  _db   = getFirestore(_app);
}

function ensureUser() {
  if (!_user) throw new Error('Bạn cần đăng nhập Google để dùng ứng dụng.');
  return _user;
}

function userCol(name) {
  const u = ensureUser();
  return collection(_db, 'users', u.uid, name);
}

// ── Auth public API ───────────────────────────────────────────────────────────

async function signIn() {
  ensureFirebase();
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(_auth, provider);
  _user = cred.user;
  return _user;
}

async function signOut() {
  ensureFirebase();
  await _signOut(_auth);
  _user = null;
}

function getUser() { return _user; }

function onUserChanged(cb) {
  ensureFirebase();
  return onAuthStateChanged(_auth, u => {
    _user = u || null;
    cb(_user);
  });
}

// ── Account CRUD (Firestore) ──────────────────────────────────────────────────

const accounts = {
  async list(opts = {}) {
    ensureFirebase();
    const col = userCol('accounts');
    const snap = await getDocs(col);
    const all = snap.docs.map(d => d.data());
    return all.filter(a => (opts.archived ? a.archived : !a.archived));
  },

  async get(id) {
    ensureFirebase();
    const ref = doc(_db, 'users', ensureUser().uid, 'accounts', id);
    const s = await getDoc(ref);
    return s.exists() ? s.data() : undefined;
  },

  async add(data) {
    ensureFirebase();
    const id = data.id || uid();
    const record = { ...data, id, createdAt: data.createdAt ?? Date.now() };
    const ref = doc(_db, 'users', ensureUser().uid, 'accounts', id);
    await setDoc(ref, record);
    return id;
  },

  async update(id, patch) {
    ensureFirebase();
    const ref = doc(_db, 'users', ensureUser().uid, 'accounts', id);
    await updateDoc(ref, patch);
  },

  async delete(id) {
    ensureFirebase();
    const ref = doc(_db, 'users', ensureUser().uid, 'accounts', id);
    await deleteDoc(ref);
  },

  async bulkDelete(ids) {
    ensureFirebase();
    const b = writeBatch(_db);
    const u = ensureUser();
    ids.forEach(id => b.delete(doc(_db, 'users', u.uid, 'accounts', id)));
    await b.commit();
  },

  async bulkUpdate(ids, patch) {
    ensureFirebase();
    const b = writeBatch(_db);
    const u = ensureUser();
    ids.forEach(id => b.update(doc(_db, 'users', u.uid, 'accounts', id), patch));
    await b.commit();
  },

  async dump() {
    ensureFirebase();
    const snap = await getDocs(userCol('accounts'));
    return snap.docs.map(d => d.data()); // include archived + non-archived
  },

  async replace(list) {
    ensureFirebase();
    const u = ensureUser();
    const col = collection(_db, 'users', u.uid, 'accounts');
    const snap = await getDocs(col);
    const b = writeBatch(_db);
    snap.docs.forEach(d => b.delete(d.ref));
    (list || []).forEach(a => {
      const id = a.id || uid();
      b.set(doc(_db, 'users', u.uid, 'accounts', id), { ...a, id });
    });
    await b.commit();
  },

  async count() {
    ensureFirebase();
    const snap = await getDocs(userCol('accounts'));
    return snap.size;
  },
};

// ── Activity log (Firestore) ──────────────────────────────────────────────────

const activity = {
  async log(entry) {
    ensureFirebase();
    const id = entry.id || uid();
    const record = { ...entry, id, ts: entry.ts ?? Date.now() };
    const ref = doc(_db, 'users', ensureUser().uid, 'activity', id);
    await setDoc(ref, record);
  },

  async recent(n = 50) {
    ensureFirebase();
    const qy = query(userCol('activity'), orderBy('ts', 'desc'), limit(n));
    const snap = await getDocs(qy);
    return snap.docs.map(d => d.data());
  },

  async clear() {
    ensureFirebase();
    const col = userCol('activity');
    const snap = await getDocs(col);
    const b = writeBatch(_db);
    snap.docs.forEach(d => b.delete(d.ref));
    await b.commit();
  },
};

// ── Custom providers (Firestore) ──────────────────────────────────────────────

const providers = {
  async list() {
    ensureFirebase();
    const snap = await getDocs(userCol('providers'));
    return snap.docs.map(d => d.data());
  },
  async add(p) {
    ensureFirebase();
    const id = p.id || uid();
    const ref = doc(_db, 'users', ensureUser().uid, 'providers', id);
    await setDoc(ref, { ...p, id });
  },
  async delete(id) {
    ensureFirebase();
    const ref = doc(_db, 'users', ensureUser().uid, 'providers', id);
    await deleteDoc(ref);
  },
};

// ── Backup / Restore ──────────────────────────────────────────────────────────

async function exportAll() {
  ensureFirebase();
  const [accs, provs, acts] = await Promise.all([
    accounts.dump(),
    providers.list(),
    activity.recent(500),
  ]);
  return { version: APP_VERSION, exportedAt: Date.now(), accounts: accs, providers: provs, activity: acts };
}

async function importAll(data) {
  ensureFirebase();
  if (data.accounts) await accounts.replace(data.accounts);
  if (data.providers) {
    await (async () => {
      const col = userCol('providers');
      const snap = await getDocs(col);
      const b = writeBatch(_db);
      snap.docs.forEach(d => b.delete(d.ref));
      const u = ensureUser();
      (data.providers || []).forEach(p => {
        const id = p.id || uid();
        b.set(doc(_db, 'users', u.uid, 'providers', id), { ...p, id });
      });
      await b.commit();
    })();
  }
  if (data.activity) { // FIXED: clear and import activity to avoid duplicates
    await (async () => {
      const col = userCol('activity');
      const snap = await getDocs(col);
      const b = writeBatch(_db);
      snap.docs.forEach(d => b.delete(d.ref));
      const u = ensureUser();
      (data.activity || []).forEach(a => {
        const id = a.id || uid();
        b.set(doc(_db, 'users', u.uid, 'activity', id), { ...a, id });
      });
      await b.commit();
    })();
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  ensureFirebase();
  onAuthStateChanged(_auth, u => { _user = u || null; });
  logger.info('Firebase storage initialised');
  return { migrated: 0 };
}

export const storage = {
  init,
  accounts,
  activity,
  providers,
  exportAll,
  importAll,
  // auth helpers
  signIn,
  signOut,
  getUser,
  onUserChanged,
};
