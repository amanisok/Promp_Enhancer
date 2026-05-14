# Prompt Enhancer — Proxy Worker

Cloudflare Worker that holds the OpenAI / OpenRouter key on the server side so the extension can ship without one. Free tier covers ~100k requests/day.

## Deploy

```bash
cd proxy
npm install
npx wrangler login            # one-time
npx wrangler secret put OPENROUTER_API_KEY    # or OPENAI_API_KEY
npm run deploy
```

Wrangler prints a URL like `https://prompt-enhancer-proxy.<your-subdomain>.workers.dev`. Copy it.

## Wire the extension

Open `../src/utils/constants.ts` and set `PROXY_URL` to your Worker URL (including `/enhance`).

Once the extension is published, paste its ID into `wrangler.toml` under `ALLOWED_EXTENSION_IDS` and redeploy — that locks the proxy to just your extension.

## Endpoints

- `POST /enhance` — body `{ "prompt": string }` → `{ "enhanced": string, "remaining": number }`
- `GET /health` — `{ "ok": true }`

## Knobs

- `RATE_LIMIT_PER_HOUR` (in `wrangler.toml`) — per-IP ceiling. Best-effort (per Worker isolate). For strict global limits, configure Cloudflare's Rate Limiting Rules in the dashboard.
- `OPENROUTER_API_KEY` takes precedence over `OPENAI_API_KEY` if both are set.

## Logs

```bash
npm run tail
```
