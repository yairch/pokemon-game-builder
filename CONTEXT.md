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
Structured tile/event edit applied by the executor without replacing the whole map.
_Avoid_: diff, update object

**Executor** (planned):
App module that validates patches, resolves tiles (incl. autotiles), and writes RXData — agents never write files directly.
_Avoid_: pipeline, writer service

**Game Bible** (planned):
Project-local creative context in `.pgb/game-bible.json` (story, tone, gameplay notes).
_Avoid_: system prompt, lore doc

**Workbench**:
In-app layout: map tree, canvas preview, chat, and tooling panels — iteration without RMXP.
_Avoid_: editor, IDE

**Smoke checklist**:
Manual Essentials playtest steps (walk map, enter building, talk to NPC) proving MVP playability.
_Avoid_: e2e test, QA script
