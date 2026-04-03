## Board 1 — Category Auto-Detect + Cleanup (21 pts) 

### Ready

### In Progress

### Done
- {category auto-detect function, add to, csv.ts} · 5 pts · ~a ✅
- {auto-detect wiring into all import paths, update in, HomeScreen + ImportScreen + ScanScreen} · 5 pts · ~u ✅
- {defaultCategory setting, remove from, settings.ts + SettingsScreen} · 3 pts · ~d ✅
- {6 dead screens/components, remove from, src/screens + src/components + src/types} · 3 pts · ~d ✅
- {React error boundary, add to, App.tsx} · 5 pts · ~a ✅

---

## Board 2 — PDF Import Overhaul (19 pts)

Source: plan-pdf-import-overhaul.html → estimate-pdf-import-overhaul.html

### Ready
### In Progress

### Done
- {color + zone + bookValue + conditionDetail fields, add to, InventoryItem type} · 3 pts · ~a ✅
- {auto-detect catalog type from filename + full field extraction, update in, pdfParser.ts} · 5 pts · ~u ✅
- {RVM block parser with all structured fields, update in, pdfParser.ts} · 5 pts · ~u ✅ (included in parser rewrite)
- {supabase/ folder + SDK dep + stale CLAUDE.md refs, remove from, bid-buddy} · 3 pts · ~d ✅
- {PDF import with real NPA catalogs, test across, motorcycle + RVM} · 3 pts · ~t ✅

---

## Board 3 — Search Settings + D1 Foundation (16 pts)

Source: plan-shared-state-search-settings.html → estimate-shared-state-search-settings.html

### Ready
- {search radius + region + results-per-source settings, add to, AppSettings + SettingsScreen} · 5 pts · ~a
- {search params passthrough, update in, multiSourceComps + fetch-comps API} · 3 pts · ~u
- {D1 database + 4-table schema, add to, Cloudflare} · 5 pts · ~a
- {Worker deploy + CORS + route verification, add to, Cloudflare} · 3 pts · ~a

### In Progress

### Done

---

## Board 4 — Sync API + Client (15 pts) ⛔ Blocked by Board 3

### Ready
- {room create + join + expiry endpoints, add to, Worker API} · 5 pts · ~a
- {item overlay CRUD + comps cache + activity log endpoints, add to, Worker API} · 5 pts · ~a
- {sync client with poll loop + merge logic, add to, src/services} · 5 pts · ~a

### In Progress

### Done

---

## Board 5 — Sync UX + Offline + Validation (18 pts) ⛔ Blocked by Board 4

### Ready
- {offline queue + auto-flush on reconnect, add to, sync client} · 5 pts · ~a
- {saveItem sync hook + shared comps cache, update in, db.ts + multiSourceComps} · 5 pts · ~u
- {room create/join UI + connected users display, add to, SettingsScreen} · 5 pts · ~a
- {sync status dot + activity feed, add to, App header + SettingsScreen} · 3 pts · ~a

### In Progress

### Done
