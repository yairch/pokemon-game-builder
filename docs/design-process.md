# Design process — session reference

Use this document as **context for dedicated architecture sessions**.

This project started as a **vibe-coding POC**. The design process turns it into a **presentable, maintainable system** — portfolio-ready on GitHub, defensible in interviews, and structured so you can **reuse the same architectural habits** on other products (mobile, services, or desktop).

Paste a session block into a new chat with links to [`CONTEXT.md`](../CONTEXT.md), [`docs/architecture/overview.html`](./architecture/overview.html), and [`docs/VISION.md`](./VISION.md).

**Skills:** [`grill-with-docs`](../.agents/skills/grill-with-docs/SKILL.md) for terminology + ADRs; [`improve-codebase-architecture`](../.agents/skills/improve-codebase-architecture/SKILL.md) when a session produces concrete refactor candidates.

**Council-of-agents:** optional only when comparing 2+ architectural alternatives (e.g. executor module shape). Default to grill-with-docs.

---

## Start here — what is this process?

**End goal (all sessions):** You can explain the app’s design in an interview, the docs match the code, and you have a **prioritized refactor backlog** to implement when you switch back to coding.

**You do not implement architecture changes during design sessions.** Sessions produce decisions and doc updates. Implementation is separate PRs from the refactor backlog.

## What we are validating (quality bar)

Every session applies this lens — not only “does code match VISION?”

| Pillar | Question |
|--------|----------|
| **Industry-standard quality** | Does the design follow recognizable patterns (hexagonal, clear seams, testable core)? Would a reviewer see intentional structure, not accidental POC layout? |
| **Fit for this product** | Are the models and tools right for an AI + Essentials + local-files app — not over-engineered for a microservices scale, not under-engineered for patch-first agents + executor? |
| **Human-readable** | Can a new contributor (or future you) follow folder → layer → flow without a tour? Are names aligned with `CONTEXT.md`? |
| **Modular, not generic** | Can we extend orchestrator, executor, and bridge without rewriting UI? Are abstractions earning their keep (deletion test), not speculative interfaces? |

**Product alignment** (VISION, MVP plan, AGENTS.md) is one input to the above — not the whole bar.

**End state of the full process:** architecture validated and refactored where needed; **plans and docs aligned with the code and decisions** (CONTEXT, ADRs, overview, README, MVP sequencing).

---

## How each session works

1. **Validate** — Apply the quality bar + product intent to the session scope. List gaps (code, docs, structure).
2. **Decide** — Keep, refactor, or defer. Record load-bearing choices in ADRs.
3. **Align** — Update `CONTEXT.md`, plans, architecture overview, README so they match reality.
4. **Refactor backlog** — PR-sized items only; each tied to a quality gap.

**Exit criteria:** at least one of — ADR written, CONTEXT term resolved, refactor backlog item with scope, or doc/plan corrected.

**Learning:** walk code in learning order each session; interview fluency comes from understanding validated design, not memorizing a script.

---

## Session 0 — Baseline (once)

**Goal:** One honest snapshot — no debates yet.

**You should leave knowing:**

1. What the app **is today** (layers + main user flows).
2. What the docs **say we’re building toward** (VISION / AGENTS).
3. Where those **don’t match** (short mismatch list).

**Validate:**

- [`docs/architecture/overview.html`](./architecture/overview.html) vs `src/` — layer diagram still accurate?
- VISION § Current state + MVP gaps vs repo and plan todo statuses.
- First pass on quality bar: what clearly looks “vibe POC” vs intentional?

**Deliverables:** Baseline snapshot below + mismatch rows in Open decisions log.

### Session 0 baseline snapshot *(validated 2025-06-22)*

**What the app is today**

```
User → React workbench (tree, preview, chat)
         → bridge.ts (IPC or HTTP)
           → handlers.ts (use cases)
             → MapGenerator → marshal_handler.rb → Map###.rxdata on disk
             → ai-service-* → chat-map-pipeline → MapGenerator (on map create)
```

- **Read path:** select map in tree → `read-map` → canvas preview. Solid.
- **Write path (today):** chat → LLM returns full `mapData` → pipeline writes file. **Not** yet propose-patch → executor.
- **structure:** `main/` / `renderer/` / `shared/` / `bridge/`; thin IPC/HTTP adapters; pure logic in `shared/`.
- **Still POC-shaped:** inline LLM prompts; ~966-line `handlers.ts`; no `docs/prompts/`, no `docs/adr/`, no executor module.

**Docs that match reality:** `overview.html` layers, VISION § Current state, MVP plan completed todos (Vitest, GW+, delete preflight, event-preserving patch).

**Docs that ahead of code:** specialist agents, `MapPatch`, executor, Game Bible / `.pgb/`, `docs/prompts/`.

**Status:** Session 0 complete. Debates start in Session 1+.

---

## Session 1 — Platform & disk seam

**Goal:** Stack and disk boundary earn their place; appropriate for Essentials, not generic “app boilerplate.”

**Validate (quality bar):**
- **Fit:** Local Electron + Ruby RXData — still the right tool/model for this product?
- **Standard:** `MapGenerator` → `marshal_handler.rb` is a clear outbound adapter, not scattered file I/O.
- **Readable:** Can you explain disk flow in one diagram without hand-waving?
- **Modular:** Seam leaks (duplicate RXData knowledge in TS + Ruby)?

**Also:** browser vs Electron boot paths; error surfaces if Ruby missing.

**Code:** `src/main/map-generator.ts`, `src/bridge/marshal_handler.rb`, `src/main/browser-server.ts`, `src/main/ipc-handlers.ts`.

**Deliverables:** `CONTEXT.md` — *Essentials project*, *Ruby bridge*, *RXData*. ADR: local-first Essentials compatibility. Refactor backlog for seam issues.

### Session 1 validation snapshot *(in progress 2025-06-25)*

**Disk flow (validated)**

```
handlers.ts → MapGenerator → spawn(ruby, marshal_handler.rb, <command>, <paths>)
              JSON stdin/stdout  ↔  Marshal.load/dump  ↔  Essentials project Data/
```

| Quality pillar | Finding |
|----------------|---------|
| **Fit** | Local Electron + Ruby RXData is correct for Essentials. Overview.html stack section matches code. |
| **Standard** | Command-based CLI adapter (`create_map`, `read_map`, `patch_map_tiles`, `delete_maps`, …) is a recognizable outbound port. |
| **Readable** | One diagram explains read and write paths. `overview.html` layer diagram accurate. |
| **Modular** | **Gap:** ~250 lines of TS Marshal `Table` binary patching (`patchMapDataBinary`) duplicate Ruby knowledge; production always uses Ruby path (`useRubyPatch` default `true`). |

**Browser vs Electron boot:** Both call `boot()` + `startApiServer()`. Electron adds `ipcMain` delegates and native directory picker; config path differs (`userData` vs `~/.pokemon-game-builder/`). Ruby bridge resolution handles packaged vs dev paths.

**Ruby missing:** Friendly install message on `create_map` ENOENT; most other spawn sites use generic "Ruby is not installed or not in PATH."

**Decisions recorded:** [ADR 0001](./adr/0001-local-first-ruby-bridge.md) — keep local-first + Ruby bridge.

**Decided:** Remove TS `patchMapDataBinary` fallback — Ruby-only RXData writes (R7). Unify Ruby-missing error messages via shared helper (R8). **Dual host:** Electron desktop = primary dogfood path; `browser-server` = optional lightweight dev host (keep, not delete). Playwright / AI vision: automate `http://localhost:5173` — works with **either** host because both run Express on :3001 and the renderer falls back to HTTP when `window.electron` is absent (Playwright’s browser is not the Electron shell). Domain code (`handlers.ts`, `MapGenerator`) stays host-agnostic.

**Naming (Session 1 → 2 handoff):** Drop generic “bridge”. Filesystem/data = **game data layer** (`GameDataStore` + `game-data/implementations/*`). User opens an **Essentials project** (folder); layer name describes capability, not “project”. Main = **driving** + **driven** adapters (IPC/HTTP split). Renderer = **presentation** + **Host API**. Implementation names (marshal-ruby, rxdata) live only under `implementations/`. See R9–R11.

**Naming (Session 2):** Driven disk adapter = **GameDataStore** (decided over GameDataGateway and project-data-client). Code path target: `game-data-store.ts` (today `map-generator.ts`).

**Status:** Session 1 complete. Next: Session 2 — transport & domain core (R1, R2, R9, R11).

---

## Session 2 — Transport & domain core

**Goal:** Hexagonal split is real in code — testable, readable, extendable for executor work.

**Validate (quality bar):**
- **Standard:** `handlers.ts` free of Electron/Express; adapters are thin delegates.
- **Readable:** One client (`bridge.ts`); trace read path (tree → preview) and write path (chat → disk).
- **Modular:** Is `handlers.ts` size hurting locality? What splits improve extension without over-abstracting?
- **Fit:** Dual transport (IPC + Express) — justified for dev/browser, or simplify?

**Code (learning order):** `shared/types.ts` → `map-generator.ts` → `handlers.ts` → `ipc-handlers.ts` / `api-server.ts` → `renderer/services/bridge.ts` → `App.tsx`.

**Deliverables:** Update architecture overview if wrong. ADR: handlers-as-domain-core. Backlog: split handlers, typed bridge contract.

### Session 2 validation snapshot *(in progress 2025-06-27)*

**Transport & core flow (validated)**

```
Renderer bridge.ts → IPC (ipc-handlers) or HTTP (api-server :3001)
                   → handlers.ts (application core)
                   → MapGenerator / chat-map-pipeline / ProjectService / delete-preflight
```

| Quality pillar | Finding |
|----------------|---------|
| **Standard** | `handlers.ts` has no Electron/Express imports. `ipc-handlers.ts` and `api-server.ts` are thin delegates. |
| **Readable** | Read path: tree → `read-map` → `handleReadMap` → Ruby. Write path (today): chat → `handleAIChat` → `chat-map-pipeline` → disk. |
| **Modular** | **Gap:** `handlers.ts` is **~1,100 lines** (~500 lines private test-map generators + tileset asset I/O). String IPC/HTTP channels duplicated in three places (`ipc-handlers`, `api-server`, `bridge.ts`). |
| **Fit** | Dual transport justified: IPC push for delete-preflight; HTTP for browser host + Playwright; same handlers either way. |

**Decisions recorded:** [ADR 0002](./adr/0002-handlers-as-domain-core.md) — application core in `handlers.ts`; keep IPC + Express driving adapters.

**Decided:** **R1 before R3** — split `handlers.ts` by domain (config / maps / ai) and extract test-map + tileset-asset helpers **before** executor skeleton PR; no behavior change in R1. **Dual transport:** keep both (Session 1 + validated in code). **PR order:** R1 → R2/R10 (typed port) → R9/R11 (folder renames); R7/R8 parallel anytime.

**R1 target modules (implementation scope):** `handlers/config-handlers.ts`, `handlers/map-handlers.ts`, `handlers/ai-handlers.ts`, thin `handlers.ts` barrel; extract `map-test-generators.ts`, `tileset-asset-resolver.ts` from private helpers.

**Decided (R9/R11 timing):** Folder restructure **after R2/R10** — typed application port first, then mechanical moves (`host/`, `adapters/`, `host-api/`, `game-data-store`).

**Status:** Session 2 complete. Next: Session 3 — domain model & target executor (R3, R4).

---

## Session 3 — Domain model & target executor

**Goal:** Types and flows match planned propose/execute model; patch-first is structurally possible.

**Validate (quality bar):**
- **Fit:** `MapSpec` / `MapData` sufficient for patch-first MVP? CQRS read vs write visible in code?
- **Modular:** Clear boundary where chat-map-pipeline ends and executor must start; agents never write files.
- **Standard:** AGENTS.md specialist/executor split reflected in folder plan — not all logic stuck in `ai-service-*`.

**Docs:** `AGENTS.md`, `docs/VISION.md`, MVP plan Phase 2+.

**Deliverables:** `CONTEXT.md` — *TownPlan*, *MapPatch*, *Executor*, *Game Bible*. Backlog: executor skeleton PR. Fix MVP plan sequencing only if validation proves it wrong.

### Session 3 validation snapshot *(grill session 2026-08-04)*

**AI pipeline intentions (why this shape):**

1. **Token efficiency** — semantic ops + cached vocabulary; not full tile grids every turn.
2. **Focused context** — orchestrator assembles bundle or agent pulls via read tools; compact map summary.
3. **Scoped output + validation** — hybrid tool loop; executor validates; human approves each apply retry.

**Decisions recorded:** [ADR 0004](./adr/0004-ai-pipeline-orchestrator-executor.md).

| Topic | Decision |
|-------|----------|
| Context to specialist | **B** — orchestrator pre-assembles message + `selectedMapId` + map summary + TownPlan/bible excerpts; read tools on demand |
| Tile vocabulary | **B** — per-tile semantics + curated entity templates in `.pgb/cache/` |
| Passability | **C** — tile defaults + template cell overrides (doors, counters) |
| Composer output | **A** — semantic ops (`stamp`, `clear`, `fill`, …), not raw tile IDs |
| Executor v1 scope | **A** — patch selected map only; **A1** — block if no map selected |
| Module placement | **A now** — `executor/` for R3; **C later** — orchestrator + prompts, retire `chat-map-pipeline` entry (R4) |
| Cache build | **D** — lazy on first AI use + manual refresh from Tileset Inspector (mtime/hash) |
| Map summary | **B** — metadata + semantic regions (scan vs vocabulary/templates) + events |
| Routing | **Hybrid** — in-app tool loop (D2) + hard gates (A1, executor-only writes); MCP **deferred** post-MVP ([ADR 0004](./adr/0004-ai-pipeline-orchestrator-executor.md)) |
| Apply failures | Structured errors; optional region read on agent request; max 3 retries; user approves each retry via inline chat card (Retry with optional message / Cancel) |
| Create-map migration | **Provisional B** — keep legacy path until Phase 4 town generation; **revisit before that work** |

**Status:** Session 3 complete. Next: Session 4 — file structure & doc ownership (or implement R1 → vocabulary cache → R3).

### Session 3b — deferred grill *(complete 2026-08-15)*

Topics raised after Session 3; decide before staging-related implementation.

| # | Topic | Status |
|---|--------|--------|
| 1 | **Chat history** | **Done** |
| 2 | **Validation layers** | **Done** |
| 3 | **Staging / save model** | **Done** |
| 4 | **ADR 0004 amend** | **Done** — no amend for MVP |

**Chat history (Topic 1 — decided 2026-08-05)**

| Decision | Choice |
|----------|--------|
| MVP UI transcript | **Ephemeral** — in-memory only; no `.pgb/sessions/` yet |
| Post-MVP target | Persisted history per project + **multiple named chat sessions** |
| MVP model context | **Hybrid (C):** small in-memory sliding window (~6–10 messages) + **map summary + selectedMapId + TownPlan/bible every turn** |
| Apply state | **Action log lite** — last apply result (success / structured errors) in orchestrator state, not full chat replay |
| Rationale | Industry pattern: working memory + ground-truth re-read; prove pipeline + quality bar before session UX |

**Validation layers (Topic 2 — decided 2026-08-15)**

| Decision | Choice |
|----------|--------|
| Blocking gate | **Pre-apply validation only** — executor rejects illegal MapPatches; no write |
| App QA | **On demand**, warnings only — warps, walkable NPCs, must-have checklist; does not block apply |
| Smoke checklist | **Manual** — user runs Game.exe; not an automated gate |
| Pre-commit | **N/A until Topic 3** — exists only if staging is adopted |
| Rejected | App QA after every apply (B); block writes on App QA (C) |
| Rationale | Prove patch path first; App QA is often cross-map and noisy while town quality is still being tuned |

**Staging / save model (Topic 3 — decided 2026-08-15)**

| Decision | Choice |
|----------|--------|
| MVP | **Write-through** — successful apply writes directly to `Data/`; preview and Game.exe see the same files |
| Post-MVP | **Staging overlay** (GUI G3) — `.pgb/staging/`, Save / Discard, after pipeline meets quality bar |
| Rejected for MVP | Staging overlay (B) — too much infra before patch path is proven |
| Rationale | Same sequencing as ephemeral chat: prove write path first; preview is the cheap iteration loop |

**ADR 0004 amend (Topic 4 — decided 2026-08-15)**

| Decision | Choice |
|----------|--------|
| MVP | **No amend** — [ADR 0004](./adr/0004-ai-pipeline-orchestrator-executor.md) stands: `apply_patch` validates and writes RXData to the Essentials project |
| When staging lands | Amend ADR 0004: `apply_patch` → stage; explicit Save commits to `Data/`; revisit in G3 design |

**Status:** Session 3b complete. Next: **Session 3c** — showcase MVP, measurement, LLM port, distribution.

### Session 3c — Showcase MVP, measurement, LLM port, distribution *(opened 2026-10-29)*

Gaps found when reviewing the design against the portfolio goal: the design covered fullstack seams and the AI pipeline shape, but not **how AI quality is measured**, **how the model is called for a tool loop**, **what a patch looks like on the wire**, or **how the app ships without third-party assets**. VISION updated with M1/M2/M3, [Measurement](./VISION.md#measurement), and [Distribution & third-party assets](./VISION.md#distribution--third-party-assets).

| # | Topic | Status |
|---|--------|--------|
| 1 | **MVP reframe** | **Decided (principle)** — M1 Showcase MVP / M2 starter town / M3 installable release; M1 scope details confirmed in grill |
| 2 | **Measurement from the start** | **Decided** — turn traces + eval suite in M1, before the new pipeline; baseline the legacy pipeline |
| 3 | **LLM port** | **Open** — recommendation A below |
| 4 | **Patch schemas** | **Open** — sketch before R3; owned by the R3 PR |
| 5 | **Distribution & assets** | **Decided (principle)** — never bundle third-party assets; synthetic fixtures; BYOK. Open for M3: Ruby runtime bundling, installer tooling, public name |
| 6 | **Shared autotile module** | **Proposed** — one pure module in `src/shared/` used by preview (G1) and executor |
| 7 | **Vocabulary approach** | **Investigation** — time-boxed spike (R19): vision vs map-mined vs curated; label granularity; autotile labels; cost per tileset |

**LLM port (Topic 3)**

Today `IAIService.chat(message, context) → any` is one-shot text: the adapter builds its own prompt, parses a full `mapData` out of the reply, and returns `any`. ADR 0004's tool loop needs more from the model call: system prompt + message history, **tool definitions**, the model's **tool calls** (name + JSON args) back, tool results fed in on the next call, and **token usage** per call for traces. Default model ids in the adapters are also stale.

| Option | Shape | Trade-off |
|--------|-------|-----------|
| **A (recommended)** | Provider-neutral port (`complete({ system, messages, tools }) → { content, toolCalls, usage, stopReason }`); **Claude adapter only** for the tool loop in M1. Gemini stays on the legacy chat path until R4 retires it, then ported or dropped | Clean seam, interview-explainable, one adapter to debug; Gemini parity deferred |
| B | Same port, Claude + Gemini adapters both in M1 | Proves the port is real; doubles tool-calling edge cases and eval runs |
| C | Third-party LLM abstraction library behind the port | Less code; extra dependency and less to show; still need own trace/usage shape |

Orchestrator loop, tool registry, and prompts live in the application core — never in adapters ([ADR 0003](./adr/0003-typescript-style-by-layer.md)). Model ids become config with current defaults; which model per specialist is decided by eval results.

**Patch schemas (Topic 4)** — illustrative, not final:

```json
{
  "mapId": 3,
  "ops": [
    { "op": "fill",  "terrain": "water", "region": { "x": 14, "y": 2, "w": 5, "h": 4 } },
    { "op": "stamp", "template": "tree_small", "at": { "x": 13, "y": 1 } },
    { "op": "clear", "layer": 2, "region": { "x": 8, "y": 10, "w": 2, "h": 2 } }
  ]
}
```

```json
{
  "mapId": 3,
  "events": [
    { "op": "add_npc", "at": { "x": 10, "y": 7 }, "charset": "NPC 01",
      "faceOnInteract": true, "dialogue": ["Hi there!", "The pond is new."] }
  ]
}
```

Decide in R3: op list and fields, region vs polygon, layer selection (explicit vs template-implied), validation error shape (`{ opIndex, code, message, cells? }`), and the JSON Schema used for tool definitions + executor validation (single source).

**Status:** Session 3c open — grill Topics 1 (M1 scope details), 3, 4; then **Session 6**.

---

## Session 4 — File structure & doc ownership

> **Folded into Session 6** (2026-10-29) — doc ownership and README alignment happen with the plan rewrite.

**Goal:** Repo structure supports next PRs; docs teach the design; portfolio reader isn’t misled.

**Validate (quality bar):**
- **Readable:** `shared/` vs `main/` vs `renderer/` — obvious what goes where?
- **Standard:** Tests colocated; pure logic in `shared/`; no I/O there.
- **Align:** README vs VISION vs CONTEXT — one owner per concern; `PROJECT_CONTEXT.md` pointer only.
- **Conventions:** TS/React style documented per layer (functional UI + handler functions vs adapter classes) — see [ADR 0003](./adr/0003-typescript-style-by-layer.md). Not a standalone session topic unless a mismatch blocks contributors.

**Deliverables:** Doc fixes. ADRs from sessions 1–3. Prioritized refactor backlog. GitHub README reflects validated architecture.

---

## Session 5 — Scale boundaries (local vs remote)

> **Reduced** (2026-10-29) — one short ADR (remote = new adapter at the seam, not a domain move); not blocking M1.

**Goal:** Local-first design extends without rewriting domain; no premature cloud complexity.

**Validate (quality bar):**
- **Fit:** What must stay local forever for Essentials users?
- **Modular:** Remote future = new adapter at seam, not moving domain into a server by default.
- **Standard:** Compare to patterns you know (mobile BFF, gRPC services) — what transfers, what doesn’t?

**Deliverables:** ADR: remote-adapter-not-domain-move (if on roadmap). Backlog: API base URL config, adapter sketch.

---

## Session 6 — Plans & docs alignment (closing)

**Goal:** Single story across code, architecture docs, and MVP sequencing.

**Validate:**
- MVP plan PR order matches validated seams (handler split before executor — resolved Session 2).
- `docs/architecture/overview.html` matches post-refactor structure.
- `CONTEXT.md` complete for current + next milestone terms.
- ADRs indexed; no stale claims in README.
- MVP plan todos rewritten as **M1 / M2 / M3** milestones (VISION build order); stale phases fixed — tool-calling is foundational (ADR 0004), validation split into pre-apply + App QA, “enhanced prompts” → `docs/prompts/` + orchestrator.
- Session 4 scope (doc ownership, README) included.

**Deliverables:** Updated plans if needed; close or reprioritize Open decisions log; mark refactor items done or scheduled.

---

## Refactor backlog

Concrete work from validation — each row should cite which quality pillar it fixes.

| ID | Item | Pillar | Session | Scope | Status |
|----|------|--------|---------|-------|--------|
| R1 | Split `handlers.ts` by domain (maps / ai / config); extract test-map + tileset-asset helpers | Modular / readable | 2 | 1–2 PRs | Open — **before R3** (Session 2) |
| R2 | Typed bridge contract (replace string channels) | Standard / readable | 2 | 1 PR | Open |
| R3 | Executor module (`src/main/executor/`) — patch path: validate → resolve semantic ops → write; structured validation errors | Fit / modular | 3 | 1 PR | Open — **after R1**; patch selected map only ([ADR 0004](./adr/0004-ai-pipeline-orchestrator-executor.md)) |
| R4 | Orchestrator + in-app tool registry + `docs/prompts/`; inline chat retry UX; retire `chat-map-pipeline` entry | Align / fit | 3 | 1–2 PRs | Open — **after R3** |
| R5 | ADR batch (0001–0004) | Align | 1–5 | docs | Done — [0001](./adr/0001-local-first-ruby-bridge.md) … [0004](./adr/0004-ai-pipeline-orchestrator-executor.md) |
| R12 | Pass `selectedMapId` from workbench to chat/AI path; block patch intents when null | Fit | 3 | with R3/R4 | Open |
| R13 | Tile vocabulary cache (`.pgb/cache/`) — lazy build + Tileset Inspector refresh | Fit | 3 | with PR 2.1 / R3 | Open |
| R6 | Reconcile MVP plan todos with AGENTS build order (Game Bible, prompts, executor) | Align | 6 | docs | Open |
| R7 | Remove TS `patchMapDataBinary` fallback; Ruby-only RXData writes | Standard / fit | 1 | 1 PR | Open — decided Session 1 |
| R8 | Unify Ruby-missing error messages across all `MapGenerator` spawn sites | Readable | 1 | 1 PR | Open — decided Session 1 |
| R9 | Restructure: `main/host/`, `adapters/driving|driven/`, `game-data/implementations/`, split Host API | Readable / modular | 2 | 1–2 PRs | Open — **after R2/R10** (Session 2) |
| R10 | Typed application port; share contract between Host API transports and driving adapters (extends R2) | Standard / readable | 2 | with R2 | Open |
| R11 | Rename `bridge.ts` → `host-api/`; `MapGenerator` → `GameDataStore` (`game-data-store.ts`) | Readable | 2 | with R9 | Open — **after R2/R10** (Session 2) |
| R14 | Eval harness — golden cases on fixture project; deterministic checks; replay + live modes; dated report | Fit / standard | 3c | 1–2 PRs | Open — M1, **before R3** (baseline legacy pipeline) |
| R15 | Turn traces — JSONL under `.pgb/traces/` (model, prompt version, tool calls, tokens, cost, latency, attempts) | Fit / standard | 3c | 1 PR | Open — M1, with R16 |
| R16 | Provider-neutral LLM port (messages, tools, tool calls, usage); Claude adapter; model ids as config with current defaults | Modular / fit | 3c | 1 PR | Open — pending Topic 3 decision |
| R17 | CI — GitHub Actions: typecheck, unit tests, eval replay (Ruby available) | Standard | 3c | 1 PR | Open — M1 foundation |
| R18 | Shared neighbor-aware autotile module in `src/shared/` (water first) — used by preview G1 and executor | Modular | 3c | 1 PR | Open — M1, with R3 |
| R19 | Vocabulary spike — compare vision / map-mined / curated on one tileset; pick approach for R13 | Fit | 3c | time-boxed spike | Open — M1, before R13 |
| R20 | Synthetic fixture project — original small tileset PNG + generated RXData; no third-party assets | Standard / fit | 3c | 1 PR | Open — M1, before R14 |
| R21 | API key handling — remove compiled `constants.ts` keys; env/config now, OS-protected storage in M3 | Standard | 3c | 1 PR | Open — before any packaged build |
| R22 | Packaging — installer, Ruby runtime (bundle vs detect), first-run Essentials setup | Fit | 3c | 2+ PRs | Open — M3 |

Add rows as sessions find gaps. Close with PR or ADR reference.

---

## Open decisions log

**Session 0 — doc/code mismatches** *(record only; decide in later sessions)*

| # | Mismatch | Decide in |
|---|----------|-----------|
| D1 | Write path is AI → full map → disk; target is propose → executor → disk | **Resolved Session 3** — patch path via semantic ops + executor ([ADR 0004](./adr/0004-ai-pipeline-orchestrator-executor.md)); create-map legacy until Phase 4 (provisional) |
| D2 | `docs/prompts/` missing; `docs/adr/` thin | Session 4 — ADR 0004 added; prompts land with R4 |
| D3 | MVP plan has no explicit PRs for Game Bible, `.pgb/`, executor skeleton (AGENTS.md does) | Session 6 |
| D4 | “Orchestrator” in MVP plan (multi-map) vs AGENTS (route specialists) — same word? | **Resolved Session 3** — in-app tool loop orchestrator ([ADR 0004](./adr/0004-ai-pipeline-orchestrator-executor.md)); MVP Phase 5.2 “map-orchestrator” = multi-map generation coordinator, rename or cross-link in Session 6 |

**Architecture debates** *(not for Session 0)*

| # | Question | Status | Session |
|---|----------|--------|---------|
| 1 | Split `handlers.ts` before or with executor PR? | **Resolved — before executor (R1 then R3)** | 2 |
| 2 | Keep both IPC and Express long-term? | **Resolved — keep both** ([ADR 0002](./adr/0002-handlers-as-domain-core.md)) | 2 |
| 2b | R9/R11 folder restructure same PR as R2 or after? | **Resolved — after R2/R10** | 2 |
| 3 | Executor: evolve `chat-map-pipeline` in place vs new `executor/` module? | **Resolved — new `executor/` for R3; full orchestrator + retire pipeline entry in R4** ([ADR 0004](./adr/0004-ai-pipeline-orchestrator-executor.md)) | 3 |
| 4 | Council-style review for orchestrator layout? | **Resolved — no runtime council; hybrid tool loop; design-time council stays optional** ([ADR 0004](./adr/0004-ai-pipeline-orchestrator-executor.md)) | 3 |
| 5 | MCP-exposed tools for external agents (Cursor driving app)? | **Resolved — defer post-MVP; in-app tool registry first** ([ADR 0004](./adr/0004-ai-pipeline-orchestrator-executor.md)) | 3 |
| 6 | LLM port shape and provider parity for the tool loop (A / B / C)? | Open — recommendation A | 3c |
| 7 | Semantic op + EventPatch schema (fields, error shape, single JSON Schema source)? | Open — sketch in 3c, finalize in R3 | 3c |
| 8 | Ruby runtime for installs: bundle portable Ruby vs require user install? | Open — M3 | 3c |
| 9 | Public product name (trademark-sensitive “Pokemon”)? | Open — before M3 | 3c |

---

## Interview cheat sheet (60 seconds)

> Pokemon Game Builder is a local Electron app for Pokémon Essentials developers. React workbench previews maps from real RMXP files while a Node domain layer applies AI-driven edits. A Ruby adapter reads/writes Marshal `.rxdata` because that’s what the engine consumes. Architecture is hexagonal: IPC and HTTP are adapters; business logic stays in testable handlers; shared pure TypeScript holds domain types and map-tree rules. Roadmap adds CQRS-style patches—agents propose, executor validates and writes.

Use after sessions validate the claims above — update the paragraph if the architecture changes.
