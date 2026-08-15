'use strict';

const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DEFAULTS = { glowColor: '#87CEEB', customIcon: '', customBackground: '', customAppBackground: '' };

function settingsFile() {
  return path.join(app.getPath('userData'), 'appearance.json');
}

function load() {
  try {
    const raw = fs.readFileSync(settingsFile(), 'utf8');
    const data = JSON.parse(raw);
    return {
      glowColor: typeof data.glowColor === 'string' && data.glowColor ? data.glowColor : DEFAULTS.glowColor,
      customIcon: typeof data.customIcon === 'string' ? data.customIcon : '',
      customBackground: typeof data.customBackground === 'string' ? data.customBackground : '',
      customAppBackground: typeof data.customAppBackground === 'string' ? data.customAppBackground : '',
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(data) {
  const next = {
    glowColor: data && typeof data.glowColor === 'string' && data.glowColor ? data.glowColor : DEFAULTS.glowColor,
    customIcon: data && typeof data.customIcon === 'string' ? data.customIcon : '',
    customBackground: data && typeof data.customBackground === 'string' ? data.customBackground : '',
    customAppBackground: data && typeof data.customAppBackground === 'string' ? data.customAppBackground : '',
  };
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function customDir() {
  const dir = path.join(app.getPath('userData'), 'custom');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function toUrl(p) {
  if (!p) return '';
  try {
    return pathToFileURL(p).href;
  } catch {
    return '';
  }
}

module.exports = { DEFAULTS, load, save, customDir, toUrl };
