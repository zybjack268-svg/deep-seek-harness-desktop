'use strict';

/**
 * 启动耗时记录：把各阶段时间戳追加到 logs/timing.log，
 * 用于诊断「门加载半天」这类启动慢问题。每个阶段相对主进程启动的毫秒数。
 */
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

let t0 = Date.now();

function reset() {
  t0 = Date.now();
}

function logTiming(msg) {
  try {
    const dir = app.getPath('logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, 'timing.log'),
      `[${new Date().toISOString()}] +${Date.now() - t0}ms ${msg}\n`
    );
  } catch {
    /* 日志失败不影响运行 */
  }
}

module.exports = { logTiming, reset };
