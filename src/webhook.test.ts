import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sign, handleDelivery, TIMESTAMP_HEADER, SIGNATURE_HEADER } from './webhook.ts';

const SECRET = 'test-webhook-secret';
const NOW = 1752750000;

// The one signature vector asserted across play-api, the TypeScript/Python/Scala starters, and
// dicechess-bot-runtime — proof this Worker speaks the exact same HMAC scheme as everything else.
test('sign matches the ecosystem-wide HMAC-SHA256 vector', async () => {
  assert.equal(
    await sign(SECRET, NOW, '{"hello":true}'),
    '5f4fbf105bab278dc6205788389e09884bd554b1f866ca11ccc9ce97ddd9b3f6',
  );
});

const turnBody = JSON.stringify({
  type: 'yourTurn',
  gameId: 'g1',
  seat: 'White',
  state: { dfen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 NBK' },
});

async function signedHeaders(body: string, ts: number) {
  return { [TIMESTAMP_HEADER]: String(ts), [SIGNATURE_HEADER]: await sign(SECRET, ts, body) };
}

test('verification handshake echoes the nonce without a signature', async () => {
  const r = await handleDelivery({}, JSON.stringify({ type: 'verification', nonce: 'abc123' }), SECRET, () => [], NOW);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { nonce: 'abc123' });
});

test('a signed turn relays the strategy’s moves', async () => {
  const r = await handleDelivery(await signedHeaders(turnBody, NOW), turnBody, SECRET, () => ['e2e4', 'g1f3'], NOW);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { moves: ['e2e4', 'g1f3'] });
});

test('the strategy receives exactly the DFEN from the envelope', async () => {
  let seen = '';
  await handleDelivery(await signedHeaders(turnBody, NOW), turnBody, SECRET, (dfen) => { seen = dfen; return []; }, NOW);
  assert.equal(seen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 NBK');
});

test('a missing or tampered signature is 401', async () => {
  const tampered = { [TIMESTAMP_HEADER]: String(NOW), [SIGNATURE_HEADER]: 'deadbeef' };
  assert.equal((await handleDelivery(tampered, turnBody, SECRET, () => [], NOW)).status, 401);
  assert.equal((await handleDelivery({}, turnBody, SECRET, () => [], NOW)).status, 401);
});

test('a stale timestamp is 401 even with a genuine signature (replay guard)', async () => {
  const stale = NOW - 3600;
  const r = await handleDelivery(await signedHeaders(turnBody, stale), turnBody, SECRET, () => [], NOW);
  assert.equal(r.status, 401);
});

test('malformed JSON and a missing dfen are 400, never a throw', async () => {
  assert.equal((await handleDelivery({}, 'not json', SECRET, () => [], NOW)).status, 400);
  const noDfen = JSON.stringify({ type: 'yourTurn', state: {} });
  const r = await handleDelivery(await signedHeaders(noDfen, NOW), noDfen, SECRET, () => [], NOW);
  assert.equal(r.status, 400);
});

test('a strategy that throws is 500, never a throw out of handleDelivery', async () => {
  const r = await handleDelivery(await signedHeaders(turnBody, NOW), turnBody, SECRET, () => { throw new Error('boom'); }, NOW);
  assert.equal(r.status, 500);
});
