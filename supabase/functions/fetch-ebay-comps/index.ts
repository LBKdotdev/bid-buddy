import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface EbayComp {
  title: string;
  price: number;
  soldDate: string;
  condition: string;
  url: string;
  imageUrl: string | null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function parseEbayResults(html: string): EbayComp[] {
  const comps: EbayComp[] = [];
  const itemPattern = /<li[^>]*class="[^"]*s-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  const items = html.match(itemPattern) || [];

  for (const item of items) {
    try {
      if (item.includes('SPONSORED')) continue;

      const titleMatch = item.match(/<span[^>]*role="heading"[^>]*>([^<]+)<\/span>/i) ||
                         item.match(/class="s-item__title"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);
      if (!titleMatch) continue;
      const title = decodeHtmlEntities(titleMatch[1].trim());
      if (title.toLowerCase().includes('shop on ebay') || title === 'New Listing') continue;

      const priceMatch = item.match(/class="s-item__price"[^>]*>[\s\S]*?\$([0-9,]+\.?\d*)/i) ||
                         item.match(/\$([0-9,]+\.?\d*)/);
      if (!priceMatch) continue;
      const price = parseFloat(priceMatch[1].replace(/,/g, ''));
      if (isNaN(price) || price <= 0) continue;

      const urlMatch = item.match(/href="(https:\/\/www\.ebay\.com\/itm\/[^"]+)"/i);
      const imageMatch = item.match(/src="(https:\/\/i\.ebayimg\.com\/[^"]+)"/i);
      const dateMatch = item.match(/Sold\s+([A-Za-z]+\s+\d+)/i);
      const conditionMatch = item.match(/class="SECONDARY_INFO"[^>]*>([^<]+)<\/span>/i);

      comps.push({
        title,
        price,
        soldDate: dateMatch ? dateMatch[1].trim() : 'Recently',
        condition: conditionMatch ? conditionMatch[1].trim() : 'Used',
        url: urlMatch ? urlMatch[1].split('?')[0] : '',
        imageUrl: imageMatch ? imageMatch[1] : null,
      });
    } catch (e) {
      console.error("Parse error:", e);
    }
  }

  const seen = new Set<string>();
  return comps.filter(comp => {
    if (!comp.url || seen.has(comp.url)) return false;
    seen.add(comp.url);
    return true;
  }).slice(0, 20);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const query = url.searchParams.get("q");

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Missing query parameter 'q'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const encodedQuery = encodeURIComponent(query);
    const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodedQuery}&LH_Complete=1&LH_Sold=1&_sop=13&_ipg=60`;

    console.log("Fetching:", ebayUrl);

    const response = await fetch(ebayUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error(`eBay request failed: ${response.status}`);
    }

    const html = await response.text();
    const comps = parseEbayResults(html);

    return new Response(
      JSON.stringify({ comps, query, count: comps.length, source: "ebay_sold", timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    const errMsg = error instanceof Error ? error.message : "Failed to fetch comps";
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
