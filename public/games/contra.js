(function (global) {
  'use strict';

  var W = 640, H = 400, GY = 340, LW = 1800, GRAV = 1500, TAU = 6.283;
  var PLATS = [
    { x: 210, y: 268, w: 110 }, { x: 370, y: 214, w: 90 }, { x: 520, y: 278, w: 130 },
    { x: 700, y: 236, w: 100 }, { x: 860, y: 180, w: 90 }, { x: 1010, y: 254, w: 120 },
    { x: 1180, y: 206, w: 110 }, { x: 1330, y: 270, w: 100 }, { x: 1480, y: 214, w: 100 }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function box(x, y, w, h) { return { x: x, y: y, w: w, h: h }; }
  function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function R(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  function C(ctx, x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function L(ctx, x1, y1, x2, y2, c, w) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }

  function create(host) {
    var player, foes, shots, shotsE, parts, boss, cam, score, lives, state, hudKey;

    function spawn(x, y, n, col) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * TAU, s = rnd(30, 190);
        parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: rnd(0.25, 0.7), max: 0.7, c: col || '#ffd24a', z: rnd(2, 5) });
      }
    }

    function makeFoe(kind, x, y, a, b) {
      if (kind === 's') return { kind: kind, x: x, y: y, x0: a, x1: b, dir: Math.random() < 0.5 ? -1 : 1, spd: rnd(30, 44), hp: 2, anim: rnd(0, 8), fire: rnd(0.8, 2), alive: true };
      return { kind: kind, x: x, y: y, hp: 4, anim: 0, fire: rnd(0.9, 1.8), burst: 0, gap: 0, alive: true };
    }

    function reset() {
      player = { x: 60, y: GY, vy: 0, face: 1, h: 30, onGround: true, crouch: false, moving: false, cd: 0, inv: 0, alive: true, deadT: 0, anim: 0, prevA: 0 };
      foes = [
        makeFoe('s', 300, GY, 250, 380), makeFoe('s', 560, GY, 520, 660), makeFoe('s', 800, GY, 740, 900),
        makeFoe('s', 1080, GY, 1000, 1140), makeFoe('s', 1280, GY, 1230, 1360), makeFoe('s', 1470, GY, 1440, 1540),
        makeFoe('s', 1370, 270, 1340, 1420), makeFoe('t', 430, 214), makeFoe('t', 760, 236),
        makeFoe('t', 1060, 254), makeFoe('t', 970, GY), makeFoe('t', 1160, GY)
      ];
      shots = []; shotsE = []; parts = []; boss = null;
      cam = 0; score = 0; lives = 3; state = 'play'; hudKey = '';
      host.setOverlay(null);
    }

    function pbox() { return box(player.x - 7, player.y - player.h, 14, player.h); }
    function fbox(f) { return f.kind === 's' ? box(f.x - 8, f.y - 30, 16, 30) : box(f.x - 11, f.y - 24, 22, 24); }
    function bossBox() { return box(boss.x - 36, boss.y - 30, 72, 60); }

    function shootAt(x, y, tx, ty, sp) {
      var dx = tx - x, dy = ty - y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      shotsE.push({ x: x, y: y, vx: dx / d * sp, vy: dy / d * sp });
    }

    function hurt() {
      var p = player;
      if (!p.alive || p.inv > 0 || state !== 'play') return;
      lives -= 1;
      spawn(p.x, p.y - 16, 16, '#ff5a5a');
      host.beep('hit');
      if (lives <= 0) {
        lives = 0; p.alive = false; state = 'lose';
        host.setOverlay('任务失败 · 按 Z / 空格重新开始');
        host.beep('lose');
      } else { p.alive = false; p.deadT = 0.85; p.vy = 0; }
    }

    function movePlayer(dt) {
      var p = player, inp = host.input;
      p.cd -= dt; p.inv -= dt; p.anim += dt;
      if (!p.alive) {
        p.deadT -= dt;
        if (p.deadT <= 0) { p.alive = true; p.inv = 1.2; p.y = GY; p.vy = 0; p.onGround = true; }
        return;
      }
      var dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      p.crouch = !!inp.down && p.onGround;
      p.h = p.crouch ? 20 : 30;
      if (p.crouch) dir = 0;
      if (dir) p.face = dir;
      p.moving = dir !== 0;
      p.x = clamp(p.x + dir * 165 * dt, boss ? 1180 : 12, 1560);
      if (inp.a && !p.prevA && p.onGround && !p.crouch) { p.vy = -560; p.onGround = false; host.beep('jump'); }
      p.prevA = inp.a ? 1 : 0;
      var prevY = p.y;
      p.vy += GRAV * dt;
      p.y += p.vy * dt;
      p.onGround = false;
      if (p.y >= GY) { p.y = GY; p.vy = 0; p.onGround = true; }
      for (var i = 0; i < PLATS.length; i++) {
        var pl = PLATS[i];
        if (p.vy >= 0 && prevY <= pl.y + 2 && p.y >= pl.y && p.x > pl.x - 8 && p.x < pl.x + pl.w + 8) { p.y = pl.y; p.vy = 0; p.onGround = true; }
      }
      if (inp.b && p.cd <= 0) {
        p.cd = 0.12;
        var dx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        var dy = inp.up ? -1 : 0;
        if (!p.onGround && inp.down) dy = 1;
        if (p.crouch) dy = 0;
        if (!dx && !dy) dx = p.face;
        if (dx) p.face = dx;
        var norm = dx && dy ? 0.7071 : 1;
        var mx = p.x + p.face * 11, my = p.y - (p.crouch ? 9 : 20);
        if (dy < 0) { mx = p.x + (dx ? p.face * 6 : 0); my = p.y - p.h - 2; }
        if (dy > 0) { mx = p.x; my = p.y - 4; }
        shots.push({ x: mx, y: my, vx: dx * 430 * norm, vy: dy * 430 * norm, life: 1.3 });
        host.beep('shoot');
      }
    }

    function moveFoes(dt) {
      for (var i = 0; i < foes.length; i++) {
        var f = foes[i];
        if (!f.alive) continue;
        f.anim += dt;
        if (f.kind === 's') {
          f.x += f.dir * f.spd * dt;
          if (f.x < f.x0) { f.x = f.x0; f.dir = 1; }
          if (f.x > f.x1) { f.x = f.x1; f.dir = -1; }
          f.fire -= dt;
          var dx = player.x - f.x;
          if (f.fire <= 0 && Math.abs(dx) < 330 && player.alive) {
            f.dir = dx < 0 ? -1 : 1;
            shootAt(f.x + f.dir * 10, f.y - 20, player.x, player.y - 16, 175);
            f.fire = rnd(1.4, 2.4);
          }
        } else {
          f.fire -= dt;
          if (f.burst > 0) {
            f.gap -= dt;
            if (f.gap <= 0) { shootAt(f.x, f.y - 20, player.x, player.y - 16, 160); f.burst -= 1; f.gap = 0.16; }
          } else if (f.fire <= 0 && player.alive && Math.abs(player.x - f.x) < 400) {
            f.fire = rnd(2, 2.8); f.burst = 3; f.gap = 0.1;
          }
        }
      }
    }

    function moveBoss(dt) {
      if (!boss) {
        if (player.x > 1500) {
          boss = { x: 1690, y: 200, hp: 30, max: 30, t: 0, fire: 1.2, pat: 0, hit: 0, alive: true };
          host.beep('boom');
        }
        return;
      }
      var b = boss;
      if (!b.alive) return;
      b.t += dt; b.hit -= dt;
      b.y = 200 + Math.sin(b.t * 1.1) * 50;
      b.x = 1690 + Math.sin(b.t * 0.7) * 26;
      b.fire -= dt;
      if (b.fire > 0 || !player.alive) return;
      b.fire = 1.5; b.pat += 1;
      var i, ang;
      if (b.pat % 3 === 0) {
        for (i = 0; i < 8; i++) {
          ang = i / 8 * TAU + b.t * 0.4;
          shotsE.push({ x: b.x, y: b.y, vx: Math.cos(ang) * 120, vy: Math.sin(ang) * 120 });
        }
      } else {
        var base = Math.atan2((player.y - 16) - b.y, player.x - b.x);
        for (i = -2; i <= 2; i++) {
          ang = base + i * 0.2;
          shotsE.push({ x: b.x, y: b.y + 10, vx: Math.cos(ang) * 155, vy: Math.sin(ang) * 155 });
        }
      }
    }

    function moveShots(dt) {
      var i, s, f, b = boss;
      for (i = shots.length - 1; i >= 0; i--) {
        s = shots[i];
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
        if (s.life <= 0 || s.x < -40 || s.x > LW + 40 || s.y < -40 || s.y > H + 40) { shots.splice(i, 1); continue; }
        var bb = box(s.x - 2, s.y - 2, 4, 4), consumed = false;
        for (var j = 0; j < foes.length; j++) {
          f = foes[j];
          if (!f.alive || !overlap(bb, fbox(f))) continue;
          f.hp -= 1; consumed = true;
          spawn(s.x, s.y, 2, '#ffd24a');
          if (f.hp <= 0) {
            f.alive = false;
            spawn(f.x, f.y - 16, 14, f.kind === 's' ? '#ff5a5a' : '#4ad6ff');
            score += f.kind === 's' ? 100 : 150;
            host.beep('boom');
          }
          break;
        }
        if (consumed) { shots.splice(i, 1); continue; }
        if (b && b.alive && overlap(bb, bossBox())) {
          b.hp -= 1; b.hit = 0.1; shots.splice(i, 1);
          spawn(s.x, s.y, 2, '#e8e8f0');
          if (b.hp <= 0) {
            b.alive = false; score += 1000;
            for (var k = 0; k < 4; k++) spawn(b.x + rnd(-30, 30), b.y + rnd(-25, 25), 18, k % 2 ? '#ffd24a' : '#ff5a5a');
            state = 'win';
            host.setOverlay('过关！按 Z / 空格再玩一次');
            host.beep('win');
          }
        }
      }
      for (i = shotsE.length - 1; i >= 0; i--) {
        s = shotsE[i];
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.x < cam - 60 || s.x > cam + W + 60 || s.y < -40 || s.y > H + 40) { shotsE.splice(i, 1); continue; }
        if (player.alive && overlap(box(s.x - 3, s.y - 3, 6, 6), pbox())) { shotsE.splice(i, 1); hurt(); }
      }
    }

    function moveParts(dt) {
      for (var i = parts.length - 1; i >= 0; i--) {
        var q = parts[i];
        q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 520 * dt; q.vx *= 0.98; q.life -= dt;
        if (q.life <= 0) parts.splice(i, 1);
      }
    }

    function moveCam(dt) {
      var target = boss ? LW - W : clamp(player.x - 260, 0, LW - W);
      cam += (target - cam) * Math.min(1, dt * 7);
    }

    function syncHud() {
      var extra = boss ? (boss.alive ? 'BOSS ' + boss.hp + '/30' : 'BOSS 已击破') : '进度 ' + Math.round(clamp((player.x - 60) / 1500, 0, 1) * 100) + '%';
      var key = score + '|' + lives + '|' + extra;
      if (key === hudKey) return;
      hudKey = key;
      host.setHud({ score: score, lives: lives, extra: extra });
    }

    function update(dt) {
      if (dt > 0.05) dt = 0.05;
      if (state !== 'play') return;
      movePlayer(dt);
      moveFoes(dt);
      moveBoss(dt);
      moveShots(dt);
      moveParts(dt);
      moveCam(dt);
      syncHud();
    }

    function drawSky(ctx) {
      R(ctx, 0, 0, W, 250, '#1b1d33'); R(ctx, 0, 250, W, H - 250, '#0f1020');
      C(ctx, 520 - cam * 0.06, 62, 26, '#e8e8f0'); C(ctx, 508 - cam * 0.06, 54, 24, '#1b1d33');
      for (var i = 0; i < 44; i++) {
        var sx = ((i * 97 + 31) % W - cam * 0.04 + W) % W, sy = (i * 53) % 190 + 10, sz = i % 9 === 0 ? 2 : 1;
        R(ctx, sx, sy, sz, sz, '#e8e8f0');
      }
      ctx.fillStyle = '#22243f'; ctx.beginPath(); ctx.moveTo(-20, 320);
      for (var mx = -20; mx <= W + 40; mx += 32) { var wx = mx + cam * 0.14; ctx.lineTo(mx, 218 - Math.sin(wx * 0.011) * 44 - Math.sin(wx * 0.031) * 16); }
      ctx.lineTo(W + 40, 320); ctx.fill();
      ctx.fillStyle = '#182234'; ctx.beginPath(); ctx.moveTo(-20, 336);
      for (mx = -20; mx <= W + 40; mx += 26) { wx = mx + cam * 0.3; ctx.lineTo(mx, 272 - Math.sin(wx * 0.02) * 30 - Math.sin(wx * 0.05) * 12); }
      ctx.lineTo(W + 40, 336); ctx.fill();
      for (var t = 0; t < 16; t++) {
        var tx = ((t * 73 + 18 - cam * 0.42) % 760 + 760) % 760 - 60, ty = 306 + ((t * 37) % 12);
        ctx.fillStyle = '#141b2b'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + 15, ty - 74 - (t % 3) * 12); ctx.lineTo(tx + 30, ty); ctx.fill();
        R(ctx, tx + 14, ty - 14, 3, 14, '#2a1f24');
      }
    }

    function drawGround(ctx) {
      R(ctx, 0, GY, LW, H - GY, '#241a20'); R(ctx, 0, GY, LW, 5, '#6ee06e'); R(ctx, 0, GY + 5, LW, 5, '#3a5a2c');
      for (var x = 0; x < LW; x += 28) {
        R(ctx, x + 8, GY + 16 + ((x * 5) % 34), 12, 3, (x / 28) % 2 ? '#2e2129' : '#1b1d33');
        R(ctx, x + 4, GY + 34 + ((x * 9) % 20), 6, 3, (x / 28) % 2 ? '#1b1d33' : '#2e2129');
      }
    }

    function drawPlats(ctx) {
      for (var i = 0; i < PLATS.length; i++) {
        var pl = PLATS[i];
        R(ctx, pl.x, pl.y + 3, pl.w, 13, '#1b1d33'); R(ctx, pl.x, pl.y, pl.w, 3, '#6ee06e');
        for (var x = pl.x + 6; x < pl.x + pl.w - 4; x += 16) R(ctx, x, pl.y + 9, 2, 2, '#4ad6ff');
        R(ctx, pl.x + pl.w - 4, pl.y + 3, 4, 13, '#0f1020');
      }
    }

    function drawFoe(ctx, f) {
      if (f.kind === 's') {
        var swing = Math.sin(f.anim * 12) * 3;
        R(ctx, f.x - 7 + swing, f.y - 10, 6, 10, '#2a2d4a'); R(ctx, f.x + 1 - swing, f.y - 10, 6, 10, '#2a2d4a');
        R(ctx, f.x - 8, f.y - 20, 16, 11, '#4d7a3a'); R(ctx, f.x - 4, f.y - 27, 8, 7, '#d8a06a');
        R(ctx, f.x - 6, f.y - 30, 12, 4, '#2f4d24'); R(ctx, f.x + (f.dir > 0 ? 2 : -4), f.y - 25, 2, 2, '#ff5a5a');
        R(ctx, f.dir > 0 ? f.x + 4 : f.x - 14, f.y - 19, 10, 3, '#c0c0d0');
      } else {
        var ang = Math.atan2((player.y - 16) - (f.y - 20), player.x - f.x);
        R(ctx, f.x - 12, f.y - 8, 24, 8, '#3a3f66'); R(ctx, f.x - 10, f.y - 20, 20, 12, '#1b1d33');
        C(ctx, f.x, f.y - 20, 8, '#e8e8f0'); C(ctx, f.x, f.y - 21, 3, '#ff5a5a');
        L(ctx, f.x, f.y - 21, f.x + Math.cos(ang) * 16, f.y - 21 + Math.sin(ang) * 16, '#c0c0d0', 3);
      }
    }

    function drawBoss(ctx, b) {
      var pulse = 3 + Math.sin(b.t * 6) * 1.5;
      R(ctx, b.x - 36, b.y - 30, 72, 60, '#1b1d33'); R(ctx, b.x - 30, b.y - 22, 60, 44, '#2a2d4a');
      R(ctx, b.x - 26, b.y - 18, 52, 10, '#0f1020'); R(ctx, b.x - 20, b.y - 16, 8, 6, '#ff5a5a'); R(ctx, b.x + 12, b.y - 16, 8, 6, '#ff5a5a');
      R(ctx, b.x - 42, b.y - 18, 8, 30, '#0f1020'); R(ctx, b.x + 34, b.y - 18, 8, 30, '#0f1020');
      R(ctx, b.x - 42, b.y - 6, 8, 12, '#4ad6ff'); R(ctx, b.x + 34, b.y - 6, 8, 12, '#4ad6ff');
      R(ctx, b.x - 26, b.y - 30, 8, 6, '#ffd24a'); R(ctx, b.x + 18, b.y - 30, 8, 6, '#ffd24a');
      C(ctx, b.x, b.y + 6, pulse + 3, '#b06cff'); C(ctx, b.x, b.y + 6, pulse, '#ff5a5a'); C(ctx, b.x, b.y + 6, 2, '#ffd24a');
      if (b.hit > 0) R(ctx, b.x - 36, b.y - 30, 72, 60, 'rgba(232,232,240,0.55)');
      R(ctx, b.x - 42, b.y - 48, 84, 9, '#0f1020'); R(ctx, b.x - 40, b.y - 46, 80 * (b.hp / b.max), 5, '#ff5a5a');
    }

    function drawPlayer(ctx) {
      var p = player, f = p.face, x = p.x, y = p.y;
      if (p.crouch) {
        R(ctx, x - 9, y - 6, 18, 6, '#2a2d4a'); R(ctx, x - 9, y - 12, 18, 7, '#3f6cff');
        R(ctx, x - 7, y - 18, 14, 6, '#f0b080'); R(ctx, f > 0 ? x + 2 : x - 16, y - 17, 14, 3, '#2a2d4a');
        R(ctx, x - 5, y - 24, 10, 7, '#f0b080'); R(ctx, x - 6, y - 25, 12, 2, '#2a1f24');
        R(ctx, x - 6, y - 22, 12, 3, '#ff5a5a'); R(ctx, x + (f > 0 ? 2 : -4), y - 20, 2, 2, '#0f1020');
        if (p.cd > 0.05) R(ctx, f > 0 ? x + 15 : x - 20, y - 18, 5, 4, '#ffd24a');
        return;
      }
      var swing = p.moving && p.onGround ? Math.sin(p.anim * 18) * 3 : 0;
      R(ctx, x - 7 + swing, y - 8, 6, 8, '#2a2d4a'); R(ctx, x + 1 - swing, y - 8, 6, 8, '#2a2d4a');
      R(ctx, x - 8, y - 15, 16, 8, '#3f6cff'); R(ctx, x - 8, y - 15, 16, 2, '#0f1020');
      R(ctx, x - 7, y - 24, 14, 9, '#f0b080'); R(ctx, x - 5, y - 22, 10, 1, '#d89060');
      R(ctx, x - 5, y - 19, 10, 1, '#d89060'); R(ctx, x + (f > 0 ? 4 : -8), y - 22, 5, 5, '#f0b080');
      R(ctx, f > 0 ? x + 6 : x - 18, y - 21, 12, 3, '#2a2d4a'); R(ctx, f > 0 ? x + 16 : x - 18, y - 22, 2, 2, '#e8e8f0');
      R(ctx, x - 5, y - 32, 10, 8, '#f0b080'); R(ctx, x - 6, y - 33, 12, 3, '#2a1f24');
      R(ctx, x - 6, y - 30, 12, 3, '#ff5a5a'); R(ctx, x + (f > 0 ? 2 : -4), y - 27, 2, 2, '#0f1020');
      var tx = x - f * 13;
      R(ctx, tx, y - 30, 4, 2, '#ff5a5a'); R(ctx, tx - f * 4, y - 28, 3, 2, '#ff5a5a');
      if (p.cd > 0.05) R(ctx, f > 0 ? x + 17 : x - 21, y - 23, 4, 5, '#ffd24a');
    }

    function draw(ctx) {
      var i;
      drawSky(ctx);
      ctx.save();
      ctx.translate(-Math.round(cam), 0);
      drawGround(ctx);
      drawPlats(ctx);
      for (i = 0; i < foes.length; i++) if (foes[i].alive) drawFoe(ctx, foes[i]);
      if (boss && boss.alive) drawBoss(ctx, boss);
      if (player.alive && !(player.inv > 0 && Math.floor(player.inv * 18) % 2 === 0)) drawPlayer(ctx);
      for (i = 0; i < shots.length; i++) {
        var s = shots[i];
        R(ctx, s.x - 3, s.y - 2, 6, 4, '#ffd24a'); R(ctx, s.x - 1, s.y - 1, 2, 2, '#e8e8f0');
      }
      for (i = 0; i < shotsE.length; i++) {
        C(ctx, shotsE[i].x, shotsE[i].y, 4, '#ff5a5a'); C(ctx, shotsE[i].x, shotsE[i].y, 2, '#ffd24a');
      }
      for (i = 0; i < parts.length; i++) {
        var q = parts[i], sz = Math.max(1, q.z * (q.life / q.max));
        R(ctx, q.x - sz / 2, q.y - sz / 2, sz, sz, q.c);
      }
      ctx.restore();
    }

    function onKey(action, isDown) {
      if (isDown && action === 'a' && (state === 'lose' || state === 'win')) reset();
    }

    var api = { reset: reset, update: update, draw: draw, onKey: onKey };
    reset();
    return api;
  }

  var g = global.ArcadeGames = global.ArcadeGames || {};
  g.contra = { id: 'contra', title: '魂斗罗', create: create };
})(typeof window !== 'undefined' ? window : globalThis);
