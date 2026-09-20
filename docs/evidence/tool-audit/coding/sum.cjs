'use strict';

/**
 * Sum only finite JavaScript numbers in an array.
 * @param {unknown[]} values
 * @returns {number}
 */
function sumNumbers(values) {
  return values.reduce((total, value) => (
    typeof value === 'number' && Number.isFinite(value)
      ? total + value
      : total
  ), 0);
}

module.exports = { sumNumbers };
