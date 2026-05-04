/** Group items by a derived key, preserving input order within each group. */
export function groupBy<T, K>(
  items: readonly T[],
  key: (item: T) => K,
): Map<K, T[]> {
  const result = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = result.get(k) ?? [];
    list.push(item);
    result.set(k, list);
  }
  return result;
}
