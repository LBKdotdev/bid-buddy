import { shouldThrottleGroq, updateFromHeaders } from './groqRateLimit';

export interface PriceEstimate {
  low: number;
  mid: number;
  high: number;
  confidence: string;
  notes: string;
  factors: string[];
}

export interface EstimateResult {
  vehicle: string;
  mileage: string;
  condition: string;
  estimate: PriceEstimate;
  source: 'claude' | 'groq' | 'gemini' | 'openai' | 'heuristic';
  timestamp: string;
}

// Local heuristic estimate (fallback when API unavailable)
function getLocalEstimate(
  year: string | null,
  make: string,
  model: string,
  mileage: string | null,
  condition: string
): PriceEstimate {
  const makeUpper = make.toUpperCase();
  const modelUpper = model.toUpperCase();
  const vehicleYear = year ? parseInt(year) : 2018;
  const currentYear = new Date().getFullYear();
  const age = currentYear - vehicleYear;
  const miles = mileage ? parseInt(mileage.replace(/,/g, '')) : null;

  // Base prices (private party, like-new) - updated 2024 values
  let basePrice = 8000;

  // Can-Am Spyder/Ryker
  if (makeUpper.includes('CAN-AM') || makeUpper.includes('CAN AM') || makeUpper.includes('CANAM')) {
    if (modelUpper.includes('SPYDER')) {
      basePrice = modelUpper.includes('RT LIMITED') ? 28000 :
                  modelUpper.includes('RT') ? 24000 :
                  modelUpper.includes('F3 LIMITED') ? 26000 :
                  modelUpper.includes('F3-T') ? 22000 :
                  modelUpper.includes('F3-S') ? 20000 :
                  modelUpper.includes('F3') ? 18000 : 20000;
    } else if (modelUpper.includes('RYKER')) {
      // Ryker pricing - auction/private party realistic values
      // Ryker 600 is entry level, much lower resale
      if (modelUpper.includes('600')) {
        basePrice = modelUpper.includes('RALLY') ? 7500 : 6500; // Ryker 600 base ~$6,500
      } else if (modelUpper.includes('900')) {
        basePrice = modelUpper.includes('RALLY') ? 10000 :
                    modelUpper.includes('SPORT') ? 9000 : 8500; // Ryker 900 variants
      } else {
        // Default Ryker (assume 600 if not specified)
        basePrice = modelUpper.includes('RALLY') ? 7500 : 6500;
      }
    }
  }
  // Harley-Davidson
  else if (makeUpper.includes('HARLEY')) {
    basePrice = modelUpper.includes('CVO') ? 35000 :
                modelUpper.includes('ULTRA LIMITED') ? 26000 :
                modelUpper.includes('ROAD GLIDE') ? 24000 :
                modelUpper.includes('STREET GLIDE') ? 23000 :
                modelUpper.includes('ROAD KING') ? 20000 :
                modelUpper.includes('ELECTRA') ? 18000 :
                modelUpper.includes('HERITAGE') ? 17000 :
                modelUpper.includes('FAT BOY') || modelUpper.includes('FATBOY') ? 18000 :
                modelUpper.includes('SOFTAIL') ? 16000 :
                modelUpper.includes('SPORTSTER') ? 10000 :
                modelUpper.includes('IRON') ? 9000 : 15000;
  }
  // Honda
  else if (makeUpper.includes('HONDA')) {
    basePrice = modelUpper.includes('GOLDWING') || modelUpper.includes('GOLD WING') ? 32000 :
                modelUpper.includes('AFRICA TWIN') ? 14000 :
                modelUpper.includes('CBR1000') ? 14000 :
                modelUpper.includes('CBR600') ? 10000 :
                modelUpper.includes('CBR') ? 8000 :
                modelUpper.includes('REBEL') ? 7000 : 8000;
  }
  // Kawasaki
  else if (makeUpper.includes('KAWASAKI')) {
    basePrice = modelUpper.includes('NINJA H2') ? 25000 :
                modelUpper.includes('ZX-14') || modelUpper.includes('ZX14') ? 14000 :
                modelUpper.includes('NINJA ZX') ? 12000 :
                modelUpper.includes('NINJA') ? 9000 :
                modelUpper.includes('VULCAN') ? 10000 : 8000;
  }
  // Yamaha
  else if (makeUpper.includes('YAMAHA')) {
    basePrice = modelUpper.includes('R1M') ? 18000 :
                modelUpper.includes('R1') ? 14000 :
                modelUpper.includes('R6') ? 11000 :
                modelUpper.includes('MT-10') || modelUpper.includes('MT10') ? 13000 :
                modelUpper.includes('VMAX') ? 14000 :
                modelUpper.includes('STAR') ? 12000 : 8000;
  }
  // Indian
  else if (makeUpper.includes('INDIAN')) {
    basePrice = modelUpper.includes('ROADMASTER') ? 26000 :
                modelUpper.includes('CHIEFTAIN') ? 22000 :
                modelUpper.includes('CHIEF') ? 18000 :
                modelUpper.includes('SCOUT') ? 12000 : 18000;
  }
  // Polaris
  else if (makeUpper.includes('POLARIS')) {
    basePrice = modelUpper.includes('SLINGSHOT') ? 22000 : 10000;
  }
  // BMW
  else if (makeUpper.includes('BMW')) {
    basePrice = modelUpper.includes('K1600') ? 22000 :
                modelUpper.includes('R1250') ? 16000 :
                modelUpper.includes('S1000') ? 14000 : 14000;
  }
  // Ducati
  else if (makeUpper.includes('DUCATI')) {
    basePrice = modelUpper.includes('PANIGALE') ? 18000 :
                modelUpper.includes('MULTISTRADA') ? 16000 :
                modelUpper.includes('MONSTER') ? 12000 : 14000;
  }
  // Suzuki
  else if (makeUpper.includes('SUZUKI')) {
    basePrice = modelUpper.includes('HAYABUSA') ? 14000 :
                modelUpper.includes('GSX-R1000') || modelUpper.includes('GSXR1000') ? 12000 :
                modelUpper.includes('GSX') ? 9000 : 7000;
  }
  // Triumph
  else if (makeUpper.includes('TRIUMPH')) {
    basePrice = modelUpper.includes('ROCKET') ? 18000 :
                modelUpper.includes('SPEED') ? 12000 : 11000;
  }

  // Age depreciation - powersports ~7% per year
  const depreciationRate = 0.07;
  const ageMultiplier = Math.pow(1 - depreciationRate, Math.min(age, 15));
  let adjustedPrice = basePrice * ageMultiplier;

  // Mileage adjustment (~2% of value per 10k miles over/under average)
  if (miles) {
    const avgMilesPerYear = 4000;
    const expectedMiles = age * avgMilesPerYear;
    const mileageDiff = miles - expectedMiles;
    const mileageAdjustment = (mileageDiff / 10000) * -(adjustedPrice * 0.02);
    adjustedPrice += mileageAdjustment;
  }

  // Condition adjustment
  const conditionMultiplier =
    condition === 'excellent' ? 1.15 :
    condition === 'good' ? 1.0 :
    condition === 'fair' ? 0.85 :
    0.70;

  adjustedPrice *= conditionMultiplier;
  adjustedPrice = Math.max(adjustedPrice, 1500);

  const low = Math.round(adjustedPrice * 0.85 / 100) * 100;
  const mid = Math.round(adjustedPrice / 100) * 100;
  const high = Math.round(adjustedPrice * 1.15 / 100) * 100;

  return {
    low,
    mid,
    high,
    confidence: "medium",
    notes: `Estimate based on ${vehicleYear} model year, typical depreciation, and market trends. Actual prices vary by location and condition.`,
    factors: [
      `${age} years old`,
      miles ? `${miles.toLocaleString()} miles` : "Mileage unknown",
      `${condition} condition`,
    ],
  };
}

async function getGroqEstimate(
  apiKey: string,
  vehicleDesc: string,
  mileageInfo: string,
  condition: string
): Promise<PriceEstimate | null> {
  try {
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
            content: `You are an expert powersports and vehicle appraiser specializing in motorcycles, ATVs, side-by-sides, and three-wheelers. I need a PRIVATE PARTY sale price estimate for:

Vehicle: ${vehicleDesc}${mileageInfo}
Condition: ${condition}

Important context:
- This is for auction bidding, so I need realistic PRIVATE PARTY prices (NOT dealer retail)
- Consider: Can-Am Spyder/Ryker, Harley-Davidson, Honda Gold Wing, Indian, Polaris Slingshot, sport bikes, cruisers, touring bikes
- Factor in: model year depreciation, mileage vs typical usage, desirability, common issues
- Private party prices are typically 15-25% below dealer retail

Respond ONLY with valid JSON in this exact format:
{
  "low": <number - quick sale price>,
  "mid": <number - fair market private party price>,
  "high": <number - excellent condition/low miles premium>,
  "confidence": "<high/medium/low>",
  "notes": "<1-2 sentence market insight specific to this vehicle>",
  "factors": ["<key pricing factor 1>", "<key pricing factor 2>", "<key pricing factor 3>"]
}

Be specific and accurate. Do not use placeholder values.`
          }],
          temperature: 0.2,
          max_tokens: 600,
        }),
      }
    );

    if (!response.ok) {
      console.error('Groq API error:', response.status);
      return null;
    }

    updateFromHeaders(response.headers);

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) return null;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('Groq error:', e);
    return null;
  }
}

export async function getAIEstimate(
  year: string | null,
  make: string,
  model: string,
  mileage?: string | null,
  condition: string = 'good'
): Promise<EstimateResult> {
  const groqKey = import.meta.env.VITE_GROQ_API_KEY;

  const vehicleDesc = `${year || ''} ${make} ${model}`.trim();
  const mileageInfo = mileage ? ` with ${mileage} miles` : '';

  // Try Groq API directly (skip if rate-limited to preserve quota for other services)
  if (groqKey && !shouldThrottleGroq()) {
    try {
      console.log('Calling Groq for estimate...');
      const estimate = await getGroqEstimate(groqKey, vehicleDesc, mileageInfo, condition);

      if (estimate) {
        console.log('Got Groq estimate:', estimate);
        return {
          vehicle: vehicleDesc,
          mileage: mileage || 'unknown',
          condition,
          estimate,
          source: 'groq',
          timestamp: new Date().toISOString(),
        };
      }
    } catch (e) {
      console.warn('Groq API failed, using local fallback:', e);
    }
  }

  // Fallback to local heuristic
  console.log('Using local heuristic estimate');
  const estimate = getLocalEstimate(year, make, model, mileage || null, condition);

  return {
    vehicle: vehicleDesc,
    mileage: mileage || 'unknown',
    condition,
    estimate,
    source: 'heuristic',
    timestamp: new Date().toISOString(),
  };
}
