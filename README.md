# Pokemon Game Builder

An AI-powered companion for RPG Maker XP and Pokemon Essentials.

## Features (POC)

- **AI Chat Interface**: Talk to an AI agent to build your Pokemon world.
- **Map Generation**: Automatically create `.rxdata` map files compatible with RPG Maker XP.
- **Pokemon Essentials Integration**: Directly modifies your project files.

## Prerequisites

- **Node.js**: v18 or later
- **Ruby**: v2.7 or later (required for `.rxdata` file manipulation)
- **Gemini API Key**: You'll need an API key from [Google AI Studio](https://aistudio.google.com/).

## Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure API Key**:
   Set the `GEMINI_API_KEY` environment variable:
   ```bash
   # Windows (PowerShell)
   $env:GEMINI_API_KEY="your-api-key-here"
   
   # macOS/Linux
   export GEMINI_API_KEY="your-api-key-here"
   ```

3. **Run the App**:
   ```bash
   npm run electron:dev
   ```

## How to Use

1. **Select Project**: Click "Select Essentials Project" and choose your Pokemon Essentials folder (the one containing `Game.exe`).
2. **Chat**: Type a request like "Create a small starter town map with a few houses and trees."
3. **Verify**: Once the AI confirms generation, open your project in **RPG Maker XP**. 
   *Note: In the POC, you may need to manually add the map to the map tree or refresh the project.*

## Project Structure

- `src/main`: Electron main process and backend services.
- `src/renderer`: React frontend and UI components.
- `src/bridge`: Ruby scripts for interacting with RPG Maker XP's Marshal format.
- `src/shared`: Shared types and utilities.

## Technical Details

- **Stack**: Electron, React, TypeScript, Vite, Tailwind CSS.
- **AI**: Google Gemini Pro.
- **Bridge**: Ruby bridge using the `Marshal` library to read/write RPG Maker XP data structures.

## Roadmap

- [ ] Automatic map tree registration (MapInfos.rxdata).
- [ ] Advanced event generation (NPCs, Items, Warp points).
- [ ] Asset generation (AI-generated tilesets and sprites).
- [ ] Script generation for Pokemon Essentials.

## Useful Resources

- **Video Tutorials**:
  - [Thundaga: How To Make A Pokémon Game - Part 1: Getting Started](https://youtu.be/LveDeFobPhQ)
  - [ShepskyDad: Type Triangles in Pokémon](https://youtu.be/T_HZYzs-tUA)
  - [ShepskyDad: Building the Perfect Fire Type Gym Leader](https://youtu.be/3Bsc9lZiUyM)
- **Community Platforms**:
  - [Pokemon Essentials Wiki](https://pokemonessentials.fandom.com/wiki/Pok%C3%A9mon_Essentials_Wiki)
  - [Relic Castle](https://reliccastle.com/)
  - [PokeCommunity (Pokemon Essentials)](https://www.pokecommunity.com/forumdisplay.php?f=191)