// dsh-project 浏览器端插件：侧边栏「项目」按钮 + 悬浮面板。
// 零构建 lazy-CJS bundle 协议（参考 @liustack/modlens 与 @deepseek-ai/dsh-client-ui-aqua）。
// React 经 require('react') 取得；服务经 exports.inject 声明后在 apply(ctx) 里直接使用。

window.__ModuleLoader__.load({
  id: '@deepseek-ai/dsh-project',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var React = require('react')
    var h = React.createElement

    // ---------------- 面板开/关共享状态（跨两个 slot 条目） ----------------
    var panelOpen = false
    var panelListeners = new Set()
    function setPanelOpen(next) {
      if (panelOpen === next) return
      panelOpen = next
      panelListeners.forEach(function (fn) { fn() })
    }
    function subscribePanel(fn) { panelListeners.add(fn); return function () { panelListeners.delete(fn) } }
    function getPanelSnapshot() { return panelOpen }
    function usePanelOpen() {
      return React.useSyncExternalStore(subscribePanel, getPanelSnapshot, getPanelSnapshot)
    }

    // ---------------- 样式（主题走 dsw 别名变量） ----------------
    var CSS = [
      '.dspj-nav{display:inline-flex;align-items:center;gap:6px;border:none;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);font-size:13px;cursor:pointer;border-radius:8px;padding:4px 10px}',
      '.dspj-nav:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,132,144,.12));color:var(--dsw-alias-label-primary,#111)}',
      '.dspj-nav[aria-pressed="true"]{color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.dspj-panel{position:fixed;top:56px;right:12px;width:336px;max-height:calc(100vh - 84px);overflow:auto;z-index:1000;pointer-events:auto;display:flex;flex-direction:column;gap:10px;background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:14px;box-shadow:var(--dsw-shadow-lv3,0 12px 32px rgba(0,0,0,.18));padding:14px;color:var(--dsw-alias-label-primary,#111);font-size:13px;line-height:1.5}',
      '.dspj-head{display:flex;align-items:center;justify-content:space-between;font-weight:600;font-size:14px}',
      '.dspj-close{border:none;background:transparent;color:var(--dsw-alias-label-tertiary,#9ca3af);cursor:pointer;font-size:16px;line-height:1;padding:2px 6px;border-radius:6px}',
      '.dspj-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,132,144,.12))}',
      '.dspj-create{display:flex;gap:8px}',
      '.dspj-input{flex:1;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-1,#fafafa);color:inherit;border-radius:8px;padding:6px 10px;font-size:13px;outline:none;min-width:0}',
      '.dspj-input:focus{border-color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.dspj-btn{border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-1,#fafafa);color:var(--dsw-alias-label-primary,#111);border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.dspj-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,132,144,.12))}',
      '.dspj-btn:disabled{opacity:.45;cursor:default}',
      '.dspj-btn.primary{background:var(--dsw-alias-state-business-primary,#4d6bfe);border-color:transparent;color:#fff}',
      '.dspj-btn.danger{color:var(--dsw-alias-state-danger-primary,#e5484d)}',
      '.dspj-list{display:flex;flex-direction:column;gap:8px}',
      '.dspj-project{border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:10px;padding:8px 10px}',
      '.dspj-phead{display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer}',
      '.dspj-pname{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dspj-pmeta{color:var(--dsw-alias-label-tertiary,#9ca3af);font-size:11px;margin-top:2px}',
      '.dspj-pbody{margin-top:8px;display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);padding-top:8px}',
      '.dspj-actions{display:flex;flex-wrap:wrap;gap:6px}',
      '.dspj-folder{display:flex;align-items:center;gap:6px;justify-content:space-between;background:var(--dsw-alias-bg-layer-1,#fafafa);border-radius:8px;padding:5px 8px}',
      '.dspj-fpath{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;direction:rtl;text-align:left}',
      '.dspj-fkind{color:var(--dsw-alias-label-tertiary,#9ca3af);font-size:11px;flex:none}',
      '.dspj-error{color:var(--dsw-alias-state-danger-primary,#e5484d);font-size:12px}',
      '.dspj-empty{color:var(--dsw-alias-label-tertiary,#9ca3af);font-size:12px;text-align:center;padding:8px 0}',
      '.dspj-form{display:flex;flex-direction:column;gap:8px;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:10px;padding:10px}',
      '.dspj-frow{display:flex;gap:8px;align-items:center}',
      '.dspj-lbl{font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280)}',
      '.dspj-lbl b{color:var(--dsw-alias-label-primary,#111)}',
      '.dspj-radio{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-primary,#111);cursor:pointer}',
      '.dspj-ta{width:100%;min-height:88px;resize:vertical;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-1,#fafafa);color:inherit;border-radius:8px;padding:6px 10px;font-size:12px;outline:none;font-family:inherit}',
      '.dspj-ta:focus{border-color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.dspj-mode{font-size:11px;color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.dspj-badge{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-1,#fafafa);color:var(--dsw-alias-state-business-primary,#4d6bfe);font-size:12px;line-height:1.4;border-radius:999px;padding:2px 10px;cursor:pointer;white-space:nowrap}',
      '.dspj-badge:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,132,144,.12))}',
    ].join('')
    var CSS_TAG_ID = '@deepseek-ai/dsh-project/client.css'
    function ensureCss() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-plugin-css="' + CSS_TAG_ID + '"]')) return
      var tag = document.createElement('style')
      tag.dataset.plugin = '@deepseek-ai/dsh-project'
      tag.dataset.pluginCss = CSS_TAG_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    // ---------------- REST 封装 ----------------
    function request(method, url, body) {
      var opts = { method: method, headers: {} }
      if (body !== undefined) {
        opts.headers['content-type'] = 'application/json'
        opts.body = JSON.stringify(body)
      }
      return fetch(url, opts).then(function (res) {
        return res.json().catch(function () { return {} }).then(function (json) {
          if (!res.ok) {
            var err = new Error(json.error || (res.status + ' ' + res.statusText))
            err.status = res.status
            throw err
          }
          return json
        })
      })
    }

    function errText(e) {
      return String(e && e.message ? e.message : e)
    }

    // ---------------- 目录选择桥 ----------------
    // 桌面端（deep seek ZYB）里应用运行在 iframe 中：优先 postMessage 到启动页，
    // 由 Electron 主进程弹原生目录对话框（dsh 自带的 koffi 选择器在 Electron
    // 的 Node 运行时下读结果会 N-API 崩溃）。非 iframe 环境退回 dsh 自带的
    // pickDirectory；再失败则由调用方退化为手动输入路径。
    var pickSeq = 0
    var pickWaiters = {}

    function pickFolderViaBridge() {
      if (typeof window === 'undefined' || !window.parent || window.parent === window) return null
      return new Promise(function (resolve) {
        var id = 'pick-' + (++pickSeq) + '-' + Date.now()
        var timeout = setTimeout(function () { delete pickWaiters[id]; resolve(null) }, 30000)
        pickWaiters[id] = function (result) {
          clearTimeout(timeout)
          resolve(result && result.path ? result.path : null)
        }
        try {
          window.parent.postMessage({ type: 'dsh-project:pick-folder', id: id }, '*')
        } catch {
          clearTimeout(timeout)
          delete pickWaiters[id]
          resolve(null)
        }
      })
    }

    function pickFolder() {
      return Promise.resolve()
        .then(function () { return pickFolderViaBridge() })
        .then(function (path) {
          if (path !== null) return path
          return ctx.workspaces.pickDirectory().then(function (p) { return p || null })
        })
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('message', function (event) {
        var data = event.data
        if (!data || data.type !== 'dsh-project:pick-folder-result') return
        var waiter = pickWaiters[data.id]
        if (waiter) {
          delete pickWaiters[data.id]
          waiter(data.result)
        }
      })
    }

    // ---------------- 侧边栏「项目」按钮 ----------------
    function ProjectNavButton(props) {
      var open = usePanelOpen()
      var wide = props && props.wide
      return h('button', {
        type: 'button',
        className: 'dspj-nav',
        title: '项目',
        'aria-pressed': open,
        onClick: function () { setPanelOpen(!open) },
      }, wide ? '项目' : '项')
    }

    // ---------------- 会话头部「项目」徽章 ----------------
    // 注册在 conversation.session.header.actions（additive）；当前会话绑定过项目时
    // 在对话上方显示「项目 · 名称」，点击打开项目面板。
    function ProjectBadge(props) {
      var sessionId = props.sessionId
      var st = React.useState(null)
      var info = st[0]
      var setInfo = st[1]
      React.useEffect(function () {
        var alive = true
        var retryTimer = null
        setInfo(null)
        function fetchBinding(attempt) {
          if (!sessionId) return
          request('GET', '/dsh-project/bind/' + encodeURIComponent(sessionId)).then(function (json) {
            if (!alive) return
            if (json.bound && json.project) {
              setInfo(json.project)
            } else if (attempt === 0) {
              // 首次查询未绑定：绑定可能刚落盘，稍后重试一次。
              retryTimer = setTimeout(function () { fetchBinding(1) }, 600)
            }
          }).catch(function () { /* 未绑定或查询失败都不显示 */ })
        }
        fetchBinding(0)
        return function () {
          alive = false
          if (retryTimer) clearTimeout(retryTimer)
        }
      }, [sessionId])
      if (!info) return null
      return h('button', {
        type: 'button',
        className: 'dspj-badge',
        title: '当前会话绑定到项目「' + info.name + '」，点击打开项目面板',
        onClick: function () { setPanelOpen(true) },
      }, '项目 · ' + info.name)
    }

    // ---------------- 悬浮面板 ----------------
    function ProjectPanel(props) {
      var ctx = props.ctx
      var open = usePanelOpen()

      var state = React.useState(null)
      var projects = state[0]
      var setProjects = state[1]
      var errState = React.useState('')
      var error = errState[0]
      var setError = errState[1]
      var nameState = React.useState('')
      var name = nameState[0]
      var setName = nameState[1]
      var busyState = React.useState(false)
      var busy = busyState[0]
      var setBusy = busyState[1]
      var expandedState = React.useState({})
      var expanded = expandedState[0]
      var setExpanded = expandedState[1]
      var detailsState = React.useState({}) // projectId -> overview
      var details = detailsState[0]
      var setDetails = detailsState[1]
      var manualState = React.useState({}) // projectId -> true（手动输入路径模式）
      var manual = manualState[0]
      var setManual = manualState[1]
      var pathTextState = React.useState({}) // projectId -> 手动路径文本
      var pathText = pathTextState[0]
      var setPathText = pathTextState[1]
      var locationState = React.useState('') // 创建位置（父目录）
      var location = locationState[0]
      var setLocation = locationState[1]
      var modeState = React.useState('agent') // 'agent' | 'custom'
      var workMode = modeState[0]
      var setWorkMode = modeState[1]
      var workflowState = React.useState('') // 自定义工作流文本
      var workflow = workflowState[0]
      var setWorkflow = workflowState[1]
      var editWfState = React.useState({}) // projectId -> true（编辑工作流模式）
      var editWf = editWfState[0]
      var setEditWf = editWfState[1]
      var editWfModeState = React.useState({}) // projectId -> 'agent'|'custom'
      var editWfMode = editWfModeState[0]
      var setEditWfMode = editWfModeState[1]
      var editWfTextState = React.useState({}) // projectId -> 文本
      var editWfText = editWfTextState[0]
      var setEditWfText = editWfTextState[1]

      function reload() {
        request('GET', '/dsh-project/projects').then(function (json) {
          setProjects(json.projects || [])
          setError('')
        }).catch(function (e) { setError(errText(e)) })
      }

      React.useEffect(function () {
        if (open) reload()
      }, [open])

      function withBusy(fn) {
        return function () {
          setBusy(true)
          setError('')
          Promise.resolve().then(fn).then(function () { reload() }).catch(function (e) { setError(errText(e)) }).then(function () { setBusy(false) })
        }
      }

      function createProject() {
        var n = (name || '').trim()
        if (!n) { setError('请输入项目名称'); return }
        var loc = (location || '').trim()
        if (!loc) { setError('请选择或输入创建位置'); return }
        var wf = (workflow || '').trim()
        if (workMode === 'custom' && !wf) { setError('自定义工作流模式下，请填写工作流步骤'); return }
        withBusy(function () {
          return request('POST', '/dsh-project/projects', { name: n, location: loc, workMode: workMode, workflow: wf }).then(function (res) {
            if (res && res.overview) {
              var d = {}
              for (var kc in details) d[kc] = details[kc]
              d[res.project.id] = res.overview
              setDetails(d)
            }
            setName('')
            setLocation('')
            setWorkflow('')
            setWorkMode('agent')
          })
        })()
      }

      function pickLocation() {
        setError('')
        pickFolder().then(function (p) {
          if (p) { setLocation(p); return }
          setError('未能取得文件夹位置，请直接输入位置路径')
        }).catch(function (e) {
          setError('选择器不可用：' + errText(e) + '（请直接输入位置路径）')
        })
      }

      function saveWorkflow(id) {
        var wf = (editWfText[id] || '').trim()
        var mode = editWfMode[id] === 'custom' ? 'custom' : 'agent'
        if (mode === 'custom' && !wf) { setError('自定义工作流模式下，请填写工作流步骤'); return }
        withBusy(function () {
          return request('PUT', '/dsh-project/projects/' + encodeURIComponent(id) + '/workflow', { workMode: mode, workflow: wf }).then(function () {
            var e = {}
            for (var ke in editWf) e[ke] = editWf[ke]
            e[id] = false
            setEditWf(e)
          })
        })()
      }

      function deleteProject(id) {
        withBusy(function () { return request('DELETE', '/dsh-project/projects/' + encodeURIComponent(id)) })()
      }

      function toggleExpand(id) {
        var next = {}
        for (var k in expanded) next[k] = expanded[k]
        next[id] = !expanded[id]
        setExpanded(next)
        if (next[id] && !details[id]) {
          request('GET', '/dsh-project/projects/' + encodeURIComponent(id) + '/memory').then(function (json) {
            var d = {}
            for (var k2 in details) d[k2] = details[k2]
            d[id] = json.overview
            setDetails(d)
          }).catch(function () { /* 概览加载失败不致命 */ })
        }
      }

      function addFolder(id) {
        withBusy(function () {
          return Promise.resolve()
            .then(function () { return pickFolder() })
            .then(function (path) {
              if (path === null || path === undefined || path === '') return null
              return request('POST', '/dsh-project/projects/' + encodeURIComponent(id) + '/folders', { path: path })
            })
            .then(function (res) {
              if (res && res.overview) {
                var d = {}
                for (var k3 in details) d[k3] = details[k3]
                d[id] = res.overview
                setDetails(d)
              }
            })
            .catch(function (e) {
              // 选择器不可用或出错 → 退化为手动输入路径。
              var m = {}
              for (var k4 in manual) m[k4] = manual[k4]
              m[id] = true
              setManual(m)
              if (!/取消|cancel/i.test(errText(e))) setError('选择器不可用：' + errText(e) + '（请手动输入文件夹路径）')
            })
        })()
      }

      function confirmManualFolder(id) {
        var p = (pathText[id] || '').trim()
        if (!p) { setError('请输入文件夹路径'); return }
        withBusy(function () {
          return request('POST', '/dsh-project/projects/' + encodeURIComponent(id) + '/folders', { path: p }).then(function (res) {
            var d = {}
            for (var k5 in details) d[k5] = details[k5]
            d[id] = res.overview
            setDetails(d)
            var m = {}
            for (var k6 in manual) m[k6] = manual[k6]
            m[id] = false
            setManual(m)
          })
        })()
      }

      function removeFolder(id, path) {
        withBusy(function () {
          return request('DELETE', '/dsh-project/projects/' + encodeURIComponent(id) + '/folders', { path: path }).then(function (res) {
            var d = {}
            for (var k7 in details) d[k7] = details[k7]
            d[id] = res.overview
            setDetails(d)
          })
        })()
      }

      function rescanProject(id) {
        withBusy(function () {
          return request('POST', '/dsh-project/projects/' + encodeURIComponent(id) + '/rescan', {}).then(function (res) {
            var d = {}
            for (var k8 in details) d[k8] = details[k8]
            d[id] = res.overview
            setDetails(d)
          })
        })()
      }

      function startConversation(id) {
        setBusy(true)
        setError('')
        var workspaces = ctx.workspaces
        var sessions = ctx.sessions
        try {
          var ws = workspaces.list.getSnapshot()
          var cur = sessions.list.getSnapshot().current
          var curWs = cur === void 0 ? void 0 : (ws.items.find(function (it) { return it.sessionIds.indexOf(cur) !== -1 }) || {}).workspaceId
          var target = curWs !== void 0 ? curWs : ws.recentWorkspaceId
          if (target === void 0) {
            sessions.clear()
            setBusy(false)
            setError('当前没有可用工作区，无法开始对话')
            return
          }
          workspaces.connectWorkspace(target).then(function (sessionId) {
            // 先绑定再打开：会话头部徽章挂载时查询绑定，必须先落盘避免竞态。
            return request('POST', '/dsh-project/bind', { sessionId: sessionId, projectId: id }).then(function () {
              sessions.open(sessionId)
            })
          }).then(function () {
            setBusy(false)
            setPanelOpen(false)
          }).catch(function (e) {
            setBusy(false)
            setError(errText(e))
          })
        } catch (e) {
          setBusy(false)
          setError(errText(e))
        }
      }

      if (!open) return null

      function projectRow(p) {
        var isExpanded = !!expanded[p.id]
        var detail = details[p.id]
        var folderCount = detail && detail.folders ? detail.folders.length : (p.memory && p.memory.folderCount ? p.memory.folderCount : 0)
        var mode = p.workMode === 'custom' ? 'custom' : 'agent'
        var wfEditing = !!editWf[p.id]
        return h('div', { key: p.id, className: 'dspj-project' },
          h('div', { className: 'dspj-phead', onClick: function () { toggleExpand(p.id) } },
            h('div', null,
              h('div', { className: 'dspj-pname' }, p.name),
              h('div', { className: 'dspj-pmeta' },
                folderCount + ' 个文件夹' + (p.memory ? ' · 记忆 ' + (p.memory.updatedAt || '').slice(5, 16).replace('T', ' ') : ' · 尚未学习')
              )
            ),
            h('span', null, isExpanded ? '▾' : '▸')
          ),
          isExpanded ? h('div', { className: 'dspj-pbody' },
            h('div', { className: 'dspj-actions' },
              h('button', { type: 'button', className: 'dspj-btn primary', disabled: busy, onClick: function () { startConversation(p.id) } }, '开始对话'),
              h('button', { type: 'button', className: 'dspj-btn', disabled: busy, onClick: function () { addFolder(p.id) } }, '添加文件夹'),
              h('button', { type: 'button', className: 'dspj-btn', disabled: busy, onClick: function () { rescanProject(p.id) } }, '重新学习'),
              h('button', { type: 'button', className: 'dspj-btn', disabled: busy, onClick: function () { deleteProject(p.id) } }, '删除')
            ),
            h('div', { className: 'dspj-mode' },
              mode === 'custom' ? '工作方式：自定义工作流' : '工作方式：由你决定流程'
            ),
            wfEditing ? h('div', { className: 'dspj-form' },
              h('label', { className: 'dspj-radio' },
                h('input', {
                  type: 'radio',
                  name: 'wf-mode-' + p.id,
                  checked: (editWfMode[p.id] || 'agent') === 'agent',
                  onChange: function () {
                    var m = {}
                    for (var km in editWfMode) m[km] = editWfMode[km]
                    m[p.id] = 'agent'
                    setEditWfMode(m)
                  },
                }),
                '由你决定流程（遇到选择会问我）'
              ),
              h('label', { className: 'dspj-radio' },
                h('input', {
                  type: 'radio',
                  name: 'wf-mode-' + p.id,
                  checked: editWfMode[p.id] === 'custom',
                  onChange: function () {
                    var m2 = {}
                    for (var km2 in editWfMode) m2[km2] = editWfMode[km2]
                    m2[p.id] = 'custom'
                    setEditWfMode(m2)
                  },
                }),
                '自定义工作流（我先验证可行性，按你设定的步骤执行）'
              ),
              editWfMode[p.id] === 'custom' ? h('textarea', {
                className: 'dspj-ta',
                placeholder: '每行一个步骤，例如：\n1. 阅读项目文档\n2. 制定方案\n3. 实现并测试',
                value: editWfText[p.id] || '',
                onChange: function (ev) {
                  var t = {}
                  for (var kt in editWfText) t[kt] = editWfText[kt]
                  t[p.id] = ev.target.value
                  setEditWfText(t)
                },
              }) : null,
              h('div', { className: 'dspj-actions' },
                h('button', { type: 'button', className: 'dspj-btn primary', disabled: busy, onClick: function () { saveWorkflow(p.id) } }, '保存工作方式'),
                h('button', {
                  type: 'button', className: 'dspj-btn', disabled: busy,
                  onClick: function () {
                    var e = {}
                    for (var ke2 in editWf) e[ke2] = editWf[ke2]
                    e[p.id] = false
                    setEditWf(e)
                  },
                }, '取消')
              )
            ) : h('div', { className: 'dspj-actions' },
              mode === 'custom' && p.workflow ? h('div', { className: 'dspj-fkind', style: { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, p.workflow) : null,
              h('button', {
                type: 'button', className: 'dspj-btn', disabled: busy,
                onClick: function () {
                  var e2 = {}
                  for (var ke3 in editWf) e2[ke3] = editWf[ke3]
                  e2[p.id] = true
                  setEditWf(e2)
                  var m3 = {}
                  for (var km3 in editWfMode) m3[km3] = editWfMode[km3]
                  m3[p.id] = mode
                  setEditWfMode(m3)
                  var t2 = {}
                  for (var kt2 in editWfText) t2[kt2] = editWfText[kt2]
                  t2[p.id] = p.workflow || ''
                  setEditWfText(t2)
                },
              }, '编辑工作方式')
            ),
            manual[p.id] ? h('div', { className: 'dspj-create' },
              h('input', {
                className: 'dspj-input',
                placeholder: '文件夹绝对路径，例如 D:\\我的项目',
                value: pathText[p.id] || '',
                onChange: function (ev) {
                  var t = {}
                  for (var k9 in pathText) t[k9] = pathText[k9]
                  t[p.id] = ev.target.value
                  setPathText(t)
                },
              }),
              h('button', { type: 'button', className: 'dspj-btn', disabled: busy, onClick: function () { confirmManualFolder(p.id) } }, '确定')
            ) : null,
            detail && detail.folders && detail.folders.length > 0 ? h('div', { className: 'dspj-list' },
              detail.folders.map(function (f) {
                return h('div', { key: f.path, className: 'dspj-folder' },
                  h('div', { className: 'dspj-fpath', title: f.path }, f.path),
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flex: 'none' } },
                    h('span', { className: 'dspj-fkind' }, (f.kind || '') + ' · ' + (f.fileCount || 0) + ' 文件'),
                    h('button', { type: 'button', className: 'dspj-btn danger', disabled: busy, title: '移除文件夹', onClick: function () { removeFolder(p.id, f.path) } }, '移除')
                  )
                )
              })
            ) : null
          ) : null
        )
      }

      return h('div', { className: 'dspj-panel' },
        h('div', { className: 'dspj-head' },
          h('span', null, '项目'),
          h('button', { type: 'button', className: 'dspj-close', title: '关闭', onClick: function () { setPanelOpen(false) } }, '×')
        ),
        h('div', { className: 'dspj-form' },
          h('label', { className: 'dspj-lbl' }, h('b', null, '新建项目：')),
          h('input', {
            className: 'dspj-input',
            placeholder: '项目名称（将作为文件夹名）',
            value: name,
            onChange: function (ev) { setName(ev.target.value) },
            onKeyDown: function (ev) { if (ev.key === 'Enter') createProject() },
          }),
          h('div', { className: 'dspj-frow' },
            h('input', {
              className: 'dspj-input',
              placeholder: '创建位置（文件夹的父目录）',
              value: location,
              onChange: function (ev) { setLocation(ev.target.value) },
            }),
            h('button', { type: 'button', className: 'dspj-btn', disabled: busy, onClick: pickLocation }, '选择位置')
          ),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
            h('label', { className: 'dspj-radio' },
              h('input', { type: 'radio', name: 'wf-create', checked: workMode === 'agent', onChange: function () { setWorkMode('agent') } }),
              '由你决定流程（遇到选择会问我）'
            ),
            h('label', { className: 'dspj-radio' },
              h('input', { type: 'radio', name: 'wf-create', checked: workMode === 'custom', onChange: function () { setWorkMode('custom') } }),
              '自定义工作流（我先验证可行性，按你设定的步骤执行）'
            ),
            workMode === 'custom' ? h('textarea', {
              className: 'dspj-ta',
              placeholder: '每行一个步骤，例如：\n1. 阅读项目文档\n2. 制定方案\n3. 实现并测试',
              value: workflow,
              onChange: function (ev) { setWorkflow(ev.target.value) },
            }) : null
          ),
          h('div', { className: 'dspj-actions' },
            h('button', { type: 'button', className: 'dspj-btn primary', disabled: busy, onClick: createProject }, '创建项目')
          )
        ),
        error ? h('div', { className: 'dspj-error' }, error) : null,
        busy ? h('div', { className: 'dspj-empty' }, '处理中…') : null,
        projects === null ? h('div', { className: 'dspj-empty' }, '加载中…') :
          projects.length === 0 ? h('div', { className: 'dspj-empty' }, '还没有项目。上面的表单里填好名称和位置，点击「创建项目」。') :
            h('div', { className: 'dspj-list' }, projects.map(projectRow))
      )
    }

    // ---------------- apply ----------------
    function apply(ctx) {
      ensureCss()
      ctx.slots.inject('sidebar.footer.action', function () {
        return ctx.slots.register(
          { name: 'sidebar.footer.action', id: 'dsh-project-nav', order: 100, label: '项目' },
          ProjectNavButton,
        )
      })
      // 会话头部徽章：负 order 供静态会话上下文，排在交互操作之前。
      ctx.slots.inject('conversation.session.header.actions', function () {
        return ctx.slots.register(
          { name: 'conversation.session.header.actions', id: 'dsh-project-badge', order: -10, label: '项目' },
          ProjectBadge,
        )
      })
      ctx.slots.inject('shell.overlay', function () {
        return ctx.slots.register(
          { name: 'shell.overlay', id: 'dsh-project-panel', order: 100, label: '项目' },
          function (props) { return h(ProjectPanel, { ctx: ctx }) },
        )
      })
    }

    exports.apply = apply
    exports.inject = ['slots', 'workspaces', 'sessions']
    return module.exports
  },
})
