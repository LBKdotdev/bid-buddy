import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PriceEstimate {
  low: number;
  mid: number;
  high: number;
  confidence: string;
  notes: string;
  factors: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const year = url.searchParams.get("year");
    const make = url.searchParams.get("make");
    const model = url.searchParams.get("model");
    const mileage = url.searchParams.get("mileage");
    const condition = url.searchParams.get("condition") || "good";

    if (!make || !model) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters: make, model" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vehicleDesc = `${year || ''} ${make} ${model}`.trim();
    const mileageInfo = mileage ? ` with ${mileage} miles` : '';

    // Try Anthropic API first, then Gemini, then OpenAI, then fallback to heuristic
    let estimate: PriceEstimate | null = null;
    let source: "claude" | "gemini" | "openai" | "heuristic" = "heuristic";

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (anthropicKey) {
      console.log("Trying Anthropic API...");
      estimate = await getAnthropicEstimate(anthropicKey, vehicleDesc, mileageInfo, condition);
      if (estimate) source = "claude";
    }

    if (!estimate && geminiKey) {
      console.log("Trying Gemini API...");
      estimate = await getGeminiEstimate(geminiKey, vehicleDesc, mileageInfo, condition);
      if (estimate) source = "gemini";
    }

    if (!estimate && openaiKey) {
      console.log("Trying OpenAI API...");
      estimate = await getOpenAIEstimate(openaiKey, vehicleDesc, mileageInfo, condition);
      if (estimate) source = "openai";
    }

    if (!estimate) {
      // Fallback to heuristic-based estimate
      console.log("Using heuristic fallback...");
      estimate = getHeuristicEstimate(year, make, model, mileage, condition);
      source = "heuristic";
    }

    return new Response(
      JSON.stringify({
        vehicle: vehicleDesc,
        mileage: mileage || "unknown",
        condition,
        estimate,
        source,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to get estimate" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function getAnthropicEstimate(
  apiKey: string,
  vehicle: string,
  mileageInfo: string,
  condition: string
): Promise<PriceEstimate | null> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: `You are a vehicle pricing expert. Give me a private party sale price estimate for a ${vehicle}${mileageInfo} in ${condition} condition.

Respond ONLY with valid JSON in this exact format, no other text:
{
  "low": <number>,
  "mid": <number>,
  "high": <number>,
  "confidence": "<high/medium/low>",
  "notes": "<brief 1-2 sentence market note>",
  "factors": ["<factor1>", "<factor2>", "<factor3>"]
}

Base prices on current private party market values (not dealer). Consider the vehicle type, age, typical depreciation, and market demand.`
        }],
      }),
    });

    if (!response.ok) {
      console.error("Anthropic API error:", response.status);
      return null;
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;

    if (!text) return null;

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("Anthropic error:", e);
    return null;
  }
}

async function getOpenAIEstimate(
  apiKey: string,
  vehicle: string,
  mileageInfo: string,
  condition: string
): Promise<PriceEstimate | null> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{
          role: "user",
          content: `You are a vehicle pricing expert. Give me a private party sale price estimate for a ${vehicle}${mileageInfo} in ${condition} condition.

Respond ONLY with valid JSON in this exact format, no other text:
{
  "low": <number>,
  "mid": <number>,
  "high": <number>,
  "confidence": "<high/medium/low>",
  "notes": "<brief 1-2 sentence market note>",
  "factors": ["<factor1>", "<factor2>", "<factor3>"]
}

Base prices on current private party market values (not dealer). Consider the vehicle type, age, typical depreciation, and market demand.`
        }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error("OpenAI API error:", response.status);
      return null;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) return null;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("OpenAI error:", e);
    return null;
  }
}

async function getGeminiEstimate(
  apiKey: string,
  vehicle: string,
  mileageInfo: string,
  condition: string
): Promise<PriceEstimate | null> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a vehicle pricing expert. Give me a private party sale price estimate for a ${vehicle}${mileageInfo} in ${condition} condition.

Respond ONLY with valid JSON in this exact format, no other text:
{
  "low": <number>,
  "mid": <number>,
  "high": <number>,
  "confidence": "<high/medium/low>",
  "notes": "<brief 1-2 sentence market note>",
  "factors": ["<factor1>", "<factor2>", "<factor3>"]
}

Base prices on current private party market values (not dealer). Consider the vehicle type, age, typical depreciation, and market demand.`
            }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 500,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    console.log("Gemini response:", JSON.stringify(data).slice(0, 500));
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) return null;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("Gemini error:", e);
    return null;
  }
}

function getHeuristicEstimate(
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

  // Base prices (private party, like-new) by vehicle type - updated 2024 values
  let basePrice = 8000;

  // Can-Am Spyder/Ryker (hold value well)
  if (makeUpper.includes('CAN-AM') || makeUpper.includes('CAN AM') || makeUpper.includes('CANAM')) {
    if (modelUpper.includes('SPYDER')) {
      basePrice = modelUpper.includes('RT LIMITED') ? 28000 :
                  modelUpper.includes('RT') ? 24000 :
                  modelUpper.includes('F3 LIMITED') ? 26000 :
                  modelUpper.includes('F3-T') ? 22000 :
                  modelUpper.includes('F3-S') ? 20000 :
                  modelUpper.includes('F3') ? 18000 : 20000;
    } else if (modelUpper.includes('RYKER')) {
      basePrice = modelUpper.includes('RALLY') ? 14000 :
                  modelUpper.includes('SPORT') ? 12000 : 10000;
    }
  }
  // Harley-Davidson (touring holds value best)
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
  // Indian (premium cruisers)
  else if (makeUpper.includes('INDIAN')) {
    basePrice = modelUpper.includes('ROADMASTER') ? 26000 :
                modelUpper.includes('CHIEFTAIN') ? 22000 :
                modelUpper.includes('CHIEF') ? 18000 :
                modelUpper.includes('SCOUT') ? 12000 : 18000;
  }
  // Polaris Slingshot
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
  // Triumph
  else if (makeUpper.includes('TRIUMPH')) {
    basePrice = modelUpper.includes('ROCKET') ? 18000 :
                modelUpper.includes('SPEED') ? 12000 : 11000;
  }
  // Suzuki
  else if (makeUpper.includes('SUZUKI')) {
    basePrice = modelUpper.includes('HAYABUSA') ? 14000 :
                modelUpper.includes('GSX-R1000') || modelUpper.includes('GSXR1000') ? 12000 :
                modelUpper.includes('GSX') ? 9000 : 7000;
  }
  // RV/Marine
  else if (modelUpper.includes('RV') || makeUpper.includes('WINNEBAGO') || makeUpper.includes('THOR') || makeUpper.includes('JAYCO')) {
    basePrice = 55000;
  }

  // Age depreciation - powersports depreciate ~6-8% per year (less than cars)
  const depreciationRate = 0.07;
  const ageMultiplier = Math.pow(1 - depreciationRate, Math.min(age, 15));
  let adjustedPrice = basePrice * ageMultiplier;

  // Mileage adjustment (more impactful for higher-value bikes)
  if (miles) {
    const avgMilesPerYear = 4000; // powersports avg
    const expectedMiles = age * avgMilesPerYear;
    const mileageDiff = miles - expectedMiles;
    // Adjust ~2% of value per 10k miles over/under average
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

  // Ensure reasonable bounds
  adjustedPrice = Math.max(adjustedPrice, 1500);

  const low = Math.round(adjustedPrice * 0.85 / 100) * 100;
  const mid = Math.round(adjustedPrice / 100) * 100;
  const high = Math.round(adjustedPrice * 1.15 / 100) * 100;

  return {
    low,
    mid,
    high,
    confidence: "medium",
    notes: `Estimate based on ${vehicleYear} model year, typical depreciation, and current market trends. Actual prices vary by location and specific condition.`,
    factors: [
      `${age} years old`,
      miles ? `${miles.toLocaleString()} miles` : "Mileage unknown",
      `${condition} condition`,
    ],
  };
}
