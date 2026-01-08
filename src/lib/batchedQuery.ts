import { SupabaseClient } from '@supabase/supabase-js';

interface BatchQueryOptions {
  batchSize?: number;
}

export async function batchedInQuery<T>(
  supabase: SupabaseClient,
  table: string,
  selectFields: string,
  filterField: string,
  values: (string | number)[],
  options: BatchQueryOptions = {}
): Promise<T[]> {
  const { batchSize = 100 } = options;

  if (values.length === 0) {
    return [];
  }

  const allData: T[] = [];
  const totalBatches = Math.ceil(values.length / batchSize);

  console.log(`[BatchQuery] Fetching from ${table}: ${values.length} items in ${totalBatches} batches of ${batchSize}`);

  for (let i = 0; i < values.length; i += batchSize) {
    const batch = values.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;

    try {
      const { data, error } = await supabase
        .from(table)
        .select(selectFields)
        .in(filterField, batch);

      if (error) {
        console.error(`[BatchQuery] Error in batch ${batchNumber}/${totalBatches}:`, error);
        throw error;
      }

      if (data) {
        allData.push(...(data as T[]));
        console.log(`[BatchQuery] Batch ${batchNumber}/${totalBatches} completed: ${data.length} rows`);
      }
    } catch (error) {
      console.error(`[BatchQuery] Batch ${batchNumber}/${totalBatches} failed:`, error);
      throw error;
    }
  }

  console.log(`[BatchQuery] All batches completed. Total rows: ${allData.length}`);
  return allData;
}
