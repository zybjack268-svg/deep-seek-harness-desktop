// 项目存储层：所有项目数据落在 $DSH_HOME/projects/dsh-project/ 下。
// 零依赖；DSH_HOME 环境变量可覆盖（测试时指向克隆目录）。
// 记忆数据按项目隔离存放（记忆仅限于该项目当中）。

import { promises as fsp, readFileSync } from 'node:fs'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { scanFolder } from './scanner.js'
import { buildMemory, renderMemoryMd } from './memory.js'

export function homeDir() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

export function storeDir() {
  return path.join(homeDir(), 'projects', 'dsh-project')
}

function projectDir(id) {
  return path.join(storeDir(), id)
}

export function projectsFile() {
  return path.join(storeDir(), 'projects.json')
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

async function writeJson(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fsp.rename(tmp, file)
}

/** 串行化所有写操作，避免并发改坏同一批文件。 */
let writeChain = Promise.resolve()
function serial(fn) {
  const run = writeChain.then(fn, fn)
  writeChain = run.catch(() => {})
  return run
}

export async function listProjects() {
  return readJson(projectsFile(), [])
}

/** Windows 文件名非法字符与保留名。 */
const WINDOWS_RESERVED = new Set(['con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'])

/**
 * 把用户输入的项目名转成安全的文件夹名：
 * 去掉 Windows 非法字符与首尾空白/点号，长度上限 80，拒绝保留名。
 */
export function sanitizeName(name) {
  const raw = String(name || '').trim().slice(0, 80)
  const cleaned = raw.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/[. ]+$/, '').trim()
  if (!cleaned) throw new Error('项目名称不能为空')
  if (WINDOWS_RESERVED.has(cleaned.toLowerCase())) throw new Error(`「${cleaned}」是系统保留名，不能作为文件夹名`)
  return cleaned
}

/** 工作流文本：原样保留（去掉首尾空白），上限 8000 字符。 */
export function sanitizeWorkflow(text) {
  return String(text || '').trim().slice(0, 8000)
}

export async function getProject(id) {
  const projects = await listProjects()
  return projects.find((p) => p.id === id) || null
}

/** 同步读取项目记录（供系统提示词 provider 使用）。 */
export function syncGetProject(id) {
  try {
    const projects = JSON.parse(readFileSync(projectsFile(), 'utf8'))
    return projects.find((p) => p.id === id) || null
  } catch {
    return null
  }
}

/**
 * 创建项目：{ name, location, workMode, workflow }。
 * - name 同时是项目名与新建文件夹名；
 * - location 必填：在 <location>/<name> 下创建新文件夹并立即学习；
 * - workMode：'agent'（由助手决定流程）| 'custom'（用户自定义工作流）。
 */
export async function createProject(options) {
  const opts = options || {}
  const name = sanitizeName(opts.name)
  const location = String(opts.location || '').trim()
  if (!location) throw new Error('请选择项目文件夹的创建位置')
  const workMode = opts.workMode === 'custom' ? 'custom' : 'agent'
  const workflow = workMode === 'custom' ? sanitizeWorkflow(opts.workflow) : ''
  if (workMode === 'custom' && !workflow) throw new Error('自定义工作流模式下，请先填写工作流步骤')

  // 先创建磁盘文件夹：必须不存在（recursive:false 保证已存在时报错）。
  const locStat = await fsp.stat(location).catch(() => null)
  if (!locStat || !locStat.isDirectory()) throw new Error(`创建位置不存在或不是文件夹：${location}`)
  const folderPath = path.join(location, name)
  try {
    await fsp.mkdir(folderPath)
  } catch (error) {
    if (error && error.code === 'EEXIST') throw new Error(`「${name}」已存在于该位置，请换一个项目名称`)
    if (error && error.code === 'EACCES' || error && error.code === 'EPERM') throw new Error(`没有权限在该位置创建文件夹：${location}`)
    throw error
  }

  return serial(async () => {
    const projects = await listProjects()
    const project = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workMode,
      workflow,
    }
    projects.push(project)
    await writeJson(projectsFile(), projects)
    await fsp.mkdir(projectDir(project.id), { recursive: true })
    // 新文件夹立即加入并学习。
    const folders = [{ path: folderPath, addedAt: new Date().toISOString() }]
    const { memory } = await rebuildMemory(project.id, folders)
    return { project, memory }
  })
}

/** 更新项目的工作模式与工作流（随后对话按新模式执行）。 */
export async function setWorkflow(id, workMode, workflow) {
  const mode = workMode === 'custom' ? 'custom' : 'agent'
  const text = mode === 'custom' ? sanitizeWorkflow(workflow) : ''
  if (mode === 'custom' && !text) throw new Error('自定义工作流模式下，请先填写工作流步骤')
  return serial(async () => {
    const projects = await listProjects()
    const project = projects.find((p) => p.id === id)
    if (!project) throw new Error(`项目不存在：${id}`)
    project.workMode = mode
    project.workflow = text
    project.updatedAt = new Date().toISOString()
    await writeJson(projectsFile(), projects)
    return project
  })
}

export async function deleteProject(id) {
  return serial(async () => {
    const projects = await listProjects()
    const next = projects.filter((p) => p.id !== id)
    await writeJson(projectsFile(), next)
    await fsp.rm(projectDir(id), { recursive: true, force: true })
    return true
  })
}

async function foldersOf(id) {
  return readJson(path.join(projectDir(id), 'folders.json'), [])
}

async function saveFolders(id, folders) {
  await writeJson(path.join(projectDir(id), 'folders.json'), folders)
}

/** 读取某项目的记忆（memory.json），无则返回 null。 */
export async function readMemory(id) {
  const raw = await readJson(path.join(projectDir(id), 'memory.json'), null)
  return raw
}

/** 重新扫描所有文件夹并重建记忆；返回 { memory, md, folders }。 */
async function rebuildMemory(id, folders) {
  const project = await getProject(id)
  if (!project) throw new Error(`项目不存在：${id}`)
  const results = []
  const kept = []
  for (const folder of folders) {
    try {
      const scan = await scanFolder(folder.path)
      results.push(scan)
      kept.push({ path: folder.path, addedAt: folder.addedAt })
    } catch (error) {
      console.error(`[dsh-project] 扫描失败 ${folder.path}: ${error && error.message ? error.message : error}`)
      kept.push(folder) // 文件夹还在，但本次扫描失败：保留原条目
    }
  }
  await saveFolders(id, kept)
  const memory = buildMemory(project, results)
  const md = renderMemoryMd(memory)
  await writeJson(path.join(projectDir(id), 'memory.json'), memory)
  await fsp.writeFile(path.join(projectDir(id), 'memory.md'), md, 'utf8')
  return { memory, md }
}

/** 添加文件夹（立即扫描学习）→ 重建项目记忆。 */
export async function addFolder(id, folderPath) {
  const abs = path.resolve(String(folderPath || '').trim())
  if (!abs) throw new Error('路径为空')
  const stat = await fsp.stat(abs).catch(() => null)
  if (!stat || !stat.isDirectory()) throw new Error(`不是文件夹：${abs}`)
  return serial(async () => {
    const project = await getProject(id)
    if (!project) throw new Error(`项目不存在：${id}`)
    const folders = await foldersOf(id)
    if (folders.some((f) => f.path.toLowerCase() === abs.toLowerCase())) {
      throw new Error('该文件夹已在项目中')
    }
    folders.push({ path: abs, addedAt: new Date().toISOString() })
    const { memory } = await rebuildMemory(id, folders)
    return { project, memory }
  })
}

/** 路径归一化比较（Windows 大小写不敏感 + 反斜杠归一）。 */
function samePath(a, b) {
  const norm = (p) => String(p || '').replace(/\\/g, '/').toLowerCase()
  return norm(a) === norm(b)
}

/** 移除文件夹并重建记忆。 */
export async function removeFolder(id, folderPath) {
  return serial(async () => {
    const folders = await foldersOf(id)
    const kept = folders.filter((f) => !samePath(f.path, folderPath))
    if (kept.length === folders.length) throw new Error('文件夹不在该项目中')
    const { memory } = await rebuildMemory(id, kept)
    return { memory }
  })
}

/** 全量重新学习。 */
export async function rescan(id) {
  return serial(async () => {
    const folders = await foldersOf(id)
    const { memory } = await rebuildMemory(id, folders)
    return { memory }
  })
}

// ---------------- 会话 ↔ 项目 绑定 ----------------

export function sessionsFile() {
  return path.join(storeDir(), 'sessions.json')
}

/** 把会话绑定到项目（该会话的系统提示词会注入项目记忆摘要）。 */
export async function bindSession(sessionId, projectId) {
  return serial(async () => {
    const project = await getProject(projectId)
    if (!project) throw new Error(`项目不存在：${projectId}`)
    const map = await readJson(sessionsFile(), {})
    map[sessionId] = { projectId, boundAt: new Date().toISOString() }
    await writeJson(sessionsFile(), map)
    return { sessionId, projectId }
  })
}

export async function unbindSession(sessionId) {
  return serial(async () => {
    const map = await readJson(sessionsFile(), {})
    delete map[sessionId]
    await writeJson(sessionsFile(), map)
    return true
  })
}

/** 同步查询会话绑定的项目 id（供系统提示词 provider 使用，必须在同步上下文里跑）。 */
export function syncProjectForSession(sessionId) {
  try {
    const map = JSON.parse(readFileSync(sessionsFile(), 'utf8'))
    return map[sessionId] && map[sessionId].projectId ? map[sessionId].projectId : null
  } catch {
    return null
  }
}

/** 同步读取项目记忆（memory.json）。 */
export function syncReadMemory(projectId) {
  try {
    return JSON.parse(readFileSync(path.join(projectDir(projectId), 'memory.json'), 'utf8'))
  } catch {
    return null
  }
}
