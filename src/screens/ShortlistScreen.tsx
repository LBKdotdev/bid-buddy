import { useState, useEffect, useRef } from 'react';
import { Search, ChevronRight, RefreshCw, Loader2 } from 'lucide-react';
import type { InventoryItem, Status, CachedComps, CachedEstimate } from '../types/inventory';
import { getAllItems, saveItem, deleteItem } from '../utils/db';
import { generateBuddyTag } from '../utils/buddyTag';
import { searchCompsWithCache } from '../services/multiSourceComps';
import { getAIEstimate } from '../services/aiEstimate';

interface ShortlistScreenProps {
  onItemClick: (id: string) => void;
}

export default function ShortlistScreen({ onItemClick }: ShortlistScreenProps) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<InventoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [prefetching, setPrefetching] = useState(false);
  const [prefetchProgress, setPrefetchProgress] = useState({ done: 0, total: 0 });
  const [swipingItem, setSwipingItem] = useState<string | null>(null);
  const touchStartX = useRef<number>(0);
  const touchCurrentX = useRef<number>(0);

  useEffect(() => {
    loadItems();
  }, []);

  useEffect(() => {
    filterItems();
  }, [items, searchQuery]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const allItems = await getAllItems();
      const shortlist = allItems.filter(
        item => item.status === 'interested' || item.status === 'maybe'
      );
      setItems(shortlist);
    } catch (error) {
      console.error('Load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterItems = () => {
    let filtered = [...items];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        item =>
          item.itemNumber.toLowerCase().includes(query) ||
          item.title.toLowerCase().includes(query) ||
          item.make.toLowerCase().includes(query) ||
          item.model.toLowerCase().includes(query) ||
          (item.year && item.year.toString().includes(query)) ||
          (item.buddyTag && item.buddyTag.toLowerCase().includes(query))
      );
    }

    filtered.sort((a, b) => {
      if (a.status === 'interested' && b.status !== 'interested') return -1;
      if (a.status !== 'interested' && b.status === 'interested') return 1;
      return b.updatedAt - a.updatedAt;
    });

    setFilteredItems(filtered);
  };

  const handleStatusChange = async (id: string, status: Status) => {
    try {
      const item = items.find(i => i.id === id);
      if (!item) return;

      let buddyTag = item.buddyTag;
      if ((status === 'interested' || status === 'maybe') && !buddyTag) {
        buddyTag = generateBuddyTag();
      }

      const updated = { ...item, status, buddyTag, updatedAt: Date.now() };
      await saveItem(updated);

      if (status === 'interested' || status === 'maybe') {
        setItems(prev => prev.map(i => (i.id === id ? updated : i)));
      } else {
        setItems(prev => prev.filter(i => i.id !== id));
      }
    } catch (error) {
      console.error('Status update error:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Remove this item?')) {
      try {
        await deleteItem(id);
        setItems(prev => prev.filter(i => i.id !== id));
      } catch (error) {
        console.error('Delete error:', error);
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    const startX = e.touches[0].clientX;
    touchStartX.current = startX;
    touchCurrentX.current = startX; // Initialize to same value so no movement = 0 diff
    setSwipingItem(id);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (swipingItem) {
      touchCurrentX.current = e.touches[0].clientX;
    }
  };

  const handleTouchEnd = (id: string, currentStatus: Status) => {
    // Only process if we have a valid start position
    if (touchStartX.current === 0 || swipingItem !== id) {
      setSwipingItem(null);
      touchStartX.current = 0;
      touchCurrentX.current = 0;
      return;
    }

    const diff = touchCurrentX.current - touchStartX.current;
    const threshold = 100;

    // Only trigger if there was significant horizontal movement
    if (Math.abs(diff) > threshold) {
      if (diff > threshold && currentStatus === 'maybe') {
        handleStatusChange(id, 'interested');
      } else if (diff < -threshold && currentStatus === 'interested') {
        handleStatusChange(id, 'maybe');
      }
    }

    setSwipingItem(null);
    touchStartX.current = 0;
    touchCurrentX.current = 0;
  };

  const interestedCount = items.filter(i => i.status === 'interested').length;
  const maybeCount = items.filter(i => i.status === 'maybe').length;

  const handlePrefetchAll = async (forceRefresh: boolean = false) => {
    // If force refresh, fetch all items. Otherwise only items without cached comps.
    const itemsToFetch = forceRefresh
      ? items
      : items.filter(item => !item.cachedComps);

    if (itemsToFetch.length === 0) {
      alert('All items already have cached comps! Use long-press to force refresh.');
      return;
    }

    setPrefetching(true);
    setPrefetchProgress({ done: 0, total: itemsToFetch.length });

    let successCount = 0;
    for (let i = 0; i < itemsToFetch.length; i++) {
      const item = itemsToFetch[i];
      try {
        // Use make + model only for broad search (filter for variants on client)
        const query = [item.make, item.model].filter(Boolean).join(' ');
        console.log('Prefetching comps for:', query);
        const result = await searchCompsWithCache(query, forceRefresh);

        // Filter comps to match specific model variant (e.g., Ryker 600 vs 900)
        const modelNumbers = item.model.match(/\d{3,4}/g) || [];
        const filteredComps = modelNumbers.length > 0
          ? result.comps.filter(comp => {
              const compNumbers = comp.title.match(/\d{3,4}/gi) || [];
              return compNumbers.length === 0 || modelNumbers.some(num => compNumbers.includes(num));
            })
          : result.comps;

        if (filteredComps.length > 0) {
          const prices = filteredComps.map(c => c.price);
          const cachedComps: CachedComps = {
            avgPrice: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
            lowPrice: Math.min(...prices),
            highPrice: Math.max(...prices),
            count: filteredComps.length,
            sources: Object.entries(result.sources)
              .filter(([_, count]) => count > 0)
              .map(([source]) => source),
            fetchedAt: Date.now(),
          };

          const updated = { ...item, cachedComps };
          await saveItem(updated);
          setItems(prev => prev.map(i => i.id === item.id ? updated : i));
          successCount++;
        } else if (!item.cachedEstimate) {
          // No comps found - fetch AI estimate as fallback
          console.log('No comps for', item.id, '- fetching AI estimate');
          try {
            const year = item.year?.toString() || null;
            const mileage = item.milesHours || null;
            const aiResult = await getAIEstimate(year, item.make, item.model, mileage);

            const cachedEstimate: CachedEstimate = {
              low: aiResult.estimate.low,
              mid: aiResult.estimate.mid,
              high: aiResult.estimate.high,
              confidence: aiResult.estimate.confidence,
              source: aiResult.source as 'gemini' | 'heuristic',
              fetchedAt: Date.now(),
            };

            const updated = { ...item, cachedEstimate };
            await saveItem(updated);
            setItems(prev => prev.map(i => i.id === item.id ? updated : i));
            successCount++;
          } catch (aiErr) {
            console.error('AI estimate fallback failed:', aiErr);
          }
        }
      } catch (e) {
        console.error('Prefetch failed for', item.id, e);
      }
      setPrefetchProgress({ done: i + 1, total: itemsToFetch.length });
    }

    setPrefetching(false);
    console.log(`Prefetch complete: ${successCount}/${itemsToFetch.length} items got comps`);
  };

  return (
    <div className="min-h-screen bg-surface-900 pb-24">
      {/* Header */}
      <div className="px-6 pt-14 pb-6">
        <h1 className="text-3xl font-bold text-white tracking-tight">Shortlist</h1>
        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-4 text-sm">
            <span className="text-status-success font-medium">{interestedCount} Interested</span>
            <span className="text-status-warning font-medium">{maybeCount} Maybe</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handlePrefetchAll(false)}
              disabled={prefetching || items.length === 0}
              className="flex items-center gap-2 text-xs font-medium text-electric disabled:opacity-50 disabled:text-zinc-500"
            >
              {prefetching ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>{prefetchProgress.done}/{prefetchProgress.total}</span>
                </>
              ) : (
                <>
                  <RefreshCw size={14} />
                  <span>Fetch</span>
                </>
              )}
            </button>
            <button
              onClick={() => handlePrefetchAll(true)}
              disabled={prefetching || items.length === 0}
              className="flex items-center gap-1 text-xs font-medium text-status-warning disabled:opacity-50 disabled:text-zinc-500"
              title="Force refresh all comps"
            >
              <span>Refresh All</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 pb-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="input-field pl-11"
          />
        </div>
      </div>

      {/* List */}
      <div className="px-4">
        {loading ? (
          <div className="text-center text-zinc-500 py-16">Loading...</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-zinc-500">
              {searchQuery ? 'No items match your search' : 'No items in shortlist'}
            </div>
            <div className="text-zinc-600 text-sm mt-2">
              Mark items as Interested from the listings
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map(item => (
              <div
                key={item.id}
                className="card-interactive overflow-hidden"
                onTouchStart={e => handleTouchStart(e, item.id)}
                onTouchMove={handleTouchMove}
                onTouchEnd={() => handleTouchEnd(item.id, item.status)}
              >
                <div
                  onClick={() => onItemClick(item.id)}
                  className="flex items-center gap-4 p-4"
                >
                  {item.photoUrl ? (
                    <img
                      src={item.photoUrl}
                      alt={item.title}
                      className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-surface-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-2xl">🏍️</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-electric font-bold">#{item.itemNumber}</span>
                      {item.buddyTag && (
                        <span className="text-xs font-medium text-zinc-500 bg-surface-600 px-2 py-0.5 rounded">
                          {item.buddyTag}
                        </span>
                      )}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ml-auto ${
                        item.status === 'interested'
                          ? 'bg-status-success/20 text-status-success'
                          : 'bg-status-warning/20 text-status-warning'
                      }`}>
                        {item.status === 'interested' ? 'Interested' : 'Maybe'}
                      </span>
                    </div>
                    <div className="font-medium text-white text-sm truncate">
                      {item.year} {item.make} {item.model}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {item.cachedComps && (
                        <span className="text-xs bg-electric/10 text-electric px-2 py-0.5 rounded font-medium">
                          Comps: ${item.cachedComps.avgPrice.toLocaleString()}
                        </span>
                      )}
                      {item.cachedEstimate && !item.cachedComps && (
                        <span className="text-xs bg-status-info/10 text-status-info px-2 py-0.5 rounded font-medium">
                          Est: ${item.cachedEstimate.mid.toLocaleString()}
                        </span>
                      )}
                      {item.maxBid && (
                        <span className="text-xs bg-status-success/10 text-status-success px-2 py-0.5 rounded font-medium">
                          Max: ${item.maxBid.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-zinc-600 flex-shrink-0" />
                </div>

                {/* Action buttons */}
                <div className="flex border-t border-surface-500/30">
                  <button
                    onClick={() => handleStatusChange(item.id, 'interested')}
                    className={`flex-1 py-3 text-xs font-medium transition-colors ${
                      item.status === 'interested'
                        ? 'bg-status-success/10 text-status-success'
                        : 'text-zinc-500'
                    }`}
                  >
                    Interested
                  </button>
                  <div className="w-px bg-surface-500/30" />
                  <button
                    onClick={() => handleStatusChange(item.id, 'maybe')}
                    className={`flex-1 py-3 text-xs font-medium transition-colors ${
                      item.status === 'maybe'
                        ? 'bg-status-warning/10 text-status-warning'
                        : 'text-zinc-500'
                    }`}
                  >
                    Maybe
                  </button>
                  <div className="w-px bg-surface-500/30" />
                  <button
                    onClick={() => handleStatusChange(item.id, 'pass')}
                    className="flex-1 py-3 text-xs font-medium text-zinc-500"
                  >
                    Pass
                  </button>
                  <div className="w-px bg-surface-500/30" />
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="px-4 py-3 text-xs font-medium text-status-danger"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {filteredItems.length > 0 && (
          <div className="text-center text-xs text-zinc-600 mt-6 mb-4">
            Swipe right to promote, left to demote
          </div>
        )}
      </div>
    </div>
  );
}
