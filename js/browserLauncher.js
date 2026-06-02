/**
 * @fileoverview Browser launcher — builds terminal commands for Chrome/Edge/Brave/Firefox profiles.
 */

import { BROWSER_PRESETS, OPEN_MODE } from './constants.js';
import { getSettings } from './settings.js';
import { logger } from './utils.js';

/**
 * Get the effective URL for an account.
 * @param {Account} account
 * @param {Provider[]} providers
 * @returns {string}
 */
export function getAccountUrl(account, providers) {
  if (account.url) return account.url;
  const p = providers.find(p => p.id === account.ai?.toLowerCase() || p.name === account.ai);
  return p?.url ?? 'https://chatgpt.com';
}

/**
 * Build terminal command for a given OS.
 * @param {Account} account
 * @param {string}  url
 * @param {'linux'|'win'|'mac'} os
 * @returns {string}
 */
export function buildCommand(account, url, os) {
  const browser  = account.browser ?? 'chrome';
  const preset   = BROWSER_PRESETS[browser] ?? BROWSER_PRESETS.chrome;
  const settings = getSettings();

  let exe;
  if (os === 'win') {
    exe = account.chromePath || settings.chromePathWin || preset.win;
  } else if (os === 'mac') {
    exe = account.chromePath || preset.mac;
  } else {
    exe = account.chromePath || settings.chromePath || preset.linux;
  }

  const profile = account.profile ?? account.chromeProfile;
  if (!profile) return `${exe} "${url}"`;

  if (browser === 'firefox') {
    return `${exe} -P "${profile}" "${url}"`;
  }
  // Chrome/Edge/Brave use --profile-directory
  return `${exe} --profile-directory="${profile}" "${url}"`;
}

/**
 * Open a URL directly in current browser tab.
 * @param {string} url
 */
export function openDirect(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Attempt to launch via custom-protocol handler (ai-hub://open?cmd=...).
 * Requires a native companion app; silently falls back to showing the command.
 * @param {string} cmd
 */
export function launchProtocol(cmd) {
  try {
    const encoded = encodeURIComponent(cmd);
    window.location.href = `ai-hub://open?cmd=${encoded}`;
  } catch (e) {
    logger.warn('Protocol handler not available', e);
  }
}

/**
 * Copy text to clipboard.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-HTTPS
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}

/**
 * Determine what options to show in the "open chat" sheet.
 * @param {Account} account
 * @param {string}  url
 * @returns {OpenOption[]}
 */
export function getOpenOptions(account, url) {
  const opts = [
    {
      id    : OPEN_MODE.DIRECT,
      icon  : 'ti-external-link',
      bg    : '#E6F1FB',
      color : '#185FA5',
      title : 'Mở tab mới',
      sub   : 'Dùng trình duyệt hiện tại',
    },
  ];

  const profile = account.profile ?? account.chromeProfile;
  if (profile) {
    const browserLabel = {
      chrome : 'Chrome',
      edge   : 'Edge',
      brave  : 'Brave',
      firefox: 'Firefox',
    }[account.browser ?? 'chrome'] ?? 'Browser';

    opts.push({
      id    : OPEN_MODE.BROWSER,
      icon  : 'ti-terminal',
      bg    : '#EAF3DE',
      color : '#3B6D11',
      title : `${browserLabel} · ${profile}`,
      sub   : 'Hiển thị lệnh terminal để mở đúng profile',
    });
  }

  opts.push({
    id    : 'copy',
    icon  : 'ti-copy',
    bg    : '#F1EFE8',
    color : '#5F5E5A',
    title : 'Copy URL',
    sub   : url,
  });

  return opts;
}
