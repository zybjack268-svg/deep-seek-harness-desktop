// dsh-project 宿主插件：项目 CRUD + 文件夹学习记忆 + 项目查询工具 + REST 路由。
// 参考 @liustack/modlens 的宿主插件范式（ctx.tools.register / ctx.inject(['webServer'])）。

import path from 'node:path'
import {
  listProjects,
  createProject,
  deleteProject,
  addFolder,
  removeFolder,
  rescan,
  readMemory,
  setWorkflow,
  bindSession,
  unbindSession,
  syncProjectForSession,
  syncGetProject,
  syncReadMemory,
  storeDir,
} from './store.js'

export const name = 'dsh-project'
export const inject = ['tools']

const TOOL_NAME = 'project_lookup'
const ROUTE_PREFIX = '/dsh-project'
const MAX_BODY_BYTES = 1024 * 1024

/** 项目记忆文件路径（供模型用 read 工具直接读取）。 */
function memoryMdPath(id) {
  return path.join(storeDir(), id, 'memory.md')
}

/** 读取 JSON 请求体（带大小上限）。 */
async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) {
      const err = new Error('请求体过大')
      err.status = 413
      throw err
    }
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const err = new Error('请求体不是合法 JSON')
    err.status = 400
    throw err
  }
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(body)
}

/** 项目记忆概览（不把整份 md 塞进响应）。 */
function memoryOverview(memory) {
  if (!memory) return null
  return {
    project: memory.project,
    updatedAt: memory.updatedAt,
    memoryMdPath: memoryMdPath(memory.project.id),
    folders: memory.folders.map((f) => ({
      path: f.path,
      kind: f.kind,
      fileCount: f.fileCount,
      totalBytes: f.totalBytes,
      scannedAt: f.scannedAt,
      docCount: f.docs.length,
      sampleCount: f.samples.length,
      docs: f.docs.map((d) => d.rel),
    })),
  }
}

/** 在项目记忆中搜索（按关键词匹配文件路径与摘录）。 */
function searchMemory(memory, query) {
  const q = String(query || '').toLowerCase().trim()
  const hits = []
  if (!q) return hits
  for (const folder of memory.folders) {
    for (const doc of folder.docs) {
      if (doc.rel.toLowerCase().includes(q) || doc.excerpt.toLowerCase().includes(q)) {
        hits.push({ folder: folder.path, rel: doc.rel, why: '文档', excerpt: doc.excerpt.slice(0, 600) })
        if (hits.length >= 20) return hits
      }
    }
    for (const sample of folder.samples) {
      if (sample.rel.toLowerCase().includes(q) || sample.head.toLowerCase().includes(q)) {
        hits.push({ folder: folder.path, rel: sample.rel, why: '文件摘录', excerpt: sample.head.slice(0, 600) })
        if (hits.length >= 20) return hits
      }
    }
    for (const item of folder.tree) {
      if (item.rel.toLowerCase().includes(q)) {
        hits.push({ folder: folder.path, rel: item.rel, why: '路径匹配', excerpt: '' })
        if (hits.length >= 20) return hits
      }
    }
  }
  return hits
}

/** 注册 project_lookup 工具：让模型在对话中查询/利用项目记忆。 */
function registerTool(ctx) {
  const tool = {
    name: TOOL_NAME,
    description:
      '查询「项目」插件的项目与项目记忆。用户在 DSH 工作区里创建项目、向项目添加文件夹后，插件会自动学习文件夹内容并生成该项目的记忆（记忆仅限该项目）。' +
      '可用动作：action=list 列出全部项目；action=memory 读取指定项目的记忆概览（文件夹结构、关键文档列表、记忆文件路径）；action=search 在指定项目记忆中按关键词搜索。' +
      '拿到记忆文件路径（memoryMdPath）后，用 read 工具读取它获得完整摘要；需要看具体文件内容时，直接用 read 工具读取项目文件夹里的文件（项目文件夹对你只读）。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'memory', 'search'],
          description: 'list=列出全部项目；memory=读取指定项目的记忆概览；search=在指定项目记忆中搜索关键词',
        },
        projectId: { type: 'string', description: '项目 ID（action=memory/search 时必填）' },
        query: { type: 'string', description: 'action=search 时的搜索关键词' },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'object', description: '查询结果' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2).slice(0, 4000) }],
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      if (args.action === 'list') {
        const projects = await listProjects()
        return {
          projects: projects.map((p) => ({
            id: p.id,
            name: p.name,
            createdAt: p.createdAt,
            workMode: p.workMode || 'agent',
          })),
        }
      }
      const id = String(args.projectId || '').trim()
      if (!id) throw new Error(`${TOOL_NAME}：action=${args.action} 需要 projectId`)
      const memory = await readMemory(id)
      const project = syncGetProject(id)
      const mode = { workMode: project ? project.workMode || 'agent' : 'agent', workflow: project ? project.workflow || '' : '' }
      if (args.action === 'memory') {
        if (!memory) return { projectId: id, ...mode, error: '该项目还没有记忆（可能尚未添加文件夹或学习失败）' }
        return { ...memoryOverview(memory), ...mode }
      }
      if (args.action === 'search') {
        if (!memory) return { projectId: id, ...mode, error: '该项目还没有记忆' }
        return { project: memory.project, ...mode, hits: searchMemory(memory, args.query) }
      }
      throw new Error(`${TOOL_NAME}：未知 action=${args.action}`)
    },
  }
  try {
    ctx.tools.register(tool)
  } catch (error) {
    console.error(`[dsh-project] ${TOOL_NAME} 注册失败: ${error && error.message ? error.message : error}`)
  }
}

/**
 * 会话绑定项目的系统提示词摘要（紧凑版，防撑爆上下文）。
 * 同步执行：memory.json 很小，逐请求读盘可接受，且用 updatedAt 做了进程内缓存。
 */
const digestCache = new Map() // sessionId -> { updatedAt, text }

function projectDigestForSession(sessionId) {
  if (!sessionId) return ''
  const projectId = syncProjectForSession(sessionId)
  if (!projectId) return ''
  const project = syncGetProject(projectId)
  if (!project) return ''
  const memory = syncReadMemory(projectId)
  if (!memory) return ''
  const workMode = project.workMode === 'custom' ? 'custom' : 'agent'
  const cacheKey = `${memory.updatedAt}|${project.updatedAt || ''}|${workMode}|${project.workflow || ''}`
  const cached = digestCache.get(sessionId)
  if (cached && cached.key === cacheKey) return cached.text
  const lines = []
  lines.push(`当前会话绑定的项目：${memory.project.name}（id: ${memory.project.id}）`)
  lines.push(`项目记忆文件（可用 read 工具读取获得完整摘要）：${path.join(storeDir(), projectId, 'memory.md')}`)
  for (const folder of memory.folders) {
    lines.push(`- ${folder.path}：${folder.kind}，${folder.fileCount} 个文件`)
    if (folder.docs.length > 0) {
      lines.push(`  关键文档：${folder.docs.slice(0, 20).map((d) => d.rel).join('、')}`)
    }
  }
  lines.push('需要项目细节时，先用 read 读取项目记忆文件，或直接 read/glob/grep 上述文件夹中的具体文件（项目文件夹对你只读）。')
  if (workMode === 'custom') {
    lines.push('')
    lines.push('【工作模式：用户自定义工作流】')
    lines.push('用户为该项目设定的工作流如下：')
    lines.push('---')
    lines.push(project.workflow || '（未填写）')
    lines.push('---')
    lines.push('执行要求：开始解决问题前，先验证该工作流是否可行，并把验证结论告知用户；若可行，严格按该工作流推进；若你想添加或调整任何流程步骤，必须先告知用户并征得同意，不得擅自变更。')
  } else {
    lines.push('')
    lines.push('【工作模式：由助手决定流程】')
    lines.push('用户会把问题与相关资料交给你，由你规划并执行完整的解决方案。过程中遇到需要用户抉择的分叉点（方案取舍、配置选择、取舍权衡等）时，先向用户说明选项并征询意见，再继续推进。')
  }
  const text = lines.join('\n')
  if (digestCache.size > 64) digestCache.clear()
  digestCache.set(sessionId, { key: cacheKey, text })
  return text
}

/** 注入系统提示词：绑定过项目的会话自动获得项目记忆摘要。 */
function registerSystemPrompt(ctx) {
  ctx.inject(['systemPrompt'], (scope) => {
    try {
      scope.systemPrompt.context({
        name: 'project:memory',
        order: 120,
        text: (context) => {
          try {
            const session = context.agent && context.agent.session
            return session ? projectDigestForSession(session.id) : ''
          } catch {
            return ''
          }
        },
      })
    } catch (error) {
      console.error(`[dsh-project] systemPrompt 注入失败: ${error && error.message ? error.message : error}`)
    }
  })
}

/** 注册 /dsh-project/* REST 路由。 */
function registerRoutes(webServer) {
  webServer.register({
    name: 'dsh-project',
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: async (req, res) => {
      const url = new URL(req.url, 'http://localhost')
      const sub = decodeURIComponent(url.pathname).replace(/^\/dsh-project\/?/, '')
      const parts = sub.split('/').filter(Boolean) // [projects, :id, folders] 等
      try {
        if (req.method === 'GET' && sub === 'projects') {
          const projects = await listProjects()
          const out = []
          for (const p of projects) {
            const memory = await readMemory(p.id)
            out.push({ ...p, memory: memory ? { updatedAt: memory.updatedAt, folderCount: memory.folders.length } : null })
          }
          sendJson(res, 200, { projects: out })
          return
        }
        if (req.method === 'POST' && sub === 'projects') {
          const body = await readJsonBody(req)
          const result = await createProject({
            name: body.name,
            location: body.location,
            workMode: body.workMode,
            workflow: body.workflow,
          })
          sendJson(res, 200, { project: result.project, overview: memoryOverview(result.memory) })
          return
        }
        if (req.method === 'PUT' && parts.length === 3 && parts[0] === 'projects' && parts[2] === 'workflow') {
          const body = await readJsonBody(req)
          const project = await setWorkflow(parts[1], body.workMode, body.workflow)
          sendJson(res, 200, { project: { id: project.id, workMode: project.workMode, workflow: project.workflow, updatedAt: project.updatedAt } })
          return
        }
        if (req.method === 'DELETE' && parts.length === 2 && parts[0] === 'projects') {
          await deleteProject(parts[1])
          sendJson(res, 200, { ok: true })
          return
        }
        if (req.method === 'POST' && parts.length === 3 && parts[0] === 'projects' && parts[2] === 'folders') {
          const body = await readJsonBody(req)
          const result = await addFolder(parts[1], body.path)
          sendJson(res, 200, { ok: true, overview: memoryOverview(result.memory) })
          return
        }
        if (req.method === 'DELETE' && parts.length === 3 && parts[0] === 'projects' && parts[2] === 'folders') {
          const body = await readJsonBody(req)
          const result = await removeFolder(parts[1], body.path)
          sendJson(res, 200, { ok: true, overview: memoryOverview(result.memory) })
          return
        }
        if (req.method === 'POST' && parts.length === 3 && parts[0] === 'projects' && parts[2] === 'rescan') {
          const result = await rescan(parts[1])
          sendJson(res, 200, { ok: true, overview: memoryOverview(result.memory) })
          return
        }
        if (req.method === 'GET' && parts.length === 3 && parts[0] === 'projects' && parts[2] === 'memory') {
          const memory = await readMemory(parts[1])
          sendJson(res, 200, { overview: memoryOverview(memory) })
          return
        }
        if (req.method === 'POST' && sub === 'bind') {
          const body = await readJsonBody(req)
          const result = await bindSession(String(body.sessionId || ''), String(body.projectId || ''))
          sendJson(res, 200, { ok: true, ...result })
          return
        }
        if (req.method === 'DELETE' && parts.length === 2 && parts[0] === 'bind') {
          await unbindSession(parts[1])
          sendJson(res, 200, { ok: true })
          return
        }
        if (req.method === 'GET' && parts.length === 2 && parts[0] === 'bind') {
          // 查询会话绑定的项目（会话头部徽章用）。
          const projectId = syncProjectForSession(parts[1])
          if (!projectId) {
            sendJson(res, 200, { bound: false })
            return
          }
          const project = syncGetProject(projectId)
          sendJson(res, 200, {
            bound: true,
            projectId,
            project: project ? { id: project.id, name: project.name, workMode: project.workMode || 'agent' } : null,
          })
          return
        }
        sendJson(res, 404, { error: `未知路由 ${req.method} ${url.pathname}` })
      } catch (error) {
        sendJson(res, error && error.status ? error.status : 500, {
          error: error && error.message ? error.message : String(error),
        })
      }
    },
  })
}

export function apply(ctx, config = {}) {
  if (config.tool !== false) registerTool(ctx)
  if (config.systemPrompt !== false && typeof ctx.inject === 'function') {
    try {
      registerSystemPrompt(ctx)
    } catch (error) {
      console.error(`[dsh-project] systemPrompt 注册失败: ${error && error.message ? error.message : error}`)
    }
  }
  if (config.routes !== false && typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (scope) => {
      try {
        registerRoutes(scope.webServer)
      } catch (error) {
        console.error(`[dsh-project] REST 路由注册失败: ${error && error.message ? error.message : error}`)
      }
    })
  }
}
