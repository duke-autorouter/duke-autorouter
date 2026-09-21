import { test } from 'node:test';
import assert from 'node:assert/strict';
import { researchHTMLText } from '../server/web.js';

test('source retractions stay distinguishable from the replacement guidance', () => {
  const text = researchHTMLText(
    '<p><s>Use the old <a href="/mode">mode</a>.</s> Since version 2, use the new mode.</p>',
  );
  assert.equal(
    text,
    '[source text marked deleted or struck through: Use the old mode . :end marked text] Since version 2, use the new mode.',
  );
});

test('deleted and inserted source wording survive nested formatting and case variations', () => {
  const text = researchHTMLText(
    '<DEL datetime="2020"><b>Old</b> claim</DEL><INS>New &amp; current claim</INS><STRIKE>Other old claim</STRIKE>',
  );
  assert.match(text, /marked deleted or struck through: Old claim :end marked text/);
  assert.match(text, /source insertion: New & current claim :end insertion/);
  assert.match(text, /marked deleted or struck through: Other old claim/);
});

test('scripts and styles cannot supply source revision markers', () => {
  const text = researchHTMLText(
    '<style>s { color:red }</style><script>"<s>hidden</s>"</script><p>Visible &lt;s&gt; literal</p>',
  );
  assert.equal(text, 'Visible <s> literal');
});
