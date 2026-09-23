export function summarize(rows) {
  const totals = Object.create(null);
  let grandTotal = 0;
  for (const row of rows) {
    const { category, cents } = row;
    if (!Number.isInteger(cents) || cents < 0) {
      throw new RangeError('cents must be a nonnegative integer');
    }
    totals[category] = (totals[category] ?? 0) + cents;
    grandTotal += cents;
  }
  return { totals, grandTotal };
}
