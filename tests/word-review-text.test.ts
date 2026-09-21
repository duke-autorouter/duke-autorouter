import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordReviewText } from '../server/task-evidence.js';

test('review evidence retains each responsibility and status in its actual table row', () => {
  const text = wordReviewText(
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Owner</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Status</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Sam</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Trial not run</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
  );
  const rows = [...text.matchAll(/\[row\]([\s\S]*?)\[\/row\]/g)].map((x) => x[1]);
  assert.equal(rows.length, 2);
  assert.match(rows[1], /\[cell\] Sam\s*\[\/cell\]\s*\[cell\] Trial not run\s*\[\/cell\]/);
  assert.ok(!rows[0].includes('Sam'));
});

test('ordinary paragraphs and escaped literal markup remain text', () => {
  assert.equal(
    wordReviewText('<w:p><w:r><w:t>A &amp; B &lt;w:tr&gt;</w:t></w:r></w:p>'),
    'A & B <w:tr>\n',
  );
});
