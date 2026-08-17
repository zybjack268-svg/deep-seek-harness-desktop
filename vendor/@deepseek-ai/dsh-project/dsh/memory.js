// 项目记忆构建器：把扫描结果整理成 memory.json（结构化）+ memory.md（给模型读的摘要）。
// 零依赖，纯函数。

function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** 从文件夹列表（每个元素是 scanFolder 的返回）构建项目记忆对象。 */
export function buildMemory(project, folders) {
  return {
    version: 1,
    project: { id: project.id, name: project.name },
    updatedAt: new Date().toISOString(),
    folders: folders.map((f) => ({
      path: f.path,
      kind: f.kind,
      fileCount: f.fileCount,
      totalBytes: f.totalBytes,
      skippedDirs: f.skippedDirs,
      skippedFiles: f.skippedFiles,
      scannedAt: f.scannedAt,
      docs: f.docs,
      samples: f.samples,
      tree: f.tree,
    })),
  }
}

/**
 * 生成给模型阅读的记忆摘要（Markdown）。
 * 该文本会作为项目对话的上下文/记忆体，帮助助手在对话中利用文件夹资源。
 */
export function renderMemoryMd(memory) {
  const lines = []
  const { project, folders } = memory
  lines.push(`# 项目记忆：${project.name}`)
  lines.push(`项目 ID：${project.id}`)
  lines.push(`更新时间：${memory.updatedAt}`)
  lines.push('')
  lines.push('> 本文件是该项目所有已添加文件夹的「学习摘要」，记忆范围仅限于该项目。')
  lines.push('> 需要看完整内容时，请用 read/glob/grep 工具直接读取对应文件夹里的文件；')
  lines.push('> 这些文件夹对你只读，修改文件请先征得用户同意。')
  lines.push('')
  for (const folder of folders) {
    lines.push(`## 文件夹：${folder.path}`)
    lines.push('')
    lines.push(`- 类型：${folder.kind}`)
    lines.push(`- 规模：${folder.fileCount} 个文件 / ${formatBytes(folder.totalBytes)}`)
    lines.push(`- 扫描时间：${folder.scannedAt}`)
    if (folder.skippedDirs > 0 || folder.skippedFiles > 0) {
      lines.push(`- 已跳过：${folder.skippedDirs} 个目录（node_modules 等）、${folder.skippedFiles} 个文件（锁文件等）`)
    }
    lines.push('')
    if (folder.docs.length > 0) {
      lines.push('### 关键文档')
      lines.push('')
      for (const doc of folder.docs) {
        lines.push(`#### ${doc.rel}${doc.truncated ? '（摘录，已截断）' : ''}`)
        lines.push('')
        lines.push('```')
        lines.push(doc.excerpt)
        lines.push('```')
        lines.push('')
      }
    }
    if (folder.tree.length > 0) {
      lines.push('### 文件结构')
      lines.push('')
      lines.push('```')
      for (const item of folder.tree) {
        lines.push(`${item.rel}\t${formatBytes(item.size)}`)
      }
      lines.push('```')
      lines.push('')
    }
    if (folder.samples.length > 0) {
      lines.push('### 其他文件摘录')
      lines.push('')
      for (const sample of folder.samples) {
        lines.push(`#### ${sample.rel}${sample.truncated ? '（头部摘录）' : ''}`)
        lines.push('')
        lines.push('```')
        lines.push(sample.head)
        lines.push('```')
        lines.push('')
      }
    }
  }
  return lines.join('\n')
}
