# Pokemon Game Builder

Domain language for the Essentials companion app. Implementation lives in code and ADRs — not here.

## Language

**Essentials project**:
The user’s RPG Maker XP game folder containing `Game.exe`, `Data/`, and Pokémon Essentials scripts.
_Avoid_: game repo, RMXP project (when meaning the on-disk folder the app opens)

**Game data layer**:
Read/write the **opened Essentials project** on disk — maps, map tree, tilesets, and related files. The app’s filesystem I/O boundary toward the live game folder; implementation-agnostic (no Ruby, Marshal, or `.rxdata` in the name).
_Avoid_: bridge, persistence, project data (layer name — “project” is user-facing for the opened folder), RXData adapter, Essentials (in layer/code names)

**GameDataStore**:
Driven adapter in the main process that the application core calls for game data I/O. Orchestrates spawn/read/write; speaks JSON to the core, delegates format work to a **game data implementation**.
_Avoid_: MapGenerator (legacy name), project-data-client, bridge, backend

**Game data implementation**:
Concrete on-disk format handler under `game-data/implementations/` (e.g. `marshal-ruby/` today). Swappable without renaming the layer.
_Avoid_: Ruby bridge, essentials-fs, rxdata folder, project-data

**RXData**:
An on-disk file format used by RPG Maker XP projects (`Map###.rxdata`, …). An implementation detail of the current marshal-ruby implementation — not the layer name.
_Avoid_: map file (too vague), data layer

**Application core**:
Transport-agnostic use cases in `handlers.ts` plus pure logic in `shared/`. Does not import Electron, Express, or spawn Ruby directly from UI code paths.
_Avoid_: backend, main process (when meaning domain logic)

**Driving adapters**:
Main-process entry points that receive UI requests and call the application core — Electron IPC and local HTTP (Express). Two transports, one use-case surface.
_Avoid_: transport layer, bridge, api routes (alone)

**Driven adapters**:
Implementations the application core calls for external I/O — **GameDataStore** (+ implementations under `game-data/`), LLM providers (`ai-service-*`).
_Avoid_: bridge, outbound services

**Host API client**:
Renderer-side proxy that invokes the same use cases as the driving adapters — via IPC in the Electron shell, via HTTP when no preload (browser tab, Playwright). Sits in the presentation layer, outside the hexagon boundary.
_Avoid_: bridge, bridge.ts, frontend API

**Presentation layer**:
React workbench UI (`components/`, `App.tsx`) and the Host API client. Displays state and forwards intent; no direct disk or LLM access.
_Avoid_: renderer (when meaning “the whole frontend stack”), view layer

**MapSpec**:
Structured input describing a map to create or compile (dimensions, tileset, regions, events intent).
_Avoid_: map JSON, prompt output

**MapData**:
Normalized map representation used inside the app after read or generation (layers, events, metadata).
_Avoid_: rxdata, Map### 

**MapInfos**:
The RMXP map tree index — parent/child order and display names for every map id.
_Avoid_: map list, folder tree

**Patch-first iteration**:
Default edit path: apply a small structured change to an existing map/plan; full regeneration only when the user explicitly starts over.
_Avoid_: regen, redo

**TownPlan** (planned):
Pinned structured plan for a town (exterior, interiors, NPC roles) produced by the Planner specialist.
_Avoid_: prompt, blueprint

**MapPatch** (planned):
Structured tile/event edit applied by the executor without replacing the whole map. Composer emits **semantic operations** (stamp, clear, fill, …) with vocabulary template keys — not raw tile ID grids.
_Avoid_: diff, update object

**Semantic operation** (planned):
One step in a MapPatch — e.g. stamp a template at an origin, clear a region, fill terrain — expressed in vocabulary keys the executor resolves to tile IDs.
_Avoid_: tile command, paint op

**Map summary** (planned):
Compact read-model for the selected map: metadata, event list, and **semantic regions** (pond, path, building footprints) derived from scanning layers against the tile vocabulary. Fed to the AI pipeline instead of raw grids.
_Avoid_: map dump, layer export

**Tile vocabulary cache** (planned):
Preprocessed per-tileset semantics and entity templates under `.pgb/cache/`. Shared by specialists and executor; built lazily and refreshable when the tileset PNG changes.
_Avoid_: tileset JSON, vision prompt

**Tool registry** (planned):
In-app tools the orchestrator agent calls (read map summary, get vocabulary, propose patch, apply patch). Only apply performs disk writes. MCP adapter may wrap the same registry post-MVP.
_Avoid_: MCP server (as product name), plugin API

**Executor** (planned):
App module that validates patches, resolves semantic ops to tiles (incl. autotiles), and writes RXData — agents never write files directly.
_Avoid_: pipeline, writer service

**Game Bible** (planned):
Project-local creative context in `.pgb/game-bible.json` (story, tone, gameplay notes).
_Avoid_: system prompt, lore doc

**Workbench**:
In-app layout: map tree, canvas preview, chat, and tooling panels — iteration without RMXP.
_Avoid_: editor, IDE

**Chat transcript** (MVP):
Messages shown in the workbench chat panel for the current app session only — not written to disk. Lost on refresh or project switch.
_Avoid_: chat log, conversation history (when meaning persisted storage)

**Chat session** (post-MVP):
A named, persisted conversation thread under the opened Essentials project (e.g. in `.pgb/sessions/`). Multiple sessions per project; ultimate UX target after the AI pipeline meets quality bar.
_Avoid_: chat tab, thread (alone)

**Model context bundle** (MVP):
What the orchestrator assembles each AI turn: current user message, a small in-memory sliding window of recent chat turns, fresh map summary + selected map, TownPlan/bible excerpts when present, and the last apply outcome. Ground-truth reads every turn; chat is intent, not authority.
_Avoid_: prompt, full history dump

**Action log** (MVP):
Compact orchestrator state for the most recent patch apply — success or structured validation errors — so retries and follow-ups do not depend on replaying full chat.
_Avoid_: tool trace, conversation memory

**Pre-apply validation**:
The executor's blocking check that a MapPatch is legal to apply on the selected map (bounds, known templates, resolvable semantic ops). Failure means no write.
_Avoid_: lint, schema check, validator (alone)

**App QA**:
On-demand structural and must-have checks after a write (warps, walkable NPCs, plan/bible checklist). Warnings for MVP — does not block apply.
_Avoid_: e2e, QA script, validation layer (when meaning the whole stack)

**Smoke checklist**:
Manual Essentials playtest steps (walk map, enter building, talk to NPC) proving MVP playability.
_Avoid_: e2e test, QA script

**Write-through apply** (MVP):
Successful executor apply writes RXData directly into the opened Essentials project. Preview and Game.exe read the same on-disk files; no draft layer or Save step.
_Avoid_: auto-save, direct write (alone)

**Staging overlay** (post-MVP):
Draft map writes under `.pgb/staging/` with explicit Save to commit into `Data/` and Discard to drop drafts. Target for GUI roadmap G3 after the AI pipeline meets quality bar.
_Avoid_: temp files, unsaved buffer
