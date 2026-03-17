import { useState, useEffect } from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';
import type { InventoryItem, Status } from '../types/inventory';
import { getAllItems } from '../utils/db';

interface AllListingsScreenProps {
  onBack: () => void;
  onSelectItem: (itemId: string) => void;
}

export default function AllListingsScreen({ onBack, onSelectItem }: AllListingsScreenProps) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<InventoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');

  useEffect(() => {
    loadItems();
  }, []);

  useEffect(() => {
    filterItems();
  }, [items, searchQuery, statusFilter]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const allItems = await getAllItems();
      allItems.sort((a, b) => {
        const numA = parseInt(a.itemNumber) || 0;
        const numB = parseInt(b.itemNumber) || 0;
        return numA - numB;
      });
      setItems(allItems);
    } catch (error) {
      console.error('Failed to load items:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterItems = () => {
    let filtered = items;

    if (statusFilter !== 'all') {
      filtered = filtered.filter(item => item.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item => {
        const itemNumber = (item.itemNumber || '').toLowerCase();
        const title = (item.title || '').toLowerCase();
        const make = (item.make || '').toLowerCase();
        const model = (item.model || '').toLowerCase();
        const vin = (item.vin || '').toLowerCase();
        const year = item.year ? item.year.toString() : '';
        const note = (item.note || '').toLowerCase();

        return itemNumber.includes(query) ||
          title.includes(query) ||
          make.includes(query) ||
          model.includes(query) ||
          vin.includes(query) ||
          year.includes(query) ||
          note.includes(query);
      });
    }

    setFilteredItems(filtered);
  };

  const getStatusStyle = (status: Status) => {
    switch (status) {
      case 'interested': return 'bg-status-success text-white';
      case 'maybe': return 'bg-status-warning text-white';
      case 'pass': return 'bg-status-danger text-white';
      default: return 'bg-surface-500 text-zinc-400';
    }
  };

  const statusCounts = {
    all: items.length,
    unreviewed: items.filter(i => i.status === 'unreviewed').length,
    interested: items.filter(i => i.status === 'interested').length,
    maybe: items.filter(i => i.status === 'maybe').length,
    pass: items.filter(i => i.status === 'pass').length,
  };

  return (
    <div className="min-h-screen bg-surface-900 pb-24">
      {/* Header */}
      <div className="bg-surface-800 border-b border-surface-500/30 sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 py-4">
          <button
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center -ml-2 text-electric"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-lg font-semibold text-white">All Listings</h1>
          <div className="ml-auto text-sm text-zinc-500">
            {filteredItems.length} items
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pb-4">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by item #, make, model, year, VIN..."
              className="input-field pl-11 pr-10"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Status Filters */}
        <div className="flex gap-2 px-4 pb-4 overflow-x-auto hide-scrollbar">
          {(['all', 'unreviewed', 'interested', 'maybe', 'pass'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                statusFilter === status
                  ? status === 'all' ? 'bg-electric text-surface-900' :
                    status === 'interested' ? 'bg-status-success text-white' :
                    status === 'maybe' ? 'bg-status-warning text-white' :
                    status === 'pass' ? 'bg-status-danger text-white' :
                    'bg-zinc-600 text-white'
                  : 'bg-surface-600 text-zinc-400 border border-surface-500'
              }`}
            >
              {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)} ({statusCounts[status]})
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-16">
          <div className="text-zinc-500">Loading...</div>
        </div>
      )}

      {/* List */}
      {!loading && (
        <div className="p-4 space-y-3">
          {filteredItems.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-4 opacity-50">🔍</div>
              <div className="text-zinc-500">
                {searchQuery ? 'No items match your search' : 'No items found'}
              </div>
            </div>
          ) : (
            filteredItems.map(item => (
              <button
                key={item.id}
                onClick={() => onSelectItem(item.id)}
                className="w-full card-interactive p-4 text-left"
              >
                <div className="flex items-start gap-4">
                  {item.photoUrl ? (
                    <img
                      src={item.photoUrl}
                      alt={item.title}
                      className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-surface-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-2xl">🏍️</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-electric font-bold">#{item.itemNumber}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusStyle(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-white truncate">
                      {item.year} {item.make} {item.model}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500">
                      {item.milesHours && <span>{item.milesHours} mi</span>}
                      {item.docs && <span className="text-status-success">{item.docs}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      {item.cachedEstimate && (
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
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
