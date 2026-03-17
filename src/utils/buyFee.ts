interface FeeRange {
  min: number;
  max: number;
  fee: number;
}

const FEE_TABLE: FeeRange[] = [
  { min: 0, max: 499, fee: 105 },
  { min: 500, max: 999, fee: 155 },
  { min: 1000, max: 1999, fee: 185 },
  { min: 2000, max: 2999, fee: 230 },
  { min: 3000, max: 3999, fee: 260 },
  { min: 4000, max: 4999, fee: 290 },
  { min: 5000, max: 5999, fee: 320 },
  { min: 6000, max: 6999, fee: 350 },
  { min: 7000, max: 7999, fee: 380 },
  { min: 8000, max: 8999, fee: 405 },
  { min: 9000, max: 9999, fee: 430 },
  { min: 10000, max: 11999, fee: 465 },
  { min: 12000, max: 13999, fee: 505 },
  { min: 14000, max: 15999, fee: 540 },
  { min: 16000, max: 17999, fee: 575 },
  { min: 18000, max: 19999, fee: 610 },
  { min: 20000, max: 21999, fee: 650 },
  { min: 22000, max: 23999, fee: 690 },
  { min: 24000, max: 25999, fee: 730 },
  { min: 26000, max: 27999, fee: 785 },
  { min: 28000, max: 29999, fee: 855 },
  { min: 30000, max: 34999, fee: 955 },
  { min: 35000, max: 39999, fee: 1095 },
  { min: 40000, max: 44999, fee: 1245 },
  { min: 45000, max: 49999, fee: 1385 },
  { min: 50000, max: 59999, fee: 1560 },
  { min: 60000, max: 69999, fee: 1710 },
  { min: 70000, max: 79999, fee: 1860 },
  { min: 80000, max: 89999, fee: 2060 },
  { min: 90000, max: 99999, fee: 2260 },
  { min: 100000, max: 124999, fee: 2760 },
  { min: 125000, max: 149999, fee: 3360 },
  { min: 150000, max: 174999, fee: 3960 },
  { min: 175000, max: 199999, fee: 4560 },
  { min: 200000, max: 999999, fee: 5550 },
];

export function getBuyFee(bid: number | string): number | null {
  const bidNum = typeof bid === 'string' ? parseFloat(bid.replace(/[^0-9.]/g, '')) : bid;

  if (isNaN(bidNum) || bidNum < 0) return null;

  for (const range of FEE_TABLE) {
    if (bidNum >= range.min && bidNum <= range.max) {
      return range.fee;
    }
  }

  return null;
}

export function getTotalDue(bid: number | string): number | null {
  const bidNum = typeof bid === 'string' ? parseFloat(bid.replace(/[^0-9.]/g, '')) : bid;
  const fee = getBuyFee(bidNum);

  if (fee === null || isNaN(bidNum)) return null;

  return bidNum + fee;
}

export function getFeeDetails(bid: number | string): {
  bid: number;
  fee: number;
  total: number;
  range: string;
} | null {
  const bidNum = typeof bid === 'string' ? parseFloat(bid.replace(/[^0-9.]/g, '')) : bid;

  if (isNaN(bidNum) || bidNum < 0) return null;

  for (const range of FEE_TABLE) {
    if (bidNum >= range.min && bidNum <= range.max) {
      return {
        bid: bidNum,
        fee: range.fee,
        total: bidNum + range.fee,
        range: `${range.min.toLocaleString()} to ${range.max.toLocaleString()}`,
      };
    }
  }

  return null;
}
