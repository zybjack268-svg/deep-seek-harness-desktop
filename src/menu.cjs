'use strict';

const { app, Menu, shell } = require('electron');

const isMac = process.platform === 'darwin';

// 项目仓库地址（“关于”与菜单里的跳转）。
const PROJECT_URL = 'https://github.com/zybjack268-svg/deep-seek-harness-desktop';
const RELEASES_URL = 'https://github.com/zybjack268-svg/deep-seek-harness-desktop/releases';

function buildAppMenu({ openSkills, openSettings } = {}) {
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: '文件',
      submenu: [isMac ? { role: 'close' } : { role: 'quit' }],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        ...(openSkills
          ? [
              {
                label: '技能',
                accelerator: 'CmdOrCtrl+Shift+K',
                click: () => openSkills(),
              },
              { type: 'separator' },
            ]
          : []),
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(process.argv.includes('--dev') ? [{ role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : []),
      ],
    },
    {
      label: '设置',
      submenu: [
        ...(openSettings
          ? [
              {
                label: '启动设置…',
                accelerator: 'CmdOrCtrl+,',
                click: () => openSettings(),
              },
            ]
          : []),
      ],
    },
    {
      role: 'help',
      label: '帮助',
      submenu: [
        { label: 'DeepSeek Harness 项目主页', click: () => shell.openExternal(PROJECT_URL) },
        { label: '下载最新版本', click: () => shell.openExternal(RELEASES_URL) },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { buildAppMenu };
