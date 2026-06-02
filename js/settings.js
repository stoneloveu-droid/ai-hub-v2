/**
 * @fileoverview Settings — persisted in localStorage (non-sensitive)
 *                          + Web Crypto for GitHub token.
 */

import { LS_SETTINGS, THEME, OPEN_MODE } from './constants.js';
import { encrypt, decrypt, logger } from './utils.js';

const CRYPTO_KEY = 'ai-hub:enc-token';
const SALT_KEY   = 'ai-hub:enc-salt';

/** @type {Settings} */
const DEFAULTS = Object.freeze({
  theme         : THEME.SYSTEM,
  alwaysAsk     : true,
  defaultOpenMode: OPEN_MODE.DIRECT,
  chromePath    : '',
  chromePathWin : '',
  gistId        : '',
  autoSync      : false,
  lastSyncAt    : null,
  // token stored separately via Web Crypto
});

let _settings = { ...DEFAULTS };

// ── Persist ───────────────────────────────────────────────────────────────────

export function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (raw) _settings = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {
    logger.warn('Failed to load settings', e);
  }
  return { ..._settings };
}

export function saveSettings(patch = {}) {
  _settings = { ..._settings, ...patch };
  // Never persist token in plaintext
  const { token: _token, ...safe } = _settings;
  try { localStorage.setItem(LS_SETTINGS, JSON.stringify(safe)); } catch {}
}

export function getSettings() { return { ..._settings }; }

// ── Token encryption (Web Crypto AES-256-GCM) ─────────────────────────────────

/**
 * Derive a stable passphrase from a browser fingerprint.
 * Not high-security, but prevents casual plaintext reads.
 * @returns {string}
 */
function getLocalPassphrase() {
  let salt = localStorage.getItem(SALT_KEY);
  if (!salt) {
    salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(SALT_KEY, salt);
  }
  return `ai-hub-token-${salt}-${navigator.userAgent.slice(0, 40)}`;
}

/**
 * Save GitHub token encrypted.
 * @param {string} token
 */
export async function saveToken(token) {
  if (!token) { localStorage.removeItem(CRYPTO_KEY); return; }
  try {
    const pass      = getLocalPassphrase();
    const encrypted = await encrypt(token, pass);
    localStorage.setItem(CRYPTO_KEY, encrypted);
  } catch (e) {
    // Fallback: if crypto fails, don't save at all
    logger.error('Token encryption failed', e);
    throw new Error('Không thể mã hoá token. Trình duyệt của bạn có hỗ trợ Web Crypto API không?');
  }
}

/**
 * Load and decrypt GitHub token.
 * @returns {Promise<string>}
 */
export async function loadToken() {
  const encrypted = localStorage.getItem(CRYPTO_KEY);
  if (!encrypted) return '';
  try {
    return await decrypt(encrypted, getLocalPassphrase());
  } catch (e) {
    logger.warn('Token decryption failed (possibly different device/browser)', e);
    return '';
  }
}

/**
 * Clear stored token.
 */
export function clearToken() {
  localStorage.removeItem(CRYPTO_KEY);
}

// ── Theme ─────────────────────────────────────────────────────────────────────

/**
 * Apply theme to <html> element.
 * @param {string} theme - 'light' | 'dark' | 'system'
 */
export function applyTheme(theme) {
  const root = document.documentElement;
  root.removeAttribute('data-theme');
  if (theme === THEME.LIGHT)  root.setAttribute('data-theme', 'light');
  if (theme === THEME.DARK)   root.setAttribute('data-theme', 'dark');
  if (theme === THEME.SYSTEM) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }
  saveSettings({ theme });
}

// Auto update system theme
const mq = window.matchMedia('(prefers-color-scheme: dark)');
mq.addEventListener('change', () => {
  if (getSettings().theme === THEME.SYSTEM) applyTheme(THEME.SYSTEM);
});
