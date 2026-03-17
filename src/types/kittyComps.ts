import { Comp, CompsResult, CompsSummary, FilterDebugInfo } from './comps';

export interface KittyCompsSearch {
  id?: string;
  zip: string;
  radius: number;
  year: number | null;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
  include_active: boolean;
  include_sold: boolean;
  date_days: number;
  results?: CompsResult;
  created_at?: string;
  updated_at?: string;
}

export interface KittyCompsFormData {
  zip: string;
  radius: string;
  year: string;
  make: string;
  model: string;
  trim: string;
  mileage: string;
  include_active: boolean;
  include_sold: boolean;
  date_days: string;
}

export interface KittyCompsSearchParams {
  zipCode: string;
  radiusMiles: number;
  year: number;
  make: string;
  model: string;
  trim?: string;
  mileage?: number;
  condition: 'unknown' | 'clean' | 'average' | 'rough';
}

export interface KittyCompsExpansion {
  radiusExpanded: boolean;
  yearRangeExpanded: boolean;
  mileageIgnored: boolean;
  finalRadius: number;
  finalYearRange: number;
}

export interface KittyCompsSearchResult {
  comps: Comp[];
  summary: CompsSummary;
  expansion: KittyCompsExpansion;
  searchParams: KittyCompsSearchParams;
  debug: FilterDebugInfo;
}
