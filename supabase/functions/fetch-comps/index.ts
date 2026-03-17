import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const APIFY_TOKEN = Deno.env.get('APIFY_API_TOKEN');

interface Comp {
  title: string;
  price: number;
  date: string;
  url: string;
  imageUrl?: string;
  source: 'ebay' | 'facebook' | 'craigslist';
  location?: string;
}

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)));
}

// Race a promise against a timeout
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// ========== eBay sold listings via HTML scraping (free, fast) ==========
async function fetchEbaySold(query: string): Promise<Comp[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodedQuery}&LH_Complete=1&LH_Sold=1&_sop=13&_ipg=120&rt=nc`;

  try {
    console.log('Fetching eBay:', url);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) return [];
    const html = await response.text();

    const comps: Comp[] = [];
    const itemRegex = /<li[^>]*class="[^"]*s-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    const items = html.match(itemRegex) || [];

    for (const item of items) {
      try {
        if (item.includes('SPONSORED')) continue;

        const titleMatch = item.match(/<span[^>]*role="heading"[^>]*>([^<]+)<\/span>/i) ||
                           item.match(/class="s-item__title"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);
        if (!titleMatch) continue;
        const title = decodeHtml(titleMatch[1].trim());
        if (title.toLowerCase().includes('shop on ebay') || title === 'New Listing') continue;

        const priceMatch = item.match(/class="s-item__price"[^>]*>[\s\S]*?\$([0-9,]+\.?\d*)/i);
        if (!priceMatch) continue;
        const price = parseFloat(priceMatch[1].replace(/,/g, ''));
        if (isNaN(price) || price <= 0) continue;

        const urlMatch = item.match(/href="(https:\/\/www\.ebay\.com\/itm\/[^"]+)"/i);
        const imageMatch = item.match(/src="(https:\/\/i\.ebayimg\.com\/[^"]+)"/i);
        const dateMatch = item.match(/Sold\s+([A-Za-z]+\s+\d+)/i);

        comps.push({
          title,
          price,
          date: dateMatch ? dateMatch[1].trim() : 'Recently sold',
          url: urlMatch ? urlMatch[1].split('?')[0] : '',
          imageUrl: imageMatch ? imageMatch[1] : undefined,
          source: 'ebay',
        });
      } catch (_e) {
        // Skip failed items
      }
    }

    const seen = new Set<string>();
    return comps.filter(c => {
      if (!c.url || seen.has(c.url)) return false;
      seen.add(c.url);
      return true;
    }).slice(0, 25);
  } catch (e) {
    console.error('eBay scrape error:', e);
    return [];
  }
}

// ========== Apify helper: run actor synchronously and get dataset items ==========
async function runApifyActor(actorId: string, input: object, timeoutSecs: number = 120): Promise<any[]> {
  if (!APIFY_TOKEN) {
    console.warn('APIFY_API_TOKEN not set, skipping Apify actor:', actorId);
    return [];
  }

  try {
    const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=${timeoutSecs}&format=json&clean=true`;
    console.log(`Starting Apify actor: ${actorId}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      console.error(`Apify ${actorId} returned ${response.status}: ${await response.text()}`);
      return [];
    }

    const items = await response.json();
    console.log(`Apify ${actorId} returned ${items.length} items`);
    return items;
  } catch (e) {
    console.error(`Apify ${actorId} error:`, e);
    return [];
  }
}

// ========== Facebook Marketplace via Apify ==========
async function fetchFacebookMarketplace(query: string, city: string = 'fullerton', radius: number = 300): Promise<Comp[]> {
  const searchUrl = `https://www.facebook.com/marketplace/${city}/search/?query=${encodeURIComponent(query)}&radius=${radius}`;

  const items = await runApifyActor('apify/facebook-marketplace-scraper', {
    startUrls: [{ url: searchUrl }],
    resultsLimit: 15,
    includeListingDetails: false,
  }, 90);

  const comps: Comp[] = [];
  for (const item of items) {
    try {
      const price = parseFloat(item.listingPrice?.amount || item.listingPrice?.amount_with_offset_in_currency?.slice(0, -2) || '0');
      if (!price || price <= 0) continue;

      const title = item.listingTitle || item.customTitle || '';
      if (!title) continue;

      comps.push({
        title,
        price,
        date: item.timestamp ? new Date(item.timestamp).toLocaleDateString() : 'Listed',
        url: item.itemUrl || '',
        imageUrl: item.primaryListingPhoto?.photo_image_url || item.listingPhotos?.[0]?.image?.uri,
        source: 'facebook',
        location: item.locationText?.text || '',
      });
    } catch (_e) {
      // Skip failed items
    }
  }

  return comps;
}

// ========== Craigslist via Apify ==========
async function fetchCraigslistApify(query: string, locations: string[]): Promise<Comp[]> {
  const allComps: Comp[] = [];

  // Run one Apify actor per location in parallel
  const promises = locations.map(async (loc) => {
    const items = await runApifyActor('fatihtahta/craigslist-scraper', {
      queries: [query],
      locationCode: loc,
      category: 'sss',
      hasPic: true,
      limit: 10,
    }, 60);

    const comps: Comp[] = [];
    for (const item of items) {
      try {
        const price = parseFloat(item.Price || '0');
        if (!price || price <= 0) continue;

        comps.push({
          title: item.Title || 'Craigslist Listing',
          price,
          date: item['Posted At'] ? new Date(item['Posted At']).toLocaleDateString() : 'Listed',
          url: item['Listing URL'] || '',
          imageUrl: item['Image URLs']?.[0],
          source: 'craigslist',
          location: item.Location || item.Neighborhood || loc,
        });
      } catch (_e) {
        // Skip failed items
      }
    }
    return comps;
  });

  const results = await Promise.allSettled(promises);
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allComps.push(...result.value);
    }
  }

  return allComps;
}

// ========== Craigslist HTML fallback (when no Apify token) ==========
async function fetchCraigslistHtml(query: string, city: string): Promise<Comp[]> {
  const cityNames: Record<string, string> = {
    'losangeles': 'Los Angeles',
    'orangecounty': 'Orange County',
    'inlandempire': 'Inland Empire',
    'sandiego': 'San Diego',
    'phoenix': 'Phoenix',
    'lasvegas': 'Las Vegas',
  };

  const encodedQuery = encodeURIComponent(query);
  const url = `https://${city}.craigslist.org/search/sss?query=${encodedQuery}`;
  const comps: Comp[] = [];

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
    });

    if (!response.ok) return [];
    const html = await response.text();

    const jsonMatch = html.match(/<script[^>]*id="ld_searchpage_results"[^>]*>([\s\S]*?)<\/script>/i);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        if (data.itemListElement) {
          for (const item of data.itemListElement.slice(0, 10)) {
            const offer = item.item?.offers;
            if (offer?.price) {
              comps.push({
                title: item.item?.name || 'Craigslist Listing',
                price: parseFloat(offer.price),
                date: 'Listed',
                url: item.item?.url || `https://${city}.craigslist.org`,
                imageUrl: item.item?.image?.[0],
                source: 'craigslist',
                location: cityNames[city] || city,
              });
            }
          }
        }
      } catch (_e) {
        // JSON parse failed
      }
    }
  } catch (e) {
    console.error(`Craigslist ${city} error:`, e);
  }

  return comps;
}

// ========== Location mapping: zip to city/region ==========
// Optimized: 3 CL cities per region (saves ~40% vs 5), FB radius 150mi
function getSearchLocation(zip?: string): { city: string; craigslistLocations: string[]; fbRadius: number } {
  if (!zip) {
    // Default: SoCal focused on SD, IE, OC
    return { city: 'fullerton', craigslistLocations: ['orangecounty', 'inlandempire', 'sandiego'], fbRadius: 150 };
  }

  const prefix = zip.substring(0, 3);
  const num = parseInt(prefix);

  // SoCal: 900-928 — San Diego, Inland Empire, Orange County
  if (num >= 900 && num <= 928) {
    return { city: 'fullerton', craigslistLocations: ['orangecounty', 'inlandempire', 'sandiego'], fbRadius: 150 };
  }
  // NorCal / Central CA: 930-961
  if (num >= 930 && num <= 961) {
    return { city: 'sacramento', craigslistLocations: ['sfbay', 'sacramento', 'stockton'], fbRadius: 150 };
  }
  // Arizona: 850-865
  if (num >= 850 && num <= 865) {
    return { city: 'phoenix', craigslistLocations: ['phoenix', 'tucson', 'inlandempire'], fbRadius: 150 };
  }
  // Nevada: 889-898
  if (num >= 889 && num <= 898) {
    return { city: 'lasvegas', craigslistLocations: ['lasvegas', 'phoenix', 'inlandempire'], fbRadius: 150 };
  }
  // Texas DFW: 750-769
  if (num >= 750 && num <= 769) {
    return { city: 'dallas', craigslistLocations: ['dallas', 'fortworth', 'austin'], fbRadius: 150 };
  }
  // Texas Houston: 770-779
  if (num >= 770 && num <= 779) {
    return { city: 'houston', craigslistLocations: ['houston', 'sanantonio', 'austin'], fbRadius: 150 };
  }
  // Florida: 320-349
  if (num >= 320 && num <= 349) {
    return { city: 'orlando', craigslistLocations: ['orlando', 'tampa', 'jacksonville'], fbRadius: 150 };
  }

  // Default fallback: SoCal
  return { city: 'fullerton', craigslistLocations: ['orangecounty', 'inlandempire', 'sandiego'], fbRadius: 150 };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { query, zip, radius, sources } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Query required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine which sources to search (default: ebay only)
    const enabledSources: string[] = sources || ['ebay'];
    console.log('Fetching comps for:', query, 'zip:', zip, 'radius:', radius, 'sources:', enabledSources);

    const searchLocation = getSearchLocation(zip);
    const searchRadius = radius || searchLocation.fbRadius;
    const hasApify = !!APIFY_TOKEN;

    // Build parallel fetch array based on enabled sources
    const fetches: Promise<{ source: string; comps: Comp[] }>[] = [];

    // eBay (free HTML scraping)
    if (enabledSources.includes('ebay')) {
      fetches.push(
        withTimeout(fetchEbaySold(query), 30000, [])
          .then(comps => ({ source: 'ebay', comps }))
      );
    }

    // Facebook Marketplace (Apify - paid)
    if (enabledSources.includes('facebook')) {
      if (hasApify) {
        fetches.push(
          withTimeout(fetchFacebookMarketplace(query, searchLocation.city, searchRadius), 50000, [])
            .then(comps => ({ source: 'facebook', comps }))
        );
      } else {
        console.warn('Facebook requested but no APIFY_API_TOKEN set');
      }
    }

    // Craigslist (Apify preferred, HTML fallback)
    if (enabledSources.includes('craigslist')) {
      if (hasApify) {
        fetches.push(
          withTimeout(fetchCraigslistApify(query, searchLocation.craigslistLocations), 50000, [])
            .then(comps => ({ source: 'craigslist', comps }))
        );
      } else {
        // HTML fallback
        for (const loc of searchLocation.craigslistLocations) {
          fetches.push(
            withTimeout(fetchCraigslistHtml(query, loc), 15000, [])
              .then(comps => ({ source: 'craigslist', comps }))
          );
        }
      }
    }

    const results = await Promise.allSettled(fetches);

    let ebayComps: Comp[] = [];
    let fbComps: Comp[] = [];
    let clComps: Comp[] = [];

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const { source, comps } = result.value;
      if (source === 'ebay') ebayComps = comps;
      else if (source === 'facebook') fbComps.push(...comps);
      else if (source === 'craigslist') clComps.push(...comps);
    }

    const allComps = [...ebayComps, ...fbComps, ...clComps]
      .sort((a, b) => a.price - b.price);

    console.log(`Found: eBay=${ebayComps.length}, Facebook=${fbComps.length}, Craigslist=${clComps.length}`);

    return new Response(
      JSON.stringify({
        comps: allComps,
        sources: {
          ebay: ebayComps.length,
          facebook: fbComps.length,
          craigslist: clComps.length,
        },
        lastUpdated: new Date().toISOString(),
        apifyEnabled: hasApify,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
