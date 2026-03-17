import type { InventoryItem, Category, CSVRow } from '../types/inventory';

export function parseCSV(csvText: string): CSVRow[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: CSVRow = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function generateHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function generateId(row: CSVRow): string {
  const sourceUrl = row.sourceUrl || row.SourceUrl || row.url || '';
  if (sourceUrl) return sourceUrl;

  const vin = row.vin || row.VIN || row.Vin || '';
  if (vin) return vin;

  const title = row.title || row.Title || '';
  const milesHours = row.milesHours || row['Miles/Hours'] || row.miles || row.hours || '';
  const photoUrl = row.photoUrl || row.PhotoUrl || row.photo || '';
  const hashInput = `${title}${milesHours}${photoUrl}`;

  return generateHash(hashInput);
}

export function csvRowToInventoryItem(
  row: CSVRow,
  category: Category,
  existingItem?: InventoryItem
): InventoryItem | null {
  const location = row.location || row.Location || 'San Diego';
  if (location !== 'San Diego') return null;

  const itemNumber = row.itemNumber || row['Item #'] || row.ItemNumber || row['Item#'] || '';
  const id = generateId(row);

  const year = parseInt(row.year || row.Year || '');
  const crScore = parseInt(row.crScore || row.CRScore || row['CR Score'] || row.Score || '');

  const make = row.make || row.Make || row.Brand || row.brand || '';
  const model = row.model || row.Model || row.Description || row.Desc || '';

  // Build title from components, even if some are missing
  const titleParts = [year, make, model].filter(Boolean);
  const title = row.title || row.Title || titleParts.join(' ') || '';

  return {
    id,
    itemNumber,
    category,
    title,
    year: isNaN(year) ? null : year,
    make,
    model,
    vin: row.vin || row.VIN || row.Vin || null,
    milesHours: row.milesHours || row['Miles/Hours'] || row['Mi/Hr'] || row.miles || row.hours || null,
    crScore: isNaN(crScore) ? null : crScore,
    docs: row.docs || row.Docs || row.Documents || row['Vehicle Doc'] || row.VehicleDoc || null,
    location: 'San Diego',
    photoUrl: row.photoUrl || row.PhotoUrl || row.photo || null,
    sourceUrl: row.sourceUrl || row.SourceUrl || row.url || '',
    status: existingItem?.status || 'unreviewed',
    note: existingItem?.note || '',
    maxBid: existingItem?.maxBid || null,
    buddyTag: existingItem?.buddyTag || null,
    updatedAt: Date.now(),
  };
}
