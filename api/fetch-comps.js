// Vercel Serverless Function — fetch-comps
// Replaces Supabase edge function. Same logic: eBay scrape + Apify (CL/FB)

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)));
}

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// eBay sold listings via HTML scraping (free)
// Updated 2026-04: eBay switched from s-item to s-card classes
async function fetchEbaySold(query) {
  const encodedQuery = encodeURIComponent(query);
  // _sacat=6024 = eBay Motors, _udlo=1000 = min $1000 (vehicles only, no parts)
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodedQuery}&LH_Complete=1&LH_Sold=1&_sop=13&_ipg=60&rt=nc&_sacat=6024&_udlo=1000`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) return [];
    const html = await response.text();

    const comps = [];

    // New structure (2026): s-card based layout
    const cardRegex = /<div[^>]*class="[^"]*s-card\s[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/li>/gi;
    // Fallback: match li items containing s-card
    const liRegex = /<li[^>]*>([\s\S]*?s-card[\s\S]*?)<\/li>/gi;
    let items = html.match(cardRegex) || html.match(liRegex) || [];

    // Also try the old s-item format as fallback
    if (items.length === 0) {
      const oldRegex = /<li[^>]*class="[^"]*s-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
      items = html.match(oldRegex) || [];
    }

    for (const item of items) {
      try {
        if (item.includes('SPONSORED')) continue;

        // New: s-card__title > span
        const titleMatch = item.match(/s-card__title[^>]*>[^<]*<span[^>]*>([^<]+)<\/span>/i) ||
                           item.match(/<span[^>]*role="heading"[^>]*>([^<]+)<\/span>/i) ||
                           item.match(/class="s-item__title"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);
        if (!titleMatch) continue;
        const title = decodeHtml(titleMatch[1].trim());
        if (title.toLowerCase().includes('shop on ebay') || title === 'New Listing') continue;

        // New: s-card__price or old s-item__price
        const priceMatch = item.match(/s-card__price[^>]*>\$([0-9,]+\.?\d*)/i) ||
                           item.match(/class="s-item__price"[^>]*>[\s\S]*?\$([0-9,]+\.?\d*)/i);
        if (!priceMatch) continue;
        const price = parseFloat(priceMatch[1].replace(/,/g, ''));
        if (isNaN(price) || price <= 0) continue;

        // URL: new format uses href= without quotes sometimes
        const urlMatch = item.match(/href="?(https:\/\/(?:www\.)?ebay\.com\/itm\/\d+)[^"'\s]*/i);
        const imageMatch = item.match(/src="(https:\/\/i\.ebayimg\.com\/[^"]+)"/i);
        const dateMatch = item.match(/Sold\s+([A-Za-z]+\s+\d+)/i);

        comps.push({
          title, price,
          date: dateMatch ? dateMatch[1].trim() : 'Sold',
          url: urlMatch ? urlMatch[1] : '',
          imageUrl: imageMatch ? imageMatch[1] : undefined,
          source: 'ebay',
        });
      } catch (_e) { /* skip */ }
    }

    const seen = new Set();
    return comps.filter(c => {
      const key = c.url || c.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 25);
  } catch (e) {
    console.error('eBay scrape error:', e);
    return [];
  }
}

// Apify helper
async function runApifyActor(actorId, input, timeoutSecs = 120) {
  if (!APIFY_TOKEN) return [];

  try {
    const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=${timeoutSecs}&format=json&clean=true`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) return [];
    return await response.json();
  } catch (e) {
    console.error(`Apify ${actorId} error:`, e);
    return [];
  }
}

// Facebook Marketplace via Apify
async function fetchFacebookMarketplace(query, city = 'fullerton', radius = 300) {
  const searchUrl = `https://www.facebook.com/marketplace/${city}/search/?query=${encodeURIComponent(query)}&radius=${radius}`;

  const items = await runApifyActor('apify/facebook-marketplace-scraper', {
    startUrls: [{ url: searchUrl }],
    resultsLimit: 15,
    includeListingDetails: false,
  }, 90);

  const comps = [];
  for (const item of items) {
    try {
      const price = parseFloat(item.listingPrice?.amount || '0');
      if (!price || price <= 0) continue;
      const title = item.listingTitle || item.customTitle || '';
      if (!title) continue;

      comps.push({
        title, price,
        date: item.timestamp ? new Date(item.timestamp).toLocaleDateString() : 'Listed',
        url: item.itemUrl || '',
        imageUrl: item.primaryListingPhoto?.photo_image_url || item.listingPhotos?.[0]?.image?.uri,
        source: 'facebook',
        location: item.locationText?.text || '',
      });
    } catch (_e) { /* skip */ }
  }
  return comps;
}

// Craigslist via Apify
async function fetchCraigslistApify(query, locations) {
  const promises = locations.map(async (loc) => {
    const items = await runApifyActor('fatihtahta/craigslist-scraper', {
      queries: [query], locationCode: loc, category: 'sss', hasPic: true, limit: 10,
    }, 60);

    const comps = [];
    for (const item of items) {
      try {
        const price = parseFloat(item.Price || '0');
        if (!price || price <= 0) continue;
        comps.push({
          title: item.Title || 'Craigslist Listing', price,
          date: item['Posted At'] ? new Date(item['Posted At']).toLocaleDateString() : 'Listed',
          url: item['Listing URL'] || '',
          imageUrl: item['Image URLs']?.[0],
          source: 'craigslist',
          location: item.Location || item.Neighborhood || loc,
        });
      } catch (_e) { /* skip */ }
    }
    return comps;
  });

  const results = await Promise.allSettled(promises);
  return results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
}

// Craigslist HTML fallback
async function fetchCraigslistHtml(query, city) {
  const cityNames = { losangeles: 'Los Angeles', orangecounty: 'Orange County', inlandempire: 'Inland Empire', sandiego: 'San Diego', phoenix: 'Phoenix', lasvegas: 'Las Vegas' };
  const url = `https://${city}.craigslist.org/search/sss?query=${encodeURIComponent(query)}`;
  const comps = [];

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html' },
    });
    if (!response.ok) return [];
    const html = await response.text();

    const jsonMatch = html.match(/<script[^>]*id="ld_searchpage_results"[^>]*>([\s\S]*?)<\/script>/i);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[1]);
      if (data.itemListElement) {
        for (const item of data.itemListElement.slice(0, 10)) {
          const offer = item.item?.offers;
          if (offer?.price) {
            comps.push({
              title: item.item?.name || 'Craigslist Listing',
              price: parseFloat(offer.price), date: 'Listed',
              url: item.item?.url || `https://${city}.craigslist.org`,
              imageUrl: item.item?.image?.[0],
              source: 'craigslist', location: cityNames[city] || city,
            });
          }
        }
      }
    }
  } catch (e) { /* skip */ }
  return comps;
}

function getSearchLocation(zip) {
  if (!zip) return { city: 'fullerton', craigslistLocations: ['orangecounty', 'inlandempire', 'sandiego'], fbRadius: 150 };
  const num = parseInt(zip.substring(0, 3));
  if (num >= 900 && num <= 928) return { city: 'fullerton', craigslistLocations: ['orangecounty', 'inlandempire', 'sandiego'], fbRadius: 150 };
  if (num >= 930 && num <= 961) return { city: 'sacramento', craigslistLocations: ['sfbay', 'sacramento', 'stockton'], fbRadius: 150 };
  if (num >= 850 && num <= 865) return { city: 'phoenix', craigslistLocations: ['phoenix', 'tucson', 'inlandempire'], fbRadius: 150 };
  if (num >= 889 && num <= 898) return { city: 'lasvegas', craigslistLocations: ['lasvegas', 'phoenix', 'inlandempire'], fbRadius: 150 };
  if (num >= 750 && num <= 769) return { city: 'dallas', craigslistLocations: ['dallas', 'fortworth', 'austin'], fbRadius: 150 };
  if (num >= 770 && num <= 779) return { city: 'houston', craigslistLocations: ['houston', 'sanantonio', 'austin'], fbRadius: 150 };
  if (num >= 320 && num <= 349) return { city: 'orlando', craigslistLocations: ['orlando', 'tampa', 'jacksonville'], fbRadius: 150 };
  return { city: 'fullerton', craigslistLocations: ['orangecounty', 'inlandempire', 'sandiego'], fbRadius: 150 };
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { query, zip, radius, sources } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });

    const enabledSources = sources || ['ebay'];
    const searchLocation = getSearchLocation(zip);
    const searchRadius = radius || searchLocation.fbRadius;
    const hasApify = !!APIFY_TOKEN;

    const fetches = [];

    if (enabledSources.includes('ebay')) {
      fetches.push(withTimeout(fetchEbaySold(query), 30000, []).then(comps => ({ source: 'ebay', comps })));
    }
    if (enabledSources.includes('facebook') && hasApify) {
      fetches.push(withTimeout(fetchFacebookMarketplace(query, searchLocation.city, searchRadius), 50000, []).then(comps => ({ source: 'facebook', comps })));
    }
    if (enabledSources.includes('craigslist')) {
      if (hasApify) {
        fetches.push(withTimeout(fetchCraigslistApify(query, searchLocation.craigslistLocations), 50000, []).then(comps => ({ source: 'craigslist', comps })));
      } else {
        for (const loc of searchLocation.craigslistLocations) {
          fetches.push(withTimeout(fetchCraigslistHtml(query, loc), 15000, []).then(comps => ({ source: 'craigslist', comps })));
        }
      }
    }

    const results = await Promise.allSettled(fetches);
    let ebayComps = [], fbComps = [], clComps = [];

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const { source, comps } = result.value;
      if (source === 'ebay') ebayComps = comps;
      else if (source === 'facebook') fbComps.push(...comps);
      else if (source === 'craigslist') clComps.push(...comps);
    }

    // Filter out obvious parts listings (under $500)
    const allComps = [...ebayComps, ...fbComps, ...clComps]
      .filter(c => c.price >= 500)
      .sort((a, b) => a.price - b.price);

    return res.status(200).json({
      comps: allComps,
      sources: { ebay: ebayComps.length, facebook: fbComps.length, craigslist: clComps.length },
      lastUpdated: new Date().toISOString(),
      apifyEnabled: hasApify,
    });
  } catch (error) {
    console.error('fetch-comps error:', error);
    return res.status(500).json({ error: error.message || 'Unknown error' });
  }
}
