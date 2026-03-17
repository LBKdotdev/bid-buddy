import { useState, useRef } from 'react';
import { RefreshCw, Calculator, Search, Upload, Download, FileUp, Trash2, ChevronRight, List, FileText, Settings } from 'lucide-react';
import type { Category, InventoryItem } from '../types/inventory';
import { parseCSV, csvRowToInventoryItem } from '../utils/csv';
import { parsePDF, parseCatalogPDF } from '../utils/pdfParser';
import { saveItems, getItemsByCategory, getItem, deleteItemsByCategory } from '../utils/db';
import { getSettings } from '../utils/settings';

interface HomeScreenProps {
  onImportSuccess: (items: any[], count: number, timestamp: string) => void;
  onOpenCalculator: () => void;
  onOpenComps: () => void;
  onOpenAllListings: () => void;
  onOpenSettings: () => void;
  lastImportCount: number;
  lastImportTime: string;
  totalItems: number;
  shortlistCount: number;
}

export default function HomeScreen({
  onImportSuccess,
  onOpenCalculator,
  onOpenComps,
  onOpenAllListings,
  onOpenSettings,
  lastImportCount,
  lastImportTime,
  totalItems,
  shortlistCount,
}: HomeScreenProps) {
  const [syncing, setSyncing] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [importingCatalog, setImportingCatalog] = useState<'motorcycles' | 'rv_marine' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const catalogInputRef = useRef<HTMLInputElement>(null);
  const selectedCategory: Category = 'motorcycles';

  const handleSync = async () => {
    setSyncing(true);
    try {
      const settings = getSettings();
      let response: Response;

      if (settings.syncMode === 'direct') {
        // Direct mode: call NPA API without Supabase proxy
        response = await fetch(`${settings.npaApiUrl}?limit=1000`);
      } else {
        // Supabase proxy mode (default)
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-npa-inventory?limit=1000`;
        response = await fetch(apiUrl, {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        });
      }

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`);
      }

      const apiData = await response.json();

      if (!apiData.data || apiData.data.length === 0) {
        alert('No data found from API.');
        return;
      }

      // Log first item to see field names
      if (apiData.data.length > 0) {
        console.log('API item fields:', Object.keys(apiData.data[0]));
        console.log('Sample item:', JSON.stringify(apiData.data[0], null, 2));
      }

      const rows = apiData.data.map((item: any) => ({
        itemNumber: item.Item || item.item || item['Item #'] || '',
        year: item.Year || item.year || '',
        make: item.Make || item.make || item.Brand || '',
        model: item.Model || item.model || item.Description || item.Desc || '',
        milesHours: item.MiHr || item['Mi/Hr'] || item.Miles || item.Hours || '',
        vin: item.VIN || item.Vin || item.vin || '',
        crScore: item.Score || item.CRScore || item['CR Score'] || '',
        docs: item.VehicleDoc || item.Docs || item.Title || '',
        location: 'San Diego',
      }));

      const items: InventoryItem[] = [];
      for (const row of rows) {
        const existingItem = await getItem(row.itemNumber);
        const item = csvRowToInventoryItem(row, selectedCategory, existingItem || undefined);
        if (item) items.push(item);
      }

      await saveItems(items);

      const timestamp = new Date().toLocaleString();
      onImportSuccess(items, items.length, timestamp);
    } catch (error) {
      console.error('Sync error:', error);
      alert(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSyncing(true);
    try {
      let rows: any[];

      if (file.name.toLowerCase().endsWith('.pdf')) {
        rows = await parsePDF(file);
      } else {
        const text = await file.text();
        rows = parseCSV(text);
      }

      if (rows.length === 0) {
        alert('No data found in file.');
        return;
      }

      const items: InventoryItem[] = [];
      for (const row of rows) {
        const existingItem = await getItem(row.itemNumber || row['Item #'] || '');
        const item = csvRowToInventoryItem(row, selectedCategory, existingItem || undefined);
        if (item) items.push(item);
      }

      if (items.length === 0) {
        alert('No San Diego items found in file.');
        return;
      }

      await saveItems(items);

      const timestamp = new Date().toLocaleString();
      onImportSuccess(items, items.length, timestamp);
    } catch (error) {
      console.error('Import error:', error);
      alert(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setSyncing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExport = async () => {
    try {
      const items = await getItemsByCategory(selectedCategory);
      const json = JSON.stringify(items, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bid-buddy-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Export failed');
    }
  };

  const handleImportJSON = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSyncing(true);
    try {
      const text = await file.text();
      const items: InventoryItem[] = JSON.parse(text);
      const categoryItems = items.filter(item => item.category === selectedCategory);
      await saveItems(categoryItems);
      const timestamp = new Date().toLocaleString();
      onImportSuccess(categoryItems, categoryItems.length, timestamp);
    } catch (error) {
      alert('Import failed. Check file format.');
    } finally {
      setSyncing(false);
      if (jsonInputRef.current) jsonInputRef.current.value = '';
    }
  };

  const handleClearAll = async () => {
    if (confirm('Remove all items? This cannot be undone.')) {
      try {
        await deleteItemsByCategory(selectedCategory);
        onImportSuccess([], 0, '');
      } catch (error) {
        alert('Clear failed');
      }
    }
  };

  const handleCatalogImport = (type: 'motorcycles' | 'rv_marine') => {
    setImportingCatalog(type);
    catalogInputRef.current?.click();
  };

  const handleCatalogFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !importingCatalog) return;

    setSyncing(true);
    try {
      const catalogType = importingCatalog;
      console.log(`Importing ${catalogType} catalog:`, file.name);

      const parsedItems = await parseCatalogPDF(file, catalogType);

      if (parsedItems.length === 0) {
        alert('No items found in PDF. Check the file format.');
        return;
      }

      // Convert partial items to full InventoryItem
      const items: InventoryItem[] = [];
      for (const parsed of parsedItems) {
        if (!parsed.itemNumber) continue;

        // Check for existing item to preserve status/notes
        const existingItem = await getItem(parsed.itemNumber);

        const item: InventoryItem = {
          id: existingItem?.id || parsed.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          itemNumber: parsed.itemNumber,
          category: catalogType as Category,
          title: parsed.title || '',
          year: parsed.year || null,
          make: parsed.make || '',
          model: parsed.model || '',
          vin: parsed.vin || existingItem?.vin || null,
          milesHours: parsed.milesHours || null,
          crScore: parsed.crScore || null,
          docs: parsed.docs || null,
          location: parsed.location || 'San Diego',
          photoUrl: existingItem?.photoUrl || null,
          sourceUrl: existingItem?.sourceUrl || '',
          status: existingItem?.status || 'unreviewed',
          note: existingItem?.note || parsed.note || '',
          maxBid: existingItem?.maxBid || null,
          buddyTag: existingItem?.buddyTag || null,
          updatedAt: Date.now(),
          cachedEstimate: existingItem?.cachedEstimate,
          cachedComps: existingItem?.cachedComps,
        };

        items.push(item);
      }

      await saveItems(items);

      const timestamp = new Date().toLocaleString();
      onImportSuccess(items, items.length, timestamp);
      alert(`Imported ${items.length} items from ${catalogType === 'rv_marine' ? 'RV/Marine' : 'Motorcycle'} catalog!`);
    } catch (error) {
      console.error('Catalog import error:', error);
      alert(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setSyncing(false);
      setImportingCatalog(null);
      if (catalogInputRef.current) catalogInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-surface-900 pb-24">
      {/* Header with logo */}
      <div className="px-6 pt-14 pb-8">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-surface-700 border border-surface-500/50 flex items-center justify-center overflow-hidden shadow-glow-sm">
            <img
              src="/lbk-logo.png"
              alt="LBK"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white tracking-tight">Bid Buddy</h1>
            <p className="text-zinc-500 text-sm mt-0.5">NPA San Diego</p>
          </div>
          <button
            onClick={onOpenSettings}
            className="p-2.5 rounded-xl bg-surface-700 border border-surface-500/30 text-zinc-400 active:text-white active:bg-surface-600 transition-colors"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      <div className="px-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-5">
            <div className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Inventory</div>
            <div className="text-3xl font-bold text-white mt-2 tabular-nums">{totalItems}</div>
          </div>
          <div className="card p-5 border-electric/20 glow-sm">
            <div className="text-electric/70 text-xs font-medium uppercase tracking-wider">Shortlist</div>
            <div className="text-3xl font-bold text-electric mt-2 tabular-nums">{shortlistCount}</div>
          </div>
        </div>

        {/* Sync Button */}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="w-full btn-primary flex items-center justify-center gap-3"
        >
          <RefreshCw size={20} className={syncing ? 'animate-spin' : ''} />
          <span className="font-semibold">{syncing ? 'Syncing...' : 'Sync Inventory'}</span>
        </button>

        {/* Tools Grid */}
        <div className="card divide-y divide-surface-500/30">
          <button
            onClick={onOpenCalculator}
            className="w-full flex items-center justify-between p-4 transition-colors active:bg-surface-600"
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-status-warning/10 flex items-center justify-center">
                <Calculator size={20} className="text-status-warning" />
              </div>
              <div className="text-left">
                <div className="font-medium text-white">Fee Calculator</div>
                <div className="text-sm text-zinc-500">Calculate total with fees</div>
              </div>
            </div>
            <ChevronRight size={20} className="text-zinc-600" />
          </button>

          <button
            onClick={onOpenComps}
            className="w-full flex items-center justify-between p-4 transition-colors active:bg-surface-600"
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-status-success/10 flex items-center justify-center">
                <Search size={20} className="text-status-success" />
              </div>
              <div className="text-left">
                <div className="font-medium text-white">Comps Lookup</div>
                <div className="text-sm text-zinc-500">Search market prices</div>
              </div>
            </div>
            <ChevronRight size={20} className="text-zinc-600" />
          </button>

          <button
            onClick={onOpenAllListings}
            className="w-full flex items-center justify-between p-4 transition-colors active:bg-surface-600"
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-electric/10 flex items-center justify-center">
                <List size={20} className="text-electric" />
              </div>
              <div className="text-left">
                <div className="font-medium text-white">All Listings</div>
                <div className="text-sm text-zinc-500">Browse inventory</div>
              </div>
            </div>
            <ChevronRight size={20} className="text-zinc-600" />
          </button>
        </div>

        {/* Last Sync Info */}
        {lastImportCount > 0 && lastImportTime && (
          <div className="px-4 py-3 rounded-xl bg-status-success/10 border border-status-success/20">
            <div className="text-status-success font-medium text-sm">Last sync: {lastImportCount} items</div>
            <div className="text-zinc-500 text-xs mt-0.5">{lastImportTime}</div>
          </div>
        )}

        {/* NPA Catalog Import */}
        <div className="card p-4">
          <div className="text-sm font-medium text-zinc-400 mb-3">Import NPA Catalog PDF</div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleCatalogImport('motorcycles')}
              disabled={syncing}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-electric/10 border border-electric/30 text-electric font-medium text-sm active:bg-electric/20 disabled:opacity-50"
            >
              <FileText size={18} />
              Motorcycles
            </button>
            <button
              onClick={() => handleCatalogImport('rv_marine')}
              disabled={syncing}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-status-info/10 border border-status-info/30 text-status-info font-medium text-sm active:bg-status-info/20 disabled:opacity-50"
            >
              <FileText size={18} />
              RV / Marine
            </button>
          </div>
          <input
            ref={catalogInputRef}
            type="file"
            accept=".pdf"
            onChange={handleCatalogFileSelect}
            className="hidden"
          />
        </div>

        {/* More Options Toggle */}
        <button
          onClick={() => setShowMore(!showMore)}
          className="w-full text-electric font-medium text-sm py-2"
        >
          {showMore ? 'Show Less' : 'More Options'}
        </button>

        {showMore && (
          <div className="card divide-y divide-surface-500/30">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center gap-4 p-4 transition-colors active:bg-surface-600"
            >
              <Upload size={20} className="text-zinc-500" />
              <span className="text-zinc-300">Import CSV/PDF</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.pdf"
              onChange={handleFileUpload}
              className="hidden"
            />

            <button
              onClick={handleExport}
              className="w-full flex items-center gap-4 p-4 transition-colors active:bg-surface-600"
            >
              <Download size={20} className="text-zinc-500" />
              <span className="text-zinc-300">Export JSON</span>
            </button>

            <label className="w-full flex items-center gap-4 p-4 transition-colors active:bg-surface-600 cursor-pointer">
              <FileUp size={20} className="text-zinc-500" />
              <span className="text-zinc-300">Import JSON</span>
              <input
                ref={jsonInputRef}
                type="file"
                accept=".json"
                onChange={handleImportJSON}
                className="hidden"
              />
            </label>

            <button
              onClick={handleClearAll}
              className="w-full flex items-center gap-4 p-4 transition-colors active:bg-surface-600"
            >
              <Trash2 size={20} className="text-status-danger" />
              <span className="text-status-danger">Clear All Data</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
