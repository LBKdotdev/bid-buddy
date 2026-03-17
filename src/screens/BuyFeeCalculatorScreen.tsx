import { ArrowLeft, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getFeeDetails } from '../utils/buyFee';

interface BuyFeeCalculatorScreenProps {
  onBack: () => void;
}

interface Calculation {
  bid: number;
  fee: number;
  total: number;
  timestamp: string;
}

export default function BuyFeeCalculatorScreen({ onBack }: BuyFeeCalculatorScreenProps) {
  const [bidInput, setBidInput] = useState('');
  const [result, setResult] = useState<ReturnType<typeof getFeeDetails> | null>(null);
  const [error, setError] = useState('');
  const [recentCalculations, setRecentCalculations] = useState<Calculation[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('lbk_recent_fee_calculations');
    if (stored) {
      try {
        setRecentCalculations(JSON.parse(stored));
      } catch (e) {
        console.error('Error parsing recent calculations:', e);
      }
    }
  }, []);

  useEffect(() => {
    calculateFee();
  }, [bidInput]);

  const calculateFee = () => {
    setError('');
    setResult(null);

    if (!bidInput || bidInput.trim() === '') {
      return;
    }

    const cleanedInput = bidInput.replace(/[$,]/g, '');
    const bidNum = parseFloat(cleanedInput);

    if (isNaN(bidNum)) {
      setError('Enter a valid bid price');
      return;
    }

    if (bidNum < 0) {
      setError('Enter a valid bid price');
      return;
    }

    if (bidNum > 999999) {
      setError('Bid above supported fee table');
      return;
    }

    const details = getFeeDetails(bidNum);
    if (details) {
      setResult(details);
    } else {
      setError('Unable to calculate fee');
    }
  };

  const handleClear = () => {
    setBidInput('');
    setResult(null);
    setError('');
  };

  const saveToRecent = () => {
    if (!result) return;

    const newCalculation: Calculation = {
      bid: result.bid,
      fee: result.fee,
      total: result.total,
      timestamp: new Date().toLocaleString(),
    };

    const updated = [newCalculation, ...recentCalculations].slice(0, 5);
    setRecentCalculations(updated);
    localStorage.setItem('lbk_recent_fee_calculations', JSON.stringify(updated));
  };

  const clearRecentCalculations = () => {
    if (confirm('Clear all recent calculations?')) {
      setRecentCalculations([]);
      localStorage.removeItem('lbk_recent_fee_calculations');
    }
  };

  useEffect(() => {
    if (result && bidInput) {
      saveToRecent();
    }
  }, [result]);

  return (
    <div className="min-h-screen bg-surface-900">
      <div className="bg-surface-800 border-b border-surface-500/30">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center -ml-2 text-electric"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-lg font-semibold text-white">Buy Fee Calculator</h1>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <div className="card p-5">
          <label className="text-sm text-zinc-500 block mb-2">Bid Price</label>
          <input
            type="text"
            value={bidInput}
            onChange={(e) => setBidInput(e.target.value)}
            className="w-full bg-surface-600 border border-surface-500/60 text-2xl font-semibold px-4 py-4 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-electric/50 focus:ring-2 focus:ring-electric/20"
            placeholder="$5,000"
            autoFocus
          />

          {bidInput && (
            <button
              onClick={handleClear}
              className="mt-3 text-electric font-medium text-sm"
            >
              Clear
            </button>
          )}
        </div>

        {error && (
          <div className="bg-status-danger/10 text-status-danger rounded-xl p-4 text-sm font-medium">
            {error}
          </div>
        )}

        {result && !error && (
          <div className="card p-5">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Bid Price</span>
                <span className="text-white font-semibold text-lg tabular-nums">
                  ${result.bid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Buy Fee</span>
                <span className="text-white font-semibold text-lg tabular-nums">
                  ${result.fee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="h-px bg-surface-500/30" />

              <div className="flex justify-between items-center">
                <span className="text-white font-semibold">Total Due</span>
                <span className="text-electric font-bold text-2xl tabular-nums">
                  ${result.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="bg-surface-600 rounded-xl p-3 mt-2">
                <div className="text-xs text-zinc-500">Fee bracket: {result.range}</div>
              </div>
            </div>
          </div>
        )}

        {recentCalculations.length > 0 && (
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-surface-500/30">
              <h3 className="font-semibold text-white">Recent</h3>
              <button
                onClick={clearRecentCalculations}
                className="text-status-danger text-sm flex items-center gap-1"
              >
                <Trash2 size={14} />
                Clear
              </button>
            </div>
            <div className="divide-y divide-surface-500/30">
              {recentCalculations.map((calc, idx) => (
                <button
                  key={idx}
                  className="w-full p-4 text-left active:bg-surface-600 transition-colors"
                  onClick={() => setBidInput(calc.bid.toString())}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-white font-medium tabular-nums">
                        ${calc.bid.toLocaleString()}
                      </span>
                      <span className="text-zinc-600 mx-2">+</span>
                      <span className="text-zinc-500 tabular-nums">
                        ${calc.fee.toLocaleString()}
                      </span>
                    </div>
                    <span className="text-electric font-semibold tabular-nums">
                      ${calc.total.toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-600 mt-1">{calc.timestamp}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
