'use strict';

const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const { app } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

/**
 * 管理 dsh Web 服务的生命周期：
 * 用 Electron 自带的 Node 运行时（ELECTRON_RUN_AS_NODE=1）启动 `dsh web`，
 * 解析它打印的 URL，并把生命周期事件转发给主进程。
 *
 * 为什么用 child_process.spawn(process.execPath) 而不是 utilityProcess：
 * dsh 的 cordis-plugin-hmr 需要访问 Node 内部模块。原生回退
 * (node-addon-require-builtin) 是 NAN 模块，在 Electron 的 Node ABI 下无法加载，
 * 因此必须传 --expose-internals。utilityProcess 在打包后不会把该标志转发给
 * 子进程，而 ELECTRON_RUN_AS_NODE=1 的 spawn 方式会原样透传，稳定可用。
 */

/**
 * 把 modlens 包链接到 $DSH_HOME/profiles/node_modules，让插件名
 * `@liustack/modlens` 能从 profile 目录按 Node 逐级查找解析到。
 * dsh 的 healProfilesModuleFallback 只维护它自己依赖闭包的链接，
 * modlens 不在其中，所以这里手动补上（幂等，正确时不动）。
 */
function ensureModlensLink() {
  try {
    const req = createRequire(__filename);
    const target = path.dirname(req.resolve('@liustack/modlens/package.json'));
    const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
    const link = path.join(home, 'profiles', 'node_modules', '@liustack', 'modlens');
    fs.mkdirSync(path.dirname(link), { recursive: true });

    let current = null;
    try {
      current = fs.readlinkSync(link);
    } catch {
      /* 不存在或非符号链接 */
    }
    if (current === target) return;

    if (current !== null || fs.existsSync(link)) {
      try {
        fs.unlinkSync(link);
      } catch {
        fs.rmSync(link, { recursive: true, force: true });
      }
    }
    fs.symlinkSync(target, link, 'junction');
  } catch (error) {
    console.log('[dsh-desktop] modlens link warning: ' + (error && error.message ? error.message : error));
  }
}

class DshServer extends EventEmitter {
  constructor() {
    super();
    this.child = null;
    this.url = null;
    this.port = null;
    this._buffer = '';
    this._stopTimer = null;
  }

  /** 启动 dsh 子进程。解析到 URL 后触发 'url'。 */
  async start() {
    const launcher = path.join(__dirname, 'dsh-child.cjs');
    // `--port 0` 让 OS 分配空闲端口，避免与已运行的 `dsh web`（默认 3080）冲突。
    const args = ['--profile', 'web'];
    // 确保 modlens 包可从 profile 目录解析（dsh-child 会把它加进 web profile 的 bundles，
    // 从而同时加载其宿主端读图工具与客户端粘贴拦截/模型变体）。
    ensureModlensLink();
    args.push('--port', '0');
    const env = {
      ...process.env,
      // 让 Electron 可执行文件以纯 Node 模式运行（与桌面应用共享内置 Node 24）。
      ELECTRON_RUN_AS_NODE: '1',
      // 通过环境变量传参，避免与子进程 argv 布局耦合。
      DSH_DESKTOP_CHILD_ARGS: JSON.stringify(args),
    };

    this.child = spawn(process.execPath, ['--expose-internals', launcher], {
      cwd: this.defaultCwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.child.stdout.on('data', (chunk) => this._onStdout(chunk));
    this.child.stderr.on('data', (chunk) => this._onStderr(chunk));
    this.child.on('spawn', () => this.emit('spawn'));
    this.child.on('error', (err) => this.emit('error', err));
    this.child.on('exit', (code) => {
      console.log('[dsh-desktop] dsh child exited, code=' + code);
      this.emit('exit', code);
    });
  }

  defaultCwd() {
    // 桌面应用的默认工作目录（决定首次打开的 workspace 根目录）。
    const dir = path.join(os.homedir(), 'deep seek ZYB');
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // 创建失败则回退到用户主目录。
      return os.homedir();
    }
    return dir;
  }

  _onStdout(chunk) {
    const text = chunk.toString('utf8');
    this._log('stdout', text);
    this._buffer += text;
    // dsh web 就绪后打印：`dsh web: http://127.0.0.1:<port>`
    const m = this._buffer.match(/dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)/);
    if (m && !this.url) {
      this.url = m[1];
      this.port = Number(new URL(m[1]).port);
      this.emit('url', this.url);
    }
    if (this._buffer.length > 64 * 1024) this._buffer = this._buffer.slice(-16 * 1024);
  }

  _onStderr(chunk) {
    const text = chunk.toString('utf8');
    this._log('stderr', text);
    if (this.url === null) {
      // 服务尚未就绪时的 stderr 更可能是启动失败信息，保留以便诊断。
      this._buffer += text;
    }
  }

  _log(stream, text) {
    try {
      const dir = this._logDir();
      const file = path.join(dir, 'dsh-web.log');
      fs.appendFileSync(file, `[${new Date().toISOString()}] [${stream}] ${text}`);
    } catch {
      /* 日志写入失败不影响运行 */
    }
  }

  _logDir() {
    const dir = app.getPath('logs');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** 优雅停止 dsh 子进程；超时后强制结束。 */
  stop() {
    if (!this.child) return;
    const child = this.child;
    this.child = null;
    try {
      child.kill(); // 发送终止信号，触发 dsh 的有界关闭流程。
    } catch {
      /* 忽略 */
    }
    this._stopTimer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* 忽略 */
      }
    }, 4000);
    this._stopTimer.unref?.();
  }
}

module.exports = { DshServer };
