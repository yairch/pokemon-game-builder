# Pokemon Game Builder

AI-powered desktop companion for **Pokémon Essentials** developers to generate and preview playable Pokémon games. Describe maps in chat, preview layers and events in-app, and write real RPG Maker XP `.rxdata` files to disk — no daily RMXP editing required. Built with Electron, React, TypeScript, and a Ruby Marshal bridge; architecture separates UI adapters from testable domain handlers with patch-first iteration on the roadmap.

## Features

- **AI chat** — Gemini or Claude; map generation from natural language
- **In-app workbench** — map tree, canvas preview (layers, events, grid), draggable layout
- **Safe map ops** — MapInfos reorder/reparent, delete with integrity preflight verification
- **Real project files** — reads/writes `Map###.rxdata`, `MapInfos.rxdata`, tilesets via Ruby bridge

## Prerequisites

- Node.js 18+
- Ruby 2.7+ (for `.rxdata` read/write)
- API key: [Google AI Studio](https://aistudio.google.com/) (Gemini) and/or Anthropic (Claude)

## Setup

```bash
npm install
```

Set an API key (example — Gemini):

```powershell
# Windows PowerShell
$env:GEMINI_API_KEY="your-key"
```

Run desktop app:

```bash
npm run dev:desktop
```

Browser mode (Express API + Vite UI):

```bash
npm run dev:browser
```

## Tests

```bash
npm test
```

## Architecture

| Layer | Path | Role |
|-------|------|------|
| UI | `src/renderer/` | React workbench, chat, preview |
| Client | `src/renderer/services/bridge.ts` | IPC (Electron) or HTTP (browser) |
| Domain | `src/main/handlers.ts` | Business logic — transport-agnostic |
| Adapters | `ipc-handlers.ts`, `api-server.ts` | Electron / Express entry points |
| Disk I/O | `src/main/map-generator.ts` + `src/bridge/` | Ruby Marshal adapter |
| Shared | `src/shared/` | Types + pure logic (both processes) |

**Visual overview:** open [`docs/architecture/overview.html`](docs/architecture/overview.html) in a browser.

**Design sessions:** [`docs/design-process.md`](docs/design-process.md) · **Domain terms:** [`CONTEXT.md`](CONTEXT.md) · **Product vision:** [`docs/VISION.md`](docs/VISION.md)

## Project structure

```
src/
  main/       Electron main + domain handlers
  renderer/   React UI
  shared/     Types and pure TS (map tree, delete integrity, transforms)
  bridge/     marshal_handler.rb
docs/
  architecture/   HTML + architecture index
  plans/          MVP and GUI roadmaps
  VISION.md       North star
```

## Roadmap

See [`docs/VISION.md`](docs/VISION.md) and [`docs/plans/mvp_implementation_plan_a41c92e4.plan.md`](docs/plans/mvp_implementation_plan_a41c92e4.plan.md). Next major track: tileset vision, vocabulary cache, specialist agents, neighbor-aware autotile executor, Game Bible.

## Resources

- [Pokémon Essentials Wiki](https://pokemonessentials.fandom.com/wiki/Pok%C3%A9mon_Essentials_Wiki)
- [Relic Castle](https://reliccastle.com/)
