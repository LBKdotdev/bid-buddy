import { useState, useEffect } from 'react';
import { ArrowLeft, Wifi, WifiOff, Brain, Database, BarChart3, RotateCcw, Trash2, Check, Info, Activity, MapPin } from 'lucide-react';
import { getSettings, saveSettings, resetSettings, clearAllCaches, type AppSettings } from '../utils/settings';
import { getMonthlyStats, setMonthlyBudget } from '../utils/apifyUsage';

interface SettingsScreenProps {
  onBack: () => void;
}

export default function SettingsScreen({ onBack }: SettingsScreenProps) {
  const [settings, setSettings] = useState<AppSettings>(getSettings);
  const [saved, setSaved] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [apifyStats, setApifyStats] = useState(getMonthlyStats());

  const update = (partial: Partial<AppSettings>) => {
    const merged = saveSettings(partial);
    setSettings(merged);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleReset = () => {
    if (confirm('Reset all settings to defaults?')) {
      const defaults = resetSettings();
      setSettings(defaults);
    }
  };

  const handleClearCache = () => {
    const count = clearAllCaches();
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 2000);
  };

  return (
    <div className="min-h-screen bg-surface-900 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface-900/90 backdrop-blur-xl border-b border-surface-500/30">
        <div className="flex items-center gap-3 px-4 py-3 pt-12">
          <button onClick={onBack} className="p-2 -ml-2 text-zinc-400 active:text-white">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-lg font-semibold text-white flex-1">Settings</h1>
          {saved && (
            <span className="text-xs text-status-success flex items-center gap-1">
              <Check size={14} /> Saved
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-6">

        {/* Sync Mode */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Wifi size={16} className="text-electric" />
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Data Sync</h2>
          </div>
          <div className="card divide-y divide-surface-500/30">
            <div className="p-4">
              <label className="text-sm text-zinc-300 font-medium">Sync Mode</label>
              <p className="text-xs text-zinc-500 mt-0.5 mb-3">
                Direct mode bypasses Vercel proxy — useful for local dev
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => update({ syncMode: 'vercel' })}
                  className={`py-2.5 px-3 rounded-xl text-sm font-medium border transition-all ${
                    settings.syncMode === 'vercel'
                      ? 'bg-electric/10 border-electric/40 text-electric'
                      : 'bg-surface-700 border-surface-500/30 text-zinc-400'
                  }`}
                >
                  <Wifi size={14} className="inline mr-1.5" />
                  Vercel Proxy
                </button>
                <button
                  onClick={() => update({ syncMode: 'direct' })}
                  className={`py-2.5 px-3 rounded-xl text-sm font-medium border transition-all ${
                    settings.syncMode === 'direct'
                      ? 'bg-status-warning/10 border-status-warning/40 text-status-warning'
                      : 'bg-surface-700 border-surface-500/30 text-zinc-400'
                  }`}
                >
                  <WifiOff size={14} className="inline mr-1.5" />
                  Direct API
                </button>
              </div>
            </div>
            {settings.syncMode === 'direct' && (
              <div className="p-4">
                <label className="text-sm text-zinc-300 font-medium">NPA API URL</label>
                <input
                  type="url"
                  value={settings.npaApiUrl}
                  onChange={(e) => update({ npaApiUrl: e.target.value })}
                  className="mt-2 w-full bg-surface-700 border border-surface-500/30 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-electric/50"
                  placeholder="https://..."
                />
              </div>
            )}
          </div>
        </section>

        {/* AI Quality */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Brain size={16} className="text-purple-400" />
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">AI Estimates</h2>
          </div>
          <div className="card divide-y divide-surface-500/30">
            <div className="p-4">
              <label className="text-sm text-zinc-300 font-medium">Quality Level</label>
              <p className="text-xs text-zinc-500 mt-0.5 mb-3">
                Higher quality uses more tokens and retries
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(['fast', 'balanced', 'quality'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => update({ aiQuality: level })}
                    className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      settings.aiQuality === level
                        ? 'bg-purple-500/10 border-purple-500/40 text-purple-400'
                        : 'bg-surface-700 border-surface-500/30 text-zinc-400'
                    }`}
                  >
                    {level === 'fast' ? 'Fast' : level === 'balanced' ? 'Balanced' : 'Quality'}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <label className="text-sm text-zinc-300 font-medium">Max Bid %</label>
                <span className="text-sm text-electric font-mono">{settings.maxBidPercent}%</span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 mb-3">
                Suggested max bid as percent of AI mid estimate
              </p>
              <input
                type="range"
                min="50"
                max="90"
                step="5"
                value={settings.maxBidPercent}
                onChange={(e) => update({ maxBidPercent: parseInt(e.target.value) })}
                className="w-full accent-electric"
              />
              <div className="flex justify-between text-xs text-zinc-600 mt-1">
                <span>50%</span>
                <span>70%</span>
                <span>90%</span>
              </div>
            </div>
          </div>
        </section>

        {/* Comps */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={16} className="text-status-success" />
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Comps Lookup</h2>
          </div>
          <div className="card divide-y divide-surface-500/30">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <label className="text-sm text-zinc-300 font-medium">Cache Duration</label>
                <span className="text-sm text-status-success font-mono">{settings.compsCacheDuration}m</span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 mb-3">
                How long to keep comp results before refreshing
              </p>
              <input
                type="range"
                min="5"
                max="120"
                step="5"
                value={settings.compsCacheDuration}
                onChange={(e) => update({ compsCacheDuration: parseInt(e.target.value) })}
                className="w-full accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-zinc-600 mt-1">
                <span>5m</span>
                <span>60m</span>
                <span>120m</span>
              </div>
            </div>
            <div className="p-4">
              <label className="text-sm text-zinc-300 font-medium mb-3 block">Sources</label>
              {(['ebay', 'cycletrader', 'craigslist'] as const).map((source) => (
                <label key={source} className="flex items-center justify-between py-2">
                  <span className="text-sm text-zinc-400 capitalize">{source === 'ebay' ? 'eBay Sold' : source === 'cycletrader' ? 'CycleTrader' : 'Craigslist'}</span>
                  <button
                    onClick={() =>
                      update({
                        compsSources: {
                          ...settings.compsSources,
                          [source]: !settings.compsSources[source],
                        },
                      })
                    }
                    className={`w-11 h-6 rounded-full transition-all relative ${
                      settings.compsSources[source] ? 'bg-status-success' : 'bg-surface-500'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${
                        settings.compsSources[source] ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* Search Area */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={16} className="text-electric" />
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Search Area</h2>
          </div>
          <div className="card divide-y divide-surface-500/30">
            {/* Radius */}
            <div className="p-4">
              <div className="flex items-center justify-between">
                <label className="text-sm text-zinc-300 font-medium">Search Radius</label>
                <span className="text-sm text-electric font-mono">{settings.searchRadius} mi</span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 mb-3">
                How far to search for comps from your area
              </p>
              <input
                type="range"
                min="50"
                max="300"
                step="25"
                value={settings.searchRadius}
                onChange={(e) => update({ searchRadius: parseInt(e.target.value) })}
                className="w-full accent-electric"
              />
              <div className="flex justify-between text-xs text-zinc-600 mt-1">
                <span>50mi</span>
                <span>150mi</span>
                <span>300mi</span>
              </div>
            </div>

            {/* Results per source */}
            <div className="p-4">
              <div className="flex items-center justify-between">
                <label className="text-sm text-zinc-300 font-medium">Results per Source</label>
                <span className="text-sm text-electric font-mono">{settings.resultsPerSource}</span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 mb-3">
                Max listings to pull from each source
              </p>
              <input
                type="range"
                min="5"
                max="50"
                step="5"
                value={settings.resultsPerSource}
                onChange={(e) => update({ resultsPerSource: parseInt(e.target.value) })}
                className="w-full accent-electric"
              />
              <div className="flex justify-between text-xs text-zinc-600 mt-1">
                <span>5</span>
                <span>25</span>
                <span>50</span>
              </div>
            </div>

            {/* Regions */}
            <div className="p-4">
              <label className="text-sm text-zinc-300 font-medium mb-3 block">Regions</label>
              {([
                { key: 'socal', label: 'SoCal (OC, IE, SD)' },
                { key: 'norcal', label: 'NorCal (Bay, Sac)' },
                { key: 'phoenix', label: 'Phoenix / Tucson' },
                { key: 'vegas', label: 'Las Vegas' },
                { key: 'dallas', label: 'Dallas / Fort Worth' },
                { key: 'houston', label: 'Houston / Austin' },
                { key: 'orlando', label: 'Orlando / Tampa' },
              ] as const).map(({ key, label }) => (
                <label key={key} className="flex items-center justify-between py-2">
                  <span className="text-sm text-zinc-400">{label}</span>
                  <button
                    onClick={() => {
                      const current = settings.searchRegions || ['socal'];
                      const next = current.includes(key)
                        ? current.filter(r => r !== key)
                        : [...current, key];
                      // Must have at least one region
                      if (next.length > 0) update({ searchRegions: next });
                    }}
                    className={`w-11 h-6 rounded-full transition-all relative ${
                      (settings.searchRegions || ['socal']).includes(key) ? 'bg-electric' : 'bg-surface-500'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${
                        (settings.searchRegions || ['socal']).includes(key) ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </label>
              ))}
              <p className="text-xs text-zinc-600 mt-2">
                More regions = more results but higher Apify cost
              </p>
            </div>
          </div>
        </section>

        {/* Apify Usage Gauge */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} className="text-status-warning" />
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Apify Usage</h2>
          </div>
          <div className="card p-4 space-y-4">
            {/* Month label */}
            <div className="flex justify-between items-center">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">
                {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
              </span>
              <span className="text-xs text-zinc-500">{apifyStats.count} searches</span>
            </div>

            {/* Cost gauge */}
            <div>
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-2xl font-bold text-white tabular-nums">${apifyStats.estCost.toFixed(2)}</span>
                <span className="text-sm text-zinc-500">/ ${apifyStats.budget.toFixed(2)}</span>
              </div>
              <div className="w-full h-3 bg-surface-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    apifyStats.estCost / apifyStats.budget > 0.9
                      ? 'bg-status-danger'
                      : apifyStats.estCost / apifyStats.budget > 0.6
                      ? 'bg-status-warning'
                      : 'bg-status-success'
                  }`}
                  style={{ width: `${Math.min(100, (apifyStats.estCost / apifyStats.budget) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-zinc-600 mt-1">
                <span>$0</span>
                <span>${(apifyStats.budget / 2).toFixed(2)}</span>
                <span>${apifyStats.budget.toFixed(2)}</span>
              </div>
            </div>

            {/* Budget slider */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-zinc-300 font-medium">Monthly Budget</label>
                <span className="text-sm text-status-warning font-mono">${apifyStats.budget.toFixed(2)}</span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 mb-3">
                Display-only — warns you when approaching limit
              </p>
              <input
                type="range"
                min="1"
                max="25"
                step="1"
                value={apifyStats.budget}
                onChange={(e) => {
                  const newBudget = parseFloat(e.target.value);
                  setMonthlyBudget(newBudget);
                  setApifyStats({ ...apifyStats, budget: newBudget });
                }}
                className="w-full accent-amber-500"
              />
              <div className="flex justify-between text-xs text-zinc-600 mt-1">
                <span>$1</span>
                <span>$13</span>
                <span>$25</span>
              </div>
            </div>

            {/* Cost breakdown */}
            <div className="pt-2 border-t border-surface-500/30 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Craigslist (Apify)</span>
                <span className="text-zinc-400">~$0.03/search</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Facebook (Apify)</span>
                <span className="text-zinc-400">~$0.035/search</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">eBay</span>
                <span className="text-status-success">Free</span>
              </div>
            </div>
          </div>
        </section>

        {/* Data Management */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Database size={16} className="text-status-info" />
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Data</h2>
          </div>
          <div className="card divide-y divide-surface-500/30">
            <button
              onClick={handleClearCache}
              className="w-full flex items-center justify-between p-4 active:bg-surface-600 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Trash2 size={18} className="text-zinc-500" />
                <div className="text-left">
                  <div className="text-sm text-zinc-300">Clear Comps Cache</div>
                  {settings.lastCacheClear && (
                    <div className="text-xs text-zinc-600">
                      Last cleared: {new Date(settings.lastCacheClear).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
              {cacheCleared && <span className="text-xs text-status-success">Cleared!</span>}
            </button>
            <button
              onClick={handleReset}
              className="w-full flex items-center gap-3 p-4 active:bg-surface-600 transition-colors"
            >
              <RotateCcw size={18} className="text-status-danger" />
              <span className="text-sm text-status-danger">Reset All Settings</span>
            </button>
          </div>
        </section>

        {/* Stack Info */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Info size={16} className="text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Stack</h2>
          </div>
          <div className="card p-4 space-y-2">
            {[
              ['Frontend', 'React 18 + TypeScript + Vite'],
              ['Styling', 'Tailwind CSS 3'],
              ['Storage', 'IndexedDB (client-side)'],
              ['AI', 'Groq (LLaMA Scout)'],
              ['Comps', 'eBay + CycleTrader + Craigslist'],
              ['Proxy', 'Vercel Serverless Functions'],
              ['NPA API', 'GCP Cloud Run'],
              ['Deploy', 'Vercel'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-xs text-zinc-500">{label}</span>
                <span className="text-xs text-zinc-400 font-mono">{value}</span>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
