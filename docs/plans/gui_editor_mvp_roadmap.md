---
name: GUI Editor MVP Roadmap
overview: Companion document to the main MVP implementation plan — how the Pokemon Game Builder UI evolves toward replacing RPG Maker XP for day-to-day mapping, while staying MVP-scoped and incremental.
extends: mvp_implementation_plan_a41c92e4.plan.md
isProject: false
---

# GUI & Map Editor — MVP Roadmap (companion plan)

This document **extends** the technical MVP phases in [`mvp_implementation_plan_a41c92e4.plan.md`](./mvp_implementation_plan_a41c92e4.plan.md). That plan owns **Ruby bridge, AI, validation, and data pipelines**. This plan owns **layout, preview parity, and editor UX** toward a **modern, AI-integrated game builder** that eventually reduces or removes the need to open RPG Maker XP.

**Map tree editing (GW+)** is specified in [`map_worktree_editor_design.plan.md`](./map_worktree_editor_design.plan.md) (drag-drop hierarchy, delete + integrity scan, proactive `start_map_id` warning); main-plan todo **`pr-gw-map-tree`**.

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
- Single scrolling left column; instructions panel, configuration form, and preview all stack vertically.

## MVP phases (GUI track)

### G0 — Workbench shell (PR 1.1 follow-ups)

PR 1.1 base shipped the canvas (3 layers, autotile static frame, zoom/pan, hover, post-generate wiring). The remaining G0 work is split into **three PR-sized merges** (`PR-G0-1` … `PR-G0-3`); see main plan YAML `pr-g0-1`, `pr-g0-2`, `pr-g0-3`.

#### PR-G0-1 — Maps tree + preview from `read-map` + inspector trigger

**Scope**

- **`MapInfos` tree** built from `parentId` / `order` (same mental model as RMXP). Selecting a node calls **`read-map`** and feeds the preview (single source of truth on disk — not only the last `generateMap`/chat result).
- **Default state:** When a project is loaded, selected tree map renders; replace “only after generate” empties.
- **After successful generation:** refresh tree, auto-select new map id, preview follows selection.
- **Tileset Inspector** small icon on the preview header opens the inspector for the **currently previewed** map (template map stays reachable from the configuration panel).

**Suggested tests**

- Unit: pure `MapInfosReadData` → ordered tree (`parentId` / `order`, tolerate missing parents).
- Renderer / integration style: selecting a node triggers `read-map`; canvas updates.
- Renderer: successful generate flow refreshes selection and loads the new map.

#### PR-G0-2 — Event markers

**Scope**

- Draw **markers** for `read-map` `events[]` (MVP: icon or badge + **tooltip/title with event id + name**).
- Reuse **`read-map` output** only (no reconstructing cloned events in the client).

**Suggested tests**

- Unit: coordinate → event hit-test for hover/tooltips.
- Unit or canvas tests: marker draw coverage for a known small `events[]` fixture.

#### PR-G0-3 — Layer strip + grid

**Scope**

- **Layer strip:** Layer 1 / 2 / 3 / Events — non-selected tile layers **dimmed** (RMXP-style focus); **Events** mode dims all tiles and emphasizes markers (depends on PR-G0-2).
- **`aria-pressed`** on strip controls (matches **Accessibility**, design principle 5 above).
- **Grid overlay:** tile-aligned lines, **toggleable**, **on by default**.

**Suggested tests**

- Unit: rendering respects focused layer dimming rules.
- Unit: grid line count for fixed width×height.
- Renderer: strip toggles flip `aria-pressed` and trigger redraw.

**Ordering:** PR-G0-1 → PR-G0-2 → PR-G0-3 (tree + `read-map` plumbing first; markers before Events focus mode matters).

### GW — Workbench rework (between G0 and G1)

Goal: replace the single scrolling left column with a **multi-pane, modern workbench** so the map preview, tree, and chat are all first-class and resizable.

**Layout**

- **Top app bar** (sticky):
  - Brand / project name on the left.
  - **Configuration cluster** on the right as compact header buttons / poppers (modern UX best practice — keep the canvas area maximal):
    - **Project** menu (path, switch, init).
    - **AI Provider** segmented control (Claude / Gemini) + **API key** popover.
    - **Template Map** picker (the base map used by Sanity / AI / Object tests and chat generation) — clearly labeled “Template (for generation)” to distinguish from the previewed map.
    - **Run tests** split-button (Sanity / AI / Object) reusing the template selection.
    - **Help** info icon → opens the **Instructions** popover (replaces the always-on Instructions card).
- **Body** (fills remaining viewport): a **horizontal split**, draggable divider:
  - **Left pane — Map Workbench**
    - **Maps & folders tree** at the top.
    - **Map preview canvas** below the tree (or a vertical split with the tree, also draggable).
    - **Tileset Inspector** small icon button in the preview header — opens the inspector for the **previewed** map (also reachable from the template picker for the **template** map). The button is **subtle, intent-driven**: small monochrome icon, accessible label “Inspect tileset”, becomes accent-colored only on hover/focus.
  - **Right pane — Chat**
    - Existing chat pane, full height. The “Generate Map (POC)” action stays here.
- Pane sizes persist in local state for the session; double-click the divider to reset.

**Behavior**

- **Map preview source = map tree selection.** The preview never says “No map generated yet” when a project is loaded; it loads the selected tree map via `read-map` and renders it.
- **Start map integrity:** When `System.rxdata` has **no valid `start_map_id`** for the loaded maps, show a **persistent warning** near the Map Workbench / tree (details and delete rules in [`map_worktree_editor_design.plan.md`](./map_worktree_editor_design.plan.md)).
- **Template map = configuration**, separate from preview. Affects only generation flows (test buttons, chat generation).
- **After a successful generation:** map tree refreshes, the new map is auto-selected, and the preview switches to it.
- **Instructions** are not a pinned card; pressing the **info icon** opens a small popover/bubble with the same content. Closing returns the user to the workbench unobstructed.
- **Resizing:** Use a CSS / library-based resizable split with **min sizes** so neither pane collapses; persist last sizes per session.
- **Accessibility:** Header buttons keyboard-focusable in source order; the divider has `role="separator"` and arrow-key resize; popovers trap focus and close on `Esc`.

**Modern UX best practices applied**

- **Top bar for global config** keeps configuration discoverable without consuming canvas space.
- **Progressive disclosure** for low-frequency actions (Instructions, API key, provider switch) via popovers.
- **Two visible workspaces** (Workbench / Chat) instead of a tall scrolling column — matches IDE/editor mental models.
- **Subtle iconography** for power-user actions (Tileset Inspector) so the canvas stays the visual focus.

### G1 — Preview fidelity (next after GW)

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

## Right-click & context menus

| Surface | Action (examples) |
|--------|---------------------------|
| Map canvas | Paste, fill, “Edit event”, “Go to tile in palette” *(future — G2)* |
| **Map tree** | **Delete** (destructive confirm + integrity preflight per [`map_worktree_editor_design.plan.md`](./map_worktree_editor_design.plan.md)); rename / duplicate / other actions *future* |
| Event marker | Edit event, delete, copy event id *(future)* |
| Palette tile | Set as current tile, copy numeric id *(future)* |

**MVP note:** Canvas/palette/event menus remain future work. **Tree:** right-click **Delete** + **`@dnd-kit` reorder/reparent** are in scope for **`pr-gw-map-tree`** (GW+); see design doc — not required for GW layout-only PR unless intentionally batched.

## Traceability to main MVP plan

| Main plan item | GUI companion |
|----------------|---------------|
| PR 1.1 Canvas preview (base merged) | G0: PR-G0-1 (tree + read-map + inspector) → PR-G0-2 (markers) → PR-G0-3 (layer strip + grid) |
| GUI workbench rework | GW: top bar config, draggable Workbench / Chat split, instructions popover |
| **`pr-gw-map-tree`** Interactive map tree | [`map_worktree_editor_design.plan.md`](./map_worktree_editor_design.plan.md): `@dnd-kit`, MapInfos write, delete scan, System / start-map banner |
| PR 1.2 Vision | Palette + preview stay visually aligned |
| Phase 3 Events | G0 markers → G1/G2 full event UX |
| Phase 4 Validation | G3 warnings surfaced in workbench status bar |

## Review cadence

Revisit this document after each **GUI track** merge: tick completed bullets, adjust ordering based on user testing.
