import { useState, useRef, useEffect } from 'react';
import { Search, ExternalLink, ChevronRight, Check, Camera } from 'lucide-react';
import type { InventoryItem, Status } from '../types/inventory';
import { getAllItems, saveItem, deleteItem } from '../utils/db';
import { getBuyFee, getTotalDue } from '../utils/buyFee';
import { generateBuddyTag } from '../utils/buddyTag';

export default function FloorScreen() {
  const [searchInput, setSearchInput] = useState('');
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [matchingItems, setMatchingItems] = useState<InventoryItem[]>([]);
  const [allResults, setAllResults] = useState<InventoryItem[]>([]); // Full result list for navigation
  const [currentIndex, setCurrentIndex] = useState(0); // Current position in results
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [decided, setDecided] = useState<Status | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = async () => {
    if (!searchInput.trim()) return;

    setLoading(true);
    setNotFound(false);
    setItem(null);
    setMatchingItems([]);
    setDecided(null); // Reset decision state for new search

    try {
      const allItems = await getAllItems();
      const query = searchInput.trim().toLowerCase();

      const exactMatch = allItems.find(i =>
        i.itemNumber === searchInput.trim() ||
        (i.buddyTag && i.buddyTag.toLowerCase() === query)
      );

      if (exactMatch) {
        setItem(exactMatch);
        setAllResults([exactMatch]);
        setCurrentIndex(0);
      } else {
        const matches = allItems.filter(i => {
          const title = (i.title || '').toLowerCase();
          const make = (i.make || '').toLowerCase();
          const model = (i.model || '').toLowerCase();
          const vin = (i.vin || '').toLowerCase();
          const year = i.year ? i.year.toString() : '';
          const note = (i.note || '').toLowerCase();

          return title.includes(query) ||
            make.includes(query) ||
            model.includes(query) ||
            vin.includes(query) ||
            year.includes(query) ||
            note.includes(query);
        });

        if (matches.length === 1) {
          setItem(matches[0]);
          setAllResults(matches);
          setCurrentIndex(0);
        } else if (matches.length > 1) {
          setAllResults(matches); // Store all for navigation
          setMatchingItems(matches.slice(0, 20)); // Show first 20 for selection
        } else {
          setNotFound(true);
        }
      }
    } catch (error) {
      console.error('Search error:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectItem = (selectedItem: InventoryItem, index?: number) => {
    setItem(selectedItem);
    setMatchingItems([]);
    setDecided(null);
    // Track position in the full results list
    if (index !== undefined) {
      setCurrentIndex(index);
    } else {
      const idx = allResults.findIndex(i => i.id === selectedItem.id);
      setCurrentIndex(idx >= 0 ? idx : 0);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleStatusChange = async (status: Status) => {
    if (!item) return;

    try {
      let buddyTag = item.buddyTag;
      if ((status === 'interested' || status === 'maybe') && !buddyTag) {
        buddyTag = generateBuddyTag();
      }

      const updated = { ...item, status, buddyTag, updatedAt: Date.now() };
      await saveItem(updated);
      setItem(updated);
      setDecided(status); // Show decision confirmation
    } catch (error) {
      console.error('Status update error:', error);
    }
  };

  const handleNext = () => {
    const nextIndex = currentIndex + 1;

    // If there are more items in the results, go to the next one
    if (nextIndex < allResults.length) {
      setItem(allResults[nextIndex]);
      setCurrentIndex(nextIndex);
      setDecided(null);
    } else {
      // No more items - go back to search
      setItem(null);
      setMatchingItems([]);
      setAllResults([]);
      setCurrentIndex(0);
      setSearchInput('');
      setNotFound(false);
      setDecided(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleDelete = async () => {
    if (!item || !confirm('Remove this item?')) return;

    try {
      await deleteItem(item.id);
      setItem(null);
      setSearchInput('');
      inputRef.current?.focus();
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const handleClear = () => {
    setItem(null);
    setMatchingItems([]);
    setSearchInput('');
    setNotFound(false);
    setDecided(null);
    inputRef.current?.focus();
  };

  const getStatusStyle = (status: Status) => {
    switch (status) {
      case 'interested':
        return { bg: 'bg-status-success', text: 'Interested' };
      case 'maybe':
        return { bg: 'bg-status-warning', text: 'Maybe' };
      case 'pass':
        return { bg: 'bg-status-danger', text: 'Pass' };
      default:
        return { bg: 'bg-zinc-600', text: 'Unreviewed' };
    }
  };

  const buyFee = item?.maxBid ? getBuyFee(item.maxBid) : null;
  const totalDue = item?.maxBid ? getTotalDue(item.maxBid) : null;

  return (
    <div className="min-h-screen bg-surface-900 pb-24">
      {/* Header */}
      <div className="px-6 pt-14 pb-6">
        <h1 className="text-3xl font-bold text-white tracking-tight">Floor Mode</h1>
        <p className="text-zinc-500 text-sm mt-1">Quick lookup for live bidding</p>
      </div>

      {/* Search */}
      <div className="px-6 pb-6">
        <div className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            placeholder="Item # or Buddy Tag"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1 bg-surface-700 border border-surface-500/60 rounded-xl py-4 px-5 text-xl font-semibold text-white placeholder-zinc-600 focus:outline-none focus:border-electric/50 focus:ring-2 focus:ring-electric/20"
          />
          <button
            onClick={handleSearch}
            disabled={loading || !searchInput.trim()}
            className="btn-primary px-6 disabled:opacity-50"
          >
            <Search size={22} />
          </button>
        </div>
      </div>

      <div className="px-4">
        {loading && (
          <div className="text-center py-16 text-zinc-500">Searching...</div>
        )}

        {notFound && (
          <div className="card p-8 text-center">
            <div className="text-status-danger font-semibold text-lg">Not Found</div>
            <div className="text-zinc-500 text-sm mt-2">
              No item matches "{searchInput}"
            </div>
            <button
              onClick={handleClear}
              className="mt-6 text-electric font-medium"
            >
              Clear
            </button>
          </div>
        )}

        {matchingItems.length > 0 && (
          <div className="space-y-3">
            <div className="text-zinc-500 text-sm px-2 mb-4">
              {allResults.length} matches found
            </div>
            {matchingItems.map((matchItem, idx) => (
              <button
                key={matchItem.id}
                onClick={() => handleSelectItem(matchItem, idx)}
                className="card-interactive w-full text-left p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-electric font-bold">#{matchItem.itemNumber}</span>
                      {matchItem.buddyTag && (
                        <span className="text-xs bg-surface-600 text-zinc-500 px-2 py-0.5 rounded font-medium">
                          {matchItem.buddyTag}
                        </span>
                      )}
                    </div>
                    <div className="text-white font-medium text-sm mt-1 truncate">
                      {matchItem.title}
                    </div>
                    <div className="flex gap-2 mt-2">
                      {matchItem.cachedComps && (
                        <span className="text-electric font-medium text-sm">
                          Comps: ${matchItem.cachedComps.avgPrice.toLocaleString()}
                        </span>
                      )}
                      {matchItem.maxBid && (
                        <span className="text-status-success font-semibold text-sm">
                          Max: ${matchItem.maxBid.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  {matchItem.photoUrl && (
                    <img
                      src={matchItem.photoUrl}
                      alt=""
                      className="w-14 h-14 object-cover rounded-lg"
                    />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {item && (
          <div className="space-y-4">
            {/* Position indicator */}
            {allResults.length > 1 && (
              <div className="text-center text-sm text-zinc-500">
                Item {currentIndex + 1} of {allResults.length}
              </div>
            )}
            <div className="card overflow-hidden">
              <div className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-electric font-bold text-3xl tabular-nums">#{item.itemNumber}</span>
                      {item.buddyTag && (
                        <span className="text-sm bg-surface-600 text-zinc-400 px-3 py-1 rounded-lg font-semibold">
                          {item.buddyTag}
                        </span>
                      )}
                    </div>
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ${getStatusStyle(item.status).bg} text-white text-sm font-medium`}>
                      {getStatusStyle(item.status).text}
                    </div>
                  </div>
                  {item.photoUrl && (
                    <img
                      src={item.photoUrl}
                      alt={item.title}
                      className="w-20 h-20 object-cover rounded-xl"
                    />
                  )}
                </div>

                <h2 className="text-lg font-semibold text-white mt-5 mb-5">
                  {item.title}
                </h2>

                {/* Market Comps */}
                {item.cachedComps && (
                  <div className="bg-electric/10 border border-electric/30 rounded-xl p-4 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-electric/80 text-xs font-medium uppercase tracking-wider">Market Comps ({item.cachedComps.count})</span>
                      <span className="text-electric font-bold text-2xl tabular-nums">
                        ${item.cachedComps.avgPrice.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs text-electric/60 mt-1">
                      Range: ${item.cachedComps.lowPrice.toLocaleString()} – ${item.cachedComps.highPrice.toLocaleString()}
                    </div>
                  </div>
                )}

                {/* AI Estimated Value (fallback if no comps) */}
                {!item.cachedComps && item.cachedEstimate && (
                  <div className="bg-status-info/10 border border-status-info/30 rounded-xl p-4 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-status-info/80 text-xs font-medium uppercase tracking-wider">Est. Value</span>
                      <span className="text-status-info font-bold text-xl tabular-nums">
                        ${item.cachedEstimate.mid.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs text-status-info/60 mt-1">
                      Range: ${item.cachedEstimate.low.toLocaleString()} – ${item.cachedEstimate.high.toLocaleString()}
                    </div>
                  </div>
                )}

                {/* Bid Info */}
                {item.maxBid !== null && (
                  <div className="bg-surface-600 rounded-xl p-4 mb-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Max Bid</div>
                        <div className="text-status-success font-bold text-2xl tabular-nums">
                          ${item.maxBid.toLocaleString()}
                        </div>
                      </div>
                      {buyFee !== null && (
                        <div>
                          <div className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Buy Fee</div>
                          <div className="text-white font-bold text-2xl tabular-nums">
                            ${buyFee.toLocaleString()}
                          </div>
                        </div>
                      )}
                      {totalDue !== null && (
                        <div>
                          <div className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Total</div>
                          <div className="text-electric font-bold text-2xl tabular-nums">
                            ${totalDue.toLocaleString()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Details */}
                <div className="space-y-2 text-sm">
                  {item.docs && (
                    <div className="flex justify-between py-2 border-b border-surface-500/30">
                      <span className="text-zinc-500">Docs</span>
                      <span className="text-status-success font-medium">{item.docs}</span>
                    </div>
                  )}
                  {item.crScore !== null && (
                    <div className="flex justify-between py-2 border-b border-surface-500/30">
                      <span className="text-zinc-500">CR Score</span>
                      <span className="text-white font-medium">{item.crScore}</span>
                    </div>
                  )}
                  {item.milesHours && (
                    <div className="flex justify-between py-2 border-b border-surface-500/30">
                      <span className="text-zinc-500">Miles/Hours</span>
                      <span className="text-white">{item.milesHours}</span>
                    </div>
                  )}
                  {item.note && (
                    <div className="pt-3">
                      <span className="text-zinc-500">Note: </span>
                      <span className="text-zinc-300">{item.note}</span>
                    </div>
                  )}
                </div>

                {item.sourceUrl && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-flex items-center gap-2 text-electric text-sm font-medium"
                  >
                    <ExternalLink size={14} />
                    View Source
                  </a>
                )}
              </div>

              {/* Status buttons */}
              {!decided ? (
                <div className="grid grid-cols-3 border-t border-surface-500/30">
                  <button
                    onClick={() => handleStatusChange('interested')}
                    className={`py-5 text-sm font-semibold transition-colors ${
                      item.status === 'interested'
                        ? 'bg-status-success/10 text-status-success'
                        : 'text-zinc-400 active:bg-status-success/10'
                    }`}
                  >
                    Interested
                  </button>
                  <button
                    onClick={() => handleStatusChange('maybe')}
                    className={`py-5 text-sm font-semibold transition-colors border-l border-surface-500/30 ${
                      item.status === 'maybe'
                        ? 'bg-status-warning/10 text-status-warning'
                        : 'text-zinc-400 active:bg-status-warning/10'
                    }`}
                  >
                    Maybe
                  </button>
                  <button
                    onClick={() => handleStatusChange('pass')}
                    className={`py-5 text-sm font-semibold transition-colors border-l border-surface-500/30 ${
                      item.status === 'pass'
                        ? 'bg-status-danger/10 text-status-danger'
                        : 'text-zinc-400 active:bg-status-danger/10'
                    }`}
                  >
                    Pass
                  </button>
                </div>
              ) : (
                /* Decision made - show confirmation + Next button */
                <div className="border-t border-surface-500/30">
                  <div className={`flex items-center justify-center gap-2 py-3 text-sm font-medium ${
                    decided === 'interested' ? 'bg-status-success/10 text-status-success' :
                    decided === 'maybe' ? 'bg-status-warning/10 text-status-warning' :
                    'bg-status-danger/10 text-status-danger'
                  }`}>
                    <Check size={16} />
                    Marked as {decided.charAt(0).toUpperCase() + decided.slice(1)}
                  </div>
                  <button
                    onClick={handleNext}
                    className="w-full py-5 bg-electric text-surface-900 font-bold text-lg flex items-center justify-center gap-2 active:opacity-80"
                  >
                    {currentIndex + 1 < allResults.length ? (
                      <>
                        Next Item
                        <span className="text-sm font-medium opacity-70">
                          ({currentIndex + 2} of {allResults.length})
                        </span>
                        <ChevronRight size={22} />
                      </>
                    ) : (
                      <>
                        Done
                        <ChevronRight size={22} />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {!decided && (
              <button
                onClick={handleClear}
                className="w-full btn-secondary"
              >
                Search Another Item
              </button>
            )}
          </div>
        )}

        {!loading && !notFound && !item && matchingItems.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-6 opacity-50">⚡</div>
            <div className="text-zinc-400 font-medium">
              Enter an item number or buddy tag
            </div>
            <div className="text-zinc-600 text-sm mt-2">
              Quick lookups for live auction bidding
            </div>
            <div className="mt-6 flex items-center justify-center gap-2 text-zinc-500 text-sm">
              <Camera size={16} />
              <span>Or use <span className="text-electric">Scan</span> tab to photograph tag</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
