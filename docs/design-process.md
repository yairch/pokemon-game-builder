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

**Naming (Session 1 → 2 handoff):** Drop generic “bridge”. Filesystem/data = **project data layer** (`project-data-client` + `project-data/implementations/*`). Main = **driving** + **driven** adapters (IPC/HTTP split). Renderer = **presentation** + **Host API**. Implementation names (marshal-ruby, rxdata) live only under `implementations/`. See R9–R11.

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

---

## Session 3 — Domain model & target executor

**Goal:** Types and flows match planned propose/execute model; patch-first is structurally possible.

**Validate (quality bar):**
- **Fit:** `MapSpec` / `MapData` sufficient for patch-first MVP? CQRS read vs write visible in code?
- **Modular:** Clear boundary where chat-map-pipeline ends and executor must start; agents never write files.
- **Standard:** AGENTS.md specialist/executor split reflected in folder plan — not all logic stuck in `ai-service-*`.

**Docs:** `AGENTS.md`, `docs/VISION.md`, MVP plan Phase 2+.

**Deliverables:** `CONTEXT.md` — *TownPlan*, *MapPatch*, *Executor*, *Game Bible*. Backlog: executor skeleton PR. Fix MVP plan sequencing only if validation proves it wrong.

---

## Session 4 — File structure & doc ownership

**Goal:** Repo structure supports next PRs; docs teach the design; portfolio reader isn’t misled.

**Validate (quality bar):**
- **Readable:** `shared/` vs `main/` vs `renderer/` — obvious what goes where?
- **Standard:** Tests colocated; pure logic in `shared/`; no I/O there.
- **Align:** README vs VISION vs CONTEXT — one owner per concern; `PROJECT_CONTEXT.md` pointer only.

**Deliverables:** Doc fixes. ADRs from sessions 1–3. Prioritized refactor backlog. GitHub README reflects validated architecture.

---

## Session 5 — Scale boundaries (local vs remote)

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
- MVP plan PR order matches validated seams (executor before/after handler split — resolved from backlog).
- `docs/architecture/overview.html` matches post-refactor structure.
- `CONTEXT.md` complete for current + next milestone terms.
- ADRs indexed; no stale claims in README.

**Deliverables:** Updated plans if needed; close or reprioritize Open decisions log; mark refactor items done or scheduled.

---

## Refactor backlog

Concrete work from validation — each row should cite which quality pillar it fixes.

| ID | Item | Pillar | Session | Scope | Status |
|----|------|--------|---------|-------|--------|
| R1 | Split `handlers.ts` by domain (maps / ai / config) | Modular / readable | 2 | 1–2 PRs | Open |
| R2 | Typed bridge contract (replace string channels) | Standard / readable | 2 | 1 PR | Open |
| R3 | Executor module skeleton + validator seam | Fit / modular | 3 | 1 PR | Open |
| R4 | `docs/prompts/` with orchestrator PR | Align | 3 | with agent PR | Open |
| R5 | ADR batch (0001–0003) | Align | 1–5 | docs | In progress — [0001](./adr/0001-local-first-ruby-bridge.md) done |
| R6 | Reconcile MVP plan todos with AGENTS build order (Game Bible, prompts, executor) | Align | 6 | docs | Open |
| R7 | Remove TS `patchMapDataBinary` fallback; Ruby-only RXData writes | Standard / fit | 1 | 1 PR | Open — decided Session 1 |
| R8 | Unify Ruby-missing error messages across all `MapGenerator` spawn sites | Readable | 1 | 1 PR | Open — decided Session 1 |
| R9 | Restructure: `main/host/`, `adapters/driving|driven/`, `project-data/implementations/`, split Host API | Readable / modular | 2 | 1–2 PRs | Open |
| R10 | Typed application port; share contract between Host API transports and driving adapters (extends R2) | Standard / readable | 2 | with R2 | Open |
| R11 | Rename `bridge.ts` → `host-api/`; `MapGenerator` → `project-data-client.ts` | Readable | 2 | with R9 | Open |

Add rows as sessions find gaps. Close with PR or ADR reference.

---

## Open decisions log

**Session 0 — doc/code mismatches** *(record only; decide in later sessions)*

| # | Mismatch | Decide in |
|---|----------|-----------|
| D1 | Write path is AI → full map → disk; target is propose → executor → disk | Session 3 |
| D2 | `docs/prompts/` and `docs/adr/` missing | Session 3–4 |
| D3 | MVP plan has no explicit PRs for Game Bible, `.pgb/`, executor skeleton (AGENTS.md does) | Session 6 |
| D4 | “Orchestrator” in MVP plan (multi-map) vs AGENTS (route specialists) — same word? | Session 3 |

**Architecture debates** *(not for Session 0)*

| # | Question | Status | Session |
|---|----------|--------|---------|
| 1 | Split `handlers.ts` before or with executor PR? | Open | 2 |
| 2 | Keep both IPC and Express long-term? | Open — IPC for Electron shell; HTTP for Playwright/external browser and browser-only host; both delegate to same handlers | 2 |
| 3 | Executor: evolve `chat-map-pipeline` in place vs new `executor/` module? | Open | 3 |
| 4 | Council-style review for orchestrator layout? | Open — default no | 3 |

---

## Interview cheat sheet (60 seconds)

> Pokemon Game Builder is a local Electron app for Pokémon Essentials developers. React workbench previews maps from real RMXP files while a Node domain layer applies AI-driven edits. A Ruby adapter reads/writes Marshal `.rxdata` because that’s what the engine consumes. Architecture is hexagonal: IPC and HTTP are adapters; business logic stays in testable handlers; shared pure TypeScript holds domain types and map-tree rules. Roadmap adds CQRS-style patches—agents propose, executor validates and writes.

Use after sessions validate the claims above — update the paragraph if the architecture changes.
