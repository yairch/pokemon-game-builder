---
name: Map Workbench Tree — Interactive Design
overview: Design specification for drag-drop MapInfos hierarchy, delete with integrity preflight, System.rxdata handling, and proactive start-map warnings. Implementation belongs primarily to the GUI track (GW+) with Ruby bridge extensions.
extends:
  - ./mvp_implementation_plan_a41c92e4.plan.md
  - ./gui_editor_mvp_roadmap.md
isProject: false
---

# Map Workbench Tree — Interactive Design (GW+)

This document **concludes** the product and UX decisions for upgrading the **Maps tree** (`MapsTree`, Map Workbench pane) from **read-only browsing** to **hierarchy editing** with **safe deletion**. It **does not replace** sequencing or AI scope in the parent plans; it **narrows implementation** so engineering work stays aligned.

**Parent plans**

| Document | Role |
|----------|------|
| [`mvp_implementation_plan_a41c92e4.plan.md`](./mvp_implementation_plan_a41c92e4.plan.md) | Ruby bridge ownership, IPC/API patterns, broader MVP phases |
| [`gui_editor_mvp_roadmap.md`](./gui_editor_mvp_roadmap.md) | Layout (GW), tree placement in Map Workbench, GUI phase ordering |

**Suggested placement in roadmap:** Ship **after [GW — Workbench rework](./gui_editor_mvp_roadmap.md#gw--workbench-rework-between-g0-and-g1)** (or overlapping late GW) so the tree lives in its **final pane geometry**. Traceability: main plan todo **`pr-gw-map-tree`**.

---

## Goals

1. **Reorder and reparent** maps and folder-style parents **exactly as RPG Maker XP’s `MapInfos.rxdata`** (`parentId`, `order`), so changes **appear in RMXP** after save (Marshal fidelity via Ruby bridge).
2. **Delete** maps **from MapInfos and disk** (`Data/Map###.rxdata`), including **whole subtrees** when deleting a folder node, with **modal warnings** that differ for **leaf vs nested branch**.
3. **Integrity before destructive actions:** **full reference scan** (map events + scripts), **no caching** in v1; **block delete** until the user resolves blocking issues (except where policy explicitly auto-fixes).
4. **Modern UX:** `@dnd-kit` drag-drop; **drop feedback Option A** (gap lines for reorder vs distinct **into-row** affordance for reparent); **right-click context menu** with red **Delete**; **confirmation modal** with **focus trap**, Cancel vs red Delete.
5. **Proactive visibility:** persistent **in-app warning** when **`start_map_id`** is missing or invalid relative to loaded maps — **before** the user attempts delete.

**Non-goals (v1)**

- **Undo / timed revert toast** — deferred.
- **Scan result caching** — deferred (every delete preflight runs a **full** scan).
- Perfect guarantees against **every** hypothetical script reference pattern — scanning aims for **high-fidelity** parsing with documented ambiguity handling where needed.

---

## Parity with RPG Maker XP

- **.Tree shape:** Driven by `MapInfo#parent_id` and `MapInfo#order` (already mirrored in [`buildMapInfosTree`](../../src/shared/mapInfosTree.ts)).
- **Writes:** Must round-trip **`RPG::MapInfo`** objects via **`Marshal`** in Ruby (`marshal_handler.rb` pattern); avoid inventing parallel serializers in TypeScript.

---

## Drag and drop

| Decision | Choice |
|----------|--------|
| Library | **`@dnd-kit`** (keep) |
| Gestures | **Single gesture:** placing **between** siblings → reorder; dropping **onto** a row → **reparent** under that map (nest). |
| Folder nodes | Dragging a node **moves its entire subtree**; **relative order within the subtree preserved**. |
| Drop feedback | **Option A:** visual **gap / insertion line** for sibling order; distinct **“drop into”** state when hovering a valid parent row (indent / accent — precise pixels TBD in implementation). |

**Accessibility:** Keyboard-first reorder for deeply nested trees is **stretch** for v1; minimum bar: drag operates correctly with pointer; modal dialogs meet **focus trap** + **`Escape`** expectations.

---

## Context menu and delete modal

| Decision | Choice |
|----------|--------|
| Invocation | **Right-click only** on tree rows (`contextmenu`; prevent native browser menu on tree surface). |
| Delete affordance | Menu item label **Delete**, **red** text / destructive styling (**single action** → **no separator** needed). |
| Confirmation | Modal: **Cancel** (default focus) + **Delete** (destructive red). **`aria-modal`**, **focus trap**, **`Escape`** → cancel. |
| Copy — leaf delete | Clear statement that **MapInfos entry and map file** are removed permanently; scanning outcome summarized below confirm. |
| Copy — folder / subtree delete | **Emphasize nested deletion:** all **descendant maps and folder maps** removed; counts encouraged (“This removes **N** maps including nested maps under …”). |

---

## Delete integrity pipeline (no cache)

**Principles**

1. **Determinate UX:** stepped progress — e.g. **System check → map events (n/total) → scripts** — with short explanation (*why we wait*: prevent broken references and unsafe game state).
2. **Performance:** bounded **parallelism** on map reads (e.g. 4–8 workers / queued bridge calls); **do not** sacrifice fidelity for speed.
3. **Blocking:** Any **blocking condition** prevents confirming delete until resolved **inside our app** where possible; user should **not** need RMXP except for fixes **we explicitly do not automate yet**.

**Scan coverage (full fidelity target)**

- **`System.rxdata`:** `start_map_id`, `edit_map_id` vs proposed survivor map set after simulated delete.
- **Every surviving `Map###.rxdata`:** walk **event commands** and interpret **known codes / parameter shapes** that carry **map IDs** (whitelist-driven — extend as discovery warrants).
- **`Scripts.rxdata`:** structured scan of script sections for map-id references (strategy TBD in implementation; prefer low **false negatives** over silent allows).

**Policy**

| Concern | Policy |
|---------|--------|
| **`start_map_id`** invalid **or** deleted by operation | **Blocking** unless user changes scope or fixes **inside app** (e.g. pick new start map before confirm — flow TBD). **Deleting the last map(s)** triggers dedicated warning (below). |
| **`edit_map_id`** invalid **or** inside deleted subtree | **Auto-fix** (see § Editor selection map id). **No mandatory extra toast** when maps remain; empty-tree case silent in UX except overall empty state. |
| References from events/scripts to deleted IDs | **Blocking** until references removed or adjusted — **integrity over convenience**. |

---

## Warning — deleting to **zero maps** (`start_map_id`)

When the operation removes **all remaining maps**:

- Show a **blocking confirmation** that **`start_map_id` will be cleared** (persisted as **`0`** / unset numeric — exact marshal encoding follows Ruby defaults).
- **Do not** include “restore from backup” in copy.
- Include an **optional expandable explanation** (e.g. **“Details”** / chevron): plain-language note that **New Game** may fail or error until a valid starting map exists again and **`System`** is updated (behavior depends on stock vs Essentials scripts).

**Effect nuance (engineering awareness, not necessarily full user-facing prose)**

- **`Game.exe` / New Game** paths are **high risk** when no valid start map exists.
- **RMXP editor** opening the project is generally **more tolerant** than runtime; prioritize **non-crashing Marshal writes** and **avoid stale positive IDs** over undocumented editor quirks.

---

## Editor selection map id (`edit_map_id`) — auto-fix

When **`edit_map_id`** points at a deleted map or falls inside a deleted subtree:

1. If **`start_map_id` survives** and remains valid → set **`edit_map_id`** to **`start_map_id`**.
2. Else if **any maps survive** → set to **first deterministic survivor** (e.g. preorder-first id from remaining MapInfos).
3. Else (**zero maps**) → set **`edit_map_id`** to **`0`**. **No separate mandatory user notice**; app shows **empty map tree / preview empty state**. User can pick a map again once maps exist.

---

## Proactive UI — `start_map_id` not set or invalid

**Requirement:** When a project is loaded and **`System.rxdata`** exposes **`start_map_id`** that is **`0`**, **missing**, or **not present in MapInfos / no matching map file**, show a **clear warning affordance** in the UI (e.g. banner or compact alert near Map Workbench / tree header — exact placement during GW layout).

- Copy should state that **starting a new game may not work** until configured (without recommending backup restore).
- Optional **short “Learn more”** inline expansion mirrors the delete-modal explanation style where helpful.

This gives **advance awareness**, separate from delete-flow warnings.

---

## Ruby / TypeScript implementation surface (outline)

Not a full API spec — parent plans own PR breakdown.

- **Write MapInfos tree:** new bridge command accepting **full or patch** updates to `parent_id` / `order` while preserving other `MapInfo` fields.
- **Delete maps:** remove keys from MapInfos Marshal hash; delete **`Map###.rxdata`** files for all ids in subtree; patch **`System`** per policies above.
- **Preflight IPC:** long-running scan with **progress events** to renderer for stepped UI.
- **Renderer:** `@dnd-kit` integration on `MapsTree`; context menu component; modal stack; **`read-system`** or aggregated project read already aligned with handlers — extend if needed.

---

## Testing expectations

- **Unit:** pure helpers for “simulated delete → survivor ids”, reference aggregation fixtures.
- **Integration:** Ruby bridge round-trip **MapInfos + System** on fixture projects (temp dirs).
- **Renderer:** modal a11y smoke (focus trap), progress UI states.

---

## Revision history

| Date | Change |
|------|--------|
| 2026-05-13 | Initial design conclusion wired to main MVP plan + GUI roadmap |
