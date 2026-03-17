// Multi-source comps aggregator - uses Supabase Edge Function
// Sources: eBay Sold (free), Facebook Marketplace (Apify), Craigslist (Apify)

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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

type SourceKey = 'ebay' | 'facebook' | 'craigslist';

// ========== Main Aggregator via Supabase Edge Function ==========
export async function searchAllSources(
  query: string,
  zip?: string,
  radius?: number,
  enabledSources?: SourceKey[],
): Promise<MultiSourceResult> {
  console.log('Fetching comps via Supabase for:', query, 'zip:', zip, 'sources:', enabledSources);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/fetch-comps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        query,
        zip,
        radius,
        sources: enabledSources,
      }),
    });

    if (!response.ok) {
      throw new Error(`Fetch comps failed: ${response.status}`);
    }

    const data = await response.json();

    console.log(`Found: eBay=${data.sources?.ebay || 0}, Facebook=${data.sources?.facebook || 0}, Craigslist=${data.sources?.craigslist || 0}`);

    return {
      comps: data.comps || [],
      sources: data.sources || { ebay: 0, facebook: 0, craigslist: 0 },
      lastUpdated: new Date().toLocaleTimeString(),
      fromCache: false,
      apifyEnabled: data.apifyEnabled,
    };
  } catch (error) {
    console.error('Supabase fetch-comps error:', error);
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

export async function searchCompsWithCache(
  query: string,
  zip?: string,
  radius?: number,
  enabledSources?: SourceKey[],
  forceRefresh: boolean = false,
): Promise<MultiSourceResult> {
  const sourcesKey = (enabledSources || ['ebay']).sort().join(',');
  const cacheKey = `${query.toLowerCase().trim()}|${zip || 'default'}|${sourcesKey}`;

  // Check localStorage cache (unless force refresh)
  if (!forceRefresh) {
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
  }

  // Fetch fresh
  console.log('Fetching fresh comps for:', query);
  const result = await searchAllSources(query, zip, radius, enabledSources);

  // Only cache if we got results
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
