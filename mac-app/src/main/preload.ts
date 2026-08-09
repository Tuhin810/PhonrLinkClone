import { contextBridge, ipcRenderer, webUtils } from 'electron';

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
  callAction: (action: 'decline' | 'silence') => ipcRenderer.invoke('call-action', action),
  /**
   * Dropped files. The renderer has no filesystem access, so paths are resolved here via
   * webUtils — `File.path` was removed in Electron 32.
   */
  sendFiles: (files: File[]) =>
    ipcRenderer.invoke(
      'send-files',
      files.map(file => webUtils.getPathForFile(file)),
    ),
  quit: () => ipcRenderer.invoke('quit'),
  openMirror: () => ipcRenderer.invoke('open-mirror'),
  input: (envelope: unknown) => ipcRenderer.invoke('input', envelope),
  onFrame: (handler: (frame: unknown) => void) => {
    ipcRenderer.on('screen-frame', (_event, frame) => handler(frame));
  },
  onScreenState: (handler: (state: unknown) => void) => {
    ipcRenderer.on('screen-state', (_event, state) => handler(state));
  },
});
