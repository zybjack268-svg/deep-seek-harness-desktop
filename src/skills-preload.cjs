'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// 技能页专用桥：只暴露技能相关能力给渲染页面（sandbox 下安全）。
contextBridge.exposeInMainWorld('dshSkills', {
  list: () => ipcRenderer.invoke('skills:list'),
  use: (name) => ipcRenderer.invoke('skills:use', name),
  copy: (text) => ipcRenderer.invoke('skills:copy', text),
  openFile: (file) => ipcRenderer.invoke('skills:open-file', file),
  openFolder: () => ipcRenderer.invoke('skills:open-folder'),
});
