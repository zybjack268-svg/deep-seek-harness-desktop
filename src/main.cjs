'use strict';

const { app, dialog, nativeTheme, ipcMain, clipboard, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { DshServer } = require('./server-manager.cjs');
const { createMainWindow, createSkillsWindow, createSettingsWindow } = require('./window.cjs');
const { buildAppMenu } = require('./menu.cjs');
const { useSystemTheme, currentBackground } = require('./theme.cjs');
const { logTiming } = require('./timing.cjs');
const { scanSkills, primarySkillRoot } = require('./skills.cjs');
const { DEFAULTS, load: loadAppearance, save: saveAppearance, customDir, toUrl } = require('./settings.cjs');

console.log('[dsh-desktop] main module loaded, pid=' + process.pid);

/** 全局单例：二次启动时聚焦已有窗口，避免起多个服务。 */
const gotLock = app.requestSingleInstanceLock();
console.log('[dsh-desktop] single instance lock =', gotLock);
if (!gotLock) {
  app.quit();
} else {
  let server = null;
  let mainWindow = null;
  let skillsWindow = null;
  let settingsWindow = null;
  let quitting = false;

  function openSkills() {
    if (skillsWindow && !skillsWindow.isDestroyed()) {
      skillsWindow.show();
      skillsWindow.focus();
      return;
    }
    skillsWindow = createSkillsWindow();
    skillsWindow.on('closed', () => {
      skillsWindow = null;
    });
  }

  function openSettings() {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.show();
      settingsWindow.focus();
      return;
    }
    settingsWindow = createSettingsWindow();
    settingsWindow.on('closed', () => {
      settingsWindow = null;
    });
  }

  /** 找到应用所在的 iframe 帧。 */
  function appFrame() {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    const frames = mainWindow.webContents.mainFrame?.framesInSubtree || [];
    return (
      frames.find((f) => {
        try {
          return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/.test(f.url);
        } catch {
          return false;
        }
      }) || null
    );
  }

  /** 在主窗口输入框填入 `/name `；失败则复制到剪贴板兜底。 */
  async function invokeSkill(name) {
    const token = '/' + name + ' ';
    if (!mainWindow || mainWindow.isDestroyed()) {
      clipboard.writeText('/' + name);
      return { ok: false, text: '/' + name };
    }
    mainWindow.show();
    mainWindow.focus();
    try {
      const frame = appFrame();
      if (frame) {
        const inserted = await frame.executeJavaScript(
          `(function () {
            try {
              var token = ${JSON.stringify(token)};
              var el = document.querySelector('[contenteditable="true"]');
              if (el) {
                el.focus();
                if (typeof el.value !== 'undefined') {
                  var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, token);
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                  el.textContent = token;
                  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: token }));
                }
                return true;
              }
              var ta = document.querySelector('textarea') || document.querySelector('input[type="text"]');
              if (ta) {
                ta.focus();
                var p2 = ta.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                Object.getOwnPropertyDescriptor(p2, 'value').set.call(ta, token);
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
              }
              return false;
            } catch (e) { return false; }
          })()`,
          true
        );
        if (inserted) return { ok: true, text: '/' + name };
      }
    } catch {
      /* 注入失败，走剪贴板兜底 */
    }
    clipboard.writeText('/' + name);
    return { ok: false, text: '/' + name };
  }

  function registerSkillsIpc() {
    ipcMain.handle('skills:list', () => scanSkills());
    ipcMain.handle('skills:use', (_e, name) => invokeSkill(String(name || '')));
    ipcMain.handle('skills:copy', (_e, text) => {
      clipboard.writeText(String(text || ''));
      return true;
    });
    ipcMain.handle('skills:open-file', (_e, file) => {
      if (file && typeof file === 'string') shell.openPath(file);
      return true;
    });
    ipcMain.handle('skills:open-folder', () => {
      const dir = primarySkillRoot();
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        /* 忽略 */
      }
      shell.openPath(dir);
      return true;
    });
  }

  function registerAppearanceIpc() {
    ipcMain.handle('appearance:get', () => {
      const s = loadAppearance();
      return {
        ...s,
        customIconUrl: toUrl(s.customIcon),
        customBackgroundUrl: toUrl(s.customBackground),
      };
    });
    ipcMain.handle('appearance:save', (_e, data) => {
      const s = saveAppearance(data);
      return {
        ...s,
        customIconUrl: toUrl(s.customIcon),
        customBackgroundUrl: toUrl(s.customBackground),
      };
    });
    ipcMain.handle('appearance:pick-image', async (_e, kind) => {
      const parent = settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : null;
      const res = await dialog.showOpenDialog(parent, {
        title: '选择图片',
        properties: ['openFile'],
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
      });
      if (res.canceled || !res.filePaths || !res.filePaths[0]) return null;
      const src = res.filePaths[0];
      const ext = path.extname(src).toLowerCase() || '.png';
      const name = kind === 'icon' ? 'icon' : 'background';
      const dst = path.join(customDir(), name + ext);
      try {
        fs.copyFileSync(src, dst);
        return { path: dst, url: toUrl(dst) };
      } catch {
        return { path: src, url: toUrl(src) };
      }
    });
    ipcMain.handle('appearance:reset', () => {
      const s = saveAppearance(DEFAULTS);
      return { ...s, customIconUrl: '', customBackgroundUrl: '' };
    });
    // 项目插件的目录选择桥：启动页 → 主进程原生目录对话框。
    // （dsh 自带的 koffi 选择器在 Electron 的 Node 运行时下读取结果时
    //  会 N-API 崩溃，见 worker.cjs readUtf16 的 FATAL ERROR，故走本桥。）
    ipcMain.handle('dsh-project:pick-folder', async () => {
      const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
      const res = await dialog.showOpenDialog(parent, {
        title: '选择文件夹位置',
        buttonLabel: '选择此文件夹',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (res.canceled || !res.filePaths || !res.filePaths[0]) return null;
      return res.filePaths[0];
    });
    // 应用 iframe 加载完成（启动耗时记录；背景主题交给 Aqua 插件负责）。
    ipcMain.on('splash:app-loaded', () => {
      logTiming('stage: app iframe loaded (knob → clickable)');
    });
    // 启动页渲染进程上报的阶段耗时。
    ipcMain.on('splash:timing', (_e, msg) => logTiming('renderer: ' + String(msg)));
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  function presentError(title, detail) {
    // 用对话框兜底显示启动错误；detail 同时写入 stderr。
    console.error(`${title}\n${detail}`);
    dialog.showErrorBox(title, detail);
  }

  function createMain() {
    mainWindow = createMainWindow();
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  async function startServer() {
    logTiming('stage: start spawning dsh server');
    server = new DshServer();
    server.on('url', (url) => {
      console.log(`[dsh-desktop] server ready at ${url}`);
      logTiming('stage: dsh server ready (URL parsed)');
      if (mainWindow && !mainWindow.isDestroyed() && !quitting) {
        mainWindow.webContents.send('splash:ready', { url });
        logTiming('stage: splash:ready sent');
      }
    });
    server.on('error', (err) => {
      presentError('deep seek ZYB 启动失败', String((err && err.stack) || err));
    });
    server.on('exit', (code) => {
      if (quitting) return;
      presentError(
        'deep seek ZYB 服务已退出',
        `dsh 进程意外退出（退出码 ${code}）。请重启应用；若反复出现，请查看日志目录：${app.getPath('logs')}`
      );
      app.quit();
    });
    await server.start();
  }

  app.whenReady().then(async () => {
    console.log('[dsh-desktop] app ready');
    logTiming('stage: electron app ready');
    // 深浅色跟随系统（标题栏 + 页面 prefers-color-scheme 联动）。
    useSystemTheme();
    registerSkillsIpc();
    registerAppearanceIpc();
    buildAppMenu({ openSkills, openSettings });
    // 先显示启动页（加载动画 + 门），再后台拉起 dsh 服务。
    createMain();
    logTiming('stage: main window created');
    try {
      await startServer();
    } catch (err) {
      presentError('deep seek ZYB 启动失败', String((err && err.stack) || err));
      app.quit();
    }
  });

  app.on('activate', () => {
    // macOS：Dock 图标点击时若无窗口则重建启动页。
    if (!mainWindow && server && server.url) {
      createMain();
      mainWindow.webContents.send('splash:ready', { url: server.url });
    } else if (mainWindow) {
      mainWindow.show();
    }
  });

  app.on('window-all-closed', () => {
    // macOS 惯例：关窗不退出；其它平台退出。
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    quitting = true;
    if (server) server.stop();
  });

  // 系统深浅色切换时，同步窗口背景色（页面内容由 prefers-color-scheme 自行响应）。
  nativeTheme.on('updated', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setBackgroundColor(currentBackground());
    }
  });
}
