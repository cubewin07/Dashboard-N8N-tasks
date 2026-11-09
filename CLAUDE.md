@AGENTS.md

## Claude Code notes

- `AGENTS.md` (imported above) is the single source of project rules. Put shared guidance there, not here. Keep this file for Claude-specific notes only.
- Project skills installed in `.claude/skills/`. Use them when relevant:
  - `tailwind-v4-shadcn`: Tailwind v4 + shadcn setup, theming, dark mode
  - `vercel-react-best-practices`: React performance patterns
  - `web-design-guidelines`: UI/accessibility review before finishing a screen
  - `react-vite-dashboard`: dashboard structure patterns (ignore its Stitch/Web3 parts)
- Before calling a screen done, run `npm run build` and check it in the browser at desktop width and 375px.
- If a request needs work that belongs in n8n (sending messages, calling shop APIs, generating media), don't build it here. Say so, and describe what n8n must write to Supabase per `docs/CONTRACT.md`.
