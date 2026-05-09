---
name: MVP Implementation Plan
overview: A phased plan to evolve the Pokemon Game Builder from its current POC state into a functional MVP where a user can describe a Pokemon town and get a playable map with buildings, NPCs, and working warps -- built as incremental PRs with integration tests at every step.
todos:
  - id: pr-0-1
    content: "PR 0.1: Set up Vitest test infrastructure (main + renderer configs, smoke tests)"
    status: completed
  - id: pr-0-2
    content: "PR 0.2: Fix chat-to-map pipeline (add registerMapInInfos after generateMapFile)"
    status: completed
  - id: pr-0-3
    content: "PR 0.3: Event-preserving patch path (new Ruby command that keeps events during tile patching)"
    status: completed
  - id: pr-1-1
    content: "PR 1.1: Canvas map preview (base) — render tiles on canvas from tileset image; 3 layers; autotile static frame 0; zoom/pan/hover; post-test/chat wiring"
    status: completed
  - id: pr-g0-1
    content: "PR-G0-1: Maps tree + preview from read-map selection; refresh tree after generate + auto-select new map; Tileset Inspector trigger for previewed map (see gui_editor_mvp_roadmap G0)"
    status: completed
  - id: pr-g0-2
    content: "PR-G0-2: Event markers on preview canvas from read-map events[] (icon/tooltip id+name); single source of truth from bridge"
    status: completed
  - id: pr-g0-3
    content: "PR-G0-3: Layer strip (L1/L2/L3/Events dimming/focus) + toggleable grid overlay (default on); aria-pressed on strip"
    status: pending
  - id: pr-1-2
    content: "PR 1.2: Tileset vision (send tileset image to Claude/Gemini with prompts)"
    status: pending
  - id: pr-2-1
    content: "PR 2.1: Tile vocabulary dictionary (semantic labels for tileset 1 tiles)"
    status: pending
  - id: pr-2-2
    content: "PR 2.2: Multi-tile object templates (curated building/object library)"
    status: pending
  - id: pr-2-3
    content: "PR 2.3: Enhanced AI map prompts (combine vocabulary + templates + vision + design rules)"
    status: pending
  - id: pr-3-1
    content: "PR 3.1: Ruby bridge event writing (Show Text, Transfer Player, full page data)"
    status: pending
  - id: pr-3-2
    content: "PR 3.2: Event templates in TypeScript (NPC, warp, sign, item event generators)"
    status: pending
  - id: pr-3-3
    content: "PR 3.3: AI-driven event generation (AI creates events as part of map generation)"
    status: pending
  - id: pr-4-1
    content: "PR 4.1: Two-pass generation pipeline (plan then execute with templates)"
    status: pending
  - id: pr-4-2
    content: "PR 4.2: Validation layer (tile range, event bounds, warp targets, completeness checks)"
    status: pending
  - id: pr-5-1
    content: "PR 5.1: Tool-calling setup (Claude tool_use with place_building, create_npc, etc.)"
    status: pending
  - id: pr-5-2
    content: "PR 5.2: Map generation orchestrator (multi-map generation with connections)"
    status: pending
isProject: false
---

# Pokemon Game Builder -- MVP Implementation Plan (v2)

**Branch base**: `master` (each PR branches from and merges back into `master`)
**Primary AI provider**: Claude (Anthropic)
**Test framework**: Vitest
**Plan location**: `docs/plans/`

**GUI / workbench companion:** [`gui_editor_mvp_roadmap.md`](./gui_editor_mvp_roadmap.md) — map tree, layer UX, palette integration, and post-MVP editing (paint tools, right-click menus).

---

## Current State Summary

The project is a working POC with:

- Electron + React + Vite desktop app with AI chat (Gemini/Claude); also runs in browser mode (`npm run dev:browser`)
- Ruby bridge for Marshal round-trip (read/write maps, tilesets, events, system data)
- Three map test modes (sanity, AI sparse edits, object placement)
- Tileset Inspector modal with image + ID overlay
- **Vitest** test infrastructure (main + renderer); chat-to-map pipeline registers maps in `MapInfos`; tile patching now preserves events (`patch_map_tiles`)
- **Canvas map preview (Phase 1.1, base PR)** rendering 3 layers from a real tileset image with autotile static frame, zoom/pan, hover coordinates, and post-test/chat wiring
- Map template picker dropdown and shared map list

**Open / known limitations**:

- AI has no semantic tile context in chat prompts (Phase 2 owns this).
- Map preview uses **static frame 0** for autotiles — not RMXP-composed water/edges (tracked in GUI roadmap **G1**).
- GUI is a single scrolling left column; PR **PR-G0-1**–**PR-G0-3** (GUI roadmap **G0**) ship map tree, event markers, layer strip + grid before **GW** (workbench layout).

---

## Phase 0: Foundation (3 PRs)

Must-fix bugs and test infrastructure. Everything else depends on this.

### PR 0.1 -- Test Infrastructure

Set up Vitest with separate configs for main-process (Node) and renderer (jsdom).

- Install `vitest`, `@vitest/coverage-v8`
- Add `vitest.config.ts` (main process, Node environment)
- Add `vitest.renderer.config.ts` (renderer, jsdom)
- Add `test` and `test:coverage` scripts to `package.json`
- Create `src/main/__tests__/` and `src/renderer/__tests__/` directories
- Write one smoke test per side to validate the setup:
  - Main: test `extractTileBlocks` with a known 3-layer grid (pure logic, no Ruby needed)
  - Renderer: test that `bridge.ts` constructs correct fetch URLs

### PR 0.2 -- Fix Chat-to-Map Pipeline

The main user-facing flow is broken: maps created via chat are invisible in RPG Maker.

- In `[src/main/ipc-handlers.ts](src/main/ipc-handlers.ts)` `handleAIChat` (around line 304): add `registerMapInInfos` call after `generateMapFile`
- Add integration test: mock `aiService.chat` to return `mapData`, verify both `generateMapFile` and `registerMapInInfos` are called with correct args
- Test: round-trip a map creation and verify the MapInfos file is updated

### PR 0.3 -- Event-Preserving Patch Path

`patch_map_data` in Ruby wipes events. This blocks all future event work.

- Add a new Ruby bridge command `patch_map_tiles` (or add a flag to existing `patch_map_data`) that patches tile layers **without** clearing `map.events` or `map.encounter_list`
- Update `[src/main/map-generator.ts](src/main/map-generator.ts)` to use the new command when events should be preserved
- Integration test: create a map with events via `clone_map`, patch tiles, verify events survive in `read_map` output

---

## Phase 1: Visual Feedback (canvas, G0 preview parity ×3, vision)

Users need to see what the AI generates without opening RPG Maker.

### PR 1.1 -- Canvas Map Preview (base merged)

Replace the metadata-only `[MapPreview.tsx](src/renderer/components/MapPreview.tsx)` with a tile renderer.

- Load tileset image via the existing `tilesetImageDataUrl`
- Render 3 layers onto an HTML canvas, compositing bottom-to-top
- Support autotile frames (static frame 0 is sufficient for MVP)
- Handle zoom/pan for large maps
- Show tile coordinates on hover
- Integration test: render a known small map (e.g. 5x5) to canvas, verify canvas dimensions and that draw calls occur for non-zero tiles
- Wire into the post-test and post-chat flows so the preview updates after map generation

Follow-up preview parity lives in **`PR-G0-1`** through **`PR-G0-3`** (scheduled and detailed in [`gui_editor_mvp_roadmap.md`](./gui_editor_mvp_roadmap.md) §G0). Deliver in that order before **GW**.

### PR 1.2 -- Tileset Image to AI (Vision)

Send the tileset image alongside map-generation prompts so the AI can see what tiles look like.

- Extend `IAIService.chat` signature: `chat(message: string, context: any, images?: string[])` where images are base64 data URLs
- Update `[ClaudeAIService](src/main/ai-service-claude.ts)` to send images via the `content` array (Anthropic vision API: `{ type: "image", source: { type: "base64", ... } }`)
- Update `[GeminiAIService](src/main/ai-service-gemini.ts)` with inline image parts (for parity, lower priority)
- In map test and chat flows, resolve the tileset image and pass it
- Integration test: verify the Claude API payload includes image content blocks when an image is provided
- Unit test: verify graceful fallback when no tileset image is available

---

## Phase 2: Semantic Tile System (3 PRs)

Give the AI semantic understanding of tiles instead of opaque numeric IDs.

### PR 2.1 -- Tile Vocabulary Dictionary

Create a hand-built semantic mapping for the outdoor tileset (tileset ID 1, the one used by Route 2 and most maps).

- New file: `src/main/tile-vocabulary.ts`
- Structure: `Map<number, TileSemantics>` where `TileSemantics` = `{ label, category, layerHint, transparency, connectsTo?, partOf? }`
- Categories: `ground`, `tree`, `building`, `water`, `mountain`, `path`, `decoration`, `cliff-edge`
- Cover the tiles observed in Route 2 (at minimum: grass variants, tree parts, mountain edges, path tiles, water)
- Export a `describeTiles(tileIds: number[]): string` function that generates human-readable descriptions for prompts
- Unit tests: verify known tile IDs map to correct labels; verify `describeTiles` output format

### PR 2.2 -- Multi-Tile Object Templates

Extend beyond 2x2 extraction to a curated library of building/object templates.

- New file: `src/main/object-templates.ts`
- Define templates for: Pokemon Center (approx 4x3), House (3x2), Tree (2x2, already extracted), Sign post (1x1 with metadata), Fence segment
- Each template: `{ name, category, tiles: {dx,dy,z,tileId}[], walkability, hasInterior }` 
- Function: `getTemplatesForTileset(tilesetId: number): ObjectTemplate[]`
- Update `buildObjectPlacementPrompt` in `[ipc-handlers.ts](src/main/ipc-handlers.ts)` to use named templates with semantic labels instead of raw "Object A", "Object B"
- Unit tests: validate template tile IDs exist in tileset; verify prompt includes semantic names
- Integration test: run object placement with named templates, verify AI uses them correctly

### PR 2.3 -- Enhanced AI Map Prompt

Combine tile vocabulary, object templates, and vision into a rich prompt for the main chat path.

- Refactor `createAiTestMap` prompt to use `describeTiles()` and template names
- Add design rules to prompts:
  - Layer usage (0=ground, 1=decoration/elevation, 2=overlay/treetops)
  - Tile adjacency rules (water edges, cliff edges, path connectivity)
  - Building placement rules (flat ground, door facing south, spacing)
- Inject existing map context: list of maps in the project, their names and sizes
- Integration test: verify prompt contains semantic labels, design rules, and project context
- Manual validation: run AI test, compare output quality to pre-enhancement baseline

---

## Phase 3: Event System (3 PRs)

Make maps playable with NPCs, dialogue, and warps.

### PR 3.1 -- Ruby Bridge Event Writing

Extend `marshal_handler.rb` to create events with real commands from JSON.

- Add support for these RPG Maker event command codes in `create_map`:
  - **101 (Show Text)**: NPC dialogue
  - **201 (Transfer Player)**: Warp/door transitions
  - **250 (Play SE)**: Sound effects
  - **355 (Script)**: Essentials script calls
- Accept full page data from JSON: `{ graphic, trigger, conditions, commands: [{code, parameters}] }`
- Serialize `page.condition` and `page.move_route` in `read_map` (currently omitted)
- New bridge command: `write_events` that updates events on an existing map without touching tiles
- Integration tests (Ruby round-trip):
  - Create map with NPC event (Show Text), read back, verify command codes and text
  - Create map with warp event (Transfer Player), read back, verify target map/x/y
  - Write events to existing map, verify tiles are untouched

### PR 3.2 -- Event Templates (TypeScript)

Define common event patterns as reusable templates.

- New file: `src/main/event-templates.ts`
- Templates:
  - `createNPCEvent(x, y, name, dialogue: string[]): EventData`
  - `createWarpEvent(x, y, targetMapId, targetX, targetY): EventData`
  - `createSignEvent(x, y, text): EventData`
  - `createItemEvent(x, y, itemId): EventData`
- Each generates the correct `commands` array with proper codes and parameters
- Unit tests: verify each template produces valid command structures
- Integration test: generate event JSON, pass through Ruby bridge, read back and verify

### PR 3.3 -- AI-Driven Event Generation

Let the AI create events as part of map generation.

- Add event generation to the map creation prompt: after tile placement, ask the AI to specify events with positions and types
- Parse AI response for both `edits` (tiles) and `events` (structured event data)
- Map AI event descriptions to event templates (e.g., AI says "NPC at (5,10) says 'Welcome!'" -> `createNPCEvent(5, 10, "Greeter", ["Welcome!"])`)
- Integration test: full pipeline from prompt to map file with at least 1 NPC and 1 warp event
- Validation: verify events are at walkable positions, warps reference valid maps

---

## Phase 4: End-to-End Town Generation (2 PRs)

The MVP goal: user says "make a town" and gets a playable result.

### PR 4.1 -- Two-Pass Generation Pipeline

Split generation into planning and execution.

- **Pass 1 (Plan)**: AI outputs a structured town plan:
  ```json
  {
    "name": "Starter Town",
    "layout": { "buildings": [...], "paths": [...], "decorations": [...] },
    "events": [{ "type": "npc", "position": [5,10], "dialogue": ["Hello!"] }],
    "connections": [{ "direction": "north", "targetMap": "Route 1" }]
  }
  ```
- **Pass 2 (Execute)**: Deterministic code converts the plan to tile edits + events using templates
- New function: `generateTownFromPlan(plan, tileset, templates): { layers, events }`
- Integration test: provide a fixed plan JSON, verify output map has correct buildings, NPCs, and warps
- Fall back to single-pass for simple requests

### PR 4.2 -- Validation Layer

Catch broken output before writing to disk.

- New file: `src/main/map-validator.ts`
- Checks:
  - All tile IDs exist in the tileset (within valid range)
  - Events are within map bounds and on walkable tiles
  - Warp events reference existing maps (or maps being created in the same batch)
  - Buildings are complete (no partial templates)
  - No overlapping events at same position
- Return `{ valid: boolean, warnings: string[], errors: string[] }`
- Integration into all map creation paths (chat, test, compile)
- Unit tests for each validation rule
- Integration test: create a map with intentional errors, verify validator catches them

---

## Phase 5: Agent Architecture (2 PRs)

Transition from single-prompt to tool-calling agent pattern.

### PR 5.1 -- Tool-Calling Setup

Use Claude's tool_use API to let the AI call structured tools.

- Define tools as Claude function schemas:
  - `place_building(type, x, y)` -- places a building template
  - `create_npc(x, y, name, dialogue)` -- creates an NPC event
  - `create_warp(x, y, target_map, target_x, target_y)` -- creates a warp
  - `fill_terrain(x1, y1, x2, y2, terrain_type)` -- fills a region with terrain
  - `place_path(waypoints)` -- draws a path between points
- Implement tool execution loop: AI calls tools -> execute -> return results -> AI continues
- Update `ClaudeAIService` to support tool definitions and multi-turn tool use
- Integration test: verify tool-calling loop produces valid map data for "make a small town"

### PR 5.2 -- Map Generation Orchestrator

Coordinate the full generation flow.

- New file: `src/main/map-orchestrator.ts`
- Flow: user prompt -> AI plans using tools -> tools produce structured edits/events -> validate -> write
- Support multi-map generation (town + interior maps for buildings)
- Track generation state (which maps created, which connections pending)
- Integration test: "Create a town with a Pokemon Center" produces:
  - Exterior map with Pokemon Center building
  - Interior map for Pokemon Center
  - Working warp events connecting them
  - Both maps registered in MapInfos

---

## Cross-Cutting Concerns

### Commit Convention

Adopt strict lowercase conventional commits going forward:

- `feat:` new features
- `fix:` bug fixes
- `test:` test additions
- `refactor:` code restructuring
- `docs:` documentation

### Test Strategy per PR

Every PR must include:

- **Unit tests** for pure logic (tile math, template generation, prompt building)
- **Integration tests** for flows that touch the Ruby bridge or AI service (using mocks for AI, real Ruby for bridge where possible)
- **Manual validation step** documented in PR description

### Branch Strategy

- Each PR branches from **`master`** and merges back into **`master`**.
- Suggested branch name pattern: `yairch/mvp-{phase}-{pr-number}-{slug}` (e.g., `yairch/mvp-1-1-canvas-map-preview`).
- Keep PRs small and reviewable; rebase on latest `master` before opening if it has moved.

