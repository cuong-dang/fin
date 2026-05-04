/**
 * Group items by a derived key, preserving input order within each group.
 * The optional `map` projects each item before bucketing — handy when the
 * key field shouldn't surface in the grouped values (e.g., grouping rows
 * by an FK that the response shape doesn't carry).
 */
export function groupBy<T, K>(
  items: readonly T[],
  key: (item: T) => K,
): Map<K, T[]>;

export function groupBy<T, K, V>(
  items: readonly T[],
  key: (item: T) => K,
  map: (item: T) => V,
): Map<K, V[]>;

export function groupBy<T, K, V>(
  items: readonly T[],
  key: (item: T) => K,
  map?: (item: T) => V,
): Map<K, T[] | V[]> {
  const result = new Map<K, (T | V)[]>();
  for (const item of items) {
    const k = key(item);
    const list = result.get(k) ?? [];
    list.push(map ? map(item) : item);
    result.set(k, list);
  }
  return result as Map<K, T[] | V[]>;
}
