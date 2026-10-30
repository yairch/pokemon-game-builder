# Provider-neutral LLM port over official SDKs; Claude adapter only for M1

The ADR 0004 tool loop needs a model call that carries system prompt, message history, tool definitions, tool calls back, tool results in, and token usage per call. The legacy `IAIService.chat(message, context) → any` is one-shot text and cannot express that. We define an **LLM port** in the application core — `complete({ system, messages, tools }) → { content, toolCalls, usage, stopReason }` — and implement it with a **thin Claude adapter on `@anthropic-ai/sdk`**. The orchestrator loop, tool registry, retry gating, and prompt assembly stay in the core; adapters only translate shapes ([ADR 0003](./0003-typescript-style-by-layer.md)).

**Reuse boundary:** we reuse **vendor SDKs** (transport, auth, streaming, typed errors, retries on 429/5xx) and do not hand-roll HTTP. We do **not** put a multi-provider framework between the core and the SDK, and we do not use SDK-side agent runners for the orchestrator loop.

**Considered:** (B) Claude + Gemini adapters both in M1; (C) a multi-provider abstraction library (e.g. Vercel AI SDK, LangChain) behind or instead of the port; SDK tool-runner helpers driving the loop. **Rejected for M1** because:

- **The hard part is not the provider call.** Tool registry, executor-only writes, user-approved retries (max 3), and action log are product logic a framework does not supply; its agent loop would have to be bypassed to insert the approval card anyway.
- **Evals need a seam we own.** Replay mode records and replays model responses at the port; traces need exact usage (incl. cached tokens) per call. A port we define makes both a ~50-line adapter concern instead of framework middleware.
- **Lowest common denominator.** Cross-provider types lag or flatten provider features we want to measure — prompt caching controls, strict tool schemas, stop reasons, cache-token usage.
- **Dependency surface.** Fast-moving framework APIs plus their transitive deps in an Electron app we must package and keep green.
- **Single provider in M1.** With one adapter, an abstraction library abstracts over nothing yet.

**When to revisit:** adding a second provider becomes a requirement (B), or a framework offers something we would otherwise build (e.g. eval tooling) — then a framework-backed adapter can implement the same port without changing the core.

**Consequences:** Gemini stays on the legacy chat path until R4 retires `chat-map-pipeline`, then is ported to the port or dropped. Model ids are configuration with current defaults; per-specialist model choice follows eval results. `AIServiceFactory` becomes `createLLMClient()` per ADR 0003 when touched.
