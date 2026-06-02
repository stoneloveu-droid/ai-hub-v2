/**
 * @fileoverview Settings — persisted in localStorage (non-sensitive)
 */

import { LS_SETTINGS, THEME, OPEN_MODE } from './constants.js';
import { logger } from './utils.js';

/** @type {Settings} */
const DEFAULTS = Object.freeze({
  theme         : THEME.SYSTEM,
  alwaysAsk     : true,
  defaultOpenMode: OPEN_MODE.DIRECT,
  chromePath    : '',
  chromePathWin : '',
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
  try { localStorage.setItem(LS_SETTINGS, JSON.stringify(_settings)); } catch {}
}

export function getSettings() { return { ..._settings }; }

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
