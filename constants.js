/**
 * @fileoverview App-wide constants — no magic numbers or hardcoded strings elsewhere.
 */

export const APP_VERSION = '2.0.0';

// Firebase (Google login + Firestore sync)
// FIXED: add Firebase config placeholder for Google sign-in sync
// 1) Create Firebase project (Spark/free)
// 2) Enable Authentication -> Google
// 3) Create Firestore Database
// 4) Paste your web app config below
export const FIREBASE_CONFIG = Object.freeze({
  apiKey: "AIzaSyDqXiNPup5zujFf2FOlAffgb8D6yGLV7Pg",
  authDomain: "ai-hubb-v2.firebaseapp.com",
  projectId: "ai-hubb-v2",
  storageBucket: "ai-hubb-v2.firebasestorage.app",
  messagingSenderId: "103905158433",
  appId: "1:103905158433:web:92b010313be8191f2e0a60",
  // measurementId không cần cho app này
});

/** localStorage key for settings (non-sensitive) */
export const LS_SETTINGS = 'ai-hub:settings';

/** Account status values */
export const STATUS = Object.freeze({
  ACTIVE : 'active',
  LIMITED: 'limited',
  EXPIRED: 'expired',
  BANNED : 'banned',
});

/** Status display metadata */
export const STATUS_META = Object.freeze({
  [STATUS.ACTIVE] : { label: 'Active',       cls: 's-active',  dot: '#639922' },
  [STATUS.LIMITED]: { label: 'Rate Limited',  cls: 's-limited', dot: '#BA7517' },
  [STATUS.EXPIRED]: { label: 'Hết hạn',       cls: 's-expired', dot: '#E24B4A' },
  [STATUS.BANNED] : { label: 'Banned',        cls: 's-banned',  dot: '#D4537E' },
});

/** Theme options */
export const THEME = Object.freeze({ LIGHT: 'light', DARK: 'dark', SYSTEM: 'system' });

/** Open-chat modes */
export const OPEN_MODE = Object.freeze({ DIRECT: 'direct', BROWSER: 'browser' });

/** Built-in AI providers */
export const DEFAULT_PROVIDERS = Object.freeze([
  { id: 'chatgpt',    name: 'ChatGPT',    url: 'https://chatgpt.com',              emoji: '🤖', color: '#10A37F', bg: '#E6F9F4', limitHours: 3  },
  { id: 'claude',     name: 'Claude',     url: 'https://claude.ai',                emoji: '🔮', color: '#7F77DD', bg: '#EEEDFE', limitHours: 8  },
  { id: 'gemini',     name: 'Gemini',     url: 'https://gemini.google.com',        emoji: '✨', color: '#185FA5', bg: '#E6F1FB', limitHours: 24 },
  { id: 'grok',       name: 'Grok',       url: 'https://grok.x.ai',               emoji: '⚡', color: '#5F5E5A', bg: '#F1EFE8', limitHours: 2  },
  { id: 'perplexity', name: 'Perplexity', url: 'https://perplexity.ai',            emoji: '🔍', color: '#BA7517', bg: '#FAEEDA', limitHours: 4  },
  { id: 'deepseek',   name: 'DeepSeek',   url: 'https://chat.deepseek.com',        emoji: '🐳', color: '#185FA5', bg: '#D9EEF9', limitHours: 24 },
  { id: 'copilot',    name: 'Copilot',    url: 'https://copilot.microsoft.com',    emoji: '🪁', color: '#0F6E56', bg: '#E1F5EE', limitHours: 24 },
  { id: 'mistral',    name: 'Mistral',    url: 'https://chat.mistral.ai',          emoji: '🌀', color: '#993C1D', bg: '#FAECE7', limitHours: 24 },
  { id: 'llama',      name: 'Llama',      url: 'https://meta.ai',                  emoji: '🦙', color: '#534AB7', bg: '#EEEDFE', limitHours: 24 },
]);

export const TAGS_PRESET = Object.freeze([
  'Coding', 'Writing', 'Research', 'Translation',
  'Creative', 'Analysis', 'Image Gen', 'Backup',
]);

export const BROWSER_PRESETS = Object.freeze({
  chrome : { linux: 'google-chrome', win: '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"',  mac: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
  edge   : { linux: 'microsoft-edge', win: '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"', mac: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
  brave  : { linux: 'brave-browser',  win: '"C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"',  mac: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' },
  firefox: { linux: 'firefox',        win: '"C:\\Program Files\\Mozilla Firefox\\firefox.exe"', mac: '/Applications/Firefox.app/Contents/MacOS/firefox' },
});

export const DEBOUNCE_MS   = 200;
export const TOAST_MS      = 3000;
