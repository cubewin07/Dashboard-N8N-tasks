# Open Questions & Decisions (dashboard repo only)

Out of scope here: everything about how work gets done (platform APIs, review collection, prices, providers, Telegram). That belongs to n8n. The dashboard shows whatever n8n writes to Supabase per `docs/CONTRACT.md`.

## Decided (2026-11-09)

| Topic | Decision |
|-------|----------|
| Login | Login page using Supabase Auth (email + password), one boss account, no sign-up |
| Language | **Vietnamese by default**, English as a secondary switch |
| Starter data | Seeded in migrations (7 employees, 6 workflows + steps, 7 placeholder shops). More added later and linked to n8n via `workflows.n8n_workflow_ref` |
| Media | Images and videos live **only in Google Drive**. The dashboard connects to Drive with Google OAuth2 (read-only, browser token flow) |
| Pages URL | https://cubewin07.github.io/Dashboard-N8N-tasks/ |
| Branding | Defaults: "Shop HQ", jade accent, initial avatars |

## Still open (none blocking)

1. **Shop names and platforms** for the seed. *Default:* 7 placeholders ("Shop 1"… spread across Shopee / TikTok Shop / Lazada / Zalo / Facebook) that you rename later, via SQL or n8n upsert.
2. **Which Google account connects to Drive?** It must be able to see the folder n8n writes to. *Default:* the same Google account n8n uses (or the folder is shared with your account).
