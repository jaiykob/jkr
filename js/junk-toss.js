/* Junk Toss: homepage game (index.html #junk-toss).
   Drag back and let go to throw junk in an arc into the back of the truck.
   Makes in a row climb a multiplier, a clean drop is a Swish, a bounce off
   the cab is a Bank Shot. A full truck honks, drives off, adds time, and the
   next one parks farther out (and from the third truck on, it creeps).
   Built on the Scoops Co. scoop simulator: same synthesised WebAudio, same
   particle feel, same "sound only on a tap" rule. No files to load. */
(function () {
  'use strict';

  var root = document.querySelector('[data-junktoss]');
  if (!root) return;
  var canvas = root.querySelector('.jt-canvas');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx) return;

  var startEl  = root.querySelector('[data-jt-start]');
  var overEl   = root.querySelector('[data-jt-over]');
  var liveEl   = root.querySelector('[data-jt-live]');
  var soundBtn = root.querySelector('[data-jt-sound]');
  var bestEls  = root.querySelectorAll('[data-jt-best]');
  var scoreEl  = root.querySelector('[data-jt-score]');
  var newBestEl = root.querySelector('[data-jt-newbest]');

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── world ───────────────────────────────────────────────────────────── */
  // Desktop is a wide 800 x 450 field. A phone gets a closer 620 x 450 one so
  // the junk and the HUD are big enough to read; U scales the HUD text.
  var W = 800, H = 450, GROUND = 404, U = 1;
  function pickWorld() {
    W = canvas.clientWidth && canvas.clientWidth < 600 ? 620 : 800;
    U = W < 800 ? 1.4 : 1;
    canvas.style.aspectRatio = W + ' / ' + H;
  }
  var GRAV = 1500;
  var LX = 118, LY = 318;             // where the next piece of junk sits
  var ROUND_SECS = 45, TRUCK_BONUS = 10;
  var CAPACITY = 12;                  // load units to fill a truck

  var css = getComputedStyle(document.documentElement);
  function tok(n, f) { var v = css.getPropertyValue(n).trim(); return v || f; }
  var C = {
    rg: tok('--rg', '#15171A'), fg: tok('--fg', '#2B2F36'), tan: tok('--tan', '#FFD23F'),
    ltan: tok('--ltan', '#FFE58A'), dtan: tok('--dtan', '#7A5A00'), page: tok('--page', '#F5F2EA')
  };
  var FONT = "'DM Sans', sans-serif", DISPLAY = "'Bricolage Grotesque', serif";

  // r = collider radius · pts = base points · vol = load units · w = how often
  var KINDS = [
    { k: 'box',      r: 15, pts: 10, vol: 1,   w: 5 },
    { k: 'tire',     r: 15, pts: 15, vol: 1,   w: 4 },
    { k: 'chair',    r: 18, pts: 20, vol: 1.5, w: 3 },
    { k: 'tv',       r: 17, pts: 25, vol: 1.5, w: 3 },
    { k: 'mattress', r: 21, pts: 30, vol: 2.5, w: 2 },
    { k: 'couch',    r: 22, pts: 40, vol: 3,   w: 2 },
    { k: 'fridge',   r: 21, pts: 50, vol: 3,   w: 1 }
  ];
  var WSUM = KINDS.reduce(function (s, k) { return s + k.w; }, 0);
  function pickKind() {
    var n = Math.random() * WSUM;
    for (var i = 0; i < KINDS.length; i++) { n -= KINDS[i].w; if (n <= 0) return KINDS[i]; }
    return KINDS[0];
  }

  /* ── state ───────────────────────────────────────────────────────────── */
  var state = 'idle';     // idle | play | over
  var score = 0, streak = 0, timeLeft = ROUND_SECS, trucks = 0;
  var best = 0;
  try { best = parseInt(localStorage.getItem('jt-best'), 10) || 0; } catch (e) {}
  var flying = [];        // thrown junk in the air
  var hand = null;        // the piece waiting to be thrown
  var nextKind = pickKind();
  var handAt = 0;         // when the next piece may appear
  var truck = null;
  var parts = [], floats = [], shake = 0;
  var lastTick = 0;

  function newTruck(fromOffscreen) {
    var lvl = trucks + 1;
    var bedW = Math.max(130, 176 - trucks * 6);
    var amp = lvl >= 3 ? Math.min(W * 0.1, 22 * (lvl - 2)) : 0;
    // farther out each truck, but the bed and most of the cab stay on screen
    var target = W * 0.5 + Math.random() * W * 0.125 + Math.min(40, trucks * 12);
    target = Math.max(LX + 150 + amp, Math.min(target, W - bedW - 88 - amp));
    return {
      x: fromOffscreen ? W + 60 : target, target: target, base: target,
      bedW: bedW,
      fill: 0, load: [],
      mode: fromOffscreen ? 'arrive' : 'park', vx: 0,
      amp: amp,
      speed: 0.7 + lvl * 0.08, phase: 0, t: 0, bounce: 0
    };
  }
  // geometry of the truck at its current x
  function geo(t) {
    var bedL = t.x, bedR = t.x + t.bedW, floor = GROUND - 74, top = floor - 66;
    return {
      bedL: bedL, bedR: bedR, floor: floor, top: top,
      solids: [
        { x: bedL - 9, y: top, w: 9, h: floor - top, tag: 'rim' },            // tailgate
        { x: bedR, y: top - 58, w: 108, h: floor - top + 58, tag: 'cab' },    // cab
        { x: bedL - 16, y: floor, w: bedR + 108 - bedL + 28, h: GROUND - 16 - floor, tag: 'body' }
      ]
    };
  }

  /* ── audio (from the Scoops Co. simulator) ───────────────────────────── */
  var actx = null, noise = null, master = null, wet = null;
  var soundOn = true;
  try { var pref = localStorage.getItem('jt-sound'); if (pref) soundOn = pref === 'on'; } catch (e) {}
  var PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];

  function ac() {
    if (!soundOn) return null;
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { actx = new AC(); } catch (e) { return null; }
      master = actx.createGain(); master.gain.value = 0.8; master.connect(actx.destination);
      var d = actx.createDelay(0.6); d.delayTime.value = 0.113;
      var fb = actx.createGain(); fb.gain.value = 0.26;
      var lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      var send = actx.createGain(); send.gain.value = 0.22;
      d.connect(fb); fb.connect(d); d.connect(lp); lp.connect(send); send.connect(master);
      wet = d;
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function noiseBuf(a) {
    if (noise) return noise;
    var n = (a.sampleRate * 0.6) | 0, buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return (noise = buf);
  }
  function gate(a, t, peak, atk, dur, send) {
    var g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(master);
    if (send && wet) g.connect(wet);
    return g;
  }
  function tone(a, type, f0, f1, t, dur, peak, send, detune) {
    var o = a.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.85);
    if (detune) o.detune.value = detune;
    o.connect(gate(a, t, peak, Math.min(0.015, dur * 0.25), dur, send));
    o.start(t); o.stop(t + dur + 0.06);
  }
  function hiss(a, t, f0, f1, dur, peak, q, send) {
    var src = a.createBufferSource(); src.buffer = noiseBuf(a);
    var bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q || 0.9;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.9);
    src.connect(bp); bp.connect(gate(a, t, peak, 0.012, dur, send));
    src.start(t); src.stop(t + dur + 0.05);
  }
  function sThrow(power) {
    var a = ac(); if (!a) return; var t = a.currentTime + 0.005;
    hiss(a, t, 500, 1600 + power * 1400, 0.22, 0.06, 1.2);
  }
  function sLand(step, swish) {
    var a = ac(); if (!a) return; var t = a.currentTime + 0.005;
    hiss(a, t, 900, 200, 0.14, 0.08);
    tone(a, 'sine', 120, 45, t, 0.16, 0.26, false);                 // the thud in the bed
    var f = 523.25 * Math.pow(2, PENTA[Math.min(step, PENTA.length - 1)] / 12);
    tone(a, 'triangle', f, f, t + 0.02, 0.075, 0.16, false);
    tone(a, 'triangle', f * 1.5, f * 1.5, t + 0.075, 0.26, 0.17, true);
    tone(a, 'sine', f * 4, f * 4, t + 0.085, 0.14, 0.045, true);
    if (swish) hiss(a, t + 0.05, 3000, 7000, 0.25, 0.04, 0.5, true);
  }
  function sClank() {
    var a = ac(); if (!a) return; var t = a.currentTime + 0.005;
    tone(a, 'triangle', 880, 820, t, 0.18, 0.09, true);
    tone(a, 'square', 1330, 1250, t, 0.08, 0.03, true);
  }
  function sMiss() {
    var a = ac(); if (!a) return; var t = a.currentTime + 0.005;
    tone(a, 'sine', 90, 50, t, 0.18, 0.22, false);
    tone(a, 'triangle', 196, 147, t + 0.04, 0.22, 0.06, false);
  }
  function sHonk() {
    var a = ac(); if (!a) return; var t = a.currentTime + 0.01;
    [0, 0.26].forEach(function (d) {
      tone(a, 'square', 330, 330, t + d, 0.2, 0.05, false);
      tone(a, 'square', 415, 415, t + d, 0.2, 0.05, false);
    });
  }
  function sFull() {
    var a = ac(); if (!a) return; var t = a.currentTime + 0.02;
    hiss(a, t, 400, 3800, 0.36, 0.055, 0.7, true);
    var run = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
    run.forEach(function (f, i) {
      var tt = t + 0.3 + i * 0.082;
      tone(a, 'sawtooth', f, f, tt, 0.4, 0.05, true, -7);
      tone(a, 'sawtooth', f, f, tt, 0.4, 0.05, true, 7);
      tone(a, 'triangle', f * 2, f * 2, tt, 0.22, 0.03, true);
    });
    var land = t + 0.3 + run.length * 0.082 + 0.04;
    [523.25, 659.25, 783.99, 1174.66].forEach(function (f, i) {
      tone(a, 'triangle', f, f, land + i * 0.012, 1.4, 0.08, true);
    });
    tone(a, 'sine', 130.81, 130.81, land, 1.2, 0.15, false);
  }
  function sTick() {
    var a = ac(); if (!a) return; var t = a.currentTime + 0.005;
    tone(a, 'square', 1760, 1760, t, 0.04, 0.03, false);
  }
  function sOver() {
    var a = ac(); if (!a) return; var t = a.currentTime + 0.02;
    [783.99, 659.25, 523.25, 392].forEach(function (f, i) {
      tone(a, 'triangle', f, f, t + i * 0.12, 0.3, 0.09, true);
    });
  }

  /* ── effects ─────────────────────────────────────────────────────────── */
  function burst(x, y, n, colors, spd, up, grav) {
    if (reduced) n = Math.ceil(n / 4);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = spd * (0.35 + Math.random() * 0.65);
      parts.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - up, g: grav,
        sz: 1.5 + Math.random() * 3, age: 0, life: 0.5 + Math.random() * 0.6,
        rot: Math.random() * 6.28, vr: Math.random() * 12 - 6, sq: Math.random() < 0.5,
        c: colors[(Math.random() * colors.length) | 0], spark: colors === SPARK
      });
    }
  }
  var DUST = ['#8A6A3A', '#6B4A2B', '#B89A6A', '#A58C66'];
  var SPARK = ['#FFD23F', '#F0E0B4', '#FFFFFF', '#FFD27A'];
  var CONFETTI = ['#FFD23F', '#F0E0B4', '#A8D67C', '#FFFFFF', '#E86A4A'];
  function floatText(x, y, text, big, color) {
    floats.push({ x: x, y: y, text: text, age: 0, life: big ? 1.3 : 0.9, big: !!big, c: color || C.rg });
  }
  function kick(n) { if (!reduced) shake = Math.max(shake, n); }

  /* ── throwing ────────────────────────────────────────────────────────── */
  var aim = null;          // { sx, sy, x, y } while dragging
  var keyAim = { ang: -0.8, pow: 0.62 };
  var usingKeys = false;
  var MAXPULL = 170, MAXV = 1180;

  function launchVel() {
    if (usingKeys) {
      var v = keyAim.pow * MAXV;
      return { vx: Math.cos(keyAim.ang) * v, vy: Math.sin(keyAim.ang) * v, p: keyAim.pow };
    }
    if (!aim) return null;
    var dx = aim.sx - aim.x, dy = aim.sy - aim.y;
    var d = Math.hypot(dx, dy);
    if (d < 12) return null;
    var p = Math.min(d, MAXPULL) / MAXPULL;
    var v = p * MAXV;
    return { vx: dx / d * v, vy: dy / d * v, p: p };
  }

  function throwIt(v) {
    if (!hand || state !== 'play' || !v) return;
    flying.push({
      kind: hand.kind, x: LX, y: LY, vx: v.vx, vy: v.vy,
      a: 0, va: (v.vx > 0 ? 1 : -1) * (5 + Math.random() * 7),
      touched: {}, caught: false, settled: false, age: 0, rest: 0, fire: mult() >= 3
    });
    sThrow(v.p);
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
    hand = null;
    handAt = performance.now() + 260;     // rapid fire: next piece is almost instant
  }

  function mult() { return Math.min(5, 1 + Math.floor(streak / 3)); }

  function surfaceAt(t, x, r) {
    var g = geo(t), s = g.floor;
    for (var i = 0; i < t.load.length; i++) {
      var o = t.load[i], ox = g.bedL + o.dx;
      if (Math.abs(ox - x) < o.kind.r + r * 0.8) s = Math.min(s, o.y - o.kind.r * 0.75);
    }
    return s;
  }

  function made(j, g) {
    j.caught = true;
    streak++;
    var m = mult();
    var swish = !j.touched.rim && !j.touched.cab && !j.touched.body && !j.touched.ground;
    var bank = !!j.touched.cab;
    var pts = j.kind.pts * m;
    if (swish) pts = Math.round(pts * 1.5);
    if (bank) pts += 25 * m;
    score += pts;
    truck.fill += j.kind.vol;
    truck.bounce = 1;
    sLand(streak - 1, swish);
    kick(3 + j.kind.vol * 1.5);
    burst(j.x, g.top + 6, 14, DUST, 160, 110, 700);
    if (m > 1 || swish) burst(j.x, g.top, 10 + m * 4, SPARK, 260, 120, 300);
    floatText(j.x, g.top - 26, '+' + pts, false, C.rg);
    if (swish) floatText(j.x, g.top - 56, 'SWISH', true, C.dtan);
    else if (bank) floatText(j.x, g.top - 56, 'BANK SHOT', true, C.dtan);
    if (streak === 3 || streak === 6 || streak === 9 || streak === 12) {
      floatText(W / 2, 120, 'x' + m + (m >= 3 ? ' ON FIRE' : ' STREAK'), true, '#E86A4A');
    }
    if (truck.fill >= CAPACITY && truck.mode !== 'leave') fullTruck();
  }

  function missed(j) {
    if (j.dead) return;
    j.dead = true;
    if (streak >= 3) floatText(Math.min(W - 60, Math.max(60, j.x)), GROUND - 60, 'Streak lost', false, '#B0412E');
    streak = 0;
    sMiss();
  }

  function fullTruck() {
    trucks++;
    truck.mode = 'leave';
    timeLeft += TRUCK_BONUS;
    score += 100 * trucks;
    sFull();
    setTimeout(sHonk, 700);
    kick(12);
    burst(truck.x + truck.bedW / 2, geo(truck).top - 20, 90, CONFETTI, 420, 220, 620);
    floatText(W / 2, 150, 'FULL TRUCK', true, C.rg);
    floatText(W / 2, 190, '+' + (100 * trucks) + '  ·  +' + TRUCK_BONUS + 's', false, C.dtan);
    say('Full truck. ' + trucks + (trucks === 1 ? ' truck' : ' trucks') + ' filled. Score ' + score + '.');
    if (navigator.vibrate) { try { navigator.vibrate([14, 60, 22]); } catch (e) {} }
  }

  function say(t) { if (liveEl) liveEl.textContent = t; }

  /* ── physics ─────────────────────────────────────────────────────────── */
  function collideRect(j, r, s) {
    var R = j.kind.r * 0.9;
    var cx = Math.max(r.x, Math.min(j.x, r.x + r.w));
    var cy = Math.max(r.y, Math.min(j.y, r.y + r.h));
    var dx = j.x - cx, dy = j.y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= R * R) return false;
    var d = Math.sqrt(d2), nx, ny;
    if (d < 0.001) { nx = 0; ny = -1; d = 0; } else { nx = dx / d; ny = dy / d; }
    j.x += nx * (R - d); j.y += ny * (R - d);
    var vn = j.vx * nx + j.vy * ny;
    if (vn < 0) {
      j.vx -= 1.5 * vn * nx; j.vy -= 1.5 * vn * ny;     // restitution 0.5
      j.vx *= 0.9; j.va *= -0.7;
      if (!j.touched[r.tag] && Math.abs(vn) > 140) { sClank(); kick(2); }
      j.touched[r.tag] = true;
    }
    return true;
  }

  function stepJunk(j, dt) {
    j.age += dt;
    var g = geo(truck);
    if (j.settled) return;
    if (j.caught) {
      // falling into the load, held between the walls
      j.vy += GRAV * dt; j.y += j.vy * dt;
      j.x += j.vx * dt; j.vx *= Math.pow(0.02, dt);
      var R = j.kind.r;
      j.x = Math.max(g.bedL + R * 0.6, Math.min(g.bedR - R * 0.6, j.x));
      var s = surfaceAt(truck, j.x, R);
      if (j.y + R * 0.75 >= s) {
        j.y = s - R * 0.75; j.settled = true;
        truck.load.push({ kind: j.kind, dx: j.x - g.bedL, y: j.y, a: j.a * 0.15 + (Math.random() - 0.5) * 0.4 });
        j.gone = true;
      }
      j.a += j.va * dt * 0.3;
      return;
    }
    j.vy += GRAV * dt;
    j.x += j.vx * dt; j.y += j.vy * dt;
    j.a += j.va * dt;
    for (var i = 0; i < g.solids.length; i++) collideRect(j, g.solids[i]);
    // into the bed?
    var R2 = j.kind.r;
    if (!j.dead && truck.mode !== 'leave' && j.vy > 0 && j.x > g.bedL + 2 && j.x < g.bedR - 2 &&
        (j.y > g.top + 2 || j.y + R2 >= surfaceAt(truck, j.x, R2))) {
      made(j, g);
      return;
    }
    // ground
    if (j.y + R2 * 0.8 > GROUND) {
      j.y = GROUND - R2 * 0.8;
      if (j.vy > 0) {
        if (!j.touched.ground) { burst(j.x, GROUND, 8, DUST, 120, 60, 600); kick(2); }
        j.vy *= -0.32; j.vx *= 0.6; j.va *= 0.5;
        j.touched.ground = true;
      }
      if (Math.abs(j.vy) < 60) { j.vy = 0; j.rest += dt; }
      if (!j.dead) missed(j);
    }
    if (j.x < -80 || j.x > W + 80 || j.y > H + 80) { if (!j.dead) missed(j); j.gone = true; }
    if (j.rest > 0.9) j.gone = true;
    if (j.age > 6) { if (!j.dead) missed(j); j.gone = true; }   // stuck on the cab roof
  }

  function stepTruck(dt) {
    var t = truck;
    t.t += dt;
    t.bounce = Math.max(0, t.bounce - dt * 4);
    if (t.mode === 'arrive') {
      t.x += (t.target - t.x) * Math.min(1, dt * 3.2);
      if (Math.abs(t.x - t.target) < 1) { t.x = t.target; t.mode = 'park'; t.t = 0; }
    } else if (t.mode === 'park') {
      if (t.amp) t.x = t.base + Math.sin(t.t * t.speed) * t.amp;
    } else if (t.mode === 'leave') {
      t.vx += 900 * dt; t.x += t.vx * dt;
      if (t.x > W + 80) truck = newTruck(true);
    }
  }

  /* ── drawing ─────────────────────────────────────────────────────────── */
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawItem(kind, x, y, a, glow) {
    var r = kind.r;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    if (glow) { ctx.shadowColor = 'rgba(255,140,60,.9)'; ctx.shadowBlur = 18; }
    switch (kind.k) {
      case 'box':
        ctx.fillStyle = '#C49A5E'; rr(-r, -r * 0.8, r * 2, r * 1.6, 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#A57D45'; ctx.fillRect(-r, -r * 0.8, r * 2, r * 0.35);
        ctx.fillStyle = '#E8D3A6'; ctx.fillRect(-r * 0.18, -r * 0.8, r * 0.36, r * 1.6);
        break;
      case 'tire':
        ctx.fillStyle = '#23262A'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#3A3F45'; ctx.lineWidth = 3;
        for (var i = 0; i < 8; i++) { var q = i * 0.785; ctx.beginPath(); ctx.moveTo(Math.cos(q) * r * 0.7, Math.sin(q) * r * 0.7); ctx.lineTo(Math.cos(q) * r * 0.95, Math.sin(q) * r * 0.95); ctx.stroke(); }
        ctx.fillStyle = '#9AA2AA'; ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#6C747C'; ctx.beginPath(); ctx.arc(0, 0, r * 0.16, 0, 6.283); ctx.fill();
        break;
      case 'chair':
        ctx.fillStyle = '#8B5A33'; ctx.fillRect(-r * 0.8, -r * 0.05, r * 1.6, r * 0.28);
        ctx.shadowBlur = 0;
        ctx.fillRect(r * 0.55, -r, r * 0.25, r);
        ctx.fillRect(-r * 0.75, r * 0.2, r * 0.18, r * 0.8); ctx.fillRect(r * 0.57, r * 0.2, r * 0.18, r * 0.8);
        ctx.fillStyle = '#A8723F'; ctx.fillRect(r * 0.4, -r * 0.95, r * 0.5, r * 0.18);
        break;
      case 'tv':
        ctx.fillStyle = '#2B2F36'; rr(-r * 1.1, -r * 0.8, r * 2.2, r * 1.45, 3); ctx.fill();
        ctx.shadowBlur = 0;
        var gr = ctx.createLinearGradient(-r, -r, r, r); gr.addColorStop(0, '#5E8196'); gr.addColorStop(1, '#2E4656');
        ctx.fillStyle = gr; ctx.fillRect(-r * 0.95, -r * 0.66, r * 1.9, r * 1.17);
        ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(-r * 0.8, -r * 0.55, r * 0.5, r * 0.12);
        ctx.fillStyle = '#2B2F36'; ctx.fillRect(-r * 0.3, r * 0.65, r * 0.6, r * 0.25);
        break;
      case 'mattress':
        ctx.fillStyle = '#EDEBE4'; rr(-r * 1.4, -r * 0.45, r * 2.8, r * 0.9, 6); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#8FB0C9'; ctx.lineWidth = 2;
        for (var m = -2; m <= 2; m++) { ctx.beginPath(); ctx.moveTo(m * r * 0.5, -r * 0.42); ctx.lineTo(m * r * 0.5, r * 0.42); ctx.stroke(); }
        ctx.strokeStyle = '#C9C5B8'; ctx.lineWidth = 1.5; rr(-r * 1.4, -r * 0.45, r * 2.8, r * 0.9, 6); ctx.stroke();
        break;
      case 'couch':
        ctx.fillStyle = '#9A3F2C'; rr(-r * 1.25, -r * 0.2, r * 2.5, r * 0.75, 5); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#7F3222'; rr(-r * 1.1, -r * 0.85, r * 2.2, r * 0.75, 5); ctx.fill();
        ctx.fillStyle = '#B34D38'; rr(-r * 1.35, -r * 0.45, r * 0.4, r * 1.0, 4); ctx.fill();
        rr(r * 0.95, -r * 0.45, r * 0.4, r * 1.0, 4); ctx.fill();
        ctx.fillStyle = '#3B2A22'; ctx.fillRect(-r * 1.05, r * 0.55, r * 0.15, r * 0.25); ctx.fillRect(r * 0.9, r * 0.55, r * 0.15, r * 0.25);
        break;
      case 'fridge':
        ctx.fillStyle = '#F2F2EF'; rr(-r * 0.7, -r * 1.2, r * 1.4, r * 2.4, 4); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#B9BDBF'; ctx.lineWidth = 1.5; rr(-r * 0.7, -r * 1.2, r * 1.4, r * 2.4, 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.35); ctx.lineTo(r * 0.7, -r * 0.35); ctx.stroke();
        ctx.fillStyle = '#9CA3A8'; ctx.fillRect(-r * 0.52, -r * 0.95, r * 0.1, r * 0.4); ctx.fillRect(-r * 0.52, -r * 0.15, r * 0.1, r * 0.6);
        break;
    }
    ctx.restore();
  }

  function drawScene() {
    // sky and ground
    var sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#DCEBF2'); sky.addColorStop(1, '#F6F1E6');
    ctx.fillStyle = sky; ctx.fillRect(-40, -40, W + 80, GROUND + 40);
    // far hills
    ctx.fillStyle = 'rgba(45,90,30,.18)';
    ctx.beginPath(); ctx.moveTo(-40, 300);
    for (var x = -40; x <= W + 40; x += 40) ctx.lineTo(x, 292 - Math.sin(x * 0.012) * 26 - Math.sin(x * 0.031) * 10);
    ctx.lineTo(W + 40, GROUND); ctx.lineTo(-40, GROUND); ctx.fill();
    // fence
    ctx.fillStyle = 'rgba(122,92,46,.28)';
    for (x = -10; x < W + 20; x += 22) ctx.fillRect(x, 318, 12, GROUND - 318);
    ctx.fillRect(-40, 332, W + 80, 6); ctx.fillRect(-40, 360, W + 80, 6);
    // lawn then driveway
    ctx.fillStyle = '#6E9A4B'; ctx.fillRect(-40, GROUND, W + 80, H - GROUND + 40);
    ctx.fillStyle = '#B9B2A4'; ctx.fillRect(W * 0.41, GROUND, W + 80, H - GROUND + 40);
    ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(-40, GROUND, W + 80, 4);
    // the junk pile the player is working through
    ctx.globalAlpha = 0.9;
    drawItem(KINDS[0], 36, GROUND - 13, -0.1);
    drawItem(KINDS[1], 64, GROUND - 13, 0);
    drawItem(KINDS[2], 44, GROUND - 38, 0.25);
    drawItem(KINDS[4], 30, GROUND - 58, -0.2);
    ctx.globalAlpha = 1;
    // launch spot
    ctx.fillStyle = 'rgba(21,23,26,.12)';
    ctx.beginPath(); ctx.ellipse(LX, GROUND - 2, 34, 7, 0, 0, 6.283); ctx.fill();
  }

  function drawTruck(t) {
    var g = geo(t);
    var bob = t.bounce * 3;
    ctx.save(); ctx.translate(0, bob);
    // load, behind the side panel
    for (var i = 0; i < t.load.length; i++) {
      var o = t.load[i];
      drawItem(o.kind, g.bedL + o.dx, o.y, o.a);
    }
    // junk that just landed drops in behind the panel too
    for (i = 0; i < flying.length; i++) if (flying[i].caught) drawItem(flying[i].kind, flying[i].x, flying[i].y, flying[i].a);
    // bed side panel
    ctx.fillStyle = C.fg; rr(g.bedL - 9, g.top, g.bedR - g.bedL + 9, g.floor - g.top, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.1)';
    for (var s = g.bedL + 14; s < g.bedR - 6; s += 26) ctx.fillRect(s, g.top + 8, 10, g.floor - g.top - 16);
    ctx.fillStyle = C.tan; ctx.fillRect(g.bedL - 9, g.top, g.bedR - g.bedL + 9, 6);
    // cab
    var cx = g.bedR, ct = g.top - 58;
    ctx.fillStyle = C.rg; rr(cx, ct, 96, g.floor - ct, 10); ctx.fill();
    ctx.fillRect(cx, g.floor - 30, 108, 30);
    ctx.fillStyle = '#BFD9E6'; rr(cx + 14, ct + 10, 58, 40, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(cx + 20, ct + 14, 10, 30);
    ctx.fillStyle = C.tan; ctx.fillRect(cx + 4, g.top + 18, 90, 5);
    ctx.fillStyle = '#FFE08A'; ctx.fillRect(cx + 100, g.floor - 24, 8, 10);
    // chassis and bumper
    ctx.fillStyle = '#2A2E33'; ctx.fillRect(g.bedL - 16, g.floor, g.bedR + 108 - g.bedL + 26, 16);
    ctx.fillStyle = C.tan; ctx.fillRect(g.bedL - 18, g.floor + 2, 10, 12);
    ctx.restore();
    // wheels (no bob)
    [g.bedL + 34, g.bedR + 58].forEach(function (wx) {
      ctx.fillStyle = '#1E2125'; ctx.beginPath(); ctx.arc(wx, GROUND - 20, 21, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#A9B0B6'; ctx.beginPath(); ctx.arc(wx, GROUND - 20, 9, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#6E757C'; ctx.lineWidth = 2;
      var spin = t.x / 21;
      for (var k = 0; k < 3; k++) {
        var q = spin + k * 2.094;
        ctx.beginPath(); ctx.moveTo(wx, GROUND - 20); ctx.lineTo(wx + Math.cos(q) * 9, GROUND - 20 + Math.sin(q) * 9); ctx.stroke();
      }
    });
  }

  function drawAim() {
    var v = launchVel();
    if (!v || !hand) return;
    // show the first stretch of the arc only; the rest is on you
    var x = LX, y = LY, vx = v.vx, vy = v.vy, dt = 1 / 30;
    for (var i = 0; i < 8; i++) {
      vy += GRAV * dt; x += vx * dt; y += vy * dt;
      ctx.globalAlpha = 0.75 * (1 - i / 8);
      ctx.fillStyle = C.rg;
      ctx.beginPath(); ctx.arc(x, y, 4 - i * 0.3, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // rubber band back to the pull point
    if (aim && !usingKeys) {
      ctx.strokeStyle = 'rgba(122,92,46,.55)'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(LX, LY); ctx.lineTo(LX - v.vx / MAXV * MAXPULL * 0.6, LY - v.vy / MAXV * MAXPULL * 0.6); ctx.stroke();
      ctx.setLineDash([]);
    }
    // power meter
    ctx.fillStyle = 'rgba(21,23,26,.15)'; rr(LX - 34, LY + 40, 68, 8, 4); ctx.fill();
    ctx.fillStyle = v.p > 0.85 ? '#E86A4A' : C.tan; rr(LX - 34, LY + 40, 68 * v.p, 8, 4); ctx.fill();
  }

  function drawHud() {
    // score
    ctx.textBaseline = 'top';
    ctx.fillStyle = C.rg; ctx.font = '600 ' + Math.round(30 * U) + 'px ' + DISPLAY; ctx.textAlign = 'left';
    ctx.fillText(String(score), 20, 14);
    var scoreW = ctx.measureText(String(score)).width;
    ctx.font = '700 ' + Math.round(12 * U) + 'px ' + FONT; ctx.fillStyle = 'rgba(21,23,26,.7)';
    ctx.fillText('BEST ' + Math.max(best, score), 22, 14 + 36 * U);
    // multiplier chip
    var m = mult();
    if (m > 1) {
      var hot = m >= 3;
      ctx.fillStyle = hot ? '#E86A4A' : C.tan;
      var pulse = hot && !reduced ? 1 + Math.sin(performance.now() / 90) * 0.06 : 1;
      ctx.save(); ctx.translate(20 + scoreW + 38 * U, 14 + 16 * U); ctx.scale(pulse * U, pulse * U);
      rr(-26, -16, 52, 32, 16); ctx.fill();
      ctx.fillStyle = hot ? '#fff' : C.rg; ctx.font = '800 17px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('x' + m, 0, 1);
      ctx.restore();
    }
    // timer bar
    var tw = W < 800 ? 150 : 220, tx = W / 2 - tw / 2, frac = Math.max(0, Math.min(1, timeLeft / ROUND_SECS));
    ctx.fillStyle = 'rgba(21,23,26,.12)'; rr(tx, 18, tw, 12 * U, 6 * U); ctx.fill();
    ctx.fillStyle = timeLeft <= 5 ? '#E86A4A' : C.rg; rr(tx, 18, Math.max(12 * U, tw * Math.min(1, frac)), 12 * U, 6 * U); ctx.fill();
    ctx.font = '700 ' + Math.round(14 * U) + 'px ' + FONT; ctx.fillStyle = timeLeft <= 5 ? '#B0412E' : C.rg; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(Math.ceil(Math.max(0, timeLeft)) + 's', W / 2, 22 + 14 * U);
    // truck load meter
    var mw = W < 800 ? 150 : 170, mh = 14 * U, mx = W - mw - 20, my = 18, f = Math.min(1, truck.fill / CAPACITY);
    ctx.fillStyle = 'rgba(21,23,26,.12)'; rr(mx, my, mw, mh, mh / 2); ctx.fill();
    ctx.fillStyle = C.tan; rr(mx, my, Math.max(mh, mw * f), mh, mh / 2); ctx.fill();
    ctx.fillStyle = 'rgba(21,23,26,.35)';
    [0.25, 0.5, 0.75].forEach(function (q) { ctx.fillRect(mx + mw * q - 1, my, 2, mh); });
    ctx.font = '700 ' + Math.round(11 * U) + 'px ' + FONT; ctx.fillStyle = C.rg; ctx.textAlign = 'right';
    var lbl = f >= 1 ? 'FULL TRUCK' : f >= 0.75 ? '3/4 TRUCK' : f >= 0.5 ? '1/2 TRUCK' : f >= 0.25 ? '1/4 TRUCK' : 'LOAD';
    ctx.fillText(lbl + (trucks && W >= 800 ? '  ·  TRUCK ' + (trucks + 1) : ''), W - 20, my + mh + 6);
    // next up
    ctx.textAlign = 'left'; ctx.font = '700 ' + Math.round(11 * U) + 'px ' + FONT; ctx.fillStyle = 'rgba(21,23,26,.7)';
    var ny = 14 + 58 * U;
    ctx.fillText('NEXT', 22, ny);
    ctx.save(); ctx.globalAlpha = 0.85;
    var nk = nextKind, sc = 14 * U / nk.r;
    ctx.translate(22 + 54 * U, ny + 8 * U); ctx.scale(sc, sc); drawItem(nk, 0, 0, 0); ctx.restore();
  }

  function draw(now) {
    var sx = 0, sy = 0;
    if (shake > 0.2) { sx = (Math.random() - 0.5) * shake; sy = (Math.random() - 0.5) * shake; }
    ctx.save(); ctx.translate(sx, sy);
    drawScene();
    drawTruck(truck);
    // junk waiting to be thrown
    if (hand) {
      var pop = Math.min(1, (now - hand.at) / 140);
      var hover = reduced ? 0 : Math.sin(now / 260) * 2;
      ctx.save(); ctx.translate(LX, LY + hover); ctx.scale(pop, pop);
      drawItem(hand.kind, 0, 0, 0, mult() >= 3);
      ctx.restore();
    }
    for (var i = 0; i < flying.length; i++) {
      var j = flying[i];
      if (j.caught) continue;
      if (j.fire && !j.caught && !reduced && Math.random() < 0.7) {
        parts.push({ x: j.x, y: j.y, vx: (Math.random() - 0.5) * 40, vy: -30, g: -60, sz: 2 + Math.random() * 3, age: 0, life: 0.35, rot: 0, vr: 0, sq: false, c: Math.random() < 0.5 ? '#FFB347' : '#E86A4A', spark: true });
      }
      drawItem(j.kind, j.x, j.y, j.a, j.fire);
    }
    // particles
    for (i = 0; i < parts.length; i++) {
      var p = parts[i], k = 1 - p.age / p.life;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.fillStyle = p.c;
      ctx.globalCompositeOperation = p.spark ? 'lighter' : 'source-over';
      var s = p.sz * (0.45 + k * 0.55);
      if (p.sq) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-s, -s * 0.7, s * 2, s * 1.4); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, 6.283); ctx.fill(); }
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (state === 'play') drawAim();
    // floating text
    for (i = 0; i < floats.length; i++) {
      var f = floats[i], t = f.age / f.life;
      var e = t < 0.15 ? t / 0.15 : 1;
      ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
      ctx.font = '800 ' + Math.round((f.big ? 28 * (0.6 + e * 0.4) : 20) * U) + 'px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.strokeText(f.text, f.x, f.y - t * 40);
      ctx.fillStyle = f.c; ctx.fillText(f.text, f.x, f.y - t * 40);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (state !== 'idle') drawHud();
  }

  /* ── loop ────────────────────────────────────────────────────────────── */
  var raf = 0, last = 0;
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.033); last = now;
    if (state === 'play') {
      if (truck.mode !== 'leave' && truck.mode !== 'arrive') timeLeft -= dt;
      if (timeLeft <= 5 && timeLeft > 0 && Math.ceil(timeLeft) !== lastTick) { lastTick = Math.ceil(timeLeft); sTick(); }
      if (!hand && now >= handAt && timeLeft > 0) { hand = { kind: nextKind, at: now }; nextKind = pickKind(); }
      if (timeLeft <= 0) { hand = null; if (!flying.length || timeLeft < -2.5) endGame(); }
    }
    stepTruck(dt);
    for (var i = flying.length - 1; i >= 0; i--) { stepJunk(flying[i], dt); if (flying[i].gone) flying.splice(i, 1); }
    for (i = parts.length - 1; i >= 0; i--) {
      var p = parts[i]; p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt; p.vx *= Math.pow(0.3, dt); p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
    for (i = floats.length - 1; i >= 0; i--) { floats[i].age += dt; if (floats[i].age >= floats[i].life) floats.splice(i, 1); }
    shake *= Math.pow(0.002, dt);
    draw(now);
    if (state === 'play' || parts.length || floats.length || flying.length || truck.mode !== 'park') raf = requestAnimationFrame(frame);
    else raf = 0;
  }
  function run() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  /* ── game flow ───────────────────────────────────────────────────────── */
  function start() {
    pickWorld(); size();
    state = 'play';
    score = 0; streak = 0; timeLeft = ROUND_SECS; trucks = 0; lastTick = 0;
    flying = []; parts = []; floats = [];
    truck = newTruck(true);
    hand = null; handAt = performance.now() + 350; nextKind = pickKind();
    usingKeys = false; aim = null;
    if (startEl) startEl.hidden = true;
    if (overEl) overEl.hidden = true;
    root.classList.add('is-playing');
    ac();   // unlock audio on this tap
    say('Game started. ' + ROUND_SECS + ' seconds.');
    try { canvas.focus({ preventScroll: true }); } catch (e) {}
    run();
  }

  function endGame() {
    state = 'over';
    root.classList.remove('is-playing');
    aim = null;
    var isBest = score > best;
    if (isBest) { best = score; try { localStorage.setItem('jt-best', String(best)); } catch (e) {} }
    paintBest();
    if (scoreEl) scoreEl.textContent = String(score);
    if (newBestEl) newBestEl.hidden = !isBest;
    sOver();
    say('Time. Score ' + score + '. ' + (isBest ? 'New best.' : 'Best ' + best + '.'));
    setTimeout(function () {
      if (overEl) overEl.hidden = false;
      var again = overEl && overEl.querySelector('[data-jt-play]');
      if (again) try { again.focus({ preventScroll: true }); } catch (e) {}
    }, 450);
  }

  function paintBest() {
    Array.prototype.forEach.call(bestEls, function (el) { el.textContent = best ? 'Best: ' + best : ''; });
  }

  /* ── input ───────────────────────────────────────────────────────────── */
  function world(ev) {
    var r = canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H };
  }
  canvas.addEventListener('pointerdown', function (ev) {
    if (state !== 'play') return;
    ev.preventDefault();
    usingKeys = false;
    var p = world(ev);
    aim = { sx: p.x, sy: p.y, x: p.x, y: p.y, id: ev.pointerId };
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  canvas.addEventListener('pointermove', function (ev) {
    if (!aim || ev.pointerId !== aim.id) return;
    var p = world(ev); aim.x = p.x; aim.y = p.y;
  });
  function release(ev) {
    if (!aim || ev.pointerId !== aim.id) return;
    var v = launchVel();
    aim = null;
    if (v && hand) throwIt(v);
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', function () { aim = null; });

  canvas.addEventListener('keydown', function (ev) {
    if (state !== 'play') return;
    var k = ev.key, step = ev.shiftKey ? 0.12 : 0.04;
    if (k === 'ArrowLeft')       keyAim.ang = Math.max(-1.45, keyAim.ang - step);
    else if (k === 'ArrowRight') keyAim.ang = Math.min(-0.1, keyAim.ang + step);
    else if (k === 'ArrowUp')    keyAim.pow = Math.min(1, keyAim.pow + step / 2);
    else if (k === 'ArrowDown')  keyAim.pow = Math.max(0.15, keyAim.pow - step / 2);
    else if (k === ' ' || k === 'Enter') { usingKeys = true; throwIt(launchVel()); ev.preventDefault(); return; }
    else return;
    usingKeys = true;
    ev.preventDefault();
  });

  Array.prototype.forEach.call(root.querySelectorAll('[data-jt-play]'), function (b) {
    b.addEventListener('click', start);
  });

  function paintSound() {
    if (!soundBtn) return;
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.classList.toggle('is-on', soundOn);
    soundBtn.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
  }
  if (soundBtn) soundBtn.addEventListener('click', function () {
    soundOn = !soundOn;
    try { localStorage.setItem('jt-sound', soundOn ? 'on' : 'off'); } catch (e) {}
    paintSound();
    if (soundOn) sLand(0, false);
  });
  paintSound();

  /* ── sizing ──────────────────────────────────────────────────────────── */
  function size() {
    var r = canvas.getBoundingClientRect();
    if (!r.width) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    if (!raf) draw(performance.now());
  }
  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      // a rotation can switch between the phone and desktop field, but never mid round
      if (state !== 'play') { pickWorld(); truck = newTruck(false); }
      size();
    }, 100);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(size);

  pickWorld();
  truck = newTruck(false);
  paintBest();
  size();
  root.classList.add('jt-ready');
})();
