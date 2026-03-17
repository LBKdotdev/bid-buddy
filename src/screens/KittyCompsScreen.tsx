import { useState } from 'react';
import { ArrowLeft, Search, ExternalLink, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { KittyCompsSearchParams, KittyCompsSearchResult } from '../types/kittyComps';
import { runKittyCompsSearch } from '../utils/kittyCompsProvider';
import { Comp } from '../types/comps';

interface KittyCompsScreenProps {
  onBack: () => void;
}

export default function KittyCompsScreen({ onBack }: KittyCompsScreenProps) {
  const [zipCode, setZipCode] = useState('92831');
  const [radiusMiles, setRadiusMiles] = useState(100);
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [trim, setTrim] = useState('');
  const [mileage, setMileage] = useState('');
  const [condition, setCondition] = useState<'unknown' | 'clean' | 'average' | 'rough'>('unknown');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<KittyCompsSearchResult | null>(null);
  const [error, setError] = useState('');
  const [showDebug, setShowDebug] = useState(false);

  const handleSearch = async () => {
    setError('');

    if (!year || !make || !model) {
      setError('Year, Make, and Model are required');
      return;
    }

    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < 1900 || yearNum > new Date().getFullYear() + 1) {
      setError('Enter a valid year');
      return;
    }

    setLoading(true);
    setResult(null);

    const params: KittyCompsSearchParams = {
      zipCode,
      radiusMiles,
      year: yearNum,
      make: make.trim(),
      model: model.trim(),
      trim: trim.trim() || undefined,
      mileage: mileage ? parseInt(mileage.replace(/[^0-9]/g, '')) : undefined,
      condition,
    };

    try {
      const searchResult = await runKittyCompsSearch(params);
      setResult(searchResult);
      if (searchResult.comps.length === 0) {
        setError('No comps found. Try broadening your search or enabling more sources in Market Comps.');
      }
    } catch (err) {
      setError('Search failed. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-20">
      <div className="bg-gray-900 p-4 flex items-center gap-3 border-b border-gray-800 sticky top-0 z-10">
        <button onClick={onBack} className="text-gray-400 active:text-white">
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Kitty Comps</h1>
          <p className="text-xs text-gray-400">5+ comps with source + mileage</p>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-4xl mx-auto">
        <div className="bg-gray-900 rounded-lg p-5">
          <h2 className="text-white font-semibold mb-4">Search Parameters</h2>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-400 block mb-2">Zip Code</label>
                <input
                  type="text"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-lime-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-2">Radius (miles)</label>
                <input
                  type="number"
                  value={radiusMiles}
                  onChange={(e) => setRadiusMiles(parseInt(e.target.value) || 100)}
                  className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-lime-400 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-400 block mb-2">Year *</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2020"
                className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-lime-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-sm text-gray-400 block mb-2">Make *</label>
              <input
                type="text"
                value={make}
                onChange={(e) => setMake(e.target.value)}
                placeholder="Honda"
                className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-lime-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-sm text-gray-400 block mb-2">Model *</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Civic"
                className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-lime-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-sm text-gray-400 block mb-2">Trim (optional)</label>
              <input
                type="text"
                value={trim}
                onChange={(e) => setTrim(e.target.value)}
                placeholder="EX"
                className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-lime-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-sm text-gray-400 block mb-2">Mileage (optional)</label>
              <input
                type="text"
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                placeholder="50,000"
                className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-lime-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-sm text-gray-400 block mb-2">Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as any)}
                className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-lime-400 focus:outline-none"
              >
                <option value="unknown">Unknown</option>
                <option value="clean">Clean</option>
                <option value="average">Average</option>
                <option value="rough">Rough</option>
              </select>
            </div>

            <button
              onClick={handleSearch}
              disabled={loading}
              className="w-full bg-lime-500 text-black py-3 rounded-lg font-semibold active:bg-lime-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Search size={20} />
              {loading ? 'Searching...' : 'Run Kitty Comps'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-red-400">{error}</div>
          </div>
        )}

        {result && (
          <>
            {(result.expansion.radiusExpanded || result.expansion.yearRangeExpanded || result.expansion.mileageIgnored) && (
              <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4">
                <div className="text-blue-300 font-semibold mb-2">Search Expanded</div>
                <div className="text-sm text-blue-200 space-y-1">
                  {result.expansion.radiusExpanded && (
                    <div>• Radius expanded to {result.expansion.finalRadius} miles</div>
                  )}
                  {result.expansion.yearRangeExpanded && (
                    <div>• Year range expanded to ±{result.expansion.finalYearRange} years</div>
                  )}
                  {result.expansion.mileageIgnored && (
                    <div>• Mileage filter removed to find more results</div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-gray-900 rounded-lg p-5">
              <h2 className="text-lime-400 font-semibold text-lg mb-4">Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">Total Comps</div>
                  <div className="text-white font-bold text-xl">{result.comps.length}</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">Active</div>
                  <div className="text-lime-400 font-semibold text-lg">{result.summary.count_active}</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">Sold</div>
                  <div className="text-gray-300 font-semibold text-lg">{result.summary.count_sold}</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">Median Price</div>
                  <div className="text-lime-400 font-bold text-xl">${result.summary.median_price.toLocaleString()}</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">Low Price</div>
                  <div className="text-white font-semibold">${result.summary.low_price.toLocaleString()}</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">High Price</div>
                  <div className="text-white font-semibold">${result.summary.high_price.toLocaleString()}</div>
                </div>
                <div className="bg-lime-900/30 border border-lime-700 rounded-lg p-3 col-span-2 md:col-span-3">
                  <div className="text-lime-400 text-xs mb-1">Typical Offer ({result.summary.typical_offer_percentage}% below median)</div>
                  <div className="text-lime-400 font-bold text-2xl">${result.summary.typical_offer.toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 rounded-lg p-5">
              <h2 className="text-white font-semibold mb-4">Comps ({result.comps.length})</h2>
              <div className="space-y-3">
                {result.comps.map((comp: Comp, idx: number) => (
                  <div key={idx} className="bg-gray-800 rounded-lg p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white font-bold text-lg">
                            ${comp.price.toLocaleString()}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded ${
                            comp.status === 'sold'
                              ? 'bg-gray-700 text-gray-300'
                              : 'bg-lime-900/50 text-lime-300'
                          }`}>
                            {comp.status}
                          </span>
                          {comp.match_score && (
                            <span className={`text-xs font-semibold ${
                              comp.match_score >= 80
                                ? 'text-lime-400'
                                : comp.match_score >= 60
                                ? 'text-yellow-400'
                                : 'text-gray-400'
                            }`}>
                              Score: {comp.match_score}
                            </span>
                          )}
                        </div>
                        <div className="text-gray-300 font-medium">
                          {comp.year} {comp.make} {comp.model}
                          {comp.trim && <span className="text-gray-400"> {comp.trim}</span>}
                        </div>
                      </div>
                      <a
                        href={comp.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-lime-400 hover:text-lime-300 flex-shrink-0"
                      >
                        <ExternalLink size={20} />
                      </a>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm pt-2 border-t border-gray-700">
                      <div>
                        <span className="text-gray-400">Mileage:</span>
                        <span className={`ml-2 font-medium ${
                          comp.mileage_quality === 'strong'
                            ? 'text-lime-400'
                            : comp.mileage_quality === 'weak'
                            ? 'text-yellow-400'
                            : 'text-gray-300'
                        }`}>
                          {comp.mileage ? comp.mileage.toLocaleString() : 'Not listed'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Distance:</span>
                        <span className="text-gray-300 ml-2 font-medium">
                          {comp.distance_miles ? `${comp.distance_miles} mi` : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Source:</span>
                        <span className="text-gray-300 ml-2 font-medium">{comp.source_name}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Seller:</span>
                        <span className={`ml-2 font-medium ${
                          comp.seller_type === 'dealer' ? 'text-blue-400' :
                          comp.seller_type === 'private' ? 'text-green-400' : 'text-gray-300'
                        }`}>
                          {comp.seller_type === 'dealer' ? 'Dealer' :
                           comp.seller_type === 'private' ? 'Private' : 'Unknown'}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-gray-400">{comp.status === 'sold' ? 'Sold' : 'Listed'}:</span>
                        <span className="text-gray-300 ml-2 font-medium">
                          {comp.listing_date || 'Date not listed'}
                        </span>
                      </div>
                    </div>

                    {comp.location_city && comp.location_state && (
                      <div className="text-xs text-gray-400 pt-1">
                        {comp.location_city}, {comp.location_state}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-900 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="w-full p-4 flex items-center justify-between text-left active:bg-gray-800"
              >
                <h2 className="text-white font-semibold">Debug Panel</h2>
                {showDebug ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
              </button>

              {showDebug && (
                <div className="p-5 border-t border-gray-800 space-y-4">
                  <div>
                    <h3 className="text-lime-400 font-semibold mb-2">Filter Criteria</h3>
                    <div className="bg-gray-800 rounded-lg p-3 text-sm space-y-1">
                      <div><span className="text-gray-400">Make:</span> <span className="text-white ml-2">{result.debug.filterCriteria.make}</span></div>
                      <div><span className="text-gray-400">Model:</span> <span className="text-white ml-2">{result.debug.filterCriteria.model}</span></div>
                      <div><span className="text-gray-400">Year Range:</span> <span className="text-white ml-2">{result.debug.filterCriteria.yearMin} - {result.debug.filterCriteria.yearMax}</span></div>
                      {result.debug.filterCriteria.mileageMin && result.debug.filterCriteria.mileageMax && (
                        <div><span className="text-gray-400">Mileage Range:</span> <span className="text-white ml-2">{result.debug.filterCriteria.mileageMin.toLocaleString()} - {result.debug.filterCriteria.mileageMax.toLocaleString()}</span></div>
                      )}
                      <div><span className="text-gray-400">Max Distance:</span> <span className="text-white ml-2">{result.debug.filterCriteria.maxDistance} miles</span></div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lime-400 font-semibold mb-2">Passed Filters ({result.debug.passed.length})</h3>
                    <div className="space-y-2">
                      {result.debug.passed.map((item, idx) => (
                        <div key={idx} className="bg-gray-800 rounded-lg p-3">
                          <div className="text-white font-medium mb-1">
                            {item.comp.year} {item.comp.make} {item.comp.model} - ${item.comp.price.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-400 space-y-0.5">
                            {item.reasons.map((reason, ridx) => (
                              <div key={ridx}>• {reason}</div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {result.debug.rejected.length > 0 && (
                    <div>
                      <h3 className="text-red-400 font-semibold mb-2">Rejected ({result.debug.rejected.length})</h3>
                      <div className="space-y-2">
                        {result.debug.rejected.map((item, idx) => (
                          <div key={idx} className="bg-gray-800 rounded-lg p-3">
                            <div className="text-white font-medium mb-1">
                              {item.listing.year} {item.listing.make} {item.listing.model}
                              {item.listing.price && <span> - ${item.listing.price.toLocaleString()}</span>}
                            </div>
                            <div className="text-xs text-red-300 space-y-0.5">
                              {item.reasons.map((reason, ridx) => (
                                <div key={ridx}>• {reason}</div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
