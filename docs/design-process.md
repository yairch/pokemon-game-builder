# Design process — session reference

Use this document as the **system prompt / context** for dedicated architecture grilling sessions. Each session is self-contained; paste the session block plus links to `CONTEXT.md`, `docs/architecture/overview.html`, and `docs/VISION.md`.

**Skills:** primary [`grill-with-docs`](../.agents/skills/grill-with-docs/SKILL.md); follow-up [`improve-codebase-architecture`](../.agents/skills/improve-codebase-architecture/SKILL.md) for module deepening.

**Council-of-agents pattern:** optional for *design debates* (orchestrator vs executor trade-offs, remote vs local). Not for day-to-day coding. Prefer **grill-with-docs** for terminology + ADRs; use multi-agent council only when comparing 2+ architectural alternatives with explicit trade-offs.

---

## Session 0 — Prerequisites (human)

- Read `docs/architecture/overview.html` once.
- Skim `docs/VISION.md` § Current state + MVP.
- Know your interview story: *local AI companion that writes real Essentials files*.

---

## Session 1 — Stack & platform decisions

**Goal:** Defend Electron, React, Ruby, RMXP, `.rxdata` in an interview.

**Grill questions:**

1. Why desktop (Electron) vs web-only vs React Native?
2. Why React in renderer if we already have Node in main?
3. Why Ruby bridge instead of TS Marshal library?
4. Why sit on Essentials instead of custom JSON/SQLite/game engine?
5. What breaks if we drop RMXP compatibility?
6. Which alternatives are clearly wrong at this scale?

**Code to inspect:** `src/main/map-generator.ts`, `src/bridge/marshal_handler.rb`, `src/main/browser-server.ts`.

**Deliverables:** Update `CONTEXT.md` terms *Essentials project*, *Ruby bridge*, *RXData*. Optional ADR: `docs/adr/0001-local-first-essentials-compat.md`.

---

## Session 2 — Layers & component drill-down

**Goal:** Explain hexagonal architecture and every folder in learning order.

**Grill questions:**

1. What is “local backend” here — is it a server?
2. Walk through one user action: select map → preview updates.
3. Walk through: chat “create town” → file on disk.
4. What is `App.tsx` vs Electron boilerplate?
5. Why `handlers.ts` must not import `electron`?
6. Why two transports (IPC + Express)?

**Code to inspect (order):** `shared/types.ts` → `map-generator.ts` → `handlers.ts` → `ipc-handlers.ts` / `api-server.ts` → `renderer/services/bridge.ts` → `App.tsx`.

**Deliverables:** Confirm `docs/architecture/overview.html` component section. Optional ADR: `docs/adr/0002-handlers-as-domain-core.md`.

---

## Session 3 — Domain model, CQRS, planned executor

**Goal:** Connect POC to VISION agent architecture.

**Grill questions:**

1. Explain CQRS in this app (read preview vs write patch).
2. What is MapSpec vs MapData vs (planned) MapPatch?
3. Where will orchestrator / specialists live?
4. What must the executor own vs what agents must never do?
5. What is patch-first iteration and why?

**Docs:** `AGENTS.md`, `docs/VISION.md` MVP table, `docs/plans/mvp_implementation_plan_a41c92e4.plan.md`.

**Deliverables:** Extend `CONTEXT.md`: *TownPlan*, *MapPatch*, *Executor*, *Game Bible*. Sketch folder plan for `src/executor/` (no code required in session).

---

## Session 4 — File structure & documentation alignment

**Goal:** Portfolio-ready repo clarity.

**Grill questions:**

1. Is `shared/` the right name? What belongs there vs `main/`?
2. When should we split `handlers.ts`?
3. README vs VISION vs CONTEXT — who owns what?
4. What’s missing for a senior engineer reviewer (`adr/`, `prompts/`)?

**Deliverables:** README summary line; retire duplicate content in `PROJECT_CONTEXT.md`; add ADRs for decisions made in sessions 1–3.

---

## Session 5 — Scale, remote services, interview narrative

**Goal:** When to add a remote backend; how design survives it.

**Grill questions:**

1. What stays local forever for Essentials users?
2. What services belong in the cloud (AI proxy, collaboration, vision batch)?
3. How does Protobuf/Scala-style service map to current `handlers.ts` seam?
4. What would you tell a mobile background interviewer about this project in 60 seconds?

**Deliverables:** Optional ADR: `docs/adr/0003-remote-adapter-not-domain-move.md`.

---

## Interview cheat sheet (60 seconds)

> Pokemon Game Builder is a local Electron app for Pokémon Essentials developers. React workbench previews maps from real RMXP files while a Node domain layer applies AI-driven edits. A Ruby adapter reads/writes Marshal `.rxdata` because that’s what the engine consumes. Architecture is hexagonal: IPC and HTTP are adapters; business logic stays in testable handlers; shared pure TypeScript holds domain types and map-tree rules. Roadmap adds CQRS-style patches—agents propose, executor validates and writes.

---

## Open decisions log

Track unresolved items here between sessions:

| # | Question | Status |
|---|----------|--------|
| 1 | Split `handlers.ts` by domain now or with executor PR? | Open |
| 2 | Council-style multi-agent review for orchestrator design? | Open — prefer grill-with-docs first |
| 3 | First ADR batch (0001–0003) | Pending session completion |
