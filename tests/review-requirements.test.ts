import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewRequirementClauses } from '../server/review-focus.js';

test('separates independently testable clauses in the frozen writing rubric', () => {
  assert.deepEqual(
    reviewRequirementClauses('Accessibility remains unconfirmed if mentioned; no invented facts, links, or promises'),
    ['Accessibility remains unconfirmed if mentioned', 'no invented facts, links, or promises'],
  );
  assert.deepEqual(
    reviewRequirementClauses('Subject, greeting, body, signoff; 90-140 words'),
    ['Subject, greeting, body, signoff', '90-140 words'],
  );
});

test('keeps quoted, code, and bracketed semicolons inside their clause', () => {
  assert.deepEqual(
    reviewRequirementClauses('Include "yes; maybe", `a; b`, and (red; blue); show a count'),
    ['Include "yes; maybe", `a; b`, and (red; blue)', 'show a count'],
  );
  assert.deepEqual(
    reviewRequirementClauses("Don't say 'done; shipped'; keep it tentative"),
    ["Don't say 'done; shipped'", 'keep it tentative'],
  );
});

test('does not fabricate requirements from empty or unmatched punctuation', () => {
  assert.deepEqual(reviewRequirementClauses('  ; ; first ; ; second ; '), ['first', 'second']);
  assert.deepEqual(reviewRequirementClauses('Example `a; b; then continue'), ['Example `a; b; then continue']);
});

test('preserves dependent negation and protected punctuation before sentence splitting', () => {
  assert.deepEqual(
    reviewRequirementClauses('Do not add comments; logging; or new dependencies. Include “ready; set”, ‘go. now’, and `x; y`. Dr. Lee approves the draft.'),
    ['Do not add comments; logging; or new dependencies.', 'Include “ready; set”, ‘go. now’, and `x; y`.', 'Dr. Lee approves the draft.'],
  );
  assert.deepEqual(
    reviewRequirementClauses('If approved, include (alpha; beta). Keep U.S. dates. Do not publish.'),
    ['If approved, include (alpha; beta).', 'Keep U.S. dates.', 'Do not publish.'],
  );
  assert.deepEqual(
    reviewRequirementClauses("Don't add comments; logging; or new dependencies. If this is a dry run, do not add comments; logging; or new dependencies. Use e.g. Lodash only if already installed."),
    ["Don't add comments; logging; or new dependencies.", 'If this is a dry run, do not add comments; logging; or new dependencies.', 'Use e.g. Lodash only if already installed.'],
  );
  assert.deepEqual(
    reviewRequirementClauses('Keep `first line;\nsecond line. still code`; then check "sentence. inside quote". Finish.'),
    ['Keep `first line;\nsecond line. still code`', 'then check "sentence. inside quote".', 'Finish.'],
  );
});
