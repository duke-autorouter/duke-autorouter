# Spreadsheet grid check: artifacts/audited-inventory.xlsx

Workbook not modified.

## read_file (recalculated)
- Inventory!B6 = SUM(B3:B5) = 15
- Summary!B2 = Inventory!B6 = 15
- Recalculated with xlsx-calc / Formula.js, not native Excel.

## Inventory!A1:B6 image
- A1 note: "Sample data - invented for a tool check. Counts match the source files."
- Hammer 8, Drill 4, Sander 3 (3 items).
- Total row shows 15 (8+4+3 = 15).

## Summary!A1:B2 image
- A1: "Sample data - summary"
- "Total available" = 15, matching the Inventory total.

## Limits
- The previews are saved-cell grids using cached formula values. They do not show native Excel layout, column widths, charts, drawings or merged-cell styling.
- No native Excel layout inspection was done. Only the two requested ranges were viewed.
