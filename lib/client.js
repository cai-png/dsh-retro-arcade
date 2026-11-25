/**
 * dsh-arcade — client half
 *
 * Adds a floating launcher at the bottom-right of the page. Clicking it opens
 * the arcade page served by the Host half at /dsh-arcade/index.html inside a
 * full-screen iframe. The page posts "dsh-arcade:close" (Esc / 关闭按钮) and the
 * launcher tears the frame down again.
 */
window.__ModuleLoader__.load({
  id: 'dsh-retro-arcade',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var BTN_ID = 'dsh-arcade-launch'
    var FRAME_ID = 'dsh-arcade-frame'
    var TAB_ID = 'dsh-arcade-close-tab'
    var STYLE_ID = 'dsh-arcade-style'
    var observer = null

    var STYLE = [
      '#' + BTN_ID + '{position:fixed;right:18px;bottom:18px;z-index:2147482000;',
      'display:flex;align-items:center;gap:7px;padding:9px 13px 9px 11px;',
      'border-radius:12px;border:1px solid rgba(255,210,74,.45);',
      'background:linear-gradient(160deg,#1b1d33,#0f1020);color:#ffd24a;',
      'font:600 12px/1 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;',
      'letter-spacing:.04em;cursor:pointer;opacity:.9;user-select:none;',
      'box-shadow:0 6px 22px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08);',
      'transition:opacity .15s ease,transform .15s ease,box-shadow .15s ease}',
      '#' + BTN_ID + ':hover{opacity:1;transform:translateY(-1px);',
      'box-shadow:0 10px 26px rgba(0,0,0,.55),0 0 0 1px rgba(255,210,74,.35)}',
      '#' + BTN_ID + ':active{transform:translateY(0) scale(.98)}',
      '#' + BTN_ID + ' svg{display:block;flex:0 0 auto}',
      '#' + BTN_ID + ' .lbl{white-space:nowrap}',
      '#' + FRAME_ID + '{position:fixed;inset:0;width:100vw;height:100vh;border:0;',
      'z-index:2147483000;background:#07070d;opacity:0;transition:opacity .18s ease}',
      '#' + FRAME_ID + '.on{opacity:1}',
      '#' + TAB_ID + '{position:fixed;right:0;top:50%;transform:translateY(-50%);',
      'width:26px;height:72px;padding:0;border-radius:10px 0 0 10px;',
      'border:1px solid rgba(255,210,74,.4);border-right:0;',
      'background:rgba(20,22,36,.94);color:#ffd24a;font:600 13px/1 ui-sans-serif,system-ui,sans-serif;',
      'z-index:2147483001;cursor:pointer;display:grid;place-items:center;',
      'box-shadow:-4px 0 18px rgba(0,0,0,.45)}',
      '#' + TAB_ID + ':hover{background:rgba(38,42,68,.98);color:#fff0b8}',
      '#' + TAB_ID + ':focus-visible{outline:2px solid #ffd24a;outline-offset:-2px}',
      'html.dsh-arcade-lock,html.dsh-arcade-lock body{overflow:hidden!important}'
    ].join('')

    var ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M7 15.5c0 1.4 1.1 2.5 2.5 2.5h5c1.4 0 2.5-1.1 2.5-2.5v-6C17 6 15 4 12 4S7 6 7 9.5v6z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>' +
      '<circle cx="12" cy="8.6" r="1.5" fill="currentColor"/>' +
      '<path d="M12 4v2.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
      '<circle cx="10" cy="14.2" r="1" fill="currentColor"/><circle cx="14" cy="14.2" r="1" fill="currentColor"/>' +
      '</svg>'

    function ensureStyle() {
      if (document.getElementById(STYLE_ID)) return
      var s = document.createElement('style')
      s.id = STYLE_ID
      s.textContent = STYLE
      ;(document.head || document.documentElement).appendChild(s)
    }

    function removeCloseTab() {
      var tab = document.getElementById(TAB_ID)
      if (tab && tab.parentNode) tab.parentNode.removeChild(tab)
    }

    function removeFrame() {
      var f = document.getElementById(FRAME_ID)
      if (f && f.parentNode) f.parentNode.removeChild(f)
      removeCloseTab()
      document.documentElement.classList.remove('dsh-arcade-lock')
    }

    /**
     * 万一 iframe 里的页面自己退不出去（脚本报错、跨域策略变化），
     * 父层这颗标签永远能关掉它——不依赖 postMessage。
     */
    function ensureCloseTab() {
      if (document.getElementById(TAB_ID)) return
      var tab = document.createElement('button')
      tab.id = TAB_ID
      tab.type = 'button'
      tab.title = '关闭街机厅 (Esc)'
      tab.setAttribute('aria-label', '关闭街机厅')
      tab.textContent = '✕'
      tab.addEventListener('click', function (e) {
        e.preventDefault()
        e.stopPropagation()
        removeFrame()
      })
      document.body.appendChild(tab)
    }

    // iframe 若被别处移除（比如页面自己用 frameElement 退场），把标签一起收掉
    function watchFrame() {
      if (observer) return
      observer = new MutationObserver(function () {
        if (!document.getElementById(FRAME_ID)) removeCloseTab()
      })
      observer.observe(document.body, { childList: true })
    }

    function openArcade() {
      if (document.getElementById(FRAME_ID)) return
      var f = document.createElement('iframe')
      f.id = FRAME_ID
      f.src = '/dsh-arcade/index.html?embed=1'
      f.title = '小霸王街机厅'
      f.setAttribute('allow', 'autoplay; fullscreen')
      // 让键盘事件进到 iframe 里，不然得先点一下画面才能玩
      f.addEventListener('load', function () {
        try { window.focus(); f.focus() } catch (e) { /* ignore */ }
      })
      document.body.appendChild(f)
      document.documentElement.classList.add('dsh-arcade-lock')
      ensureCloseTab()
      watchFrame()
      requestAnimationFrame(function () { f.classList.add('on') })
      setTimeout(function () {
        try { f.focus() } catch (e) { /* ignore */ }
      }, 60)
    }

    function onDocumentKey(e) {
      if (e.key !== 'Escape') return
      if (!document.getElementById(FRAME_ID)) return
      e.preventDefault()
      e.stopPropagation()
      removeFrame()
    }

    function onMessage(e) {
      if (!e || e.data !== 'dsh-arcade:close') return
      var f = document.getElementById(FRAME_ID)
      if (!f) return
      // e.source 是 iframe 的 WindowProxy，不是 iframe 元素本身
      if (e.source && f.contentWindow && e.source !== f.contentWindow) return
      removeFrame()
    }

    function mount() {
      if (document.getElementById(BTN_ID)) return
      ensureStyle()
      var btn = document.createElement('button')
      btn.id = BTN_ID
      btn.type = 'button'
      btn.title = '小霸王街机厅 — 超级玛丽 / 魂斗罗 / 炸弹人 / 淘金者'
      btn.innerHTML = ICON + '<span class="lbl">街机厅</span>'
      btn.addEventListener('click', openArcade)
      document.body.appendChild(btn)
      window.addEventListener('message', onMessage)
      window.addEventListener('keydown', onDocumentKey, true)
    }

    function apply(ctx) {
      try {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', mount, { once: true })
        } else {
          mount()
        }
        if (typeof ctx.effect === 'function') {
          ctx.effect(() => () => {
            window.removeEventListener('keydown', onDocumentKey, true)
            window.removeEventListener('message', onMessage)
            removeFrame()
            if (observer) { observer.disconnect(); observer = null }
            var b = document.getElementById(BTN_ID)
            if (b && b.parentNode) b.parentNode.removeChild(b)
            var s = document.getElementById(STYLE_ID)
            if (s && s.parentNode) s.parentNode.removeChild(s)
          })
        }
      } catch (err) { /* never break the host */ }
    }

    exports.apply = apply
    exports.inject = []
    return module.exports
  }
})

