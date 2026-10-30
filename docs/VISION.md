# Pokemon Game Builder — Product Vision



This document is the **north star** for what we are building and why. It drives roadmap prioritization, README/landing copy, and agent behavior. Technical PR sequencing lives in [`plans/mvp_implementation_plan_a41c92e4.plan.md`](./plans/mvp_implementation_plan_a41c92e4.plan.md) and [`plans/gui_editor_mvp_roadmap.md`](./plans/gui_editor_mvp_roadmap.md).



---



## North star



**An AI-first game builder** where a casual creator can describe their Pokémon-style game in chat and get **working, playable worlds** on disk — without learning RPG Maker XP.



The app sits on **RPG Maker XP + Pokémon Essentials**: it reads and writes real project files (`Map###.rxdata`, `MapInfos`, events, scripts, tilesets). The AI is the **primary interface** for world-building, storytelling, layout, and gameplay setup. RMXP becomes optional verification, not the daily editor.



**Primary motivation:** fun and creative expression. Monetization and trademark policy are **post-MVP** concerns; asset redistribution rules apply from day one (see [Distribution & third-party assets](#distribution--third-party-assets)).

**Engineering goal:** the project doubles as a **fullstack + AI engineering showcase**. Milestones are cut to deliver a working, measured proof of concept fast — then deepen. Every AI claim should be backed by a number (see [Measurement](#measurement)).



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



**Gap vs vision:** tileset vision and vocabulary cache, specialist orchestrator, neighbor-aware terrain, events at quality bar, Game Bible, validation workflow, template seed UX, **eval suite + turn traces**, **CI**, **synthetic fixture project**, **installable build**.



---



## Quality bar



- **User intent:** output matches the current prompt and (when present) Game Bible / TownPlan must-haves.

- **Patch consistency:** follow-up edits change only what the user asked; the rest of the map and plan stay stable.

- **Scenery (MVP):** must-have checklist from plan/bible **plus** user preview and chat patches — not a fixed genre template.

- **Measured:** intent and patch consistency are scored by deterministic eval checks, not only eyeballed (see [Measurement](#measurement)).

- **Later:** experiment with LLM-as-judge intent review (plan vs result) if deterministic checks miss real failures.



---



## MVP definition



Three milestones, each shippable on its own. **M1 is the MVP** — the smallest slice that proves the AI pipeline end to end, with numbers.

| Milestone | Proves | Outcome |
|-----------|--------|---------|
| **M1 — Showcase MVP** | AI pipeline works and is measured | Patch an existing map from chat; demo video + eval report |
| **M2 — Playable starter town** | Pipeline scales to multi-map content | Former “Full MVP” below |
| **M3 — Installable release** | Anyone can install and use it | Installer, first-run setup, BYOK keys |

### M1 — Showcase MVP (proof of concept)

**Flow:** open an Essentials project → select an existing map → chat *“add a pond in the northeast with trees around it, and an NPC by the path who says hello”* → orchestrator + specialists propose a semantic patch → executor validates, resolves vocabulary and water autotiles, writes → preview refreshes → *“move the pond west”* changes only the pond.

| Area | M1 scope |
|------|----------|
| **Tile vocabulary** | One outdoor tileset; cached in `.pgb/cache/` (approach chosen by time-boxed spike) |
| **Executor** | Patch selected map only ([ADR 0004](./adr/0004-ai-pipeline-orchestrator-executor.md)); semantic ops; neighbor-aware autotiles for **water** (one shared module with preview G1) |
| **Agents** | Orchestrator tool loop + map composer + event writer lite; prompts in `docs/prompts/` |
| **Events lite** | NPC with stock charset, multi-line Show Text, turn toward player. Signs optional; warps → M2 |
| **Measurement** | Turn traces + eval suite (replay in CI, live on demand); baseline the legacy pipeline first |
| **Engineering** | CI (typecheck, unit, eval replay); synthetic fixture project; current model config |
| **Showcase** | README with demo video/GIF, architecture, and eval results |

**Not in M1:** create-map via new pipeline, interiors, warps, Game Bible, template seed UX, staging overlay, installer.

**Exit criteria:** CI green; eval report committed with baseline vs pipeline numbers; demo recorded on a real local Essentials install; in Game.exe the edited map loads, pond edges render, NPC talks and faces the player.

### M2 — Playable starter town (former Full MVP)



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



Engineering order (subject to change when the implementation plan is updated in design Session 6):

**M1 — Showcase MVP**

1. **Foundation** — handler split, Ruby-only writes, CI.  
2. **LLM port + turn traces** — measure from the first AI call.  
3. **Fixture project + eval harness** — baseline the legacy pipeline before replacing it.  
4. **Vocabulary spike → vocabulary cache** — one tileset.  
5. **Executor + shared water autotiles** — preview G1 uses the same module.  
6. **Orchestrator + `docs/prompts/`** — tool loop, selected-map gate, retry cards.  
7. **Events lite** — NPC dialogue + face-on-interact.  
8. **Showcase** — eval report, demo video, README.

**M2 — Playable starter town:** town planning + create-map migration, interiors + warps, full neighbor-aware terrain, App QA + must-have checklist, Game Bible, template seed UX.

**M3 — Installable release:** packaging, Ruby runtime, first-run setup, key storage, naming review.



**Post-MVP:** richer NPC interactions (items, flags, battles, puzzles), automated intent review, full gameplay doc, tutorials, legal/monetization principles, mod-aware AI, world view / mini-region.



### Explicitly out of scope (M1–M3)



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



### Distribution & third-party assets



RPG Maker XP (and its RTP), Pokémon Essentials, and Pokémon graphics/names are **third-party copyrighted works and trademarks**; their owners set the terms. This is a **legal** constraint, not a technical one. *(Not legal advice — review before public release.)*

- **The app is a tool, not a content pack.** It operates on the user's own Essentials install and never bundles, uploads, or redistributes third-party assets — not in the repo, installer, test fixtures, or downloadable demos.
- **Fixtures are ours.** CI and evals run on a **synthetic fixture project**: a small original tileset PNG plus generated RXData, committed to the repo.
- **Demos are recordings.** Showcase uses video/screenshots of the author's local install; no downloadable sample game with third-party assets.
- **Vision uploads.** Tileset images sent for vocabulary labeling go to the user's chosen LLM provider under the user's API key; the UI says so before the first upload.
- **Keys are BYOK.** API keys live in OS-protected storage (M3), never compiled into the build.
- **Naming.** “Pokemon” in the product name is trademark-sensitive; decide a public name before M3.



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



**LLM port:** specialists talk to a provider-neutral model port (messages, tool definitions, tool calls, token usage); provider adapters sit behind it. Model ids are configuration, chosen by eval results.



---



## Measurement



Evals and traces ship **in M1, before the new pipeline**, so improvements are shown against a baseline.

- **Turn trace** — per AI turn: model, prompt versions, tool calls, tokens (incl. cached), cost, latency, apply attempts, validation errors, cells changed. Local JSONL under `.pgb/traces/`; nothing leaves the machine except the LLM calls themselves.
- **Eval suite** — golden cases on the fixture project: starting map + prompt(s) + deterministic checks (patch valid, requested terrain present in requested region, no changes outside it, events on walkable tiles).
- **Two modes** — **replay** (recorded model responses; deterministic; runs in CI) and **live** (real model; on demand; produces a dated report).
- **Headline metrics** — first-attempt validity rate, success within 3 attempts, intent-check pass rate, patch locality, tokens / cost / latency per turn (p50 / p95).
- **Prompt versioning** — prompts in `docs/prompts/` carry a version; traces and reports reference it so prompt changes are compared, not guessed.



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

| 2026-10-29 | Engineering goal; M1 Showcase MVP / M2 starter town / M3 installable release; Measurement; Distribution & third-party assets; LLM port |


