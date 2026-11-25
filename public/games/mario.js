(function (global) {
  'use strict';

  var VW = 640, VH = 400, T = 16, COLS = 160, ROWS = 25, LEVELW = COLS * T, GY = 23 * T;
  var EMPTY = 0, GROUND = 1, BRICK = 2, QUES = 3, USED = 4, PIPE = 5;
  var PITS = [[38, 40], [76, 78], [112, 114]];
  var PIPES = [{ c: 12, h: 2 }, { c: 44, h: 3 }, { c: 60, h: 4 }, { c: 94, h: 2 }];
  var BRICKS = [[16, 19], [18, 19], [20, 19], [22, 19], [28, 19], [29, 19], [30, 19], [31, 19], [48, 18], [49, 18], [50, 18], [51, 18], [52, 18], [64, 19], [65, 19], [67, 19], [68, 19], [86, 18], [87, 18], [88, 18], [89, 18], [90, 18], [104, 19], [105, 19], [107, 19], [108, 19], [122, 18], [123, 18], [124, 18], [125, 18], [126, 18]];
  var QBLOCKS = [[17, 19, 'c'], [19, 19, 'm'], [21, 19, 'c'], [50, 14, 'c'], [66, 19, 'm'], [88, 14, 'c'], [106, 19, 'm'], [124, 14, 'c']];
  var GOOMBAS = [24, 47, 56, 82, 100, 118, 130];
  var BUSHES = [2, 9, 24, 36, 54, 72, 84, 98, 110, 128, 142];
  var FLAG_C = 148, FLAG_X = FLAG_C * T + 8;

  function create(host) {
    var grid = null, qtype = {}, state = 'play', clock = 0, camX = 0;
    var score = 0, coinsN = 0, lives = 3, spawnX = 32, spawnY = GY - 16, hudKey = '';
    var particles = [], popCoins = [], enemies = [], items = [];
    var p = { x: 32, y: GY - 16, w: 12, h: 16, vx: 0, vy: 0, dir: 1, big: false, onGround: false, jumpHold: 0, coyote: 0, inv: 0, dead: 0, prevA: false };

    function set(cx, cy, v) { if (cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS) grid[cy * COLS + cx] = v; }
    function tile(cx, cy) {
      if (cx < 0 || cx >= COLS) return GROUND;
      if (cy < 0 || cy >= ROWS) return EMPTY;
      return grid[cy * COLS + cx];
    }
    function solid(cx, cy) { return tile(cx, cy) !== EMPTY; }
    function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

    function build() {
      grid = new Uint8Array(COLS * ROWS); qtype = {};
      var x, y, i, hole;
      for (x = 0; x < COLS; x++) {
        hole = false;
        for (i = 0; i < PITS.length; i++) if (x >= PITS[i][0] && x <= PITS[i][1]) hole = true;
        if (!hole) for (y = 23; y < ROWS; y++) set(x, y, GROUND);
      }
      for (i = 0; i < PIPES.length; i++) for (x = PIPES[i].c; x < PIPES[i].c + 2; x++) for (y = 23 - PIPES[i].h; y <= 22; y++) set(x, y, PIPE);
      for (i = 0; i < BRICKS.length; i++) set(BRICKS[i][0], BRICKS[i][1], BRICK);
      for (i = 0; i < QBLOCKS.length; i++) { set(QBLOCKS[i][0], QBLOCKS[i][1], QUES); qtype[QBLOCKS[i][1] * COLS + QBLOCKS[i][0]] = QBLOCKS[i][2]; }
      for (i = 0; i < 4; i++) for (y = 22 - i; y <= 22; y++) set(138 + i, y, GROUND);
    }

    function reset() {
      build();
      particles = []; popCoins = []; enemies = []; items = [];
      state = 'play'; clock = 0; camX = 0; score = 0; coinsN = 0; lives = 3;
      spawnX = 32; spawnY = GY - 16; hudKey = '';
      p.x = 32; p.y = GY - 16; p.w = 12; p.h = 16; p.vx = 0; p.vy = 0; p.dir = 1; p.big = false;
      p.onGround = false; p.jumpHold = 0; p.coyote = 0; p.inv = 0; p.dead = 0; p.prevA = false;
      for (var i = 0; i < GOOMBAS.length; i++) enemies.push({ x: GOOMBAS[i] * T + 1, y: GY - 14, w: 14, h: 14, vx: -32, vy: 0, squash: 0 });
      host.setHud({ score: 0, lives: 3, extra: '金币 x0' });
      host.setOverlay(null);
    }

    function addParticles(x, y, color, n) {
      for (var i = 0; i < n; i++) particles.push({ x: x, y: y, vx: (Math.random() - 0.5) * 220, vy: -140 - Math.random() * 120, life: 0.6, color: color, s: 2 + (i % 2) * 2 });
    }
    function addCoin(px, py) { coinsN += 1; score += 100; popCoins.push({ x: px, y: py, vy: -260, t: 0 }); host.beep('coin'); }
    function grow() { if (!p.big) { p.big = true; p.y -= 10; p.h = 26; } score += 1000; host.beep('coin'); }
    function die() {
      if (p.dead > 0) return;
      lives -= 1; p.dead = 1.05; p.vy = -380; p.vx = 0; p.big = false; p.h = 16;
      host.beep('lose');
    }
    function hurt() {
      if (p.dead > 0 || p.inv > 0) return;
      if (p.big) { p.big = false; p.h = 16; p.y += 10; p.inv = 1.6; host.beep('hit'); }
      else die();
    }
    function bump(cx, cy) {
      var t = tile(cx, cy);
      if (t === BRICK) {
        set(cx, cy, EMPTY);
        addParticles(cx * T + 8, cy * T + 8, '#ff5a5a', 6);
        score += 20; host.beep('boom');
      } else if (t === QUES) {
        set(cx, cy, USED);
        if ((qtype[cy * COLS + cx] || 'c') === 'm' && !p.big) {
          items.push({ x: cx * T + 1, y: cy * T - 14, w: 14, h: 14, vx: 55, vy: 0 });
          host.beep('step');
        } else addCoin(cx * T + 8, cy * T - 6);
      }
    }

    function moveX(dt) {
      p.x += p.vx * dt;
      var y0 = Math.floor((p.y + 1) / T), y1 = Math.floor((p.y + p.h - 1) / T), cy, cx;
      if (p.vx > 0) {
        cx = Math.floor((p.x + p.w - 0.01) / T);
        for (cy = y0; cy <= y1; cy++) if (solid(cx, cy)) { p.x = cx * T - p.w; p.vx = 0; return; }
      } else if (p.vx < 0) {
        cx = Math.floor(p.x / T);
        for (cy = y0; cy <= y1; cy++) if (solid(cx, cy)) { p.x = (cx + 1) * T; p.vx = 0; return; }
      }
    }
    function moveY(dt) {
      p.y += p.vy * dt;
      p.onGround = false;
      var x0 = Math.floor((p.x + 1) / T), x1 = Math.floor((p.x + p.w - 1) / T), cx, cy;
      if (p.vy >= 0) {
        cy = Math.floor((p.y + p.h) / T);
        for (cx = x0; cx <= x1; cx++) if (solid(cx, cy)) { p.y = cy * T - p.h; p.vy = 0; p.onGround = true; return; }
      } else {
        cy = Math.floor(p.y / T);
        for (cx = x0; cx <= x1; cx++) if (solid(cx, cy)) { p.y = (cy + 1) * T; p.vy = 0; bump(cx, cy); return; }
      }
    }

    function updatePlayer(dt) {
      if (p.dead > 0) {
        p.dead -= dt;
        p.vy += 1500 * dt;
        p.y += p.vy * dt;
        if (p.dead <= 0 || p.y > VH + 80) {
          if (lives <= 0) { state = 'over'; host.setOverlay('游戏结束 · 按 A 重新开始'); }
          else {
            p.x = spawnX; p.y = spawnY; p.vx = 0; p.vy = 0; p.dead = 0; p.dir = 1;
            p.big = false; p.h = 16; p.inv = 1.2;
          }
        }
        return;
      }
      p.inv = p.inv > 0 ? p.inv - dt : 0;
      var inp = host.input, acc = 900, maxv = 155, f = 1000 * dt;
      if (inp.left && !inp.right) { p.vx -= acc * dt; p.dir = -1; }
      else if (inp.right && !inp.left) { p.vx += acc * dt; p.dir = 1; }
      else if (p.vx > f) p.vx -= f;
      else if (p.vx < -f) p.vx += f;
      else p.vx = 0;
      if (p.vx > maxv) p.vx = maxv; else if (p.vx < -maxv) p.vx = -maxv;
      if (p.onGround) p.coyote = 0.09; else p.coyote = Math.max(0, p.coyote - dt);
      var jump = !!inp.a;
      if (jump && !p.prevA && (p.onGround || p.coyote > 0)) { p.vy = -432; p.onGround = false; p.coyote = 0; p.jumpHold = 0.24; host.beep('jump'); }
      p.prevA = jump;
      var gs = 1;
      if (jump && p.vy < 0 && p.jumpHold > 0) { p.jumpHold -= dt; gs = 0.5; }
      p.vy += 1600 * gs * dt;
      if (p.vy > 640) p.vy = 640;
      moveX(dt); moveY(dt);
      if (p.y > VH + 40) die();
    }

    function updateEnemies(dt) {
      var i, e, cx, cy, y0, y1, x0, x1, by;
      for (i = enemies.length - 1; i >= 0; i--) {
        e = enemies[i];
        if (e.squash > 0) { e.squash -= dt; if (e.squash <= 0) enemies.splice(i, 1); continue; }
        e.vy += 1500 * dt; if (e.vy > 600) e.vy = 600;
        e.x += e.vx * dt;
        y0 = Math.floor((e.y + 2) / T); y1 = Math.floor((e.y + e.h - 2) / T);
        if (e.vx > 0) {
          cx = Math.floor((e.x + e.w - 0.01) / T);
          for (cy = y0; cy <= y1; cy++) if (solid(cx, cy)) { e.vx = -32; e.x = cx * T - e.w; break; }
        } else {
          cx = Math.floor(e.x / T);
          for (cy = y0; cy <= y1; cy++) if (solid(cx, cy)) { e.vx = 32; e.x = (cx + 1) * T; break; }
        }
        e.y += e.vy * dt;
        if (e.vy > 0) {
          by = Math.floor((e.y + e.h) / T);
          x0 = Math.floor((e.x + 1) / T); x1 = Math.floor((e.x + e.w - 1) / T);
          for (cx = x0; cx <= x1; cx++) if (solid(cx, by)) { e.y = by * T - e.h; e.vy = 0; break; }
        }
        if (e.y > VH + 40) { enemies.splice(i, 1); continue; }
        if (state === 'play' && p.dead <= 0 && overlap(p, e)) {
          if (p.vy > 0 && p.y + p.h - e.y < 16) { e.squash = 0.3; score += 100; p.vy = -320; host.beep('hit'); }
          else hurt();
        }
      }
    }

    function updateItems(dt) {
      var i, it, cx, cy, x0, x1, y0, y1, by;
      for (i = items.length - 1; i >= 0; i--) {
        it = items[i];
        it.vy += 1400 * dt;
        it.x += it.vx * dt;
        y0 = Math.floor((it.y + 1) / T); y1 = Math.floor((it.y + it.h - 1) / T);
        if (it.vx > 0) {
          cx = Math.floor((it.x + it.w - 0.01) / T);
          for (cy = y0; cy <= y1; cy++) if (solid(cx, cy)) { it.vx = -55; it.x = cx * T - it.w; break; }
        } else {
          cx = Math.floor(it.x / T);
          for (cy = y0; cy <= y1; cy++) if (solid(cx, cy)) { it.vx = 55; it.x = (cx + 1) * T; break; }
        }
        it.y += it.vy * dt;
        if (it.vy > 0) {
          by = Math.floor((it.y + it.h) / T);
          x0 = Math.floor((it.x + 1) / T); x1 = Math.floor((it.x + it.w - 1) / T);
          for (cx = x0; cx <= x1; cx++) if (solid(cx, by)) { it.y = by * T - it.h; it.vy = 0; break; }
        }
        if (it.y > VH + 40) { items.splice(i, 1); continue; }
        if (p.dead <= 0 && overlap(p, it)) { items.splice(i, 1); grow(); }
      }
    }

    function updateFx(dt) {
      var i, q, c;
      for (i = particles.length - 1; i >= 0; i--) {
        q = particles[i];
        q.life -= dt; q.vy += 900 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
        if (q.life <= 0) particles.splice(i, 1);
      }
      for (i = popCoins.length - 1; i >= 0; i--) {
        c = popCoins[i];
        c.t += dt; c.vy += 900 * dt; c.y += c.vy * dt;
        if (c.t > 0.55) popCoins.splice(i, 1);
      }
    }

    function win() {
      state = 'win'; score += 500; host.beep('win');
      host.setOverlay('恭喜过关！得分 ' + score + ' · 按 A 再来一局');
    }

    function update(dt) {
      if (!(dt > 0)) dt = 1 / 60;
      if (dt > 0.05) dt = 0.05;
      clock += dt;
      if (state === 'play') {
        updatePlayer(dt);
        updateEnemies(dt);
        updateItems(dt);
        var target = p.x + p.w / 2 - 200;
        if (target < 0) target = 0;
        if (target > LEVELW - VW) target = LEVELW - VW;
        camX = target;
        if (p.onGround && p.dead <= 0 && p.x > spawnX) { spawnX = p.x; spawnY = p.y; }
        if (p.x + p.w >= FLAG_X - 4 && p.y < GY) win();
      }
      updateFx(dt);
      var key = score + '|' + lives + '|' + coinsN;
      if (key !== hudKey) { hudKey = key; host.setHud({ score: score, lives: Math.max(0, lives), extra: '金币 x' + coinsN }); }
    }

    function drawCloud(ctx, x, y) {
      ctx.fillStyle = '#e8e8f0';
      ctx.fillRect(x + 8, y, 26, 8); ctx.fillRect(x, y + 8, 44, 8); ctx.fillRect(x + 6, y + 16, 32, 4);
      ctx.fillStyle = '#c8cbe0'; ctx.fillRect(x + 4, y + 18, 36, 2);
    }
    function drawBush(ctx, x, y) {
      ctx.fillStyle = '#2f9e4f'; ctx.fillRect(x, y - 10, 48, 10);
      ctx.fillStyle = '#6ee06e';
      ctx.fillRect(x + 2, y - 18, 12, 18); ctx.fillRect(x + 12, y - 26, 24, 26); ctx.fillRect(x + 32, y - 18, 12, 18);
      ctx.fillStyle = '#a8f0a8';
      ctx.fillRect(x + 18, y - 22, 4, 4); ctx.fillRect(x + 6, y - 14, 4, 4); ctx.fillRect(x + 36, y - 12, 3, 3);
    }
    function drawFlag(ctx) {
      var bx = FLAG_X, top = GY - 144;
      ctx.fillStyle = '#0f1020'; ctx.fillRect(bx - 3, GY - 8, 10, 8);
      ctx.fillStyle = '#e8e8f0'; ctx.fillRect(bx, top, 3, 144);
      ctx.fillStyle = '#ffd24a'; ctx.fillRect(bx - 2, top - 7, 7, 7);
      ctx.fillStyle = '#ff5a5a';
      var w = 2 + Math.sin(clock * 3) * 3;
      ctx.beginPath();
      ctx.moveTo(bx + 3, top + 10);
      ctx.lineTo(bx + 22 + w, top + 18);
      ctx.lineTo(bx + 3, top + 28);
      ctx.lineTo(bx + 3, top + 10);
      ctx.fill();
    }
    function drawTiles(ctx) {
      var x0 = Math.max(0, Math.floor(camX / T) - 1), x1 = Math.min(COLS - 1, Math.ceil((camX + VW) / T) + 1);
      for (var cy = 0; cy < ROWS; cy++) {
        for (var cx = x0; cx <= x1; cx++) {
          var v = grid[cy * COLS + cx];
          if (v === EMPTY || v === PIPE) continue;
          var x = cx * T, y = cy * T;
          if (v === GROUND) {
            ctx.fillStyle = '#1b1d33'; ctx.fillRect(x, y, T, T);
            ctx.fillStyle = '#2f3355'; ctx.fillRect(x + 3, y + 9, 3, 3); ctx.fillRect(x + 10, y + 12, 3, 2);
            if (!solid(cx, cy - 1)) {
              ctx.fillStyle = '#6ee06e'; ctx.fillRect(x, y, T, 5);
              ctx.fillStyle = '#3fa03f'; ctx.fillRect(x, y + 5, T, 2);
              ctx.fillStyle = '#a8f0a8';
              ctx.fillRect(x + 2, y + 1, 2, 2); ctx.fillRect(x + 9, y + 2, 3, 2); ctx.fillRect(x + 5, y - 2, 2, 2);
            }
          } else if (v === BRICK) {
            ctx.fillStyle = '#ff5a5a'; ctx.fillRect(x, y, T, T);
            ctx.fillStyle = '#0f1020';
            ctx.fillRect(x, y + 7, T, 2); ctx.fillRect(x + 7, y, 2, 7); ctx.fillRect(x + 3, y + 9, 2, 7); ctx.fillRect(x + 11, y + 9, 2, 7);
            ctx.fillStyle = '#ff8a8a'; ctx.fillRect(x + 1, y + 1, 14, 1);
          } else if (v === USED) {
            ctx.fillStyle = '#1b1d33'; ctx.fillRect(x, y, T, T);
            ctx.fillStyle = '#3a3f66'; ctx.fillRect(x + 1, y + 1, 14, 14);
            ctx.fillStyle = '#1b1d33'; ctx.fillRect(x + 2, y + 2, 12, 12);
            ctx.fillStyle = '#ffd24a'; ctx.fillRect(x + 3, y + 3, 2, 2); ctx.fillRect(x + 11, y + 11, 2, 2);
          } else {
            var blink = Math.sin(clock * 6 + cx) > -0.2;
            ctx.fillStyle = '#0f1020'; ctx.fillRect(x, y, T, T);
            ctx.fillStyle = blink ? '#ffd24a' : '#e8a63a'; ctx.fillRect(x + 1, y + 1, 14, 14);
            ctx.fillStyle = '#0f1020';
            ctx.fillRect(x + 6, y + 4, 4, 2); ctx.fillRect(x + 9, y + 6, 2, 2); ctx.fillRect(x + 8, y + 8, 2, 2);
            ctx.fillRect(x + 7, y + 10, 2, 2); ctx.fillRect(x + 7, y + 13, 2, 2);
            ctx.fillStyle = '#fff3b0'; ctx.fillRect(x + 1, y + 1, 14, 1);
          }
        }
      }
    }
    function drawPipes(ctx) {
      for (var i = 0; i < PIPES.length; i++) {
        var pp = PIPES[i], x = pp.c * T, top = (23 - pp.h) * T, hh = pp.h * T;
        ctx.fillStyle = '#0f1020'; ctx.fillRect(x - 1, top - 2, 34, hh + 2);
        ctx.fillStyle = '#6ee06e'; ctx.fillRect(x, top - 1, 32, hh + 1);
        ctx.fillStyle = '#a8f0a8'; ctx.fillRect(x + 3, top + 1, 4, hh - 1);
        ctx.fillStyle = '#2f9e4f'; ctx.fillRect(x + 25, top + 1, 4, hh - 1);
        ctx.fillStyle = '#0f1020'; ctx.fillRect(x - 2, top - 2, 36, 10);
        ctx.fillStyle = '#6ee06e'; ctx.fillRect(x - 1, top - 1, 34, 7);
        ctx.fillStyle = '#a8f0a8'; ctx.fillRect(x + 2, top, 26, 2);
      }
    }
    function drawPlayer(ctx) {
      if (p.dead > 0 && p.y > VH + 20) return;
      if (p.inv > 0 && p.dead <= 0 && Math.floor(clock * 18) % 2 === 0) return;
      var x = Math.round(p.x), y = Math.round(p.y), w = p.w, h = p.h, d = p.dir;
      var hh = Math.max(3, Math.round(h * 0.24)), fh = Math.max(4, Math.round(h * 0.26)), sh = Math.max(2, Math.round(h * 0.12));
      ctx.fillStyle = '#ff5a5a';
      ctx.fillRect(x + 2, y, w - 4, hh);
      ctx.fillRect(x, y + hh - 1, w, 2);
      ctx.fillStyle = '#ffd24a';
      ctx.fillRect(x + 2, y + hh + 1, w - 4, fh);
      ctx.fillStyle = '#0f1020';
      ctx.fillRect(x + (d > 0 ? w - 5 : 3), y + hh + 2, 2, 2);
      ctx.fillRect(x + (d > 0 ? w - 7 : 3), y + hh + fh - 1, 4, 1);
      ctx.fillStyle = '#ff5a5a';
      ctx.fillRect(x, y + hh + 1 + fh, w, sh);
      ctx.fillStyle = '#4ad6ff';
      ctx.fillRect(x + 1, y + hh + 1 + fh + sh, w - 2, h - hh - fh - sh - 3);
      ctx.fillStyle = '#ffd24a';
      ctx.fillRect(x + 3, y + hh + 1 + fh + sh, 1, 1);
      ctx.fillRect(x + w - 4, y + hh + 1 + fh + sh, 1, 1);
      var st = p.onGround ? (Math.abs(p.vx) > 20 ? Math.floor(clock * 14) % 2 : 0) : 1;
      ctx.fillStyle = '#0f1020';
      ctx.fillRect(x + 1 - st * 2, y + h - 3, 4, 3);
      ctx.fillRect(x + w - 5 + st * 2, y + h - 3, 4, 3);
    }
    function drawEnemies(ctx) {
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i], x = Math.round(e.x), y = Math.round(e.y);
        if (e.squash > 0) {
          ctx.fillStyle = '#b06cff'; ctx.fillRect(x, y + 10, 14, 4);
          ctx.fillStyle = '#0f1020'; ctx.fillRect(x + 2, y + 12, 2, 2); ctx.fillRect(x + 10, y + 12, 2, 2);
          continue;
        }
        var wob = Math.floor(clock * 8 + i) % 2;
        ctx.fillStyle = '#0f1020';
        ctx.fillRect(x + 1 + wob, y + 12, 4, 2); ctx.fillRect(x + 9 - wob, y + 12, 4, 2);
        ctx.fillStyle = '#b06cff';
        ctx.fillRect(x + 2, y + 2, 10, 10); ctx.fillRect(x + 1, y + 5, 12, 6);
        ctx.fillStyle = '#d3a8ff'; ctx.fillRect(x + 4, y + 2, 6, 2);
        ctx.fillStyle = '#e8e8f0';
        ctx.fillRect(x + 3, y + 4, 3, 4); ctx.fillRect(x + 8, y + 4, 3, 4);
        ctx.fillStyle = '#0f1020';
        ctx.fillRect(x + 4, y + 5, 1, 2); ctx.fillRect(x + 9, y + 5, 1, 2); ctx.fillRect(x + 5, y + 9, 4, 1);
      }
    }
    function drawItems(ctx) {
      for (var i = 0; i < items.length; i++) {
        var it = items[i], x = Math.round(it.x), y = Math.round(it.y);
        ctx.fillStyle = '#ff5a5a';
        ctx.fillRect(x + 1, y + 2, 12, 5); ctx.fillRect(x + 3, y, 8, 3);
        ctx.fillStyle = '#e8e8f0';
        ctx.fillRect(x + 3, y + 3, 3, 3); ctx.fillRect(x + 8, y + 3, 3, 3);
        ctx.fillStyle = '#ffd24a'; ctx.fillRect(x + 2, y + 7, 10, 5);
        ctx.fillStyle = '#0f1020';
        ctx.fillRect(x + 4, y + 8, 2, 2); ctx.fillRect(x + 8, y + 8, 2, 2);
      }
    }
    function drawFx(ctx) {
      var i, q;
      for (i = 0; i < particles.length; i++) {
        q = particles[i];
        ctx.fillStyle = q.color;
        ctx.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s);
      }
      for (i = 0; i < popCoins.length; i++) {
        q = popCoins[i];
        var w = 2 + Math.abs(Math.sin(q.t * 22)) * 6;
        ctx.fillStyle = '#ffd24a'; ctx.fillRect(q.x - w / 2, q.y - 7, w, 14);
        ctx.fillStyle = '#fff3b0'; ctx.fillRect(q.x - w / 2 + 1, q.y - 5, Math.max(1, w - 2), 3);
      }
    }

    function draw(ctx) {
      ctx.fillStyle = '#4ad6ff';
      ctx.fillRect(0, 0, VW, VH);
      var i, cx;
      for (i = 0; i < 14; i++) {
        cx = i * 230 + 30 - camX * 0.4;
        if (cx > -70 && cx < VW + 20) drawCloud(ctx, cx, 26 + (i % 3) * 32);
      }
      ctx.save();
      ctx.translate(-Math.round(camX), 0);
      for (i = 0; i < BUSHES.length; i++) drawBush(ctx, BUSHES[i] * T, GY);
      drawFlag(ctx);
      drawTiles(ctx);
      drawPipes(ctx);
      drawItems(ctx);
      drawEnemies(ctx);
      drawFx(ctx);
      drawPlayer(ctx);
      ctx.restore();
    }

    var api = {
      reset: reset,
      update: update,
      draw: draw,
      onKey: function (action, isDown) {
        if (isDown && action === 'a' && (state === 'over' || state === 'win')) reset();
      }
    };
    reset();
    return api;
  }

  var g = global.ArcadeGames = global.ArcadeGames || {};
  g.mario = { id: 'mario', title: '超级玛丽', create: create };
})(typeof window !== 'undefined' ? window : globalThis);
