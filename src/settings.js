'use strict';

const api = window.dshSettings;

const glowColorEl = document.getElementById('glowColor');
const glowColorTextEl = document.getElementById('glowColorText');
const iconPreviewEl = document.getElementById('iconPreview');
const bgPreviewEl = document.getElementById('bgPreview');
const autoOpenEl = document.getElementById('autoOpen');
const toastEl = document.getElementById('toast');

let state = { glowColor: '#87CEEB', customIcon: '', customBackground: '', autoOpen: true };

let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
}

function setPreview(el, url) {
  if (url) {
    el.innerHTML = `<img src="${url}" alt="" />`;
  } else {
    el.innerHTML = '<span>默认</span>';
  }
}

async function refresh() {
  const data = await api.get();
  state = { ...data };
  glowColorEl.value = state.glowColor || '#87CEEB';
  glowColorTextEl.value = state.glowColor || '#87CEEB';
  setPreview(iconPreviewEl, state.customIconUrl);
  setPreview(bgPreviewEl, state.customBackgroundUrl);
  autoOpenEl.checked = state.autoOpen !== false;
}

glowColorEl.addEventListener('input', () => {
  state.glowColor = glowColorEl.value;
  glowColorTextEl.value = glowColorEl.value;
});
glowColorTextEl.addEventListener('change', () => {
  const v = glowColorTextEl.value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
    state.glowColor = v;
    glowColorEl.value = v;
  } else {
    glowColorTextEl.value = state.glowColor;
  }
});

document.getElementById('pickIcon').addEventListener('click', async () => {
  const r = await api.pickImage('icon');
  if (r && r.path) {
    state.customIcon = r.path;
    setPreview(iconPreviewEl, r.url);
  }
});
document.getElementById('resetIcon').addEventListener('click', () => {
  state.customIcon = '';
  setPreview(iconPreviewEl, '');
});

document.getElementById('pickBg').addEventListener('click', async () => {
  const r = await api.pickImage('background');
  if (r && r.path) {
    state.customBackground = r.path;
    setPreview(bgPreviewEl, r.url);
  }
});
document.getElementById('resetBg').addEventListener('click', () => {
  state.customBackground = '';
  setPreview(bgPreviewEl, '');
});

autoOpenEl.addEventListener('change', () => {
  state.autoOpen = autoOpenEl.checked;
});

document.getElementById('resetAll').addEventListener('click', async () => {
  const d = await api.reset();
  state = { glowColor: d.glowColor, customIcon: '', customBackground: '', autoOpen: d.autoOpen };
  glowColorEl.value = state.glowColor;
  glowColorTextEl.value = state.glowColor;
  setPreview(iconPreviewEl, '');
  setPreview(bgPreviewEl, '');
  autoOpenEl.checked = state.autoOpen !== false;
  showToast('已恢复默认');
});

document.getElementById('save').addEventListener('click', async () => {
  await api.save({
    glowColor: state.glowColor,
    customIcon: state.customIcon,
    customBackground: state.customBackground,
    autoOpen: state.autoOpen,
  });
  showToast('已保存，下次启动生效');
});

refresh();
