# Dice Chess bot — Cloudflare Workers (fixed rating anchor)

[![CI](https://github.com/rabestro/dicechess-bot-cloudflare-greedy/actions/workflows/ci.yml/badge.svg)](https://github.com/rabestro/dicechess-bot-cloudflare-greedy/actions/workflows/ci.yml)
[![Play Live](https://img.shields.io/badge/Play-Live-success)](https://play.jc.id.lv/)
[![Leaderboard](https://img.shields.io/badge/Ladder-Leaderboard-1E90FF)](https://play.jc.id.lv/leaderboard)
[![Engine](https://img.shields.io/badge/Engine-dicechess--engine--scala-8A2BE2)](https://github.com/rabestro/dicechess-engine-scala)
[![Bot API](https://img.shields.io/badge/Docs-Bot%20API-orange)](https://jc.id.lv/dicechess-play-api/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-lightgrey)](./LICENSE)

The live [`cloudflare/greedy`](https://play.jc.id.lv/leaderboard) ladder bot — a **fixed rating
anchor**, not a showcase of strength.

## Why this bot exists

The ladder's Glicko rating is purely relative: retrain a model, retire an old one, add a new
architecture, and the whole scale can drift without anyone noticing, because there is nothing
fixed to measure it against. This bot is that fixed point — a lower bound the rest of the roster
can be read relative to over months or years.

It runs the engine's **unmodified built-in `greedy` search**: no opening book, no tuning, no
config. That is deliberate, for reasons a trained model or a hand-tuned bot cannot offer:

- **Deterministic, versioned engine code**, not a weights file that can be silently retrained,
  overwritten, or lost in a private repository.
- **No hosting-dependent behaviour.** It is a stateless Worker — no shared inference session, no
  request queue, no clock pressure from concurrent games (the failure mode that cost other bots on
  this ladder real rating points — see [`dicechess-house-bots`](https://github.com/rabestro/dicechess-house-bots)).
- **Nothing to compete on.** `greedy` is the engine's simplest non-trivial search: it takes the
  best-looking move by static material/position, with no lookahead. There is no version of this
  bot that plays better without stopping being `greedy`.

## The one rule

**Do not improve this bot.** No opening book, no algorithm swap, no config knob. An anchor that
gets tuned is not an anchor — it is just another entry in the roster, and the whole point of
having a fixed point is gone. If you want a stronger Cloudflare showcase bot, build a new one (see
[`dicechess-bot-cloudflare`](https://github.com/rabestro/dicechess-bot-cloudflare), which runs
`aggressive` behind the opening book) — never repurpose this one.

## Does the engine fit the free plan?

Cloudflare's free plan allows **~10 ms CPU per request**. `greedy` has no lookahead — it is
materially cheaper per call than the sibling `aggressive-book` bot, which itself measures ~0.4 ms
p50. Comfortable with a wide margin at every roll.

## Layout

| Path | Role |
| --- | --- |
| `src/strategy.ts` | Calls the engine's built-in `greedy` algorithm. Nothing to configure — see "The one rule" above. |
| `src/webhook.ts` | Pure delivery logic: WebCrypto HMAC verify (±5 min replay window), handshake echo. No engine — directly unit-tested. |
| `src/index.ts` | The Workers `fetch` handler — reads the signing secret from the environment, relays to `handleDelivery`. |

## Local development

Requires Node 24+ and a GitHub token with `read:packages` for the engine
(`export NODE_AUTH_TOKEN=$(gh auth token)` before installing — see `.npmrc`).

```bash
npm install
npm test          # HMAC vector, handshake, 401/400 paths, and a real engine-legal move
npm run typecheck
npm run dev       # wrangler dev — runs the Worker locally in workerd
```

## Deploy to Cloudflare Workers

```bash
npm install                         # needs NODE_AUTH_TOKEN (read:packages)
npx wrangler login                  # one-time, opens the browser
npx wrangler deploy                 # publishes to https://dicechess-bot-cloudflare-greedy.<subdomain>.workers.dev
```

Then wire it to the platform (any HTTP client; `curl` shown):

```bash
BASE=https://play-api.jc.id.lv
URL=https://dicechess-bot-cloudflare-greedy.<subdomain>.workers.dev

# 1. Claim a durable identity. Token shown ONCE.
curl -X POST "$BASE/bot/register" -H "Content-Type: application/json" \
  -d '{"team":"cloudflare","name":"greedy"}'

# 2. Register the webhook (the deployed Worker must already answer — ownership handshake).
#    The response carries the signing secret, shown ONCE.
curl -X POST "$BASE/bot/webhook" -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" -d "{\"url\":\"$URL\"}"

# 3. Give the Worker its secret (never commit it):
npx wrangler secret put DICECHESS_WEBHOOK_SECRET   # paste the secret from step 2

# 4. Join the rating ladder — passive from here; watch /bots/cloudflare/greedy converge.
curl -X POST "$BASE/bot/ladder/join" -H "Authorization: Bearer <token>"
```

The `workers.dev` URL is HTTPS and public, which is all the webhook registration requires — no
custom domain needed. Full platform reference: <https://jc.id.lv/dicechess-play-api/>.

## Licensing

**AGPL-3.0**, because it links the AGPL engine. If you want a **closed-source** bot, the legal
moves are already on the wire — use a transport-only MIT starter
([TypeScript](https://github.com/rabestro/dicechess-bot-typescript),
[Python](https://github.com/rabestro/dicechess-bot-python)) and no engine linkage is ever required.
