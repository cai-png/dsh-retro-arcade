/**
 * dsh-arcade — arcade cabinet shell
 *
 * Owns the canvas, the input state, the fixed-step loop and the HUD. Each game
 * module (public/games/*.js) registers itself on window.ArcadeGames and only
 * implements reset/update/draw against the 640x400 logical canvas.
 */
(function () {
  'use strict'

  var W = 640
  var H = 400
  var ORDER = ['mario', 'contra', 'bomberman', 'loderunner']

  var canvas = document.getElementById('screen')
  var ctx = canvas.getContext('2d')
  var tabsEl = document.getElementById('tabs')
  var overlayEl = document.getElementById('overlay')
  var scoreEl = document.getElementById('hud-score')
  var livesEl = document.getElementById('hud-lives')
  var extraEl = document.getElementById('hud-extra')

  var registry = window.ArcadeGames || {}
  var input = { left: false, right: false, up: false, down: false, a: false, b: false }
  var game = null
  var gameKey = null
  var gameApi = null
  var hudCache = ''
  var overlayText = null
  var broken = null

  // ---------------------------------------------------------------- audio
  var audioOn = true
  try { audioOn = window.localStorage.getItem('dsh-arcade-muted') !== '1' } catch (e) { /* ignore */ }
  var actx = null

  var SOUND = {
    jump: [{ f: 420, t: 0.10, type: 'square', to: 760 }],
    shoot: [{ f: 900, t: 0.05, type: 'square', to: 560 }],
    coin: [{ f: 988, t: 0.07, type: 'square', to: 988 }, { f: 1319, t: 0.10, type: 'square', at: 0.07 }],
    hit: [{ f: 220, t: 0.16, type: 'sawtooth', to: 80 }],
    boom: [{ f: 140, t: 0.26, type: 'sawtooth', to: 45 }],
    step: [{ f: 240, t: 0.03, type: 'square', to: 200 }],
    win: [{ f: 523, t: 0.12, type: 'triangle' }, { f: 659, t: 0.12, type: 'triangle', at: 0.12 },
      { f: 784, t: 0.12, type: 'triangle', at: 0.24 }, { f: 1046, t: 0.30, type: 'triangle', at: 0.36 }],
    lose: [{ f: 330, t: 0.16, type: 'sawtooth', to: 190 }, { f: 190, t: 0.34, type: 'sawtooth', to: 70, at: 0.16 }]
  }

  function beep(kind) {
    if (!audioOn) return
    var notes = SOUND[kind] || SOUND.step
    try {
      if (!actx) {
        var AC = window.AudioContext || window.webkitAudioContext
        if (!AC) return
        actx = new AC()
      }
      if (actx.state === 'suspended') actx.resume()
      var now = actx.currentTime
      for (var i = 0; i < notes.length; i++) {
        var n = notes[i]
        var at = now + (n.at || 0)
        var osc = actx.createOscillator()
        var gain = actx.createGain()
        osc.type = n.type || 'square'
        osc.frequency.setValueAtTime(n.f, at)
        if (n.to) osc.frequency.exponentialRampToValueAtTime(Math.max(30, n.to), at + n.t)
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(0.09, at + 0.008)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + n.t)
        osc.connect(gain)
        gain.connect(actx.destination)
        osc.start(at)
        osc.stop(at + n.t + 0.03)
      }
    } catch (e) { /* audio must never break the game */ }
  }

  // ---------------------------------------------------------------- hud
  function setHud(next) {
    if (!next) return
    var score = next.score === undefined ? null : next.score
    var lives = next.lives === undefined ? null : next.lives
    var extra = next.extra === undefined ? '' : String(next.extra)
    var sig = score + '|' + lives + '|' + extra
    if (sig === hudCache) return
    hudCache = sig
    if (score !== null) scoreEl.textContent = String(score)
    if (lives !== null) livesEl.textContent = String(lives)
    extraEl.textContent = extra
  }

  function setOverlay(text) {
    overlayText = text || null
    if (overlayText) {
      overlayEl.innerHTML = overlayText
      overlayEl.classList.add('on')
    } else {
      overlayEl.classList.remove('on')
      overlayEl.textContent = ''
    }
  }

  var host = { input: input, beep: beep, setHud: setHud, setOverlay: setOverlay }

  // ---------------------------------------------------------------- tabs
  function prettyTitle(key) {
    var entry = registry[key]
    return entry && entry.title ? entry.title : key
  }

  function buildTabs() {
    tabsEl.innerHTML = ''
    ORDER.forEach(function (key) {
      var ok = !!(registry[key] && typeof registry[key].create === 'function')
      var b = document.createElement('button')
      b.type = 'button'
      b.className = 'tab'
      b.dataset.key = key
      b.innerHTML = '<span class="dot"></span>' + (ok ? prettyTitle(key) : key + '（缺失）')
      b.addEventListener('click', function () { select(key) })
      tabsEl.appendChild(b)
    })
  }

  function markTab(key) {
    var nodes = tabsEl.querySelectorAll('.tab')
    for (var i = 0; i < nodes.length; i++) {
      var on = nodes[i].dataset.key === key
      nodes[i].classList.toggle('on', on)
    }
  }

  // ---------------------------------------------------------------- games
  function select(key) {
    if (!registry[key] || typeof registry[key].create !== 'function') {
      setOverlay('<b>这款游戏没有装上</b>\n' + key + '.js 未加载成功')
      return
    }
    gameKey = key
    markTab(key)
    setOverlay(null)
    broken = null
    // 先清空 HUD 与缓存，再让 reset() 里的 setHud 生效（否则会被缓存短路）
    resetHudDefaults()
    try {
      gameApi = registry[key].create(host)
      game = gameApi
      gameApi.reset()
    } catch (err) {
      game = null
      fail(err)
      return
    }
  }

  function resetHudDefaults() {
    hudCache = ''
    scoreEl.textContent = '0'
    livesEl.textContent = ''
    extraEl.textContent = ''
  }

  function resetGame() {
    if (!gameApi) return
    setOverlay(null)
    broken = null
    try { gameApi.reset() } catch (err) { fail(err) }
  }

  function fail(err) {
    broken = err
    var msg = err && err.message ? err.message : String(err)
    setOverlay('<b>游戏出错了</b>\n' + msg + '\n\n按 Enter 重新开始')
    try { if (window.console) console.error('[dsh-arcade]', err) } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- input
  var KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    KeyZ: 'a', Space: 'a', KeyJ: 'a',
    KeyX: 'b', KeyK: 'b'
  }

  function onKeyDown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.code === 'Escape') {
      e.preventDefault()
      closeArcade()
      return
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault()
      resetGame()
      return
    }
    var action = KEYMAP[e.code]
    if (!action) return
    e.preventDefault()
    if (!input[action]) {
      input[action] = true
      if (gameApi && typeof gameApi.onKey === 'function') {
        try { gameApi.onKey(action, true) } catch (err) { fail(err) }
      }
    }
  }

  function onKeyUp(e) {
    var action = KEYMAP[e.code]
    if (!action) return
    e.preventDefault()
    if (input[action]) {
      input[action] = false
      if (gameApi && typeof gameApi.onKey === 'function') {
        try { gameApi.onKey(action, false) } catch (err) { fail(err) }
      }
    }
  }

  function clearInput() {
    for (var k in input) if (Object.prototype.hasOwnProperty.call(input, k)) input[k] = false
  }

  // ---------------------------------------------------------------- loop
  var last = 0
  var raf = 0

  function frame(ts) {
    raf = window.requestAnimationFrame(frame)
    if (!game) return
    if (!last) last = ts
    var dt = (ts - last) / 1000
    last = ts
    if (!isFinite(dt) || dt < 0) dt = 0
    if (dt > 0.05) dt = 0.05

    if (!broken) {
      try {
        game.update(dt)
      } catch (err) {
        fail(err)
      }
    }
    try {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = '#07070d'
      ctx.fillRect(0, 0, W, H)
      game.draw(ctx)
      ctx.restore()
    } catch (err) {
      fail(err)
    }
  }

  // ---------------------------------------------------------------- chrome
  function toggleSound() {
    audioOn = !audioOn
    try { window.localStorage.setItem('dsh-arcade-muted', audioOn ? '0' : '1') } catch (e) { /* ignore */ }
    var b = document.getElementById('btn-sound')
    b.textContent = audioOn ? '🔊 音效' : '🔇 静音'
    if (audioOn) beep('coin')
  }

  function closeArcade() {
    clearInput()
    // 1) 同源 iframe：直接把自己从父页面 DOM 里摘掉，不依赖 postMessage
    try {
      var fe = window.frameElement
      if (fe) {
        var pdoc = fe.ownerDocument
        if (pdoc && pdoc.documentElement) pdoc.documentElement.classList.remove('dsh-arcade-lock')
        if (fe.parentNode) { fe.parentNode.removeChild(fe); return }
      }
    } catch (e) { /* 跨域时走下面的 postMessage */ }
    // 2) 让父页面关掉 iframe
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage('dsh-arcade:close', '*')
        return
      }
    } catch (e) { /* ignore */ }
    // 3) 独立打开时退回上一页
    if (window.history && window.history.length > 1) window.history.back()
    else window.location.href = '/'
  }

  function boot() {
    if (!ctx) {
      document.body.textContent = 'Canvas 2D 不可用'
      return
    }
    buildTabs()
    var soundBtn = document.getElementById('btn-sound')
    soundBtn.textContent = audioOn ? '🔊 音效' : '🔇 静音'
    soundBtn.addEventListener('click', toggleSound)
    document.getElementById('btn-reset').addEventListener('click', resetGame)
    document.getElementById('btn-close').addEventListener('click', closeArcade)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', clearInput)
    document.addEventListener('visibilitychange', function () { last = 0 })
    // 打开时就把焦点拿到 iframe 里，键盘可以直接玩
    try { window.focus() } catch (e) { /* ignore */ }
    canvas.addEventListener('click', function () { try { window.focus() } catch (e) { /* ignore */ } })
    canvas.setAttribute('tabindex', '0')

    var first = null
    for (var i = 0; i < ORDER.length; i++) {
      if (registry[ORDER[i]] && typeof registry[ORDER[i]].create === 'function') { first = ORDER[i]; break }
    }
    // 支持 ?game=contra 之类深链，方便分享与调试
    try {
      var want = new URLSearchParams(window.location.search).get('game')
      if (want && ORDER.indexOf(want) >= 0 && registry[want] && typeof registry[want].create === 'function') {
        first = want
      }
    } catch (e) { /* ignore */ }
    if (!first) {
      setOverlay('<b>没有找到游戏模块</b>\n检查 public/games/*.js 是否加载')
      return
    }
    select(first)
    raf = window.requestAnimationFrame(frame)
  }

  boot()
})()
