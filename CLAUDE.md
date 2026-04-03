# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Bid Buddy** is a PWA for triaging NPA San Diego auction inventory. It supports importing catalogs (CSV/PDF/API sync), researching market values via AI estimates and multi-source comps, setting max bids, and quick item lookup during live auctions. It includes camera OCR for scanning auction tags.

## Commands

```bash
npm run dev        # Start Vite dev server
npm run build      # Production build (outputs to dist/)
npm run preview    # Preview production build
npm run lint       # ESLint (flat config, TS/TSX only)
npm run typecheck  # TypeScript type checking (tsconfig.app.json)
```

Deployed to Vercel. Serverless API functions live in `api/`.

## Architecture

**Stack:** React 18 + TypeScript, Vite, Tailwind CSS 3, Vercel Serverless Functions, Groq AI (estimates + OCR), IndexedDB for offline storage.

### Routing & Navigation

No router library — `App.tsx` manages all navigation state directly. Four bottom tabs (Home, Shortlist, Scan, Floor) plus modal overlays for detail screens. Screen visibility is controlled by state variables (`activeScreen`, `selectedItem`, `showCalculator`, etc.).

### Data Flow

- **Import sources:** NPA API sync (via Vercel serverless), CSV upload, PDF catalog parsing (pdfjs-dist, auto-detects moto vs RVM from filename), JSON import/export
- **Primary storage:** IndexedDB (`lbk-bid-buddy`) — all inventory lives client-side
- **Caching:** LocalStorage for comps (30-min expiry, v3 cache key) and recent calculations

### Key Services

| File | Purpose |
|------|---------|
| `src/services/aiEstimate.ts` | AI pricing via Gemini with heuristic fallback. Base prices for 50+ make/model combos, depreciation/mileage adjustments. Model-specific caps (Ryker 600: $4,200, Ryker 900: $5,000) |
| `src/services/multiSourceComps.ts` | Aggregates comps from eBay, CycleTrader, Craigslist, RVTrader via Vercel serverless. LocalStorage cache with 30-min expiry |
| `src/services/ebayApi.ts` | Legacy eBay HTML scraper via CORS proxies. Fallback path |

### Screens

| Screen | Role |
|--------|------|
| `HomeScreen` | Import/sync data, stats dashboard, tool links |
| `ShortlistScreen` | Swipeable item cards, batch comps prefetch, status quick-actions |
| `FloorScreen` | Live auction lookup by item# or buddy tag, shows comps/fees/max bid |
| `ScanScreen` | Camera OCR via Groq Vision API |
| `ItemDetailScreen` | Full research hub — AI estimate, comps with variant filtering, known issues, risk score |
| `AllListingsScreen` | Browse/filter all inventory |
| `BuyFeeCalculatorScreen` | NPA fee calculator with recent calc history |
| `CompsScreen` | Standalone comps/AI estimate lookup |

### Utilities

| File | Purpose |
|------|---------|
| `src/utils/db.ts` | IndexedDB wrapper (init, save, get, delete) |
| `src/utils/csv.ts` | CSV parsing with smart field mapping, San Diego location filter |
| `src/utils/pdfParser.ts` | PDF catalog parsing for motorcycle and RV/marine formats |
| `src/utils/buddyTag.ts` | 5-char alphanumeric tag generation (excludes ambiguous chars I/O/0/1) |
| `src/utils/buyFee.ts` | NPA fee lookup table ($105–$5,550 based on bid tiers) |

### Core Types (`src/types/inventory.ts`)

- `Category`: `"motorcycles" | "atv_sxs" | "rv_marine" | "golf"`
- `Status`: `"unreviewed" | "interested" | "maybe" | "pass"`
- `InventoryItem`: Main entity with fields for vehicle data, status, maxBid, buddyTag, color, zone, bookValue, conditionDetail, cachedEstimate, cachedComps
- Items are preserved across imports (status/notes/buddyTag kept if item already exists)

## Design System

Dark motorsport theme defined in `tailwind.config.js`:
- **Surface grays:** `surface-900` (#09090b) through `surface-400` (#3f3f46)
- **Accent:** `electric` (#d4ff00) with `electric-muted` and `electric-glow` variants
- **Status colors:** success (green), warning (amber), danger (red), info (blue)
- Glow box-shadows (`glow-sm`, `glow`, `glow-lg`), iOS-optimized touch targets

## Vercel Serverless Functions (`api/`)

1. **fetch-npa-inventory.js** — Proxies NPA API, returns inventory JSON
2. **fetch-comps.js** — Multi-source comps aggregator (eBay + Apify CL/FB)
3. **scan-tag.js** — OCR via Groq Vision API

## Supabase (Shared State — In Progress)

Scotty's existing Supabase project "LBKdotdev's Project" is being used for multi-user real-time sync. Previously it only hosted edge function CORS proxies (removed in Board 2). Now being used properly as a database.

- **Project:** LBKdotdev's Project (paused Mar 28, resumed Apr 3 2026)
- **Purpose:** Room-based real-time sync — status, maxBid, notes, buddyTag shared across devices
- **Tables:** rooms, item_overlays, shared_comps, activity (schema in Board 3)
- **Free tier:** 500MB DB, 50K users, real-time included
- **Env vars needed:** `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` in `.env.local` and Vercel dashboard

## Environment Variables

`.env` contains Groq API key and Apify token. `.env.local` will contain Supabase keys. Both are gitignored.

## Comps Variant Filtering

When displaying comps for a specific model, the app extracts numeric identifiers (e.g., "600", "900") and filters out mismatched variants. This prevents a Ryker 900 comp from inflating a Ryker 600 estimate.

## Suggested Max Bid Logic

Calculated as 75% of AI mid estimate, with model-specific hard caps. Displayed in ItemDetailScreen and FloorScreen with a "Use as Max" action.
