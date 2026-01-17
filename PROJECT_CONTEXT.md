# Project Context: Pokemon Game Builder

## Goal
The goal of this project is to create an AI-powered companion tool for developers using **RPG Maker XP** and **Pokemon Essentials**. It allows users to generate and modify game content (maps, events, data) using natural language through an AI chat interface.

## Technical Stack
- **Framework**: Electron (Cross-platform desktop app)
- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js (Electron Main Process)
- **Language**: TypeScript
- **AI Integration**: Google Gemini API (via `@google/generative-ai`)
- **Bridge**: Ruby scripts (`src/bridge/marshal_handler.rb`) are used to read and write RPG Maker XP's binary `.rxdata` files (which use Ruby's `Marshal` format).

## Architecture
- **Main Process (`src/main`)**: Handles system operations, file system access, and the Ruby bridge.
- **Renderer Process (`src/renderer`)**: The UI where the user interacts with the chat and sees previews.
- **Shared (`src/shared`)**: TypeScript types and interfaces used by both processes.
- **Bridge (`src/bridge`)**: Ruby scripts that provide the low-level data manipulation logic for `.rxdata` files.

## Core Capabilities
1. **Project Selection**: Detects and links to a Pokemon Essentials project directory.
2. **AI Chat Interface**: Uses Gemini Pro to interpret user requests.
3. **Map Generation**: Generates JSON representations of maps which are then converted to `.rxdata` via the Ruby bridge.
4. **Data Manipulation**: Capability to read/write RPG Maker XP data structures like `RPG::Map`, `RPG::Event`, etc.

## Agent Instructions
- If you need visual context of the app's current state (UI layout, errors, or specific components), ask the user to provide a screenshot.
- When adding new IPC handlers, update `src/main/ipc-handlers.ts`.
- When adding UI components, put them in `src/renderer/components`.
- If you need to modify how `.rxdata` files are handled, you must update the Ruby bridge in `src/bridge/marshal_handler.rb`.
- Always ensure the TypeScript types in `src/shared/types.ts` are kept in sync with the Ruby data structures.
