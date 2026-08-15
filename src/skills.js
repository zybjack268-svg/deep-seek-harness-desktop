'use strict';

const api = window.dshSkills;

const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const emptyTitleEl = document.getElementById('emptyTitle');
const emptyHintEl = document.getElementById('emptyHint');
const emptyBtnEl = document.getElementById('emptyOpenFolder');
const countEl = document.getElementById('count');
const searchEl = document.getElementById('search');
const toastEl = document.getElementById('toast');

let allSkills = [];
let query = '';

let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function renderEmpty(noSkills) {
  listEl.hidden = true;
  emptyEl.hidden = false;
  if (noSkills) {
    emptyTitleEl.textContent = '还没有技能';
    emptyHintEl.innerHTML = '点击「打开文件夹」，在 <code>~/.dsh/skills/</code> 里新建一个 <code>&lt;名字&gt;/SKILL.md</code>，文件头写上 <code>name</code> 和 <code>description</code>。';
    emptyBtnEl.hidden = false;
  } else {
    emptyTitleEl.textContent = '没有匹配的技能';
    emptyHintEl.textContent = '换个关键词试试。';
    emptyBtnEl.hidden = true;
  }
}

function render(skills) {
  countEl.textContent = skills.length ? `${skills.length} 个` : '';
  listEl.innerHTML = '';

  if (!skills.length) {
    renderEmpty(allSkills.length === 0);
    return;
  }
  listEl.hidden = false;
  emptyEl.hidden = true;

  for (const s of skills) {
    const card = document.createElement('div');
    card.className = 'card';

    const head = document.createElement('div');
    head.className = 'card-head';
    head.innerHTML = `
      <div>
        <div class="card-name">${escapeHtml(s.name)}<span class="badge">/${escapeHtml(s.name)}</span></div>
        ${s.description ? `<div class="card-desc">${escapeHtml(s.description)}</div>` : ''}
      </div>
      <span class="card-chevron">▶</span>
    `;
    head.addEventListener('click', () => {
      const wasOpen = card.classList.contains('open');
      document.querySelectorAll('.card.open').forEach((c) => c.classList.remove('open'));
      if (!wasOpen) card.classList.add('open');
    });

    const body = document.createElement('div');
    body.className = 'card-body';
    body.innerHTML = `
      <div class="card-meta">
        <span>路径 <code>${escapeHtml(s.path)}</code></span>
        ${s.whenToUse ? `<span>何时使用：${escapeHtml(s.whenToUse)}</span>` : ''}
      </div>
      <div class="card-content">${escapeHtml(s.body)}</div>
      <div class="card-actions">
        <button class="btn btn-primary" data-act="use">使用</button>
        <button class="btn" data-act="copy">复制 /${escapeHtml(s.name)}</button>
        <button class="btn" data-act="open">打开文件</button>
      </div>
    `;

    body.querySelector('[data-act="use"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      const res = await api.use(s.name);
      if (res && res.ok) showToast(`已在主窗口输入框填入 /${s.name}，按回车发送即可`);
      else showToast(`已复制 /${s.name}，去对话框粘贴并发送即可`);
    });
    body.querySelector('[data-act="copy"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      await api.copy('/' + s.name);
      showToast(`已复制 /${s.name}`);
    });
    body.querySelector('[data-act="open"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      await api.openFile(s.path);
    });

    card.appendChild(head);
    card.appendChild(body);
    listEl.appendChild(card);
  }
}

function renderFiltered() {
  const q = query.trim().toLowerCase();
  if (!q) {
    render(allSkills);
    return;
  }
  const filtered = allSkills.filter((s) =>
    [s.name, s.description, s.whenToUse].some((v) => String(v || '').toLowerCase().includes(q))
  );
  render(filtered);
}

async function refresh() {
  try {
    allSkills = await api.list();
    renderFiltered();
  } catch (err) {
    showToast('加载技能失败：' + (err && err.message ? err.message : err));
  }
}

searchEl.addEventListener('input', () => {
  query = searchEl.value;
  renderFiltered();
});

document.getElementById('refresh').addEventListener('click', refresh);
document.getElementById('openFolder').addEventListener('click', () => api.openFolder());
document.getElementById('emptyOpenFolder').addEventListener('click', () => api.openFolder());

refresh();
