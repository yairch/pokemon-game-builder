/**
 * Entry point for browser mode (no Electron).
 * Boots the handler state and starts the Express API server.
 */

import * as path from 'path';
import * as os from 'os';
import { setConfigPath, boot } from './handlers';
import { startApiServer } from './api-server';

setConfigPath(path.join(os.homedir(), '.pokemon-game-builder', 'config.json'));
boot();
startApiServer();

console.log('\n  Open http://localhost:5173 in your browser to use the app.\n');
