// 文件夹扫描器：把用户添加进项目的文件夹「学习」成结构化记忆。
// 零依赖（仅 node 内置模块），与 dsh 解耦，便于单独测试。

import { promises as fsp } from 'node:fs'
import path from 'node:path'

/** 跳过目录：依赖、构建产物、VCS、缓存等。 */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', 'target',
  '.next', '.nuxt', '.turbo', 'obj', 'bin', '.cache', '.parcel-cache',
  '.idea', '.vscode', '__pycache__', '.venv', 'venv', 'coverage', '.pytest_cache',
  '.gradle', '.mypy_cache', '.ruff_cache',
])

/** 跳过文件：锁文件、二进制垃圾。 */
const SKIP_FILES = new Set([
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb',
  '.DS_Store', 'Thumbs.db', 'desktop.ini',
])

/** 视为文本的文件扩展名/文件名（其余按二进制跳过摘录）。 */
const TEXT_MATCHERS = [
  (rel) => /\.(md|mdx|txt|rst|json|jsonc|js|mjs|cjs|ts|tsx|jsx|css|scss|less|html|htm|xml|yml|yaml|toml|ini|cfg|conf|py|rs|go|java|kt|scala|c|h|cpp|hpp|cs|rb|php|lua|sh|bash|zsh|bat|cmd|ps1|sql|csv|tsv|vue|svelte|astro|graphql|gql|prisma|env|example|gitignore|dockerignore|editorconfig|prettierrc|eslintrc|nvmrc|babelrc|browserslistrc)$/i.test(rel),
  (rel) => /^(Dockerfile|Makefile|Gemfile|Rakefile|Procfile|Vagrantfile|Jenkinsfile|LICENSE|COPYING|NOTICE|CHANGELOG|README|AGENTS)(\..*)?$/i.test(path.basename(rel)),
]

/** 扫描上限：防失控。 */
export const SCAN_LIMITS = {
  maxFiles: 5000, // 单文件夹最多收录文件数
  maxBytes: 300 * 1024 * 1024, // 单文件夹累计字节上限
  maxDepth: 24,
  excerptBytes: 3000, // 普通文件摘录长度
  docExcerptBytes: 12000, // 关键文档摘录长度
  maxSamples: 250, // 普通文件摘录数量上限
  maxDocs: 80, // 关键文档数量上限
  maxTree: 3000, // 目录树条目上限
}

const DOC_BASENAMES = new Set([
  'readme.md', 'readme.txt', 'readme', 'readme.zh-cn.md', 'readme.zh.md',
  'license', 'license.md', 'license.txt', 'copying', 'notice',
  'changelog.md', 'changelog.txt', 'changelog',
  'package.json', 'tsconfig.json', 'jsconfig.json', 'vite.config.js', 'vite.config.ts',
  'webpack.config.js', 'next.config.js', 'next.config.mjs', 'nuxt.config.ts',
  'pyproject.toml', 'setup.py', 'requirements.txt', 'poetry.lock',
  'cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle',
  'composer.json', 'gemfile', 'mix.exs', 'stack.yaml', 'package.swift',
  'dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yml',
  'makefile', 'cmakelists.txt', 'meson.build', 'bazel', 'workspace',
  'environment.yml', 'environment.yaml', 'conda.env', '.env.example', '.env.sample',
  '.gitignore', '.dockerignore', '.editorconfig', '.prettierrc', '.eslintrc',
  'eslint.config.js', 'eslint.config.mjs', '.babelrc', 'tslint.json', 'biome.json',
  'ci.yml', 'release.yml', 'main.yml',
])

/** 项目类型检测：返回人类可读描述。 */
export function detectProjectKind(relPaths) {
  const set = new Set(relPaths.map((p) => path.basename(p).toLowerCase()))
  const has = (...names) => names.some((n) => set.has(n))
  if (has('package.json')) {
    const deps = relPaths.join('\n')
    if (/node_modules\/|\/node_modules\//.test(relPaths.join('\n'))) { /* noop */ }
    let kind = 'Node.js 项目'
    if (has('vite.config.js', 'vite.config.ts', 'vite.config.mjs')) kind = '前端项目（Vite）'
    else if (has('next.config.js', 'next.config.mjs')) kind = '前端项目（Next.js）'
    else if (has('nuxt.config.ts')) kind = '前端项目（Nuxt）'
    else if (has('electron-builder.yml', 'electron-builder.json')) kind = 'Electron 桌面应用'
    else if (has('tsconfig.json') && relPaths.some((p) => /\.(ts|tsx)$/.test(p))) kind = 'TypeScript 项目'
    if (deps.includes('react')) kind += '（含 React）'
    return kind
  }
  if (has('pyproject.toml', 'setup.py', 'requirements.txt')) return 'Python 项目'
  if (has('cargo.toml')) return 'Rust 项目'
  if (has('go.mod')) return 'Go 项目'
  if (has('pom.xml')) return 'Java 项目（Maven）'
  if (has('build.gradle', 'build.gradle.kts')) return 'Java/Kotlin 项目（Gradle）'
  if (has('composer.json')) return 'PHP 项目'
  if (has('gemfile')) return 'Ruby 项目'
  if (has('mix.exs')) return 'Elixir 项目'
  if (has('cmakelists.txt')) return 'C/C++ 项目（CMake）'
  if (has('docker-compose.yml', 'docker-compose.yaml', 'compose.yml')) return 'Docker Compose 配置'
  if (set.has('dockerfile')) return 'Docker 配置'
  if (relPaths.some((p) => /\.md$/i.test(p))) return '文档/笔记目录'
  return '通用文件夹'
}

/** 读取文本文件头部摘录（按字节数）。 */
async function readHead(filePath, maxBytes) {
  try {
    const fh = await fsp.open(filePath, 'r')
    try {
      const buf = Buffer.alloc(maxBytes)
      const { bytesRead } = await fh.read(buf, 0, maxBytes, 0)
      let text = buf.subarray(0, bytesRead).toString('utf8')
      // 丢弃 NUL 字节（二进制伪装成文本）。
      if (text.includes('\u0000')) return null
      // 去掉 BOM。
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
      if (text.length > maxBytes) text = text.slice(0, maxBytes)
      const truncated = bytesRead >= maxBytes
      return { text, truncated }
    } finally {
      await fh.close()
    }
  } catch {
    return null
  }
}

/**
 * 扫描一个文件夹，返回结构化结果。
 * @param {string} root 文件夹绝对路径
 * @returns {Promise<object>} { path, fileCount, totalBytes, skippedDirs, skippedFiles, tree, docs, samples, kind }
 */
export async function scanFolder(root) {
  const stat = await fsp.stat(root)
  if (!stat.isDirectory()) throw new Error(`不是文件夹：${root}`)

  const tree = [] // { rel, size, ext }
  const docs = [] // { rel, excerpt, truncated }
  const samples = [] // { rel, head, truncated }
  let fileCount = 0
  let totalBytes = 0
  let skippedDirs = 0
  let skippedFiles = 0

  const walk = async (dir, depth) => {
    if (depth > SCAN_LIMITS.maxDepth || fileCount >= SCAN_LIMITS.maxFiles || totalBytes >= SCAN_LIMITS.maxBytes) return
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (fileCount >= SCAN_LIMITS.maxFiles || totalBytes >= SCAN_LIMITS.maxBytes) break
      if (entry.name.startsWith('.') && entry.name !== '.env.example' && entry.name !== '.env.sample' && entry.name !== '.gitignore' && entry.name !== '.editorconfig' && entry.name !== '.dockerignore' && entry.name !== '.prettierrc' && entry.name !== '.eslintrc' && entry.name !== '.babelrc') continue
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name.toLowerCase())) { skippedDirs += 1; continue }
        await walk(abs, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      if (SKIP_FILES.has(entry.name.toLowerCase())) { skippedFiles += 1; continue }
      let size = 0
      try {
        size = (await fsp.stat(abs)).size
      } catch {
        continue
      }
      totalBytes += size
      fileCount += 1
      const rel = path.relative(root, abs)
      const ext = path.extname(entry.name).toLowerCase()
      if (tree.length < SCAN_LIMITS.maxTree) tree.push({ rel, size, ext })

      const isText = TEXT_MATCHERS.some((m) => m(rel))
      if (!isText || size === 0 || size > 2 * 1024 * 1024) continue
      const head = await readHead(abs, SCAN_LIMITS.excerptBytes)
      if (!head) continue

      const isDoc = DOC_BASENAMES.has(entry.name.toLowerCase()) || (/^readme/i.test(entry.name) && ext === '.md')
      if (isDoc && docs.length < SCAN_LIMITS.maxDocs) {
        const docHead = head.truncated ? await readHead(abs, SCAN_LIMITS.docExcerptBytes) : head
        if (docHead) docs.push({ rel, excerpt: docHead.text, truncated: docHead.truncated })
      } else if (samples.length < SCAN_LIMITS.maxSamples) {
        samples.push({ rel, head: head.text, truncated: head.truncated })
      }
    }
  }

  await walk(root, 0)
  const kind = detectProjectKind([...docs.map((d) => d.rel), ...samples.map((s) => s.rel), ...tree.map((t) => t.rel)])

  return {
    path: root,
    kind,
    fileCount,
    totalBytes,
    skippedDirs,
    skippedFiles,
    tree,
    docs,
    samples,
    scannedAt: new Date().toISOString(),
  }
}
