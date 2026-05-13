import { BrowserWindow, app } from 'electron';
import * as path from 'path';

export let mainWindow: BrowserWindow | null = null;

export function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (!app.isPackaged) {
    // Mirror renderer console output to the terminal so console.log/debug/warn/error
    // from the renderer process is visible alongside main-process logs in dev.
    // Register the listener BEFORE loadURL so we never miss early messages.
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const labels = ['debug', 'log', 'warn', 'error'] as const;
      const levelLabel = labels[level] ?? 'log';
      const where = sourceId ? ` (${sourceId}:${line})` : '';
      // eslint-disable-next-line no-console
      console[levelLabel === 'debug' ? 'log' : levelLabel](`[renderer:${levelLabel}]${where} ${message}`);
    });
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}
