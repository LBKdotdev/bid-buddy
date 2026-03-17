import { useState, useRef } from 'react';
import { Upload, FileUp, Download, Truck, Package, Calculator, Search, RotateCcw, Table } from 'lucide-react';
import type { Category, InventoryItem } from '../types/inventory';
import { parseCSV, csvRowToInventoryItem } from '../utils/csv';
import { parsePDF } from '../utils/pdfParser';
import { saveItems, getItemsByCategory, getItem, deleteItemsByCategory } from '../utils/db';

interface ImportScreenProps {
  onImportSuccess: (items: any[], count: number, timestamp: string) => void;
  onViewInventory: () => void;
  onOpenCalculator: () => void;
  onOpenKittyComps: () => void;
  onOpenAuctionData: () => void;
  onResetDemoData: () => void;
  lastImportCount: number;
  lastImportTime: string;
}

export default function ImportScreen({ onImportSuccess, onViewInventory, onOpenCalculator, onOpenKittyComps, onOpenAuctionData, onResetDemoData, lastImportCount, lastImportTime }: ImportScreenProps) {
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedCategory: Category = 'motorcycles';

  const handleFetchFromAPI = async () => {

    setImporting(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-npa-inventory?limit=1000`;

      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const apiData = await response.json();
      console.log('Fetched API data:', apiData);

      if (!apiData.data || apiData.data.length === 0) {
        alert('No data found from API.');
        return;
      }

      const rows = apiData.data.map((item: any) => ({
        'Item#': item.Item || '',
        itemNumber: item.Item || '',
        Year: item.Year || '',
        year: item.Year || '',
        Make: item.Make || '',
        make: item.Make || '',
        Model: item.Model || '',
        model: item.Model || '',
        'Mi/Hr': item.MiHr || '',
        milesHours: item.MiHr || '',
        VIN: item.VIN || '',
        vin: item.VIN || '',
        Score: item.Score || '',
        crScore: item.Score || '',
        'Online Bid': item.OnlineBid || '',
        'Vehicle Doc': item.VehicleDoc || '',
        docs: item.VehicleDoc || '',
        Location: 'San Diego',
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
      console.error('API fetch error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error fetching from API: ${errorMessage}`);
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      let rows: any[];

      if (file.name.toLowerCase().endsWith('.pdf')) {
        console.log('Parsing PDF file:', file.name);
        rows = await parsePDF(file);
        console.log('Parsed PDF rows:', rows.length);
      } else {
        const text = await file.text();
        rows = parseCSV(text);
      }

      if (rows.length === 0) {
        alert('No data found in file. Please check the file format.');
        return;
      }

      const items: InventoryItem[] = [];
      for (const row of rows) {
        const existingItem = await getItem(row.itemNumber || row['Item #'] || '');
        const item = csvRowToInventoryItem(row, selectedCategory, existingItem || undefined);
        if (item) items.push(item);
      }

      if (items.length === 0) {
        alert('No San Diego items found in file. Items must have Location = "San Diego".');
        return;
      }

      await saveItems(items);

      const timestamp = new Date().toLocaleString();
      onImportSuccess(items, items.length, timestamp);
    } catch (error) {
      console.error('Import error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error importing file: ${errorMessage}`);
    } finally {
      setImporting(false);
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
      a.download = `lbk-${selectedCategory}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      alert('Error exporting data.');
    }
  };

  const handleImportJSON = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const items: InventoryItem[] = JSON.parse(text);

      const categoryItems = items.filter(item => item.category === selectedCategory);
      await saveItems(categoryItems);

      const timestamp = new Date().toLocaleString();
      onImportSuccess(categoryItems, categoryItems.length, timestamp);
    } catch (error) {
      console.error('Import JSON error:', error);
      alert('Error importing JSON. Please check the file format.');
    } finally {
      setImporting(false);
    }
  };

  const handleClearCategory = async () => {
    if (confirm(`Remove all ${selectedCategory} items? This cannot be undone.`)) {
      try {
        await deleteItemsByCategory(selectedCategory);
        alert('Category cleared.');
      } catch (error) {
        console.error('Clear error:', error);
        alert('Error clearing category.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 pb-20 px-4">
      <div className="max-w-2xl mx-auto pt-8">
        <div className="text-center mb-8">
          <div className="mb-4">
            <img
              src="/lbk-logo.png"
              alt="LBK Bid Buddy"
              className="w-32 h-32 mx-auto"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
            <div className="hidden inline-flex items-center gap-2 text-lime-400">
              <Truck size={48} strokeWidth={2.5} />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">LBK Bid Buddy</h1>
          <p className="text-gray-400 text-sm">NPA San Diego Inventory</p>
        </div>

        <button
          onClick={handleFetchFromAPI}
          disabled={importing}
          className="w-full bg-lime-500 text-gray-950 py-6 rounded-xl font-bold text-xl flex items-center justify-center gap-2 active:bg-lime-600 disabled:opacity-50 mb-6 shadow-xl"
        >
          <Download size={28} />
          {importing ? 'Fetching...' : "Let's Go0o0!"}
        </button>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <button
            onClick={onOpenCalculator}
            className="w-full bg-gradient-to-r from-lime-500 to-lime-600 text-gray-950 py-4 rounded-lg font-semibold flex flex-col items-center justify-center gap-1 active:from-lime-600 active:to-lime-700 shadow-lg"
          >
            <Calculator size={24} />
            <span className="text-sm">Buy Fee Calculator</span>
          </button>
          <button
            onClick={onOpenKittyComps}
            className="w-full bg-gradient-to-r from-lime-500 to-lime-600 text-gray-950 py-4 rounded-lg font-semibold flex flex-col items-center justify-center gap-1 active:from-lime-600 active:to-lime-700 shadow-lg"
          >
            <Search size={24} />
            <span className="text-sm">Kitty Comps</span>
            <span className="text-xs opacity-80">5+ comps with source + mileage</span>
          </button>
        </div>

        <button
          onClick={onOpenAuctionData}
          className="w-full bg-gradient-to-r from-lime-500 to-lime-600 text-gray-950 py-4 rounded-lg font-semibold flex items-center justify-center gap-2 active:from-lime-600 active:to-lime-700 shadow-lg mb-3"
        >
          <Table size={20} />
          View Auction Data
        </button>

        <button
          onClick={onViewInventory}
          className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white py-4 rounded-lg font-semibold flex items-center justify-center gap-2 active:from-blue-600 active:to-blue-700 shadow-lg mb-3"
        >
          <Package size={20} />
          View Items
        </button>

        <button
          onClick={onResetDemoData}
          className="w-full bg-gray-800 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 active:bg-gray-700 border border-gray-700 mb-3"
        >
          <RotateCcw size={18} />
          Reset Demo Data
        </button>

        <div className="space-y-3 mb-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="w-full bg-gray-800 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 active:bg-gray-700 disabled:opacity-50"
          >
            <Upload size={18} />
            {importing ? 'Importing...' : 'Import CSV or PDF'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.pdf"
            onChange={handleFileUpload}
            className="hidden"
          />

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleExport}
              className="bg-gray-800 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 active:bg-gray-700"
            >
              <Download size={18} />
              Export JSON
            </button>

            <label className="bg-gray-800 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 active:bg-gray-700 cursor-pointer">
              <FileUp size={18} />
              Import JSON
              <input
                type="file"
                accept=".json"
                onChange={handleImportJSON}
                className="hidden"
              />
            </label>
          </div>

          <button
            onClick={handleClearCategory}
            className="w-full bg-red-900/30 text-red-400 py-3 rounded-lg font-medium active:bg-red-900/50 border border-red-800"
          >
            FY Couch
          </button>
        </div>

        {lastImportCount > 0 && (
          <div className="mt-6 bg-lime-500/10 border border-lime-500/30 rounded-lg p-4">
            <div className="text-lime-400 font-semibold">Import Successful</div>
            <div className="text-gray-300 text-sm mt-1">
              {lastImportCount} items imported
            </div>
            <div className="text-gray-400 text-xs mt-1">{lastImportTime}</div>
          </div>
        )}
      </div>
    </div>
  );
}
