// dsh-desktop-services 宿主插件：向插件树提供 desktopProfiles 与 desktopPnpm 服务。
// dshmarket（插件市场）检测到这两个服务后走「桌面端模式」：
// 用内置 pnpm 跑 add/remove/install，不再尝试 spawn 全局 dsh/pnpm CLI
// （桌面上没有全局 dsh/pnpm，CLI 路径会把 cmd 的 GBK 报错当乱码显示给用户）。
// 契约参考 anywhere-labs/deepseek-harness-desktop 的 dsh-plugin-desktop 文档。

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-desktop-services'
export const inject = []

function profileDir() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'profiles', 'web')
}

/** 内置 pnpm 入口（vendor/pnpm 随应用分发）。 */
function pnpmBin() {
  return fileURLToPath(new URL('../../../pnpm/bin/pnpm.cjs', import.meta.url))
}

let busy = false

function killTree(child) {
  if (process.platform === 'win32' && child.pid !== undefined) {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
      return
    } catch {
      /* 忽略，回退普通 kill */
    }
  }
  try {
    child.kill('SIGKILL')
  } catch {
    /* 忽略 */
  }
}

/**
 * desktopPnpm 服务：runPlugin(args, invokingDir, signal) →
 * { stdout, stderr, done: Promise<{exitCode, signal}>, cancel() }。
 * pnpm 一律在 web profile 目录里运行（那里有 profile 的 package.json）。
 */
const desktopPnpm = {
  runPlugin(args, invokingDir, signal) {
    if (busy) throw new Error('another desktop pnpm operation is already running')
    busy = true
    const pnpm = pnpmBin()
    const dir = profileDir()
    mkdirSync(dir, { recursive: true })
    const child = spawn(process.execPath, [pnpm, ...args], {
      cwd: dir,
      env: { ...process.env, CI: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const abort = () => killTree(child)
    if (signal) {
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    }
    const done = new Promise((resolve) => {
      child.on('error', (error) => {
        busy = false
        resolve({ exitCode: 127, signal: null, spawnError: String(error && error.message ? error.message : error) })
      })
      child.on('close', (code) => {
        busy = false
        resolve({ exitCode: code ?? 1, signal: null })
      })
    })
    return {
      stdout: child.stdout,
      stderr: child.stderr,
      done,
      cancel: abort,
    }
  },
}

const desktopProfiles = { current: { name: 'web', dir: profileDir() } }

export function apply(ctx) {
  try {
    ctx.provide('desktopProfiles', desktopProfiles)
    ctx.provide('desktopPnpm', desktopPnpm)
  } catch (error) {
    console.error(`[dsh-desktop-services] provide 失败: ${error && error.message ? error.message : error}`)
  }
}
