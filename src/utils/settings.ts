const SETTINGS_KEY = 'lbk_settings';

export interface AppSettings {
  // API Configuration
  syncMode: 'supabase' | 'direct'; // direct bypasses Supabase edge function
  npaApiUrl: string;

  // AI Estimate Quality
  aiQuality: 'fast' | 'balanced' | 'quality';
  aiTemperature: number;

  // Comps
  compsCacheDuration: number; // minutes
  compsSources: {
    ebay: boolean;
    cycletrader: boolean;
    craigslist: boolean;
  };

  // Display
  defaultCategory: 'motorcycles' | 'atv_sxs' | 'rv_marine' | 'golf';
  maxBidPercent: number; // percent of AI mid estimate for suggested max bid

  // Data
  lastCacheClear: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  syncMode: 'supabase',
  npaApiUrl: 'https://playwright-reports-150462460430.us-west4.run.app/report/npauctions/inventory',

  aiQuality: 'balanced',
  aiTemperature: 0.2,

  compsCacheDuration: 30,
  compsSources: {
    ebay: true,
    cycletrader: true,
    craigslist: true,
  },

  defaultCategory: 'motorcycles',
  maxBidPercent: 75,

  lastCacheClear: '',
};

export function getSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const merged = { ...current, ...settings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  return merged;
}

export function resetSettings(): AppSettings {
  localStorage.removeItem(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS };
}

export function clearAllCaches(): number {
  let cleared = 0;
  const keys = Object.keys(localStorage);
  for (const key of keys) {
    if (key.startsWith('comps-v')) {
      localStorage.removeItem(key);
      cleared++;
    }
  }
  saveSettings({ lastCacheClear: new Date().toISOString() });
  return cleared;
}

export function getAiModelConfig(quality: AppSettings['aiQuality']) {
  switch (quality) {
    case 'fast':
      return { maxTokens: 300, temperature: 0.1, retries: 1 };
    case 'quality':
      return { maxTokens: 1000, temperature: 0.3, retries: 3 };
    case 'balanced':
    default:
      return { maxTokens: 600, temperature: 0.2, retries: 2 };
  }
}
