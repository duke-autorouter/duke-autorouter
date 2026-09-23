import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from './solution.mjs';
test('aggregates and preserves input', () => { const rows=[{category:'venue',cents:40000},{category:'print',cents:20000},{category:'venue',cents:10000}]; const result=summarize(rows); assert.deepEqual({...result.totals},{venue:50000,print:20000}); assert.equal(result.grandTotal,70000); assert.deepEqual(rows,[{category:'venue',cents:40000},{category:'print',cents:20000},{category:'venue',cents:10000}]); });
test('empty and special category', () => { const empty=summarize([]); assert.deepEqual({...empty.totals},{}); assert.equal(empty.grandTotal,0); const special=summarize([{category:'__proto__',cents:7}]); assert.equal(Object.hasOwn(special.totals,'__proto__'),true); assert.equal(special.totals['__proto__'],7); assert.equal(special.grandTotal,7); });
test('rejects invalid cents', () => { for (const cents of [-1,1.5,NaN]) assert.throws(() => summarize([{category:'x',cents}]), RangeError); });
