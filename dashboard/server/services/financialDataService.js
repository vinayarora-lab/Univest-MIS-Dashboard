/**
 * Financial Data Service
 * Abstraction layer — switches between live Zoho data and mock data.
 *
 * API BUDGET PROTECTION:
 * - Zoho Books free plan: 2,000 calls/day per organization (3 orgs = 6,000/day total)
 * - Each full dashboard fetch uses ~90 calls total across all 3 companies
 * - Cache is persisted to DISK so server restarts do NOT trigger new API calls
 * - Cache TTL: 24 hours — historical FY data never changes
 * - Hard minimum: will not re-fetch within 1 hour even on manual refresh
 * - Result: max ~90 API calls/day regardless of server restarts or page reloads
 */
const fs = require('fs');
const path = require('path');
const { getMockDashboardData } = require('./mockData');
const { fetchLiveDashboardData } = require('./zohoAdapter');

const MOCK_MODE = process.env.MOCK_MODE === 'true';

// Disk cache location
const CACHE_DIR = path.join(__dirname, '../.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'dashboard_cache.json');

// TTL settings
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;      // 24 hours — max 1 full fetch/day
const MIN_REFETCH_MS = 60 * 60 * 1000;           // 1 hour minimum between any fetches

// In-memory layer (fast reads after first load)
let _memCache = {};

// In-flight deduplication — prevents simultaneous requests from each triggering a fetch
const _inflight = new Map();

// ── Disk persistence ──────────────────────────────────────────────────────────

function loadDiskCache() {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    if (fs.existsSync(CACHE_FILE)) {
      _memCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      const keys = Object.keys(_memCache);
      const now = Date.now();
      // Purge expired entries on load
      let purged = 0;
      for (const k of keys) {
        if (now > _memCache[k].expiresAt) { delete _memCache[k]; purged++; }
      }
      console.log(`[cache] Loaded ${keys.length - purged} cached entries from disk (${purged} expired purged).`);
    }
  } catch (e) {
    console.warn('[cache] Could not load disk cache:', e.message);
    _memCache = {};
  }
}

function saveDiskCache() {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(_memCache));
  } catch (e) {
    console.warn('[cache] Could not save disk cache:', e.message);
  }
}

// Load cache from disk on startup — prevents API calls on server restart
loadDiskCache();

// Pre-warm cache in background on startup — so first page load is instant
if (!MOCK_MODE) {
  const FROM = process.env.FROM_DATE || '2024-04-01';
  const TO   = process.env.TO_DATE   || '2025-03-31';
  const key  = `dashboard_${FROM}_${TO}`;
  const entry = _memCache[key];
  if (!entry || Date.now() >= entry.expiresAt) {
    console.log('[cache] Pre-warming cache in background...');
    getDashboardData(FROM, TO).catch(e => console.warn('[cache] Pre-warm failed:', e.message));
  }
}

// ── Main data function ────────────────────────────────────────────────────────

async function getDashboardData(fromDate, toDate) {
  const cacheKey = `dashboard_${fromDate}_${toDate}`;
  const now = Date.now();

  // Serve from memory/disk cache if still valid
  const entry = _memCache[cacheKey];
  if (entry && now < entry.expiresAt) {
    const ageMin = Math.round((now - entry.savedAt) / 60000);
    console.log(`[cache] Serving from cache (age: ${ageMin}min, expires in: ${Math.round((entry.expiresAt - now) / 3600000)}h)`);
    return entry.data;
  }

  // Enforce minimum re-fetch interval even on manual refresh
  if (entry && now - entry.savedAt < MIN_REFETCH_MS) {
    const waitMin = Math.round((MIN_REFETCH_MS - (now - entry.savedAt)) / 60000);
    console.log(`[cache] Min re-fetch interval not reached. Returning stale cache (${waitMin}min until eligible for refresh).`);
    return entry.data;
  }

  // Deduplicate simultaneous requests
  if (_inflight.has(cacheKey)) {
    console.log('[cache] Request already in-flight, waiting for result...');
    return _inflight.get(cacheKey);
  }

  const promise = (async () => {
    let data;
    if (MOCK_MODE) {
      data = getMockDashboardData(fromDate, toDate);
    } else {
      console.log('[cache] Cache miss — fetching from Zoho API...');
      data = await fetchLiveDashboardData(fromDate, toDate);
    }

    // Save to memory and disk
    _memCache[cacheKey] = {
      data,
      savedAt: Date.now(),
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    saveDiskCache();
    _inflight.delete(cacheKey);
    console.log('[cache] Data fetched and cached for 24 hours.');
    return data;
  })();

  _inflight.set(cacheKey, promise);
  return promise;
}

function invalidateCache() {
  _memCache = {};
  _inflight.clear();
  try {
    if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
  } catch (e) {}
  console.log('[cache] Cache invalidated (disk + memory).');
}

module.exports = { getDashboardData, invalidateCache, MOCK_MODE };
