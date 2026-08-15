'use strict';

/**
 * 在 Electron 内置的 Node 运行时（ELECTRON_RUN_AS_NODE=1）里启动 `dsh` CLI。
 * dsh 的 bin.js 是自执行 ESM，读取 `process.argv.slice(2)`。
 * 参数经环境变量 DSH_DESKTOP_CHILD_ARGS（JSON 数组）传入，避免与
 * 子进程自身的 argv 布局耦合。
 */
const args = JSON.parse(process.env.DSH_DESKTOP_CHILD_ARGS || '[]');
process.argv = [process.execPath, __filename, ...args];

/**
 * 预置 modlens 视觉插件到 web profile 的 bundles 列表（等价于
 * `dsh plugin --profile web add @liustack/modlens`，但无需 pnpm）。
 * 挂进 bundles 后，dsh 会同时加载其宿主端（modlens_read_image 工具）
 * 与客户端（粘贴拦截 + (modlens vision) 模型变体）。
 */
async function ensureModlensBundle() {
  try {
    const boot = await import('@deepseek-ai/dsh-app-boot');
    const dir = boot.resolveProfileDir('web');
    boot.initProfile(dir, boot.PROFILE_TEMPLATES.web ?? boot.DEFAULT_PROFILE_BUNDLES);
    const manifest = boot.readProfileManifest('dsh', dir);
    const bundles = manifest.dsh?.profile?.bundles ?? [];
    if (!bundles.includes('@liustack/modlens')) {
      manifest.dsh = {
        ...manifest.dsh,
        profile: { ...manifest.dsh?.profile, bundles: [...bundles, '@liustack/modlens'] },
      };
      boot.writeProfileManifest(dir, manifest);
    }
  } catch (error) {
    console.error('[modlens] bundle setup failed: ' + (error && error.message ? error.message : error));
  }
}

(async () => {
  await ensureModlensBundle();
  await import('@deepseek-ai/dsh/lib/bin.js');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
