import { pool } from './db';

/** Cross-replica lock. DB connection loss releases the lock automatically. */
export async function withBillingLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let locked = false;
  let releaseError: Error | undefined;
  try {
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [key]);
    locked = true;
    return await work();
  } finally {
    try {
      if (locked) await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key]);
    } catch (error) {
      releaseError = error instanceof Error ? error : new Error(String(error));
      throw error;
    } finally { client.release(releaseError); }
  }
}

/** Record completion only after all durable work succeeds; failures remain retryable. */
export async function processBillingEvent(
  key: string, alreadyProcessed: () => Promise<boolean>,
  work: () => Promise<void>, markProcessed: () => Promise<void>,
): Promise<void> {
  await withBillingLock(key, async () => {
    if (await alreadyProcessed()) return;
    await work();
    await markProcessed();
  });
}
