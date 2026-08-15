'use strict';

const { nativeTheme } = require('electron');

// 与 DSH 主题底色一致：浅色 --dsw-static-neutral-bluish-00，深色 --dsw-static-neutral-bluish-950。
const BACKGROUND = {
  dark: '#151517',
  light: '#ffffff',
};

/** 让 Electron（标题栏 + 渲染进程的 prefers-color-scheme）跟随系统深浅色。 */
function useSystemTheme() {
  nativeTheme.themeSource = 'system';
}

/** 当前系统主题对应的窗口背景色。 */
function currentBackground() {
  return nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light;
}

/** 当前是否为深色。 */
function isDark() {
  return nativeTheme.shouldUseDarkColors;
}

module.exports = { useSystemTheme, currentBackground, isDark };
