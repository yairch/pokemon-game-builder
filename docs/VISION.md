# Pokemon Game Builder — Product Vision



This document is the **north star** for what we are building and why. It drives roadmap prioritization, README/landing copy, and agent behavior. Technical PR sequencing lives in [`plans/mvp_implementation_plan_a41c92e4.plan.md`](./plans/mvp_implementation_plan_a41c92e4.plan.md) and [`plans/gui_editor_mvp_roadmap.md`](./plans/gui_editor_mvp_roadmap.md).



---



## North star



**An AI-first game builder** where a casual creator can describe their Pokémon-style game in chat and get **working, playable worlds** on disk — without learning RPG Maker XP.



The app sits on **RPG Maker XP + Pokémon Essentials**: it reads and writes real project files (`Map###.rxdata`, `MapInfos`, events, scripts, tilesets). The AI is the **primary interface** for world-building, storytelling, layout, and gameplay setup. RMXP becomes optional verification, not the daily editor.



**Primary motivation:** fun and creative expression. Monetization, asset licensing, and trademark policy are **post-MVP** concerns.



Real user flows will vary; the example below is **illustrative**, not a fixed script.



---



## Who it is for



- **Casual creators** with story ideas and no gamedev background.

- **Experienced Essentials devs** who want faster iteration, in-app preview, and AI-assisted mapping.

- The AI assists across world-building, narrative, layout, gameplay hooks, UX, and art direction — through conversation, not engine jargon.



---



## Example use case (illustrative)



1. User opens a project (seeded from their Essentials install).

2. They chat about story and gameplay; the app can maintain a **Game Bible** (saved in the project) for longer sessions.

3. User asks for a starter town — e.g. small mountain town, 3 houses and a lab, valley with a pond, trees, road off the map, doors and NPCs.

4. Specialist agents produce structured plans and patches; the **app executor** writes maps, interiors, events, and MapInfos.

5. User previews in-app (layers, events, grid) and iterates in chat (*"move the pond east"*).

6. User runs an **Essentials smoke test** (walk, enter buildings, talk to NPCs).

7. Output: a playable town aligned with what they asked for.



---



## Current state (shipped)



- In-app **generate → preview → delete** with MapInfos integrity.

- **Workbench:** map tree, reactive preview (layers, events, grid), draggable layout, chat split.

- **Interactive map tree:** reorder/reparent, safe delete with preflight scan.

- Ruby bridge; Vitest on main + renderer.



**Gap vs vision:** tileset vision and vocabulary cache, specialist orchestrator, neighbor-aware terrain, events at quality bar, Game Bible, validation workflow, template seed UX.



---



## Quality bar



- **User intent:** output matches the current prompt and (when present) Game Bible / TownPlan must-haves.

- **Patch consistency:** follow-up edits change only what the user asked; the rest of the map and plan stay stable.

- **Scenery (MVP):** must-have checklist from plan/bible **plus** user preview and chat patches — not a fixed genre template.

- **Later:** experiment with automated intent review (plan vs result) if it improves trust.



---



## MVP definition



### First AI milestone (map POC)



A user prompt produces a **tileset-aware, layer-correct map** in the project, with **patch-first** chat edits. Requires vision → vocabulary cache, specialist prompts, and orchestrator.



### Full MVP (release bar)



A **playable starter town** in Essentials: exterior plus **four distinct interiors** (3 houses + lab), working warps and NPCs, **neighbor-aware autotile placement** for terrain used in the town, structural validation, and smoke checklist pass.



| Area | Requirement |

|------|-------------|

| **Map generation** | Tileset-aware tiles across layers; programmatic vocabulary (heuristics + vision cache + map-mined templates). |

| **Autotiles** | **Full neighbor-aware** placement in executor for water, shores, cliffs, and related terrain (implement in phases; complete before full MVP sign-off). |

| **Interiors** | Four maps; lab with professor NPC and plot hook dialogue. |

| **Events (MVP)** | Warps, Show Text, signs; NPCs on walkable tiles with stock charset; **turn toward player on interact**; dialogue reflects bible/NPC roles when bible exists; at least one multi-line conversation. |

| **Agents** | Orchestrator + Planner, Map composer, Event writer; agents **propose** JSON patches; **executor** writes files. |

| **Iteration** | Patch-first; full regen only on explicit start over; optional pinned TownPlan. |

| **Validation** | Structural checks (tile IDs, bounds, warps); must-have checklist when plan/bible exists. |

| **Playability** | Essentials smoke checklist (below). |

| **Projects** | New game from golden template; open existing project; template **seeded from user's Essentials install**. |

| **Game Bible** | `.pgb/game-bible.json` for story-driven flows (see build order — after core map POC). |

| **Plugins / mods** | Read-only awareness; generation targets **stock Essentials**; app does not edit `Plugins/` or scripts in MVP. |



### Game Bible sections



1. Game title / working name  

2. Tone & genre  

3. Starter town (name, biome, layout notes)  

4. Must-have locations  

5. Key NPCs (name, role, personality)  

6. Plot hooks  

7. Constraints  

8. **`gameplayNotes`** — pacing, battles yes/no, exploration tone, difficulty intent for this town  



Version snapshots under `.pgb/history/`. Multi-doc gameplay guide post-MVP.



### Smoke checklist (Essentials)



1. New Game / test save → player on starter town  

2. Walk main paths without getting stuck  

3. Enter each house and lab; return warps work  

4. Talk to each key NPC; dialogue displays  

5. Reach pond / valley edge without collision bugs  

6. No blocking errors on map enter  



### Suggested build order



Engineering order (subject to change when the implementation plan is updated):



1. **Tileset vision → vocabulary cache** — give AI correct visual/context grounding for map POC.  

2. **`docs/prompts/` + orchestrator** — specialist prompts and routing.  

3. **Game Bible + `.pgb/`** — richer context for story-driven flows (after map POC works from prompt alone).  

4. **Events** — NPC presence, warps, face-on-interact.  

5. **Neighbor-aware autotile executor** — phased; MVP-complete before full MVP sign-off.  

6. **Validation + must-have checklist** (with bible/plan when available).  

7. **Template seed UX** — golden template from user's Essentials.  



**Post-MVP:** richer NPC interactions (items, flags, battles, puzzles), automated intent review, full gameplay doc, tutorials, legal/monetization principles, mod-aware AI, world view / mini-region.



### Explicitly not MVP



- Full region / world map view  

- Multi-tab chat sessions  

- In-app walk mode / game engine  

- Custom or AI-generated tilesets  

- Full PBS / trainer / battle / sprite / script tooling  

- Editing plugins or mods  

- User-custom prompt packs  

- Guided tutorials or expanded how-to (Help popover stays as-is)  

- Monetization, credentials, trademark policy docs  



---



## v1.1 (after full MVP)



Connected **mini-region** — starter town plus routes and/or extra maps, map connections, stronger cross-map story consistency. Expand Game Bible toward multi-doc workspace.



**NPC depth:** progress from MVP event bar toward items, flags, branches, trainers, and puzzle-style interactions.



---



## Project & template model



1. **Golden template (read-only)** — `templates/essentials-v1/` in the app bundle.  

2. **User project** — user-chosen folder; game files + `.pgb/`.  

3. **App config** — API keys, recent projects (future).



**Seed-from-user-Essentials:** user points at a valid Essentials install; app caches a snapshot as the golden template, then copies into new project folders. Repo does not redistribute Essentials assets.



**One folder = one game.** Reset to template (future): re-copy golden template; optional keep/wipe `.pgb/`.



### `.pgb/` layout



```

.pgb/

  game-bible.json

  history/

  cache/           # tileset vocabulary, templates

  plans/           # TownPlan, pinned plans

  sessions/        # chat history (future)

```



---



## AI architecture



**Orchestrator** routes chat to specialists:



- **Planner** — bible + prompt → `TownPlan`; owns story consistency when bible exists.  

- **Map composer** — plan + vocabulary → `MapPatch` / `EditPatch`.  

- **Event writer** — plan → `EventPatch` (warps, dialogue, facing-on-interact).



**Executor:** validate → apply patches → neighbor-aware terrain where applicable → write via Ruby bridge → refresh preview.



**Runtime prompts:** [`docs/prompts/`](./prompts/) (developer-maintained; not user-custom skills). **AGENTS.md** covers build-time rules.



**Prompt engineering:** intent fidelity and token efficiency — see [`AGENTS.md`](../AGENTS.md) § Prompt engineering.



---



## GUI direction



Workbench-first: preview, tree, chat. **G1 autotile preview parity** parallels neighbor-aware generation — improves debug trust; see [`gui_editor_mvp_roadmap.md`](./plans/gui_editor_mvp_roadmap.md).



---



## Future horizons



- Full world view and multi-map editing  

- Script, PBS, trainer, Pokémon, battle, sprite, audio tooling  

- Mod-aware read/write  

- Tileset generator and custom assets  

- Chat tabs and session history  

- In-app playtest hook  

- Tutorials and contextual onboarding  

- Monetization, credentials, trademark and ownership policy  



---



## Glossary



| Term | Meaning |

|------|---------|

| **Soft-lock** | Game runs but player cannot progress (collision trap, broken warp, stuck dialogue). |

| **`.pgb/`** | Builder metadata inside the game project (bible, cache, plans). RMXP ignores it. |

| **Neighbor-aware autotiles** | Executor picks correct autotile pattern per cell from adjacent terrain (water edges, cliffs), matching Essentials runtime. |



---



## Document map



| Document | Purpose |

|----------|---------|

| This file | Vision, MVP bar, example flow |

| [`AGENTS.md`](../AGENTS.md) | Agent operating rules |

| [`docs/prompts/`](./prompts/) | Runtime specialist prompts (when added) |

| [`plans/mvp_implementation_plan_a41c92e4.plan.md`](./plans/mvp_implementation_plan_a41c92e4.plan.md) | Engineering PR phases |

| [`plans/gui_editor_mvp_roadmap.md`](./plans/gui_editor_mvp_roadmap.md) | UI / preview phases |



---



## Revision history



| Date | Change |

|------|--------|

| 2026-05-22 | Initial vision |

| 2026-05-22 | Glossary; prompt engineering cross-ref |

| 2026-05-22 | Quality bar, phased MVP, build order, events, autotiles, gameplayNotes, deferred items |


