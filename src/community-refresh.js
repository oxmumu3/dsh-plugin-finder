import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { communityCatalog } from './community-catalog-data.js';
import {
  getActiveCommunityCatalog,
  normalizeLiveCommunityCatalog,
  setActiveCommunityCatalog,
} from './community-catalog.js';

export const COMMUNITY_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const COMMUNITY_FAILURE_COOLDOWN_MS = 30 * 60 * 1000;
export const COMMUNITY_FULL_URL = 'https://awesome-dsh-plugin.com/plugins.json';
const MAX_BYTES = 64 * 1024 * 1024;
const CACHE_FILE = 'catalog-v1.json';

async function ensureCacheRoot(cacheHome) {
  if (typeof cacheHome !== 'string' || !path.isAbsolute(cacheHome)) throw Error('cache home unavailable');
  const root = path.join(cacheHome, 'cache', 'plugin-finder', 'community');
  const relative = path.relative(path.resolve(cacheHome), path.resolve(root));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('cache outside home');
  const home = await fs.realpath(cacheHome);
  let current = home;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    try { await fs.mkdir(current, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const info = await fs.lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink() || await fs.realpath(current) !== current) {
      throw Error('cache ancestor is not owned directory');
    }
  }
  return current;
}

async function readBoundedJson(response, maxBytes) {
  if (!response?.ok) throw Error(`HTTP ${response?.status ?? 'unknown'}`);
  const contentLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw Error('Upstream catalog exceeds byte limit');
  if (!response.body) return JSON.parse(await response.text());
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > maxBytes) throw Error('Upstream catalog exceeds byte limit');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function validPersistedCatalog(saved, baseCatalog) {
  if (!saved || saved.schemaVersion !== 1 || typeof saved.catalog !== 'object' || !saved.catalog) return false;
  const cat = saved.catalog;
  if (cat.schemaVersion !== 1 || !Array.isArray(cat.entries) || !Array.isArray(cat.categories)) return false;
  const minRequired = Math.floor((baseCatalog?.total ?? 0) * 0.5);
  if (!cat.entries.length || cat.entries.length < minRequired) return false;
  if (!Number.isFinite(Date.parse(cat.fetchedAt))) return false;
  // Never admit legacy piggy00544 entries even from an old cache file.
  if (cat.entries.some(entry => typeof entry?.id === 'string' && entry.id.startsWith('https://github.com/piggy00544/'))) return false;
  return true;
}

function isNewerOrUpdated(candidate, baseCatalog) {
  const candidateTime = Date.parse(candidate.fetchedAt);
  const baseTime = Date.parse(baseCatalog.fetchedAt);
  if (!Number.isFinite(candidateTime)) return false;
  if (!Number.isFinite(baseTime)) return true;
  if (candidateTime > baseTime) return true;
  return candidateTime >= baseTime && candidate.total !== baseCatalog.total;
}

/**
 * Host-side 24-hour background refresh manager with symlink-safe atomic disk cache
 * and bundled offline snapshot fallback.
 */
export function createCommunityRefresher({
  cacheHome,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  signal: lifetimeSignal,
  baseCatalog = communityCatalog,
  allowRefreshInTests = false,
  sourceUrl = COMMUNITY_FULL_URL,
  refreshIntervalMs = COMMUNITY_REFRESH_INTERVAL_MS,
  failureCooldownMs = COMMUNITY_FAILURE_COOLDOWN_MS,
} = {}) {
  let closed = false;
  let initialized = null;
  let inflight = null;
  let inflightController = null;
  let lastCheckedAt = Number.isFinite(Date.parse(baseCatalog.fetchedAt)) ? Date.parse(baseCatalog.fetchedAt) : 0;
  let lastFailedAt = 0;

  const env = typeof process !== 'undefined' ? process?.env : undefined;
  const hasMockFetch = typeof fetchImpl === 'function' && fetchImpl !== globalThis.fetch;
  const networkAllowed = () => (allowRefreshInTests === true && hasMockFetch)
    || (globalThis.__dshCiNetwork?.nonLoopbackAllowed !== false
      && !env?.DSH_CI_OS_SANDBOX
      && !env?.NODE_TEST_CONTEXT);

  const autoRefreshEnabled = () => Boolean(!closed && cacheHome && typeof fetchImpl === 'function' && networkAllowed());

  async function writeCache(catalog, checkedAtIso) {
    if (!cacheHome || closed) return;
    const dir = await ensureCacheRoot(cacheHome);
    const target = path.join(dir, CACHE_FILE);
    const tmp = path.join(dir, `catalog-v1.${process.pid}.${randomUUID()}.tmp`);
    const payload = JSON.stringify({ schemaVersion: 1, checkedAt: checkedAtIso, catalog });
    const handle = await fs.open(tmp, 'wx', 0o600);
    try {
      await handle.writeFile(payload, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await fs.rename(tmp, target);
    } catch (error) {
      await fs.unlink(tmp).catch(() => {});
      throw error;
    }
  }

  async function init() {
    if (!initialized) {
      initialized = (async () => {
        if (!cacheHome) return;
        try {
          const dir = await ensureCacheRoot(cacheHome);
          const file = path.join(dir, CACHE_FILE);
          const info = await fs.lstat(file);
          if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) return;
          const saved = JSON.parse(await fs.readFile(file, 'utf8'));
          if (!validPersistedCatalog(saved, baseCatalog)) return;
          const checkedMs = Date.parse(saved.checkedAt || saved.catalog.fetchedAt);
          if (Number.isFinite(checkedMs)) lastCheckedAt = Math.max(lastCheckedAt, checkedMs);
          if (!closed && isNewerOrUpdated(saved.catalog, getActiveCommunityCatalog())) {
            setActiveCommunityCatalog(saved.catalog);
          }
        } catch {
          // Missing, unreadable, or symlink-compromised cache falls back cleanly to bundled catalog.
        }
      })();
    }
    return initialized;
  }

  function status() {
    const active = getActiveCommunityCatalog();
    return {
      fetchedAt: active.fetchedAt,
      sourceUpdatedAt: active.sourceUpdatedAt ?? null,
      total: active.total,
      bundledFetchedAt: baseCatalog.fetchedAt,
      refreshing: Boolean(inflight),
      source: active === baseCatalog ? 'bundled' : 'refreshed',
    };
  }

  async function refreshNow() {
    if (closed || typeof fetchImpl !== 'function') return status();
    if (inflight) return inflight;
    inflight = (async () => {
      const controller = new AbortController();
      inflightController = controller;
      const combined = AbortSignal.any([
        controller.signal,
        lifetimeSignal,
        AbortSignal.timeout(25000),
      ].filter(Boolean));
      try {
        const parsed = new URL(sourceUrl);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.hostname !== 'awesome-dsh-plugin.com') {
          throw Error('Untrusted catalog refresh host');
        }
        const response = await fetchImpl(parsed.href, {
          method: 'GET',
          redirect: 'error',
          signal: combined,
          headers: { 'User-Agent': 'dsh-plugin-finder/0.13.6 catalog-refresh', Accept: 'application/json' },
        });
        const raw = await readBoundedJson(response, MAX_BYTES);
        if (closed) return status();
        const nowIso = new Date(now()).toISOString();
        const normalized = normalizeLiveCommunityCatalog(raw, { fetchedAt: nowIso, baseCatalog });
        setActiveCommunityCatalog(normalized);
        lastCheckedAt = Date.parse(nowIso);
        lastFailedAt = 0;
        await writeCache(normalized, nowIso).catch(() => {});
      } catch {
        lastFailedAt = now();
      } finally {
        if (inflightController === controller) inflightController = null;
        inflight = null;
      }
      return status();
    })();
    return inflight;
  }

  async function maybeRefresh() {
    await init();
    const current = now();
    const due = current - lastCheckedAt >= refreshIntervalMs;
    const cooled = !lastFailedAt || current - lastFailedAt >= failureCooldownMs;
    if (autoRefreshEnabled() && !inflight && due && cooled) {
      void refreshNow().catch(() => {});
    }
    return status();
  }

  async function ingestLiveCatalog(rawFull, fetchedAt) {
    if (closed) return null;
    await init();
    const checkedIso = typeof fetchedAt === 'string' && Number.isFinite(Date.parse(fetchedAt))
      ? fetchedAt
      : new Date(now()).toISOString();
    const normalized = normalizeLiveCommunityCatalog(rawFull, { fetchedAt: checkedIso, baseCatalog });
    setActiveCommunityCatalog(normalized);
    lastCheckedAt = Math.max(lastCheckedAt, Date.parse(checkedIso));
    lastFailedAt = 0;
    await writeCache(normalized, checkedIso).catch(() => {});
    return normalized;
  }

  async function snapshot() {
    await init();
    void maybeRefresh().catch(() => {});
    return { status: status(), catalog: getActiveCommunityCatalog() };
  }

  return {
    init,
    status,
    maybeRefresh,
    refreshNow,
    ingestLiveCatalog,
    snapshot,
    close() {
      closed = true;
      inflightController?.abort('closed');
      inflightController = null;
    },
  };
}
