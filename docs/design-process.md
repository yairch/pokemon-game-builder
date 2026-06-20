# Design process — session reference

Use this document as **context for dedicated architecture sessions**.

This project started as a **vibe-coding POC**. The design process turns it into a **presentable, maintainable system** — portfolio-ready on GitHub, defensible in interviews, and structured so you can **reuse the same architectural habits** on other products (mobile, services, or desktop).

Paste a session block into a new chat with links to [`CONTEXT.md`](../CONTEXT.md), [`docs/architecture/overview.html`](./architecture/overview.html), and [`docs/VISION.md`](./VISION.md).

**Skills:** [`grill-with-docs`](../.agents/skills/grill-with-docs/SKILL.md) for terminology + ADRs; [`improve-codebase-architecture`](../.agents/skills/improve-codebase-architecture/SKILL.md) when a session produces concrete refactor candidates.

**Council-of-agents:** optional only when comparing 2+ architectural alternatives (e.g. executor module shape). Default to grill-with-docs.

---

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

**Goal:** Map POC reality → target architecture → doc drift.

**Validate:**
- [`docs/architecture/overview.html`](./architecture/overview.html) vs `src/` — layer diagram still accurate?
- VISION § Current state + MVP gaps vs repo and plan todo statuses.
- First pass on quality bar: what clearly looks “vibe POC” vs intentional?

**Deliverables:** Mismatch list in Open decisions log. No code required.

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
| R5 | ADR batch (0001–0003) | Align | 1–5 | docs | Open |

Add rows as sessions find gaps. Close with PR or ADR reference.

---

## Open decisions log

| # | Question | Status |
|---|----------|--------|
| 1 | Split `handlers.ts` before or with executor PR? | Open |
| 2 | Keep both IPC and Express long-term? | Open |
| 3 | Council-style review for orchestrator layout? | Open — default no |

---

## Interview cheat sheet (60 seconds)

> Pokemon Game Builder is a local Electron app for Pokémon Essentials developers. React workbench previews maps from real RMXP files while a Node domain layer applies AI-driven edits. A Ruby adapter reads/writes Marshal `.rxdata` because that’s what the engine consumes. Architecture is hexagonal: IPC and HTTP are adapters; business logic stays in testable handlers; shared pure TypeScript holds domain types and map-tree rules. Roadmap adds CQRS-style patches—agents propose, executor validates and writes.

Use after sessions validate the claims above — update the paragraph if the architecture changes.
