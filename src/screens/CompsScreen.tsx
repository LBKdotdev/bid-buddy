import { useState, useEffect } from 'react';
import { ArrowLeft, Search, Clock, Wifi, WifiOff, Sparkles, TrendingUp, RefreshCw, MapPin } from 'lucide-react';
import { searchCompsWithCache, clearCompsCache, type Comp, type MultiSourceResult } from '../services/multiSourceComps';
import { getAIEstimate, type EstimateResult } from '../services/aiEstimate';

interface CompsScreenProps {
  onBack: () => void;
}

type TabType = 'ebay' | 'estimate';

type SourceKey = 'ebay' | 'facebook' | 'craigslist';

const SOURCE_CONFIG: Record<SourceKey, { label: string; color: string; cost: string }> = {
  ebay: { label: 'eBay Sold', color: 'bg-status-info/20 text-status-info', cost: 'Free' },
  facebook: { label: 'FB Marketplace', color: 'bg-blue-500/20 text-blue-400', cost: '~$0.30' },
  craigslist: { label: 'Craigslist', color: 'bg-purple-500/20 text-purple-400', cost: '~$0.11' },
};

// Persist source toggles in localStorage
function loadSourceToggles(): Record<SourceKey, boolean> {
  try {
    const saved = localStorage.getItem('comps-source-toggles');
    if (saved) return JSON.parse(saved);
  } catch (_e) { /* ignore */ }
  return { ebay: true, facebook: false, craigslist: false };
}

function saveSourceToggles(toggles: Record<SourceKey, boolean>) {
  localStorage.setItem('comps-source-toggles', JSON.stringify(toggles));
}

export default function CompsScreen({ onBack }: CompsScreenProps) {
  const [activeTab, setActiveTab] = useState<TabType>('ebay');
  const [query, setQuery] = useState('');
  const [zip, setZip] = useState(() => localStorage.getItem('comps-zip') || '');
  const [sourcesToggles, setSourcesToggles] = useState<Record<SourceKey, boolean>>(loadSourceToggles);
  const [compsResult, setCompsResult] = useState<MultiSourceResult | null>(null);
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [usedCache, setUsedCache] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const toggleSource = (source: SourceKey) => {
    // Don't allow disabling all sources
    const updated = { ...sourcesToggles, [source]: !sourcesToggles[source] };
    if (!updated.ebay && !updated.facebook && !updated.craigslist) return;
    setSourcesToggles(updated);
    saveSourceToggles(updated);
  };

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setUsedCache(false);

    // Save zip for next time
    if (zip) localStorage.setItem('comps-zip', zip);

    if (activeTab === 'ebay') {
      try {
        const enabledSources = Object.entries(sourcesToggles)
          .filter(([, enabled]) => enabled)
          .map(([key]) => key) as SourceKey[];

        const result = await searchCompsWithCache(
          query.trim(),
          zip || undefined,
          300,
          enabledSources,
          false,
        );
        setCompsResult(result);
        setLastUpdated(result.lastUpdated);
        setUsedCache(result.fromCache);
        if (result.comps.length === 0) {
          setError('No comps found. Try a different search or enable more sources.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setCompsResult(null);
      }
    } else {
      // AI Estimate
      try {
        const parts = query.trim().split(/\s+/);
        let year: string | null = null;
        let make = '';
        let model = '';

        if (parts[0] && /^\d{4}$/.test(parts[0])) {
          year = parts[0];
          make = parts[1] || '';
          model = parts.slice(2).join(' ') || '';
        } else {
          make = parts[0] || '';
          model = parts.slice(1).join(' ') || '';
        }

        const result = await getAIEstimate(year, make, model);
        setEstimate(result);
        setLastUpdated('just now');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Estimate failed');
        setEstimate(null);
      }
    }

    setLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setCompsResult(null);
    setEstimate(null);
    setError(null);
  };

  const comps = compsResult?.comps || [];
  const avgPrice = comps.length > 0
    ? Math.round(comps.reduce((sum, c) => sum + c.price, 0) / comps.length)
    : null;

  // Estimated cost for this search
  const estimatedCost = (sourcesToggles.facebook ? 0.30 : 0) + (sourcesToggles.craigslist ? 0.11 : 0);

  // Active search sources text
  const activeSourceNames = Object.entries(sourcesToggles)
    .filter(([, enabled]) => enabled)
    .map(([key]) => SOURCE_CONFIG[key as SourceKey].label);

  return (
    <div className="min-h-screen bg-surface-900 pb-20">
      <div className="bg-surface-800 border-b border-surface-500/30">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center -ml-2 text-electric"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-lg font-semibold text-white">Comps Lookup</h1>
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => { clearCompsCache(); alert('Cache cleared!'); }}
              className="text-zinc-500 active:text-electric"
              title="Clear cache"
            >
              <RefreshCw size={18} />
            </button>
            {isOnline ? (
              <Wifi size={18} className="text-status-success" />
            ) : (
              <WifiOff size={18} className="text-zinc-500" />
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-4 pb-3 gap-2">
          <button
            onClick={() => handleTabChange('ebay')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl font-medium text-sm transition-colors ${
              activeTab === 'ebay'
                ? 'bg-electric text-surface-900'
                : 'bg-surface-600 text-zinc-400'
            }`}
          >
            <TrendingUp size={16} />
            Market Comps
          </button>
          <button
            onClick={() => handleTabChange('estimate')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl font-medium text-sm transition-colors ${
              activeTab === 'estimate'
                ? 'bg-electric text-surface-900'
                : 'bg-surface-600 text-zinc-400'
            }`}
          >
            <Sparkles size={16} />
            AI Estimate
          </button>
        </div>
      </div>

      <div className="p-4">
        {/* Search input */}
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={activeTab === 'ebay' ? 'Year Make Model (e.g. Kawasaki Teryx4)' : 'Year Make Model (e.g. 2019 Can-Am Spyder)'}
            className="input-field flex-1"
          />
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="btn-primary px-4 disabled:opacity-50"
          >
            {activeTab === 'ebay' ? <Search size={20} /> : <Sparkles size={20} />}
          </button>
        </div>

        {/* Zip code input (Market Comps only) */}
        {activeTab === 'ebay' && (
          <>
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={zip}
                  onChange={e => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  placeholder="Zip code (optional)"
                  className="input-field w-full pl-8 text-sm"
                  maxLength={5}
                />
              </div>
            </div>

            {/* Source toggles */}
            <div className="flex gap-2 mb-4">
              {(Object.keys(SOURCE_CONFIG) as SourceKey[]).map(key => (
                <button
                  key={key}
                  onClick={() => toggleSource(key)}
                  className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all border-2 ${
                    sourcesToggles[key]
                      ? 'bg-electric/20 text-electric border-electric'
                      : 'bg-surface-700 text-zinc-600 border-surface-600 opacity-50'
                  }`}
                >
                  <div>{sourcesToggles[key] ? '\u2713 ' : ''}{SOURCE_CONFIG[key].label}</div>
                  <div className="text-[10px] mt-0.5 opacity-70">
                    {SOURCE_CONFIG[key].cost}
                  </div>
                </button>
              ))}
            </div>

            {/* Cost indicator */}
            {estimatedCost > 0 && (
              <div className="text-xs text-zinc-600 text-center mb-3">
                Est. cost: ~${estimatedCost.toFixed(2)} per search (eBay is always free)
              </div>
            )}
          </>
        )}

        {loading && (
          <div className="text-center py-12">
            <div className="animate-pulse text-zinc-500">
              {activeTab === 'ebay'
                ? `Searching ${activeSourceNames.join(', ')}...`
                : 'Getting estimate...'}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-status-warning/10 text-status-warning rounded-xl p-4 mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Market Comps Results */}
        {activeTab === 'ebay' && comps.length > 0 && (
          <>
            <div className="card p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-zinc-500 text-sm">Avg. Price</div>
                  <div className="text-2xl font-bold text-status-success tabular-nums">
                    ${avgPrice?.toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-zinc-500 text-sm">{comps.length} comps</div>
                  {lastUpdated && (
                    <div className="flex items-center gap-1 text-xs text-zinc-500 mt-1">
                      <Clock size={12} />
                      {usedCache ? 'Cached' : 'Updated'} {lastUpdated}
                    </div>
                  )}
                </div>
              </div>
              {/* Source breakdown */}
              {compsResult?.sources && (
                <div className="flex flex-wrap gap-1 pt-2 border-t border-surface-500/30">
                  {compsResult.sources.ebay > 0 && (
                    <span className="text-xs bg-status-info/20 text-status-info px-2 py-0.5 rounded">
                      eBay Sold: {compsResult.sources.ebay}
                    </span>
                  )}
                  {compsResult.sources.facebook > 0 && (
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                      FB Marketplace: {compsResult.sources.facebook}
                    </span>
                  )}
                  {compsResult.sources.craigslist > 0 && (
                    <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">
                      Craigslist: {compsResult.sources.craigslist}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              {comps.map((comp, index) => (
                <a
                  key={index}
                  href={comp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card-interactive block p-3"
                >
                  <div className="flex gap-3">
                    {comp.imageUrl && (
                      <img
                        src={comp.imageUrl}
                        alt={comp.title}
                        className="w-16 h-16 object-cover rounded-lg"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white line-clamp-2">
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
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {comp.date}{comp.location ? ` \u2022 ${comp.location}` : ''}
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </>
        )}

        {/* AI Estimate Results */}
        {activeTab === 'estimate' && estimate && (
          <div className="space-y-4">
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={18} className="text-electric" />
                <span className="font-semibold text-white">Private Party Estimate</span>
                <span className="ml-auto text-xs text-zinc-500 bg-surface-600 px-2 py-0.5 rounded">
                  {estimate.source === 'heuristic' ? 'Estimated' : 'AI'}
                </span>
              </div>

              <div className="text-sm text-zinc-500 mb-4">{estimate.vehicle}</div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-surface-600 rounded-xl p-3 text-center">
                  <div className="text-xs text-zinc-500 mb-1">Low</div>
                  <div className="text-lg font-bold text-status-success tabular-nums">
                    ${estimate.estimate.low.toLocaleString()}
                  </div>
                </div>
                <div className="bg-electric/10 rounded-xl p-3 text-center">
                  <div className="text-xs text-electric mb-1">Fair Price</div>
                  <div className="text-xl font-bold text-electric tabular-nums">
                    ${estimate.estimate.mid.toLocaleString()}
                  </div>
                </div>
                <div className="bg-surface-600 rounded-xl p-3 text-center">
                  <div className="text-xs text-zinc-500 mb-1">High</div>
                  <div className="text-lg font-bold text-status-warning tabular-nums">
                    ${estimate.estimate.high.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="text-sm text-zinc-400 mb-3">
                {estimate.estimate.notes}
              </div>

              <div className="flex flex-wrap gap-2">
                {estimate.estimate.factors.map((factor, i) => (
                  <span
                    key={i}
                    className="text-xs bg-surface-600 text-zinc-400 px-2 py-1 rounded"
                  >
                    {factor}
                  </span>
                ))}
              </div>

              <div className="mt-4 pt-3 border-t border-surface-500/30 flex items-center justify-between text-xs text-zinc-500">
                <span>Confidence: {estimate.estimate.confidence}</span>
                <span>{lastUpdated}</span>
              </div>
            </div>

            <div className="text-center text-xs text-zinc-600">
              Estimates are based on market data and may vary by location
            </div>
          </div>
        )}

        {/* Empty States */}
        {!loading && activeTab === 'ebay' && comps.length === 0 && !error && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3 opacity-50">&#128269;</div>
            <div className="text-zinc-400 mb-2">
              Search eBay Sold, FB Marketplace & Craigslist
            </div>
            <div className="text-xs text-zinc-600">
              Example: "Kawasaki Teryx4" or "2019 Can-Am Spyder RT"
            </div>
          </div>
        )}

        {!loading && activeTab === 'estimate' && !estimate && !error && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3 opacity-50">&#10024;</div>
            <div className="text-zinc-400 mb-2">
              Get an AI-powered price estimate
            </div>
            <div className="text-xs text-zinc-600">
              Enter Year Make Model (e.g. "2019 Can-Am Spyder RT")
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
