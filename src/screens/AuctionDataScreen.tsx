import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Search, ArrowLeft } from 'lucide-react';
import { AuctionItem } from '../types/auction';

interface AuctionDataScreenProps {
  onBack: () => void;
}

export default function AuctionDataScreen({ onBack }: AuctionDataScreenProps) {
  const [data, setData] = useState<AuctionItem[]>([]);
  const [filteredData, setFilteredData] = useState<AuctionItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/auction_data.csv')
      .then((response) => response.text())
      .then((csv) => {
        Papa.parse<Record<string, string>>(csv, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const mapped = results.data.map((row) => ({
              itemNumber: row['Item#'] || '',
              year: row['Year'] || '',
              make: row['Make'] || '',
              model: row['Model'] || '',
              mileage: row['Mi/Hr'] || '',
              vin: row['VIN'] || '',
              score: row['Score'] || '',
              currentBid: row['Online Bid'] || '',
              docType: row['Vehicle Doc'] || '',
            }));
            setData(mapped);
            setFilteredData(mapped);
            setLoading(false);
          },
        });
      });
  }, []);

  useEffect(() => {
    if (!search) {
      setFilteredData(data);
      return;
    }
    const query = search.toLowerCase();
    setFilteredData(
      data.filter(
        (item) =>
          item.itemNumber.toLowerCase().includes(query) ||
          item.year.toLowerCase().includes(query) ||
          item.make.toLowerCase().includes(query) ||
          item.model.toLowerCase().includes(query) ||
          item.vin.toLowerCase().includes(query) ||
          item.docType.toLowerCase().includes(query)
      )
    );
  }, [search, data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-gray-600">Loading auction data...</div>
      </div>
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
            <h1 className="text-2xl font-bold text-gray-900">Auction Data</h1>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by item, make, model, VIN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
            />
          </div>
          <div className="mt-2 text-sm text-gray-600">
            Showing {filteredData.length} of {data.length} items
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full bg-white">
          <thead className="bg-gray-100 border-b border-gray-200 sticky top-[140px]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Item#</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Year</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Make</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Model</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Mi/Hr</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">VIN</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Score</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Online Bid</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Doc Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredData.map((item, idx) => (
              <tr key={idx} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-sm text-gray-900 font-medium">{item.itemNumber}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{item.year}</td>
                <td className="px-4 py-3 text-sm text-gray-900 font-medium">{item.make}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{item.model}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{item.mileage}</td>
                <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">{item.vin}</td>
                <td className="px-4 py-3 text-sm">
                  {item.score && (
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      parseInt(item.score) >= 80 ? 'bg-green-100 text-green-800' :
                      parseInt(item.score) >= 70 ? 'bg-blue-100 text-blue-800' :
                      parseInt(item.score) >= 60 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {item.score}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-green-700">{item.currentBid}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{item.docType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredData.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No results found</p>
        </div>
      )}
    </div>
  );
}
