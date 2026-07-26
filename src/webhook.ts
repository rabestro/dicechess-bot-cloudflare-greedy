// Pure webhook-delivery logic — no engine, no Workers globals beyond WebCrypto (which exists in
// both the Workers runtime and Node, so this file is directly unit-testable). Speaks the same
// contract every DiceChess starter does:
//   - HMAC-SHA256(secret, "<timestamp>.<raw body>") hex in X-DiceChess-Signature, ±5 min window
//   - {"type":"verification","nonce":…} → echo the nonce (the ownership handshake)
//   - {"type":"yourTurn","state":{"dfen":…}} → {"moves":[…]} (the HTTP response body IS the move)

export const TIMESTAMP_HEADER = 'x-dicechess-timestamp';
export const SIGNATURE_HEADER = 'x-dicechess-signature';

const REPLAY_WINDOW_SECONDS = 300;
const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Hex HMAC-SHA256 of `"<timestamp>.<body>"` — the scheme shared by every starter and the server. */
export async function sign(secret: string, timestamp: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`));
  return toHex(signature);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True iff `signature` is the fresh, genuine MAC of `rawBody`. `now` is a parameter so tests are deterministic. */
export async function verifySignature(
  secret: string,
  timestamp: string | undefined,
  rawBody: string,
  signature: string | undefined,
  now: number,
): Promise<boolean> {
  if (!timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > REPLAY_WINDOW_SECONDS) return false;
  const expected = await sign(secret, ts, rawBody);
  return constantTimeEqual(expected, signature);
}

export interface Delivery {
  status: number;
  body: unknown;
}

/**
 * Turn one webhook POST into a status + JSON body. `headers` keys must be lower-cased.
 * `chooseMoves` receives the position's DFEN and returns the turn's UCI micro-moves.
 */
export async function handleDelivery(
  headers: Record<string, string | undefined>,
  rawBody: string,
  secret: string,
  chooseMoves: (dfen: string) => string[] | Promise<string[]>,
  now: number,
): Promise<Delivery> {
  let envelope: { type?: string; nonce?: string; state?: { dfen?: string } };
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: 'malformed JSON' } };
  }
  if (!envelope || typeof envelope.type !== 'string') {
    return { status: 400, body: { error: 'missing "type"' } };
  }

  if (envelope.type === 'verification') {
    return { status: 200, body: { nonce: envelope.nonce ?? '' } };
  }
  if (envelope.type !== 'yourTurn') {
    return { status: 400, body: { error: `unrecognized "type": ${envelope.type}` } };
  }

  const fresh = await verifySignature(secret, headers[TIMESTAMP_HEADER], rawBody, headers[SIGNATURE_HEADER], now);
  if (!fresh) {
    return { status: 401, body: { error: 'invalid or expired signature' } };
  }

  const dfen = envelope.state?.dfen;
  if (typeof dfen !== 'string') {
    return { status: 400, body: { error: 'missing state.dfen' } };
  }

  try {
    const moves = await chooseMoves(dfen);
    return { status: 200, body: { moves: moves ?? [] } };
  } catch (error) {
    return { status: 500, body: { error: `strategy failed: ${(error as Error).message}` } };
  }
}
