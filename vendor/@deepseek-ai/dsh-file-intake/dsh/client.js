// dsh-file-intake 浏览器端：拦截粘贴/拖入的非图片文件，上传到宿主并
// 把文件路径（PDF 含提取出的文本路径）写入输入框，供模型用 read 工具读取。
// 图片文件一律不拦：粘贴留给 modlens、拖拽留给原生的图片管线。

window.__ModuleLoader__.load({
  id: '@deepseek-ai/dsh-file-intake',
  factory: () => {
    var module = { exports: {} }
    var exports = module.exports

    var MAX_BYTES = 100 * 1024 * 1024

    function nonImageFilesOf(list) {
      if (!list || typeof list.length !== 'number') return []
      var files = []
      for (var i = 0; i < list.length; i++) {
        var item = list[i]
        var file = null
        if (item && typeof item.getAsFile === 'function') {
          file = item.getAsFile()
        } else if (item instanceof File) {
          file = item
        }
        if (file && !/^image\//.test(file.type || '')) files.push(file)
      }
      return files
    }

    function uploadOne(file) {
      var url = '/dsh-file/upload?name=' + encodeURIComponent(file.name || 'file')
      return file.arrayBuffer().then(function (buffer) {
        return fetch(url, { method: 'POST', headers: { 'x-file-name': encodeURIComponent(file.name || 'file') }, body: buffer }).then(function (res) {
          return res.json().catch(function () { return {} }).then(function (json) {
            if (!res.ok) {
              var error = new Error(json.error || ('file upload failed (' + res.status + ')'))
              error.status = res.status
              throw error
            }
            return json
          })
        })
      })
    }

    function insertText(target, text) {
      var el = target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable) ? target : document.activeElement
      if (!el) return
      var isField = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT'
      var isContent = !isField && el.isContentEditable === true
      if (!isField && !isContent) return
      el.focus()
      var inserted = false
      try {
        inserted = document.execCommand('insertText', false, text)
      } catch {
        inserted = false
      }
      if (!inserted) {
        if (isField) {
          var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
          var setter = Object.getOwnPropertyDescriptor(proto, 'value').set
          setter.call(el, el.value + text)
          el.dispatchEvent(new Event('input', { bubbles: true }))
        } else {
          el.textContent = (el.textContent || '') + text
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
        }
      }
    }

    function handleFiles(files, event, isPaste) {
      var list = nonImageFilesOf(files)
      if (list.length === 0) return
      // 只接管非图片文件；图片走 modlens/原生管线。
      if (event.cancelable) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
      var target = event.target
      Promise.all(list.map(uploadOne)).then(function (results) {
        var parts = []
        for (var i = 0; i < results.length; i++) {
          var r = results[i]
          parts.push(r.path)
          if (r.textPath) parts.push(r.textPath)
          if (r.kind === 'pdf-no-text' && r.warning) parts.push('（PDF 文本提取失败：' + r.warning + '）')
        }
        var text = parts.filter(Boolean).join(' ')
        if (text) insertText(target, text + ' ')
      }).catch(function (error) {
        console.error('[dsh-file-intake] upload failed: ' + (error && error.message ? error.message : error))
      })
    }

    /** 原生拖拽遮罩（“图片拖动到此处即可添加”）靠它自己的 drop/dragend 处理器复位；
     *  我们拦截了 drop（stopImmediatePropagation 会阻断原生收尾），
     *  所以要合成一个 dragend 让遮罩关闭，避免遮罩卡住盖住整个界面。 */
    function dismissNativeDragOverlay() {
      try {
        if (typeof window.DragEvent === 'function') window.dispatchEvent(new window.DragEvent('dragend'))
        else window.dispatchEvent(new Event('dragend'))
      } catch {
        try { window.dispatchEvent(new Event('dragend')) } catch { /* 忽略 */ }
      }
    }

    function onPaste(event) {
      try {
        var files = event.clipboardData && event.clipboardData.items ? nonImageFilesOf(event.clipboardData.items) : []
        if (files.length === 0) return
        handleFiles(files, event, true)
      } catch {
        /* 忽略 */
      }
    }

    function onDrop(event) {
      try {
        var files = event.dataTransfer && event.dataTransfer.files ? nonImageFilesOf(event.dataTransfer.files) : []
        if (files.length === 0) return
        handleFiles(files, event, false)
        dismissNativeDragOverlay()
      } catch {
        /* 忽略 */
      }
    }

    function apply(ctx) {
      document.addEventListener('paste', onPaste, true)
      document.addEventListener('drop', onDrop, true)
      if (typeof ctx.effect === 'function') {
        ctx.effect(function () {
          return function () {
            document.removeEventListener('paste', onPaste, true)
            document.removeEventListener('drop', onDrop, true)
          }
        }, 'dsh-file-intake: paste/drop listeners')
      }
    }

    exports.apply = apply
    exports.inject = []
    return module.exports
  },
})
