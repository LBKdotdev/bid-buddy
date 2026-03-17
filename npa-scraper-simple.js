// NPA Auction Data Scraper - Simple Single Page Version
// This scrapes ONLY the current page. Run on each page and it will append to existing data.
// Copy and paste into browser console on npauctions.com search results page

(function() {
  console.log('🚀 NPA Single Page Scraper');

  const items = [];

  // Get all text content and find items
  const bodyText = document.body.innerText;
  const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Look for year + make + model pattern
    const titleMatch = line.match(/^(\d{4})\s+([A-Z\-/]+)\s+(.+)/);

    if (titleMatch) {
      const year = titleMatch[1];
      const make = titleMatch[2];
      const model = titleMatch[3];

      // Look ahead for associated metadata
      let mileage = '';
      let score = '';
      let docType = '';
      let itemNumber = '';
      let currentBid = '';

      // Check next 10 lines for related data
      for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
        const nextLine = lines[j];

        // Mileage/Hours
        if (nextLine.includes('M/H') || nextLine.includes('Mi/H')) {
          const mhMatch = nextLine.match(/M[\/i]H[:\s]+([A-Z0-9]+)/i);
          if (mhMatch) mileage = mhMatch[1];
        }

        // CR (Condition Report score)
        if (nextLine.includes('CR')) {
          const crMatch = nextLine.match(/CR[:\s]+(\d+)/i);
          if (crMatch) score = crMatch[1];
        }

        // Document type
        if (nextLine.includes('DOC')) {
          const docMatch = nextLine.match(/DOC[:\s]+([A-Z\s]+?)(?=\s+(?:DMV|As of|Est|$))/i);
          if (docMatch) docType = docMatch[1].trim();
        }

        // Item number
        if (nextLine.includes('Item #')) {
          const itemMatch = nextLine.match(/Item #[:\s]*(\d+)/i);
          if (itemMatch) itemNumber = itemMatch[1];
        }

        // Online bid
        const bidMatch = nextLine.match(/\$[\d,]+\.?\d*/);
        if (bidMatch && !currentBid) currentBid = bidMatch[0];

        // Stop if we hit another year pattern
        if (j > i + 1 && /^\d{4}\s+[A-Z]/.test(nextLine)) {
          break;
        }
      }

      if (itemNumber) {
        items.push({
          itemNumber,
          year,
          make,
          model,
          mileage,
          vin: '', // VIN usually not visible on listing page
          score,
          currentBid,
          docType
        });
      }
    }

    i++;
  }

  console.log(`✅ Found ${items.length} items on this page`);

  // Convert to CSV
  const headers = ['Item#', 'Year', 'Make', 'Model', 'Mi/Hr', 'VIN', 'Score', 'Online Bid', 'Vehicle Doc'];
  const csvRows = [
    headers.map(h => `"${h}"`).join(','),
    ...items.map(item => [
      item.itemNumber,
      item.year,
      item.make,
      item.model,
      item.mileage,
      item.vin,
      item.score,
      item.currentBid,
      item.docType
    ].map(cell => `"${cell}"`).join(','))
  ];

  const csv = csvRows.join('\n');

  // Download CSV
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `npa_page_${Date.now()}.csv`;
  link.click();

  console.log('📥 CSV downloaded!');
  console.log('\n--- Data Preview ---');
  items.forEach(item => {
    console.log(`${item.itemNumber}: ${item.year} ${item.make} ${item.model}`);
  });

  // Return data for inspection
  return items;
})();
