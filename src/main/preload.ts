import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel: string, data: unknown) => ipcRenderer.invoke(channel, data),
  /** Subscribe to stepped progress during `delete-preflight` IPC (renderer correlates via `jobId`). */
  onDeletePreflightProgress: (listener: (payload: unknown) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload);
    ipcRenderer.on('delete-preflight-progress', wrapped);
    return () => ipcRenderer.removeListener('delete-preflight-progress', wrapped);
  },
});

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector: string, text: string) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };

  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type]!);
  }
});
