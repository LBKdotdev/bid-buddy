import { Comp, CompsSummary } from '../types/comps';

// Parse uploaded CSV comps into structured data
export function parseCompsCSV(csvText: string): Comp[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const comps: Comp[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row: any = {};

    headers.forEach((header, idx) => {
      row[header] = values[idx] || null;
    });

    if (!row.source_name || !row.source_url || !row.price) {
      continue;
    }

    comps.push({
      status: row.status === 'sold' ? 'sold' : 'active',
      price: parseFloat(row.price) || 0,
      year: row.year ? parseInt(row.year) : null,
      make: row.make || '',
      model: row.model || '',
      trim: row.trim || null,
      mileage: row.mileage ? parseInt(row.mileage) : null,
      mileage_quality: row.mileage_quality || 'unknown',
      location_city: row.location_city || null,
      location_state: row.location_state || null,
      distance_miles: row.distance_miles ? parseFloat(row.distance_miles) : null,
      source_name: row.source_name,
      source_url: row.source_url,
      listing_date: row.listing_date || null,
      match_score: row.match_score ? parseFloat(row.match_score) : 50,
    });
  }

  return comps;
}

// Calculate summary stats from comp data
export function calculateCompsSummary(comps: Comp[]): CompsSummary {
  if (comps.length === 0) {
    return {
      count_active: 0,
      count_sold: 0,
      average_price: 0,
      median_price: 0,
      low_price: 0,
      high_price: 0,
      last_updated: new Date().toISOString(),
    };
  }

  const prices = comps.map(c => c.price);
  const sortedPrices = [...prices].sort((a, b) => a - b);

  return {
    count_active: comps.filter(c => c.status === 'active').length,
    count_sold: comps.filter(c => c.status === 'sold').length,
    average_price: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    median_price: sortedPrices[Math.floor(sortedPrices.length / 2)],
    low_price: Math.min(...prices),
    high_price: Math.max(...prices),
    last_updated: new Date().toISOString(),
  };
}
