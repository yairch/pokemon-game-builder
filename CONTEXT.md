# Pokemon Game Builder

Domain language for the Essentials companion app. Implementation lives in code and ADRs — not here.

## Language

**Essentials project**:
The user’s RPG Maker XP game folder containing `Game.exe`, `Data/`, and Pokémon Essentials scripts.
_Avoid_: game repo, RMXP project (when meaning the on-disk folder the app opens)

**RXData**:
Ruby Marshal binary files (`Map###.rxdata`, `MapInfos.rxdata`, etc.) that RMXP reads and writes.
_Avoid_: map file (too vague), json map

**Ruby bridge**:
The `marshal_handler.rb` adapter that converts between JSON (TypeScript) and RXData on disk.
_Avoid_: Ruby service, backend

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
