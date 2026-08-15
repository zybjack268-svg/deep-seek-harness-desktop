'use strict';

const { BrowserWindow, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { currentBackground } = require('./theme.cjs');

/** 判断是否为本地 Harness 服务地址（窗口内加载）；其余一律外链。 */
function isLocalHarnessUrl(url) {
  try {
    const u = new URL(url);
    return (
      (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '::1') &&
      (u.protocol === 'http:' || u.protocol === 'https:')
    );
  } catch {
    return false;
  }
}

function resolveIcon() {
  const candidates = [
    path.join(process.resourcesPath, 'assets', 'icon.png'),
    path.join(__dirname, '..', 'assets', 'icon.png'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* 忽略 */
    }
  }
  return undefined;
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    title: 'deep seek ZYB',
    backgroundColor: currentBackground(),
    show: false,
    icon: resolveIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'splash-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.on('did-finish-load', () => {
    console.log('[dsh-desktop] splash loaded');
  });
  win.webContents.on('did-fail-load', (_event, code, desc, url) => {
    console.error(`[dsh-desktop] splash load failed (${code} ${desc}): ${url}`);
  });

  // 新窗口（含应用 iframe 里的外链）：本地页面放行，外链交给系统浏览器。
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocalHarnessUrl(url)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 主框架（启动页）不导航；ifame 里的外链跳转交给系统浏览器。
  // 注意：Electron 43 起该事件只传一个参数（事件对象本身带 url/isMainFrame）。
  win.webContents.on('will-frame-navigate', (event) => {
    if (event.isMainFrame) return;
    if (!isLocalHarnessUrl(event.url)) {
      event.preventDefault();
      shell.openExternal(event.url);
    }
  });

  win.loadFile(path.join(__dirname, 'splash.html'));
  return win;
}

/** 技能页窗口：列出用户保存的 skill，点击即可调用。 */
function createSkillsWindow() {
  const win = new BrowserWindow({
    width: 780,
    height: 640,
    minWidth: 560,
    minHeight: 420,
    title: '技能 · deep seek ZYB',
    backgroundColor: currentBackground(),
    show: false,
    icon: resolveIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'skills-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'skills.html'));
  return win;
}

/** 外观设置窗口。 */
function createSettingsWindow() {
  const win = new BrowserWindow({
    width: 460,
    height: 560,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: '外观设置 · deep seek ZYB',
    backgroundColor: currentBackground(),
    show: false,
    icon: resolveIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'settings.html'));
  return win;
}

module.exports = { createMainWindow, createSkillsWindow, createSettingsWindow };
