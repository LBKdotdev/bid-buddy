import { ArrowLeft, Loader2, DollarSign, Upload, ExternalLink } from 'lucide-react';
import { useState, useRef } from 'react';
import { getBuyFee, getTotalDue, getFeeDetails } from '../utils/buyFee';
import { parseCompsCSV, calculateCompsSummary } from '../utils/comps';
import { Comp, CompsResult } from '../types/comps';
import { runKittyCompsSearch } from '../utils/kittyCompsProvider';
import { KittyCompsSearchParams } from '../types/kittyComps';

interface ItemDetailsScreenProps {
  item: any;
  allItems: any[];
  onBack: () => void;
}

type ReportType = 'comps' | 'issues' | 'risk' | null;

export default function ItemDetailsScreen({ item, allItems, onBack }: ItemDetailsScreenProps) {
  const [loading, setLoading] = useState(false);
  const [activeReport, setActiveReport] = useState<ReportType>(null);
  const [reportContent, setReportContent] = useState<any>(null);
  const [showFeeDetails, setShowFeeDetails] = useState(false);
  const [compsData, setCompsData] = useState<CompsResult | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const year = item.year || item.Year || '';
  const make = item.make || item.Make || '';
  const model = item.model || item.Model || '';
  const bid = item.currentBid || item['Current Bid'] || item.price || item.Price || '';
  const location = item.location || item.Location || '';
  const lot = item.itemNumber || item['Item #'] || item.lot || '';
  const source = item.sourceUrl || item.SourceUrl || item.url || '';

  const buyFee = getBuyFee(bid);
  const totalDue = getTotalDue(bid);
  const feeDetails = getFeeDetails(bid);

  const handleRunComps = async () => {
    setLoading(true);
    setActiveReport('comps');

    const itemYear = parseInt(year) || 2020;
    const itemMileage = item.mileage || item.Mileage ? parseInt(item.mileage || item.Mileage) : null;

    const params: KittyCompsSearchParams = {
      zipCode: '92831',
      radiusMiles: 300,
      year: itemYear,
      make: make,
      model: model,
      mileage: itemMileage || undefined,
      condition: 'unknown',
    };

    try {
      const searchResult = await runKittyCompsSearch(params);
      const result: CompsResult = {
        comps: searchResult.comps,
        summary: searchResult.summary,
      };
      setCompsData(result);
      setReportContent({ compsResult: result });
    } catch (err) {
      console.error('Comps search failed:', err);
      setReportContent({ error: 'Comps search failed. Check your connection and try again.' });
    }
    setLoading(false);
  };

  const handleImportCompsCSV = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const comps = parseCompsCSV(text);

    if (comps.length >= 5) {
      const summary = calculateCompsSummary(comps);
      const result: CompsResult = { comps, summary };
      setCompsData(result);
      setReportContent({ compsResult: result });
      setActiveReport('comps');
      setShowImportModal(false);
    } else {
      alert('CSV must contain at least 5 valid comps with source_name, source_url, and price.');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleKnownIssues = async () => {
    setLoading(true);
    setActiveReport('issues');

    await new Promise(resolve => setTimeout(resolve, 1000));

    let issues: string[] = [];
    const modelUpper = model.toUpperCase();

    if (modelUpper.includes('SPYDER')) {
      issues = [
        'Battery and charging',
        'Belt wear and alignment',
        'DPS/steering fault',
        'Brake wear',
        'Recalls check'
      ];
    } else if (modelUpper.includes('RYKER')) {
      issues = [
        'Belt tension',
        'Battery',
        'CVT behavior',
        'Brake pads',
        'Maintenance intervals'
      ];
    } else {
      issues = [
        'Battery',
        'Tires',
        'Brakes',
        'Service history'
      ];
    }

    setReportContent({ issues });
    setLoading(false);
  };

  const handleRiskScore = async () => {
    setLoading(true);
    setActiveReport('risk');

    await new Promise(resolve => setTimeout(resolve, 1000));

    let score = 'Medium';
    let reason = 'Standard risk profile for this vehicle type.';

    const itemYear = parseInt(year) || 2020;
    const bidValue = parseFloat(bid.toString().replace(/[^0-9.]/g, ''));

    if (itemYear <= 2013) {
      score = 'High';
      reason = 'Older vehicle may have higher maintenance costs and unknown history.';
    } else if (!bid || isNaN(bidValue)) {
      score = 'Medium';
      reason = 'Bid information unavailable for full risk assessment.';
    } else if (bidValue > 10000) {
      score = 'Low';
      reason = 'Higher value vehicle typically indicates better condition and maintenance.';
    }

    setReportContent({ score, reason });
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-gray-950 z-50 overflow-y-auto">
      <div className="bg-gray-900 sticky top-0 z-10 px-4 py-3 flex items-center gap-3 border-b border-gray-800">
        <button onClick={onBack} className="text-gray-400 active:text-white">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-lg font-bold text-white flex-1 truncate">
          {year} {make} {model}
        </h1>
      </div>

      <div className="px-4 py-4 space-y-4 pb-20">
        <div className="bg-gray-900 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-400 mb-1">Year</div>
              <div className="text-white font-medium">{year || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Make</div>
              <div className="text-white font-medium">{make || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Model</div>
              <div className="text-white font-medium">{model || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Bid</div>
              <div className="text-lime-400 font-semibold">{bid || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Buy Fee</div>
              <div className="text-white font-medium">{buyFee !== null ? `$${buyFee.toLocaleString()}` : '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Total Due</div>
              <div className="text-lime-400 font-bold">{totalDue !== null ? `$${totalDue.toLocaleString()}` : '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Location</div>
              <div className="text-white font-medium">{location || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Lot</div>
              <div className="text-white font-medium">{lot || '-'}</div>
            </div>
          </div>
          {source && (
            <div>
              <div className="text-xs text-gray-400 mb-1">Source</div>
              <a
                href={source}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lime-400 text-sm underline truncate block"
              >
                {source}
              </a>
            </div>
          )}
          {buyFee !== null && (
            <div className="mt-3">
              <button
                onClick={() => setShowFeeDetails(true)}
                className="w-full bg-gray-800 text-lime-400 py-2 rounded-lg flex items-center justify-center gap-2 active:bg-gray-700"
              >
                <DollarSign size={18} />
                <span>View Fee Details</span>
              </button>
            </div>
          )}
        </div>

        <div className="bg-gray-900 rounded-lg p-4">
          <h2 className="text-lg font-bold text-lime-400 mb-4">Say Brah</h2>
          <div className="space-y-2">
            <button
              onClick={handleRunComps}
              disabled={loading}
              className="w-full bg-lime-500 text-gray-950 py-3 rounded-lg font-semibold active:bg-lime-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Run Comps
            </button>
            <button
              onClick={handleKnownIssues}
              disabled={loading}
              className="w-full bg-lime-500 text-gray-950 py-3 rounded-lg font-semibold active:bg-lime-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Known Issues
            </button>
            <button
              onClick={handleRiskScore}
              disabled={loading}
              className="w-full bg-lime-500 text-gray-950 py-3 rounded-lg font-semibold active:bg-lime-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Risk Score
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="w-full bg-gray-800 text-lime-400 py-3 rounded-lg font-semibold active:bg-gray-700 flex items-center justify-center gap-2"
            >
              <Upload size={18} />
              Import Comps CSV
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
        />

        {loading && (
          <div className="bg-gray-900 rounded-lg p-8 flex items-center justify-center">
            <Loader2 size={32} className="text-lime-400 animate-spin" />
          </div>
        )}

        {!loading && reportContent && activeReport === 'comps' && reportContent.compsResult && (
          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="text-white font-semibold mb-4">Say Brah Report - Comps</h3>

            <div className="bg-gray-800 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Active Listings:</span>
                  <span className="text-lime-400 font-semibold ml-2">{reportContent.compsResult.summary.count_active}</span>
                </div>
                <div>
                  <span className="text-gray-400">Sold:</span>
                  <span className="text-gray-300 font-semibold ml-2">{reportContent.compsResult.summary.count_sold}</span>
                </div>
                <div>
                  <span className="text-gray-400">Average:</span>
                  <span className="text-white font-semibold ml-2">${reportContent.compsResult.summary.average_price.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-gray-400">Median:</span>
                  <span className="text-white font-semibold ml-2">${reportContent.compsResult.summary.median_price.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-gray-400">Low:</span>
                  <span className="text-green-400 font-semibold ml-2">${reportContent.compsResult.summary.low_price.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-gray-400">High:</span>
                  <span className="text-red-400 font-semibold ml-2">${reportContent.compsResult.summary.high_price.toLocaleString()}</span>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-3">
                Updated: {new Date(reportContent.compsResult.summary.last_updated).toLocaleString()}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800 text-left text-xs text-gray-400">
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Price</th>
                    <th className="px-2 py-2">Year</th>
                    <th className="px-2 py-2">Mileage</th>
                    <th className="px-2 py-2">Distance</th>
                    <th className="px-2 py-2">Source</th>
                    <th className="px-2 py-2">Location</th>
                    <th className="px-2 py-2">Score</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {reportContent.compsResult.comps.map((comp: Comp, idx: number) => (
                    <tr key={idx} className="text-gray-300">
                      <td className="px-2 py-2">
                        <span className={`text-xs px-2 py-1 rounded ${comp.status === 'sold' ? 'bg-gray-700 text-gray-300' : 'bg-lime-900 text-lime-300'}`}>
                          {comp.status}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-white font-semibold">${comp.price.toLocaleString()}</td>
                      <td className="px-2 py-2">{comp.year || '-'}</td>
                      <td className="px-2 py-2">
                        {comp.mileage ? (
                          <span className={comp.mileage_quality === 'strong' ? 'text-lime-400' : comp.mileage_quality === 'weak' ? 'text-yellow-400' : ''}>
                            {comp.mileage.toLocaleString()}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-2 py-2">{comp.distance_miles ? `${comp.distance_miles} mi` : '-'}</td>
                      <td className="px-2 py-2 text-xs">{comp.source_name}</td>
                      <td className="px-2 py-2 text-xs">
                        {comp.location_city && comp.location_state ? `${comp.location_city}, ${comp.location_state}` : '-'}
                      </td>
                      <td className="px-2 py-2">
                        <span className={`text-xs font-semibold ${comp.match_score >= 80 ? 'text-lime-400' : comp.match_score >= 60 ? 'text-yellow-400' : 'text-gray-400'}`}>
                          {comp.match_score}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <a href={comp.source_url} target="_blank" rel="noopener noreferrer" className="text-lime-400 hover:text-lime-300">
                          <ExternalLink size={14} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && reportContent && activeReport === 'issues' && (
          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="text-white font-semibold mb-3">Say Brah Report - Known Issues</h3>
            <ul className="space-y-2">
              {reportContent.issues.map((issue: string, idx: number) => (
                <li key={idx} className="bg-gray-800 rounded-lg p-3 text-gray-300 text-sm">
                  {issue}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!loading && reportContent && activeReport === 'risk' && (
          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="text-white font-semibold mb-3">Say Brah Report - Risk Score</h3>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Risk Level:</span>
                <span
                  className={`font-bold text-lg ${
                    reportContent.score === 'Low'
                      ? 'text-lime-400'
                      : reportContent.score === 'High'
                      ? 'text-red-400'
                      : 'text-yellow-400'
                  }`}
                >
                  {reportContent.score}
                </span>
              </div>
              <p className="text-gray-300 text-sm mt-3">{reportContent.reason}</p>
            </div>
          </div>
        )}
      </div>

      {showImportModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowImportModal(false)}>
          <div className="bg-gray-900 rounded-lg p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-4">Import Comps CSV</h2>
            <div className="text-gray-300 text-sm space-y-2 mb-4">
              <p>Upload a CSV file with the following columns:</p>
              <div className="bg-gray-800 p-3 rounded font-mono text-xs overflow-x-auto">
                status,price,year,make,model,trim,mileage,location_city,location_state,distance_miles,source_name,source_url,listing_date,match_score
              </div>
              <p className="text-gray-400 text-xs mt-2">
                Required: source_name, source_url, price. Must have at least 5 valid comps.
              </p>
              <a
                href="/sample-comps.csv"
                download
                className="text-lime-400 text-xs underline hover:text-lime-300 inline-flex items-center gap-1"
              >
                Download sample CSV template
              </a>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleImportCompsCSV}
                className="flex-1 bg-lime-500 text-black py-2 rounded-lg active:bg-lime-600 font-semibold"
              >
                Choose File
              </button>
              <button
                onClick={() => setShowImportModal(false)}
                className="flex-1 bg-gray-800 text-white py-2 rounded-lg active:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showFeeDetails && feeDetails && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowFeeDetails(false)}>
          <div className="bg-gray-900 rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-4">Fee Details</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-gray-700">
                <span className="text-gray-400">Bid Amount:</span>
                <span className="text-lime-400 font-semibold">${feeDetails.bid.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-gray-700">
                <span className="text-gray-400">Buy Fee:</span>
                <span className="text-white font-semibold">${feeDetails.fee.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-gray-700">
                <span className="text-gray-400 font-semibold">Total Due:</span>
                <span className="text-lime-400 font-bold text-lg">${feeDetails.total.toLocaleString()}</span>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-700">
                <div className="text-xs text-gray-400 mb-1">Bid Range:</div>
                <div className="text-gray-300 text-sm font-mono">${feeDetails.range}</div>
              </div>
            </div>
            <button
              onClick={() => setShowFeeDetails(false)}
              className="w-full mt-6 bg-gray-800 text-white py-2 rounded-lg active:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
