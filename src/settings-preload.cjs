'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dshSettings', {
  get: () => ipcRenderer.invoke('appearance:get'),
  save: (data) => ipcRenderer.invoke('appearance:save', data),
  pickImage: (kind) => ipcRenderer.invoke('appearance:pick-image', kind),
  reset: () => ipcRenderer.invoke('appearance:reset'),
});
