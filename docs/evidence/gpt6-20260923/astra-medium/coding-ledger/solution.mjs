export function summarize(rows) {
  // A null prototype keeps all category names literal, including __proto__.
  const totals = Object.create(null);
  let grandTotal = 0;

  for (const { category, cents } of rows) {
    if (!Number.isInteger(cents) || cents < 0) {
      throw new RangeError('cents must be a nonnegative integer');
    }
    totals[category] = (totals[category] ?? 0) + cents;
    grandTotal += cents;
  }

  return { totals, grandTotal };
}
