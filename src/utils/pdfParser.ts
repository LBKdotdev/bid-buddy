import * as pdfjsLib from 'pdfjs-dist';
import type { InventoryItem, Category } from '../types/inventory';
import { detectCategory } from './csv';

// Use unpkg CDN for the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

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

  items.sort((a: any, b: any) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 5) return yDiff;
    return a.x - b.x;
  });

  const lines: { y: number; items: any[] }[] = [];
  for (const item of items) {
    const existingLine = lines.find(l => Math.abs(l.y - item.y) < 5);
    if (existingLine) {
      existingLine.items.push(item);
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }

  return lines
    .map(line => {
      line.items.sort((a: any, b: any) => a.x - b.x);
      return line.items.map((i: any) => i.text).join(' ');
    })
    .join('\n');
}

// Auto-detect catalog type from filename
function detectCatalogType(filename: string): 'motorcycles' | 'rv_marine' {
  const upper = filename.toUpperCase();
  if (upper.includes('RVM') || upper.includes('RV') || upper.includes('MARINE')) {
    return 'rv_marine';
  }
  return 'motorcycles';
}

// Main entry point — auto-detects catalog type from filename if not provided
export async function parseCatalogPDF(
  file: File,
  catalogType?: 'motorcycles' | 'rv_marine'
): Promise<Partial<InventoryItem>[]> {
  const type = catalogType || detectCatalogType(file.name);

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

    console.log(`Parsing ${type} catalog, ${pdf.numPages} pages, ${fullText.length} chars`);

    if (type === 'rv_marine') {
      return parseRVMarineCatalog(fullText);
    }
    return parseMotorcycleCatalog(fullText);
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Legacy export — now routes through auto-detect
export async function parsePDF(file: File): Promise<Partial<InventoryItem>[]> {
  return parseCatalogPDF(file);
}

// ═══════════════════════════════════════════════════════
// MOTORCYCLE CATALOG PARSER
// Format: tabular, one line per item
// Item | Zone | Yr | Brand | Model | MI/Hr | VIN | CR: EM=x,FR=x,TR=x | $Book | State TITLE Notes
// ═══════════════════════════════════════════════════════

function parseMotorcycleCatalog(text: string): Partial<InventoryItem>[] {
  const items: Partial<InventoryItem>[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // Pattern: 4-digit item number, zone code, 4-digit year, then brand
  const itemLineRegex = /^(\d{4})\s+([A-Z]{1,4}\d?)\s+(\d{4})\s+(.+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(itemLineRegex);

    if (match) {
      // Collect continuation lines until next item
      let fullBlock = line;
      let j = i + 1;
      while (j < lines.length && !lines[j].match(/^\d{4}\s+[A-Z]{1,4}\d?\s+\d{4}/)) {
        // Stop at page footer lines
        if (lines[j].match(/^(Notes:|Legend:|Page No:)/)) break;
        fullBlock += ' ' + lines[j];
        j++;
      }

      const item = parseMotoItem(fullBlock, match[1], match[2]);
      if (item && item.make) {
        items.push(item);
      }
    }
  }

  // Fallback blob parsing if line-by-line found few items
  if (items.length < 10) {
    const blobItems = parseMotoBlob(text);
    if (blobItems.length > items.length) return blobItems;
  }

  console.log('Parsed motorcycle items:', items.length);
  return items;
}

function parseMotoItem(block: string, itemNumber: string, zone: string): Partial<InventoryItem> | null {
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
    zone,
    color: null,
    bookValue: null,
    conditionDetail: null,
  };

  // Extract year and make from header
  const headerMatch = block.match(/^\d{4}\s+[A-Z]{1,4}\d?\s+(\d{4})\s+([A-Z][A-Z\-]+)/);
  if (!headerMatch) return null;

  item.year = parseInt(headerMatch[1]);
  item.make = headerMatch[2];

  // Extract CR score and subscores — order varies: "73: EM=9, FR=8, TR=9" or "76: EM=5, TR=9, FR=8" or "87: TR=9, FR=9, MTR=9"
  const crMatch = block.match(/(\d{2,3}):\s*((?:[A-Z]+=\d+[,\s]*){2,})/);
  if (crMatch) {
    item.crScore = parseInt(crMatch[1]);
    item.conditionDetail = crMatch[2].replace(/\s+/g, '').replace(/,$/, '');
  }

  // VIN — alphanumeric chars before the CR score pattern
  const vinMatch = block.match(/\s([A-Z0-9][A-Z0-9]{5,9})\s+\d{2,3}:\s*[A-Z]+=/);
  if (vinMatch) {
    item.vin = vinMatch[1];
  }

  // Mileage — number or TMU/EXP before VIN
  const milesPattern = item.vin
    ? new RegExp(`\\s(\\d{1,6}|TMU|EXP)\\s+${item.vin}`)
    : /\s(\d{1,6}|TMU|EXP)\s+[A-Z0-9][A-Z0-9]{5,9}\s+\d{2,3}:\s*[A-Z]+=/;

  const milesMatch = block.match(milesPattern);
  if (milesMatch) {
    const val = milesMatch[1];
    if (val === 'TMU') item.milesHours = 'TMU';
    else if (val === 'EXP') item.milesHours = 'Exempt';
    else {
      const num = parseInt(val);
      if (num < 1900 || num > 2030 || milesMatch.index! > 50) {
        item.milesHours = val;
      }
    }
  }

  // Model — everything between make and mileage/VIN/CR
  const makeEnd = block.indexOf(headerMatch[2]) + headerMatch[2].length;
  let modelEndIndex = block.length;

  if (milesMatch) modelEndIndex = Math.min(modelEndIndex, milesMatch.index!);
  else if (vinMatch) modelEndIndex = Math.min(modelEndIndex, vinMatch.index!);
  else if (crMatch) modelEndIndex = Math.min(modelEndIndex, crMatch.index!);

  if (modelEndIndex > makeEnd) {
    let modelText = block.substring(makeEnd, modelEndIndex).trim();
    modelText = modelText.replace(/\s+\d{1,6}$/, '').trim();
    modelText = modelText.replace(/\s+[A-Z0-9][A-Z0-9]{5,9}$/, '').trim();
    if (modelText) item.model = modelText;
  }

  // Book value — $X,XXX pattern
  const priceMatch = block.match(/\$\s*([\d,]+)/);
  if (priceMatch) {
    const bv = parseInt(priceMatch[1].replace(/,/g, ''));
    if (bv > 500 && bv < 200000) item.bookValue = bv;
  }

  // Docs — STATE TITLE pattern
  const titleMatch = block.match(/\$[\d,]+\s+(?:#\s+)?([A-Z]{2})\s+(TITLE\S*|REPO\s+TITLE\S*|TTILE\S*)/i);
  if (titleMatch) {
    item.docs = `${titleMatch[1]} ${titleMatch[2]}`.replace(/\s+/g, ' ').trim();
  } else {
    const simpleDocsMatch = block.match(/([A-Z]{2})\s+(TITLE|REPO\s+TITLE|TTILE)/i);
    if (simpleDocsMatch) {
      item.docs = `${simpleDocsMatch[1]} ${simpleDocsMatch[2]}`.replace(/\s+/g, ' ').trim();
    }
  }

  // DMV penalties
  const dmvMatch = block.match(/Est\s+DMV\s+Penalties.*?\$([\d,.]+)/i);
  const penaltyNote = dmvMatch ? `DMV Penalty: $${dmvMatch[1]}` : '';

  // Build note
  const notes: string[] = [];
  if (item.bookValue) notes.push(`Book: $${item.bookValue.toLocaleString()}`);
  if (penaltyNote) notes.push(penaltyNote);

  // CPO candidate — # marker
  if (block.includes(' # ') || block.match(/\$[\d,]+\s+#/)) {
    notes.push('CPO Candidate');
  }

  // Extra notes after TITLE
  if (titleMatch) {
    const titleEnd = block.indexOf(titleMatch[0]) + titleMatch[0].length;
    const afterTitle = block.substring(titleEnd).trim()
      .replace(/\s+/g, ' ')
      .replace(/^[,.\s]+/, '')
      .replace(/As\s*of\s*\d{1,2}\/\d{1,2}\/\d{4},?\s*/gi, '')
      .replace(/Est\s+DMV\s+Penalties\s+in\s+[A-Z]{2}:\s*\$[\d,.]+\.?\s*Subject\s+to\s+change\.?\s*/gi, '')
      .trim();
    if (afterTitle && afterTitle.length > 2 && !afterTitle.match(/^\d{4}\s/)) {
      notes.push(afterTitle.substring(0, 150));
    }
  }
  item.note = notes.join(' | ');

  // Auto-detect category from make/model
  item.category = detectCategory(item.make || '', item.model || '');

  // Build title
  item.title = `${item.year || ''} ${item.make || ''} ${item.model || ''}`.trim();

  return item;
}

// Fallback blob-based parsing
function parseMotoBlob(text: string): Partial<InventoryItem>[] {
  const items: Partial<InventoryItem>[] = [];
  const itemNumRegex = /\b(\d{4})\s+([A-Z]{1,4}\d?)\s+(\d{4})\s+([A-Z][A-Z\-]+)/g;
  const matches: { match: RegExpExecArray; index: number }[] = [];

  let match;
  while ((match = itemNumRegex.exec(text)) !== null) {
    const itemNum = parseInt(match[1]);
    if (itemNum >= 1000 && itemNum <= 9999) {
      matches.push({ match, index: match.index });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const startIdx = matches[i].index;
    const endIdx = i < matches.length - 1 ? matches[i + 1].index : Math.min(startIdx + 500, text.length);
    const block = text.substring(startIdx, endIdx);

    const item = parseMotoItem(block, matches[i].match[1], matches[i].match[2]);
    if (item && item.make) {
      items.push(item);
    }
  }

  return items;
}

// ═══════════════════════════════════════════════════════
// RVM CATALOG PARSER
// Format: block-based, ~2 pages per item
// Title line → structured fields → condition detail grid
// ═══════════════════════════════════════════════════════

function parseRVMarineCatalog(text: string): Partial<InventoryItem>[] {
  const items: Partial<InventoryItem>[] = [];

  // Split into item blocks by the title pattern: YYYY MAKE MODEL at start of block
  // Each item starts with a year+make line and contains AUCTION #:
  const blocks = splitRVMBlocks(text);

  console.log('RVM blocks found:', blocks.length);

  for (const block of blocks) {
    const item = parseRVMBlock(block);
    if (item && item.title) {
      items.push(item);
    }
  }

  console.log('Parsed RV/Marine items:', items.length);
  return items;
}

function splitRVMBlocks(text: string): string[] {
  const blocks: string[] = [];

  // RVM items start with a year + make title line
  // Pattern: 4-digit year followed by uppercase words (the vehicle title)
  const titlePattern = /^(\d{4})\s+([A-Z][A-Z0-9\s\/\-\.\(\)\*]+)$/gm;
  const matches: { index: number; text: string }[] = [];

  let match;
  while ((match = titlePattern.exec(text)) !== null) {
    const yr = parseInt(match[1]);
    // Filter to reasonable vehicle years
    if (yr >= 1980 && yr <= 2030) {
      matches.push({ index: match.index, text: match[0] });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i < matches.length - 1 ? matches[i + 1].index : text.length;
    blocks.push(text.substring(start, end));
  }

  return blocks;
}

function parseRVMBlock(block: string): Partial<InventoryItem> | null {
  const item: Partial<InventoryItem> = {
    id: generateId(),
    itemNumber: '',
    category: 'rv_marine' as Category,
    status: 'unreviewed',
    note: '',
    maxBid: null,
    buddyTag: null,
    updatedAt: Date.now(),
    location: 'San Diego',
    color: null,
    zone: null,
    bookValue: null,
    conditionDetail: null,
  };

  // Line 1: Year Make Model
  const titleMatch = block.match(/^(\d{4})\s+(.+)/);
  if (!titleMatch) return null;

  item.year = parseInt(titleMatch[1]);
  const fullName = titleMatch[2].trim().replace(/\(\*\)$/, '').trim();

  // Split into make and model using known RVM makes
  const knownMakes = [
    'COLEMAN BY DUTCHMEN', 'HIGHLAND RIDGE RV', 'JAYCO', 'THOR MOTOR COACH',
    'BOUNDER', 'COACHMEN BY FOREST RIVER', 'FOREST RIVER', 'AIRSTREAM',
    'WINNEBAGO', 'FLEETWOOD', 'NEWMAR', 'ENTEGRA', 'TIFFIN', 'HEARTLAND',
    'GRAND DESIGN', 'DUTCHMEN', 'CROSSROADS', 'PALOMINO', 'STARCRAFT',
    'KEYSTONE', 'COACHMEN', 'THOR',
    'YAMAHA', 'KAWASAKI', 'SEADOO/BRP', 'SEA-DOO', 'SEA DOO',
    'CHAPARRAL BOATS', 'REINELL BOAT', 'BAYLINER', 'SEA RAY', 'TRACKER',
    'ZIEMAN TRAILER', 'KARAVAN TRAILER', 'CARSON TRAILERS', 'INTERSTATE',
  ];

  let make = '';
  let model = '';
  const upperName = fullName.toUpperCase();

  // Try longest match first
  const sorted = [...knownMakes].sort((a, b) => b.length - a.length);
  for (const km of sorted) {
    if (upperName.startsWith(km)) {
      make = km;
      model = fullName.substring(km.length).trim();
      break;
    }
  }

  if (!make) {
    // Fallback: first word is make
    const parts = fullName.split(/\s+/);
    make = parts[0];
    model = parts.slice(1).join(' ');
  }

  item.make = make;
  item.model = model;
  item.title = `${item.year} ${make} ${model}`.trim();

  // AUCTION #: may have the number on the same line or the next line
  const auctionMatch = block.match(/AUCTION\s*#:\s*(\d+)/i)
    || block.match(/AUCTION\s*#:\s*[^\n]*\n(\d{4,5})/i);
  if (auctionMatch) item.itemNumber = auctionMatch[1];

  // VIN
  const vinMatch = block.match(/VIN:\s*\|?\s*([A-Z0-9]{10,17})/i);
  if (vinMatch) item.vin = vinMatch[1];

  // CONDITION REPORT: NN
  const crMatch = block.match(/CONDITION\s*REPORT:\s*\|?\s*(\d+)/i);
  if (crMatch) item.crScore = parseInt(crMatch[1]);

  // DOCS: XX TITLE
  const docsMatch = block.match(/DOCS:\s*\|?\s*([A-Z]{2}\s+TITLE\S*)/i);
  if (docsMatch) item.docs = docsMatch[1].trim();

  // Mi/HR
  const miMatch = block.match(/Mi\/H[Rr]:\s*\|?\s*(\S+)/i);
  if (miMatch) {
    const val = miMatch[1].toUpperCase();
    if (val === 'EXP' || val === 'EXEMPT') item.milesHours = 'Exempt';
    else if (val === 'TMU') item.milesHours = 'TMU';
    else item.milesHours = miMatch[1];
  }

  // COLOR
  const colorMatch = block.match(/COLOR:\s*\|?\s*([A-Z\/]+)/i);
  if (colorMatch) item.color = colorMatch[1];

  // BOOK VALUE: $X,XXX.XX
  const bookMatch = block.match(/BOOK\s*VALUE:\s*\|?\s*\$?\s*([\d,.]+)/i);
  if (bookMatch) {
    const bv = parseInt(bookMatch[1].replace(/[,.]/g, '').replace(/00$/, ''));
    // The format is $9,200.00 — parse as dollars
    const bvClean = parseFloat(bookMatch[1].replace(/,/g, ''));
    if (bvClean > 100 && bvClean < 500000) item.bookValue = Math.round(bvClean);
  }

  // Condition detail — find items scoring below 7 (problems worth noting)
  const conditionIssues: string[] = [];
  const conditionPattern = /\*RV2\s*-?\s*([A-Z][A-Z\s\/\-\(\)]+?)\s*\|\s*(\d)\s*\|\s*([A-Z][A-Z\s\/\-\.]+)/gi;
  let condMatch;
  while ((condMatch = conditionPattern.exec(block)) !== null) {
    const score = parseInt(condMatch[2]);
    if (score > 0 && score < 7) {
      const component = condMatch[1].trim().replace(/\s+/g, ' ');
      conditionIssues.push(`${component}:${score}`);
    }
  }
  if (conditionIssues.length > 0) {
    item.conditionDetail = conditionIssues.join(', ');
  }

  // Build note
  const notes: string[] = [];
  if (item.bookValue) notes.push(`Book: $${item.bookValue.toLocaleString()}`);
  if (item.color) notes.push(`Color: ${item.color}`);

  // CR Notes
  const crNotesMatch = block.match(/CR\s*Notes:\s*\|?\s*(.+?)(?=\*RV2|\n\n)/is);
  if (crNotesMatch && crNotesMatch[1].trim() !== 'None') {
    notes.push(crNotesMatch[1].trim().substring(0, 150));
  }

  item.note = notes.join(' | ');

  // Auto-detect category
  item.category = detectCategory(item.make || '', item.model || '');

  return item.itemNumber ? item : null;
}
