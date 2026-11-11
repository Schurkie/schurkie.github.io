/*
 * Floaty as the guide of this page.
 *
 *  - The big Floaty in the hero waves and (once per visit) lands on a parachute.
 *  - A small Floaty (the "companion") stays at the edge of the screen. It follows the section you are
 *    reading, says one short line, points at the heading, and has a "Take the tour" / "Next" button.
 *  - The cross hides it for good (remembered in this browser only); a small pill brings it back.
 *  - With "reduce motion" nothing moves by itself: no idle motion, no gags, no typing, instant poses.
 *
 * All texts come from the page (data-say, data-pose, data-* on #guide), which is generated from
 * _content/en.json. Nothing here talks to a server.
 */
(function () {
  'use strict';

  var F = window.Floaty, G = window.FloatyGags;
  var doc = document, html = doc.documentElement;
  var $ = function (id) { return doc.getElementById(id); };

  var guide = $('guide'), bubble = $('guide-bubble'), nextBtn = $('guide-next'), hideBtn = $('guide-hide');
  var bodyBtn = $('guide-floaty'), showBtn = $('guide-show'), guideHost = $('guide-host');
  var heroHost = $('hero-host'), heroBubble = $('hero-bubble'), heroStage = $('hero-stage'), tourStart = $('tour-start');
  if (!F || !guide || !bubble || !nextBtn || !hideBtn || !bodyBtn || !showBtn || !guideHost || !heroHost) return;

  var shownEl = bubble.querySelector('.t-shown'), restEl = bubble.querySelector('.t-rest');
  var KEY_HIDDEN = 'floatify.site.floatyHidden', KEY_GAGS = 'floatify.site.gagsSeen';

  function store(kind, key, val) {
    try {
      var s = kind === 'local' ? window.localStorage : window.sessionStorage;
      if (val === undefined) return s.getItem(key);
      if (val === null) s.removeItem(key); else s.setItem(key, val);
    } catch (e) { /* storage blocked: the page works without it */ }
    return null;
  }

  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : {matches: false};
  var calm = !!mq.matches;
  var hidden = store('local', KEY_HIDDEN) === '1';
  var L = {
    tour: guide.dataset.tour, next: guide.dataset.next, top: guide.dataset.top,
    hide: guide.dataset.hide, show: guide.dataset.show
  };

  /* ---------- the two Floaties ---------- */

  var waving = F.merge(F.DEFAULT_POSE, F.merge(F.POSES.wave, {R: {wave: 1}}));
  var heroF = F.create(heroHost, {pose: waving, calm: calm || hidden});
  var guideF = F.create(guideHost, {pose: F.DEFAULT_POSE, calm: calm});
  heroF.start();

  var heroVisible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      heroVisible = entries[entries.length - 1].isIntersecting;
      if (heroVisible) heroF.start(); else heroF.stop();
    }).observe(heroHost.parentNode);
  }

  /* ---------- steps ---------- */

  var steps = Array.prototype.slice.call(doc.querySelectorAll('[data-guide]'));
  var active = 0;      // index of the step that is being read
  var touring = false; // the visitor pressed "Take the tour" or "Next"
  var lock = -1;       // a step the tour scrolled to on purpose (until the visitor scrolls by hand)
  var lockY = null;    // scroll position where that tour scroll came to rest
  var gagRunning = null;

  function headingOf(step) {
    return step.querySelector('h1, h2, h3') || step;
  }

  function poseFor(step) {
    var name = step.dataset.pose || 'rest';
    return F.merge(F.DEFAULT_POSE, F.POSES[name] || {});
  }

  function isOn() {
    return !hidden && active > 0 && guide.dataset.state === 'on';
  }

  /* ---------- placement ---------- */

  var place = null; // the last placement that was applied
  var gagMinCy = 0; // while a gag runs, keep the companion low enough for its balloon to stay on screen

  function intersects(a, b) {
    return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  }

  function avoidRects() {
    var out = [];
    Array.prototype.forEach.call(doc.querySelectorAll('[data-avoid]'), function (n) {
      var r = n.getBoundingClientRect();
      if (r.width > 0 && r.bottom > 0 && r.top < window.innerHeight) out.push({l: r.left, r: r.right, t: r.top, b: r.bottom});
    });
    return out;
  }

  function hits(rect, avoid) {
    for (var i = 0; i < avoid.length; i++) if (intersects(rect, avoid[i])) return true;
    return false;
  }

  /**
   * Work out where the companion goes for a step. Returns {mode, side, u, cx, cy, bl, bw, tx, bubbleOk}
   * or null when there is no free spot (then it hides itself for a moment).
   */
  function compute(step, wantBubble) {
    var vw = window.innerWidth, vh = window.innerHeight;
    var avoid = avoidRects();
    var margin = (vw - 880) / 2;
    var mode = vw >= 1360 ? 'margin' : 'corner';
    var u = mode === 'margin' ? 0.5 : 0.3;
    var R = 115 * u;
    var barW = nextBtn.parentNode.offsetWidth || 150;
    var maxW = mode === 'margin' ? Math.min(300, margin - 24) : Math.min(300, vw - 24);
    if (wantBubble) guide.style.setProperty('--bw', maxW + 'px');
    var bh = wantBubble ? bubble.offsetHeight : 0;
    var bwReal = wantBubble ? bubble.offsetWidth : maxW;
    var sides = ['right', 'left'];
    var fallback = null;

    for (var s = 0; s < sides.length; s++) {
      var side = sides[s];
      var cx, cy, bw, bl, tx;
      if (mode === 'corner') {
        cx = side === 'right' ? vw - 62 : 62;
        cy = vh - 62;
        bw = bwReal;
        bl = (side === 'right' ? vw - 12 - bw : 12) - cx;
      } else {
        cx = side === 'right' ? vw - margin / 2 : margin / 2;
        bw = bwReal;
        bl = -bw / 2;
        var hr = headingOf(step).getBoundingClientRect();
        cy = hr.top + hr.height / 2;
        var lo = (wantBubble ? bh + R + 12 : R) + 12, hi = vh - R - 52;
        cy = Math.max(lo, Math.min(hi, cy));
      }
      cy = Math.max(cy, gagMinCy);
      tx = Math.max(26, Math.min(bw - 26, -bl));

      var body = {l: cx - R - 4, r: cx + R + 4, t: cy - R - 4, b: cy + R + 4};
      var bar;
      if (mode === 'corner') {
        bar = side === 'right'
          ? {l: cx - R - 2 - barW, r: cx - R - 2, t: cy - 20, b: cy + 20}
          : {l: cx + R + 2, r: cx + R + 2 + barW, t: cy - 20, b: cy + 20};
      } else {
        bar = {l: cx - barW / 2, r: cx + barW / 2, t: cy + R + 6, b: cy + R + 46};
      }
      if (hits(body, avoid) || hits(bar, avoid)) continue;

      var ok = true;
      if (wantBubble) {
        var bt = cy - R - 12 - bh;
        ok = !hits({l: cx + bl, r: cx + bl + bw, t: bt, b: bt + bh}, avoid);
      }
      var cand = {mode: mode, side: side, u: u, cx: cx, cy: cy, bl: bl, bw: bw, tx: tx, bubbleOk: ok};
      if (ok) return cand;
      if (!fallback) fallback = cand; // the companion fits here, only the bubble does not
    }
    return fallback;
  }

  function maxWidthFor(p) {
    return p.mode === 'margin' ? Math.min(300, (window.innerWidth - 880) / 2 - 24) : Math.min(300, window.innerWidth - 24);
  }

  function apply(p) {
    guide.style.setProperty('--u', p.u);
    guide.dataset.mode = p.mode;
    guide.dataset.side = p.side;
    guide.style.setProperty('--bl', p.bl + 'px');
    guide.style.setProperty('--bw', maxWidthFor(p) + 'px');
    guide.style.setProperty('--tx', p.tx + 'px');
    guide.style.transform = 'translate(' + Math.round(p.cx) + 'px,' + Math.round(p.cy) + 'px)';
    place = p;
  }

  function setState(on) {
    var want = on ? 'on' : 'off';
    if (guide.dataset.state === want) return;
    if (on) {
      guide.dataset.state = 'on';
      guideF.start();
    } else {
      guide.dataset.state = 'off';
      hideBubble(true);
      guideF.stop();
    }
  }

  /** Put the companion where it belongs for the current step (or hide it). */
  function layout(opts) {
    opts = opts || {};
    if (hidden || active === 0) { setState(false); return null; }
    var step = steps[active];
    var wantBubble = !bubble.hidden;
    var p = compute(step, wantBubble);
    if (!p) { setState(false); return null; }
    var wasOff = guide.dataset.state !== 'on';
    if (wasOff || opts.snap) {
      guide.classList.add('no-anim');
      apply(p);
      void guide.offsetWidth;
      guide.classList.remove('no-anim');
    } else {
      apply(p);
    }
    setState(true);
    if (wantBubble && !p.bubbleOk) hideBubble(true);
    return p;
  }

  /* ---------- the speech bubble ---------- */

  var typeTimer = 0, hideTimer = 0, hideTimer2 = 0;

  function clearTimers() {
    clearInterval(typeTimer); clearTimeout(hideTimer); clearTimeout(hideTimer2);
  }

  function hideBubble(now) {
    clearTimers();
    guideF.setSpeaking(false);
    if (bubble.hidden) return;
    if (now || calm) { bubble.hidden = true; bubble.classList.remove('is-in', 'is-out'); return; }
    bubble.classList.remove('is-in');
    bubble.classList.add('is-out');
    hideTimer2 = setTimeout(function () { bubble.hidden = true; bubble.classList.remove('is-out'); }, 220);
  }

  function say(text, holdMs) {
    clearTimers();
    if (!text) { hideBubble(true); return; }
    shownEl.textContent = '';
    restEl.textContent = text;
    bubble.classList.remove('is-in', 'is-out');
    bubble.hidden = false;
    var p = layout({snap: false});
    if (!p || !p.bubbleOk) { bubble.hidden = true; return; }
    void bubble.offsetWidth;
    if (!calm) bubble.classList.add('is-in');

    var hold = (holdMs !== undefined ? holdMs : 4000) + 60 * text.length;
    if (calm) {
      shownEl.textContent = text; restEl.textContent = '';
      hideTimer = setTimeout(function () { hideBubble(); }, hold);
      return;
    }
    var i = 0;
    guideF.setSpeaking(true);
    typeTimer = setInterval(function () {
      i++;
      shownEl.textContent = text.slice(0, i);
      restEl.textContent = text.slice(i);
      if (i >= text.length) {
        clearInterval(typeTimer);
        guideF.setSpeaking(false);
        hideTimer = setTimeout(function () { hideBubble(); }, hold);
      }
    }, 30);
  }

  /* ---------- reacting to a step ---------- */

  var poseTimers = [];
  function clearPoseTimers() { poseTimers.forEach(clearTimeout); poseTimers = []; }

  function updateLabel() {
    var last = active === steps.length - 1;
    nextBtn.textContent = last ? L.top : touring ? L.next : L.tour;
  }

  var gagged = {};

  function activate(index, why) {
    if (index === active && why !== 'force') return;
    var prev = active;
    active = index;
    updateLabel();
    clearPoseTimers();
    if (active === 0) {
      touring = false;
      updateLabel();
      layout();
      return;
    }
    var step = steps[active];

    if (gagRunning) { gagRunning.cancel(); gagRunning = null; }
    gagMinCy = 0;
    var gagLine = step.dataset.gagSay;
    var gagMayRun = G && step.id === 'modes' && gagLine && !calm && !hidden && !gagged.modes && store('session', KEY_GAGS + '.modes') !== '1' && prev !== 0;
    var p = layout();
    if (!p) return;
    if (gagMayRun) {
      var avoid = avoidRects();
      var u = p.u;
      gagMinCy = 480 * u + 10;
      p = layout() || p;
      var box = {l: p.cx - 110 * u, r: p.cx + 110 * u, t: p.cy - 520 * u, b: p.cy + 140 * u};
      if (!hits(box, avoid)) {
        gagged.modes = true;
        store('session', KEY_GAGS + '.modes', '1');
        hideBubble(true);
        gagRunning = G.bungee(guideF, {
          onBounce: function () { say(gagLine, 600); },
          onDone: function () { gagRunning = null; gagMinCy = 0; layout(); if (active === index) enter(step); }
        });
        return;
      }
      gagMinCy = 0;
      layout();
    }
    enter(step);
  }

  function enter(step) {
    var full = poseFor(step);
    clearPoseTimers();
    guideF.setPose(full, {ms: calm ? 0 : 500, ease: 'back'});
    poseTimers.push(setTimeout(function () { say(step.dataset.say); }, calm ? 0 : 250));
    if (calm) return;
    poseTimers.push(setTimeout(function () {
      if (!isOn()) return;
      var h = headingOf(step).getBoundingClientRect();
      var pt = {x: place && place.mode === 'margin' ? Math.min(h.right, (window.innerWidth + 880) / 2 - 8) : h.left + h.width / 2, y: h.top + Math.min(h.height / 2, 30)};
      guideF.pointAt(pt, {ms: 450, maxReach: 280, mouth: 0.5, gap: 4});
    }, 950));
    poseTimers.push(setTimeout(function () {
      if (isOn()) guideF.setPose(full, {ms: 500, ease: 'inOut'});
    }, 3750));
  }

  /* ---------- scroll ---------- */

  var lastCheck = 0, checkTimer = 0, idleTimer = 0;

  function currentIndex() {
    if (lock >= 0) return lock;
    var vh = window.innerHeight;
    var atBottom = window.scrollY + vh >= doc.documentElement.scrollHeight - 6;
    if (atBottom && window.scrollY > 200) return steps.length - 1;
    var idx = 0;
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].getBoundingClientRect().top <= 0.4 * vh) idx = i;
    }
    return idx;
  }

  function check() {
    lastCheck = Date.now();
    var idx = currentIndex();
    if (idx !== active) activate(idx); else if (guide.dataset.state !== 'on') layout();
  }

  function onScroll() {
    if (lock >= 0 && lockY !== null && Math.abs(window.scrollY - lockY) > 4) releaseLock();
    var now = Date.now();
    if (now - lastCheck > 150) check();
    else if (!checkTimer) checkTimer = setTimeout(function () { checkTimer = 0; check(); }, 150);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (lock >= 0 && lockY === null) lockY = window.scrollY;
      if (!hidden && active > 0) {
        // after the scroll: keep clear of buttons that have moved under the companion
        layout();
      }
    }, 220);
  }

  function releaseLock() { lock = -1; lockY = null; }
  window.addEventListener('wheel', releaseLock, {passive: true});
  window.addEventListener('touchmove', releaseLock, {passive: true});
  window.addEventListener('keydown', function (e) { if (!guide.contains(e.target)) releaseLock(); });
  window.addEventListener('scroll', onScroll, {passive: true});
  window.addEventListener('resize', function () {
    clearTimeout(window.__floatyResize);
    window.__floatyResize = setTimeout(function () { if (active > 0 && !hidden) layout({snap: true}); }, 120);
  });

  /* ---------- the tour ---------- */

  function goTo(index) {
    lock = index;
    lockY = null;
    var behavior = calm ? 'auto' : 'smooth';
    if (index <= 0) window.scrollTo({top: 0, behavior: behavior});
    else steps[index].scrollIntoView({behavior: behavior, block: 'start'});
    activate(index, 'tour');
  }

  function next() {
    touring = true;
    var last = active === steps.length - 1;
    if (last) { touring = false; goTo(0); updateLabel(); return; }
    goTo(active + 1);
  }

  nextBtn.addEventListener('click', next);
  bodyBtn.addEventListener('click', next);
  bodyBtn.tabIndex = -1;
  if (tourStart) tourStart.addEventListener('click', function () { if (hidden) showFloaty(); next(); });

  /* ---------- hide and show ---------- */

  function hideFloaty() {
    hidden = true;
    store('local', KEY_HIDDEN, '1');
    gagMinCy = 0;
    if (gagRunning) { gagRunning.cancel(); gagRunning = null; }
    clearPoseTimers();
    setState(false);
    heroF.setCalm(true);
    showBtn.hidden = false;
    showBtn.focus();
  }

  function showFloaty() {
    hidden = false;
    store('local', KEY_HIDDEN, null);
    showBtn.hidden = true;
    heroF.setCalm(calm);
    if (heroVisible) heroF.start();
    var idx = currentIndex();
    active = idx === 0 ? 0 : -1;
    activate(idx, 'force');
    nextBtn.focus({preventScroll: true});
  }

  hideBtn.addEventListener('click', hideFloaty);
  showBtn.addEventListener('click', showFloaty);

  /* ---------- reduced motion can change while the page is open ---------- */

  function onMotion() {
    calm = !!mq.matches;
    heroF.setCalm(calm || hidden);
    guideF.setCalm(calm);
    if (calm) { gagMinCy = 0; clearTimers(); clearPoseTimers(); if (gagRunning) { gagRunning.cancel(); gagRunning = null; } }
  }
  if (mq.addEventListener) mq.addEventListener('change', onMotion);
  else if (mq.addListener) mq.addListener(onMotion);

  /* ---------- start ---------- */

  guide.hidden = false;
  guide.dataset.state = 'off';
  guide.dataset.mode = 'corner';
  guide.dataset.side = 'right';
  updateLabel();
  if (hidden) showBtn.hidden = false;

  function heroEntrance() {
    var runGag = G && !calm && !hidden && store('session', KEY_GAGS + '.hero') !== '1' && window.scrollY < 80;
    function landed() {
      if (heroBubble) { heroBubble.style.opacity = ''; heroBubble.classList.add('is-in'); }
      setTimeout(function () { heroF.setPose(F.merge(F.DEFAULT_POSE, F.POSES.happy), {ms: 600}); }, 3600);
    }
    if (runGag) {
      store('session', KEY_GAGS + '.hero', '1');
      if (heroBubble) heroBubble.style.opacity = '0';
      G.parachute(heroF, {onLand: landed});
    } else {
      if (heroBubble && !calm) heroBubble.classList.add('is-in');
      if (!calm && !hidden) setTimeout(function () { heroF.setPose(F.merge(F.DEFAULT_POSE, F.POSES.happy), {ms: 600}); }, 3600);
    }
  }
  heroEntrance();

  // a link such as #faq: the companion starts at the right step
  check();
})();
