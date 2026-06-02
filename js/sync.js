/**
 * @fileoverview GitHub Gist sync — push / pull / conflict detection.
 *
 * Architecture note: the `SyncProvider` interface here mirrors what a
 * Supabase/Firebase adapter would implement, making future migration easy.
 */

import { storage } from './storage.js';
import { loadToken, getSettings, saveSettings } from './settings.js';
import { logger } from './utils.js';

const GIST_FILENAME = 'ai-hub-data.json';
const API_BASE      = 'https://api.github.com';

// ── Low-level Gist API ────────────────────────────────────────────────────────

/**
 * @param {string} path
 * @param {object} [options]
 * @returns {Promise<Response>}
 */
async function gistFetch(path, options = {}) {
  const token = await loadToken();
  if (!token) throw new Error('GitHub token chưa được cấu hình.');
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization : `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept        : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers ?? {}),
    },
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verify token + gist ID combination.
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function testConnection() {
  const { gistId } = getSettings();
  if (!gistId) return { ok: false, message: 'Chưa nhập Gist ID.' };
  try {
    const res = await gistFetch(`/gists/${gistId}`);
    if (res.ok) {
      const g = await res.json();
      return { ok: true, message: `Kết nối OK — Gist: "${g.description || gistId.slice(0, 8)}…"` };
    }
    if (res.status === 401) return { ok: false, message: 'Token không hợp lệ hoặc không có quyền gist.' };
    if (res.status === 404) return { ok: false, message: 'Gist ID không tồn tại.' };
    return { ok: false, message: `Lỗi HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: `Lỗi mạng: ${e.message}` };
  }
}

/**
 * Push local data to Gist.
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function pushToGist() {
  const { gistId } = getSettings();
  if (!gistId) return { ok: false, message: 'Chưa cấu hình Gist ID.' };
  try {
    const payload = await storage.exportAll();
    payload.syncedAt = Date.now();

    const res = await gistFetch(`/gists/${gistId}`, {
      method: 'PATCH',
      body  : JSON.stringify({
        description: 'AI Account Hub backup',
        files: { [GIST_FILENAME]: { content: JSON.stringify(payload, null, 2) } },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    saveSettings({ lastSyncAt: Date.now() });
    logger.info('Pushed to Gist');
    return { ok: true, message: 'Đã đẩy dữ liệu lên Gist thành công.' };
  } catch (e) {
    logger.error('Push failed', e);
    return { ok: false, message: `Push thất bại: ${e.message}` };
  }
}

/**
 * Pull remote Gist data and detect conflicts.
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<{ ok: boolean, message: string, conflict?: boolean, remote?: object }>}
 */
export async function pullFromGist(opts = {}) {
  const { gistId } = getSettings();
  if (!gistId) return { ok: false, message: 'Chưa cấu hình Gist ID.' };
  try {
    const res = await gistFetch(`/gists/${gistId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const gist    = await res.json();
    const file    = gist.files?.[GIST_FILENAME];
    if (!file?.content) return { ok: false, message: `File "${GIST_FILENAME}" không tồn tại trong Gist.` };

    const remote  = JSON.parse(file.content);
    const localTs = getSettings().lastSyncAt ?? 0;
    const remoteTs = remote.syncedAt ?? 0;

    // Conflict: both sides changed since last sync
    if (!opts.force && localTs > 0 && remoteTs > localTs) {
      return { ok: false, conflict: true, remote, message: 'Phát hiện xung đột: dữ liệu từ xa mới hơn local.' };
    }

    await storage.importAll(remote);
    saveSettings({ lastSyncAt: Date.now() });
    logger.info('Pulled from Gist');
    return { ok: true, message: `Đã kéo ${remote.accounts?.length ?? 0} tài khoản từ Gist.` };
  } catch (e) {
    logger.error('Pull failed', e);
    return { ok: false, message: `Pull thất bại: ${e.message}` };
  }
}

/**
 * Bidirectional sync: pull then push (last-write-wins merge).
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function syncGist() {
  const pull = await pullFromGist({ force: true });
  if (!pull.ok && !pull.conflict) return pull;
  return pushToGist();
}
