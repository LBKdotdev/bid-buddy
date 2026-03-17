import { useState, useEffect, useCallback } from 'react';
import BottomNav from './components/BottomNav';
import HomeScreen from './screens/HomeScreen';
import ShortlistScreen from './screens/ShortlistScreen';
import FloorScreen from './screens/FloorScreen';
import ScanScreen from './screens/ScanScreen';
import ItemDetailScreen from './screens/ItemDetailScreen';
import BuyFeeCalculatorScreen from './screens/BuyFeeCalculatorScreen';
import CompsScreen from './screens/CompsScreen';
import AllListingsScreen from './screens/AllListingsScreen';
import SettingsScreen from './screens/SettingsScreen';
import { initDB, getAllItems } from './utils/db';
import demoListings from './data/demoListings.json';

// Clear old comps cache versions on startup
function clearOldCompsCache() {
  try {
    const keys = Object.keys(localStorage);
    // Remove old cache versions (v1, v2, multi-source-comps-cache)
    const oldKeys = keys.filter(k =>
      k.startsWith('comps-v1') ||
      k.startsWith('comps-v2') ||
      k.startsWith('multi-source-comps-cache')
    );
    oldKeys.forEach(k => localStorage.removeItem(k));
    if (oldKeys.length > 0) {
      console.log('Cleared', oldKeys.length, 'old cache entries');
    }
  } catch (e) {
    // Ignore
  }
}

const STORAGE_KEY = 'lbk_listings';

function App() {
  const [currentTab, setCurrentTab] = useState('home');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showComps, setShowComps] = useState(false);
  const [showAllListings, setShowAllListings] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [totalItems, setTotalItems] = useState(0);
  const [shortlistCount, setShortlistCount] = useState(0);
  const [lastImportCount, setLastImportCount] = useState(0);
  const [lastImportTime, setLastImportTime] = useState('');

  const refreshCounts = useCallback(async () => {
    try {
      const items = await getAllItems();
      setTotalItems(items.length);
      setShortlistCount(
        items.filter(item => item.status === 'interested' || item.status === 'maybe').length
      );
    } catch (error) {
      console.error('Error refreshing counts:', error);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      // Clear old cache versions first
      clearOldCompsCache();

      await initDB();

      const storedCount = localStorage.getItem('lbk_lastImportCount');
      const storedTime = localStorage.getItem('lbk_lastImportTime');

      if (storedCount) {
        setLastImportCount(parseInt(storedCount, 10) || 0);
      }

      if (storedTime) {
        setLastImportTime(storedTime);
      }

      // Load counts from IndexedDB
      await refreshCounts();
    };

    init();
  }, [refreshCounts]);

  // Refresh counts when returning to home tab
  useEffect(() => {
    if (currentTab === 'home') {
      refreshCounts();
    }
  }, [currentTab, refreshCounts]);

  const handleItemClick = (id: string) => {
    setSelectedItemId(id);
  };

  const handleCloseDetail = () => {
    setSelectedItemId(null);
    // Refresh counts after closing detail (status may have changed)
    refreshCounts();
  };

  const handleImportSuccess = (importedItems: any[], count: number, timestamp: string) => {
    setTotalItems(importedItems.length);
    setLastImportCount(count);
    setLastImportTime(timestamp);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(importedItems));
    localStorage.setItem('lbk_lastImportCount', String(count));
    localStorage.setItem('lbk_lastImportTime', timestamp);

    // Refresh shortlist count from DB
    refreshCounts();
  };

  if (showSettings) {
    return <SettingsScreen onBack={() => setShowSettings(false)} />;
  }

  if (showComps) {
    return <CompsScreen onBack={() => setShowComps(false)} />;
  }

  if (showCalculator) {
    return <BuyFeeCalculatorScreen onBack={() => setShowCalculator(false)} />;
  }

  if (showAllListings) {
    return (
      <>
        <AllListingsScreen
          onBack={() => setShowAllListings(false)}
          onSelectItem={(id) => {
            setSelectedItemId(id);
          }}
        />
        {selectedItemId && (
          <ItemDetailScreen
            itemId={selectedItemId}
            onClose={() => {
              setSelectedItemId(null);
              refreshCounts();
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-surface-900">
        {currentTab === 'home' && (
          <HomeScreen
            onImportSuccess={handleImportSuccess}
            onOpenCalculator={() => setShowCalculator(true)}
            onOpenComps={() => setShowComps(true)}
            onOpenAllListings={() => setShowAllListings(true)}
            onOpenSettings={() => setShowSettings(true)}
            lastImportCount={lastImportCount}
            lastImportTime={lastImportTime}
            totalItems={totalItems}
            shortlistCount={shortlistCount}
          />
        )}
        {currentTab === 'shortlist' && <ShortlistScreen onItemClick={handleItemClick} />}
        {currentTab === 'floor' && <FloorScreen />}
        {currentTab === 'scan' && <ScanScreen onSelectItem={handleItemClick} />}
      </div>

      <BottomNav currentTab={currentTab} onTabChange={setCurrentTab} />

      {selectedItemId && (
        <ItemDetailScreen itemId={selectedItemId} onClose={handleCloseDetail} />
      )}
    </>
  );
}

export default App;
