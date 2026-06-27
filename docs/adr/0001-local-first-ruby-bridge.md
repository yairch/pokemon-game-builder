# Local-first Essentials compatibility via Ruby Marshal bridge

Pokemon Game Builder targets real Pokémon Essentials projects on disk — `Game.exe`, `Data/*.rxdata`, and the fan-dev ecosystem. We keep the app **local-first** (Electron main process with filesystem access; optional browser dev mode still runs Node on the user's machine) and treat **Essentials on-disk format as the source of truth**, not a custom JSON or SQLite game model.

RMXP stores maps and project data as Ruby `Marshal` blobs with RPG Maker class definitions (`RPG::Map`, `Table`, etc.). Reimplementing Marshal and those classes in TypeScript is high-risk for fidelity and smoke-test playability. **`MapGenerator` spawns `marshal_handler.rb`** as the outbound disk adapter: JSON over stdin/stdout for reads and writes; Ruby owns load/dump and Essentials-compatible object graphs.

**Considered:** TS-only serialization; cloud-hosted project storage; custom intermediate format. **Rejected** for MVP because they break Essentials compatibility, add rewrite cost, or conflict with local disk access requirements.

**Consequences:** Users need Ruby on PATH (or `RUBY_BIN` / `RUBY_HOME`). Git diffs on `.rxdata` stay opaque. Future remote hosting must add an adapter at the transport seam, not move domain logic off the user's machine by default. All RXData writes go through Ruby only — no TypeScript Marshal/`Table` binary fallback (Session 1).
