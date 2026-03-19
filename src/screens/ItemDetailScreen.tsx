import { useState, useEffect, useRef } from 'react';
import { X, ExternalLink, Copy, Loader2, Upload, ChevronDown, ChevronUp, Sparkles, RefreshCw, Search } from 'lucide-react';
import type { InventoryItem, Status, CachedEstimate, CachedComps } from '../types/inventory';
import { getItem, saveItem } from '../utils/db';
import { getBuyFee, getTotalDue } from '../utils/buyFee';
import { generateBuddyTag } from '../utils/buddyTag';
import { parseCompsCSV, calculateCompsSummary } from '../utils/comps';
import { Comp, CompsResult } from '../types/comps';
import { getAIEstimate, type EstimateResult } from '../services/aiEstimate';
import { searchCompsWithCache, clearCompsCache, type Comp as MarketComp, type MultiSourceResult } from '../services/multiSourceComps';
import { getKnownIssues, type KnownIssuesResult } from '../services/knownIssues';
import type { CachedIssues } from '../types/inventory';

interface ItemDetailScreenProps {
  itemId: string;
  onClose: () => void;
}

type ReportType = 'comps' | 'aiEstimate' | 'issues' | 'risk' | null;

export default function ItemDetailScreen({ itemId, onClose }: ItemDetailScreenProps) {
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [status, setStatus] = useState<Status>('unreviewed');
  const [maxBid, setMaxBid] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sayBrahLoading, setSayBrahLoading] = useState(false);
  const [activeReport, setActiveReport] = useState<ReportType>(null);
  const [reportContent, setReportContent] = useState<any>(null);
  const [compsData, setCompsData] = useState<CompsResult | null>(null);
  const [multiComps, setMultiComps] = useState<MultiSourceResult | null>(null);
  const [aiEstimate, setAiEstimate] = useState<EstimateResult | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [marginTarget, setMarginTarget] = useState<number>(() => {
    const saved = localStorage.getItem('bid-margin-target');
    return saved ? parseInt(saved) : 20;
  });
  const [zip, setZip] = useState(() => localStorage.getItem('comps-zip') || '');
  const [sourceToggles, setSourceToggles] = useState<Record<'ebay' | 'facebook' | 'craigslist', boolean>>(() => {
    try {
      const saved = localStorage.getItem('comps-source-toggles');
      if (saved) return JSON.parse(saved);
    } catch (_e) { /* ignore */ }
    return { ebay: true, facebook: false, craigslist: false };
  });
  const [compsLoading, setCompsLoading] = useState(false);
  const [showPriceCorrection, setShowPriceCorrection] = useState(false);
  const [correctionInput, setCorrectionInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadItem();
  }, [itemId]);

  const loadItem = async () => {
    setLoading(true);
    try {
      const found = await getItem(itemId);
      if (found) {
        setItem(found);
        setStatus(found.status);
        setMaxBid(found.maxBid?.toString() || '');
        setNote(found.note);

        // Load cached estimate as fast placeholder
        if (found.cachedEstimate) {
          setAiEstimate({
            vehicle: `${found.year || ''} ${found.make} ${found.model}`.trim(),
            mileage: found.milesHours || 'unknown',
            condition: 'good',
            estimate: {
              low: found.cachedEstimate.low,
              mid: found.cachedEstimate.mid,
              high: found.cachedEstimate.high,
              confidence: found.cachedEstimate.confidence,
              notes: '',
              factors: [],
            },
            source: found.cachedEstimate.source,
            timestamp: new Date(found.cachedEstimate.fetchedAt).toISOString(),
          });
        } else {
          // AI estimate as fallback while eBay loads
          fetchAndCacheEstimate(found);
        }

        // Auto-fetch Craigslist comps (~$0.02) so the first number they see is real
        // Trust > pennies — a bad first impression kills the tool
        autoFetchComps(found);

        // Auto-fetch known issues (NHTSA free + Groq cached 24hr)
        autoFetchIssues(found);
      }
    } catch (error) {
      console.error('Load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAndCacheEstimate = async (itemData: InventoryItem) => {
    try {
      const year = itemData.year?.toString() || null;
      const mileage = itemData.milesHours || null;

      const result = await getAIEstimate(year, itemData.make, itemData.model, mileage);
      setAiEstimate(result);

      // Cache the estimate to the item
      const cachedEstimate: CachedEstimate = {
        low: result.estimate.low,
        mid: result.estimate.mid,
        high: result.estimate.high,
        confidence: result.estimate.confidence,
        source: result.source as 'gemini' | 'heuristic',
        fetchedAt: Date.now(),
      };

      const updated: InventoryItem = {
        ...itemData,
        cachedEstimate,
      };

      await saveItem(updated);
      setItem(updated);
    } catch (error) {
      console.error('Auto-estimate error:', error);
    }
  };

  // Auto-fetch comps on item open via Craigslist (~$0.02, fast)
  // Silently upgrades bid card from AI placeholder to real listing data
  const autoFetchIssues = async (itemData: InventoryItem) => {
    // Skip if cached and fresh (< 24 hours)
    if (itemData.cachedIssues && Date.now() - itemData.cachedIssues.fetchedAt < 24 * 60 * 60 * 1000) {
      return; // Data ready — will display instantly when they tap Issues
    }

    try {
      const result = await getKnownIssues(
        itemData.year,
        itemData.make,
        itemData.model,
        itemData.milesHours
      );

      const cached: CachedIssues = { ...result, fetchedAt: Date.now() };

      // Cache to IndexedDB silently — don't switch the active report
      const updated = { ...itemData, cachedIssues: cached, updatedAt: Date.now() };
      await saveItem(updated);
      setItem(updated);
    } catch (e) {
      console.error('Auto-fetch issues error:', e);
    }
  };

  const autoFetchComps = async (itemData: InventoryItem) => {
    try {
      // Search specific variant first (e.g. "CAN-AM RYKER 600")
      const specificModel = itemData.model.replace(/\s+(ACE|SE|LE|S|BASE|SPORT|RALLY|LIMITED|SPECIAL|EDITION|CAMO|EPS|DLX|ES)\b/gi, '').trim();
      const searchQuery = [itemData.make, specificModel].filter(Boolean).join(' ');
      if (!searchQuery) return;

      console.log('Auto-fetching comps for:', searchQuery);
      let result = await searchCompsWithCache(searchQuery, undefined, 300, ['craigslist'], false);

      // If < 3 results, broaden and filter
      if (result.comps.length < 3) {
        const broadModel = itemData.model.replace(/\s*\d{3,4}\s*/g, ' ').replace(/\s+(ACE|SE|LE|S|BASE|SPORT|RALLY|LIMITED|SPECIAL|EDITION|CAMO|EPS|DLX|ES)\b/gi, '').trim();
        const broadQuery = [itemData.make, broadModel].filter(Boolean).join(' ');
        if (broadQuery !== searchQuery) {
          console.log('Broadening auto-fetch to:', broadQuery);
          const broadResult = await searchCompsWithCache(broadQuery, undefined, 300, ['craigslist'], false);

          // Filter broad results for variant match
          const allNums = itemData.model.match(/\d{3,4}/g) || [];
          const modelNumbers = allNums.filter(n => !n.match(/^(19|20)\d{2}$/));
          const filtered = modelNumbers.length > 0
            ? broadResult.comps.filter(comp => {
                const compAllNums = comp.title.match(/\d{3,4}/g) || [];
                const compNumbers = compAllNums.filter(n => !n.match(/^(19|20)\d{2}$/));
                if (compNumbers.length === 0) return true;
                return modelNumbers.some(num => compNumbers.includes(num));
              })
            : broadResult.comps;

          const specificUrls = new Set(result.comps.map(c => c.url));
          const additional = filtered.filter(c => !specificUrls.has(c.url));
          result = { ...broadResult, comps: [...result.comps, ...additional] };
        }
      }

      if (result.comps.length === 0) {
        console.log('No eBay comps found for:', searchQuery);
        return;
      }

      // Filter for model variant match (exclude years from number matching)
      const allNums = itemData.model.match(/\d{3,4}/g) || [];
      const modelNumbers = allNums.filter(n => !n.match(/^(19|20)\d{2}$/));
      const filtered = modelNumbers.length > 0
        ? result.comps.filter(comp => {
            const compAllNums = comp.title.match(/\d{3,4}/g) || [];
            const compNumbers = compAllNums.filter(n => !n.match(/^(19|20)\d{2}$/));
            if (compNumbers.length === 0) return true;
            return modelNumbers.some(num => compNumbers.includes(num));
          })
        : result.comps;

      if (filtered.length > 0) {
        const filteredResult = { ...result, comps: filtered };
        setMultiComps(filteredResult);
        console.log(`Auto-loaded ${filtered.length} eBay comps (${result.comps.length} before filtering)`);
      }
    } catch (error) {
      console.error('Auto eBay comps error:', error);
      // Silent fail — AI estimate stays as fallback
    }
  };

  const handleSave = async () => {
    if (!item) return;

    setSaving(true);
    try {
      const maxBidNum = maxBid.trim() ? parseFloat(maxBid) : null;

      let buddyTag = item.buddyTag;
      if ((status === 'interested' || status === 'maybe') && !buddyTag) {
        buddyTag = generateBuddyTag();
      }

      const updated: InventoryItem = {
        ...item,
        status,
        maxBid: maxBidNum,
        note: note.trim(),
        buddyTag,
        updatedAt: Date.now(),
      };

      await saveItem(updated);
      setItem(updated);
      onClose();
    } catch (error) {
      console.error('Save error:', error);
      alert('Error saving');
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Copy error:', error);
    }
  };

  // Build search queries from specific → broad
  const getSearchQueries = () => {
    if (!item) return { specific: '', broad: '' };
    const fullModel = item.model; // "RYKER 600 ACE"

    // Specific: keep variant number, drop trim → "RYKER 600"
    const specificModel = fullModel.replace(/\s+(ACE|SE|LE|S|BASE|SPORT|RALLY|LIMITED|SPECIAL|EDITION|CAMO|EPS|DLX|ES)\b/gi, '').trim();
    const specific = [item.make, specificModel].filter(Boolean).join(' ');

    // Broad: drop everything → "RYKER"
    const broadModel = fullModel.replace(/\s*\d{3,4}\s*/g, ' ').replace(/\s+(ACE|SE|LE|S|BASE|SPORT|RALLY|LIMITED|SPECIAL|EDITION|CAMO|EPS|DLX|ES)\b/gi, '').trim();
    const broad = [item.make, broadModel].filter(Boolean).join(' ');

    return { specific, broad };
  };

  // Keep for Copy Query button
  const getSearchQuery = () => {
    return getSearchQueries().specific;
  };

  // Price correction system — saves dealer knowledge for this make/model
  const getPriceCorrectionKey = () => {
    if (!item) return '';
    // Normalize: "CAN-AM|RYKER 600" — includes variant for accuracy
    const specificModel = item.model.replace(/\s+(ACE|SE|LE|S|BASE|SPORT|RALLY|LIMITED|SPECIAL|EDITION|CAMO|EPS|DLX|ES)\b/gi, '').trim();
    return `price-correction|${item.make}|${specificModel}`.toLowerCase();
  };

  const getSavedCorrection = (): { price: number; date: string } | null => {
    try {
      const key = getPriceCorrectionKey();
      if (!key) return null;
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved);
    } catch (_e) { /* ignore */ }
    return null;
  };

  const saveCorrection = (price: number) => {
    const key = getPriceCorrectionKey();
    if (!key) return;
    localStorage.setItem(key, JSON.stringify({
      price,
      date: new Date().toISOString(),
    }));
    setShowPriceCorrection(false);
    setCorrectionInput('');
  };

  const clearCorrection = () => {
    const key = getPriceCorrectionKey();
    if (key) localStorage.removeItem(key);
    setShowPriceCorrection(false);
  };

  // Filter comps to exclude mismatched variants (e.g., searching for 600, exclude 900)
  const filterCompsForItem = (comps: MarketComp[]): MarketComp[] => {
    if (!item) return comps;

    // Extract engine/variant numbers from the model, excluding years
    // "RYKER 600 ACE" → ["600"], "TERYX4" → ["4"], "SPYDER RT" → []
    const allNumbers = item.model.match(/\d{3,4}/g) || [];
    const modelNumbers = allNumbers.filter(n => !n.match(/^(19|20)\d{2}$/)); // exclude years

    if (modelNumbers.length === 0) {
      return comps; // No specific variant number, return all
    }

    return comps.filter(comp => {
      const compTitle = comp.title;
      // Extract non-year numbers from comp title
      const compAllNumbers = compTitle.match(/\d{3,4}/g) || [];
      const compNumbers = compAllNumbers.filter(n => !n.match(/^(19|20)\d{2}$/));

      // If comp has no variant numbers, include it (generic listing)
      if (compNumbers.length === 0) return true;

      // Check if any of our model variant numbers appear in the comp
      return modelNumbers.some(num => compNumbers.includes(num));
    });
  };

  // deep = true means add FB Marketplace alongside Craigslist
  const handleRunComps = async (forceRefresh: boolean = false, deep: boolean = false) => {
    if (!item) return;
    setSayBrahLoading(true);
    setCompsLoading(true);
    setActiveReport('comps');

    try {
      const { specific, broad } = getSearchQueries();
      // e.g. specific = "CAN-AM RYKER 600", broad = "CAN-AM RYKER"
      const enabledSources: ('ebay' | 'facebook' | 'craigslist')[] = deep
        ? ['craigslist', 'facebook']
        : ['craigslist'];

      if (zip) localStorage.setItem('comps-zip', zip);

      // Try specific query first (e.g. "Can-Am Ryker 600") for accurate variant match
      console.log('Trying specific query:', specific, 'sources:', enabledSources);
      let result = await searchCompsWithCache(specific, zip || undefined, 300, enabledSources, forceRefresh);

      // If specific returned < 3 results, broaden search and filter client-side
      if (result.comps.length < 3 && specific !== broad) {
        console.log(`Only ${result.comps.length} results for "${specific}" — broadening to "${broad}"`);
        const broadResult = await searchCompsWithCache(broad, zip || undefined, 300, enabledSources, forceRefresh);
        const filteredBroad = filterCompsForItem(broadResult.comps);

        // Merge: specific results first, then filtered broad results (deduped)
        const specificUrls = new Set(result.comps.map(c => c.url));
        const additional = filteredBroad.filter(c => !specificUrls.has(c.url));
        result = {
          ...broadResult,
          comps: [...result.comps, ...additional],
        };
        console.log(`Combined: ${result.comps.length} results after merge`);
      }

      // Filter comps to match the specific model variant
      const filteredComps = filterCompsForItem(result.comps);
      const filteredResult = { ...result, comps: filteredComps };
      setMultiComps(filteredResult);

      console.log(`Comps: ${result.comps.length} found, ${filteredComps.length} after filtering for model match`);

      // Calculate summary from filtered comps
      if (filteredComps.length > 0) {
        const prices = filteredComps.map(c => c.price);
        const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
        const lowPrice = Math.min(...prices);
        const highPrice = Math.max(...prices);

        setReportContent({
          multiComps: filteredResult,
          summary: {
            average_price: avgPrice,
            low_price: lowPrice,
            high_price: highPrice,
          },
          fromCache: result.fromCache,
          lastUpdated: result.lastUpdated,
        });

        // Cache comps summary to the item for offline access
        const sourcesUsed = Object.entries(result.sources)
          .filter(([_, count]) => count > 0)
          .map(([source]) => source);

        const cachedComps: CachedComps = {
          avgPrice,
          lowPrice,
          highPrice,
          count: filteredComps.length,
          sources: sourcesUsed,
          fetchedAt: Date.now(),
        };

        const updated: InventoryItem = { ...item, cachedComps };
        await saveItem(updated);
        setItem(updated);
      } else {
        // No comps found - auto-fetch AI estimate as fallback
        console.log('No comps found, fetching AI estimate as fallback');
        if (!aiEstimate || aiEstimate.source === 'heuristic') {
          // Fetch fresh AI estimate if we don't have one or only have heuristic
          const year = item.year?.toString() || null;
          const mileage = item.milesHours || null;
          const result = await getAIEstimate(year, item.make, item.model, mileage);
          setAiEstimate(result);

          // Cache the AI estimate
          const cachedEstimate: CachedEstimate = {
            low: result.estimate.low,
            mid: result.estimate.mid,
            high: result.estimate.high,
            confidence: result.estimate.confidence,
            source: result.source as 'gemini' | 'heuristic',
            fetchedAt: Date.now(),
          };
          const updated: InventoryItem = { ...item, cachedEstimate };
          await saveItem(updated);
          setItem(updated);
        }

        setReportContent({
          multiComps: null,
          noComps: true,
          message: `No listings found for "${specific}". Try Deep Search or Copy Query to search manually.`,
        });
      }
    } catch (error) {
      console.error('Multi-source comps error:', error);
      setReportContent({
        multiComps: null,
        error: error instanceof Error ? error.message : 'Failed to fetch comps',
      });
    }

    setSayBrahLoading(false);
    setCompsLoading(false);
  };

  const handleAIEstimate = async () => {
    if (!item) return;
    setSayBrahLoading(true);
    setActiveReport('aiEstimate');

    try {
      const year = item.year?.toString() || null;
      const mileage = item.milesHours || null;

      const result = await getAIEstimate(year, item.make, item.model, mileage);
      setAiEstimate(result);
      setReportContent({ aiEstimate: result });

      // Also cache it to the item
      const cachedEstimate: CachedEstimate = {
        low: result.estimate.low,
        mid: result.estimate.mid,
        high: result.estimate.high,
        confidence: result.estimate.confidence,
        source: result.source as 'gemini' | 'heuristic',
        fetchedAt: Date.now(),
      };
      const updated: InventoryItem = { ...item, cachedEstimate };
      await saveItem(updated);
      setItem(updated);
    } catch (error) {
      console.error('AI estimate error:', error);
      setReportContent({
        error: error instanceof Error ? error.message : 'Failed to get estimate',
      });
    }

    setSayBrahLoading(false);
  };

  const handleImportCompsCSV = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const comps = parseCompsCSV(text);

    if (comps.length >= 5) {
      const summary = calculateCompsSummary(comps);
      const result: CompsResult = { comps, summary };
      setCompsData(result);
      setReportContent({ compsResult: result });
      setActiveReport('comps');
      setShowImportModal(false);
    } else {
      alert('CSV must contain at least 5 valid comps with source_name, source_url, and price.');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleKnownIssues = async () => {
    if (!item) return;

    // Use cached issues if fresh (< 24 hours)
    if (item.cachedIssues && Date.now() - item.cachedIssues.fetchedAt < 24 * 60 * 60 * 1000) {
      setReportContent(item.cachedIssues);
      setActiveReport('issues');
      return;
    }

    setSayBrahLoading(true);
    setActiveReport('issues');

    try {
      const result = await getKnownIssues(
        item.year,
        item.make,
        item.model,
        item.milesHours
      );

      const cached: CachedIssues = { ...result, fetchedAt: Date.now() };
      setReportContent(cached);

      // Cache to IndexedDB
      const updated = { ...item, cachedIssues: cached, updatedAt: Date.now() };
      await saveItem(updated);
      setItem(updated);
    } catch (e) {
      console.error('Known issues error:', e);
      setReportContent({
        recalls: [],
        commonIssues: [
          { issue: 'Could not load issues', detail: 'Check your connection and try again.', severity: 'medium' },
        ],
        vehicle: `${item.year || ''} ${item.make} ${item.model}`.trim(),
        source: 'fallback',
        fetchedAt: 0,
      });
    }

    setSayBrahLoading(false);
  };

  const handleRiskScore = async () => {
    if (!item) return;
    setSayBrahLoading(true);
    setActiveReport('risk');

    await new Promise(resolve => setTimeout(resolve, 1000));

    let score = 'Medium';
    let reason = 'Standard risk profile for this vehicle type.';

    const itemYear = item.year || 2020;
    const bidValue = maxBid.trim() ? parseFloat(maxBid) : 0;

    if (itemYear <= 2013) {
      score = 'High';
      reason = 'Older vehicle may have higher maintenance costs and unknown history.';
    } else if (!bidValue || isNaN(bidValue)) {
      score = 'Medium';
      reason = 'Bid information unavailable for full risk assessment.';
    } else if (bidValue > 10000) {
      score = 'Low';
      reason = 'Higher value vehicle typically indicates better condition and maintenance.';
    }

    setReportContent({ score, reason });
    setSayBrahLoading(false);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-surface-900 z-50 flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="fixed inset-0 bg-surface-900 z-50 flex items-center justify-center">
        <div className="text-zinc-500">Item not found</div>
      </div>
    );
  }

  const buyFee = maxBid.trim() ? getBuyFee(parseFloat(maxBid)) : null;
  const totalDue = maxBid.trim() ? getTotalDue(parseFloat(maxBid)) : null;

  const getStatusStyle = (s: Status) => {
    switch (s) {
      case 'interested': return 'bg-status-success text-white';
      case 'maybe': return 'bg-status-warning text-white';
      case 'pass': return 'bg-status-danger text-white';
      default: return 'bg-surface-600 text-zinc-400';
    }
  };

  return (
    <div className="fixed inset-0 bg-surface-900 z-50 overflow-y-auto">
      <div className="bg-surface-800 border-b border-surface-500/30 sticky top-0 z-10" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={onClose} className="text-electric font-medium">
            Cancel
          </button>
          <h1 className="font-semibold text-white">Item Details</h1>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-electric font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto pb-20">
        {item.photoUrl && (
          <img
            src={item.photoUrl}
            alt={item.title}
            className="w-full h-56 object-cover"
          />
        )}

        <div className="p-4 space-y-4">
          <div className="card p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-electric font-bold text-xl">#{item.itemNumber}</span>
                  {item.buddyTag && (
                    <span className="text-xs bg-surface-600 text-zinc-400 px-2 py-0.5 rounded font-medium">
                      {item.buddyTag}
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-500">{item.category}</div>
              </div>
              <span className={`text-xs font-medium px-3 py-1 rounded-full ${getStatusStyle(item.status)}`}>
                {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
              </span>
            </div>

            <h2 className="text-lg font-semibold text-white mb-3">{item.title}</h2>

            <div className="grid grid-cols-2 gap-3 text-sm">
              {item.year && (
                <div>
                  <div className="text-zinc-500 text-xs">Year</div>
                  <div className="text-white font-medium">{item.year}</div>
                </div>
              )}
              {item.make && (
                <div>
                  <div className="text-zinc-500 text-xs">Make</div>
                  <div className="text-white font-medium">{item.make}</div>
                </div>
              )}
              {item.model && (
                <div>
                  <div className="text-zinc-500 text-xs">Model</div>
                  <div className="text-white font-medium">{item.model}</div>
                </div>
              )}
              {item.milesHours && (
                <div>
                  <div className="text-zinc-500 text-xs">Miles/Hours</div>
                  <div className="text-white font-medium">{item.milesHours}</div>
                </div>
              )}
              {item.vin && (
                <div>
                  <div className="text-zinc-500 text-xs">VIN</div>
                  <div className="text-white font-medium font-mono text-sm">{item.vin}</div>
                </div>
              )}
              {item.docs && (
                <div>
                  <div className="text-zinc-500 text-xs">Docs</div>
                  <div className="text-status-success font-medium">{item.docs}</div>
                </div>
              )}
            </div>

            {/* CR Score — prominent display */}
            {item.crScore !== null && (
              <div className={`mt-3 rounded-xl p-3 flex items-center justify-between ${
                item.crScore >= 4 ? 'bg-status-success/10 border border-status-success/30' :
                item.crScore >= 3 ? 'bg-status-warning/10 border border-status-warning/30' :
                'bg-status-danger/10 border border-status-danger/30'
              }`}>
                <div>
                  <div className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Condition Rating</div>
                  <div className="text-zinc-500 text-xs mt-0.5">
                    {item.crScore >= 4.5 ? 'Excellent — minimal wear' :
                     item.crScore >= 4 ? 'Good — light wear, well maintained' :
                     item.crScore >= 3 ? 'Fair — moderate wear, may need work' :
                     item.crScore >= 2 ? 'Rough — significant wear, expect repairs' :
                     'Poor — major issues likely'}
                  </div>
                </div>
                <div className={`text-3xl font-bold tabular-nums ${
                  item.crScore >= 4 ? 'text-status-success' :
                  item.crScore >= 3 ? 'text-status-warning' :
                  'text-status-danger'
                }`}>
                  {item.crScore}
                </div>
              </div>
            )}

            {item.sourceUrl && (
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-electric text-sm font-medium mt-3"
              >
                <ExternalLink size={14} />
                View Source
              </a>
            )}
          </div>

          {/* Suggested Max Bid Card — comp-driven with transparent math */}
          {(() => {
            // Determine pricing source: real comps first, AI fallback
            const hasComps = multiComps && multiComps.comps.length >= 3;
            const hasAI = !!aiEstimate;

            if (!hasComps && !hasAI && !loading) {
              return (
                <div className="card p-4 border border-dashed border-surface-500">
                  <div className="flex items-center gap-3">
                    <Loader2 size={20} className="text-electric animate-spin" />
                    <span className="text-sm text-zinc-500">Getting price estimate...</span>
                  </div>
                </div>
              );
            }

            if (!hasComps && !hasAI) return null;

            // Check for dealer price correction FIRST (highest trust)
            const correction = getSavedCorrection();

            // Calculate market value: correction > comps > AI
            let marketValue = 0;
            let marketLow = 0;
            let marketHigh = 0;
            let dataSource = '';
            let dataPoints = 0;
            let soldCount = 0;
            let activeCount = 0;
            let confidenceLevel: 'high' | 'medium' | 'low' = 'low';
            let isCorrection = false;

            if (correction) {
              // Dealer-corrected price — highest confidence
              marketValue = correction.price;
              marketLow = Math.round(correction.price * 0.85);
              marketHigh = Math.round(correction.price * 1.15);
              dataSource = 'Dealer corrected';
              confidenceLevel = 'high';
              isCorrection = true;
            } else if (hasComps) {
              const comps = multiComps!.comps;
              const prices = comps.map(c => c.price).sort((a, b) => a - b);

              // Separate sold (eBay) vs active (FB/CL) — discount active by 15%
              const soldPrices: number[] = [];
              const activePrices: number[] = [];
              comps.forEach(c => {
                if (c.source === 'ebay') {
                  soldPrices.push(c.price);
                  soldCount++;
                } else {
                  activePrices.push(c.price * 0.85); // discount asking prices
                  activeCount++;
                }
              });

              // Weighted: sold prices count 2x (real transactions)
              const weightedPrices = [...soldPrices, ...soldPrices, ...activePrices].sort((a, b) => a - b);

              if (weightedPrices.length > 0) {
                marketValue = weightedPrices[Math.floor(weightedPrices.length / 2)]; // median
                marketLow = prices[0];
                marketHigh = prices[prices.length - 1];
              }

              dataPoints = comps.length;
              const sourceNames = [];
              if (multiComps!.sources.ebay > 0) sourceNames.push(`${multiComps!.sources.ebay} eBay sold`);
              if (multiComps!.sources.facebook > 0) sourceNames.push(`${multiComps!.sources.facebook} FB`);
              if (multiComps!.sources.craigslist > 0) sourceNames.push(`${multiComps!.sources.craigslist} CL`);
              dataSource = sourceNames.join(', ');

              if (soldCount >= 5) confidenceLevel = 'high';
              else if (soldCount >= 2 || dataPoints >= 5) confidenceLevel = 'medium';
              else confidenceLevel = 'low';
            } else if (hasAI) {
              marketValue = aiEstimate!.estimate.mid;
              marketLow = aiEstimate!.estimate.low;
              marketHigh = aiEstimate!.estimate.high;
              dataSource = aiEstimate!.source === 'groq' ? 'AI estimate' : 'Heuristic estimate';
              confidenceLevel = 'low';
            }

            if (marketValue <= 0) return null;

            // Calculate the bid: market value minus margin, then check if fee fits
            const marginMultiplier = (100 - marginTarget) / 100;
            const suggestedBid = Math.round((marketValue * marginMultiplier) / 100) * 100;
            const buyFee = getBuyFee(suggestedBid) || 0;
            const totalCost = suggestedBid + buyFee;
            const actualMargin = marketValue > 0 ? Math.round((1 - totalCost / marketValue) * 100) : 0;

            const handleMarginChange = (newMargin: number) => {
              setMarginTarget(newMargin);
              localStorage.setItem('bid-margin-target', newMargin.toString());
            };

            const confidenceColors = {
              high: 'text-status-success bg-status-success/20',
              medium: 'text-status-warning bg-status-warning/20',
              low: 'text-zinc-400 bg-surface-600',
            };

            return (
              <div className="card p-4 bg-gradient-to-r from-electric/5 to-surface-800 border border-electric/30">
                {/* Header */}
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={16} className="text-electric" />
                  <span className="text-sm font-medium text-zinc-400">Suggested Max Bid</span>
                  <span className={`ml-auto text-[10px] font-medium px-2 py-0.5 rounded ${confidenceColors[confidenceLevel]}`}>
                    {confidenceLevel === 'high' ? 'Strong data' : confidenceLevel === 'medium' ? 'Fair data' : 'Limited data'}
                  </span>
                </div>

                {/* Big number + Use as Max */}
                <div className="flex items-end gap-4 mb-3">
                  <div className="flex-1">
                    <div className="text-3xl font-bold text-electric tabular-nums">
                      ${suggestedBid.toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => setMaxBid(suggestedBid.toString())}
                    className="px-4 py-2 bg-electric text-surface-900 text-sm font-semibold rounded-xl active:opacity-80"
                  >
                    Use as Max
                  </button>
                </div>

                {/* Transparent math breakdown */}
                <div className="bg-surface-900/50 rounded-lg p-3 mb-3 space-y-1.5 text-sm tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">
                      {hasComps ? 'Median market price' : 'Est. market price'}
                    </span>
                    <span className="text-white font-medium">${Math.round(marketValue).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">- Target margin ({marginTarget}%)</span>
                    <span className="text-zinc-400">-${Math.round(marketValue * marginTarget / 100).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t border-surface-500/30 pt-1.5">
                    <span className="text-electric font-medium">= Max bid</span>
                    <span className="text-electric font-medium">${suggestedBid.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">+ NPA buy fee</span>
                    <span className="text-zinc-500">${buyFee.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">= All-in cost</span>
                    <span className="text-zinc-500 font-medium">${totalCost.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">True margin after fees</span>
                    <span className={`font-medium ${actualMargin >= 15 ? 'text-status-success' : actualMargin >= 5 ? 'text-status-warning' : 'text-status-danger'}`}>
                      {actualMargin}%
                    </span>
                  </div>
                </div>

                {/* Margin selector */}
                <div className="flex gap-1.5 mb-3">
                  {[
                    { label: 'Thin', value: 15, desc: '15%' },
                    { label: 'Normal', value: 20, desc: '20%' },
                    { label: 'Fat', value: 25, desc: '25%' },
                    { label: 'Steal', value: 35, desc: '35%' },
                  ].map(preset => (
                    <button
                      key={preset.value}
                      onClick={() => handleMarginChange(preset.value)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        marginTarget === preset.value
                          ? 'bg-electric text-surface-900'
                          : 'bg-surface-600 text-zinc-400 active:bg-surface-500'
                      }`}
                    >
                      <div>{preset.label}</div>
                      <div className="text-[10px] opacity-70">{preset.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Data source + market range */}
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>
                    {isCorrection ? (
                      <span className="text-status-success">Dealer corrected price</span>
                    ) : hasComps ? (
                      <>Based on {dataPoints} comps ({dataSource})</>
                    ) : (
                      <>AI estimate only — tap Run Comps for real data</>
                    )}
                  </span>
                  <span className="tabular-nums">
                    ${marketLow.toLocaleString()} - ${marketHigh.toLocaleString()}
                  </span>
                </div>

                {/* Warning when no real data and no correction */}
                {!hasComps && !isCorrection && (
                  <div className="mt-2 bg-status-warning/10 border border-status-warning/20 rounded-lg px-3 py-2 text-[11px] text-status-warning">
                    Not based on real listings. Run Comps or correct the price below.
                  </div>
                )}

                {/* Correct Price — always available */}
                <div className="mt-2 pt-2 border-t border-surface-500/20">
                  {!showPriceCorrection ? (
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => {
                          setShowPriceCorrection(true);
                          setCorrectionInput(Math.round(marketValue).toString());
                        }}
                        className="text-[11px] text-zinc-500 active:text-electric"
                      >
                        {isCorrection ? 'Update price' : 'Correct price'}
                      </button>
                      {isCorrection && (
                        <button
                          onClick={clearCorrection}
                          className="text-[11px] text-zinc-600 active:text-status-warning"
                        >
                          Remove correction
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-[11px] text-zinc-400">What's the real market value for this unit?</div>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
                          <input
                            type="number"
                            value={correctionInput}
                            onChange={e => setCorrectionInput(e.target.value)}
                            placeholder="5500"
                            className="input-field w-full pl-7 text-sm py-2"
                            autoFocus
                          />
                        </div>
                        <button
                          onClick={() => {
                            const price = parseInt(correctionInput);
                            if (price > 0) saveCorrection(price);
                          }}
                          disabled={!correctionInput || parseInt(correctionInput) <= 0}
                          className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setShowPriceCorrection(false)}
                          className="btn-secondary px-3 py-2 text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          <div className="card p-4">
            <div className="space-y-4">
              <div>
                <label className="text-sm text-zinc-500 block mb-2">Status</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['unreviewed', 'interested', 'maybe', 'pass'] as Status[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setStatus(s)}
                      className={`py-2 rounded-xl text-xs font-medium transition-colors ${
                        status === s
                          ? getStatusStyle(s)
                          : 'bg-surface-600 text-zinc-400'
                      }`}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm text-zinc-500 block mb-2">Max Bid</label>
                <input
                  type="number"
                  value={maxBid}
                  onChange={e => setMaxBid(e.target.value)}
                  placeholder="$0"
                  className="input-field text-lg font-semibold"
                />
                {buyFee !== null && totalDue !== null && (
                  <div className="flex justify-between mt-2 text-sm">
                    <span className="text-zinc-500">Fee: ${buyFee.toLocaleString()}</span>
                    <span className="text-electric font-medium">Total: ${totalDue.toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm text-zinc-500 block mb-2">Notes</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Add notes..."
                  rows={3}
                  className="input-field resize-none"
                />
              </div>
            </div>
          </div>

          {/* Comps status — inline, no extra tap */}
          {multiComps && multiComps.comps.length > 0 && (
            <div className="bg-status-success/10 rounded-xl px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-status-success font-medium">
                {multiComps.comps.length} comps loaded
              </span>
              <div className="flex gap-1">
                {multiComps.sources.ebay > 0 && (
                  <span className="text-[10px] bg-status-info/20 text-status-info px-1.5 py-0.5 rounded">{multiComps.sources.ebay} eBay</span>
                )}
                {multiComps.sources.facebook > 0 && (
                  <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">{multiComps.sources.facebook} FB</span>
                )}
                {multiComps.sources.craigslist > 0 && (
                  <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">{multiComps.sources.craigslist} CL</span>
                )}
              </div>
            </div>
          )}

          {/* Primary actions — always visible */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleRunComps(false)}
              disabled={sayBrahLoading}
              className="btn-primary py-3 disabled:opacity-50 flex items-center justify-center gap-1.5 font-semibold"
            >
              {compsLoading && !sayBrahLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Comps
            </button>
            <button
              onClick={() => handleRunComps(false, true)}
              disabled={sayBrahLoading}
              className="btn-secondary py-3 disabled:opacity-50 flex items-center justify-center gap-1.5 font-medium"
            >
              {compsLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Deep
            </button>
            <button
              onClick={handleKnownIssues}
              disabled={sayBrahLoading}
              className={`py-3 disabled:opacity-50 flex items-center justify-center gap-1.5 font-medium relative ${
                item?.cachedIssues?.recalls && item.cachedIssues.recalls.length > 0
                  ? 'btn-secondary !border-status-danger/50 !text-status-danger'
                  : 'btn-secondary text-status-warning'
              }`}
            >
              {sayBrahLoading && activeReport === 'issues' ? <Loader2 size={16} className="animate-spin" /> : <span>⚠</span>}
              {item?.cachedIssues?.recalls && item.cachedIssues.recalls.length > 0
                ? `${item.cachedIssues.recalls.length} Recall${item.cachedIssues.recalls.length > 1 ? 's' : ''}`
                : item?.cachedIssues
                  ? 'No Recalls'
                  : 'Issues'
              }
            </button>
          </div>

          {/* More tools — collapsed */}
          <div className="card overflow-hidden">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-4 py-3 active:bg-surface-600"
            >
              <span className="text-sm text-zinc-400">More Tools</span>
              {showAdvanced ? (
                <ChevronUp size={16} className="text-zinc-600" />
              ) : (
                <ChevronDown size={16} className="text-zinc-600" />
              )}
            </button>
            {showAdvanced && (
              <div className="border-t border-surface-500/30 p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleAIEstimate}
                    disabled={sayBrahLoading || !item}
                    className="btn-secondary text-sm py-2 disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <Sparkles size={14} />
                    AI Estimate
                  </button>
                  <button
                    onClick={() => copyToClipboard(getSearchQuery(), 'Search query')}
                    className="btn-secondary text-sm py-2 flex items-center justify-center gap-1"
                  >
                    <Copy size={14} />
                    Copy Query
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleRiskScore}
                    disabled={sayBrahLoading}
                    className="btn-secondary text-sm py-2 disabled:opacity-50"
                  >
                    Risk Score
                  </button>
                  <button
                    onClick={() => { clearCompsCache(); setMultiComps(null); }}
                    className="btn-secondary text-sm py-2 text-zinc-500"
                  >
                    Clear Cache
                  </button>
                </div>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />

          {sayBrahLoading && (
            <div className="card p-8 flex items-center justify-center">
              <Loader2 size={32} className="text-electric animate-spin" />
            </div>
          )}

          {!sayBrahLoading && reportContent && activeReport === 'comps' && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-white">Market Comps</h3>
                {reportContent.lastUpdated && (
                  <span className="text-xs text-zinc-500">
                    {reportContent.fromCache ? 'Cached' : 'Updated'} {reportContent.lastUpdated}
                  </span>
                )}
              </div>

              {/* Source breakdown */}
              {reportContent.multiComps?.sources && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {reportContent.multiComps.sources.ebay > 0 && (
                    <span className="text-xs bg-status-info/20 text-status-info px-2 py-0.5 rounded">
                      eBay: {reportContent.multiComps.sources.ebay}
                    </span>
                  )}
                  {reportContent.multiComps.sources.facebook > 0 && (
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                      FB Marketplace: {reportContent.multiComps.sources.facebook}
                    </span>
                  )}
                  {reportContent.multiComps.sources.craigslist > 0 && (
                    <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">
                      Craigslist: {reportContent.multiComps.sources.craigslist}
                    </span>
                  )}
                </div>
              )}

              {reportContent.noComps && (
                <div className="bg-electric/10 text-electric rounded-xl p-3 text-sm mb-3 flex items-center gap-2">
                  <Sparkles size={16} />
                  {reportContent.message}
                </div>
              )}

              {reportContent.error && !reportContent.noComps && (
                <div className="bg-status-warning/10 text-status-warning rounded-xl p-3 text-sm mb-3">
                  {reportContent.error}
                </div>
              )}

              {reportContent.summary && (
                <div className="bg-surface-600 rounded-xl p-3 mb-3">
                  <div className="grid grid-cols-3 gap-3 text-center text-sm">
                    <div>
                      <div className="text-zinc-500 text-xs">Average</div>
                      <div className="text-white font-semibold tabular-nums">
                        ${reportContent.summary.average_price.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500 text-xs">Low</div>
                      <div className="text-status-success font-semibold tabular-nums">
                        ${reportContent.summary.low_price.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500 text-xs">High</div>
                      <div className="text-status-danger font-semibold tabular-nums">
                        ${reportContent.summary.high_price.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {reportContent.multiComps?.comps && reportContent.multiComps.comps.length > 0 && (
                <div className="space-y-2">
                  {reportContent.multiComps.comps.slice(0, 15).map((comp: MarketComp, idx: number) => (
                    <a
                      key={idx}
                      href={comp.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block bg-surface-600 rounded-xl p-3 active:bg-surface-500"
                    >
                      <div className="flex gap-3">
                        {comp.imageUrl && (
                          <img
                            src={comp.imageUrl}
                            alt={comp.title}
                            className="w-12 h-12 object-cover rounded-lg"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white font-medium line-clamp-1">
                            {comp.title}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-status-success font-semibold tabular-nums">
                              ${comp.price.toLocaleString()}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              comp.source === 'ebay' ? 'bg-status-info/20 text-status-info' :
                              comp.source === 'facebook' ? 'bg-blue-500/20 text-blue-400' :
                              comp.source === 'craigslist' ? 'bg-purple-500/20 text-purple-400' :
                              'bg-surface-600 text-zinc-400'
                            }`}>
                              {comp.source === 'ebay' ? 'eBay Sold' :
                               comp.source === 'facebook' ? 'FB' :
                               comp.source === 'craigslist' ? 'CL' : comp.source}
                            </span>
                          </div>
                          {comp.location && (
                            <div className="text-xs text-zinc-500 mt-0.5">
                              {comp.location}
                            </div>
                          )}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {!sayBrahLoading && reportContent && activeReport === 'aiEstimate' && reportContent.aiEstimate && (
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={18} className="text-electric" />
                <h3 className="font-semibold text-white">AI Price Estimate</h3>
                <span className="ml-auto text-xs text-zinc-500 bg-surface-600 px-2 py-0.5 rounded">
                  {reportContent.aiEstimate.source === 'heuristic' ? 'Estimated' : reportContent.aiEstimate.source}
                </span>
              </div>

              <div className="text-sm text-zinc-500 mb-4">{reportContent.aiEstimate.vehicle}</div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-surface-600 rounded-xl p-3 text-center">
                  <div className="text-xs text-zinc-500 mb-1">Low</div>
                  <div className="text-lg font-bold text-status-success tabular-nums">
                    ${reportContent.aiEstimate.estimate.low.toLocaleString()}
                  </div>
                </div>
                <div className="bg-electric/10 rounded-xl p-3 text-center">
                  <div className="text-xs text-electric mb-1">Fair Price</div>
                  <div className="text-xl font-bold text-electric tabular-nums">
                    ${reportContent.aiEstimate.estimate.mid.toLocaleString()}
                  </div>
                </div>
                <div className="bg-surface-600 rounded-xl p-3 text-center">
                  <div className="text-xs text-zinc-500 mb-1">High</div>
                  <div className="text-lg font-bold text-status-warning tabular-nums">
                    ${reportContent.aiEstimate.estimate.high.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="text-sm text-zinc-400 mb-3">
                {reportContent.aiEstimate.estimate.notes}
              </div>

              <div className="flex flex-wrap gap-2">
                {reportContent.aiEstimate.estimate.factors.map((factor: string, i: number) => (
                  <span
                    key={i}
                    className="text-xs bg-surface-600 text-zinc-400 px-2 py-1 rounded"
                  >
                    {factor}
                  </span>
                ))}
              </div>

              <div className="mt-4 pt-3 border-t border-surface-500/30 text-xs text-zinc-500">
                Confidence: {reportContent.aiEstimate.estimate.confidence}
              </div>
            </div>
          )}

          {!sayBrahLoading && reportContent && activeReport === 'issues' && (
            <div className="space-y-4">
              {/* NHTSA Recalls Section */}
              <div className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <span className="text-status-danger">⚠</span> NHTSA Recalls
                  </h3>
                  <span className="text-xs text-zinc-500 bg-surface-600 px-2 py-0.5 rounded">Official Data</span>
                </div>
                {reportContent.vehicle && (
                  <div className="text-sm text-zinc-500 mb-3">{reportContent.vehicle}</div>
                )}
                {reportContent.recalls && reportContent.recalls.length > 0 ? (
                  <div className="space-y-3">
                    {reportContent.recalls.map((recall: any, idx: number) => (
                      <div key={idx} className="bg-surface-600 rounded-xl p-3 border-l-2 border-status-danger">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="font-medium text-white text-sm">{recall.component}</span>
                          <span className="text-xs bg-status-danger/20 text-status-danger px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                            recall
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mb-2">{recall.summary}</p>
                        {recall.consequence && (
                          <p className="text-xs text-status-warning/80"><span className="font-medium">Risk:</span> {recall.consequence}</p>
                        )}
                        {recall.remedy && (
                          <p className="text-xs text-status-success/80 mt-1"><span className="font-medium">Fix:</span> {recall.remedy}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          {recall.nhtsaCampaignNumber && (
                            <span className="text-[10px] text-zinc-600">Campaign: {recall.nhtsaCampaignNumber}</span>
                          )}
                          {recall.reportDate && (
                            <span className="text-[10px] text-zinc-600">{recall.reportDate}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-surface-600 rounded-xl p-3 text-sm text-status-success/80 flex items-center gap-2">
                    <span>✓</span> No NHTSA recalls found for this vehicle
                  </div>
                )}
              </div>

              {/* Common Issues Section (Groq AI) */}
              <div className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-white">Common Problems</h3>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    reportContent.source === 'groq'
                      ? 'text-electric bg-electric/10'
                      : 'text-zinc-500 bg-surface-600'
                  }`}>
                    {reportContent.source === 'groq' ? 'AI Powered' : 'Basic Info'}
                  </span>
                </div>
                <div className="space-y-3">
                  {(reportContent.commonIssues || []).map((issue: { issue: string; detail: string; severity: string }, idx: number) => (
                    <div key={idx} className="bg-surface-600 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="font-medium text-white text-sm">{issue.issue}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                          issue.severity === 'high' ? 'bg-status-danger/20 text-status-danger' :
                          issue.severity === 'medium' ? 'bg-status-warning/20 text-status-warning' :
                          'bg-status-success/20 text-status-success'
                        }`}>
                          {issue.severity}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">{issue.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!sayBrahLoading && reportContent && activeReport === 'risk' && (
            <div className="card p-4">
              <h3 className="font-semibold text-white mb-3">Risk Assessment</h3>
              <div className="bg-surface-600 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-zinc-500 text-sm">Risk Level</span>
                  <span className={`font-bold ${
                    reportContent.score === 'Low' ? 'text-status-success' :
                    reportContent.score === 'High' ? 'text-status-danger' :
                    'text-status-warning'
                  }`}>
                    {reportContent.score}
                  </span>
                </div>
                <p className="text-sm text-zinc-400">{reportContent.reason}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showImportModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center" onClick={() => setShowImportModal(false)}>
          <div className="bg-surface-800 rounded-t-3xl w-full max-w-lg p-5 pb-10 border-t border-surface-500/30" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-surface-500 rounded-full mx-auto mb-5" />
            <h2 className="text-lg font-semibold text-white mb-3">Import Comps CSV</h2>
            <p className="text-sm text-zinc-500 mb-4">
              Upload a CSV file with at least 5 comps. Required columns: source_name, source_url, price.
            </p>
            <div className="flex gap-3">
              <button onClick={handleImportCompsCSV} className="flex-1 btn-primary">
                Choose File
              </button>
              <button onClick={() => setShowImportModal(false)} className="flex-1 btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
