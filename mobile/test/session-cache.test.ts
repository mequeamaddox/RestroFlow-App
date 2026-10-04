import assert from 'node:assert/strict';
import test from 'node:test';
import { createQueryClient } from '../src/lib/queryClient';

test('a new session cannot read a previous session’s locations or inventory', () => {
  const previous = createQueryClient();
  const next = createQueryClient();
  previous.setQueryData(['locations'], [{ id: 'private-location' }]);
  previous.setQueryData(['inventory', 'private-location'], [{ id: 'private-item' }]);
  assert.equal(next.getQueryData(['locations']), undefined);
  assert.equal(next.getQueryData(['inventory', 'private-location']), undefined);
  previous.clear();
  next.clear();
});

test('clearing a session cancels a pending request and its late result cannot enter the new cache', async () => {
  const previous = createQueryClient();
  const next = createQueryClient();
  let finish!: (value: string[]) => void;
  const result = previous.fetchQuery({
    queryKey: ['locations'],
    queryFn: () => new Promise<string[]>(resolve => { finish = resolve; }),
  }).catch(() => undefined);
  previous.clear();
  next.setQueryData(['locations'], ['new-account-restaurant']);
  finish(['old-account-restaurant']);
  await result;
  assert.equal(previous.getQueryData(['locations']), undefined);
  assert.deepEqual(next.getQueryData(['locations']), ['new-account-restaurant']);
  next.clear();
});

test('old inventory data refreshes from the server instead of remaining fresh forever', async () => {
  const client = createQueryClient();
  client.setQueryData(['inventory', 'restaurant'], ['old-stock'], { updatedAt: Date.now() - 120_000 });
  const stock = await client.fetchQuery({
    queryKey: ['inventory', 'restaurant'],
    queryFn: async () => ['updated-stock'],
  });
  assert.deepEqual(stock, ['updated-stock']);
  client.clear();
});
