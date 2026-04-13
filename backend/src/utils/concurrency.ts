/**
 * Run an async mapper over items with bounded concurrency. Preserves input order.
 * Each rejection is captured as an error tuple rather than failing the batch.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onSettle?: (index: number) => void
): Promise<Array<{ index: number; value?: R; error?: unknown }>> {
  const results = new Array<{ index: number; value?: R; error?: unknown }>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        const value = await fn(items[i], i);
        results[i] = { index: i, value };
      } catch (error) {
        results[i] = { index: i, error };
      } finally {
        onSettle?.(i);
      }
    }
  });

  await Promise.all(workers);
  return results;
}
