import { useState, useEffect } from 'react';
import { ArrowLeft, Wifi, WifiOff, Brain, Database, BarChart3, RotateCcw, Trash2, Check, Info } from 'lucide-react';
import { getSettings, saveSettings, resetSettings, clearAllCaches, type AppSettings } from '../utils/settings';

interface SettingsScreenProps {
  onBack: () => void;
}

export default function SettingsScreen({ onBack }: SettingsScreenProps) {
  const [settings, setSettings] = useState<AppSettings>(getSettings);
  const [saved, setSaved] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);

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
                Direct mode bypasses Supabase — useful if the edge function is paused
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => update({ syncMode: 'supabase' })}
                  className={`py-2.5 px-3 rounded-xl text-sm font-medium border transition-all ${
                    settings.syncMode === 'supabase'
                      ? 'bg-electric/10 border-electric/40 text-electric'
                      : 'bg-surface-700 border-surface-500/30 text-zinc-400'
                  }`}
                >
                  <Wifi size={14} className="inline mr-1.5" />
                  Supabase Proxy
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

        {/* Data Management */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Database size={16} className="text-status-info" />
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Data</h2>
          </div>
          <div className="card divide-y divide-surface-500/30">
            <div className="p-4">
              <label className="text-sm text-zinc-300 font-medium">Default Category</label>
              <div className="grid grid-cols-2 gap-2 mt-3">
                {([
                  { id: 'motorcycles', label: 'Motorcycles' },
                  { id: 'atv_sxs', label: 'ATV / SxS' },
                  { id: 'rv_marine', label: 'RV / Marine' },
                  { id: 'golf', label: 'Golf' },
                ] as const).map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => update({ defaultCategory: cat.id })}
                    className={`py-2 rounded-xl text-sm font-medium border transition-all ${
                      settings.defaultCategory === cat.id
                        ? 'bg-status-info/10 border-status-info/40 text-status-info'
                        : 'bg-surface-700 border-surface-500/30 text-zinc-400'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
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
              ['Proxy', 'Supabase Edge Functions'],
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
