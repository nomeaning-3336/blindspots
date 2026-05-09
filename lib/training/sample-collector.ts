export function collectSampledQueueItems<T, TResult>(
  items: T[],
  count: number,
  mapItem: (item: T, index: number) => TResult[],
): TResult[] {
  if (count <= 0) return [];

  const results: TResult[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const mapped = mapItem(items[index]!, index);
    if (mapped.length === 0) continue;

    for (const entry of mapped) {
      results.push(entry);
      if (results.length >= count) {
        return results;
      }
    }
  }

  return results;
}
