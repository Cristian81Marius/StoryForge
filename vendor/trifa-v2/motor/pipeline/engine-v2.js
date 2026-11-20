/* Istorioare cu tâlc – motor v2
   Cameră cu paralaxă pe fiecare scenă, tranziții variate, atmosferă (lumină, particule, vignetă, textură de hârtie),
   text care apare odată cu vocea, intrări animate din timp. Totul e determinist: renderAt(t) desenează orice cadru.
   Pagina conține: <script id="reel-config" type="application/json">{"DUR":[...],"RATE":null,"VO":null}</script>
   apoi personaje-v2.js, fundaluri-v2.js și engine-v2.js. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, a, p) => { const e = document.createElementNS(NS, tag); if (a) for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeS = t => (t = clamp(t, 0, 1), -(Math.cos(Math.PI * t) - 1) / 2);
  const ease3 = t => (t = clamp(t, 0, 1), t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = t => (t = clamp(t, 0, 1), 1 - Math.pow(1 - t, 3));
  const backOut = t => { t = clamp(t, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const smooth = t => (t = clamp(t, 0, 1), t * t * (3 - 2 * t));
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647, (seed - 1) / 2147483646);

  const cfgEl = document.getElementById('reel-config');
  const CFG = cfgEl ? JSON.parse(cfgEl.textContent) : {};
  const stage = document.getElementById('stage');
  const scenes = [...stage.querySelectorAll('.scene')];
  const N = scenes.length;
  const DUR = (CFG.DUR && CFG.DUR.length === N) ? CFG.DUR : scenes.map(() => 7);
  const RATE = CFG.RATE && CFG.RATE.length === N ? CFG.RATE : DUR.map(() => 1);
  const VO = CFG.VO && CFG.VO.length === N ? CFG.VO : null;
  const S = []; DUR.reduce((a, d, i) => (S[i] = a, a + d), 0);
  const total = DUR.reduce((a, b) => a + b, 0);

  // ---------- definiții comune (degradeuri, forme) ----------
  const DEFS = `
  <linearGradient id="skyNight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#060b20"/><stop offset=".7" stop-color="#22335f"/><stop offset="1" stop-color="#3b3b6b"/></linearGradient>
  <radialGradient id="skyGold" cx=".5" cy=".6" r=".75"><stop offset="0" stop-color="#fffbe9"/><stop offset=".45" stop-color="#ffe29a"/><stop offset="1" stop-color="#e08d45"/></radialGradient>
  <linearGradient id="skyGarden" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9b8"/><stop offset=".6" stop-color="#fff4d6"/><stop offset="1" stop-color="#ffe6ab"/></linearGradient>
  <linearGradient id="skyDay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc0ef"/><stop offset=".6" stop-color="#c4e6f7"/><stop offset="1" stop-color="#fff2d2"/></linearGradient>
  <linearGradient id="skySunset" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d3a7a"/><stop offset=".45" stop-color="#e4797a"/><stop offset=".75" stop-color="#ffb46b"/><stop offset="1" stop-color="#ffe0a0"/></linearGradient>
  <linearGradient id="skyHeart" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b1230"/><stop offset="1" stop-color="#4a2a4e"/></linearGradient>
  <linearGradient id="skyDawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc98f"/><stop offset=".55" stop-color="#fff0d2"/><stop offset="1" stop-color="#cdeab0"/></linearGradient>
  <linearGradient id="skyEnd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1230"/><stop offset="1" stop-color="#2b3a70"/></linearGradient>
  <linearGradient id="skyVerse" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#170f28"/><stop offset="1" stop-color="#3a2342"/></linearGradient>
  <linearGradient id="hell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a0c0c"/><stop offset=".55" stop-color="#4d1209"/><stop offset="1" stop-color="#b8300e"/></linearGradient>
  <radialGradient id="glow"><stop offset="0" stop-color="#fff6cf"/><stop offset=".4" stop-color="#ffe08a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient>
  <radialGradient id="glowSoft"><stop offset="0" stop-color="#fff6cf" stop-opacity=".7"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient>
  <radialGradient id="glowRed"><stop offset="0" stop-color="#ff8a8a" stop-opacity=".9"/><stop offset="1" stop-color="#ff5a6a" stop-opacity="0"/></radialGradient>
  <radialGradient id="glowFire"><stop offset="0" stop-color="#ffb347" stop-opacity=".8"/><stop offset="1" stop-color="#ff5a1a" stop-opacity="0"/></radialGradient>
  <radialGradient id="glowCool"><stop offset="0" stop-color="#dff0ff" stop-opacity=".8"/><stop offset="1" stop-color="#9fc8ff" stop-opacity="0"/></radialGradient>
  <linearGradient id="goldG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a0"/><stop offset=".5" stop-color="#e6b347"/><stop offset="1" stop-color="#b8862a"/></linearGradient>
  <linearGradient id="goldText" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c4"/><stop offset=".55" stop-color="#ffd36b"/><stop offset="1" stop-color="#d79a32"/></linearGradient>
  <linearGradient id="shineGold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="540" y2="0"><stop offset="0" stop-color="#f2c055"/><stop offset=".42" stop-color="#ffd36b"/><stop offset=".5" stop-color="#fffbe6"/><stop offset=".58" stop-color="#ffd36b"/><stop offset="1" stop-color="#f2c055"/></linearGradient>
  <linearGradient id="flameG" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff4b12"/><stop offset=".6" stop-color="#ff9a2a"/><stop offset="1" stop-color="#ffe07a"/></linearGradient>
  <linearGradient id="rayG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe6" stop-opacity=".0"/><stop offset=".25" stop-color="#fffbe6" stop-opacity=".55"/><stop offset="1" stop-color="#fffbe6" stop-opacity="0"/></linearGradient>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="soft2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>
  <filter id="blur8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
  <g id="cloud"><ellipse cx="0" cy="0" rx="46" ry="16" fill="#fff"/><ellipse cx="-20" cy="-10" rx="22" ry="16" fill="#fff"/><ellipse cx="14" cy="-14" rx="26" ry="19" fill="#fff"/></g>
  <path id="flame" d="M0,0 C-26,-20 -22,-60 -6,-95 C-4,-70 8,-62 6,-110 C26,-80 30,-30 0,0Z"/>
  <path id="heartPath" d="M0,30 C-40,0 -40,-30 -20,-35 C-8,-38 0,-28 0,-20 C0,-28 8,-38 20,-35 C40,-30 40,0 0,30 Z"/>`;
  const defsSvg = el('svg', { width: 0, height: 0, style: 'position:absolute', 'aria-hidden': 'true' });
  defsSvg.innerHTML = '<defs>' + DEFS + '</defs>';
  stage.insertBefore(defsSvg, stage.firstChild);
  const shine = defsSvg.querySelector('#shineGold');

  // ---------- strat de deasupra (vignetă, hârtie) și blitz pentru tranziții ----------
  const flash = document.createElement('div'); flash.id = 'flash'; stage.appendChild(flash);
  const hud = document.createElement('div'); hud.id = 'hud';
  const paperSvg = "<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .5  0 0 0 0 .45  0 0 0 0 .38  0 0 0 .9 0'/></filter><rect width='260' height='260' filter='url(%23n)'/></svg>";
  hud.innerHTML = `<div class="vig"></div><div class="paper" style="background-image:url(&quot;data:image/svg+xml,${paperSvg}&quot;)"></div>`;
  if (!CFG.noHud) stage.appendChild(hud);

  // ---------- fundaluri și personaje ----------
  if (window.BG) BG.build(stage);
  // generatoare v1: stele, raze, scântei
  stage.querySelectorAll('.stars').forEach(g => {
    const n = +(g.dataset.n || 110), H = +(g.dataset.h || 800);
    for (let i = 0; i < n; i++) {
      const c = el('circle', { cx: (rnd() * 540).toFixed(1), cy: (rnd() * H).toFixed(1), r: (rnd() * 1.7 + .4).toFixed(2), fill: '#fff', class: 'a-twinkle' }, g);
      c.style.animationDelay = (-rnd() * 2.4).toFixed(2) + 's'; c.style.animationDuration = (1.8 + rnd() * 2).toFixed(2) + 's';
    }
  });
  stage.querySelectorAll('.rays').forEach(g => { const n = +(g.dataset.n || 18); for (let i = 0; i < n; i++) el('path', { d: 'M0,0 L-34,-900 L34,-900 Z', fill: '#fffbe6', opacity: '.35', transform: `rotate(${i * 360 / n})` }, g); });
  stage.querySelectorAll('.sparkles').forEach(g => {
    const cx = +g.dataset.cx, cy = +g.dataset.cy, W = +g.dataset.w, H = +g.dataset.h, n = +(g.dataset.n || 16);
    for (let i = 0; i < n; i++) { const p = el('g', { transform: `translate(${(cx + (rnd() - .5) * W).toFixed(0)},${(cy + (rnd() - .5) * H).toFixed(0)})` }, g); const s = el('path', { d: 'M0,-8 L1.8,-1.8 L8,0 L1.8,1.8 L0,8 L-1.8,1.8 L-8,0 L-1.8,-1.8Z', fill: '#fffbe0', class: 'a-twinkle' }, p); s.style.animationDelay = (rnd() * 2).toFixed(2) + 's'; }
  });
  stage.querySelectorAll('.fire').forEach(g => {
    const n = +(g.dataset.n || 8), y = +(g.dataset.y || 900), sc = +(g.dataset.s || 1), x0 = +(g.dataset.x0 || 0), x1 = +(g.dataset.x1 || 540);
    for (let i = 0; i < n; i++) { const x = x0 + (i + .5) * (x1 - x0) / n + (rnd() - .5) * 18; const w = el('g', { transform: `translate(${x.toFixed(0)},${y}) scale(${(sc * (.8 + rnd() * .5)).toFixed(2)})` }, g); const f = el('use', { href: '#flame', fill: 'url(#flameG)', class: 'a-flicker' }, w); f.style.animationDelay = (-rnd() * 1.3).toFixed(2) + 's'; f.style.animationDuration = (1 + rnd() * .6).toFixed(2) + 's'; }
  });
  // raze de lumină care respiră (god rays)
  const godrays = [];
  stage.querySelectorAll('.godrays').forEach(g => {
    const n = +(g.dataset.n || 9), len = +(g.dataset.len || 1100), spread = +(g.dataset.spread || 70), w = +(g.dataset.w || 46);
    const items = [];
    for (let i = 0; i < n; i++) { const a = -spread / 2 + spread * (i + .5) / n + (rnd() - .5) * 6; const p = el('path', { d: `M0,0 L${-w / 2},${len} L${w / 2},${len}Z`, fill: 'url(#rayG)', opacity: .5, transform: `rotate(${a.toFixed(1)})` }, g); items.push({ p, a, ph: rnd() * 6, sp: .5 + rnd() * .7 }); }
    godrays.push({ g, items, scene: g.closest('.scene') });
  });
  if (window.CH) CH.build(stage);

  // ---------- lumină (grade) ----------
  const GRADES = {
    warm: 'background:radial-gradient(ellipse 90% 60% at 50% 18%,rgba(255,196,110,.42),rgba(255,160,80,0) 70%);mix-blend-mode:soft-light',
    holy: 'background:radial-gradient(ellipse 80% 55% at 50% 22%,rgba(255,246,214,.55),rgba(255,230,160,0) 72%);mix-blend-mode:screen;opacity:.55',
    night: 'background:linear-gradient(180deg,rgba(20,30,90,.42),rgba(10,10,40,.25));mix-blend-mode:multiply',
    fire: 'background:radial-gradient(ellipse 100% 60% at 50% 100%,rgba(255,96,30,.5),rgba(255,60,0,0) 70%);mix-blend-mode:overlay',
    dawn: 'background:linear-gradient(180deg,rgba(255,150,170,.35),rgba(255,210,120,.25));mix-blend-mode:soft-light',
    cool: 'background:linear-gradient(180deg,rgba(90,150,220,.30),rgba(60,90,160,.18));mix-blend-mode:soft-light',
    sepia: 'background:rgba(160,110,50,.28);mix-blend-mode:color',
    gloom: 'background:linear-gradient(180deg,rgba(40,30,60,.45),rgba(10,5,20,.4));mix-blend-mode:multiply',
  };

  // ---------- pregătirea fiecărei scene ----------
  const SC = scenes.map((sc, j) => {
    const svg = sc.querySelector(':scope>svg');
    const meta = { el: sc, svg, j };
    if (svg) {
      // camera: tot conținutul (fără defs și .fixed) intră într-un grup mișcat de cameră
      const cam = el('g', { class: 'cam' });
      [...svg.childNodes].forEach(n => { if (n.nodeType === 1 && (n.tagName === 'defs' || n.classList.contains('fixed'))) return; cam.appendChild(n); });
      const firstFixed = [...svg.children].find(n => n.classList && n.classList.contains('fixed'));
      svg.insertBefore(cam, firstFixed || null);
      meta.cam = cam;
      meta.layers = [...cam.querySelectorAll('[data-depth]')].map(l => {
        // un strat cu transform propriu e învelit, ca paralaxa să nu-i strice poziția
        if (l.getAttribute('transform')) { const w = el('g', { 'data-depth': l.dataset.depth }); l.parentNode.insertBefore(w, l); w.appendChild(l); l.removeAttribute('data-depth'); return { l: w, d: +w.dataset.depth }; }
        return { l, d: +l.dataset.depth };
      });
      // particule de atmosferă
      meta.parts = [];
      const amb = (sc.dataset.amb || '').trim();
      if (amb) { const pg = el('g', { class: 'amb', 'data-depth': '1.25' }, cam); meta.layers.push({ l: pg, d: 1.25 }); amb.split(/\s+/).forEach(tok => { const [k, n] = tok.split(':'); makeParticles(meta, pg, k, n ? +n : null); }); }
    }
    // camera
    meta.camSpec = parseCam(sc.dataset.cam || 'push', sc.dataset.focus);
    // tranziția de intrare
    const tr = (sc.dataset.tr || (j === 0 ? 'none' : 'fade')).split(':');
    meta.tr = tr[0]; meta.trd = sc.dataset.trd ? +sc.dataset.trd : ({ none: 0, cut: 0, fade: .55, dip: .9, glow: .9, iris: .85, zoom: .7, wipe: .75, 'wipe-up': .75, 'wipe-down': .75, 'wipe-left': .75, 'wipe-right': .75, blur: .7 }[meta.tr] ?? .6);
    // lumina scenei
    const gr = sc.dataset.grade;
    if (gr && gr !== 'none') { const d = document.createElement('div'); d.className = 'grade'; d.style.cssText = GRADES[gr] || ''; sc.insertBefore(d, sc.querySelector('.cap') || null); }
    // intrări animate (data-in / data-at / data-until)
    meta.ins = [...sc.querySelectorAll('[data-in],[data-until],[data-at]')].filter(x => !x.classList.contains('ch')).map(prepIn);
    // litere care apar pe rând
    meta.letters = [...sc.querySelectorAll('text.letters')].map(prepLetters);
    // caseta de text
    meta.caps = [...sc.querySelectorAll('.cap')].map(c => prepCap(c, j));
    return meta;
  });

  // ---------- camera ----------
  function parseCam(spec, focus) {
    const P = {
      push: { z: [1, 1.06] }, 'push-strong': { z: [1, 1.14] }, pull: { z: [1.1, 1] }, 'pull-strong': { z: [1.2, 1] },
      'pan-r': { z: [1.09, 1.09], x: [22, -22] }, 'pan-l': { z: [1.09, 1.09], x: [-22, 22] },
      rise: { z: [1.09, 1.09], y: [-34, 34] }, sink: { z: [1.09, 1.09], y: [34, -34] },
      still: { z: [1.02, 1.02], drift: 1 }, none: { z: [1, 1] }
    };
    let c = { z: [1, 1.06], x: [0, 0], y: [0, 0], f: [270, 560], drift: 0, free: 0 };
    spec.split(';').map(s => s.trim()).filter(Boolean).forEach(part => {
      if (P[part]) { Object.assign(c, JSON.parse(JSON.stringify(P[part]))); return; }
      const [k, v] = part.split(/\s+/);
      if (k === 'free') { c.free = 1; return; }
      if (v == null) return;
      const rng = v.split('>').map(Number);
      if (k === 'z' || k === 'x' || k === 'y') c[k] = rng.length > 1 ? rng : [rng[0], rng[0]];
      if (k === 'f') c.f = v.split(',').map(Number);
      if (k === 'free') c.free = 1;
    });
    c.x = c.x || [0, 0]; c.y = c.y || [0, 0];
    if (focus) c.f = focus.split(',').map(Number);
    return c;
  }
  function camAt(m, u, t) {
    const c = m.camSpec, e = easeS(u);
    let z = lerp(c.z[0], c.z[1], e), tx = lerp(c.x[0], c.x[1], e), ty = lerp(c.y[0], c.y[1], e);
    if (c.drift) { tx += Math.sin(t * .5) * 3; ty += Math.cos(t * .37) * 2.4; }
    const [fx, fy] = c.f;
    if (!c.free && z >= 1) { tx = clamp(tx, -(540 - fx) * (z - 1), fx * (z - 1)); ty = clamp(ty, -(960 - fy) * (z - 1), fy * (z - 1)); }
    return { z, tx, ty, fx, fy };
  }
  const camStr = (fx, fy, z, tx, ty) => `translate(${(fx + tx).toFixed(2)},${(fy + ty).toFixed(2)}) scale(${z.toFixed(5)}) translate(${-fx},${-fy})`;

  // ---------- particule ----------
  function makeParticles(meta, g, kind, n) {
    const add = (count, fn) => { for (let i = 0; i < count; i++) meta.parts.push(fn(i)); };
    const R = rnd;
    if (kind === 'dust' || kind === 'motes') add(n || 26, () => { const c = el('circle', { r: (R() * 1.6 + .7).toFixed(2), fill: '#fff6d8' }, g); const x = R() * 540, y = 120 + R() * 760, ph = R() * 9, sp = .3 + R() * .6; return t => { c.setAttribute('cx', (x + Math.sin(t * sp * .7 + ph) * 18 + t * 4).toFixed(1) % 560); c.setAttribute('cy', (y + Math.cos(t * sp + ph) * 14 - t * 3).toFixed(1)); c.setAttribute('opacity', (.25 + .45 * (Math.sin(t * 1.3 + ph) * .5 + .5)).toFixed(2)); }; });
    if (kind === 'fireflies') add(n || 16, () => { const gg = el('g', null, g); el('circle', { r: 7, fill: 'url(#glowSoft)' }, gg); el('circle', { r: 1.8, fill: '#fff7b0' }, gg); const x = R() * 540, y = 380 + R() * 480, ph = R() * 9; return t => { gg.setAttribute('transform', `translate(${(x + Math.sin(t * .6 + ph) * 30).toFixed(1)},${(y + Math.sin(t * .9 + ph * 2) * 20).toFixed(1)})`); gg.setAttribute('opacity', (.3 + .7 * Math.max(0, Math.sin(t * 2.2 + ph))).toFixed(2)); }; });
    if (kind === 'snow') add(n || 70, () => { const c = el('circle', { r: (R() * 2.2 + .8).toFixed(2), fill: '#fff', opacity: (.5 + R() * .5).toFixed(2) }, g); const x = R() * 540, y = R() * 960, sp = 26 + R() * 40, ph = R() * 9; return t => { c.setAttribute('cx', ((x + Math.sin(t * .8 + ph) * 16) % 540).toFixed(1)); c.setAttribute('cy', ((y + t * sp) % 980 - 10).toFixed(1)); }; });
    if (kind === 'rain') add(n || 80, () => { const l = el('line', { stroke: '#cfe2ff', 'stroke-width': 1.2, opacity: (.25 + R() * .35).toFixed(2), 'stroke-linecap': 'round' }, g); const x = R() * 600, y = R() * 960, sp = 700 + R() * 300; return t => { const yy = (y + t * sp) % 1000 - 20, xx = (x - t * sp * .12) % 600; l.setAttribute('x1', xx.toFixed(1)); l.setAttribute('y1', yy.toFixed(1)); l.setAttribute('x2', (xx - 3).toFixed(1)); l.setAttribute('y2', (yy + 18).toFixed(1)); }; });
    if (kind === 'embers') add(n || 26, () => { const c = el('circle', { r: (1.4 + R() * 2).toFixed(1), fill: '#ffc56b' }, g); const x = R() * 540, y0 = 860 + R() * 100, sp = 50 + R() * 60, ph = R() * 9, L = 4 + R() * 3; return t => { const u = ((t + ph) % L) / L; c.setAttribute('cx', (x + Math.sin(t * 2 + ph) * 12 + u * 20).toFixed(1)); c.setAttribute('cy', (y0 - u * sp * L).toFixed(1)); c.setAttribute('opacity', (Math.sin(u * Math.PI) * .9).toFixed(2)); }; });
    if (kind === 'leaves' || kind === 'petals') add(n || 14, () => { const gg = el('g', null, g); const col = kind === 'leaves' ? ['#d98c3a', '#c9692d', '#e4b24a', '#7fae4f'][Math.floor(R() * 4)] : ['#ffb3c7', '#ffd1dc', '#fff0f4'][Math.floor(R() * 3)]; el('path', { d: kind === 'leaves' ? 'M0,-6 Q5,0 0,6 Q-5,0 0,-6Z' : 'M0,-4 Q4,0 0,4 Q-4,0 0,-4Z', fill: col }, gg); const x = R() * 600, y = R() * 960, sp = 30 + R() * 30, ph = R() * 9; return t => { gg.setAttribute('transform', `translate(${((x + Math.sin(t * .9 + ph) * 30 - t * 10) % 600).toFixed(1)},${((y + t * sp) % 980 - 10).toFixed(1)}) rotate(${((t * 80 + ph * 40) % 360).toFixed(0)}) scale(${(1 + Math.sin(t * 2 + ph) * .3).toFixed(2)},1)`); }; });
    if (kind === 'bubbles') add(n || 18, () => { const c = el('circle', { r: (2 + R() * 4).toFixed(1), fill: 'none', stroke: '#e8f6ff', 'stroke-width': 1, opacity: .6 }, g); const x = R() * 540, y = R() * 960, sp = 30 + R() * 30, ph = R() * 9; return t => { c.setAttribute('cx', (x + Math.sin(t * 1.4 + ph) * 8).toFixed(1)); c.setAttribute('cy', (960 - ((960 - y + t * sp) % 980)).toFixed(1)); }; });
    if (kind === 'sparkle') add(n || 12, () => { const p = el('path', { d: 'M0,-7 L1.6,-1.6 L7,0 L1.6,1.6 L0,7 L-1.6,1.6 L-7,0 L-1.6,-1.6Z', fill: '#fffbe0' }, g); const x = 60 + R() * 420, y = 300 + R() * 500, ph = R() * 9, sp = .8 + R(); return t => { const s = Math.max(0, Math.sin(t * sp * 2 + ph)); p.setAttribute('transform', `translate(${x.toFixed(0)},${y.toFixed(0)}) scale(${s.toFixed(2)}) rotate(${(t * 40).toFixed(0)})`); }; });
    if (kind === 'smoke') add(n || 12, () => { const c = el('circle', { r: 30, fill: '#6b6470', filter: 'url(#blur8)' }, g); const x = R() * 540, y0 = 900, ph = R() * 9, L = 6 + R() * 3; return t => { const u = ((t + ph) % L) / L; c.setAttribute('cx', (x + Math.sin(t * .5 + ph) * 30).toFixed(1)); c.setAttribute('cy', (y0 - u * 700).toFixed(1)); c.setAttribute('r', (20 + u * 60).toFixed(1)); c.setAttribute('opacity', (Math.sin(u * Math.PI) * .32).toFixed(2)); }; });
  }

  // ---------- intrări animate ----------
  function prepIn(x) {
    const inn = x.dataset.in || 'fade', at = +(x.dataset.at || 0), dur = +(x.dataset.dur || ({ fade: .9, rise: .8, pop: .6, zoom: .9, draw: 1.6, blur: 1, drop: .7, grow: 1.2 }[inn] || .8));
    const until = x.dataset.until != null ? +x.dataset.until : null, outd = +(x.dataset.outd || .5);
    // învelim elementul într-un grup, ca transformul nostru să nu-l strice pe al lui
    let w = x;
    if (x instanceof SVGElement && ['rise', 'pop', 'zoom', 'drop', 'grow'].includes(inn)) { w = el('g'); x.parentNode.insertBefore(w, x); w.appendChild(x); }
    let cx = 0, cy = 0, len = 0;
    if (['pop', 'zoom', 'grow'].includes(inn) && x.getBBox) { try { const b = x.getBBox(); cx = b.x + b.width / 2; cy = inn === 'grow' ? b.y + b.height : b.y + b.height / 2; } catch (e) { } }
    if (inn === 'draw' && x.getTotalLength) { try { len = x.getTotalLength(); x.style.strokeDasharray = len; } catch (e) { } }
    return { x, w, inn, at, dur, until, outd, cx, cy, len };
  }
  function updIn(o, t) {
    const u = clamp((t - o.at) / o.dur, 0, 1);
    let op = 1, tr = '';
    if (o.inn === 'fade') op = smooth(u);
    else if (o.inn === 'rise') { op = smooth(u * 1.4); tr = `translate(0,${((1 - easeOut(u)) * 22).toFixed(2)})`; }
    else if (o.inn === 'drop') { op = smooth(u * 2); tr = `translate(0,${(-(1 - backOut(u)) * 40).toFixed(2)})`; }
    else if (o.inn === 'pop') { const s = u <= 0 ? 0 : backOut(u); op = u > 0 ? 1 : 0; tr = `translate(${o.cx},${o.cy}) scale(${Math.max(.001, s).toFixed(4)}) translate(${-o.cx},${-o.cy})`; }
    else if (o.inn === 'zoom') { op = smooth(u); const s = lerp(.82, 1, easeOut(u)); tr = `translate(${o.cx},${o.cy}) scale(${s.toFixed(4)}) translate(${-o.cx},${-o.cy})`; }
    else if (o.inn === 'grow') { const s = easeOut(u); op = u > 0 ? 1 : 0; tr = `translate(${o.cx},${o.cy}) scale(${Math.max(.001, s).toFixed(4)}) translate(${-o.cx},${-o.cy})`; }
    else if (o.inn === 'blur') { op = smooth(u); o.x.style.filter = u < 1 ? `blur(${((1 - u) * 6).toFixed(2)}px)` : 'none'; }
    else if (o.inn === 'draw') { o.x.style.strokeDashoffset = (o.len * (1 - ease3(u))).toFixed(1); op = u > 0 ? 1 : 0; }
    if (o.until != null) op *= 1 - smooth((t - o.until) / o.outd);
    o.x.style.opacity = op;
    if (tr && o.w !== o.x) o.w.setAttribute('transform', tr);
  }
  function prepLetters(tx) {
    const s = tx.textContent; tx.textContent = '';
    const spans = [...s].map(ch => { const sp = el('tspan', null, tx); sp.textContent = ch; return sp; });
    return { spans, at: +(tx.dataset.at || 0), step: +(tx.dataset.step || .055) };
  }
  function updLetters(o, t) { o.spans.forEach((sp, i) => { sp.style.opacity = smooth((t - o.at - i * o.step) / .35); }); }

  // ---------- caseta de text sincronizată cu vocea ----------
  function prepCap(cap, j) {
    if (cap.dataset.cap === 'static') return { cap, words: [], j, stat: 1 };
    const words = [];
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const parts = n.textContent.split(/(\s+)/); const frag = document.createDocumentFragment();
          parts.forEach(p => { if (!p) return; if (/^\s+$/.test(p)) frag.appendChild(document.createTextNode(p)); else { const sp = document.createElement('span'); sp.className = 'w'; sp.textContent = p; frag.appendChild(sp); words.push(sp); } });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(cap);
    // greutăți: lungimea cuvântului + pauze după punctuație
    const wts = words.map(w => { const s = w.textContent; let k = s.length + 1.2; if (/[.!?…]$/.test(s)) k += 5; else if (/[,;:—–]$/.test(s)) k += 2.5; if (/^[—–-]/.test(s)) k += 1.5; return k; });
    const tot = wts.reduce((a, b) => a + b, 0) || 1;
    let acc = 0; const pos = wts.map(k => { const p = acc / tot; acc += k; return p; });
    return { cap, words, pos, j };
  }
  function updCap(o, loc) {
    const c = o.cap;
    const inU = clamp((loc - .05) / .45, 0, 1);
    c.style.opacity = smooth(inU); c.style.transform = `translateY(${((1 - easeOut(inU)) * -10).toFixed(2)}px)`;
    if (o.stat) return;
    let st = .35, du = Math.min(DUR[o.j] - .9, o.words.length * .34);
    if (VO && VO[o.j]) { st = VO[o.j][0]; du = VO[o.j][1]; }
    const lead = .12, span = du * .96;
    o.words.forEach((w, i) => { const tw = st - lead + o.pos[i] * span; const u = clamp((loc - tw) / .24, 0, 1); w.style.opacity = u.toFixed(3); w.style.transform = u < 1 ? `translateY(${((1 - easeOut(u)) * 5).toFixed(2)}px)` : 'none'; });
  }

  // ---------- tranziții ----------
  function applyTr(m, loc, nextFocus) {
    const sc = m.el; let op = 1, tf = '', clip = '', mask = '', filt = '';
    const d = m.trd; const p = d > 0 ? clamp(loc / d, 0, 1) : 1; const e = smooth(p);
    const f = { op: 0, col: '#000' };
    if (m.tr === 'fade' || m.tr === 'none' || m.tr === 'cut') op = d > 0 ? e : 1;
    else if (m.tr === 'dip') { op = p < .5 ? 0 : smooth((p - .5) * 2); f.op = 1 - Math.abs(2 * p - 1); f.col = '#05030c'; }
    else if (m.tr === 'glow') { op = smooth((p - .3) / .35); f.op = Math.sin(p * Math.PI) * .92; f.col = '#fff4d6'; }
    else if (m.tr === 'iris') { const [fx, fy] = m.camSpec.f; clip = p < 1 ? `circle(${(ease3(p) * 1150).toFixed(1)}px at ${fx}px ${fy}px)` : ''; }
    else if (m.tr === 'zoom') { op = e; tf = p < 1 ? `scale(${lerp(1.1, 1, easeOut(p)).toFixed(4)})` : ''; }
    else if (m.tr === 'blur') { op = e; filt = p < 1 ? `blur(${((1 - p) * 8).toFixed(2)}px)` : ''; }
    else if (m.tr.startsWith('wipe')) { const dirs = { wipe: '180deg', 'wipe-down': '180deg', 'wipe-up': '0deg', 'wipe-left': '270deg', 'wipe-right': '90deg' }; const a = ease3(p) * 125 - 25; mask = p < 1 ? `linear-gradient(${dirs[m.tr]},#000 ${a.toFixed(1)}%,transparent ${(a + 25).toFixed(1)}%)` : ''; }
    sc.style.opacity = op; sc.style.transform = tf; sc.style.clipPath = clip; sc.style.webkitMaskImage = mask; sc.style.maskImage = mask; sc.style.filter = filt;
    return p < 1 ? f : null;
  }

  // ---------- desenarea unui cadru ----------
  function renderAt(t) {
    let fl = null;
    const sx = (t * 170) % 1500 - 700; shine.setAttribute('x1', sx.toFixed(1)); shine.setAttribute('x2', (sx + 540).toFixed(1));
    SC.forEach((m, j) => {
      const loc = t - S[j]; const nextTr = j + 1 < N ? SC[j + 1].trd : 0;
      const end = j + 1 < N ? S[j + 1] + nextTr : Infinity;
      const vis = loc >= 0 && t < end;
      m.el.style.visibility = vis ? 'visible' : 'hidden'; m.el.style.zIndex = j;
      if (!vis) return;
      const le = loc * (RATE[j] || 1);
      const f = applyTr(m, loc); if (f && f.op > 0) fl = f;
      if (m.cam) {
        const u = clamp(loc / (DUR[j] + nextTr), 0, 1);
        const c = camAt(m, u, loc);
        m.cam.setAttribute('transform', camStr(c.fx, c.fy, c.z, c.tx, c.ty));
        m.layers.forEach(({ l, d }) => { const zd = 1 + (c.z - 1) * d, k = zd / c.z; const ex = (c.tx * d - c.tx) / c.z, ey = (c.ty * d - c.ty) / c.z; l.setAttribute('transform', `translate(${(c.fx + ex).toFixed(2)},${(c.fy + ey).toFixed(2)}) scale(${k.toFixed(5)}) translate(${-c.fx},${-c.fy})`); });
        m.parts.forEach(fn => fn(loc));
      }
      m.el.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = Math.max(0, le * 1000); });
      if (window.CH) CH.updateAll(le, m.el);
      godrays.forEach(gr => { if (gr.scene === m.el) gr.items.forEach(it => it.p.setAttribute('opacity', (.32 + .3 * Math.sin(loc * it.sp + it.ph)).toFixed(3))); });
      if (window.BG) BG.update(m.el, le);
      m.ins.forEach(o => updIn(o, le));
      m.letters.forEach(o => updLetters(o, le));
      m.caps.forEach(o => updCap(o, loc));
    });
    flash.style.opacity = fl ? fl.op : 0; if (fl) flash.style.background = fl.col;
  }

  window.REEL = {
    DUR, RATE, VO, S, total, N,
    meta: SC.map(m => ({ tr: m.tr, trd: m.trd, sfx: m.el.dataset.sfx || '', ambs: m.el.dataset.ambs || '', cont: m.el.dataset.cont === '1' }))
  };
  window.renderAt = renderAt;
  renderAt(0);

  // redare live în browser (nu în randare)
  if (!window.__RENDER) {
    const q = new URLSearchParams(location.search); let t0 = performance.now() - (+(q.get('t') || 0)) * 1000, paused = false, tp = 0;
    stage.addEventListener('click', () => { if (paused) { t0 = performance.now() - tp * 1000; paused = false; } else { paused = true; } });
    const loop = now => { if (!paused) { tp = ((now - t0) / 1000) % total; renderAt(tp); } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
})();
