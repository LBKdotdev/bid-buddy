import * as pdfjsLib from 'pdfjs-dist';
import type { InventoryItem, Category } from '../types/inventory';

// Use unpkg CDN for the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Extract text from PDF page, sorted by visual position (top-to-bottom, left-to-right)
function extractPageText(textContent: any): string {
  const items = textContent.items
    .filter((item: any) => item.str && item.str.trim())
    .map((item: any) => ({
      text: item.str,
      x: item.transform[4],
      y: item.transform[5],
    }));

  if (items.length === 0) return '';

  // Sort by Y (descending - top of page first), then X (ascending)
  items.sort((a: any, b: any) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 5) return yDiff; // Different lines
    return a.x - b.x; // Same line, sort by X
  });

  // Group into lines (items within 5 units of Y are same line)
  const lines: { y: number; items: any[] }[] = [];
  for (const item of items) {
    const existingLine = lines.find(l => Math.abs(l.y - item.y) < 5);
    if (existingLine) {
      existingLine.items.push(item);
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }

  // Sort items within each line by X, then join
  return lines
    .map(line => {
      line.items.sort((a: any, b: any) => a.x - b.x);
      return line.items.map((i: any) => i.text).join(' ');
    })
    .join('\n');
}

// Main entry point - parse PDF file based on catalog type
export async function parseCatalogPDF(
  file: File,
  catalogType: 'motorcycles' | 'rv_marine'
): Promise<Partial<InventoryItem>[]> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = extractPageText(textContent);
      fullText += pageText + '\n\n';
    }

    console.log('Extracted text preview:', fullText.substring(0, 1000));
    console.log('Total text length:', fullText.length);
    console.log('First 50 lines:', fullText.split('\n').slice(0, 50).join('\n'));

    if (catalogType === 'rv_marine') {
      return parseRVMarineCatalog(fullText);
    }
    return parseMotorcycleCatalog(fullText);
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Parse motorcycle/powersports catalog
function parseMotorcycleCatalog(text: string): Partial<InventoryItem>[] {
  const items: Partial<InventoryItem>[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  console.log('Total lines:', lines.length);

  // Pattern: ItemNum Zone Year Make Model...
  // Example line: "1000 HD1 2022 HARLEY-DAVIDSON FXBBS STREET BOB 114"
  // Or multiline: item info spread across multiple lines

  // Try line-by-line first - look for lines starting with 4-digit item number
  const itemLineRegex = /^(\d{4})\s+([A-Z]{1,3}\d?)\s+(\d{4})\s+(.+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(itemLineRegex);

    if (match) {
      const [, itemNum, zone, year, rest] = match;

      // Collect next few lines as part of this item until we hit another item number
      let fullBlock = line;
      let j = i + 1;
      while (j < lines.length && !lines[j].match(/^\d{4}\s+[A-Z]{1,3}\d?\s+\d{4}/)) {
        fullBlock += ' ' + lines[j];
        j++;
      }

      const item = parseItemBlock(fullBlock, itemNum);
      if (item && item.make) {
        items.push(item);
      }
    }
  }

  // If line-by-line didn't work well, try blob parsing as fallback
  if (items.length < 10) {
    console.log('Line parsing found few items, trying blob parsing...');
    const blobItems = parseMotorcycleCatalogBlob(text);
    if (blobItems.length > items.length) {
      return blobItems;
    }
  }

  console.log('Parsed motorcycle items:', items.length);
  return items;
}

// Fallback blob-based parsing
function parseMotorcycleCatalogBlob(text: string): Partial<InventoryItem>[] {
  const items: Partial<InventoryItem>[] = [];

  // Find all potential item numbers followed by zone and year pattern
  const itemNumRegex = /\b(\d{4})\s+([A-Z]{1,3}\d?)\s+(\d{4})\s+([A-Z][A-Z\-]+)/g;
  const matches: { match: RegExpExecArray; index: number }[] = [];

  let match;
  while ((match = itemNumRegex.exec(text)) !== null) {
    // Validate: item number should be reasonable (1000-9999 range common)
    const itemNum = parseInt(match[1]);
    if (itemNum >= 1000 && itemNum <= 9999) {
      matches.push({ match, index: match.index });
    }
  }

  console.log('Blob parsing found matches:', matches.length);

  for (let i = 0; i < matches.length; i++) {
    const startIdx = matches[i].index;
    const endIdx = i < matches.length - 1 ? matches[i + 1].index : Math.min(startIdx + 500, text.length);
    const block = text.substring(startIdx, endIdx);

    const item = parseItemBlock(block, matches[i].match[1]);
    if (item && item.make) {
      items.push(item);
    }
  }

  return items;
}

function parseItemBlock(block: string, itemNumber: string): Partial<InventoryItem> | null {
  const item: Partial<InventoryItem> = {
    id: generateId(),
    itemNumber,
    category: 'motorcycles' as Category,
    status: 'unreviewed',
    note: '',
    vin: null,
    maxBid: null,
    buddyTag: null,
    updatedAt: Date.now(),
    location: 'San Diego',
  };

  // Format: Item Zone Yr Brand Model MI/Hr VIN ConditionInfo Book Title Notes
  // "1000 HD1 2022 HARLEY-DAVIDSON FXBBS STREET BOB 114 1699 NB051841 73: EM=9, FR=8, TR=9 $8,595 AZ TITLE"

  // Extract zone and year+make
  const headerMatch = block.match(/^\d{4}\s+([A-Z]{1,3}\d?)\s+(\d{4})\s+([A-Z][A-Z\-]+)/);
  if (!headerMatch) return null;

  item.year = parseInt(headerMatch[2]);
  item.make = headerMatch[3];

  // Find the CR score pattern first - this is reliable anchor point
  // Pattern: "NN: EM=" where NN is 2-3 digit score
  const crMatch = block.match(/(\d{2,3}):\s*EM=/);
  if (crMatch) {
    item.crScore = parseInt(crMatch[1]);
  }

  // Find VIN - it's typically 8 alphanumeric chars right before the CR score
  // VIN pattern: letters/numbers, often starts with a letter, 6-10 chars
  const vinMatch = block.match(/\s([A-Z][A-Z0-9]{5,9})\s+\d{2,3}:/);
  if (vinMatch) {
    item.vin = vinMatch[1];
  }

  // Find mileage - it's a number (or TMU/EXP) right before VIN
  // Look for pattern: space + digits + space + VIN
  const milesPattern = item.vin
    ? new RegExp(`\\s(\\d{1,6}|TMU|EXP)\\s+${item.vin}`)
    : /\s(\d{1,6}|TMU|EXP)\s+[A-Z][A-Z0-9]{5,9}\s+\d{2,3}:/;

  const milesMatch = block.match(milesPattern);
  if (milesMatch) {
    const milesValue = milesMatch[1];
    // Validate it's not the year (shouldn't be 19xx or 20xx if close to header)
    if (milesValue !== 'TMU' && milesValue !== 'EXP') {
      const milesNum = parseInt(milesValue);
      // Only accept as mileage if it's not a year-like number at wrong position
      if (milesNum < 1900 || milesNum > 2030 || milesMatch.index! > 50) {
        item.milesHours = milesValue;
      }
    } else {
      item.milesHours = milesValue === 'TMU' ? 'TMU' : 'Exempt';
    }
  }

  // Now extract model - everything between make and mileage/VIN/CR score
  const makeEnd = block.indexOf(headerMatch[3]) + headerMatch[3].length;

  // Find where model text ends - look for mileage, VIN, or CR score
  let modelEndIndex = block.length;

  if (item.milesHours && milesMatch) {
    modelEndIndex = Math.min(modelEndIndex, milesMatch.index!);
  } else if (item.vin && vinMatch) {
    modelEndIndex = Math.min(modelEndIndex, vinMatch.index!);
  } else if (crMatch) {
    // Back up from CR score to find where model might end
    modelEndIndex = Math.min(modelEndIndex, crMatch.index!);
  }

  if (modelEndIndex > makeEnd) {
    let modelText = block.substring(makeEnd, modelEndIndex).trim();

    // Clean up model - remove trailing numbers that might be mileage
    modelText = modelText.replace(/\s+\d{1,6}$/, '').trim();

    // Remove any VIN-like strings at end
    modelText = modelText.replace(/\s+[A-Z][A-Z0-9]{5,9}$/, '').trim();

    if (modelText) {
      item.model = modelText;
    }
  }

  // Extract book value - look for $X,XXX pattern
  const priceMatch = block.match(/\$\s*([\d,]+)/);
  let bookValue = 0;
  if (priceMatch) {
    bookValue = parseInt(priceMatch[1].replace(/,/g, ''));
  }

  // Extract state and title info - pattern: $price STATE TITLE [notes]
  // State is 2 letters before TITLE
  const titleMatch = block.match(/\$[\d,]+\s+(?:#\s+)?([A-Z]{2})\s+(TITLE\S*)/i);
  if (titleMatch) {
    item.docs = `${titleMatch[1]} TITLE`;

    // Check for notes after TITLE (like "As of 12/15/2025, Est DMV Penalties...")
    const titleEnd = block.indexOf(titleMatch[0]) + titleMatch[0].length;
    const afterTitle = block.substring(titleEnd).trim();

    // Build note with book value and any extra notes
    const notes: string[] = [];
    if (bookValue > 500 && bookValue < 200000) {
      notes.push(`Book: $${bookValue.toLocaleString()}`);
    }
    if (afterTitle && afterTitle.length > 2 && !afterTitle.match(/^\d{4}\s+[A-Z]/)) {
      // Clean up the notes - remove line breaks, extra spaces
      const cleanedNotes = afterTitle
        .replace(/\s+/g, ' ')
        .replace(/^[,.\s]+/, '')
        .substring(0, 200); // Limit length
      if (cleanedNotes && !cleanedNotes.match(/^\d{4}\s/)) {
        notes.push(cleanedNotes);
      }
    }
    item.note = notes.join(' | ');
  } else {
    // No title match, just store book value
    if (bookValue > 500 && bookValue < 200000) {
      item.note = `Book: $${bookValue.toLocaleString()}`;
    }

    // Try simpler docs pattern
    const docsMatch = block.match(/([A-Z]{2})\s+(TITLE|REPO)/i);
    if (docsMatch) {
      item.docs = `${docsMatch[1]} ${docsMatch[2]}`;
    }
  }

  // Build title
  item.title = `${item.year || ''} ${item.make || ''} ${item.model || ''}`.trim();

  return item;
}

// Parse RV/Marine catalog
function parseRVMarineCatalog(text: string): Partial<InventoryItem>[] {
  const items: Partial<InventoryItem>[] = [];
  const lines = text.split('\n');

  console.log('RV catalog lines:', lines.length);

  // Try multiple patterns for finding items

  // Pattern 1: Look for AUCTION #: pattern
  const auctionPattern = /AUCTION\s*#:?\s*(\d+)/gi;
  let match;
  while ((match = auctionPattern.exec(text)) !== null) {
    const auctionNum = match[1];
    const beforeText = text.substring(Math.max(0, match.index - 800), match.index);
    const afterText = text.substring(match.index, match.index + 1200);

    const item = parseRVItem(auctionNum, beforeText, afterText);
    if (item && item.title) {
      items.push(item);
    }
  }

  // Pattern 2: If no AUCTION # found, look for item numbers with year patterns
  if (items.length === 0) {
    console.log('No AUCTION # found, trying alternative patterns...');

    // Look for year followed by make/model patterns
    const yearMakePattern = /\b(20[0-2]\d|19\d{2})\s+([A-Z][A-Z\-]+(?:\s+[A-Z][A-Z\-]+)*)/g;
    const foundYears: { year: string; make: string; index: number }[] = [];

    while ((match = yearMakePattern.exec(text)) !== null) {
      foundYears.push({ year: match[1], make: match[2], index: match.index });
    }

    console.log('Found year/make patterns:', foundYears.length);

    // Also look for item/lot numbers
    const lotPattern = /(?:ITEM|LOT|#)\s*:?\s*(\d{3,5})/gi;
    const lotNumbers: { num: string; index: number }[] = [];
    while ((match = lotPattern.exec(text)) !== null) {
      lotNumbers.push({ num: match[1], index: match.index });
    }

    console.log('Found lot numbers:', lotNumbers.length);
  }

  console.log('Parsed RV/Marine items:', items.length);
  return items;
}

function parseRVItem(itemNumber: string, beforeText: string, afterText: string): Partial<InventoryItem> | null {
  const item: Partial<InventoryItem> = {
    id: generateId(),
    itemNumber,
    category: 'rv_marine' as Category,
    status: 'unreviewed',
    note: '',
    maxBid: null,
    buddyTag: null,
    updatedAt: Date.now(),
    location: 'San Diego',
  };

  // Find year and vehicle name - look for 4-digit year followed by text
  // Try multiple patterns
  let vehicleMatch = beforeText.match(/\b(20[0-2]\d|19\d{2})\s+([A-Z][A-Z\s\-\/]+?)(?=\s*(?:LOCATION|VIN|$))/i);

  if (!vehicleMatch) {
    // Try simpler pattern: just year followed by uppercase words
    vehicleMatch = beforeText.match(/\b(20[0-2]\d)\s+([A-Z][A-Z0-9\s\-]+)/i);
  }

  if (vehicleMatch) {
    item.year = parseInt(vehicleMatch[1]);
    const fullName = vehicleMatch[2].trim().replace(/\s+/g, ' ');

    // Split into make and model
    const parts = fullName.split(/\s+/);

    // Common RV/marine makes to help identify where make ends
    const knownMakes = ['JAYCO', 'THOR', 'FOREST RIVER', 'KEYSTONE', 'COACHMEN', 'WINNEBAGO',
                        'FLEETWOOD', 'NEWMAR', 'ENTEGRA', 'TIFFIN', 'AIRSTREAM', 'HEARTLAND',
                        'GRAND DESIGN', 'DUTCHMEN', 'CROSSROADS', 'PALOMINO', 'STARCRAFT',
                        'SEA RAY', 'BAYLINER', 'YAMAHA', 'KAWASAKI', 'TRACKER', 'BASS'];

    // Check if first 1-2 words are a known make
    let makeWords = 1;
    const firstTwo = parts.slice(0, 2).join(' ').toUpperCase();
    if (knownMakes.some(m => firstTwo.startsWith(m))) {
      makeWords = 2;
    }

    item.make = parts.slice(0, makeWords).join(' ');
    item.model = parts.slice(makeWords).join(' ');
    item.title = `${item.year} ${item.make} ${item.model}`.trim();
  }

  // CR score - try multiple patterns
  let crMatch = afterText.match(/CONDITION\s*REPORT:?\s*(\d+)/i);
  if (!crMatch) crMatch = afterText.match(/CR:?\s*(\d+)/i);
  if (!crMatch) crMatch = afterText.match(/SCORE:?\s*(\d+)/i);
  if (crMatch) {
    item.crScore = parseInt(crMatch[1]);
  }

  // Book value
  let bookMatch = afterText.match(/BOOK\s*(?:VALUE)?:?\s*\$?\s*([\d,]+)/i);
  if (!bookMatch) bookMatch = afterText.match(/VALUE:?\s*\$?\s*([\d,]+)/i);
  if (!bookMatch) bookMatch = afterText.match(/\$\s*([\d,]+)/);
  if (bookMatch) {
    const bookValue = parseInt(bookMatch[1].replace(/,/g, ''));
    if (bookValue > 1000 && bookValue < 500000) {
      item.note = `Book: $${bookValue.toLocaleString()}`;
    }
  }

  // Docs
  const docsMatch = afterText.match(/DOCS?:?\s*([A-Z]{2}\s+TITLE)/i);
  if (docsMatch) {
    item.docs = docsMatch[1];
  }

  // Mileage
  let miMatch = afterText.match(/Mi(?:les)?\/H(?:ou)?[rR]s?:?\s*(\S+)/i);
  if (!miMatch) miMatch = afterText.match(/MILES?:?\s*(\d+)/i);
  if (miMatch) {
    item.milesHours = miMatch[1] === 'EXP' || miMatch[1] === 'EXEMPT' ? 'Exempt' : miMatch[1];
  }

  return item.title ? item : null;
}

// Legacy export for backwards compatibility
export async function parsePDF(file: File): Promise<any[]> {
  return parseCatalogPDF(file, 'motorcycles');
}
