# AbortSignal.timeout() — audited research

**Timeout behavior.** MDN documents that `AbortSignal.timeout(time)` returns an `AbortSignal` that automatically aborts after the specified **active** time (milliseconds), not simply elapsed wall-clock time. On timeout, its `reason` is a `TimeoutError` `DOMException`. Active time is effectively paused in a suspended worker or while a document is in the back-forward cache (bfcache).

**Compatibility consideration.** MDN labels the feature “Baseline 2024 / Newly available” and notes that it may not work in older browsers/devices. Its example handles an unsupported implementation as a `TypeError`; compatibility should therefore be checked if supporting older environments.

**Official source URL.** https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static

**Browser verification.** I opened the official MDN source in the browser and received/inspected a screenshot. It shows the MDN “AbortSignal: timeout() static method” page, the Baseline 2024 compatibility banner, and the visible explanation that the signal aborts after a specified time with a `TimeoutError` and uses active rather than elapsed time.

**Additional requested source.** web_read extracted the title text from the W3C PDF as: “Dummy PDF file” (page 1). Source: https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf

## Evidence
- Discovery: web_search for the official MDN page (search results were used only to locate the source).
- Source body: web_read of the MDN URL above.
- Browser: browser open/read and screenshot of the same official URL.
- PDF body: web_read of the W3C PDF above.
