'use strict';

const api = window.dshSplash;

const app = document.getElementById('app');
const door = document.getElementById('door');
const center = document.getElementById('center');
const spinner = document.getElementById('spinner');
const knob = document.getElementById('knob');
const status = document.getElementById('status');

let ready = false;
let frameLoaded = false;
let openRequested = false;
let autoOpen = false;

// 启动耗时上报：渲染进程视角（脚本执行起点为 0ms）。
const t0 = performance.now();
function report(name) {
  try {
    api.sendTiming(`${name} @${Math.round(performance.now() - t0)}ms`);
  } catch {
    /* 忽略 */
  }
}

// ---------------- 大海进度条：鲸鱼从一端游到另一端 ----------------
// 进度分段：等待服务就绪时缓慢前游，界面加载时提速，
// 加载完成瞬间游到 100（右端）并整条淡出——鲸鱼到达即加载完成。
const oceanBar = document.getElementById('oceanBar');
const oceanFill = document.getElementById('oceanFill');
const oceanWhale = document.getElementById('oceanWhale');
let loadProgress = 0;
let loadTarget = 6;
let loadSpeed = 0.8; // 每 tick 前进的百分比
let barDone = false;

function renderProgress(p) {
  loadProgress = p;
  oceanFill.style.width = p + '%';
  // 把 0-100% 映射到轨道内沿，鲸鱼中心始终在条内。
  oceanWhale.style.left = (6 + p * 0.88) + '%';
}
setInterval(() => {
  if (loadProgress < loadTarget) {
    renderProgress(Math.min(loadTarget, loadProgress + loadSpeed));
  }
}, 100);

/** 加载完成：鲸鱼正好游到右端，随后进度条淡出消失。 */
function finishBar() {
  if (barDone) return;
  barDone = true;
  loadTarget = 100;
  renderProgress(100);
  setTimeout(() => {
    oceanBar.classList.add('done');
  }, 420);
}

// 启动页外观设置：光效颜色、自定义图标、自定义背景、自动开门。
async function applyAppearance() {
  try {
    const a = await api.getAppearance();
    if (a && a.glowColor) {
      document.documentElement.style.setProperty('--glow-color', a.glowColor);
    }
    if (a && a.customIconUrl) {
      knob.classList.add('custom');
      knob.querySelector('img').src = a.customIconUrl;
    }
    if (a && a.customBackgroundUrl) {
      const top = door.querySelector('.door-top');
      const bottom = door.querySelector('.door-bottom');
      for (const [el, pos] of [[top, '0 0'], [bottom, '0 100%']]) {
        el.style.backgroundImage = `url("${a.customBackgroundUrl}")`;
        el.style.backgroundSize = '100% 200%';
        el.style.backgroundPosition = pos;
      }
    }
    autoOpen = a.autoOpen !== false;
    // 外观设置晚于 iframe 加载完成才返回时（理论上不会），补一次自动开门。
    if (autoOpen && frameLoaded) openDoor('auto');
  } catch {
    /* 忽略，使用默认外观 */
  }
}

// 主进程通知：服务已就绪，带上应用地址。
api.onReady(({ url }) => {
  if (ready) return;
  ready = true;
  report('onReady (server URL received)');

  // 服务就绪：鲸鱼提速前游（界面加载阶段，快速接近右端）。
  loadTarget = 90;
  loadSpeed = 5.5;

  // 加载阶段 → 门阶段：加载环淡出，圆形图标弹出。
  spinner.classList.add('off');
  knob.classList.add('on');
  status.textContent = autoOpen ? '界面加载完自动开门' : '点击图标打开';

  // 后台加载真正的应用。
  app.src = url;
});

// iframe 加载完成（首次 about:blank 的 load 会被 ready 拦截）。
app.addEventListener('load', () => {
  if (!ready) return;
  frameLoaded = true;
  report('iframe load (app resources fully loaded)');

  // 加载完成：鲸鱼正好游到另一端，随后进度条淡出。
  finishBar();

  status.textContent = autoOpen ? '界面加载完自动开门' : '点击图标打开';
  // 通知主进程：应用已加载（启动耗时记录）。
  try {
    api.notifyAppLoaded();
  } catch {
    /* 忽略 */
  }
  if (openRequested) openDoor('user (early click)');
  else if (autoOpen) openDoor('auto');
});

knob.addEventListener('click', () => {
  if (!frameLoaded) {
    openRequested = true;
    status.textContent = '正在加载界面…';
    return;
  }
  openDoor('user');
});

function openDoor(reason) {
  if (door.classList.contains('open')) return;
  report(`door opened (${reason})`);
  finishBar(); // 无论何时开门，进度条都完成并淡出。
  door.classList.add('open');
  center.classList.add('revealed');

  // 门打开后，把焦点交给应用。
  setTimeout(() => {
    try {
      app.focus();
      if (app.contentWindow) app.contentWindow.focus();
    } catch {
      /* 忽略 */
    }
  }, 500);
}

// 生成粒子：在每扇门的开启边缘往外飘散，增加立体感。
function spawnParticles() {
  spawnFor(door.querySelector('.door-top'), -1);
  spawnFor(door.querySelector('.door-bottom'), 1);
}

function spawnFor(half, dir) {
  const container = document.createElement('div');
  container.className = 'particles';
  half.appendChild(container);
  const count = 16;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'particle';
    const size = 2 + Math.random() * 3; // 2-5px
    const dur = 1.8 + Math.random() * 2.4; // 1.8-4.2s
    const delay = Math.random() * 3.5;
    const dx = (Math.random() - 0.5) * 46; // 水平漂移 -23..23px
    const dy = dir * (42 + Math.random() * 72); // 垂直漂移（上/下）
    const peak = 0.45 + Math.random() * 0.55; // 亮度 0.45-1
    p.style.left = (Math.random() * 100) + '%';
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.setProperty('--dur', dur.toFixed(2) + 's');
    p.style.setProperty('--delay', delay.toFixed(2) + 's');
    p.style.setProperty('--dx', dx.toFixed(1) + 'px');
    p.style.setProperty('--dy', dy.toFixed(1) + 'px');
    p.style.setProperty('--peak', peak.toFixed(2));
    container.appendChild(p);
  }
}

// 项目插件的目录选择桥：iframe（127.0.0.1 应用页）→ 启动页 → 主进程原生对话框。
// dsh 自带的 koffi 选择器在 Electron 的 Node 运行时里读结果会 N-API 崩溃，
// 所以桌面端走这个桥；桥不可用时应用端会退回手动输入路径。
window.addEventListener('message', (event) => {
  if (event.source !== app.contentWindow) return;
  const data = event.data;
  if (!data || data.type !== 'dsh-project:pick-folder') return;
  const reply = (result) => {
    try {
      event.source.postMessage({ type: 'dsh-project:pick-folder-result', id: data.id, result }, '*');
    } catch {
      /* 忽略 */
    }
  };
  try {
    api.pickFolder().then(
      (path) => reply({ path: path || null }),
      (error) => reply({ error: String(error && error.message ? error.message : error) }),
    );
  } catch {
    reply({ error: '启动页桥不可用' });
  }
});

applyAppearance();
spawnParticles();
