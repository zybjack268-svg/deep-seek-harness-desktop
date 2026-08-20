# DeepSeek Harness 桌面客户端

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`@deepseek-ai/dsh`）的 Web GUI 封装成跨平台 **Electron 桌面应用**：双击即启动本地服务并打开原生窗口，无需安装 Node.js、无需命令行，普通用户也能一键使用。

## 功能

- **开箱即用**：内置 Node 运行时与完整 `@deepseek-ai/dsh`，免安装 Node。
- **自动接管服务**：启动时在本地拉起 `dsh web`，就绪后自动加载窗口，退出时优雅关闭服务。
- **端口策略**：首选固定端口 **3090**；端口被占用时自动退回随机端口。
- **开启动画**：启动时中间先显示加载环，服务就绪后变成一道「门」——中间是圆形鲸鱼图标，点击图标门从中间上下打开并伴有蓝色光效；图标下方有大海样式的加载进度条，蓝色鲸鱼随加载从一端游到另一端，加载完成正好到达并淡出。可在「启动设置」中开启「自动开门」。
- **启动设置**：菜单「设置 → 启动设置」（`Ctrl+,`）可自定义开门光效颜色、开门图标、界面背景，以及「应用加载完自动开门」开关。
- **最小稳定插件组合**：
  - **Aqua 玻璃主题**：高自由度磨砂玻璃质感主题（设置 → 插件 → 玻璃主题）。
  - **插件市场**：设置 → 插件市场，浏览、搜索和安装社区插件。
  - 其他增强插件不再默认加入启动链，避免单个第三方插件导致整个桌面应用无法打开。
- **深浅色跟随系统**：窗口标题栏、启动背景色和页面主题都跟随系统深浅色，切换系统主题时实时联动。
- **技能页**：菜单「视图 → 技能」（或 `Ctrl+Shift+K`）打开专属技能页，列出用户保存的每个 skill，点击即可在对话中调用（自动填入 `/技能名`）。
- **单实例**：重复启动只聚焦已有窗口，不会重复起服务。
- **共享配置**：与命令行版共用 `~/.dsh`，凭据 / 会话 / 插件配置无缝延续。
- **安全默认**：渲染进程 `sandbox` + `contextIsolation`，外链一律交给系统浏览器。

## 下载与安装

到 [Releases](../../releases) 页面下载对应平台的安装包：

| 平台 | 安装包 |
| --- | --- |
| Windows | `deep seek ZYB Setup x.y.z.exe`（NSIS 安装器） |
| macOS | `deep seek ZYB-x.y.z-arm64.dmg`（Apple Silicon）或 `deep seek ZYB-x.y.z-x64.dmg`（Intel） |
| Linux | `deep seek ZYB-x.y.z.AppImage` 或 `.deb` |

> ⚠️ **未签名提示**：本项目的 CI 暂不做代码签名 / 公证。
> - Windows 首次运行若弹出 SmartScreen，点「更多信息 → 仍要运行」。
> - macOS 首次运行若被 Gatekeeper 拦截，右键应用 →「打开」，或执行 `xattr -dr com.apple.quarantine /Applications/DeepSeek\ Harness.app`。
>
> 面向公众分发建议接入代码签名（见文末「签名与分发」）。

## v0.2.6 启动修复

- 修复安装后桌面快捷方式指向失效路径的问题。
- 修复 electron-builder 遗漏或错误嵌套 DeepSeek Harness 运行时包，导致 `ERR_MODULE_NOT_FOUND` 和 `plugin tree failed to load` 的问题。
- 打包后自动补齐根目录不可见的 DeepSeek 核心模块；不再依赖开发环境中的 npm 提升布局。
- 默认启动链缩减为 **Aqua 玻璃主题 + 插件市场**，不再预载 ModLens、浏览器桥、项目、文件接收、`@` 路径引用等增强插件。
- 启动日志会递归展开 `AggregateError`，以后可直接看到具体失败包名。

从旧版本升级后，如果用户 profile 中曾安装不兼容的第三方插件，可先在插件市场停用；用户会话和凭据仍保存在 `~/.dsh`。

## 本地开发

```bash
# 1. 安装依赖（需要 Node.js ≥ 22，推荐 24；应用运行时使用 Electron 43 内置的 Node 24）
npm install

# 2. 开发模式运行（加 --dev 会在菜单中启用 DevTools）
npm start          # 等价于 electron .
npm run dev        # 等价于 electron . --dev
```

## 本地打包

```bash
npm run dist:win    # Windows NSIS 安装器
npm run dist:mac    # macOS dmg/zip（建议在 macOS 上执行）
npm run dist:linux  # Linux AppImage/deb
```

产物输出到 `dist/`。

> ⚠️ **Windows 本地打包注意**：electron-builder 解压 `winCodeSign` 时会遇到含符号链接的归档，若 Windows 未开启「开发者模式」或当前用户无符号链接权限，会在最后一步报 `Cannot create symbolic link`。此时安装器其实已基本生成（或改用 `npm run pack` 生成免安装目录），更省事的做法是直接交给 CI（推送 tag）构建。

## 自动发布到 GitHub Releases

仓库已内置 `.github/workflows/release.yml`：**推送 `v*` 标签**即触发三平台并行构建，并把安装包上传到 Releases（草稿，自动生成变更说明）。

```bash
git tag v0.1.0
git push origin v0.1.0
```

到 GitHub 仓库的 Releases 页面把草稿发布即可，别人即可下载。

## 架构

```
┌─────────────────────────────────────────────┐
│ Electron 主进程 (src/main.cjs)                │
│  ├─ 单实例锁 / 菜单 / 生命周期                │
│  ├─ DshServer (src/server-manager.cjs)       │
│  │    └─ child_process.spawn +               │
│  │       ELECTRON_RUN_AS_NODE=1              │
│  │         └─ dsh-child.cjs ──► import dsh   │
│  │             └─ dsh web --port 3090        │
│  └─ BrowserWindow (src/window.cjs)           │
│       └─ loadURL(http://127.0.0.1:<port>)    │
└─────────────────────────────────────────────┘
```

关键点：

- `dsh` 是 ESM 自执行 CLI。主进程用 `child_process.spawn(process.execPath, ['--expose-internals', launcher])` + `ELECTRON_RUN_AS_NODE=1` 启动（不能用 `utilityProcess`：打包后它不转发 `--expose-internals`，而 cordis-plugin-hmr 需要访问 Node 内部模块），参数经环境变量 `DSH_DESKTOP_CHILD_ARGS` 传入，避免与 `process.argv` 布局耦合。
- DSH 会在 `~/.dsh/profiles/node_modules` 下创建指向安装目录的**符号链接**，因此打包必须 `asar: false`（见 `electron-builder.yml`），让 `node_modules` 落在真实文件系统上。
- 通过解析 dsh 就绪后打印的 `dsh web: http://127.0.0.1:<port>` 拿到实际端口再加载窗口。

## 数据与日志

- **用户数据**：`~/.dsh`（与 CLI 版共享）。
- **运行日志**：Electron 的 `logs` 目录（Windows：`%APPDATA%\deep seek ZYB\logs`），其中 `dsh-web.log` 记录了 dsh 子进程输出、`timing.log` 记录了每次启动各阶段的耗时，排障时优先看这里。

## 签名与分发（正式发布建议）

1. **Windows**：使用代码签名证书（或 Azure Trusted Signing）对 exe 签名，消除 SmartScreen 警告。CI 中注入 `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`。
2. **macOS**：需要 Apple Developer ID + 公证（notarytool）。CI 中注入 `CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`，并在 `electron-builder.yml` 中启用 `mac.notarize`。
3. 签名相关机密统一放在仓库的 **Settings → Secrets and variables → Actions** 中。

## 许可

本项目为对 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT）的封装，同样以 MIT 许可发布。
