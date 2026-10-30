# Agent instructions — Pokemon Game Builder

Read **[`docs/VISION.md`](docs/VISION.md)** first. This file covers build-time decisions; runtime prompts live in **[`docs/prompts/`](docs/prompts/)** (developer-maintained — not user-custom skills).

---

## What we are building

AI-first Essentials companion: chat-driven maps and events on disk, with in-app preview and map tree for iteration without RMXP.

**M1 — Showcase MVP:** chat patches an existing map (vocabulary-aware terrain, water autotiles, NPC dialogue + face-on-interact) via orchestrator + executor, with turn traces, eval suite, CI, and a recorded demo.

**M2 — Playable starter town:** exterior + 4 interiors, warps, full neighbor-aware autotiles, App QA, Game Bible, template seed.

**M3 — Installable release:** installer, Ruby runtime, first-run setup, BYOK key storage.

**v1.1:** mini-region with connected maps.

---

## Priority order

1. Playable, valid RXData on disk  
2. In-app debug loop over RMXP  
3. Patch-first iteration; regen only on explicit start over  
4. Programmatic execution over LLM file writes  
5. Measured AI quality — traces and evals before claims  
6. Automated tile vocabulary over hand-labeled IDs  
7. User intent and patch consistency over generic “genre” heuristics  
8. Small testable PRs per engineering plan  

---

## Suggested build order

Align new work with VISION § Suggested build order until the implementation plan is updated. **M1:**

1. Foundation — handler split, Ruby-only writes, CI  
2. LLM port + turn traces  
3. Fixture project + eval harness (baseline legacy pipeline)  
4. Vocabulary spike → vocabulary cache  
5. Executor + shared water autotiles  
6. Orchestrator + `docs/prompts/`  
7. Events lite (NPC dialogue, face-on-interact)  
8. Showcase — eval report, demo video, README  

**M2:** town planning, interiors + warps, full autotiles, App QA, Game Bible, template seed UX. **M3:** packaging and install.

**Post-MVP:** richer NPC systems, LLM-as-judge intent review, full gameplay doc, tutorials, legal principles, mod-aware AI.

---

## Architecture — propose vs execute

| Layer | Role |
|-------|------|
| **Specialists** | Read context; output `TownPlan`, `MapPatch`, `EventPatch`, `EditPatch` |
| **Orchestrator** | Route intent; call specialists |
| **Executor** | Validate, neighbor-aware terrain, apply patches, write files, refresh preview |
| **App QA** | Structural validator, smoke checklist — not LLM tools |

Agents do **not** paint tiles, create maps, render snapshots, or run Game.exe.

### Specialists

- **Planner** — bible + prompt → `TownPlan`; story consistency when bible exists.  
- **Map composer** — plan + vocabulary → patches.  
- **Event writer** — warps, dialogue, turn-toward-player on interact.

### Read tools

`read_game_bible`, `read_project_context`, `read_map_summary`, `get_tile_vocabulary`, `get_object_templates`, `read_town_plan`.

### Prompt library

```
docs/prompts/
  orchestrator.md
  planner.md
  map-composer.md
  event-writer.md
  shared-context.md
```

---

## Tile & asset rules

- Programmatic vocabulary per tileset → `.pgb/cache/`.  
- Vision via multimodal API (PR 1.2+); cache labels; do not resend full images every turn.  
- **Neighbor-aware autotiles** in executor for MVP-complete terrain.  
- Stock Essentials semantics; **do not edit plugins/scripts** in MVP.  
- Map composer outputs stamp intent; executor resolves tile IDs.

---

## Project metadata

- `.pgb/game-bible.json` — eight sections including `gameplayNotes` (see VISION.md).  
- Golden template seeded from user's Essentials install.  
- One folder = one game.

---

## Chat & iteration

- Default **EditPatch**; facing/event tweaks are event patches, not full regen.  
- Pinned TownPlan for reproducibility.  
- Ground turns in prompt + TownPlan + map state (+ bible when present).

---

## Prompt engineering

Optimize for **intent fidelity** and **token cost**.

- Narrow specialist prompts; structured JSON outputs; validator before write.  
- Compact map summaries; bible/plan excerpts per specialist.  
- Orchestrator routes before prompting.  
- Cache vocabulary and templates within a pipeline.  
- LLM sampling settings belong in prompt-engineering tasks, not vision docs.

---

## GUI track

G0, GW, GW+ done. **G1 autotile preview parity** can parallel neighbor-aware executor work.

---

## Testing

- Unit tests for patches, validation, autotile filler, vocabulary helpers.  
- Integration tests for bridge and pipelines.  
- Evals on the synthetic fixture project: replay mode in CI, live mode on demand (VISION § Measurement). Prompt changes cite eval results.  
- Never commit third-party assets (RMXP, Essentials, Pokémon) — fixtures are original.  
- “Playable” claims require smoke checklist in VISION.md.

---

## Non-goals (unless user asks)

- MCP servers  
- In-app game engine  
- Bundled IP assets  
- Monetization / trademark implementation  
- User-custom prompt packs  
- Tutorial/onboarding investment pre-MVP  
- Monolith single-prompt generation  
- Plugin/mod authoring  

---

## Plans

When **`docs/plans/mvp_implementation_plan_a41c92e4.plan.md`** conflicts with VISION.md, **VISION wins**. Plan YAML updates happen on explicit user request.

---

## Code conventions

Match existing handlers, bridge, workbench patterns. Minimal diffs. Conventional commits. Branch from `master`.

### TypeScript style by layer

See [ADR 0003](./docs/adr/0003-typescript-style-by-layer.md). Summary:

- **`src/renderer/`** — functional React components and hooks only (no class components).
- **`handlers.ts` / `src/shared/`** — exported functions and pure helpers; no transport or I/O.
- **Driven adapters** — thin `class X implements IY`; instance config in the constructor; no domain logic in adapters.
- **Adapter wiring** — plain functions (e.g. `createAIService()`), not static factory classes.

Do not flatten the codebase to a single style; follow the layer you are editing.

---

## Quick links

| Resource | Path |
|----------|------|
| Vision | [`docs/VISION.md`](docs/VISION.md) |
| Prompts | [`docs/prompts/`](docs/prompts/) |
| MVP plan | [`docs/plans/mvp_implementation_plan_a41c92e4.plan.md`](docs/plans/mvp_implementation_plan_a41c92e4.plan.md) |
| GUI roadmap | [`docs/plans/gui_editor_mvp_roadmap.md`](docs/plans/gui_editor_mvp_roadmap.md) |
