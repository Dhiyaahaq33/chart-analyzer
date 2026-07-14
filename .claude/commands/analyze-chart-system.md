# /analyze-chart-system

Read `.claude/skills/trade-decision-engine/SKILL.md` and `BUILD_PROMPT.md`, then build the Chart Analyzer application step by step.

## Steps

1. Read both spec files completely before writing any code.
2. Create `server/` — Express app with three isolated system prompts derived from SKILL.md.
3. Create `client/` — React app with three tabs (Crypto / Forex / Stocks) and image upload.
4. Wire the client to POST images to the server; render the structured analysis response.
5. Create `server/.env.example` with `ANTHROPIC_API_KEY=`.
6. Create a root `README.md` with setup instructions.
7. Run `npm install` in both `server/` and `client/`.
8. Start the dev server and confirm it loads in the browser.

## Rules

- Do NOT mix the three market system prompts. Each lives in its own constant in `server/src/prompts.js`.
- Client tabs must be visually distinct (different accent colors: amber for crypto, blue for forex, green for stocks).
- Never commit the `.env` file. The `.gitignore` must exclude it.
- If the Anthropic API key is missing, the server returns a clear 500 error with the message: "ANTHROPIC_API_KEY is not set."
