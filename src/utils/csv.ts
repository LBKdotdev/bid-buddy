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

export function detectCategory(make: string, model: string): Category {
  const m = make.toUpperCase();
  const mod = model.toUpperCase();
  const combined = `${m} ${mod}`;

  // --- Golf carts (check first — short list, unambiguous) ---
  if (m.includes('CLUB CAR') || m.includes('EZGO') || m.includes('E-Z-GO') ||
      m.includes('TOMBERLIN') || m.includes('ICON EV') ||
      combined.includes('GOLF CART') || combined.includes('GOLF CAR')) {
    return 'golf';
  }
  // Yamaha golf carts (Drive, G29, etc.)
  if (m.includes('YAMAHA') && (mod.includes('DRIVE') || mod.includes('G29') ||
      mod.includes('G22') || mod.includes('GOLF'))) {
    return 'golf';
  }

  // --- RV / Marine / PWC ---
  if (m.includes('SEA-DOO') || m.includes('SEA DOO') || m.includes('SEADOO')) return 'rv_marine';
  if (combined.includes('WAVERUNNER') || combined.includes('WAVE RUNNER')) return 'rv_marine';
  if (combined.includes('JET SKI') || combined.includes('JETSKI')) return 'rv_marine';
  if (combined.includes('BOAT') || combined.includes('PONTOON') || combined.includes('TRAILER') ||
      combined.includes('PWC') || combined.includes('PERSONAL WATERCRAFT')) return 'rv_marine';
  // Kawasaki Jet Ski models
  if (m.includes('KAWASAKI') && (mod.includes('ULTRA') || mod.includes('STX') ||
      mod.includes('SX-R') || mod.includes('SXR'))) return 'rv_marine';

  // --- ATV / SxS (check before motorcycles — some brands overlap) ---
  // Can-Am ATV/SxS models
  if ((m.includes('CAN-AM') || m.includes('CAN AM') || m.includes('CANAM')) &&
      (mod.includes('MAVERICK') || mod.includes('OUTLANDER') || mod.includes('COMMANDER') ||
       mod.includes('DEFENDER') || mod.includes('DS ') || mod.includes('RENEGADE'))) {
    return 'atv_sxs';
  }
  // Polaris ATV/SxS (everything except Slingshot)
  if (m.includes('POLARIS') && !mod.includes('SLINGSHOT')) {
    return 'atv_sxs';
  }
  // Honda ATV/SxS models
  if (m.includes('HONDA') && (mod.includes('TRX') || mod.includes('TALON') ||
      mod.includes('PIONEER') || mod.includes('FOREMAN') || mod.includes('RANCHER') ||
      mod.includes('FOURTRAX') || mod.includes('RINCON') || mod.includes('RECON'))) {
    return 'atv_sxs';
  }
  // Yamaha ATV/SxS models
  if (m.includes('YAMAHA') && (mod.includes('YFZ') || mod.includes('RAPTOR') ||
      mod.includes('WOLVERINE') || mod.includes('VIKING') || mod.includes('GRIZZLY') ||
      mod.includes('KODIAK') || mod.includes('YXZ') || mod.includes('RMAX'))) {
    return 'atv_sxs';
  }
  // Kawasaki ATV/SxS models
  if (m.includes('KAWASAKI') && (mod.includes('TERYX') || mod.includes('BRUTE FORCE') ||
      mod.includes('KFX') || mod.includes('MULE') || mod.includes('BAYOU'))) {
    return 'atv_sxs';
  }
  // Dedicated ATV/SxS brands
  if (m.includes('ARCTIC CAT') || m.includes('TEXTRON') || m.includes('CF MOTO') ||
      m.includes('CFMOTO') || m.includes('HISUN') || m.includes('KYMCO')) {
    return 'atv_sxs';
  }
  // Generic ATV/SxS/UTV keywords
  if (combined.includes('ATV') || combined.includes('UTV') || combined.includes('SIDE BY SIDE') ||
      combined.includes('SIDE-BY-SIDE') || combined.includes('SXS')) {
    return 'atv_sxs';
  }

  // --- Everything else defaults to motorcycles ---
  return 'motorcycles';
}

export function csvRowToInventoryItem(
  row: CSVRow,
  _category?: Category,
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

  // Auto-detect category from make/model
  const category = detectCategory(make, model);

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
