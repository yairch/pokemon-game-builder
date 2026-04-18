---
name: GUI Editor MVP Roadmap
overview: Companion document to the main MVP implementation plan — how the Pokemon Game Builder UI evolves toward replacing RPG Maker XP for day-to-day mapping, while staying MVP-scoped and incremental.
extends: mvp_implementation_plan_a41c92e4.plan.md
isProject: false
---

# GUI & Map Editor — MVP Roadmap (companion plan)

This document **extends** the technical MVP phases in [`mvp_implementation_plan_a41c92e4.plan.md`](./mvp_implementation_plan_a41c92e4.plan.md). That plan owns **Ruby bridge, AI, validation, and data pipelines**. This plan owns **layout, preview parity, and editor UX** toward a **modern, AI-integrated game builder** that eventually reduces or removes the need to open RPG Maker XP.

## North star

- **Short term:** Trust the in-app map preview (grid, layers, events, tileset context) for iteration; open RPG Maker XP only when needed.
- **Long term:** A cohesive **workbench** (maps, tileset, layers, events, AI) with polish and keyboard-first workflows comparable to a small IDE — not a pixel-perfect clone of RMXP.

## Design principles (MVP)

1. **Progressive disclosure:** Ship a readable default layout; advanced tools stay one click away until ready.
2. **Parity where it matters:** Grid, layer focus (opacity), event markers, and correct **on-disk** map reads matter more than cosmetic RMXP chrome.
3. **Honest limitations:** Autotile *rendering* parity with RMXP is a dedicated follow-up (neighbor-aware composition). Until then, label limitations in UI copy and track in this roadmap.
4. **Single source of truth:** Preview layers/events from **`read-map`** when possible so cloned template events appear without duplicating Ruby logic in the client.
5. **Accessibility:** Visible focus rings, `aria-pressed` on layer toggles, sufficient contrast, hit targets ≥ 36px where practical.

## Current baseline (this repo)

- Map preview canvas with pan/zoom and tileset decoding (regular + autotile slots).
- Project selector, AI chat, map tests, compile POC.
- Tileset ID modal from project panel.

## MVP phases (GUI track)

### G0 — Workbench shell (done in same branch as PR 1.1+)

- **Workbench card:** Map tree + preview + integrated tile palette in one scroll-friendly region.
- **Maps & folders tree:** Built from `MapInfos` `parentId` / `order` (same mental model as RMXP tree).
- **Layer strip:** Layer 1 / 2 / 3 / Events — **non-selected tile layers dimmed** like RMXP focus; **Events** mode dims all tile layers and emphasizes event markers.
- **Grid overlay** on the preview canvas.
- **Event markers** from `read-map` `events[]` (MVP: icon + tooltip / title with id + name).

### G1 — Preview fidelity (next after G0)

- **Autotile render parity:** Implement RMXP-style autotile composition (48 pattern indices + neighbor rules) per Essentials autotile sheets — likely a dedicated module + golden PNG tests.
- **Event graphics (optional MVP+):** Draw first page `graphic` (charset / tile graphic) when data available; fallback to markers until charset assets are resolved.

### G2 — Editing (post-MVP core product)

- **Tile pick → paint:** Palette selection drives active tile; paint onto layer with undo stack.
- **Tools:** Pencil, rectangle fill, eyedropper — mirror RMXP tool strip where useful.
- **Clickable map:** Left-click paint, **right-click** context menu (properties, delete event, jump to script) — **documented here as future work**; first implementation may be read-only inspect.
- **Keyboard:** WASD / arrow pan, `[` `]` zoom, number keys 1–4 layer focus.

### G3 — Workbench integration

- **Multi-map sessions:** Dirty flags, “save to project” batch, conflict detection with files changed on disk.
- **Inspector panels:** Selected tile id, passage/priority readout (from `read-tilesets`), event page summary.

### G4 — “Replace RMXP” hard requirements (later)

- Full event command authoring, map properties, encounter tables, **playtest** hook or export.
- Plugin/script surface area — out of scope for this MVP roadmap except as hooks.

## Right-click & context menus (planned)

| Surface | Future action (examples) |
|--------|---------------------------|
| Map canvas | Paste, fill, “Edit event”, “Go to tile in palette” |
| Map tree | Rename, delete (with confirm), duplicate, set parent folder |
| Event marker | Edit event, delete, copy event id |
| Palette tile | Set as current tile, copy numeric id |

**MVP:** No context menus required; reserve hit-testing seams in components so G2 can attach handlers without layout rewrites.

## Traceability to main MVP plan

| Main plan item | GUI companion |
|----------------|---------------|
| PR 1.1 Canvas preview | G0 shell + grid + layer UI |
| PR 1.2 Vision | Palette + preview stay visually aligned |
| Phase 3 Events | G0 markers → G1/G2 full event UX |
| Phase 4 Validation | G3 warnings surfaced in workbench status bar |

## Review cadence

Revisit this document after each **GUI track** merge: tick completed bullets, adjust ordering based on user testing.
