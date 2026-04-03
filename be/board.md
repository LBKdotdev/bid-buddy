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

## Board 3 — Search Settings + Supabase Setup (16 pts)

Source: plan-shared-state-supabase.html → estimate-shared-state-supabase.html

### Ready

### In Progress

### Done
- {search radius + region + results-per-source settings, add to, AppSettings + SettingsScreen} · 5 pts · ~a ✅
- {search params passthrough, update in, multiSourceComps + fetch-comps API} · 3 pts · ~u ✅
- {Supabase tables — rooms + item_overlays + shared_comps + activity, add to, Supabase project} · 5 pts · ~a ✅
- {Supabase JS client + env vars + connection verify, add to, bid-buddy} · 3 pts · ~a ✅

---

## Board 4 — Real-time Sync (15 pts)

### Ready
- {real-time item overlay subscription + upsert on save, add to, syncClient + db.ts} · 5 pts · ~a
- {shared comps cache — push to Supabase after fetch + check before Apify, update in, multiSourceComps} · 5 pts · ~u

### In Progress
- {room create + join + nickname system, add to, src/services/syncClient} · 5 pts · ~a

### Done

---

## Board 5 — Sync UX + Offline (15 pts) ⛔ Blocked by Board 4

### Ready
- {offline write queue + auto-flush on reconnect, add to, syncClient} · 5 pts · ~a
- {room create/join UI + presence display, add to, SettingsScreen} · 5 pts · ~a
- {sync status dot + activity feed, add to, App header + SettingsScreen} · 5 pts · ~a

### In Progress

### Done
