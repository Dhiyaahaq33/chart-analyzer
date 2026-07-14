# Chart Analyzer — Build Spec

## What to build

A web application that accepts a chart image (screenshot or upload), classifies it by market type (Crypto / Forex / Stocks), and returns a structured trade analysis using Claude's vision capability.

## Architecture

```
chart-analyzer/
├── server/          Express + Anthropic SDK (Node.js)
│   ├── src/
│   │   ├── index.js       Entry point, routes
│   │   └── prompts.js     Three isolated system prompts (one per market)
│   ├── package.json
│   └── .env               ANTHROPIC_API_KEY (gitignored)
└── client/          React (Vite) SPA
    ├── src/
    │   ├── App.jsx
    │   ├── components/
    │   │   ├── TabBar.jsx
    │   │   ├── ImageUploader.jsx
    │   │   └── AnalysisResult.jsx
    │   └── index.css
    └── package.json
```

## Server spec

- `POST /api/analyze` accepts `multipart/form-data` with fields:
  - `image` (file, required) — PNG/JPG chart screenshot
  - `market` (string, required) — `"crypto"` | `"forex"` | `"stocks"`
- Reads `market` to select the correct system prompt from `prompts.js`
- Passes image as base64 to `claude-sonnet-4-6` with `max_tokens: 1024`
- Returns `{ analysis: "<structured text>" }` or `{ error: "<message>" }`
- CORS enabled for `http://localhost:5173`

## Client spec

- Three tabs: **Crypto** (amber accent), **Forex** (blue accent), **Stocks** (green accent)
- Drag-and-drop image upload zone + click-to-browse fallback
- Preview the uploaded chart image
- "Analyze" button (disabled until an image is selected)
- Displays analysis in a monospace pre-formatted block
- Loading state with spinner while waiting for response
- Error state with clear message if server returns error

## System prompts

Derive each system prompt from `.claude/skills/trade-decision-engine/SKILL.md`.
- Crypto prompt: enforce momentum/order-flow framing, R:R ≥ 2:1 gate
- Forex prompt: enforce HTF bias + session context framing, R:R ≥ 1.5:1 gate
- Stocks prompt: enforce volume-structure/Wyckoff framing, R:R ≥ 2:1 gate

All three prompts must end with: "Not financial advice. Technical analysis only."

## Dev setup

- Server runs on port 3001
- Client (Vite) runs on port 5173
- Run `npm install` then `npm run dev` in each directory
