# Agent instructions — Pokemon Game Builder

Read **[`docs/VISION.md`](docs/VISION.md)** first for product intent and MVP bar. This file tells coding agents how to make decisions aligned with that vision.

---

## What we are building

An **AI-first Pokémon Essentials / RPG Maker XP companion**: chat-driven world generation that writes real project files, with a strong **in-app workbench** (preview, map tree, chat) so users rarely need RMXP for iteration.

**MVP success:** Game Bible saved in project → user generates **one playable starter town** (exterior + 3 house interiors + lab) matching the bible → patch-first chat edits → Essentials smoke checklist passes.

**Next product milestone (v1.1):** mini-region with connected maps (town + routes/interiors).

---

## Priority order

When trade-offs arise, prefer:

1. **Playable output** on disk (valid RXData, MapInfos, warps, walkable layout)  
2. **In-app debug loop** (preview, tree, delete, validation) over requiring RMXP  
3. **Patch-first iteration** over full regen  
4. **Programmatic execution** over LLM-direct file mutation  
5. **Automated tile semantics** (cache, heuristics, map mining) over hand-maintained tile ID lists  
6. **Small, testable PRs** per [`docs/plans/mvp_implementation_plan_a41c92e4.plan.md`](docs/plans/mvp_implementation_plan_a41c92e4.plan.md)

---

## Architecture — propose vs execute

**Agents propose; the app executes.**

| Layer | Responsibility |
|-------|----------------|
| **AI specialists** | Read context; output structured JSON (`TownPlan`, `MapPatch`, `EventPatch`, `EditPatch`) |
| **Orchestrator** | Route chat intent; call specialists; hand proposals to executor |
| **Executor** | Validate, merge patches, write maps/events/MapInfos, create interiors from plan metadata, refresh preview |
| **App QA** | Deterministic validator, Essentials smoke checklist — **not** exposed as LLM tools |

Do **not** add AI tools that directly paint tiles, create map files, render preview snapshots, or run smoke tests. Preview updates **after** executor writes.

### Specialist roles (MVP)

- **Planner** — Game Bible → `TownPlan`. **Owns story consistency** in MVP.  
- **Map composer** — plan + vocabulary → tile/template **intent** in patches.  
- **Event writer** — plan → warps, NPC pages, dialogue patches.

Downstream agents receive **plan + relevant excerpts**, not a mandate to re-interpret the whole bible (alternative: full-bible-per-agent is a future experiment).

### Agent read tools (appropriate)

- `read_game_bible`, `write_game_bible`  
- `read_project_context`, `read_map_summary`  
- `get_tile_vocabulary`, `get_object_templates`  
- `read_town_plan`, pinned plans  

### Executor responsibilities (code)

- `apply_*_patch`, `ensure_interior_maps` from plan specs, `register_maps_in_infos`  
- Vocabulary build: heuristics → vision cache → map-mined templates → `.pgb/cache/`  

---

## Tile & asset rules

- **No hand-built `tile-vocabulary.ts`** with manually labeled IDs. Build vocabulary **programmatically** per tileset in the open project.  
- MVP uses **tilesets already in the project** (outdoor + indoor). External/custom tilesets: same cache pipeline when added.  
- **Vision:** attach tileset images via multimodal API in app code (PR 1.2+); cache labels. Not a separate MCP or CV service for MVP.  
- Map composer outputs **template/stamp intent**; executor resolves to tile IDs for the active tileset.

---

## Project & metadata conventions

- **One folder = one game.** New game copies golden template into a new directory.  
- Golden template: `templates/essentials-v1/` — seeded from **user's Essentials install**, not committed Essentials assets in repo.  
- Project metadata under **`.pgb/`**:  
  - `game-bible.json` (structured JSON, seven required sections — see VISION.md)  
  - `history/`, `cache/`, `plans/`, `sessions/` (future)  

---

## Chat & iteration

- Default: **EditPatch** on current map/plan.  
- Full regen only when user explicitly starts over.  
- Support **pinned TownPlan** for reproducibility.  
- Multi-tab chat sessions: future; design `.pgb/sessions/` accordingly but do not block MVP on it.  

---

## Prompt engineering

When designing or changing system prompts, agent prompts, or context assembly, optimize for **both** intent fidelity and cost/latency.

### Quality, consistency, and accuracy vs user intent

- **Ground every generation turn** in the Game Bible, active TownPlan, and current map state — not the full chat transcript alone.  
- **Specialist prompts stay narrow:** Planner owns story; Map composer owns layout/tiles; Event writer owns dialogue/warps. Avoid one prompt that mixes all responsibilities.  
- **Structured outputs** (JSON schemas for `TownPlan`, patches) with validation before execution — reject or retry on schema drift.  
- **Patch-first iteration** preserves user-approved work; edits should express *deltas* aligned with the latest user message, not silent full rewrites.  
- **Planner owns story consistency** in MVP; downstream agents get plan + relevant excerpts to reduce contradictory reinterpretation.  
- **Deterministic executor + validator** catch inaccuracies the model cannot self-certify (tile IDs, bounds, warp targets, checklist items from the bible).  
- **Pinned TownPlans** and bible snapshots support reproducibility when tuning prompts.  
- Measure against **user intent** explicitly: bible must-haves, smoke checklist, and preview — not model confidence alone.

### Performance and token optimization

- **Do not resend full tileset images** every chat turn; use one-time vision labeling → `.pgb/cache/` vocabulary and template summaries.  
- **Prefer compact context:** map summaries (size, tileset, event list) over full `layers` arrays unless the task is tile-level editing.  
- **Send excerpts, not dumps:** relevant bible sections and plan slices per specialist, not the entire project context every call.  
- **Route before you prompt:** orchestrator classifies intent (new town vs patch vs bible update) and invokes only the specialists needed.  
- **Cache and reuse** read-tool results within a generation pipeline (vocabulary, templates, map summary for the active selection).  
- **Separate models/limits by role** when useful (e.g. short classifier vs full planner) — tune in implementation, not in vision docs.  
- **Temperature and sampling knobs** are per-agent implementation details; lower variance for structural outputs (plans, patches), higher only where creative prose is isolated and validated.

When quality and token cost conflict, prefer **narrower context + stronger structure + executor validation** over stuffing more text into a monolith prompt.

---

## GUI track

Layout, preview fidelity, and editor UX: [`docs/plans/gui_editor_mvp_roadmap.md`](docs/plans/gui_editor_mvp_roadmap.md).  
G0, GW, GW+ are **done**. Next GUI items (G1 autotile parity) may parallel PR 1.2 / Phase 2.

Keep preview as **read-map source of truth**; do not duplicate Ruby event logic in the renderer.

---

## Testing expectations

- **Unit tests** for pure logic (patches, validation, vocabulary helpers).  
- **Integration tests** for Ruby bridge and pipelines (mock AI where needed).  
- MVP features that claim "playable" must align with the **smoke checklist** in VISION.md (manual or semi-automated Essentials run).  
- Every PR: small scope, tests where behavior is non-trivial.

---

## Non-goals (do not expand scope without user ask)

- MCP servers or external agent protocols  
- In-app game engine / walk mode for MVP  
- Distributing Pokémon/IP assets in the repo  
- Monetization, trademark, or credential systems in MVP code  
- Force delete, preflight scan cache, undo toasts (per map tree design doc)  
- Monolith single-prompt map+event generation as the primary architecture  

---

## Engineering plans & drift

Implementation PR order: [`docs/plans/mvp_implementation_plan_a41c92e4.plan.md`](docs/plans/mvp_implementation_plan_a41c92e4.plan.md).

When the plan conflicts with VISION.md, **VISION wins** — update the plan in a docs PR. Notable realignments already decided:

- Phase 2.1 → automated vocabulary cache, not hand-maintained dictionary  
- Phase 5 → specialist agents + executor, not raw `tool_use` that writes files directly  
- Next engineering focus after GUI foundation: **PR 1.2 vision**, **Game Bible**, **agent orchestrator**, **Phase 3 events**, **validation**, toward starter-town MVP  

---

## Code conventions

- Match existing patterns in `handlers.ts`, `map-generator.ts`, bridge, renderer workbench.  
- Minimize diff scope; no drive-by refactors.  
- Conventional commits: `feat:`, `fix:`, `test:`, `docs:`, etc.  
- Branch from `master`; do not commit secrets or Essentials asset bundles.

---

## Quick links

| Resource | Path |
|----------|------|
| Vision & MVP | [`docs/VISION.md`](docs/VISION.md) |
| MVP PR plan | [`docs/plans/mvp_implementation_plan_a41c92e4.plan.md`](docs/plans/mvp_implementation_plan_a41c92e4.plan.md) |
| GUI roadmap | [`docs/plans/gui_editor_mvp_roadmap.md`](docs/plans/gui_editor_mvp_roadmap.md) |
| Map tree design | [`docs/plans/map_worktree_editor_design.plan.md`](docs/plans/map_worktree_editor_design.plan.md) |
