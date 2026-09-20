# Documents and spreadsheets

Read supported inputs with read_file. It extracts Word main text, PDF text and
spreadsheet cells/formulas; extraction notes identify missing content. Use
preview_file for images and layout. Scanned PDFs have no built-in OCR.

Use create_artifact for basic Word, PDF, Markdown, HTML and XLSX deliverables.
Word and PDF content accepts Markdown headings, emphasis, lists and tables.
Use actual typed spreadsheet values and explicit {"formula":"SUM(B2:B4)"}
cells for derived results. Named sheets support ordinary multi-sheet workbooks.
Formula-like strings stay text. Supported formulas are recalculated; unsupported
formulas and errors must be resolved or reported, never replaced with invented
values. These tools do not preserve every feature of an existing Office file.

Reopen every saved deliverable with read_file, check required facts and totals,
then use preview_file. Inspect each PDF page. Word Quick Look may show only
the first page. XLSX previews show a saved-cell grid; choose each relevant sheet
and range, and use read_file to check recalculated formulas. The grid does not
establish native Excel layout or chart appearance. State those limits.
Fix clipping, raw Markdown, unreadable
tables or incorrect data, then repeat the affected checks. A valid file is not
proof of correct content, layout or formulas. Do not claim complete visual QA
from a limited preview. Return project-relative paths and a concise result.
