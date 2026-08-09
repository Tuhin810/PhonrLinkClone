import { contextBridge, ipcRenderer } from 'electron';

/**
 * The renderer gets a narrow, explicitly enumerated surface — no node access, no ipcRenderer.
 */
contextBridge.exposeInMainWorld('phonelink', {
  onState: (handler: (state: unknown) => void) => {
    ipcRenderer.on('state', (_event, state) => handler(state));
  },
  requestState: () => ipcRenderer.invoke('request-state'),
  toggleConnection: () => ipcRenderer.invoke('toggle-connection'),
  unpairAll: () => ipcRenderer.invoke('unpair-all'),
  toggleClipboard: () => ipcRenderer.invoke('toggle-clipboard'),
  quit: () => ipcRenderer.invoke('quit'),
});
