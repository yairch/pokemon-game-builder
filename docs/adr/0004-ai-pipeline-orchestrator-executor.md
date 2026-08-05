# AI pipeline — hybrid tool loop, semantic patches, executor-only writes

The in-app AI path uses a **hybrid orchestrator**: one agent with an in-app **tool registry** (read, propose, apply) — not a rule-only router and not MCP for MVP. Agents **propose** structured **semantic operations** (`stamp`, `clear`, `fill`, … with vocabulary template keys and regions); only **`apply_patch`** (the executor) validates, resolves tile IDs and autotiles, and writes RXData. Map composer and event specialists never emit raw tile grids.

**Patch-first (R3):** executor v1 owns **patch existing map** only. User must have a map selected in the workbench; otherwise the app blocks with a clear message (no inference). Legacy **create-map** (`chat-map-pipeline` full `mapData`) stays until town generation (Phase 4) — **revisit before that milestone**.

**Module shape:** new `src/main/executor/` for R3; R4 adds orchestrator + `docs/prompts/` and retires the `chat-map-pipeline` entry point (target: orchestrator + executor).

**Tile intelligence:** per-tile semantics plus curated entity templates in `.pgb/cache/` (passability defaults on tiles, overrides on templates). Built lazily on first AI use per tileset and refreshable from Tileset Inspector when the PNG changes. Map summary for context = metadata + semantic regions + events (no raw layers in prompts).

**Validation loop:** `apply_patch` returns structured errors only. Agent may request a focused region summary via read tools. Max **3** apply attempts per user turn; **before each retry** the chat shows failure + cause and user chooses Retry (optional steer message), Cancel, or Cancel + message. Inline chat action cards (not modal) unless the failure is fatal (e.g. Ruby missing).

**Considered:** rule-based orchestrator only; MCP-exposed tools for external agents (Cursor driving the app); raw tile ID output from composer; automatic silent retries; entity-reference patches (`move pond_nw`) before region scanning exists. **Rejected for MVP** because tools give focused context without MCP infra; external MCP deferred post-MVP; raw grids waste tokens; silent retries hurt trust; entity IDs need map summary labeling first.

**Consequences:** R1 (handler split) still before R3. PR 1.2 / Phase 2 vocabulary cache precede or ship with executor patch path. MCP adapter, if ever built, wraps the same tool registry — not a second orchestrator. See Session 3 snapshot in [`design-process.md`](../design-process.md).
