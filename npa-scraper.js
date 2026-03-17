// NPA Auction Data Scraper
// Copy and paste this entire script into the browser console on the NPA search page

(function() {
  console.log('🚀 Starting NPA auction data scraper...');

  const allItems = [];

  function extractItemData() {
    // Find all item containers on the page
    const items = document.querySelectorAll('.unit-info, [class*="unit"], .item-container');

    if (items.length === 0) {
      // Try alternative selectors if the above don't work
      const altItems = document.querySelectorAll('div[style*="border"]');
      console.log(`Found ${altItems.length} potential items with alternative selector`);
    }

    // More flexible approach - look for text patterns
    const pageText = document.body.innerText;
    const itemMatches = pageText.matchAll(/Item #:?\s*(\d+)/gi);

    const itemNumbers = [...itemMatches].map(m => m[1]);
    console.log(`Found ${itemNumbers.length} items on this page`);

    itemNumbers.forEach(itemNum => {
      try {
        // Find the container with this item number
        const itemContainer = Array.from(document.querySelectorAll('*')).find(el =>
          el.textContent.includes(`Item #: ${itemNum}`) ||
          el.textContent.includes(`Item #:${itemNum}`)
        );

        if (!itemContainer) return;

        const text = itemContainer.textContent;

        // Extract year, make, model from title line
        const titleMatch = text.match(/(\d{4})\s+([A-Z-]+)\s+(.+?)(?=\s+M\/H|$)/);
        const year = titleMatch ? titleMatch[1] : '';
        const make = titleMatch ? titleMatch[2] : '';
        const model = titleMatch ? titleMatch[3].trim() : '';

        // Extract mileage/hours
        const mileageMatch = text.match(/M\/H[:\s]+([A-Z0-9]+)/i);
        const mileage = mileageMatch ? mileageMatch[1] : '';

        // Extract VIN (not always visible)
        const vinMatch = text.match(/VIN[:\s]+([A-Z0-9]{17})/i);
        const vin = vinMatch ? vinMatch[1] : '';

        // Extract CR (Score)
        const scoreMatch = text.match(/CR[:\s]+(\d+)/i);
        const score = scoreMatch ? scoreMatch[1] : '';

        // Extract document type
        const docMatch = text.match(/DOC[:\s]+([A-Z\s]+?)(?=\s+(?:DMV|Item|NPA|San|$))/i);
        const docType = docMatch ? docMatch[1].trim() : '';

        // Extract online bid (if present)
        const bidMatch = text.match(/\$[\d,]+\.?\d*/);
        const currentBid = bidMatch ? bidMatch[0] : '';

        allItems.push({
          itemNumber: itemNum,
          year,
          make,
          model,
          mileage,
          vin,
          score,
          currentBid,
          docType
        });

      } catch (err) {
        console.error(`Error processing item ${itemNum}:`, err);
      }
    });

    console.log(`Total items collected: ${allItems.length}`);
  }

  function convertToCSV(items) {
    const headers = ['Item#', 'Year', 'Make', 'Model', 'Mi/Hr', 'VIN', 'Score', 'Online Bid', 'Vehicle Doc'];
    const rows = items.map(item => [
      item.itemNumber,
      item.year,
      item.make,
      item.model,
      item.mileage,
      item.vin,
      item.score,
      item.currentBid,
      item.docType
    ]);

    const csvContent = [
      headers.map(h => `"${h}"`).join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  }

  function downloadCSV(csv) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `npa_auction_data_${Date.now()}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log('✅ CSV file downloaded!');
  }

  async function scrapeAllPages() {
    console.log('📄 Scraping current page...');
    extractItemData();

    // Check if there's a next page button
    const nextButton = Array.from(document.querySelectorAll('a, button')).find(el =>
      el.textContent.trim() === '>' ||
      el.textContent.trim() === 'Next' ||
      el.textContent.includes('»')
    );

    if (nextButton && !nextButton.disabled && !nextButton.classList.contains('disabled')) {
      console.log('⏭️  Moving to next page...');
      nextButton.click();

      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Continue scraping
      await scrapeAllPages();
    } else {
      console.log('📊 All pages scraped!');
      console.log(`Total items: ${allItems.length}`);

      // Generate and download CSV
      const csv = convertToCSV(allItems);
      downloadCSV(csv);

      // Also log to console for manual copy if needed
      console.log('\n--- CSV Data ---\n');
      console.log(csv);
      console.log('\n--- End CSV Data ---\n');
    }
  }

  // Start scraping
  scrapeAllPages().catch(err => {
    console.error('❌ Error during scraping:', err);
    console.log('Generating CSV from collected items so far...');
    const csv = convertToCSV(allItems);
    downloadCSV(csv);
  });

})();
