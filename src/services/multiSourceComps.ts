// Multi-source comps aggregator - uses Vercel serverless functions
// Sources: eBay Sold (free), Facebook Marketplace (Apify), Craigslist (Apify)
import { logApifySearch } from '../utils/apifyUsage';
import { getSettings } from '../utils/settings';
import { supabase } from '../lib/supabase';
import { getCurrentRoom } from './syncClient';

export interface Comp {
  title: string;
  price: number;
  date: string;
  condition?: string;
  url: string;
  imageUrl?: string;
  source: 'ebay' | 'facebook' | 'craigslist';
  location?: string;
  mileage?: number;
}

export interface MultiSourceResult {
  comps: Comp[];
  sources: {
    ebay: number;
    facebook: number;
    craigslist: number;
  };
  lastUpdated: string;
  fromCache: boolean;
  apifyEnabled?: boolean;
}

type SourceKey = 'ebay' | 'facebook' | 'craigslist';

// ========== Main Aggregator via Vercel Serverless Function ==========
export async function searchAllSources(
  query: string,
  zip?: string,
  radius?: number,
  enabledSources?: SourceKey[],
  itemCategory?: string,
): Promise<MultiSourceResult> {
  const settings = getSettings();
  const effectiveRadius = radius || settings.searchRadius;
  console.log('Fetching comps for:', query, 'zip:', zip, 'radius:', effectiveRadius, 'sources:', enabledSources, 'category:', itemCategory);

  try {
    const response = await fetch('/api/fetch-comps', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        zip,
        radius: effectiveRadius,
        sources: enabledSources,
        regions: settings.searchRegions,
        maxResults: settings.resultsPerSource,
        category: itemCategory,
      }),
    });

    if (!response.ok) {
      throw new Error(`Fetch comps failed: ${response.status}`);
    }

    const data = await response.json();

    console.log(`Found: eBay=${data.sources?.ebay || 0}, Facebook=${data.sources?.facebook || 0}, Craigslist=${data.sources?.craigslist || 0}`);

    // Log Apify usage for cost tracking
    logApifySearch(query, enabledSources || [], (data.comps || []).length);

    return {
      comps: data.comps || [],
      sources: data.sources || { ebay: 0, facebook: 0, craigslist: 0 },
      lastUpdated: new Date().toLocaleTimeString(),
      fromCache: false,
      apifyEnabled: data.apifyEnabled,
    };
  } catch (error) {
    console.error('fetch-comps error:', error);
    return {
      comps: [],
      sources: { ebay: 0, facebook: 0, craigslist: 0 },
      lastUpdated: new Date().toLocaleTimeString(),
      fromCache: false,
    };
  }
}

// Search with caching - v4 includes zip + sources in cache key
const CACHE_KEY = 'comps-v4';
const CACHE_DURATION = 60 * 60 * 1000; // 60 minutes — covers a full auction session

interface CacheEntry {
  query: string;
  result: MultiSourceResult;
  timestamp: number;
}

// --- Shared comps via Supabase (room-aware) ---

function hashQuery(q: string): string {
  // Simple hash for cache key — deterministic, fast
  let hash = 0;
  for (let i = 0; i < q.length; i++) {
    hash = ((hash << 5) - hash + q.charCodeAt(i)) | 0;
  }
  return 'q' + Math.abs(hash).toString(36);
}

async function getSharedComps(queryKey: string): Promise<MultiSourceResult | null> {
  const room = getCurrentRoom();
  if (!supabase || !room) return null;

  try {
    const { data } = await supabase
      .from('shared_comps')
      .select('results_json, created_at')
      .eq('room_code', room)
      .eq('query_hash', hashQuery(queryKey))
      .single();

    if (!data) return null;

    // Check freshness — same 60 min window
    const age = Date.now() - new Date(data.created_at).getTime();
    if (age > CACHE_DURATION) return null;

    const result = data.results_json as MultiSourceResult;
    if (result && result.comps && result.comps.length > 0) {
      console.log('Using shared comps from room for:', queryKey, '- count:', result.comps.length);
      return { ...result, fromCache: true };
    }
  } catch {
    // Not found or error — fall through
  }
  return null;
}

async function pushSharedComps(queryKey: string, result: MultiSourceResult): Promise<void> {
  const room = getCurrentRoom();
  if (!supabase || !room || result.comps.length === 0) return;

  try {
    await supabase.from('shared_comps').upsert(
      {
        room_code: room,
        query_hash: hashQuery(queryKey),
        query_text: queryKey,
        results_json: result,
      },
      { onConflict: 'room_code,query_hash' }
    );
    console.log('Pushed', result.comps.length, 'shared comps for:', queryKey);
  } catch (e) {
    console.error('Push shared comps failed:', e);
  }
}

export async function searchCompsWithCache(
  query: string,
  zip?: string,
  radius?: number,
  enabledSources?: SourceKey[],
  forceRefresh: boolean = false,
  itemCategory?: string,
): Promise<MultiSourceResult> {
  const sourcesKey = (enabledSources || ['ebay']).sort().join(',');
  const cacheKey = `${query.toLowerCase().trim()}|${zip || 'default'}|${sourcesKey}`;

  if (!forceRefresh) {
    // 1. Check local localStorage cache
    try {
      const cached = localStorage.getItem(`${CACHE_KEY}-${cacheKey}`);
      if (cached) {
        const entry: CacheEntry = JSON.parse(cached);
        if (entry.result.comps.length > 0 && Date.now() - entry.timestamp < CACHE_DURATION) {
          console.log('Using cached comps for:', query, '- count:', entry.result.comps.length);
          return { ...entry.result, fromCache: true };
        }
      }
    } catch (_e) {
      // Cache miss or parse error
    }

    // 2. Check shared comps from room (saves Apify $$ if a buddy already searched)
    const shared = await getSharedComps(cacheKey);
    if (shared) return shared;
  }

  // 3. Fetch fresh from Apify/eBay
  console.log('Fetching fresh comps for:', query);
  const result = await searchAllSources(query, zip, radius, enabledSources, itemCategory);

  // Cache locally + share with room
  if (result.comps.length > 0) {
    try {
      const entry: CacheEntry = {
        query: cacheKey,
        result,
        timestamp: Date.now(),
      };
      localStorage.setItem(`${CACHE_KEY}-${cacheKey}`, JSON.stringify(entry));
      console.log('Cached', result.comps.length, 'comps for:', query);
    } catch (e) {
      console.warn('Failed to cache comps:', e);
    }

    // Push to Supabase for room buddies
    pushSharedComps(cacheKey, result);
  } else {
    console.log('Not caching empty result for:', query);
  }

  return result;
}

// Clear all comps cache
export function clearCompsCache(): void {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('comps-'));
  keys.forEach(k => localStorage.removeItem(k));
  console.log('Cleared', keys.length, 'cached comp entries');
}
