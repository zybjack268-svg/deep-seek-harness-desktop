'use strict';

/**
 * 在 Electron 内置的 Node 运行时（ELECTRON_RUN_AS_NODE=1）里启动 `dsh` CLI。
 * dsh 的 bin.js 是自执行 ESM，读取 `process.argv.slice(2)`。
 * 参数经环境变量 DSH_DESKTOP_CHILD_ARGS（JSON 数组）传入，避免与
 * 子进程自身的 argv 布局耦合。
 */
const args = JSON.parse(process.env.DSH_DESKTOP_CHILD_ARGS || '[]');
process.argv = [process.execPath, __filename, ...args];

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');

// electron-builder may keep dsh's private dependency tree nested below
// @deepseek-ai/dsh. Resolve app-boot from dsh's own module location instead of
// relying on npm's development-time hoisting into the application root.
const dshRequire = createRequire(require.resolve('@deepseek-ai/dsh/lib/bin.js'));

function importDshAppBoot() {
  return import(pathToFileURL(dshRequire.resolve('@deepseek-ai/dsh-app-boot')).href);
}

/**
 * 预置 modlens / 浏览器桥 / @路径引用 / 桌面服务 / 插件市场 到 web profile 的
 * bundles 列表（等价于 `dsh plugin --profile web add <pkg>`，但无需 pnpm）。
 * 都是 bundle 型包（package.json 带 dsh.bundle.patch）：
 * - @liustack/modlens：视觉插件（modlens_read_image 工具 + 粘贴拦截/模型变体）
 * - @deepseek-ai/dsh-bridge-browser：浏览器桥（browser_* 工具 + /ext/bridge
 *   WebSocket，供 Chrome 扩展连接，实现读取/操作用户真实浏览器标签页）
 * - dsh-at-file：工作区 @路径引用（输入 @ 搜索工作区文件/目录并插入路径）
 * - @deepseek-ai/dsh-desktop-services：为 dshmarket 提供 desktopProfiles /
 *   desktopPnpm 服务（内置 pnpm 安装运行时），**必须排在 dshmarket 之前**
 * - dshmarket：可视化插件市场（浏览/搜索/一键安装社区插件）
 */
const DESKTOP_BUNDLES = [
  '@deepseek-ai/dsh-desktop-services',
  'dshmarket',
];

/** 依赖包是否声明 dsh.bundle（= bundle 型插件，可进 profile bundles 层）。 */
function isBundlePackage(profileDir, name) {
  try {
    const pkgPath = path.join(profileDir, 'node_modules', ...name.split('/'), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return typeof pkg.dsh?.bundle?.patch === 'string';
  } catch {
    return false;
  }
}

/**
 * 内置 bundle 是否可解析（主进程已把它 junction 进 profiles/node_modules，
 * 或市场装进了 profiles/web/node_modules）。链接失败/目标缺失时返回 false，
 * 由调用方跳过——避免因环境问题（如杀软拦截 junction）导致整个服务退出。
 */
function desktopBundleResolvable(profileDir, name) {
  const bases = [path.join(profileDir, '..', 'node_modules'), path.join(profileDir, 'node_modules')];
  for (const base of bases) {
    try {
      const pkgPath = path.join(base, ...name.split('/'), 'package.json');
      if (!fs.existsSync(pkgPath)) continue;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (typeof pkg.dsh?.bundle?.patch === 'string') return true;
    } catch {
      /* 继续查下一个位置 */
    }
  }
  return false;
}

/**
 * 把 profile 依赖里声明了 dsh.bundle 的包对齐进 bundles 层（等价于官方
 * `dsh plugin add` 的 reconcilePlugins 步骤）。插件市场只做 pnpm 安装 +
 * 热挂载、不写 bundles——没有这一步，市场装的 bundle 型插件重启后就是
 * “已安装但未成为 profile 层”的惰性状态，永远不加载。
 * 依赖中已卸载/不再是 bundle 的包同时移出 bundles（内置 bundle 不在依赖里，不受影响）。
 */
function reconcileMarketPlugins(manifest, dir, bundles) {
  const deps = Object.keys(manifest.dependencies ?? {});
  for (const name of deps) {
    if (bundles.includes(name)) continue;
    if (isBundlePackage(dir, name)) bundles.push(name);
  }
  for (const name of [...bundles]) {
    if (!deps.includes(name)) continue;
    if (!isBundlePackage(dir, name)) bundles.splice(bundles.indexOf(name), 1);
  }
}

async function ensureDesktopBundles() {
  try {
    const boot = await importDshAppBoot();
    const dir = boot.resolveProfileDir('web');
    boot.initProfile(dir, boot.PROFILE_TEMPLATES.web ?? boot.DEFAULT_PROFILE_BUNDLES);
    const manifest = boot.readProfileManifest('dsh', dir);
    const bundles = manifest.dsh?.profile?.bundles ?? [];
    for (const name of DESKTOP_BUNDLES) {
      if (bundles.includes(name)) continue;
      // 自愈保护：包解析不到（链接被拦/安装不完整）就跳过该 bundle 并记日志，
      // 不让一个插件拖垮整个启动。
      if (!desktopBundleResolvable(dir, name)) {
        console.error(`[dsh-desktop] bundle "${name}" 无法解析，跳过（主进程链接可能失败，详见 dsh-web.log）`);
        continue;
      }
      // 桌面服务必须挂在插件市场之前（市场的 apply 在挂载时读取服务）。
      if (name === '@deepseek-ai/dsh-desktop-services' && bundles.includes('dshmarket')) {
        bundles.splice(bundles.indexOf('dshmarket'), 0, name);
      } else {
        bundles.push(name);
      }
    }
    // 市场安装的 bundle 型插件：对齐进 bundles 层（幂等）。
    reconcileMarketPlugins(manifest, dir, bundles);
    manifest.dsh = {
      ...manifest.dsh,
      profile: { ...manifest.dsh?.profile, bundles },
    };
    boot.writeProfileManifest(dir, manifest);
  } catch (error) {
    console.error('[dsh-desktop] bundle setup failed: ' + (error && error.message ? error.message : error));
  }
}

/**
 * 桌面端预置的非 bundle 型插件（普通插件包）：
 * 官方安装方式是在 web profile 的 cordis.patch.yml 里插一条 insert 补丁
 * （见 aqua 插件仓库 install.ps1）。这里复刻同样逻辑（幂等，保留已有内容/注释）。
 * - ui-aqua：Aqua 玻璃主题（透明 UI 美化）
 * - dsh-project：项目功能（项目创建/文件夹学习记忆/项目内对话）
 * - dsh-file-intake：文件接收桥（粘贴/拖入非图片文件，PDF 自动提取文本）
 * 包本体由主进程在启动前链接进 profiles/node_modules（见 server-manager.cjs）。
 */
const DESKTOP_PLUGIN_PATCHES = [
  { id: 'ui-aqua', name: '@deepseek-ai/dsh-client-ui-aqua' },
];

function patchEntryText(entry) {
  return `- insert:\n    - id: ${entry.id}\n      name: '${entry.name}'\n`;
}

/**
 * 内置插件的配置覆写（以顶层 `- id: X` + `config:` 行覆写 bundle 里的默认配置）。
 * - dshmarket：插件市场。桌面端由 Electron 主进程托管（属“进程管理器托管”场景，
 *   市场自己的脱离进程重启会与主进程冲突），禁用其 allowRestart。
 */
const DESKTOP_PLUGIN_CONFIGS = [
  { id: 'dshmarket', name: 'dshmarket', config: { allowRestart: false } },
];

function configRowText(entry) {
  const keys = Object.keys(entry.config);
  let yaml = `- id: ${entry.id}\n`;
  if (keys.length > 0) {
    yaml += '  config:\n';
    for (const key of keys) {
      yaml += `    ${key}: ${JSON.stringify(entry.config[key])}\n`;
    }
  }
  return yaml;
}

/**
 * 内置插件（普通包）是否可解析（junction 存在且 package.json 可读）。
 * 链接失败时调用方跳过登记，避免 loader 因无法导入而让整个服务退出。
 */
function pluginPackageResolvable(profileDir, name) {
  const bases = [path.join(profileDir, '..', 'node_modules'), path.join(profileDir, 'node_modules')];
  for (const base of bases) {
    try {
      if (fs.existsSync(path.join(base, ...name.split('/'), 'package.json'))) return true;
    } catch {
      /* 继续查下一个位置 */
    }
  }
  return false;
}

async function ensureDesktopPatches() {
  try {
    const boot = await importDshAppBoot();
    const dir = boot.resolveProfileDir('web');
    boot.initProfile(dir, boot.PROFILE_TEMPLATES.web ?? boot.DEFAULT_PROFILE_BUNDLES);
    const patchFile = path.join(dir, 'cordis.patch.yml');
    let content = '';
    try {
      content = fs.readFileSync(patchFile, 'utf8');
    } catch {
      /* 文件不存在：从空开始 */
    }
    for (const entry of DESKTOP_PLUGIN_PATCHES) {
      // 已登记则跳过（只匹配真实条目，不匹配注释里的字样）。
      const re = new RegExp(`^\\s*-\\s+id:\\s*${entry.id}\\s*$`, 'm');
      if (re.test(content)) continue;
      // 自愈保护：包解析不到就跳过登记，不让 loader 因无法导入而拖垮启动。
      if (!pluginPackageResolvable(dir, entry.name)) {
        console.error(`[dsh-desktop] 插件 "${entry.name}" 无法解析，跳过登记（主进程链接可能失败）`);
        continue;
      }
      const base = content.replace(/\[\s*\]\s*$/, '').trimEnd();
      content = (base ? base + '\n\n' : '') + patchEntryText(entry) + '\n';
    }
    for (const entry of DESKTOP_PLUGIN_CONFIGS) {
      // 配置覆写行：顶层 `- id: X` 且紧随 config（区别于 insert 块里的缩进 id）。
      const re = new RegExp(`^\\s*-\\s+id:\\s*${entry.id}\\s*$`, 'm');
      if (re.test(content)) continue;
      // 自愈保护：目标插件没加载时配置行会指向不存在的 id，跳过。
      if (entry.name && !pluginPackageResolvable(dir, entry.name)) {
        console.error(`[dsh-desktop] 插件 "${entry.name}" 无法解析，跳过配置覆写`);
        continue;
      }
      const base = content.replace(/\[\s*\]\s*$/, '').trimEnd();
      content = (base ? base + '\n\n' : '') + configRowText(entry) + '\n';
    }
    fs.writeFileSync(patchFile, content, 'utf8');
  } catch (error) {
    console.error('[dsh-desktop] patch setup failed: ' + (error && error.message ? error.message : error));
  }
}

(async () => {
  await ensureDesktopBundles();
  await ensureDesktopPatches();
  await import('@deepseek-ai/dsh/lib/bin.js');
})().catch((err) => {
  // AggregateError.stack 不包含内部 errors；递归展开，才能定位具体失败插件。
  console.error(require('node:util').inspect(err, { depth: 12, colors: false }));
  process.exit(1);
});
