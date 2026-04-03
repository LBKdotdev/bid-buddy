/**
 * Strip NPA internal manufacturer codes from model strings.
 *
 * NPA catalogs include internal codes like "KRT800GJF TERYX4 LE" where
 * "KRT800GJF" is a part number nobody searches on eBay/CL/FB. Consumers
 * search "Kawasaki Teryx4 LE".
 *
 * Pattern: 2+ uppercase letters, 3+ digits, then 2+ more letters.
 * Matches: KRT800GJF, KAF820DKFNN, KLX300ECFNN
 * Preserves: FXBBS (Harley), TERYX4, KLX300, Z900, STREET BOB
 */

// NPA internal code: letters-digits-letters (e.g., KRT800GJF)
const NPA_CODE_REGEX = /^[A-Z]{2,}\d{3,}[A-Z]{2,}\w*$/;

export function cleanNpaModel(model: string): string {
  if (!model) return model;

  const tokens = model.trim().split(/\s+/);
  if (tokens.length <= 1) return model; // single token = nothing to strip

  // If the first token looks like an NPA internal code, drop it
  if (NPA_CODE_REGEX.test(tokens[0])) {
    return tokens.slice(1).join(' ');
  }

  return model;
}
