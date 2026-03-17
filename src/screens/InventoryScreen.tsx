import { ArrowLeft, Search } from 'lucide-react';
import { useState } from 'react';
import ItemDetailsScreen from './ItemDetailsScreen';
import KittyCompsScreen from './KittyCompsScreen';

interface InventoryScreenProps {
  items: any[];
  lastImportCount: number;
  lastImportTime: string;
  onBack: () => void;
}

export default function InventoryScreen({ items, lastImportCount, lastImportTime, onBack }: InventoryScreenProps) {
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [showKittyComps, setShowKittyComps] = useState(false);
  const [search, setSearch] = useState('');
  const [filteredItems, setFilteredItems] = useState(items);

  const handleSearch = (query: string) => {
    setSearch(query);
    if (!query) {
      setFilteredItems(items);
      return;
    }
    const q = query.toLowerCase();
    setFilteredItems(
      items.filter(
        (item) =>
          (item.itemNumber || item['Item #'] || '').toLowerCase().includes(q) ||
          (item.year || item.Year || '').toString().toLowerCase().includes(q) ||
          (item.make || item.Make || '').toLowerCase().includes(q) ||
          (item.model || item.Model || '').toLowerCase().includes(q) ||
          (item.location || item.Location || '').toLowerCase().includes(q)
      )
    );
  };

  if (showKittyComps) {
    return <KittyCompsScreen onBack={() => setShowKittyComps(false)} />;
  }

  if (selectedItem) {
    return (
      <ItemDetailsScreen
        item={selectedItem}
        allItems={items}
        onBack={() => setSelectedItem(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="sticky top-0 bg-white border-b border-gray-200 z-10">
        <div className="px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-gray-700" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900 flex-1">Inventory</h1>
            <button
              onClick={() => setShowKittyComps(true)}
              className="bg-lime-500 text-black px-4 py-2 rounded-lg font-semibold text-sm hover:bg-lime-600 flex items-center gap-2"
            >
              <Search size={16} />
              Kitty Comps
            </button>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by item, make, model, location..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
            />
          </div>
          <div className="text-sm text-gray-600">
            Showing {filteredItems.length} of {items.length} items
          </div>
        </div>
        <div className="bg-gray-100 border-b border-gray-200">
          <div className="grid grid-cols-[auto_auto_auto_1fr_auto_auto_auto_auto] gap-4 px-4 py-3">
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Item#</div>
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Year</div>
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Make</div>
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Model</div>
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Mi/Hr</div>
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Location</div>
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Score</div>
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Doc Type</div>
          </div>
        </div>
      </div>

      <div className="bg-white divide-y divide-gray-200">
        {filteredItems.map((item, index) => {
          const score = item.crScore || item.score || item.Score;
          return (
            <div
              key={index}
              className="grid grid-cols-[auto_auto_auto_1fr_auto_auto_auto_auto] gap-4 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
              onClick={() => setSelectedItem(item)}
            >
              <div className="text-sm text-gray-900 font-medium">
                {item.itemNumber || item['Item #'] || item.lot || '-'}
              </div>
              <div className="text-sm text-gray-700">
                {item.year || item.Year || '-'}
              </div>
              <div className="text-sm text-gray-900 font-medium">
                {item.make || item.Make || '-'}
              </div>
              <div className="text-sm text-gray-700">
                {item.model || item.Model || '-'}
              </div>
              <div className="text-sm text-gray-600">
                {item.milesHours || item['Mi/Hr'] || item.mileage || '-'}
              </div>
              <div className="text-sm text-gray-600">
                {item.location || item.Location || '-'}
              </div>
              <div className="text-sm">
                {score && (
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    parseInt(score) >= 80 ? 'bg-green-100 text-green-800' :
                    parseInt(score) >= 70 ? 'bg-blue-100 text-blue-800' :
                    parseInt(score) >= 60 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {score}
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-600">
                {item.docs || item['Vehicle Doc'] || item.docType || '-'}
              </div>
            </div>
          );
        })}
      </div>

      {filteredItems.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No results found</p>
        </div>
      )}
    </div>
  );
}
