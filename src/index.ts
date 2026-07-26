// Cloudflare Workers entry point. The webhook contract and HMAC live in ./webhook (pure,
// testable); the engine wiring lives in ./strategy. This file is only the HTTP glue: read the
// signing secret from the Worker environment, hand the raw request to handleDelivery, write the
// result back. A GET is treated as a health probe.
import { handleDelivery } from './webhook.ts';
import { chooseMoves } from './strategy.ts';

interface Env {
  // Set with: wrangler secret put DICECHESS_WEBHOOK_SECRET
  DICECHESS_WEBHOOK_SECRET?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

    if (request.method !== 'POST') {
      return json(200, { status: 'ok' });
    }

    const rawBody = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const secret = env.DICECHESS_WEBHOOK_SECRET ?? '';
    const now = Math.floor(Date.now() / 1000);
    const { status, body } = await handleDelivery(headers, rawBody, secret, chooseMoves, now);
    return json(status, body);
  },
} satisfies ExportedHandler<Env>;
