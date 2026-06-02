/**
 * @fileoverview Shared utility helpers — pure functions, no side effects.
 */

import { DEBOUNCE_MS } from './constants.js';

// ── ID generation ────────────────────────────────────────────────────────────

/**
 * Generate a collision-resistant unique ID.
 * @returns {string}
 */
export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Time helpers ─────────────────────────────────────────────────────────────

/**
 * Human-readable relative time (Vietnamese).
 * @param {number|null} ts - Unix timestamp ms
 * @returns {string}
 */
export function timeAgo(ts) {
  if (!ts) return 'Chưa dùng';
  const d   = Date.now() - ts;
  const min = 60_000, hr = 3_600_000, day = 86_400_000;
  if (d < min)        return 'Vừa xong';
  if (d < hr)         return `${Math.floor(d / min)} phút trước`;
  if (d < day)        return `${Math.floor(d / hr)} giờ trước`;
  if (d < day * 7)    return `${Math.floor(d / day)} ngày trước`;
  return new Date(ts).toLocaleDateString('vi-VN');
}

/**
 * Format countdown HH:MM:SS from ms remaining.
 * @param {number} ms
 * @returns {string}
 */
export function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

// ── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * Safe text setter — avoids innerHTML injection.
 * @param {string} id
 * @param {string} text
 */
export function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * Get element value by id.
 * @param {string} id
 * @returns {string}
 */
export function val(id) {
  return (document.getElementById(id)?.value ?? '').trim();
}

/**
 * Set element value by id.
 * @param {string} id
 * @param {string} v
 */
export function setVal(id, v) {
  const el = document.getElementById(id);
  if (el) el.value = v ?? '';
}

/**
 * Create element with optional classes and text.
 * @param {string} tag
 * @param {string[]} [classes]
 * @param {string}   [text]
 * @returns {HTMLElement}
 */
export function el(tag, classes = [], text = '') {
  const e = document.createElement(tag);
  if (classes.length) e.className = classes.join(' ');
  if (text) e.textContent = text;
  return e;
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Basic URL validation.
 * @param {string} str
 * @returns {boolean}
 */
export function isValidUrl(str) {
  if (!str) return true; // optional field
  try { new URL(str); return true; } catch { return false; }
}

/**
 * Sanitize plain string (strip HTML tags).
 * @param {string} str
 * @returns {string}
 */
export function sanitize(str) {
  return String(str ?? '').replace(/<[^>]*>/g, '').trim();
}

/**
 * Parse comma-separated tag string into array.
 * @param {string} str
 * @returns {string[]}
 */
export function parseTags(str) {
  return str.split(',').map(t => sanitize(t)).filter(Boolean);
}

// ── Functional helpers ───────────────────────────────────────────────────────

/**
 * Debounce a function.
 * @param {Function} fn
 * @param {number}   [ms]
 * @returns {Function}
 */
export function debounce(fn, ms = DEBOUNCE_MS) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Deep clone via structuredClone (with JSON fallback).
 * @template T
 * @param {T} obj
 * @returns {T}
 */
export function clone(obj) {
  try { return structuredClone(obj); }
  catch { return JSON.parse(JSON.stringify(obj)); }
}

// ── Crypto helpers ───────────────────────────────────────────────────────────

/**
 * Derive an AES-GCM CryptoKey from a passphrase using PBKDF2.
 * @param {string} passphrase
 * @param {Uint8Array} salt
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(passphrase, salt) {
  const enc  = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt a string with AES-256-GCM. Returns base64 payload.
 * @param {string} plaintext
 * @param {string} passphrase
 * @returns {Promise<string>} base64 encoded: salt(16) + iv(12) + ciphertext
 */
export async function encrypt(plaintext, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(passphrase, salt);
  const enc  = new TextEncoder();
  const ct   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  const buf  = new Uint8Array(salt.length + iv.length + ct.byteLength);
  buf.set(salt, 0);
  buf.set(iv, 16);
  buf.set(new Uint8Array(ct), 28);
  return btoa(String.fromCharCode(...buf));
}

/**
 * Decrypt a base64 AES-256-GCM payload.
 * @param {string} ciphertext - base64
 * @param {string} passphrase
 * @returns {Promise<string>}
 */
export async function decrypt(ciphertext, passphrase) {
  const buf  = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const salt = buf.slice(0, 16);
  const iv   = buf.slice(16, 28);
  const ct   = buf.slice(28);
  const key  = await deriveKey(passphrase, salt);
  const pt   = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ── Logger ───────────────────────────────────────────────────────────────────

const LOG_LEVEL = (typeof location !== 'undefined' && location.hostname === 'localhost') ? 'debug' : 'warn';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

export const logger = {
  debug : (...a) => LEVELS[LOG_LEVEL] <= 0 && console.debug('[AIHub]', ...a),
  info  : (...a) => LEVELS[LOG_LEVEL] <= 1 && console.info('[AIHub]',  ...a),
  warn  : (...a) => LEVELS[LOG_LEVEL] <= 2 && console.warn('[AIHub]',  ...a),
  error : (...a) =>                            console.error('[AIHub]', ...a),
};
