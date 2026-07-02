# Application core in handlers.ts with dual driving adapters

All transport-agnostic use cases live in `handlers.ts` (application core): config, map reads/writes, AI chat entry, compile/test helpers. Electron IPC (`ipc-handlers.ts`) and local HTTP (`api-server.ts` on `:3001`) are thin **driving adapters** that delegate to the same handler functions — not two backends.

The Electron host boots **both** adapters: IPC for the desktop shell (native dialogs, push events such as delete-preflight progress) and Express for browser-only dev mode and Playwright against `http://localhost:5173` (renderer uses HTTP when `window.electron` is absent). `browser-server.ts` is the lightweight host that runs HTTP only. Domain code does not import Electron or Express.

**Considered:** IPC-only (drop Express); separate domain services per transport; moving use cases into renderer. **Rejected** because HTTP fallback and Playwright automation are already wired; duplicating handlers per transport would drift; renderer must stay presentation-only.

**Consequences:** Handler split (R1) and typed application port (R2/R10) refactor this surface without changing product behavior. Executor skeleton (R3) lands **after** R1 so new write-path code has a clear module home. Folder renames (R9–R11) are mechanical follow-ups once the port contract stabilizes.
