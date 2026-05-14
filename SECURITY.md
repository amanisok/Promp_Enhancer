# Security Policy

## Reporting a vulnerability

If you find a security issue (API key handling, content-script XSS, proxy bypass, etc.), please report it privately:

- Open a GitHub security advisory: **Security → Report a vulnerability**
- Or email the maintainer directly (see GitHub profile)

Please do **not** open a public issue for security problems.

## Scope

In-scope:
- Anything in `src/` (extension content script, popup, background)
- Anything in `proxy/` (Cloudflare Worker)
- The Chrome extension's manifest

Out-of-scope:
- The upstream model providers (OpenAI, OpenRouter) — report directly to them
- Host pages (ChatGPT, Claude, Gemini)

## Hardening checklist for self-hosters

If you've forked this and deployed your own proxy:

- [ ] Set `ALLOWED_EXTENSION_IDS` in `proxy/wrangler.toml` to your published extension ID
- [ ] Configure a per-IP Rate Limit Rule in the Cloudflare dashboard
- [ ] Set an OpenRouter / OpenAI spend cap on the API key the proxy uses
- [ ] Never commit `wrangler.toml` with secrets — always use `wrangler secret put`
