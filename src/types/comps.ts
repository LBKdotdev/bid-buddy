export interface Comp {
  status: 'active' | 'sold';
  price: number;
  year: number | null;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
  mileage_quality: 'strong' | 'weak' | 'unknown';
  location_city: string | null;
  location_state: string | null;
  distance_miles: number | null;
  source_name: string;
  source_url: string;
  listing_date: string | null;
  seller_type: 'dealer' | 'private' | 'unknown';
  match_score: number;
}

export interface CompsSummary {
  count_active: number;
  count_sold: number;
  average_price: number;
  median_price: number;
  low_price: number;
  high_price: number;
  typical_offer: number;
  typical_offer_percentage: number;
  last_updated: string;
}

export interface CompsResult {
  comps: Comp[];
  summary: CompsSummary;
}

export interface FilterDebugInfo {
  passed: Array<{
    comp: Comp;
    reasons: string[];
  }>;
  rejected: Array<{
    listing: any;
    reasons: string[];
  }>;
  filterCriteria: {
    make: string;
    model: string;
    yearMin: number;
    yearMax: number;
    mileageMin?: number;
    mileageMax?: number;
    maxDistance: number;
  };
}
