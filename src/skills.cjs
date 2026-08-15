'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const yaml = require('js-yaml');

/**
 * 扫描用户级 skill 根目录，解析每个 skill 的 frontmatter 与正文。
 * 与 dsh-skill-filesystem 的约定一致：
 *   - `<root>/<name>/SKILL.md`（目录 bundle）
 *   - `<root>/<name>.md`（平铺 Markdown）
 */

/** 用户级 skill 根目录（与 DSH 默认发现顺序一致）。 */
function skillRoots() {
  const home = os.homedir();
  return [
    path.join(home, '.dsh', 'skills'),
    path.join(home, '.agents', 'skills'),
  ];
}

/** 主 skill 目录（用于「打开文件夹/新建」入口）。 */
function primarySkillRoot() {
  return path.join(os.homedir(), '.dsh', 'skills');
}

/** 解析 `---` 包裹的 YAML frontmatter；无 frontmatter 时整体视为正文。 */
function parseFrontmatter(text) {
  const m = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { body: text.trim(), meta: {} };
  let meta = {};
  try {
    meta = yaml.load(m[1]) || {};
  } catch {
    /* 解析失败按无元数据处理 */
  }
  return { body: text.slice(m[0].length).trim(), meta };
}

/** 从单个 skill 文件读取并归一化。 */
function readSkill(file, root) {
  const text = fs.readFileSync(file, 'utf8');
  const { body, meta } = parseFrontmatter(text);
  const rel = path.relative(root, file);
  const firstSegment = rel.split(path.sep)[0];
  const fallbackName = rel.endsWith(`SKILL.md`) || rel === 'SKILL.md'
    ? firstSegment
    : rel.replace(/\.md$/i, '');
  return {
    name: typeof meta.name === 'string' ? meta.name : fallbackName,
    description: typeof meta.description === 'string' ? meta.description : '',
    whenToUse: typeof meta.whenToUse === 'string' ? meta.whenToUse : '',
    path: file,
    root,
    body,
  };
}

/** 扫描所有根目录，返回按名称排序的 skill 列表。 */
function scanSkills() {
  const results = [];
  for (const root of skillRoots()) {
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue; // 目录不存在或不可读
    }
    for (const entry of entries) {
      try {
        if (entry.isDirectory()) {
          const p = path.join(root, entry.name, 'SKILL.md');
          if (fs.existsSync(p)) results.push(readSkill(p, root));
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
          results.push(readSkill(path.join(root, entry.name), root));
        }
      } catch {
        /* 单个条目异常时跳过，不影响整体 */
      }
    }
  }
  results.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return results;
}

/** 打开某个 skill 的源文件（用系统默认编辑器）。 */
function openSkillFile(file) {
  // 交由主进程的 shell.openPath 处理；这里只做路径校验。
  if (!file || typeof file !== 'string') return null;
  return file;
}

module.exports = { skillRoots, primarySkillRoot, scanSkills, openSkillFile };
