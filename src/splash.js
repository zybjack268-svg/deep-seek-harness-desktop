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

// 应用外观设置：光效颜色、自定义图标、自定义背景。
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
  } catch {
    /* 忽略，使用默认外观 */
  }
}

// 主进程通知：服务已就绪，带上应用地址。
api.onReady(({ url }) => {
  if (ready) return;
  ready = true;

  // 加载阶段 → 门阶段：加载环淡出，圆形图标弹出。
  spinner.classList.add('off');
  knob.classList.add('on');
  status.textContent = '点击图标打开';

  // 后台加载真正的应用。
  app.src = url;
});

// iframe 加载完成（首次 about:blank 的 load 会被 ready 拦截）。
app.addEventListener('load', () => {
  if (!ready) return;
  frameLoaded = true;
  status.textContent = '点击图标打开';
  // 通知主进程：应用已加载，可以注入自定义背景等。
  try {
    api.notifyAppLoaded();
  } catch {
    /* 忽略 */
  }
  if (openRequested) openDoor();
});

knob.addEventListener('click', () => {
  if (!frameLoaded) {
    openRequested = true;
    status.textContent = '正在加载界面…';
    return;
  }
  openDoor();
});

function openDoor() {
  if (door.classList.contains('open')) return;
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

applyAppearance();
spawnParticles();
