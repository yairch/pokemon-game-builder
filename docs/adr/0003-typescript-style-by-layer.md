# TypeScript style by architectural layer

Style follows hexagonal layers — not one pattern for the whole repo.

| Layer | Location | Style | Rationale |
|-------|----------|-------|-----------|
| **Presentation** | `src/renderer/` | Functional React components + hooks | Current React standard; no class components. |
| **Application core** | `handlers.ts` (+ future split modules) | Exported functions | Transport-agnostic use cases; easy to test from IPC and HTTP adapters ([ADR 0002](./0002-handlers-as-domain-core.md)). |
| **Shared domain** | `src/shared/` | Pure functions + types | No I/O; deterministic helpers (map tree, integrity, patch simulation). |
| **Driven adapters** | `map-generator.ts`, `ai-service-*`, `project-service.ts`, future `GameDataStore` | **Thin `class X implements IY`** | Swappable disk/LLM implementations; instance config (API keys, Ruby paths, project path) bound in the constructor. |
| **Adapter wiring** | Handler modules, small factory files | **Plain functions** (e.g. `createAIService()`) | Select and construct adapter classes; not static methods on a factory class. |

**Considered:** `createX()` factories returning object literals for all adapters. **Rejected** for this repo — existing adapters are already classes; large adapters (e.g. disk I/O) stay readable with `private` methods; `implements IY` makes the seam explicit.

**Adapter rules:** Keep classes thin — no domain rules that belong in `shared/` or handlers. Do not destructure methods off adapter instances (`const { chat } = service`). Use `private` methods or module-level pure helpers for internal logic.

**Consequences:** New React UI stays functional. New domain logic goes in `shared/` or handler functions. New driven adapters are classes behind an interface. Replace `AIServiceFactory` static methods with `createAIService()` when that file is next touched (no standalone migration PR).
