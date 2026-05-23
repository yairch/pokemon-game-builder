# Pokemon Game Builder — Product Vision

This document is the **north star** for what we are building and why. It drives roadmap prioritization, README/landing copy, and agent behavior. Technical PR sequencing lives in [`plans/mvp_implementation_plan_a41c92e4.plan.md`](./plans/mvp_implementation_plan_a41c92e4.plan.md) and [`plans/gui_editor_mvp_roadmap.md`](./plans/gui_editor_mvp_roadmap.md).

---

## North star

**An AI-first game builder** where a casual creator can describe their Pokémon-style game in chat and get **working, playable worlds** on disk — without learning RPG Maker XP.

The app sits on **RPG Maker XP + Pokémon Essentials**: it reads and writes real project files (`Map###.rxdata`, `MapInfos`, events, scripts, tilesets). The AI is the **primary interface** for world-building, storytelling, layout, and gameplay setup. RMXP becomes optional verification, not the daily editor.

**Primary motivation:** fun and creative expression. **Secondary (future):** sustainable product — monetization, asset licensing, and trademark boundaries will need explicit policy later; they do not drive MVP scope.

---

## Who it is for

- **Casual creators** with story ideas and no gamedev background.
- **Experienced Essentials devs** who want faster iteration, in-app preview, and AI-assisted mapping.
- The AI assists across world-building, narrative, layout, gameplay hooks, UX, and art direction — through conversation, not engine jargon.

---

## Example use case (target experience)

1. User opens a **new game project** (seeded from their Essentials install).
2. They chat about story and tone; the app maintains a **Game Bible** (saved in the project).
3. User asks: *"Generate the starter town — small mountain town, 3 houses and a lab, valley with a pond at the edge, trees around, road down the mountain, doors into buildings, NPCs with personality."*
4. **Specialist agents** produce a structured plan and patches; the **app executor** writes maps, interiors, events, and MapInfos.
5. User sees the result in the **in-app map preview** (layers, events, grid), iterates in chat (*"move the pond east"*, *"add a hiker by the road"*).
6. User runs a short **Essentials smoke test** (walk town, enter buildings, talk to NPCs).
7. Output: a **coherent, playable starter town** consistent with the Game Bible.

---

## Current state (shipped)

Strong foundation for debug-without-RMXP:

- In-app **generate → preview → delete** loop with MapInfos integrity.
- **Workbench UX:** map tree, reactive preview, layers, event markers, grid, draggable layout, chat split.
- **Interactive map tree:** reorder/reparent, safe delete with preflight scan.
- Ruby bridge for Marshal round-trip; Vitest on main + renderer.

**Gap vs vision:** AI still lacks semantic tile context, specialist pipeline, Game Bible, structured town generation, events at quality bar, and smoke-test workflow.

---

## MVP definition (release bar)

The MVP is done when a user with a **saved Game Bible** can generate **one starter town** that matches it — playable in Essentials — including **distinct interiors** for 3 houses + lab.

### MVP includes

| Area | Requirement |
|------|-------------|
| **Game Bible** | Structured JSON at `.pgb/game-bible.json`; editable via chat and a workbench panel; version snapshots under `.pgb/history/`. |
| **Starter town (exterior)** | Terrain, paths, water, trees, buildings, correct layer usage; tileset-aware via **programmatic vocabulary** (not manual tile labeling). |
| **Interiors** | Four maps (3 houses + lab); lab includes professor NPC and plot hook dialogue. |
| **Events** | Working warps (doors), NPC Show Text, signs as needed. |
| **Agents** | Orchestrator + specialists (Planner, Map composer, Event writer); **planner owns story consistency** for MVP. |
| **Execution model** | Agents **propose** structured patches; **app executor** validates and writes files; preview refreshes automatically. |
| **Iteration** | **Patch-first** chat edits on existing work; full regen only on explicit "start over"; optional **pinned TownPlan** for reproducibility experiments. |
| **Playability proof** | In-app validation + documented **Essentials smoke checklist** (spawn, walk, enter buildings, NPC dialogue, no soft-lock). |
| **Projects** | **New game** = copy golden template into a **new folder**; **open existing** Essentials project supported; template **seeded from user's Essentials install** (see below). |
| **Tilesets** | Use tilesets present in the loaded project; auto-build vocabulary per tileset (heuristics + vision cache + map-mined templates). |

### Game Bible — required sections

1. Game title / working name  
2. Tone & genre  
3. Starter town (name, biome, layout notes)  
4. Must-have locations  
5. Key NPCs (name, role, personality)  
6. Plot hooks  
7. Constraints (e.g. stock tilesets only, no custom sprites yet)

### MVP smoke checklist (Essentials)

1. New Game / test save → player on starter town  
2. Walk main paths without getting stuck  
3. Enter each house and lab; return warps work  
4. Talk to each key NPC; dialogue displays  
5. Reach pond / valley edge without collision bugs  
6. No blocking errors on map enter  

### Explicitly not MVP

- Full region / world map view (v1.1)  
- Multi-tab chat sessions (future; single thread + on-disk history for MVP)  
- In-app game engine / walk mode  
- Custom or AI-generated tilesets (future; external tilesets supported via same vocabulary pipeline when added)  
- Full script/PBS/trainer/battle/sprite tooling  
- Monetization, credential marketplace, trademark policy (noted for later)  
- Undo stack, force-delete bypass, scan caching  

---

## v1.1 (next rung after MVP)

The next milestone after MVP is a connected **mini-region** — starter town plus 1–2 routes and/or extra interiors, with **map connections** and story consistency across maps. Expand the Game Bible toward a **multi-doc workspace** when context demands it.

---

## Project & template model

Three layers:

1. **Golden template (read-only)** — `templates/essentials-v1/` inside the app; never modified.  
2. **User project (working game)** — user-chosen folder; all generation and `.pgb/` metadata live here.  
3. **App config** — API keys, recent projects (future), outside the game folder.

**Seed-from-user-Essentials (MVP):** On first setup or "New game", user points at a valid Essentials install; the app copies a pinned snapshot into the golden template cache, then copies that into the new project folder. The open-source repo does not redistribute Essentials assets.

**One folder = one game.** New game → new folder. **Reset to template** (future) re-copies golden template over game files, with optional keep/wipe of `.pgb/`.

### `.pgb/` layout (per project)

```
.pgb/
  game-bible.json
  history/                 # bible + plan snapshots
  cache/                   # tileset vocabulary, etc.
  plans/                   # TownPlan, pinned plans
  sessions/                # chat history (future multi-tab)
```

---

## AI architecture (product view)

**Specialist agents + orchestrator.** The user talks to chat; orchestrator routes to:

- **Planner** — reads Game Bible → `TownPlan` (zones, buildings, interiors, NPC slots). Owns story consistency in MVP.  
- **Map composer** — reads plan + tile vocabulary → `MapPatch` / `EditPatch` (intent, not raw disk writes).  
- **Event writer** — reads plan → `EventPatch` (warps, dialogue, signs).

**Executor (code, not LLM):** validate → apply patches → write via Ruby bridge → refresh preview.

**Agent read tools:** project context, bible, map summaries, tile vocabulary, object templates, active plans.

**Not agent tools:** painting tiles, creating map files, running smoke tests, launching Game.exe — these are executor or app QA.

**Vision for tilesets:** multimodal models receive tileset images via **app integration** (planned PR 1.2+); one-time **vocabulary cache** per tileset. No separate image-recognition service required for MVP.

**Consistency:** patch-first edits; pinned TownPlans for repeat runs; optional A/B test later whether downstream agents read full bible vs plan-only.

**Prompt design:** quality, consistency, and accuracy vs user intent, plus token/latency optimization — see [`AGENTS.md`](../AGENTS.md) § Prompt engineering.

---

## GUI direction (summary)

Workbench-first: preview, tree, chat. Trust in-app preview for iteration; Essentials for runtime truth. See [`plans/gui_editor_mvp_roadmap.md`](./plans/gui_editor_mvp_roadmap.md) for G1+ (autotile parity, editing, world view).

---

## Future horizons (post-MVP)

- **Full world view** and multi-map sessions  
- Manipulate scripts, PBS, trainers, Pokémon data, battles, sprites, audio, mods  
- How-to / tips / guided tutorials in-app  
- Tileset generator and custom asset pipelines  
- Chat session tabs and rich project history  
- In-app playtest hook  
- Monetization, resource credentials, trademark and ownership policy  

---

## Glossary

| Term | Meaning |
|------|---------|
| **Soft-lock** | The game still runs, but the player is stuck and cannot progress — e.g. trapped by collision, a broken warp, or dialogue that never clears. Distinct from a crash (hard lock). MVP smoke tests expect no soft-locks in the starter town. |
| **`.pgb/`** | **Pokemon Game Builder** project metadata folder, stored inside the user’s game directory. RMXP/Essentials ignore it. Holds the Game Bible, plan snapshots, vocabulary cache, and chat history — separate from `Data/` and `Graphics/`. |

---

## Document map

| Document | Purpose |
|----------|---------|
| This file | Vision, MVP bar, example use case |
| [`AGENTS.md`](../AGENTS.md) | Agent operating rules and constraints |
| [`plans/mvp_implementation_plan_a41c92e4.plan.md`](./plans/mvp_implementation_plan_a41c92e4.plan.md) | Engineering PR phases |
| [`plans/gui_editor_mvp_roadmap.md`](./plans/gui_editor_mvp_roadmap.md) | UI / preview / workbench phases |
| [`plans/map_worktree_editor_design.plan.md`](./plans/map_worktree_editor_design.plan.md) | Map tree delete/drag spec (shipped) |

---

## Revision history

| Date | Change |
|------|--------|
| 2026-05-22 | Initial vision (starter town MVP, mini-region follow-up, Game Bible, agents, projects, seed template) |
| 2026-05-22 | Glossary: soft-lock, `.pgb/` |
| 2026-05-22 | Cross-ref prompt engineering principles in AGENTS.md |
