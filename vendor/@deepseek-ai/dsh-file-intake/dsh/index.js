// dsh-file-intake 宿主插件：接收非图片文件，落盘到 $DSH_HOME/file-intake/。
// PDF 自动用 pdfjs-dist 提取文本并存 <name>.txt；文本类文件原样保存。
// 参考 modlens 的 webServer 路由注册范式。

import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const name = 'dsh-file-intake'
export const inject = []

const MAX_BYTES = 100 * 1024 * 1024
const MAX_PAGES = 300
const MAX_TEXT = 2 * 1024 * 1024

const TEXT_EXTS = new Set([
  '.txt', '.md', '.markdown', '.json', '.jsonl', '.csv', '.tsv', '.log',
  '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.xml', '.html', '.htm',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.css', '.scss', '.less',
  '.py', '.rs', '.go', '.java', '.c', '.h', '.cpp', '.hpp', '.cs', '.rb',
  '.php', '.sh', '.bat', '.ps1', '.sql', '.vue', '.svelte', '.env', '.gitignore',
])

function homeDir() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

function intakeDir() {
  return path.join(homeDir(), 'file-intake')
}

/** 文件名净化 + 时间戳前缀，避免覆盖与路径穿越。 */
function safeName(raw) {
  const base = path.basename(String(raw || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')).slice(0, 120) || 'file'
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\..+$/, '')
  return `${stamp}-${base}`
}

/** 用 pdfjs-dist 提取 PDF 文本（Node 环境，无 worker）。 */
async function extractPdfText(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
  }).promise
  const parts = []
  try {
    const pages = Math.min(doc.numPages, MAX_PAGES)
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      let lastY = null
      for (const item of content.items) {
        if (typeof item.str !== 'string' || !item.str.trim()) continue
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 2) parts.push('\n')
        parts.push(item.str)
        if (item.hasEOL) parts.push('\n')
        lastY = item.transform[5]
      }
      parts.push('\n\n')
      if (parts.join('').length > MAX_TEXT) break
    }
  } finally {
    await doc.destroy().catch(() => {})
  }
  const text = parts.join('').slice(0, MAX_TEXT)
  if (!text.trim()) throw new Error('未能从 PDF 中提取到文本（可能是扫描件/图片型 PDF）')
  return text
}

async function readBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BYTES) {
      const err = new Error(`文件超过 ${Math.round(MAX_BYTES / 1024 / 1024)}MB 上限`)
      err.status = 413
      throw err
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

function registerRoutes(webServer) {
  webServer.register({
    name: 'dsh-file-intake',
    kind: 'prefix',
    path: '/dsh-file',
    handler: async (req, res) => {
      const url = new URL(req.url, 'http://localhost')
      try {
        if (req.method !== 'POST' || url.pathname !== '/dsh-file/upload') {
          sendJson(res, 404, { error: `未知路由 ${req.method} ${url.pathname}` })
          return
        }
        const name = decodeURIComponent(url.searchParams.get('name') || req.headers['x-file-name'] || 'file')
        const buffer = await readBody(req)
        if (buffer.length === 0) {
          sendJson(res, 400, { error: '文件为空' })
          return
        }
        const finalName = safeName(name)
        const filePath = path.join(intakeDir(), finalName)
        await fsp.mkdir(intakeDir(), { recursive: true })
        await fsp.writeFile(filePath, buffer)

        const ext = path.extname(finalName).toLowerCase()
        let kind = 'binary'
        let textPath = null
        if (ext === '.pdf') {
          try {
            const text = await extractPdfText(buffer)
            textPath = filePath + '.txt'
            await fsp.writeFile(textPath, text, 'utf8')
            kind = 'pdf'
          } catch (error) {
            // 提取失败仍保留原文件，kind 标为 pdf-no-text。
            kind = 'pdf-no-text'
            sendJson(res, 200, {
              path: filePath,
              textPath: null,
              kind,
              size: buffer.length,
              warning: error && error.message ? error.message : String(error),
            })
            return
          }
        } else if (TEXT_EXTS.has(ext) || ext === '') {
          kind = 'text'
        }
        sendJson(res, 200, { path: filePath, textPath, kind, size: buffer.length })
      } catch (error) {
        sendJson(res, error && error.status ? error.status : 500, {
          error: error && error.message ? error.message : String(error),
        })
      }
    },
  })
}

export function apply(ctx, config = {}) {
  if (config.routes !== false && typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (scope) => {
      try {
        registerRoutes(scope.webServer)
      } catch (error) {
        console.error(`[dsh-file-intake] 路由注册失败: ${error && error.message ? error.message : error}`)
      }
    })
  }
}
