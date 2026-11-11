/*
 * The two gags of Floaty on this page (a port of two entrance gags of the promo films):
 *   FloatyGags.parachute(floaty, {onLand, onDone})   Floaty drops into the hero on a parachute
 *   FloatyGags.bungee(floaty, {onBounce, onDone})    a balloon lifts Floaty up, he jumps on a bungee cord
 *
 * They draw into the free layers of the Floaty (floaty.back / floaty.front, body units) and move the
 * host element with a CSS transform. Each returns {cancel()}. guide.js decides whether they may run
 * (not with reduced motion, not when Floaty is hidden, not when they would cover a button).
 */
(function (root) {
  'use strict';

  var INK = '#16345F', TEAL = '#0AB0B0', BLUE = '#1E4FC8', ACCENT = '#FFB02E';
  var uid = 0;

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(t) { return Math.max(0, Math.min(1, t)); }
  var ease = {
    inOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    back: function (t) { var s = 1.7, u = t - 1; return 1 + u * u * ((s + 1) * u + s); },
    cos: function (t) { return 1 - Math.cos(t * Math.PI / 2); }
  };

  function timeline(fn) {
    var t0 = null, raf = 0, dead = false;
    function step(now) {
      if (dead) return;
      if (t0 === null) t0 = now;
      var more = fn((now - t0) / 1000);
      if (more !== false && !dead) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return function () { dead = true; cancelAnimationFrame(raf); };
  }

  function pose(F, over) { return F.merge(F.DEFAULT_POSE, over); }

  function holdingHands(F, x, y) {
    var r = {dx: x, dy: y, rot: 8, index: 0, mid: 0, thumb: 0.35, thumbAng: 60, scale: 1, wave: 0};
    return {R: r, L: F.mirrorHand(r)};
  }

  function moveHost(host, scale, yUnits, xUnits) {
    host.style.transform = 'translate(' + ((xUnits || 0) * scale).toFixed(2) + 'px,' + (yUnits * scale).toFixed(2) + 'px)';
  }

  /* ---------- parachute ---------- */

  function parachute(f, o) {
    o = o || {};
    var F = root.Floaty;
    var host = f.host;
    var scale = host.getBoundingClientRect().width / F.VB;
    var el = f.el;
    var L = 380, START = -560, T_LAND = 2.6;
    var DOME = 'M -150 0 Q -150 -150 0 -150 Q 150 -150 150 0 Q 100 -26 50 0 Q 0 -26 -50 0 Q -100 -26 -150 0 Z';
    var cid = 'chute' + (++uid);

    var defs = el('defs', null, f.back);
    el('path', {d: DOME}, el('clipPath', {id: cid}, defs));
    var cords = el('g', {stroke: INK, 'stroke-width': 4, 'stroke-linecap': 'round'}, f.back);
    var cordL = el('line', null, cords), cordR = el('line', null, cords);
    var can = el('g', null, f.back);
    var panels = el('g', {'clip-path': 'url(#' + cid + ')'}, can);
    [ACCENT, '#fff', TEAL, '#fff', ACCENT].forEach(function (c, i) {
      el('rect', {x: -150 + 60 * i, y: -160, width: 60, height: 180, fill: c}, panels);
    });
    el('path', {d: DOME, fill: 'none', stroke: INK, 'stroke-width': 6, 'stroke-linejoin': 'round'}, can);

    var hands = holdingHands(F, 92, -128);
    f.set(pose(F, {R: hands.R, L: hands.L, mouth: 0.5, happy: 0.7, scale: 1}));
    moveHost(host, scale, START);

    var landed = false, collapsed = false;

    var cancel = timeline(function (t) {
      var p = clamp(t / T_LAND);
      var y = START * Math.pow(1 - p, 1.5);
      var sway = 0.11 * Math.sin(t * 2.4) * (1 - p * p);
      var tx = -L * Math.sin(sway), ty = -L * Math.cos(sway);
      var q = 0; // collapse progress
      if (t > T_LAND + 0.1) q = clamp((t - T_LAND - 0.1) / 0.7);
      can.setAttribute('transform', 'translate(' + tx.toFixed(1) + ' ' + (ty + q * 90).toFixed(1) + ') rotate(' + (sway * 57.3).toFixed(2) + ') scale(1 ' + (1 - q * 0.7).toFixed(3) + ')');
      can.setAttribute('opacity', (1 - q).toFixed(3));
      cords.setAttribute('opacity', (1 - clamp(q * 2.5)).toFixed(3));
      var cs = Math.cos(sway), sn = Math.sin(sway);
      function corner(sx) { return {x: tx + (sx * 130) * cs + 4 * sn, y: ty + (sx * 130) * sn - 4 * cs}; }
      var a = corner(-1), b = corner(1);
      var hx = 92, hy = -128;
      cordL.setAttribute('x1', a.x.toFixed(1)); cordL.setAttribute('y1', a.y.toFixed(1));
      cordL.setAttribute('x2', -hx); cordL.setAttribute('y2', hy - 20);
      cordR.setAttribute('x1', b.x.toFixed(1)); cordR.setAttribute('y1', b.y.toFixed(1));
      cordR.setAttribute('x2', hx); cordR.setAttribute('y2', hy - 20);

      var sx = 1, sy = 1;
      if (t >= T_LAND) {
        var fr = (t - T_LAND) * 60;
        if (!landed) { landed = true; if (o.onLand) o.onLand(); }
        if (fr < 5) { var k = ease.out(fr / 5); sy = lerp(1, 0.78, k); sx = lerp(1, 1.18, k); }
        else if (fr < 14) { var k2 = ease.inOut((fr - 5) / 9); sy = lerp(0.78, 1.08, k2); sx = lerp(1.18, 0.95, k2); }
        else if (fr < 24) { var k3 = ease.inOut((fr - 14) / 10); sy = lerp(1.08, 1, k3); sx = lerp(0.95, 1, k3); }
        if (fr >= 24 && !collapsed) {
          collapsed = true;
          f.setPose(pose(F, F.POSES.wave), {ms: 450, ease: 'back'});
        }
      }
      if (t < T_LAND + 0.4) {
        f.overlay({sx: sx, sy: sy, rot: sway * 57.3 * 0.5});
        // keep the feet on the ground while the body squashes
        moveHost(host, scale, y + (1 - sy) * 100);
      }
      if (t >= T_LAND + 0.85) {
        finish();
        return false;
      }
    });

    function finish() {
      host.style.transform = '';
      [defs, cords, can].forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
      f.overlay(null);
      if (o.onDone) o.onDone();
    }

    return {
      cancel: function () {
        cancel();
        host.style.transform = '';
        [defs, cords, can].forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
        f.overlay(null);
      }
    };
  }

  /* ---------- bungee jump from a balloon ---------- */

  function bungee(f, o) {
    o = o || {};
    var F = root.Floaty;
    var host = f.host;
    var scale = host.getBoundingClientRect().width / F.VB;
    var el = f.el;
    var cid = 'balloon' + (++uid);

    // things that travel with Floaty (back: balloon and ropes, front: the basket)
    var pb = el('g', null, f.back);
    var pf = el('g', null, f.front);
    // the cord is drawn in world coordinates relative to Floaty's resting place
    var cordG = el('g', null, f.back);
    var cordUnder = el('line', {x1: 0, y1: 0, x2: 0, y2: 0, stroke: INK, 'stroke-width': 13, 'stroke-linecap': 'round'}, cordG);
    var cord = el('line', {x1: 0, y1: 0, x2: 0, y2: 0, stroke: ACCENT, 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-dasharray': '15 11'}, cordG);

    var defs = el('defs', null, pb);
    el('ellipse', {cx: 0, cy: -245, rx: 92, ry: 108}, el('clipPath', {id: cid}, defs));
    var env = el('g', null, pb);
    var stripes = el('g', {'clip-path': 'url(#' + cid + ')'}, env);
    [TEAL, '#fff', BLUE, '#fff', TEAL, '#fff', BLUE].forEach(function (c, i) {
      el('rect', {x: -92 + (184 / 7) * i, y: -360, width: 184 / 7 + 0.5, height: 240, fill: c}, stripes);
    });
    el('ellipse', {cx: 0, cy: -245, rx: 92, ry: 108, fill: 'none', stroke: INK, 'stroke-width': 6}, env);
    el('path', {d: 'M -22 -140 L 22 -140 L 14 -128 L -14 -128 Z', fill: INK}, env);
    el('ellipse', {cx: -36, cy: -285, rx: 16, ry: 30, fill: '#fff', 'fill-opacity': 0.55, transform: 'rotate(18 -36 -285)'}, env);
    var ropes = el('g', {stroke: INK, 'stroke-width': 4, 'stroke-linecap': 'round'}, pb);
    [[-18, -130, -56, 66], [18, -130, 56, 66], [-6, -128, -20, 66], [6, -128, 20, 66]].forEach(function (r) {
      el('line', {x1: r[0], y1: r[1], x2: r[2], y2: r[3]}, ropes);
    });
    var basket = el('g', null, pf);
    el('path', {d: 'M -66 62 L 66 62 L 56 128 Q 0 138 -56 128 Z', fill: '#D9A25B', stroke: INK, 'stroke-width': 6, 'stroke-linejoin': 'round'}, basket);
    var weave = el('g', {stroke: INK, 'stroke-opacity': 0.35, 'stroke-width': 3, 'stroke-linecap': 'round'}, basket);
    [88, 108].forEach(function (yy) { el('line', {x1: -58, y1: yy, x2: 58, y2: yy}, weave); });
    [-30, 0, 30].forEach(function (xx) { el('line', {x1: xx, y1: 66, x2: xx * 0.9, y2: 128}, weave); });
    el('rect', {x: -70, y: 56, width: 140, height: 12, rx: 6, fill: '#C98A4B', stroke: INK, 'stroke-width': 5}, basket);

    var tAppear = 0.5, tRise = 1.9, tCrouch = 2.45, tHop = 2.8, tFall = 3.05, tBounce = 3.85, tAway = 5.9, tEnd = 7.3;
    var RISE = -250, JUMP = 55, DIP = 70;
    var did = {wave: false, fall: false, bounce: false, away: false};

    f.set(pose(F, {mouth: 0.4, happy: 0.6, brow: 0.3}));

    function setProps(dy, sc) {
      var tr = 'translate(0 ' + dy.toFixed(1) + ') scale(' + sc.toFixed(3) + ')';
      pb.setAttribute('transform', tr);
      pf.setAttribute('transform', tr);
    }

    var cancel = timeline(function (t) {
      var y = 0, sx = 1, sy = 1, rot = 0, sc = 1, lift = 0, alpha = 1;
      if (t < tAppear) {
        sc = Math.max(0.01, ease.back(clamp(t / tAppear)));
        alpha = clamp(t / 0.15);
      } else if (t < tRise) {
        y = RISE * ease.inOut((t - tAppear) / (tRise - tAppear));
      } else if (t < tHop) {
        y = RISE;
        if (!did.wave) {
          did.wave = true;
          f.setPose(pose(F, {R: {dx: 150, dy: -70, rot: 12, index: 1, mid: 1, thumb: 1, thumbAng: 55, wave: 1}, mouth: 0.6, happy: 0.8}), {ms: 250});
        }
        if (t >= tCrouch) {
          var c = ease.out((t - tCrouch) / (tHop - tCrouch));
          sy = lerp(1, 0.8, c); sx = lerp(1, 1.12, c);
          y += (1 - sy) * 100;
        }
      } else if (t < tFall) {
        var h = (t - tHop) / (tFall - tHop);
        y = RISE - JUMP * Math.sin(Math.PI * h);
        var k = ease.out(Math.min(1, h * 1.6));
        sy = lerp(0.8, 1.12, k); sx = lerp(1.12, 0.92, k);
      } else if (t < tBounce) {
        if (!did.fall) { did.fall = true; f.setPose(pose(F, {wide: 1, brow: 1, gasp: 0.6, happy: 0}), {ms: 120}); }
        var p = (t - tFall) / (tBounce - tFall);
        y = lerp(RISE, DIP, ease.cos(p));
        rot = 360 * ease.inOut(p);
        sy = 1.1; sx = 0.94;
      } else {
        if (!did.bounce) {
          did.bounce = true;
          f.setPose(pose(F, {happy: 1, mouth: 0.8}), {ms: 200});
          if (o.onBounce) o.onBounce();
        }
        var fr = (t - tBounce) * 60;
        y = fr > 160 ? 0 : DIP * Math.exp(-0.0367 * fr) * Math.cos(0.157 * fr);
        var st = Math.abs(y) / DIP;
        sy = 1 + 0.08 * st; sx = 1 - 0.05 * st;
        if (t >= tAway) {
          if (!did.away) {
            did.away = true;
            f.setPose(pose(F, {R: {dx: 150, dy: -70, rot: 12, index: 1, mid: 1, thumb: 1, thumbAng: 55}, happy: 0.8, mouth: 0.5, lookY: -1}), {ms: 300});
          }
          var q = clamp((t - tAway) / 1.3);
          lift = -ease.cos(q) * 520;
          alpha = 1 - clamp((q - 0.5) / 0.5);
        }
      }

      // balloon and basket travel with Floaty until he starts to crouch, then they hang in the air
      var off = t >= tCrouch ? RISE - y : 0;
      setProps(off + lift - 40 * (1 - sc), sc);
      pb.setAttribute('opacity', alpha.toFixed(2));
      pf.setAttribute('opacity', alpha.toFixed(2));

      // the cord runs from the bottom of the basket (world) to Floaty
      var cordA = t < tHop ? 0 : t < tAway ? 1 : clamp(1 - (t - tAway) / 0.25);
      if (cordA > 0) {
        var ay = RISE + 100 - y + lift;
        [cordUnder, cord].forEach(function (cl) { cl.setAttribute('y1', ay.toFixed(1)); });
      }
      cordG.setAttribute('opacity', cordA.toFixed(2));

      f.overlay({sx: sx, sy: sy, rot: rot});
      moveHost(host, scale, y);
      if (t >= tEnd) { finish(); return false; }
    });

    function clean() {
      host.style.transform = '';
      [pb, pf, cordG].forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
      f.overlay(null);
    }
    function finish() {
      clean();
      f.setPose(pose(F, {}), {ms: 400});
      if (o.onDone) o.onDone();
    }
    return {cancel: function () { cancel(); clean(); f.setPose(pose(F, {}), {ms: 0}); }};
  }

  root.FloatyGags = {parachute: parachute, bungee: bungee};
})(window);
