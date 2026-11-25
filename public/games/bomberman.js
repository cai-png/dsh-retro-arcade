(function (global) {
  'use strict';
  var COLS = 15, ROWS = 11, TILE = 32;
  var BW = COLS * TILE, BH = ROWS * TILE, OX = (640 - BW) / 2, OY = (400 - BH) / 2;
  var WALL = 1, BRICK = 2, EMPTY = 0, TAU = Math.PI * 2;
  var SPAWN = { x: 1, y: 1 };
  var ESPAWNS = [{ x: 13, y: 1 }, { x: 13, y: 9 }, { x: 1, y: 9 }];
  var DX = [0, 0, -1, 1], DY = [-1, 1, 0, 0];
  var C = {
    bg: '#0f1020', dark: '#08090f', deep: '#1b1d33', floor: '#20233a', floor2: '#1a1d31',
    wall: '#343a63', wallHi: '#7d86c4', wallLo: '#20223a', rivet: '#575e93',
    brick: '#9c4a32', brickHi: '#d2794f', brickLo: '#62291b', white: '#e8e8f0',
    yellow: '#ffd24a', red: '#ff5a5a', cyan: '#4ad6ff', green: '#6ee06e',
    purple: '#b06cff', purpleLo: '#6a35a8', orange: '#ff9a3c', black: '#05060c'
  };
  function cellX(c) { return OX + c * TILE + TILE / 2; }
  function cellY(r) { return OY + r * TILE + TILE / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function manhattan(ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by); }
  function rect(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }
  function dot(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function create(host) {
    var map, bombs, flames, drops, enemies, player, exit, state, score, lives, maxBombs, power, wantB, prevB, msgT, time;
    function sx(p) { return p.moving ? lerp(cellX(p.fx), cellX(p.x), p.t) : cellX(p.x); }
    function sy(p) { return p.moving ? lerp(cellY(p.fy), cellY(p.y), p.t) : cellY(p.y); }
    function makeEnemy(x, y) { return { x: x, y: y, fx: x, fy: y, moving: false, t: 0, dead: false, seed: Math.random() * 9 }; }
    function aliveCount() { var n = 0; for (var i = 0; i < enemies.length; i++) if (!enemies[i].dead) n++; return n; }
    function setHud() { host.setHud({ score: score, lives: lives, extra: '敌人 ' + aliveCount() }); }

    function buildMap() {
      var x, y, i, safe;
      map = [];
      for (y = 0; y < ROWS; y++) {
        var row = [];
        for (x = 0; x < COLS; x++) {
          var edge = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
          row.push(edge || (x % 2 === 1 && y % 2 === 1) ? WALL : EMPTY);
        }
        map.push(row);
      }
      for (y = 1; y < ROWS - 1; y++) for (x = 1; x < COLS - 1; x++) {
        safe = manhattan(x, y, SPAWN.x, SPAWN.y) <= 3;
        for (i = 0; i < ESPAWNS.length; i++) if (manhattan(x, y, ESPAWNS[i].x, ESPAWNS[i].y) <= 1) safe = true;
        if (safe) { map[y][x] = EMPTY; continue; }
        if (map[y][x] === EMPTY && Math.random() < 0.6) map[y][x] = BRICK;
      }
      var bricks = [];
      for (y = 1; y < ROWS - 1; y++) for (x = 1; x < COLS - 1; x++) if (map[y][x] === BRICK) bricks.push([x, y]);
      var pos = bricks.length ? bricks[Math.floor(Math.random() * bricks.length)] : [2, 2];
      exit = { x: pos[0], y: pos[1], revealed: bricks.length === 0 };
    }

    function reset() {
      map = []; bombs = []; flames = []; drops = []; enemies = [];
      state = 'play'; score = 0; lives = 3; maxBombs = 1; power = 1; wantB = false; prevB = false; msgT = 0; time = 0;
      buildMap();
      player = { x: SPAWN.x, y: SPAWN.y, fx: SPAWN.x, fy: SPAWN.y, moving: false, t: 0, invuln: 0, dir: 'd' };
      for (var i = 0; i < ESPAWNS.length; i++) enemies.push(makeEnemy(ESPAWNS[i].x, ESPAWNS[i].y));
      host.setOverlay(null); setHud();
    }

    function bombAt(x, y) { for (var i = 0; i < bombs.length; i++) if (!bombs[i].exploded && bombs[i].x === x && bombs[i].y === y) return true; return false; }
    function canWalk(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS && map[y][x] === EMPTY && !bombAt(x, y); }
    function flameAt(x, y) { for (var i = 0; i < flames.length; i++) if (flames[i].x === x && flames[i].y === y) return true; return false; }

    function breakBrick(x, y) {
      map[y][x] = EMPTY;
      if (x === exit.x && y === exit.y) { exit.revealed = true; msgT = 1.8; host.setOverlay(aliveCount() === 0 ? '出口已开启!' : '找到出口，先清光敌人!'); }
      if (Math.random() < 0.3) {
        var type = Math.random() < 0.5 ? 'bomb' : 'power';
        if (type === 'bomb' && maxBombs >= 5) type = 'power';
        if (type === 'power' && power >= 4) type = 'bomb';
        if (!((type === 'bomb' && maxBombs >= 5) || (type === 'power' && power >= 4))) drops.push({ x: x, y: y, type: type });
      }
    }

    function addFlame(x, y, kind) {
      for (var i = 0; i < flames.length; i++) if (flames[i].x === x && flames[i].y === y) { if (flames[i].t < 0.3) flames[i].t = 0.3; return; }
      flames.push({ x: x, y: y, kind: kind, t: 0.55, dur: 0.55 });
    }

    function detonate(first) {
      var queue = [first], guard = 0, b, d, i, x, y, j;
      while (queue.length && guard++ < 64) {
        b = queue.shift();
        if (b.exploded) continue;
        b.exploded = true; host.beep('boom'); addFlame(b.x, b.y, 'c');
        for (d = 0; d < 4; d++) for (i = 1; i <= b.power; i++) {
          x = b.x + DX[d] * i; y = b.y + DY[d] * i;
          if (x < 0 || y < 0 || x >= COLS || y >= ROWS) break;
          if (map[y][x] === WALL) break;
          addFlame(x, y, 'a');
          if (map[y][x] === BRICK) { breakBrick(x, y); break; }
          for (j = 0; j < bombs.length; j++) if (!bombs[j].exploded && bombs[j].x === x && bombs[j].y === y) queue.push(bombs[j]);
        }
      }
    }

    function placeBomb() { if (state === 'play' && bombs.length < maxBombs && !bombAt(player.x, player.y)) bombs.push({ x: player.x, y: player.y, power: power, t: 2, exploded: false }); }

    function tryMove(dx, dy) {
      var nx = player.x + dx, ny = player.y + dy;
      if (!canWalk(nx, ny)) return;
      player.fx = player.x; player.fy = player.y; player.x = nx; player.y = ny; player.moving = true; player.t = 0;
      player.dir = dx ? (dx > 0 ? 'r' : 'l') : (dy > 0 ? 'd' : 'u');
    }

    function collect() {
      for (var i = drops.length - 1; i >= 0; i--) {
        var d = drops[i];
        if (d.x !== player.x || d.y !== player.y) continue;
        drops.splice(i, 1);
        if (d.type === 'bomb') maxBombs = Math.min(5, maxBombs + 1); else power = Math.min(4, power + 1);
        score += 50; host.beep('coin'); setHud();
      }
    }

    function updatePlayer(dt) {
      if (player.moving) {
        player.t += dt / 0.155;
        if (player.t >= 1) { player.moving = false; player.t = 0; player.fx = player.x; player.fy = player.y; collect(); }
        return;
      }
      var input = host.input || {};
      var ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      var iy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      if (ix) tryMove(ix, 0);
      if (!player.moving && iy) tryMove(0, iy);
    }

    function moveEnemy(e, dx, dy) { e.fx = e.x; e.fy = e.y; e.x += dx; e.y += dy; e.moving = true; e.t = 0; }

    function updateEnemies(dt) {
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (e.dead) continue;
        if (e.moving) {
          e.t += dt / 0.42;
          if (e.t >= 1) { e.moving = false; e.t = 0; e.fx = e.x; e.fy = e.y; }
          continue;
        }
        var dx = player.x - e.x, dy = player.y - e.y;
        var hx = dx === 0 ? 0 : dx > 0 ? 1 : -1, vy = dy === 0 ? 0 : dy > 0 ? 1 : -1;
        var prefs = [];
        if (Math.abs(dx) >= Math.abs(dy)) { if (hx) prefs.push([hx, 0]); if (vy) prefs.push([0, vy]); }
        else { if (vy) prefs.push([0, vy]); if (hx) prefs.push([hx, 0]); }
        prefs.push([0, 1], [0, -1], [1, 0], [-1, 0]);
        for (var k = 0; k < prefs.length; k++) if (canWalk(e.x + prefs[k][0], e.y + prefs[k][1])) { moveEnemy(e, prefs[k][0], prefs[k][1]); break; }
      }
    }

    function killPlayer() {
      if (state !== 'play' || player.invuln > 0) return;
      lives--; host.beep('hit');
      if (lives <= 0) { lives = 0; state = 'over'; setHud(); host.beep('lose'); host.setOverlay('游戏结束  按 A 重新开始'); return; }
      setHud();
      player = { x: SPAWN.x, y: SPAWN.y, fx: SPAWN.x, fy: SPAWN.y, moving: false, t: 0, invuln: 2.4, dir: 'd' };
    }

    function winGame() { if (state !== 'play') return; state = 'win'; score += 500; setHud(); host.beep('win'); host.setOverlay('过关！按 A 重新开始'); }

    function cellOfPx(v, origin) { return Math.round((v - origin - TILE / 2) / TILE); }

    function hazards(dt) {
      if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
      if (state !== 'play') return;
      if (flameAt(cellOfPx(sx(player), OX), cellOfPx(sy(player), OY))) { killPlayer(); return; }
      var pxp = sx(player), pyp = sy(player);
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (e.dead) continue;
        if (flameAt(e.x, e.y) || (e.moving && flameAt(e.fx, e.fy))) { e.dead = true; score += 200; host.beep('hit'); setHud(); continue; }
        if (Math.abs(pxp - sx(e)) < 20 && Math.abs(pyp - sy(e)) < 20) { killPlayer(); return; }
      }
    }

    function updateBombs(dt) {
      var i, live = [];
      for (i = 0; i < bombs.length; i++) bombs[i].t -= dt;
      for (i = 0; i < bombs.length; i++) if (!bombs[i].exploded && bombs[i].t <= 0) detonate(bombs[i]);
      for (i = 0; i < bombs.length; i++) if (!bombs[i].exploded) live.push(bombs[i]);
      bombs = live;
      for (i = flames.length - 1; i >= 0; i--) { flames[i].t -= dt; if (flames[i].t <= 0) flames.splice(i, 1); }
    }

    function update(dt) {
      if (!(dt > 0)) return;
      if (dt > 0.05) dt = 0.05;
      time += dt;
      var input = host.input || {};
      if (msgT > 0) { msgT -= dt; if (msgT <= 0 && state === 'play') host.setOverlay(null); }
      if (state === 'play') {
        updateBombs(dt); updateEnemies(dt); updatePlayer(dt);
        if (wantB || (input.b && !prevB)) placeBomb();
        hazards(dt);
        if (state === 'play' && exit.revealed && player.x === exit.x && player.y === exit.y && aliveCount() === 0) winGame();
      }
      wantB = false; prevB = !!input.b;
    }

    function drawFrame(ctx) {
      rect(ctx, 0, 0, 640, 400, C.bg);
      rect(ctx, OX - 20, OY - 20, BW + 40, BH + 40, C.deep);
      rect(ctx, OX - 20, OY - 20, BW + 40, 4, '#3d4478'); rect(ctx, OX - 20, OY - 20, 4, BH + 40, '#3d4478');
      rect(ctx, OX - 16, OY + BH + 16, BW + 32, 4, C.dark); rect(ctx, OX + BW + 16, OY - 16, 4, BH + 32, C.dark);
      rect(ctx, OX - 7, OY - 7, BW + 14, BH + 14, C.dark);
      rect(ctx, OX - 12, OY - 12, 4, 4, C.rivet); rect(ctx, OX + BW + 8, OY - 12, 4, 4, C.rivet);
      rect(ctx, OX - 12, OY + BH + 8, 4, 4, C.rivet); rect(ctx, OX + BW + 8, OY + BH + 8, 4, 4, C.rivet);
      ctx.fillStyle = '#4a5188'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
      var word = 'BOMBER';
      for (var i = 0; i < word.length; i++) { ctx.fillText(word.charAt(i), 30, 100 + i * 34); ctx.fillText(word.charAt(i), 610, 100 + i * 34); }
      ctx.font = 'bold 11px monospace'; ctx.fillStyle = C.yellow;
      ctx.fillText('BOMB ' + maxBombs + '  /  BLAST ' + power, 320, 392);
      ctx.textAlign = 'left';
    }

    function drawFloor(ctx) {
      for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) rect(ctx, OX + x * TILE, OY + y * TILE, TILE, TILE, (x + y) % 2 ? C.floor : C.floor2);
      for (y = 0; y < ROWS; y++) rect(ctx, OX, OY + y * TILE, BW, 1, 'rgba(255,255,255,0.03)');
    }

    function drawWall(ctx, x, y) {
      var px = OX + x * TILE, py = OY + y * TILE;
      rect(ctx, px, py, TILE, TILE, C.wall);
      rect(ctx, px + 2, py + 2, TILE - 4, 4, C.wallHi); rect(ctx, px + 2, py + 2, 4, TILE - 4, C.wallHi);
      rect(ctx, px + 2, py + TILE - 6, TILE - 4, 4, C.wallLo); rect(ctx, px + TILE - 6, py + 2, 4, TILE - 4, C.wallLo);
      rect(ctx, px + 7, py + 7, 3, 3, C.rivet); rect(ctx, px + TILE - 10, py + TILE - 10, 3, 3, C.rivet);
    }

    function drawBrick(ctx, x, y) {
      var px = OX + x * TILE, py = OY + y * TILE;
      rect(ctx, px + 1, py + 1, TILE - 2, TILE - 2, C.brickLo);
      rect(ctx, px + 2, py + 2, TILE - 4, 8, C.brick); rect(ctx, px + 2, py + 12, TILE - 4, 8, C.brick); rect(ctx, px + 2, py + 22, TILE - 4, 8, C.brick);
      rect(ctx, px + 2, py + 2, TILE - 4, 2, C.brickHi); rect(ctx, px + 2, py + 12, TILE - 4, 2, C.brickHi); rect(ctx, px + 2, py + 22, TILE - 4, 2, C.brickHi);
      rect(ctx, px + 11, py + 2, 2, 8, C.brickLo); rect(ctx, px + 21, py + 12, 2, 8, C.brickLo); rect(ctx, px + 9, py + 22, 2, 8, C.brickLo);
    }

    function drawTiles(ctx) {
      for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
        if (map[y][x] === WALL) drawWall(ctx, x, y); else if (map[y][x] === BRICK) drawBrick(ctx, x, y);
      }
    }

    function drawExit(ctx) {
      if (!exit.revealed) return;
      var px = OX + exit.x * TILE, py = OY + exit.y * TILE, open = aliveCount() === 0, pulse = 0.5 + 0.5 * Math.sin(time * 6);
      rect(ctx, px + 4, py + 6, TILE - 8, TILE - 10, C.dark);
      rect(ctx, px + 8, py + 12, TILE - 16, TILE - 18, open ? (pulse > 0.5 ? C.green : C.cyan) : '#454b6e');
      rect(ctx, px + 6, py + 8, TILE - 12, 4, open ? C.yellow : '#61678e');
      if (open) { rect(ctx, px + 15, py + 19, 2, 6, C.white); rect(ctx, px + 12, py + 22, 8, 2, C.white); }
      else rect(ctx, px + 14, py + 20, 4, 5, '#2a2e49');
    }

    function drawDrop(ctx, d) {
      var px = cellX(d.x), py = cellY(d.y) + Math.sin(time * 5 + d.x) * 2;
      dot(ctx, px, py, 13, 'rgba(255,210,74,0.25)');
      if (d.type === 'bomb') {
        dot(ctx, px, py + 1, 8, C.black); dot(ctx, px - 3, py - 2, 3, '#3b4066');
        rect(ctx, px + 4, py - 9, 3, 3, C.yellow); rect(ctx, px + 2, py - 12, 2, 2, C.yellow);
      } else {
        dot(ctx, px, py + 2, 9, C.orange); dot(ctx, px, py + 2, 5, C.yellow); rect(ctx, px - 1, py - 6, 2, 4, C.white);
      }
      rect(ctx, px + 10, py - 7, 2, 6, C.white); rect(ctx, px + 8, py - 5, 6, 2, C.white);
    }

    function drawBomb(ctx, b) {
      var px = cellX(b.x), py = cellY(b.y), blink = Math.floor(time * 10 + b.x) % 2 === 0, pulse = 1 + 0.07 * Math.sin(time * 14);
      dot(ctx, px, py + 2, 10 * pulse, C.black); dot(ctx, px - 3, py - 1, 4, '#2a2d47');
      rect(ctx, px + 1, py - 13, 3, 7, '#8a6a3a');
      dot(ctx, px + 3, py - 14, 3, blink ? C.red : C.white);
      rect(ctx, px - 8, py + 2, 3, 3, C.rivet);
    }

    function drawFlames(ctx) {
      for (var i = 0; i < flames.length; i++) {
        var f = flames[i], px = OX + f.x * TILE, py = OY + f.y * TILE, flick = Math.floor(time * 20 + f.x * 2 + f.y * 3) % 2 === 0;
        rect(ctx, px + 1, py + 1, TILE - 2, TILE - 2, flick ? C.orange : '#ffb45a');
        rect(ctx, px + 6, py + 6, TILE - 12, TILE - 12, flick ? C.yellow : C.orange);
        var core = 4 + Math.floor(10 * (f.t / f.dur));
        rect(ctx, px + 16 - core / 2, py + 16 - core / 2, core, core, C.white);
      }
    }

    function drawPlayer(ctx) {
      if (player.invuln > 0 && Math.floor(time * 16) % 2 === 0) return;
      var px = sx(player), py = sy(player);
      rect(ctx, px - 9, py + 12, 18, 4, 'rgba(0,0,0,0.35)'); rect(ctx, px - 9, py - 6, 18, 15, C.white);
      rect(ctx, px - 9, py + 1, 18, 8, C.cyan); rect(ctx, px - 6, py + 3, 12, 4, C.deep);
      rect(ctx, px - 10, py - 17, 20, 12, C.white); rect(ctx, px - 7, py - 13, 14, 5, C.deep); rect(ctx, px - 5, py - 12, 4, 3, C.cyan);
      rect(ctx, px - 1, py - 23, 2, 6, C.yellow); dot(ctx, px, py - 24, 3, C.yellow);
      rect(ctx, px - 7, py + 9, 5, 4, C.deep); rect(ctx, px + 2, py + 9, 5, 4, C.deep);
    }

    function drawEnemy(ctx, e) {
      var px = sx(e), py = sy(e), bob = Math.sin(time * 7 + e.seed) * 1.5;
      rect(ctx, px - 9, py + 12, 18, 3, 'rgba(0,0,0,0.3)'); rect(ctx, px - 10, py - 8 + bob, 20, 18, C.purple);
      rect(ctx, px - 10, py + 6 + bob, 20, 4, C.purpleLo);
      rect(ctx, px - 7, py - 4 + bob, 5, 6, C.white); rect(ctx, px + 2, py - 4 + bob, 5, 6, C.white);
      rect(ctx, px - 5, py - 2 + bob, 2, 3, C.black); rect(ctx, px + 3, py - 2 + bob, 2, 3, C.black);
      rect(ctx, px - 9, py - 12 + bob, 4, 4, C.red); rect(ctx, px + 5, py - 12 + bob, 4, 4, C.red);
      rect(ctx, px - 8, py + 10 + bob, 6, 4, C.purpleLo); rect(ctx, px + 2, py + 10 + bob, 6, 4, C.purpleLo);
    }

    function drawScan(ctx) { for (var y = OY; y < OY + BH; y += 4) rect(ctx, OX, y, BW, 1, 'rgba(0,0,0,0.12)'); }

    function draw(ctx) {
      drawFrame(ctx); drawFloor(ctx); drawTiles(ctx); drawExit(ctx);
      for (var i = 0; i < drops.length; i++) drawDrop(ctx, drops[i]);
      for (var j = 0; j < bombs.length; j++) drawBomb(ctx, bombs[j]);
      for (var k = 0; k < enemies.length; k++) if (!enemies[k].dead) drawEnemy(ctx, enemies[k]);
      drawPlayer(ctx); drawFlames(ctx); drawScan(ctx);
    }

    reset();
    return {
      reset: reset, update: update, draw: draw,
      onKey: function (action, isDown) {
        if (!isDown) return;
        if (action === 'b') wantB = true; else if (action === 'a' && state !== 'play') reset();
      }
    };
  }
  var g = global.ArcadeGames = global.ArcadeGames || {};
  g.bomberman = { id: 'bomberman', title: '炸弹人', create: create };
})(typeof window !== 'undefined' ? window : globalThis);
