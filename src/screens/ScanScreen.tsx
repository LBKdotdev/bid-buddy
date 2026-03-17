import { useState, useRef } from 'react';
import { Camera, Loader2, Plus, Search } from 'lucide-react';
import type { InventoryItem, Category } from '../types/inventory';
import { getAllItems, saveItem } from '../utils/db';
import { getBuyFee, getTotalDue } from '../utils/buyFee';

interface ScanScreenProps {
  onSelectItem: (itemId: string) => void;
}

interface ParsedTag {
  itemNumber: string;
  year?: number;
  make?: string;
  model?: string;
  crScore?: number;
  vin?: string;
  docs?: string;
  milesHours?: string;
}

export default function ScanScreen({ onSelectItem }: ScanScreenProps) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [foundItem, setFoundItem] = useState<InventoryItem | null>(null);
  const [parsedTag, setParsedTag] = useState<ParsedTag | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [adding, setAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scanWithAI = async (base64Image: string): Promise<ParsedTag> => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    console.log('Calling scan-tag edge function, image size:', Math.round(base64Image.length / 1024), 'KB');

    // Try edge function first (Supabase edge function with Groq)
    try {
      console.log('Trying Groq edge function...');
      const response = await fetch(`${supabaseUrl}/functions/v1/scan-tag`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ image: base64Image }),
      });

      const result = await response.json();
      console.log('Edge function response:', result);

      if (result.success && result.data) {
        console.log('SUCCESS via edge function:', result.data);
        return result.data;
      }

      // If edge function returned an error, throw it (don't fall back)
      if (result.error) {
        throw new Error(`Edge: ${result.error}`);
      }
    } catch (edgeErr: any) {
      console.error('Edge function error:', edgeErr);
      if (edgeErr.message?.startsWith('Edge:')) {
        throw edgeErr;
      }
      console.log('Edge function unavailable, trying direct Groq...');
    }

    // Fallback to direct Groq API
    const apiKey = import.meta.env.VITE_GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('API not configured');
    }

    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Look at this auction tag photo and extract the information. Return a JSON object with:
- itemNumber: the big auction number (like "8026")
- year: vehicle year
- make: brand name
- model: model name
- crScore: the CR score number
- vin: VIN if visible
- docs: title info (like "NV TITLE")
- milesHours: mileage/hours

Return ONLY valid JSON, nothing else. Example: {"itemNumber":"8026","year":2024,"make":"HONDA","model":"TALON","crScore":78}`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }],
          temperature: 0.1,
          max_tokens: 500
        })
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limit reached. Wait 30 seconds and try again.');
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    let jsonStr = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    throw new Error('No item number found in image');
  };

  const handleAddItem = async () => {
    if (!parsedTag?.itemNumber) return;

    setAdding(true);
    try {
      const newItem: InventoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        itemNumber: parsedTag.itemNumber,
        category: 'motorcycles' as Category,
        title: `${parsedTag.year || ''} ${parsedTag.make || ''} ${parsedTag.model || ''}`.trim(),
        year: parsedTag.year || null,
        make: parsedTag.make || '',
        model: parsedTag.model || '',
        vin: parsedTag.vin || null,
        milesHours: parsedTag.milesHours || null,
        crScore: parsedTag.crScore || null,
        docs: parsedTag.docs || null,
        location: 'San Diego',
        photoUrl: null,
        sourceUrl: '',
        status: 'unreviewed',
        note: 'Added via camera scan',
        maxBid: null,
        buddyTag: null,
        updatedAt: Date.now(),
      };

      await saveItem(newItem);
      setFoundItem(newItem);
      setNotFound(false);
    } catch (err) {
      setError('Failed to add item');
    } finally {
      setAdding(false);
    }
  };

  const handleReset = () => {
    setFoundItem(null);
    setParsedTag(null);
    setNotFound(false);
    setError(null);
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setScanning(true);
    setError(null);

    try {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const result = await scanWithAI(base64);

      if (result.itemNumber) {
        const allItems = await getAllItems();
        const found = allItems.find(i => i.itemNumber === result.itemNumber);

        if (found) {
          setFoundItem(found);
          setParsedTag(result);
        } else {
          setParsedTag(result);
          setNotFound(true);
        }
      } else {
        setError('Could not read item number from image. Try a clearer photo.');
      }
    } catch (err: any) {
      console.error('Photo scan error:', err);
      const errMsg = err.message || 'Unknown error';
      if (errMsg.includes('Rate limit')) {
        setError('Rate limit reached. Wait 30 seconds and try again.');
      } else {
        setError(`Scan failed: ${errMsg}`);
      }
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const buyFee = foundItem?.maxBid ? getBuyFee(foundItem.maxBid) : null;
  const totalDue = foundItem?.maxBid ? getTotalDue(foundItem.maxBid) : null;

  return (
    <div className="min-h-screen bg-surface-900 pb-24">
      {/* Header */}
      <div className="px-6 pt-14 pb-6">
        <h1 className="text-3xl font-bold text-white tracking-tight">Scan Tag</h1>
        <p className="text-zinc-500 text-sm mt-1">Snap a photo of the auction tag</p>
      </div>

      <div className="px-4">
        {/* Camera Button */}
        {!foundItem && !notFound && !scanning && (
          <div className="text-center py-12">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-28 h-28 rounded-full bg-electric flex items-center justify-center text-surface-900 mx-auto mb-4 shadow-glow active:scale-95 transition-transform"
            >
              <Camera size={44} />
            </button>
            <div className="text-white font-semibold text-lg">Camera</div>
            <div className="text-zinc-400 text-sm mt-2">
              Tap to scan auction tag
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoUpload}
              className="hidden"
            />
          </div>
        )}

        {/* Scanning */}
        {scanning && (
          <div className="text-center py-16">
            <div className="w-32 h-32 rounded-full bg-surface-700 flex items-center justify-center mx-auto mb-6">
              <Loader2 size={48} className="text-electric animate-spin" />
            </div>
            <div className="text-white font-semibold text-lg">Reading Tag...</div>
            <div className="text-zinc-500 text-sm mt-2">
              Extracting item information
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="card p-6 text-center mb-4">
            <div className="text-status-danger font-medium">{error}</div>
            <button
              onClick={handleReset}
              className="mt-4 text-electric font-medium"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Not Found - Offer to Add */}
        {notFound && parsedTag && (
          <div className="card p-6 mb-4">
            <div className="text-center mb-6">
              <div className="text-status-warning font-semibold text-lg mb-2">
                Item #{parsedTag.itemNumber} Not Found
              </div>
              <div className="text-zinc-500 text-sm">
                This item isn't in your database yet
              </div>
            </div>

            {/* Parsed Info */}
            <div className="bg-surface-600 rounded-xl p-4 mb-6">
              <div className="text-zinc-400 text-xs uppercase tracking-wider mb-3">
                Info from Tag
              </div>
              <div className="text-white font-medium mb-2">
                {parsedTag.year} {parsedTag.make} {parsedTag.model}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {parsedTag.crScore && (
                  <div><span className="text-zinc-500">CR:</span> <span className="text-white">{parsedTag.crScore}</span></div>
                )}
                {parsedTag.milesHours && (
                  <div><span className="text-zinc-500">Mi/Hr:</span> <span className="text-white">{parsedTag.milesHours}</span></div>
                )}
                {parsedTag.docs && (
                  <div><span className="text-zinc-500">Docs:</span> <span className="text-status-success">{parsedTag.docs}</span></div>
                )}
                {parsedTag.vin && (
                  <div><span className="text-zinc-500">VIN:</span> <span className="text-white font-mono">{parsedTag.vin}</span></div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="flex-1 btn-secondary"
              >
                Scan Again
              </button>
              <button
                onClick={handleAddItem}
                disabled={adding}
                className="flex-1 btn-primary flex items-center justify-center gap-2"
              >
                {adding ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Plus size={20} />
                )}
                Add Item
              </button>
            </div>
          </div>
        )}

        {/* Found Item - Show Details */}
        {foundItem && (
          <div className="space-y-4">
            <div className="card overflow-hidden">
              <div className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-electric font-bold text-3xl tabular-nums">
                        #{foundItem.itemNumber}
                      </span>
                      {foundItem.buddyTag && (
                        <span className="text-sm bg-surface-600 text-zinc-400 px-3 py-1 rounded-lg font-semibold">
                          {foundItem.buddyTag}
                        </span>
                      )}
                    </div>
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-sm font-medium ${
                      foundItem.status === 'interested' ? 'bg-status-success' :
                      foundItem.status === 'maybe' ? 'bg-status-warning' :
                      foundItem.status === 'pass' ? 'bg-status-danger' :
                      'bg-zinc-600'
                    }`}>
                      {foundItem.status.charAt(0).toUpperCase() + foundItem.status.slice(1)}
                    </div>
                  </div>
                  {foundItem.photoUrl && (
                    <img
                      src={foundItem.photoUrl}
                      alt={foundItem.title}
                      className="w-20 h-20 object-cover rounded-xl"
                    />
                  )}
                </div>

                <h2 className="text-xl font-semibold text-white mb-4">
                  {foundItem.title}
                </h2>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {foundItem.year && (
                    <div className="bg-surface-600 rounded-lg p-3">
                      <div className="text-zinc-500 text-xs">Year</div>
                      <div className="text-white font-medium">{foundItem.year}</div>
                    </div>
                  )}
                  {foundItem.make && (
                    <div className="bg-surface-600 rounded-lg p-3">
                      <div className="text-zinc-500 text-xs">Make</div>
                      <div className="text-white font-medium">{foundItem.make}</div>
                    </div>
                  )}
                  {foundItem.milesHours && (
                    <div className="bg-surface-600 rounded-lg p-3">
                      <div className="text-zinc-500 text-xs">Miles/Hours</div>
                      <div className="text-white font-medium">{foundItem.milesHours}</div>
                    </div>
                  )}
                  {foundItem.crScore !== null && (
                    <div className="bg-surface-600 rounded-lg p-3">
                      <div className="text-zinc-500 text-xs">CR Score</div>
                      <div className="text-white font-medium">{foundItem.crScore}</div>
                    </div>
                  )}
                  {foundItem.docs && (
                    <div className="bg-surface-600 rounded-lg p-3">
                      <div className="text-zinc-500 text-xs">Docs</div>
                      <div className="text-status-success font-medium">{foundItem.docs}</div>
                    </div>
                  )}
                  {foundItem.vin && (
                    <div className="bg-surface-600 rounded-lg p-3">
                      <div className="text-zinc-500 text-xs">VIN</div>
                      <div className="text-white font-medium font-mono text-sm">{foundItem.vin}</div>
                    </div>
                  )}
                </div>

                {/* Market Comps */}
                {foundItem.cachedComps && (
                  <div className="bg-electric/10 border border-electric/30 rounded-xl p-4 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-electric/80 text-xs font-medium uppercase tracking-wider">
                        Market Comps ({foundItem.cachedComps.count})
                      </span>
                      <span className="text-electric font-bold text-2xl tabular-nums">
                        ${foundItem.cachedComps.avgPrice.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs text-electric/60 mt-1">
                      Range: ${foundItem.cachedComps.lowPrice.toLocaleString()} – ${foundItem.cachedComps.highPrice.toLocaleString()}
                    </div>
                  </div>
                )}

                {/* AI Estimate (if no comps) */}
                {!foundItem.cachedComps && foundItem.cachedEstimate && (
                  <div className="bg-status-info/10 border border-status-info/30 rounded-xl p-4 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-status-info/80 text-xs font-medium uppercase tracking-wider">
                        Est. Value
                      </span>
                      <span className="text-status-info font-bold text-xl tabular-nums">
                        ${foundItem.cachedEstimate.mid.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs text-status-info/60 mt-1">
                      Range: ${foundItem.cachedEstimate.low.toLocaleString()} – ${foundItem.cachedEstimate.high.toLocaleString()}
                    </div>
                  </div>
                )}

                {/* Max Bid */}
                {foundItem.maxBid !== null && (
                  <div className="bg-surface-600 rounded-xl p-4 mb-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Max Bid</div>
                        <div className="text-status-success font-bold text-2xl tabular-nums">
                          ${foundItem.maxBid.toLocaleString()}
                        </div>
                      </div>
                      {buyFee !== null && (
                        <div>
                          <div className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Buy Fee</div>
                          <div className="text-white font-bold text-2xl tabular-nums">
                            ${buyFee.toLocaleString()}
                          </div>
                        </div>
                      )}
                      {totalDue !== null && (
                        <div>
                          <div className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Total</div>
                          <div className="text-electric font-bold text-2xl tabular-nums">
                            ${totalDue.toLocaleString()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {foundItem.note && (
                  <div className="bg-surface-600 rounded-lg p-3">
                    <div className="text-zinc-500 text-xs mb-1">Notes</div>
                    <div className="text-zinc-300 text-sm">{foundItem.note}</div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="border-t border-surface-500/30 p-4 flex gap-3">
                <button
                  onClick={handleReset}
                  className="flex-1 btn-secondary"
                >
                  Scan Another
                </button>
                <button
                  onClick={() => onSelectItem(foundItem.id)}
                  className="flex-1 btn-primary flex items-center justify-center gap-2"
                >
                  <Search size={18} />
                  Full Details
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
