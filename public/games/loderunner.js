(function (global) {
  'use strict';

  var COLS = 28, ROWS = 16, CELL = 20, OX = 40, OY = 40;
  var W = COLS * CELL, H = ROWS * CELL, TAU = Math.PI * 2;
  var EMPTY = 0, BRICK = 1, LADDER = 2, ROPE = 3, EXIT = 4, HOLE = 5;
  var STEP = 0.12, GSTEP = 0.15, FSTEP = 0.10;
  var C = {
    bg: '#0d0e18', panel: '#151728', dim: '#5b6485', text: '#8f9bbd', white: '#e8e8f0',
    gold: '#ffd24a', red: '#ff5a5a', cyan: '#4ad6ff', green: '#6ee06e', purple: '#b06cff',
    brick: '#241a12', brick2: '#3a2a1c', brick3: '#6b4a2f', brickTop: '#8a6440'
  };
  var LEVEL = [
    '############################',
    '#.............--%---..$....#',
    '#...................####H###',
    '#.......................H..#',
    '#........---%----%--.......#',
    '##E########......########H##',
    '#........................H.#',
    '#..$..............$......H.#',
    '#####H######################',
    '#....H.....................#',
    '#....H..$...----..$........#',
    '#############..#######H#####',
    '#.....................H....#',
    '#.....................H....#',
    '#..P......$......$..G.....G#',
    '############################'
  ];

  function create(host) {
    var map = [], gold = [], pits = [], guards = [], player = null;
    var state = 'play', score = 0, lives = 3, goldLeft = 0, exitOpen = false;
    var invuln = 0, time = 0, prevA = false, prevB = false, flash = 0, flashMsg = '';
    var start = { c: 3, r: 14 }, exitCell = { c: 2, r: 5 };

    function beep(k) { if (host && host.beep) host.beep(k); }
    function hud() { if (host && host.setHud) host.setHud({ score: score, lives: lives, extra: '金 ' + goldLeft }); }
    function overlay(t) { if (host && host.setOverlay) host.setOverlay(t); }
    function pad(n, w) { var s = '' + n; while (s.length < w) s = '0' + s; return s; }
    function mkActor(c, r, isGuard, color) {
      return { col: c, row: r, mx: c, my: r, p: 0, moving: false, fall: false, trapped: 0, face: 1, steps: 0, isGuard: isGuard, color: color };
    }

    function reset() {
      map = []; gold = []; pits = []; guards = [];
      goldLeft = 0; exitOpen = false; state = 'play'; score = 0; lives = 3;
      invuln = 0; time = 0; flash = 0; flashMsg = '';
      var inp = host.input || {}, gs = [];
      prevA = !!inp.a; prevB = !!inp.b;
      for (var r = 0; r < ROWS; r++) {
        var line = LEVEL[r] || '', row = [];
        for (var c = 0; c < COLS; c++) {
          var ch = line.charAt(c) || '.', t = EMPTY;
          if (ch === '#') t = BRICK;
          else if (ch === 'H') t = LADDER;
          else if (ch === '-' || ch === '%') t = ROPE;
          else if (ch === 'E') { t = EXIT; exitCell = { c: c, r: r }; }
          if (ch === '$' || ch === '%') gold.push({ c: c, r: r, on: false });
          if (ch === 'P') start = { c: c, r: r };
          if (ch === 'G') gs.push({ c: c, r: r });
          row.push(t);
        }
        map.push(row);
      }
      goldLeft = gold.length;
      player = mkActor(start.c, start.r, false, C.white);
      for (var i = 0; i < gs.length; i++) guards.push(mkActor(gs[i].c, gs[i].r, true, i === 0 ? C.purple : C.green));
      overlay(null);
      hud();
    }

    function at(c, r) {
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return BRICK;
      return map[r][c];
    }
    function passable(c, r) {
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
      var t = map[r][c];
      return t !== BRICK && !(t === EXIT && !exitOpen);
    }

    function solid(c, r) { var t = at(c, r); return t === BRICK || (t === EXIT && !exitOpen); }
    function supported(c, r) { return solid(c, r + 1) || at(c, r + 1) === LADDER; }
    function isGrip(c, r) { var t = at(c, r); return t === LADDER || t === ROPE; }
    function gx(a) { return a.moving ? a.col + (a.mx - a.col) * a.p : a.col; }
    function gy(a) { return a.moving ? a.row + (a.my - a.row) * a.p : a.row; }
    function startMove(a, c, r, fall) { a.mx = c; a.my = r; a.p = 0; a.moving = true; a.fall = !!fall; }

    function decidePlayer(a) {
      var c = a.col, r = a.row, here = at(c, r);
      if (!isGrip(c, r) && !supported(c, r)) { startMove(a, c, r + 1, true); return; }
      var inp = host.input || {};
      var h = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      if (inp.up && passable(c, r - 1) && (here === LADDER || here === HOLE || at(c, r - 1) === LADDER)) {
        startMove(a, c, r - 1, false); return;
      }
      if (inp.down && passable(c, r + 1) && (here === LADDER || here === ROPE || at(c, r + 1) === LADDER)) {
        startMove(a, c, r + 1, false); return;
      }
      if (h && passable(c + h, r)) {
        a.face = h; startMove(a, c + h, r, false);
        if (++a.steps % 3 === 0) beep('step');
      }
    }

    function decideGuard(a) {
      var c = a.col, r = a.row, here = at(c, r);
      if (!isGrip(c, r) && !supported(c, r)) { startMove(a, c, r + 1, true); return; }
      var dx = player.col - c, dy = player.row - r;
      var sx = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
      var sy = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
      var hFirst = Math.abs(dx) >= Math.abs(dy);
      for (var i = 0; i < 2; i++) {
        if ((hFirst ? i === 1 : i === 0) && sy) {
          var nr = r + sy;
          if (sy < 0 && passable(c, nr) && (here === LADDER || at(c, nr) === LADDER)) { startMove(a, c, nr, false); return; }
          if (sy > 0 && passable(c, nr) && (here === LADDER || here === ROPE || at(c, nr) === LADDER)) { startMove(a, c, nr, false); return; }
        } else if (sx && passable(c + sx, r)) {
          a.face = sx; startMove(a, c + sx, r, false); return;
        }
      }
    }

    function decide(a) { if (a.isGuard) decideGuard(a); else decidePlayer(a); }

    function collect(c, r) {
      for (var i = 0; i < gold.length; i++) {
        var g = gold[i];
        if (!g.on && g.c === c && g.r === r) {
          g.on = true; score += 100; goldLeft -= 1; beep('coin');
          if (goldLeft === 0 && !exitOpen) { exitOpen = true; flash = 2.2; flashMsg = '出口已显形！'; }
          hud(); return;
        }
      }
    }

    function doWin() { state = 'win'; beep('win'); overlay('过关！按 Z / 空格再玩一次'); hud(); }

    function respawn() {
      player = mkActor(start.c, start.r, false, C.white);
      invuln = 1; flash = 1.4; flashMsg = '被抓住了！';
    }

    function die() {
      beep('hit'); lives -= 1;
      if (lives <= 0) { lives = 0; state = 'dead'; beep('lose'); overlay('游戏结束 · 按 Z / 空格重开'); }
      else respawn();
      hud();
    }

    function arrive(a) {
      if (a.isGuard) {
        if (at(a.col, a.row) === HOLE) { a.trapped = 4; beep('hit'); }
      } else {
        collect(a.col, a.row);
        if (exitOpen && at(a.col, a.row) === EXIT) doWin();
      }
    }

    function stepActor(a, dt) {
      if (a.trapped > 0) {
        a.trapped -= dt;
        if (a.trapped <= 0) { a.trapped = 0; escapeTrap(a); }
        return;
      }
      if (!a.moving) decide(a);
      if (!a.moving) return;
      var dur = a.fall ? FSTEP : (a.isGuard ? GSTEP : STEP);
      a.p += dt / dur;
      if (a.p < 1) return;
      var over = a.p - 1;
      a.col = a.mx; a.row = a.my; a.p = 0; a.moving = false;
      arrive(a);
      if (state !== 'play' || a.trapped > 0) return;
      decide(a);
      if (a.moving) a.p = over < 0.6 ? over : 0.6;
    }

    function escapeTrap(a) {
      var c = a.col, r = a.row;
      if (!passable(c, r - 1)) { a.trapped = 0.25; return; }
      for (var i = 0; i < pits.length; i++) {
        if (pits[i].c === c && pits[i].r === r) { map[r][c] = BRICK; pits.splice(i, 1); break; }
      }
      a.row = r - 1; a.my = r - 1; a.moving = false; a.p = 0;
      beep('step');
    }

    function occupied(c, r) {
      var list = guards.slice();
      if (player) list.push(player);
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        if (a.col === c && a.row === r) return true;
        if (a.moving && a.mx === c && a.my === r) return true;
      }
      return false;
    }

    function tryDig() {
      if (!player || player.moving || player.trapped > 0) return;
      if (at(player.col, player.row) === LADDER || !solid(player.col, player.row + 1)) return;
      var inp = host.input || {};
      var dir = inp.left ? -1 : (inp.right ? 1 : player.face);
      var c = player.col + dir, r = player.row + 1;
      if (c < 1 || c > COLS - 2 || r < 1 || r > ROWS - 2) return;
      if (at(c, r) !== BRICK || occupied(c, r)) return;
      map[r][c] = HOLE;
      pits.push({ c: c, r: r, t: 6 });
      player.face = dir;
      beep('hit');
    }

    function updatePits(dt) {
      for (var i = pits.length - 1; i >= 0; i--) {
        var q = pits[i];
        q.t -= dt;
        if (q.t <= 0) {
          if (occupied(q.c, q.r)) q.t = 0.2;
          else { map[q.r][q.c] = BRICK; pits.splice(i, 1); }
        }
      }
    }

    function checkHit() {
      if (invuln > 0 || state !== 'play') return;
      var px = gx(player), py = gy(player);
      for (var i = 0; i < guards.length; i++) {
        if (Math.abs(gx(guards[i]) - px) < 0.7 && Math.abs(gy(guards[i]) - py) < 0.66) { die(); return; }
      }
    }

    function update(dt) {
      dt = dt > 0 ? dt : 0;
      if (dt > 0.05) dt = 0.05;
      time += dt;
      var inp = host.input || {}, aDown = !!inp.a;
      if (state !== 'play') {
        if (aDown && !prevA) reset();
        prevA = aDown; prevB = !!inp.b;
        return;
      }
      prevA = aDown;
      if (invuln > 0) invuln = Math.max(0, invuln - dt);
      if (flash > 0) flash = Math.max(0, flash - dt);
      var bDown = !!inp.b;
      if (bDown && !prevB) tryDig();
      prevB = bDown;
      stepActor(player, dt);
      if (state === 'play') {
        for (var i = 0; i < guards.length; i++) stepActor(guards[i], dt);
      }
      updatePits(dt);
      if (state === 'play') checkHit();
    }

    function onKey(action, isDown) {
      if (isDown && action === 'a' && (state === 'dead' || state === 'win')) reset();
    }

    function drawBrick(ctx, x, y, c, r) {
      ctx.fillStyle = C.brick; ctx.fillRect(x, y, CELL, CELL);
      ctx.fillStyle = C.brick2; ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      ctx.fillStyle = C.brick3;
      var o = ((c + r) & 1) ? 2 : 0;
      for (var i = 0; i < 4; i++) ctx.fillRect(x + 3 + (i % 2) * 9, y + 4 + o + (i >> 1) * 8, 3, 3);
      ctx.fillStyle = C.brickTop; ctx.fillRect(x + 1, y + 1, CELL - 2, 1);
      ctx.fillStyle = '#120c08'; ctx.fillRect(x + 1, y + CELL - 2, CELL - 2, 1);
    }

    function drawLadder(ctx, x, y) {
      ctx.fillStyle = '#3d4763'; ctx.fillRect(x + 3, y, 3, CELL); ctx.fillRect(x + 14, y, 3, CELL);
      ctx.fillStyle = '#9fb2d8';
      for (var i = 0; i < 4; i++) ctx.fillRect(x + 3, y + 2 + i * 5, 14, 2);
    }

    function drawRope(ctx, x, y) {
      ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x, y + 9, CELL, 3);
      ctx.fillStyle = '#c08a3e'; ctx.fillRect(x, y + 9, CELL, 1);
      ctx.fillStyle = '#e0b070'; ctx.fillRect(x + 4, y + 6, 3, 3); ctx.fillRect(x + 13, y + 6, 3, 3);
    }

    function drawHole(ctx, x, y) {
      ctx.fillStyle = '#1a120c'; ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      ctx.fillStyle = '#05060b'; ctx.fillRect(x + 3, y + 3, CELL - 4, CELL - 4);
      ctx.fillStyle = C.brick3; ctx.fillRect(x + 1, y + 1, 4, 2); ctx.fillRect(x + 12, y + 1, 4, 2); ctx.fillRect(x + 7, y + 17, 4, 2);
    }

    function drawCell(ctx, c, r) {
      var t = map[r][c], x = OX + c * CELL, y = OY + r * CELL;
      if (t === BRICK) drawBrick(ctx, x, y, c, r);
      else if (t === LADDER) drawLadder(ctx, x, y);
      else if (t === ROPE) drawRope(ctx, x, y);
      else if (t === HOLE) drawHole(ctx, x, y);
      else if (t === EXIT) {
        if (!exitOpen) drawBrick(ctx, x, y, c, r);
        else { ctx.fillStyle = '#05080f'; ctx.fillRect(x, y, CELL, CELL); }
      } else if ((c + r) % 2 === 0) {
        ctx.fillStyle = '#141728'; ctx.fillRect(x + 19, y + 19, 1, 1);
      }
    }
    function drawGold(ctx, g) {
      var x = OX + g.c * CELL + 10, y = OY + g.r * CELL + 10;
      var pulse = 0.5 + 0.5 * Math.sin(time * 5 + g.c * 0.9 + g.r * 0.7);
      ctx.fillStyle = 'rgba(255,210,74,0.15)'; ctx.beginPath(); ctx.arc(x, y, 8 + pulse * 2, 0, TAU); ctx.fill();
      ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(x, y, 4 + pulse, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(x - 1.3, y - 1.3, 1.6, 0, TAU); ctx.fill();
      if (pulse > 0.85) {
        ctx.fillStyle = C.gold;
        ctx.fillRect(x - 8, y, 3, 1); ctx.fillRect(x + 6, y, 3, 1); ctx.fillRect(x, y - 8, 1, 3); ctx.fillRect(x, y + 6, 1, 3);
      }
    }

    function drawExit(ctx) {
      var x = OX + exitCell.c * CELL, y = OY + exitCell.r * CELL;
      var pulse = 0.5 + 0.5 * Math.sin(time * 4);
      ctx.fillStyle = 'rgba(74,214,255,' + (0.18 + pulse * 0.22) + ')'; ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
      ctx.fillStyle = C.cyan;
      ctx.fillRect(x + 3, y + 3, 2, CELL - 6); ctx.fillRect(x + CELL - 5, y + 3, 2, CELL - 6); ctx.fillRect(x + 3, y + 3, CELL - 6, 2);
      ctx.fillStyle = '#e8fbff'; ctx.fillRect(x + 9, y + 9 + Math.round(pulse * 3), 3, 6);
    }

    function drawActor(ctx, a) {
      var px = OX + gx(a) * CELL, py = OY + gy(a) * CELL;
      var col = a.isGuard ? a.color : C.white;
      var trapped = a.isGuard && a.trapped > 0;
      if (!a.isGuard && invuln > 0 && Math.floor(time * 16) % 2 === 0) ctx.globalAlpha = 0.35;
      var step = a.moving && !a.fall ? Math.sin(time * 18) * 2 : 0;
      var cx = Math.round(px + 10);
      var feet = Math.round(py + 17 + (trapped ? 5 + Math.sin(time * 22) : 0));
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(cx - 5, feet - 1, 10, 2);
      ctx.fillStyle = col;
      if (a.fall) {
        ctx.fillRect(cx - 5, feet - 4, 3, 4); ctx.fillRect(cx + 2, feet - 4, 3, 4);
      } else {
        ctx.fillRect(cx - 4 + (step > 0.5 ? 1 : 0), feet - 4, 3, 4);
        ctx.fillRect(cx + 1 - (step < -0.5 ? 1 : 0), feet - 4, 3, 4);
      }
      ctx.fillRect(cx - 3, feet - 12, 6, 8);
      if (trapped) { ctx.fillRect(cx - 6, feet - 17, 2, 7); ctx.fillRect(cx + 4, feet - 17, 2, 7); }
      else { ctx.fillRect(cx - 5, feet - 12, 2, 6); ctx.fillRect(cx + 3, feet - 12, 2, 6); }
      ctx.fillRect(cx - 3, feet - 18, 6, 6);
      if (a.isGuard) {
        ctx.fillStyle = '#12142a';
        ctx.fillRect(cx - 3, feet - 20, 2, 2); ctx.fillRect(cx + 1, feet - 20, 2, 2);
      }
      ctx.fillStyle = a.isGuard ? C.red : '#12142a';
      ctx.fillRect(cx + (a.face > 0 ? 1 : -3), feet - 16, 2, 2);
      if (trapped) {
        ctx.fillStyle = C.gold;
        var ang = time * 7;
        ctx.fillRect(Math.round(cx + Math.cos(ang) * 7), Math.round(feet - 23 + Math.sin(ang) * 3), 2, 2);
        ctx.fillRect(Math.round(cx - Math.cos(ang) * 7), Math.round(feet - 23 - Math.sin(ang) * 3), 2, 2);
      }
      if (!a.isGuard && invuln > 0) {
        ctx.strokeStyle = C.cyan; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, feet - 9, 10, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function drawHud(ctx) {
      ctx.font = '12px monospace'; ctx.textBaseline = 'middle';
      ctx.textAlign = 'left'; ctx.fillStyle = C.dim; ctx.fillText('LODE RUNNER', 44, 21);
      ctx.textAlign = 'center'; ctx.fillStyle = C.gold; ctx.fillText('SCORE ' + pad(score, 5), 320, 21);
      ctx.textAlign = 'right'; ctx.fillStyle = C.text;
      ctx.fillText('GOLD ' + pad(goldLeft, 2) + '   LIVES ' + lives, 596, 21);
      ctx.textAlign = 'left'; ctx.fillStyle = C.dim; ctx.fillText('←→ 跑动   ↑↓ 爬梯   B 挖坑', 44, 383);
      ctx.textAlign = 'right'; ctx.fillText('Z/空格 重开', 596, 383);
      ctx.textAlign = 'left';
    }

    function draw(ctx) {
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 640, 400);
      ctx.fillStyle = C.panel; ctx.fillRect(26, 26, 588, 348);
      ctx.fillStyle = '#1f2340'; ctx.fillRect(37, 37, W + 6, H + 6);
      ctx.fillStyle = '#08090f'; ctx.fillRect(OX, OY, W, H);
      if (!map.length || !player) return;
      for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) drawCell(ctx, c, r);
      if (exitOpen) drawExit(ctx);
      for (var i = 0; i < gold.length; i++) if (!gold[i].on) drawGold(ctx, gold[i]);
      for (var j = 0; j < guards.length; j++) drawActor(ctx, guards[j]);
      drawActor(ctx, player);
      ctx.fillStyle = 'rgba(0,0,0,0.11)';
      for (var sy = OY; sy < OY + H; sy += 3) ctx.fillRect(OX, sy, W, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(OX, OY, W, 3); ctx.fillRect(OX, OY + H - 3, W, 3);
      ctx.fillRect(OX, OY, 3, H); ctx.fillRect(OX + W - 3, OY, 3, H);
      ctx.fillStyle = 'rgba(74,214,255,0.04)'; ctx.fillRect(OX, OY, W, H);
      ctx.fillStyle = 'rgba(74,214,255,0.4)';
      ctx.fillRect(36, 36, 10, 1); ctx.fillRect(36, 36, 1, 10);
      ctx.fillRect(594, 36, 10, 1); ctx.fillRect(603, 36, 1, 10);
      ctx.fillRect(36, 363, 10, 1); ctx.fillRect(36, 354, 1, 10);
      ctx.fillRect(594, 363, 10, 1); ctx.fillRect(603, 354, 1, 10);
      if (state !== 'play') { ctx.fillStyle = 'rgba(5,6,12,0.45)'; ctx.fillRect(OX, OY, W, H); }
      if (flash > 0 && state === 'play') {
        ctx.globalAlpha = flash > 0.4 ? 1 : flash / 0.4;
        ctx.fillStyle = 'rgba(13,14,24,0.85)'; ctx.fillRect(OX + 170, OY + 145, 220, 30);
        ctx.fillStyle = C.gold; ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(flashMsg, OX + 280, OY + 160);
        ctx.textAlign = 'left'; ctx.globalAlpha = 1;
      }
      drawHud(ctx);
    }

    return { reset: reset, update: update, draw: draw, onKey: onKey };
  }

  var g = global.ArcadeGames = global.ArcadeGames || {};
  g.loderunner = { id: 'loderunner', title: '淘金者', create: create };
})(typeof window !== 'undefined' ? window : globalThis);
