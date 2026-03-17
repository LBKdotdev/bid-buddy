export type Category = "motorcycles" | "atv_sxs" | "rv_marine" | "golf";
export type Status = "unreviewed" | "interested" | "maybe" | "pass";

export interface CachedEstimate {
  low: number;
  mid: number;
  high: number;
  confidence: string;
  source: 'gemini' | 'heuristic';
  fetchedAt: number;
}

export interface CachedComps {
  avgPrice: number;
  lowPrice: number;
  highPrice: number;
  count: number;
  sources: string[];
  fetchedAt: number;
}

export interface InventoryItem {
  id: string;
  itemNumber: string;
  category: Category;
  title: string;
  year: number | null;
  make: string;
  model: string;
  vin: string | null;
  milesHours: string | null;
  crScore: number | null;
  docs: string | null;
  location: string;
  photoUrl: string | null;
  sourceUrl: string;
  status: Status;
  note: string;
  maxBid: number | null;
  buddyTag: string | null;
  updatedAt: number;
  cachedEstimate?: CachedEstimate;
  cachedComps?: CachedComps;
}

export interface CSVRow {
  [key: string]: string;
}
