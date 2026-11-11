/*
 * Floaty - the mascot of Floatify Notification, as a small dependency-free SVG animation.
 *
 * This is a plain JavaScript port of the Floaty of the promo films (Floaty.tsx and pose.ts in the
 * app's promo-video project). Same drawing, same pose model, same idle motion:
 * the clock is `frame = seconds * 60`.
 *
 *   const f = Floaty.create(hostElement);
 *   f.setPose({R: Floaty.HAND.open}, {ms: 500, ease: 'back'});
 *   f.pointAt({x: 600, y: 300});      // screen coordinates, the index finger tip goes there
 *   f.setSpeaking(true);
 *
 * With `calm: true` (prefers-reduced-motion) nothing moves by itself and every pose change is instant.
 */
(function (root) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var VB = 700; // drawing area in body units (the body radius is 100)
  var HAND_SCALE = 1.25;
  var TIP = 90; // wrist to index finger tip, in body units

  // Colours of the films (promo-video/src/theme.ts)
  var C = {
    teal: '#0AB0B0', blue: '#1E4FC8', body: '#E3F0F7', edge: '#BBD9EA',
    satLight: '#E8F4FA', satDark: '#B4D6E8', ink: '#16345F', cheek: '#FF9EB5'
  };

  /* ---------- pose model ---------- */

  function mirrorHand(h) {
    var o = assign({}, h);
    o.dx = -h.dx;
    o.rot = -h.rot;
    return o;
  }

  var HAND = {
    relaxedR: {dx: 135, dy: 60, rot: 14, index: 0.55, mid: 0.55, thumb: 0.45, thumbAng: 35, scale: 1, wave: 0},
    open: {dx: 140, dy: 10, rot: 24, index: 1, mid: 1, thumb: 1, thumbAng: 55, scale: 1, wave: 0},
    fist: {dx: 130, dy: 40, rot: 8, index: 0, mid: 0, thumb: 0.3, thumbAng: 70, scale: 1, wave: 0},
    thumbsUp: {dx: 125, dy: -10, rot: 6, index: 0, mid: 0, thumb: 1.8, thumbAng: 4, scale: 1.05, wave: 0},
    point: {dx: 125, dy: 0, rot: 90, index: 1, mid: 0, thumb: 0.5, thumbAng: 55, scale: 1, wave: 0}
  };

  var DEFAULT_POSE = {
    scale: 1, rot: 0, sx: 1, sy: 1, lookX: 0, lookY: 0, happy: 0, brow: 0, mouth: 0,
    smile: 1, wide: 0, gasp: 0, idle: 1,
    R: HAND.relaxedR, L: mirrorHand(HAND.relaxedR)
  };

  function assign(a) {
    for (var i = 1; i < arguments.length; i++) {
      var s = arguments[i];
      for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) a[k] = s[k];
    }
    return a;
  }

  /** Deep merge of plain objects; numbers and arrays are replaced. */
  function merge(base, over) {
    if (!over) return base;
    var out = assign({}, base);
    for (var k in over) {
      if (!Object.prototype.hasOwnProperty.call(over, k)) continue;
      var v = over[k];
      var b = base[k];
      out[k] = v !== null && typeof v === 'object' && b !== null && typeof b === 'object' ? merge(b, v) : v;
    }
    return out;
  }

  function lerp(a, b, t) {
    if (typeof a === 'number') return a + (b - a) * t;
    var out = {};
    for (var k in a) out[k] = lerp(a[k], b[k], t);
    return out;
  }

  // Same curves as Remotion's Easing (cubic, back(1.7), sin).
  var EASE = {
    inOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - 4 * Math.pow(1 - t, 3); },
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    back: function (t) { var s = 1.7, u = 1 - t; return 1 - u * u * ((s + 1) * u - s); },
    soft: function (t) { return (1 - Math.cos(Math.PI * t)) / 2; },
    linear: function (t) { return t; }
  };

  /** Wrist position and rotation so that the index finger tip touches (tx, ty) from a body at (x, y). */
  function pointHand(x, y, scale, tx, ty, gap) {
    gap = gap || 0;
    var ang = Math.atan2(tx - x, -(ty - y)); // from up, clockwise
    var dist = Math.hypot(tx - x, ty - y) / scale - TIP - gap / scale;
    var d = Math.max(125, dist);
    return assign({}, HAND.point, {dx: Math.sin(ang) * d, dy: -Math.cos(ang) * d, rot: (ang * 180) / Math.PI});
  }

  /* ---------- ready-made poses for the site ---------- */

  var POSES = {
    rest: {},
    wave: {R: assign({}, HAND.open, {dx: 150, dy: -70, rot: 12}), mouth: 0.5},
    welcome: {R: HAND.open, L: mirrorHand(HAND.open), mouth: 0.6, brow: 0.5},
    thumbsUp: {R: HAND.thumbsUp, happy: 1, mouth: 0.7},
    wow: {
      brow: 1, wide: 1, gasp: 1, sy: 1.06, sx: 0.97,
      R: assign({}, HAND.open, {dx: 118, dy: 52, rot: 6, thumb: 0.6, thumbAng: 30}),
      L: mirrorHand(assign({}, HAND.open, {dx: 118, dy: 52, rot: 6, thumb: 0.6, thumbAng: 30}))
    },
    happy: {happy: 1, mouth: 0.4}
  };

  /* ---------- drawing ---------- */

  var counter = 0;

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function setAttrs(e, attrs) {
    for (var k in attrs) e.setAttribute(k, attrs[k]);
  }

  function round(v) { return Math.round(v * 100) / 100; }

  function bump(frame, period, phase, dur) {
    dur = dur || 46;
    var p = ((frame + phase) % period) / dur;
    return p < 1 ? Math.pow(Math.sin(Math.PI * p), 2) : 0;
  }

  function blinkValue(frame) {
    function at(period, offset, dur) {
      var p = ((frame + offset) % period) / dur;
      return p < 1 ? Math.sin(Math.PI * p) : 0;
    }
    var b = Math.max(at(212, 0, 11), at(517, 40, 11), at(517, 66, 11));
    return 1 - 0.92 * b;
  }

  function buildHand(parent, uid, side) {
    var g = el('g', null, parent);
    var fillId = uid + 'hf' + (side > 0 ? 'R' : 'L');
    var rimId = uid + 'hr' + (side > 0 ? 'R' : 'L');
    var defs = el('defs', null, g);
    var rg = el('radialGradient', {id: fillId, gradientUnits: 'userSpaceOnUse', cx: -8, cy: -48, r: 64}, defs);
    el('stop', {offset: 0, 'stop-color': '#fff'}, rg);
    el('stop', {offset: 0.55, 'stop-color': C.body}, rg);
    el('stop', {offset: 1, 'stop-color': C.edge}, rg);
    var lg = el('linearGradient', {id: rimId, gradientUnits: 'userSpaceOnUse', x1: -44, y1: -72, x2: 44, y2: 6}, defs);
    el('stop', {offset: 0, 'stop-color': C.teal}, lg);
    el('stop', {offset: 1, 'stop-color': C.blue}, lg);

    function shapeGroup(url, w) {
      var sg = el('g', {fill: 'url(#' + url + ')', stroke: 'url(#' + url + ')', 'stroke-width': w, 'stroke-linejoin': 'round'}, g);
      var s = {palm: el('ellipse', {cx: 0, cy: -18, rx: 25, ry: 23}, sg), fingers: [], thumb: null};
      for (var i = 0; i < 3; i++) s.fingers.push(el('line', {'stroke-linecap': 'round'}, sg));
      s.thumb = el('line', {'stroke-linecap': 'round'}, sg);
      return s;
    }
    var rim = shapeGroup(rimId, 22);
    var fill = shapeGroup(fillId, 15);

    var cg = el('g', {stroke: C.blue, 'stroke-opacity': 0.28, 'stroke-width': 2.4, 'stroke-linecap': 'round', fill: 'none'}, g);
    var crease1 = el('path', null, cg);
    var crease2 = el('path', null, cg);
    el('ellipse', {cx: -9, cy: -30, rx: 9, ry: 5, fill: '#fff', 'fill-opacity': 0.75, transform: 'rotate(-30 -9 -30)'}, g);

    return {g: g, rim: rim, fill: fill, crease1: crease1, crease2: crease2, side: side};
  }

  function updateHand(H, h, frameOffset, frame, flick, calm) {
    var side = H.side;
    var f = frame + frameOffset;
    var wave = calm ? 0 : Math.sin(f * 0.3) * 24 * h.wave + Math.sin(f * 0.13) * 6 * h.wave;
    var bob = calm ? 0 : Math.sin(f / 38 + side) * 4;
    var dx = h.dx + (calm ? 0 : Math.cos(f / 52 + side) * 3);
    var dy = h.dy + bob - 16 * flick;
    var rot = h.rot + wave + side * 11 * flick;

    var base = -30;
    var fingerX = [-side * 14, 0, side * 14];
    var ext = [h.index, h.mid, h.mid * 0.92];
    var maxLen = [34, 38, 31];
    var lens = [];
    for (var i = 0; i < 3; i++) lens.push(1 + ext[i] * maxLen[i]);

    var tl = 4 + h.thumb * 24;
    var ta = (h.thumbAng * Math.PI) / 180;
    var tbx = -side * 19, tby = -9;
    var ttx = tbx - side * Math.sin(ta) * tl;
    var tty = tby - Math.cos(ta) * tl;

    [H.rim, H.fill].forEach(function (s) {
      for (var j = 0; j < 3; j++) {
        setAttrs(s.fingers[j], {x1: fingerX[j], y1: base, x2: fingerX[j], y2: round(base - lens[j])});
      }
      setAttrs(s.thumb, {x1: tbx, y1: tby, x2: round(ttx), y2: round(tty)});
    });
    H.crease1.setAttribute('d', 'M ' + (-side * 7) + ' ' + (base + 2) + ' L ' + (-side * 7) + ' ' + round(base - Math.max(2, lens[0] * 0.45)));
    H.crease2.setAttribute('d', 'M ' + (side * 7) + ' ' + (base + 2) + ' L ' + (side * 7) + ' ' + round(base - Math.max(2, lens[2] * 0.45)));
    H.g.setAttribute('transform', 'translate(' + round(dx) + ' ' + round(dy) + ') rotate(' + round(rot) + ') scale(' + round(h.scale * HAND_SCALE) + ')');
  }

  function buildFloaty(host) {
    var uid = 'fy' + (++counter);
    var svg = el('svg', {viewBox: -VB / 2 + ' ' + -VB / 2 + ' ' + VB + ' ' + VB, 'aria-hidden': 'true', focusable: 'false'});
    svg.style.overflow = 'visible';
    svg.style.display = 'block';
    svg.style.width = '100%';
    svg.style.height = '100%';

    var defs = el('defs', null, svg);
    var bg = el('radialGradient', {id: uid + 'body', cx: 0.325, cy: 0.275, r: 0.5, fx: 0.325, fy: 0.275}, defs);
    el('stop', {offset: 0, 'stop-color': '#fff'}, bg);
    el('stop', {offset: 0.55, 'stop-color': C.body}, bg);
    el('stop', {offset: 1, 'stop-color': C.edge}, bg);
    var rg = el('linearGradient', {id: uid + 'rim', x1: 0, y1: 0, x2: 1, y2: 1}, defs);
    el('stop', {offset: 0, 'stop-color': C.teal, 'stop-opacity': 0.9}, rg);
    el('stop', {offset: 1, 'stop-color': C.blue, 'stop-opacity': 0.9}, rg);
    var sg = el('radialGradient', {id: uid + 'sat', cx: 0.325, cy: 0.275, r: 0.5}, defs);
    el('stop', {offset: 0, 'stop-color': C.satLight}, sg);
    el('stop', {offset: 1, 'stop-color': C.satDark}, sg);
    var clip = el('clipPath', {id: uid + 'mouth'}, defs);
    var clipPath = el('path', null, clip);

    var back = el('g', null, svg); // free drawing layer behind Floaty (props), in body units
    var rootG = el('g', null, svg);

    // gasp lines
    var gaspG = el('g', {stroke: C.ink, 'stroke-width': 7, 'stroke-linecap': 'round'}, rootG);
    [-52, -26, 0, 26, 52].forEach(function (a) {
      var r = (a * Math.PI) / 180;
      el('line', {
        x1: round(Math.sin(r) * 122), y1: round(-Math.cos(r) * 122),
        x2: round(Math.sin(r) * 148), y2: round(-Math.cos(r) * 148)
      }, gaspG);
    });

    // the two little satellite bubbles
    function sat(r) {
      var g = el('g', null, rootG);
      var c = el('circle', {r: r, fill: 'url(#' + uid + 'sat)'}, g);
      var ring = el('circle', {r: r, fill: 'none', stroke: C.blue, 'stroke-opacity': 0.43, 'stroke-width': round(r * 0.12)}, g);
      var shine = el('ellipse', {rx: round(r * 0.3), ry: round(r * 0.16), fill: '#fff', 'fill-opacity': 0.7}, g);
      return {c: c, ring: ring, shine: shine, r: r};
    }
    var sat1 = sat(25);
    var sat2 = sat(16);

    // body
    var bodyG = el('g', null, rootG);
    el('circle', {cx: 0, cy: 12, r: 100, fill: C.blue, 'fill-opacity': 0.12}, bodyG);
    el('circle', {r: 100, fill: 'url(#' + uid + 'body)'}, bodyG);
    el('circle', {r: 95.5, fill: 'none', stroke: 'url(#' + uid + 'rim)', 'stroke-width': 9}, bodyG);
    el('ellipse', {cx: -42, cy: -56, rx: 31, ry: 15, fill: '#fff', 'fill-opacity': 0.7, transform: 'rotate(-26 -42 -56)'}, bodyG);

    function eye(cx) {
      var g = el('g', null, bodyG);
      var open = el('g', null, g);
      var pupil = el('ellipse', {rx: 9.5, fill: C.ink}, open);
      var glint = el('circle', {r: 3.8, fill: '#fff'}, open);
      var wide = el('g', null, g);
      var ball = el('circle', {r: 17.5, fill: '#fff', stroke: C.ink, 'stroke-width': 5}, wide);
      var dot = el('circle', {r: 6.5, fill: C.ink}, wide);
      var dotShine = el('circle', {r: 2.2, fill: '#fff'}, wide);
      var arc = el('path', {
        d: 'M ' + (cx - 14) + ' ' + (-10 + 8) + ' Q ' + cx + ' ' + (-10 - 22) + ' ' + (cx + 14) + ' ' + (-10 + 8),
        fill: 'none', stroke: C.ink, 'stroke-width': 7, 'stroke-linecap': 'round'
      }, g);
      return {cx: cx, open: open, pupil: pupil, glint: glint, wide: wide, ball: ball, dot: dot, dotShine: dotShine, arc: arc};
    }
    var eyes = [eye(-36), eye(36)];

    var browG = el('g', {stroke: C.ink, 'stroke-width': 5.5, 'stroke-linecap': 'round', fill: 'none'}, bodyG);
    var brow1 = el('path', null, browG);
    var brow2 = el('path', null, browG);
    var cheek1 = el('circle', {cx: -60, cy: 24, r: 12, fill: C.cheek}, bodyG);
    var cheek2 = el('circle', {cx: 60, cy: 24, r: 12, fill: C.cheek}, bodyG);
    var mouthG = el('g', null, bodyG);
    var mouthPath = el('path', {fill: C.ink, stroke: C.ink, 'stroke-width': 7, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'}, mouthG);
    var gaspMouth = el('ellipse', {cx: 0, cy: 48, rx: 11, ry: 15, fill: C.ink}, bodyG);
    var tongueG = el('g', {'clip-path': 'url(#' + uid + 'mouth)'}, bodyG);
    var tongue = el('ellipse', {cx: 0, rx: 15, ry: 10, fill: C.cheek}, tongueG);

    var handL = buildHand(rootG, uid, -1);
    var handR = buildHand(rootG, uid, 1);

    var front = el('g', null, svg); // free drawing layer in front of Floaty
    host.appendChild(svg);

    return {
      svg: svg, back: back, front: front, rootG: rootG, gaspG: gaspG, sat1: sat1, sat2: sat2, bodyG: bodyG, eyes: eyes,
      browG: browG, brow1: brow1, brow2: brow2, cheek1: cheek1, cheek2: cheek2,
      mouthG: mouthG, mouthPath: mouthPath, clipPath: clipPath, gaspMouth: gaspMouth,
      tongueG: tongueG, tongue: tongue, handL: handL, handR: handR
    };
  }

  function render(P, pose, frame, speaking, calm) {
    var bobY = calm ? 0 : Math.sin(frame / 38) * 7;
    var tilt = calm ? 0 : Math.sin(frame / 61) * 1.8;
    var blink = calm ? 1 : blinkValue(frame);

    var flap = speaking ? 0.16 + 0.5 * Math.abs(Math.sin(frame * 0.52)) * (0.55 + 0.45 * Math.sin(frame * 0.17 + 1)) : 0;
    var mouth = Math.max(pose.mouth, flap);

    var hp = Math.min(1, Math.max(0, (pose.happy - 0.35) / 0.3));
    var happy = hp * hp * (3 - 2 * hp);

    var flickL = calm ? 0 : bump(frame, 391, 120) * pose.idle;
    var flickR = calm ? 0 : bump(frame, 283, 40) * pose.idle;

    P.rootG.setAttribute('transform', 'translate(0 ' + round(bobY * pose.scale) + ') rotate(' + round(pose.rot + tilt) + ') scale(' + round(pose.scale) + ')');

    // gasp lines
    if (pose.gasp > 0.01) {
      P.gaspG.setAttribute('display', 'inline');
      P.gaspG.setAttribute('opacity', round(pose.gasp));
      P.gaspG.setAttribute('transform', 'scale(' + round(0.85 + 0.15 * pose.gasp) + ')');
    } else {
      P.gaspG.setAttribute('display', 'none');
    }

    // satellites
    function placeSat(s, cx, cy, ph, k) {
      var x = cx + (calm ? 0 : Math.sin(frame / 55 + ph) * k);
      var y = cy + (calm ? 0 : Math.cos(frame / 47 + ph) * k);
      var r = s.r;
      setAttrs(s.c, {cx: round(x), cy: round(y)});
      setAttrs(s.ring, {cx: round(x), cy: round(y)});
      setAttrs(s.shine, {cx: round(x - r * 0.3), cy: round(y - r * 0.4)});
    }
    placeSat(P.sat1, 115, -112, 0, 4);
    placeSat(P.sat2, 124, 41, 2, 5);

    P.bodyG.setAttribute('transform', 'scale(' + round(pose.sx) + ' ' + round(pose.sy) + ')');

    // eyes
    var eyeY = -10;
    P.eyes.forEach(function (e) {
      var ox = e.cx + pose.lookX * 6;
      var oy = eyeY + pose.lookY * 5;
      e.open.setAttribute('opacity', round((1 - happy) * (1 - pose.wide)));
      setAttrs(e.pupil, {cx: round(ox), cy: round(oy), ry: round(14 * blink)});
      setAttrs(e.glint, {cx: round(ox + 3.8), cy: round(oy - 5 * blink), display: blink > 0.5 ? 'inline' : 'none'});
      e.wide.setAttribute('opacity', round((1 - happy) * pose.wide));
      setAttrs(e.ball, {cx: round(e.cx + pose.lookX * 3), cy: round(eyeY + pose.lookY * 3)});
      setAttrs(e.dot, {cx: round(ox), cy: round(oy)});
      setAttrs(e.dotShine, {cx: round(ox + 2.2), cy: round(oy - 2.4)});
      e.arc.setAttribute('opacity', round(happy));
    });

    // brows
    if (Math.abs(pose.brow) > 0.04) {
      P.browG.setAttribute('display', 'inline');
      P.browG.setAttribute('opacity', round(Math.min(1, Math.abs(pose.brow) * 3)));
      var b = pose.brow;
      P.brow1.setAttribute('d', 'M -52 ' + round(-42 - b * 14) + ' Q -36 ' + round(-54 - b * 14) + ' -20 ' + round(-42 - b * 10));
      P.brow2.setAttribute('d', 'M 20 ' + round(-42 - b * 10) + ' Q 36 ' + round(-54 - b * 14) + ' 52 ' + round(-42 - b * 14));
    } else {
      P.browG.setAttribute('display', 'none');
    }

    var co = round(0.3 + 0.25 * happy + 0.1 * mouth);
    P.cheek1.setAttribute('fill-opacity', co);
    P.cheek2.setAttribute('fill-opacity', co);

    // mouth: one closed shape, a smile line at 0 and a laughing D at 1
    var half = 22 + 6 * mouth;
    var topC = 34 + 24 * pose.smile * (1 - mouth) - 4 * mouth;
    var botC = 34 + 24 * pose.smile + 46 * mouth;
    var d = 'M ' + round(-half) + ' 34 Q 0 ' + round(topC) + ' ' + round(half) + ' 34 Q 0 ' + round(botC) + ' ' + round(-half) + ' 34 Z';
    P.mouthPath.setAttribute('d', d);
    P.clipPath.setAttribute('d', d);
    P.mouthG.setAttribute('opacity', round(1 - pose.gasp));
    P.gaspMouth.setAttribute('opacity', round(pose.gasp));
    var tongueY = 34 + (botC - 34) / 2 - 7;
    P.tongue.setAttribute('cy', round(tongueY + 6));
    P.tongueG.setAttribute('opacity', round(Math.min(1, Math.max(0, (mouth - 0.3) * 4))));

    updateHand(P.handL, pose.L, 31, frame, flickL, calm);
    updateHand(P.handR, pose.R, 0, frame, flickR, calm);
  }

  /* ---------- the Floaty object ---------- */

  function create(host, opts) {
    opts = opts || {};
    var calm = !!opts.calm;
    var P = buildFloaty(host);
    var cur = merge(DEFAULT_POSE, opts.pose || {});
    var tween = null; // {from, to, t0, ms, ease}
    var target = cur;
    var speaking = false;
    var running = false;
    var rafId = 0;
    var clock = opts.startFrame ? opts.startFrame / 60 : 0; // seconds of "film time"
    var last = 0;
    var fixedFrame = typeof opts.frame === 'number' ? opts.frame : null;
    var onFrame = null;

    var over = null; // per-frame overrides of a few numbers (squash, rotation) that do not disturb tweens
    function view() { return over ? assign({}, cur, over) : cur; }

    function frameNow() {
      return fixedFrame !== null ? fixedFrame : clock * 60;
    }

    function step(now) {
      rafId = 0;
      if (!running) return;
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      clock += dt;
      if (tween) {
        var t = tween.ms <= 0 ? 1 : Math.min(1, (now - tween.t0) / tween.ms);
        cur = t >= 1 ? tween.to : lerp(tween.from, tween.to, EASE[tween.ease](t));
        if (t >= 1) {
          var done = tween.done;
          tween = null;
          if (done) done();
        }
      }
      render(P, view(), frameNow(), speaking, calm);
      if (onFrame) onFrame(clock);
      schedule();
    }

    function schedule() {
      if (running && !rafId && !document.hidden) rafId = requestAnimationFrame(step);
    }

    function draw() {
      render(P, view(), frameNow(), speaking, calm);
    }

    function onVis() {
      if (document.hidden) { last = 0; } else { last = 0; schedule(); }
    }
    document.addEventListener('visibilitychange', onVis);

    var api = {
      host: host,
      svg: P.svg,
      /** Free SVG layers (body units, origin at Floaty's centre) for props such as a parachute. */
      back: P.back,
      front: P.front,
      el: el,
      /** Switch reduced-motion mode on or off at runtime. */
      setCalm: function (v) {
        calm = !!v;
        if (calm) { speaking = false; tween = null; cur = target; api.stop(); }
        draw();
        return api;
      },
      /** Override plain numbers of the pose (sx, sy, rot, scale ...) on top of the current pose; null clears. */
      overlay: function (partial) {
        over = partial || null;
        if (!running || calm) draw();
        return api;
      },
      /** Set pose values right now (no tween), for code that animates them every frame. */
      set: function (partial) {
        tween = null;
        target = merge(target, partial);
        cur = target;
        if (!running || calm) draw();
        return api;
      },
      /** Animate to a (partial) pose. opts: {ms, ease, done}. Instant when calm or ms is 0. */
      setPose: function (partial, o) {
        o = o || {};
        target = merge(target, partial);
        var ms = calm ? 0 : (o.ms === undefined ? 600 : o.ms);
        if (ms <= 0) {
          tween = null;
          cur = target;
          if (o.done) o.done();
          if (!running || calm) draw();
          return api;
        }
        tween = {from: cur, to: target, t0: performance.now(), ms: ms, ease: o.ease || 'inOut', done: o.done};
        schedule();
        return api;
      },
      /** Go back to the relaxed default pose, keeping nothing of the previous one. */
      reset: function (o) {
        target = DEFAULT_POSE;
        return api.setPose({}, o);
      },
      getPose: function () { return cur; },
      getTarget: function () { return target; },
      setSpeaking: function (v) {
        speaking = !!v && !calm;
        if (!running || calm) draw();
        return api;
      },
      /**
       * Point the index finger tip of the nearer hand at a point in client (screen) coordinates.
       * Returns the pose that was set, so callers can combine it with other parts.
       */
      pointAt: function (pt, o) {
        o = o || {};
        var r = host.getBoundingClientRect();
        var pxPerUnit = (r.width / VB) * (cur.scale || 1);
        var cx = r.left + r.width / 2;
        var cy = r.top + r.height / 2;
        var tx = (pt.x - cx) / pxPerUnit;
        var ty = (pt.y - cy) / pxPerUnit;
        if (o.maxReach) {
          var dist = Math.hypot(tx, ty);
          if (dist > o.maxReach) { tx *= o.maxReach / dist; ty *= o.maxReach / dist; }
        }
        var right = o.hand ? o.hand === 'R' : tx >= 0;
        var part = {lookX: Math.max(-1, Math.min(1, (pt.x - cx) / pxPerUnit / 250)), lookY: Math.max(-1, Math.min(1, (pt.y - cy) / pxPerUnit / 250))};
        var gap = (o.gap || 6) / pxPerUnit;
        if (right) {
          part.R = pointHand(0, 0, 1, tx, ty, gap);
        } else {
          part.L = mirrorHand(pointHand(0, 0, 1, -tx, ty, gap));
        }
        if (o.mouth !== undefined) part.mouth = o.mouth;
        api.setPose(part, o);
        return part;
      },
      /** Freeze the idle clock on one film frame (used for the comparison page). */
      setFixedFrame: function (f) { fixedFrame = f; draw(); },
      onFrame: function (fn) { onFrame = fn; },
      start: function () {
        if (calm) { draw(); return api; }
        if (running) { draw(); return api; }
        running = true;
        last = 0;
        schedule();
        return api;
      },
      stop: function () {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        return api;
      },
      render: draw,
      destroy: function () {
        api.stop();
        document.removeEventListener('visibilitychange', onVis);
        if (P.svg.parentNode) P.svg.parentNode.removeChild(P.svg);
      }
    };
    draw();
    return api;
  }

  root.Floaty = {
    create: create, HAND: HAND, POSES: POSES, DEFAULT_POSE: DEFAULT_POSE, EASE: EASE,
    mirrorHand: mirrorHand, pointHand: pointHand, merge: merge, lerp: lerp, VB: VB
  };
})(window);
