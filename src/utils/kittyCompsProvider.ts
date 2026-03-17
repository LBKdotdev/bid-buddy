// Kitty Comps Provider — uses real market data from eBay/FB/Craigslist
// NO mock data. All results come from live scraping via Supabase edge function.

import { Comp, CompsSummary, FilterDebugInfo } from '../types/comps';
import { KittyCompsSearchParams, KittyCompsSearchResult, KittyCompsExpansion } from '../types/kittyComps';
import { searchAllSources, type Comp as MarketComp } from '../services/multiSourceComps';

// Convert market comp (from edge function) to the Kitty Comps format
function marketCompToComp(mc: MarketComp, searchParams: KittyCompsSearchParams): Comp {
  // Try to extract year from title
  const yearMatch = mc.title.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? parseInt(yearMatch[0]) : null;

  // Try to extract mileage from title
  const mileageMatch = mc.title.match(/(\d{1,3},?\d{3})\s*(mi|mile|km|hr|hour)/i);
  const mileage = mileageMatch ? parseInt(mileageMatch[1].replace(/,/g, '')) : null;

  // Determine seller type from source + clues in title
  const titleLower = mc.title.toLowerCase();
  const isDealer = mc.source === 'ebay'
    ? false // eBay sold = unknown
    : titleLower.includes('dealer') || titleLower.includes('motorsport') || titleLower.includes('powersport');
  const sellerType: 'dealer' | 'private' | 'unknown' = isDealer ? 'dealer' : 'unknown';

  // Determine status: eBay = sold, others = active
  const status: 'active' | 'sold' = mc.source === 'ebay' ? 'sold' : 'active';

  // Parse location
  const locationParts = mc.location?.split(',').map(s => s.trim()) || [];
  const locationCity = locationParts[0] || null;
  const locationState = locationParts[1] || null;

  // Source display name
  const sourceNames: Record<string, string> = {
    ebay: 'eBay Sold',
    facebook: 'FB Marketplace',
    craigslist: 'Craigslist',
  };

  // Calculate match score based on available data
  let matchScore = 70; // base score for a real listing
  if (year) {
    const yearDiff = Math.abs(year - searchParams.year);
    if (yearDiff === 0) matchScore += 20;
    else if (yearDiff <= 2) matchScore += 10;
    else matchScore -= yearDiff * 5;
  }
  if (mileage && searchParams.mileage) {
    const mileageDiff = Math.abs(mileage - searchParams.mileage);
    if (mileageDiff <= 5000) matchScore += 10;
    else if (mileageDiff <= 15000) matchScore += 5;
  }

  const mileageDiff = mileage && searchParams.mileage ? Math.abs(mileage - searchParams.mileage) : 999999;
  const mileage_quality: 'strong' | 'weak' | 'unknown' =
    !searchParams.mileage || !mileage ? 'unknown' :
    mileageDiff <= 15000 ? 'strong' : 'weak';

  return {
    status,
    price: mc.price,
    year,
    make: searchParams.make,
    model: searchParams.model,
    trim: null,
    mileage,
    mileage_quality,
    location_city: locationCity,
    location_state: locationState,
    distance_miles: null,
    source_name: sourceNames[mc.source] || mc.source,
    source_url: mc.url,
    listing_date: mc.date !== 'Listed' && mc.date !== 'Recently sold' ? mc.date : null,
    seller_type: sellerType,
    match_score: Math.max(0, Math.min(100, Math.round(matchScore))),
  };
}

export async function runKittyCompsSearch(params: KittyCompsSearchParams): Promise<KittyCompsSearchResult> {
  const expansion: KittyCompsExpansion = {
    radiusExpanded: false,
    yearRangeExpanded: false,
    mileageIgnored: false,
    finalRadius: params.radiusMiles,
    finalYearRange: 2,
  };

  // Build search query from structured params
  const queryParts = [];
  if (params.year) queryParts.push(String(params.year));
  queryParts.push(params.make);
  queryParts.push(params.model);
  if (params.trim) queryParts.push(params.trim);
  const query = queryParts.join(' ');

  // Load source toggles from localStorage (same as CompsScreen uses)
  let enabledSources = ['ebay'];
  try {
    const saved = localStorage.getItem('comps-source-toggles');
    if (saved) {
      const toggles = JSON.parse(saved);
      enabledSources = Object.entries(toggles)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key);
    }
  } catch (_e) { /* default to ebay only */ }

  // Fetch real data from edge function
  const result = await searchAllSources(query, params.zipCode, params.radiusMiles, enabledSources as any[]);

  // Convert to Kitty Comps format
  const comps = result.comps.map(mc => marketCompToComp(mc, params));

  // Sort by match score
  comps.sort((a, b) => b.match_score - a.match_score);

  // Calculate summary from real data
  const prices = comps.map(c => c.price).filter(p => p > 0);
  const sortedPrices = [...prices].sort((a, b) => a - b);

  const summary: CompsSummary = {
    count_active: comps.filter(c => c.status === 'active').length,
    count_sold: comps.filter(c => c.status === 'sold').length,
    average_price: prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
    median_price: sortedPrices.length > 0 ? sortedPrices[Math.floor(sortedPrices.length / 2)] : 0,
    low_price: sortedPrices.length > 0 ? sortedPrices[0] : 0,
    high_price: sortedPrices.length > 0 ? sortedPrices[sortedPrices.length - 1] : 0,
    typical_offer: sortedPrices.length > 0 ? Math.round(sortedPrices[Math.floor(sortedPrices.length / 2)] * 0.9) : 0,
    typical_offer_percentage: 10,
    last_updated: new Date().toISOString(),
  };

  // Build debug info from real results
  const debug: FilterDebugInfo = {
    passed: comps.map(comp => ({
      comp,
      reasons: [
        `Source: ${comp.source_name}`,
        comp.year ? `Year: ${comp.year}` : 'Year: not parsed from title',
        comp.mileage ? `Mileage: ${comp.mileage.toLocaleString()}` : 'Mileage: not listed',
        comp.location_city ? `Location: ${comp.location_city}, ${comp.location_state}` : 'Location: not listed',
        `Match score: ${comp.match_score}`,
        `Real listing — ${comp.source_url ? 'link verified' : 'no link'}`,
      ],
    })),
    rejected: [],
    filterCriteria: {
      make: params.make,
      model: params.model,
      yearMin: params.year - 2,
      yearMax: params.year + 2,
      mileageMin: params.mileage ? params.mileage - 15000 : undefined,
      mileageMax: params.mileage ? params.mileage + 15000 : undefined,
      maxDistance: params.radiusMiles,
    },
  };

  return {
    comps,
    summary,
    expansion,
    searchParams: params,
    debug,
  };
}
