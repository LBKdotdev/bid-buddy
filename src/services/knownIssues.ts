import type { NHTSARecall, CommonIssue } from '../types/inventory';
import { shouldThrottleGroq, updateFromHeaders } from './groqRateLimit';

export interface KnownIssuesResult {
  recalls: NHTSARecall[];
  commonIssues: CommonIssue[];
  vehicle: string;
  source: 'groq' | 'fallback';
}

// ── NHTSA Recalls API (free, no key needed) ──────────────────────────

// NHTSA uses different make names than NPA listings
function normalizeMakeForNHTSA(make: string): string {
  const upper = make.toUpperCase().trim();
  if (upper.includes('CAN-AM') || upper.includes('CAN AM') || upper.includes('CANAM')) return 'CAN-AM';
  if (upper.includes('HARLEY')) return 'HARLEY-DAVIDSON';
  if (upper.includes('INDIAN')) return 'INDIAN';
  if (upper.includes('POLARIS')) return 'POLARIS';
  if (upper.includes('BMW')) return 'BMW';
  if (upper.includes('DUCATI')) return 'DUCATI';
  if (upper.includes('TRIUMPH')) return 'TRIUMPH';
  if (upper.includes('SUZUKI')) return 'SUZUKI';
  if (upper.includes('KAWASAKI')) return 'KAWASAKI';
  if (upper.includes('YAMAHA')) return 'YAMAHA';
  if (upper.includes('HONDA')) return 'HONDA';
  if (upper.includes('KTM')) return 'KTM';
  if (upper.includes('APRILIA')) return 'APRILIA';
  return upper;
}

// Extract base model for NHTSA (e.g., "RYKER 600 ACE" → "RYKER")
// NHTSA model names are often simpler than auction listing titles
function normalizeModelForNHTSA(model: string): string {
  // Take first word as base model, NHTSA often just uses that
  return model.trim().split(/\s+/)[0].toUpperCase();
}

export async function fetchNHTSARecalls(
  make: string,
  model: string,
  year: number | null
): Promise<NHTSARecall[]> {
  if (!year) return [];

  const nhtsaMake = normalizeMakeForNHTSA(make);
  const nhtsaModel = normalizeModelForNHTSA(model);

  try {
    // Try with specific model first
    let recalls = await queryNHTSA(nhtsaMake, nhtsaModel, year);

    // If no results, try with full model string (some NHTSA entries use full names)
    if (recalls.length === 0 && nhtsaModel !== model.trim().toUpperCase()) {
      recalls = await queryNHTSA(nhtsaMake, model.trim().toUpperCase(), year);
    }

    return recalls;
  } catch (e) {
    console.error('NHTSA API error:', e);
    return [];
  }
}

async function queryNHTSA(make: string, model: string, year: number): Promise<NHTSARecall[]> {
  const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}`;

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) return [];

  const data = await response.json();
  const results = data.results || [];

  return results.map((r: any) => ({
    nhtsaCampaignNumber: r.NHTSACampaignNumber || '',
    component: r.Component || '',
    summary: r.Summary || '',
    consequence: r.Consequence || '',
    remedy: r.Remedy || '',
    reportDate: r.ReportReceivedDate || '',
  }));
}

// ── Groq Common Issues (Llama 4 Scout) ──────────────────────────────

async function getGroqCommonIssues(
  apiKey: string,
  vehicleDesc: string,
  mileage: string | null
): Promise<CommonIssue[] | null> {
  try {
    const mileageCtx = mileage ? `\nMileage: ${mileage}` : '';

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
            content: `You are an expert powersports mechanic. I'm buying a USED ${vehicleDesc} at auction.${mileageCtx}

List the TOP 6 most critical known problems for THIS SPECIFIC vehicle. Focus on:
- Chronic mechanical defects (transmissions, overheating, electrical)
- Model-year-specific weak points
- Common failures and at what mileage they occur
- Expensive parts or hard-to-source components
- What to physically inspect at auction

Be brutally specific. No generic advice like "check tires" or "look at brakes."

Respond ONLY with valid JSON array:
[
  {"issue": "<specific problem name>", "detail": "<what to check, why it matters, mileage trigger if applicable>", "severity": "<high|medium|low>"},
  ...
]`
          }],
          temperature: 0.3,
          max_tokens: 800,
        }),
      }
    );

    if (!response.ok) {
      console.error('Groq issues API error:', response.status);
      return null;
    }

    updateFromHeaders(response.headers);

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) return null;

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('Groq issues error:', e);
    return null;
  }
}

// ── Fallback common issues ──────────────────────────────────────────

function getFallbackIssues(make: string, model: string): CommonIssue[] {
  const m = make.toUpperCase();
  const mod = model.toUpperCase();

  if (m.includes('CAN-AM') || m.includes('CAN AM') || m.includes('CANAM')) {
    if (mod.includes('RYKER')) {
      return [
        { issue: 'CVT Belt Failure', detail: 'Ryker CVT belts wear fast under aggressive riding. Check for glazing, cracks, or burning smell. Replacement is $200-400 parts + labor.', severity: 'high' },
        { issue: 'Throttle Body Issues', detail: 'Rotax engines can develop throttle position sensor issues causing rough idle or stalling. Check for error codes.', severity: 'medium' },
        { issue: 'Coolant Leaks', detail: 'Water pump seal and hose connections are common leak points. Look for white residue around engine.', severity: 'medium' },
        { issue: 'Front Suspension Clunking', detail: 'Lower ball joints and tie rod ends wear on Rykers. Push/pull on front wheels to check for play.', severity: 'medium' },
      ];
    }
    if (mod.includes('SPYDER')) {
      return [
        { issue: 'Semi-Auto Transmission', detail: 'SE5/SE6 transmissions can develop shift issues. Test all gears — clunking or refusal to shift is expensive ($2k+).', severity: 'high' },
        { issue: 'DESS Key System', detail: 'Digital Encoded Security System keys are $200+ each from dealer. Verify both keys work and system recognizes them.', severity: 'medium' },
        { issue: 'Front Brake Caliper Seizure', detail: 'Twin front calipers can seize from inactivity. Check for uneven pad wear or pulling.', severity: 'high' },
        { issue: 'Limp Mode / ECU Issues', detail: 'Spyders are known for random limp mode activation from sensor faults. Check for stored codes.', severity: 'medium' },
      ];
    }
  }

  if (m.includes('HARLEY')) {
    return [
      { issue: 'Cam Chain Tensioner (Twin Cam)', detail: 'Pre-2017 Twin Cam engines use plastic tensioner shoes that wear. Listen for chain rattle on cold start.', severity: 'high' },
      { issue: 'Compensator Noise', detail: 'Primary compensator bearing fails causing loud clank at idle. Common on 2007-2017 baggers.', severity: 'high' },
      { issue: 'Stator/Regulator Failure', detail: 'Charging system failures strand riders. Check voltage at battery — should be 13.5-14.5V running.', severity: 'medium' },
      { issue: 'Oil Sumping (Milwaukee-Eight)', detail: '2017+ M8 engines can sump oil in crankcase. Check oil level cold vs hot.', severity: 'medium' },
    ];
  }

  // Generic powersports fallback
  return [
    { issue: 'Charging System', detail: 'Check battery voltage (12.6V off, 13.5-14.5V running). Stator and regulator/rectifier failures are common on older units.', severity: 'medium' },
    { issue: 'Coolant System', detail: 'Look for coolant residue, check reservoir level, and inspect hose connections for leaks.', severity: 'medium' },
    { issue: 'Suspension Wear', detail: 'Check for fork seal leaks (oil on fork tubes), shock absorber response, and steering head bearing play.', severity: 'medium' },
    { issue: 'Electrical Connections', detail: 'Inspect wiring harness for corrosion, rodent damage, or aftermarket splices. Check all lights and signals.', severity: 'medium' },
  ];
}

// ── Main entry point ─────────────────────────────────────────────────

export async function getKnownIssues(
  year: number | null,
  make: string,
  model: string,
  mileage: string | null
): Promise<KnownIssuesResult> {
  const vehicleDesc = `${year || ''} ${make} ${model}`.trim();
  const groqKey = import.meta.env.VITE_GROQ_API_KEY;

  // Fetch NHTSA recalls and Groq common issues in parallel
  // Skip Groq if rate-limited (preserves quota for estimates + The Scoop voice)
  const useGroq = groqKey && !shouldThrottleGroq();
  const [recalls, groqIssues] = await Promise.all([
    fetchNHTSARecalls(make, model, year),
    useGroq ? getGroqCommonIssues(groqKey, vehicleDesc, mileage) : Promise.resolve(null),
  ]);

  const commonIssues = groqIssues || getFallbackIssues(make, model);
  const source = groqIssues ? 'groq' : 'fallback';

  return { recalls, commonIssues, vehicle: vehicleDesc, source };
}
