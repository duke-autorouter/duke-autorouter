export function countTags(tags) {
  const counts = {};
  for (const tag of tags) {
    if (typeof tag !== 'string') {
      throw new TypeError('Each tag must be a string');
    }
    if (Object.hasOwn(counts, tag)) {
      counts[tag] += 1;
    } else {
      Object.defineProperty(counts, tag, {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }
  return counts;
}
