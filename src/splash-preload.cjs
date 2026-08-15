'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// 启动页专用桥：接收主进程下发的应用就绪地址，以及外观设置。
contextBridge.exposeInMainWorld('dshSplash', {
  onReady: (cb) => ipcRenderer.on('splash:ready', (_e, data) => cb(data)),
  getAppearance: () => ipcRenderer.invoke('appearance:get'),
  notifyAppLoaded: () => ipcRenderer.send('splash:app-loaded'),
});
