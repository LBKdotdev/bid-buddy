/**
 * Apify usage tracker — localStorage-based.
 * Tracks search count and estimated cost per month.
 *
 * Cost estimates (approximate):
 *   - Craigslist Apify scraper: ~$0.01 per location (~$0.03 per search with 3 locations)
 *   - Facebook Marketplace scraper: ~$0.035 per run
 *   - eBay: $0 (free HTML scrape)
 */

const USAGE_KEY = 'apify-usage';

// Estimated cost per Apify-powered source call
const COST_PER_CRAIGSLIST = 0.03; // ~3 locations per search
const COST_PER_FACEBOOK = 0.035;

export interface ApifySearchLog {
  date: string;      // ISO date
  query: string;
  sources: string[]; // which Apify sources were hit
  compsFound: number;
  estCost: number;
}

export interface ApifyUsageData {
  searches: ApifySearchLog[];
  monthlyBudget: number; // user-configurable cap (display only)
}

function getMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function loadUsage(): ApifyUsageData {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { searches: [], monthlyBudget: 5.00 };
}

function saveUsage(data: ApifyUsageData) {
  // Keep only last 500 entries to avoid bloat
  if (data.searches.length > 500) {
    data.searches = data.searches.slice(-500);
  }
  localStorage.setItem(USAGE_KEY, JSON.stringify(data));
}

/** Log an Apify-powered search */
export function logApifySearch(query: string, sources: string[], compsFound: number) {
  const apifySources = sources.filter(s => s === 'craigslist' || s === 'facebook');
  if (apifySources.length === 0) return; // no Apify cost

  let estCost = 0;
  if (apifySources.includes('craigslist')) estCost += COST_PER_CRAIGSLIST;
  if (apifySources.includes('facebook')) estCost += COST_PER_FACEBOOK;

  const data = loadUsage();
  data.searches.push({
    date: new Date().toISOString(),
    query,
    sources: apifySources,
    compsFound,
    estCost,
  });
  saveUsage(data);
}

/** Get stats for the current month */
export function getMonthlyStats(): { count: number; estCost: number; budget: number; month: string } {
  const data = loadUsage();
  const monthKey = getMonthKey();
  const monthSearches = data.searches.filter(s => s.date.startsWith(monthKey));

  return {
    count: monthSearches.length,
    estCost: monthSearches.reduce((sum, s) => sum + s.estCost, 0),
    budget: data.monthlyBudget,
    month: monthKey,
  };
}

/** Get all-time stats */
export function getTotalStats(): { count: number; estCost: number } {
  const data = loadUsage();
  return {
    count: data.searches.length,
    estCost: data.searches.reduce((sum, s) => sum + s.estCost, 0),
  };
}

/** Update monthly budget */
export function setMonthlyBudget(budget: number) {
  const data = loadUsage();
  data.monthlyBudget = budget;
  saveUsage(data);
}

/** Clear all usage data */
export function clearUsageData() {
  localStorage.removeItem(USAGE_KEY);
}
