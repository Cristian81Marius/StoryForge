/* Istorioare cu tâlc – fundaluri v2, pe straturi (paralaxă) și cu viață (nori, valuri, fum, flăcări de lumânare).
   Folosire: <g class="bg" data-bg="sat-zi"></g> ca prim element în scenă.
   Opțiuni: data-horizon="660" (linia orizontului), data-sun="420,300", data-church="0", data-moon="0", data-hives="3"
   Straturi: cer (0.1), departe (0.3), mijloc (0.6), aproape (1), față (1.3). Vezi README-v2.md. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, a, p) => { const e = document.createElementNS(NS, tag); if (a) for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  const G = (p, a) => el('g', a, p);
  const P = (p, d, fill, x) => el('path', Object.assign({ d, fill }, x || {}), p);
  const C = (p, cx, cy, r, fill, x) => el('circle', Object.assign({ cx, cy, r, fill }, x || {}), p);
  const E = (p, cx, cy, rx, ry, fill, x) => el('ellipse', Object.assign({ cx, cy, rx, ry, fill }, x || {}), p);
  const RECT = (p, x, y, w, h, fill, a) => el('rect', Object.assign({ x, y, width: w, height: h, fill }, a || {}), p);
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647, (seed - 1) / 2147483646);
  const ITEMS = [];
  const live = (scene, fn) => ITEMS.push({ scene, fn });

  // ---------- piese ----------
  function hills(p, y, col, amp, n, ph) {
    let d = `M-40,${y}`; const w = 620 / n;
    for (let i = 0; i <= n; i++) { const x = -40 + i * w; const yy = y - amp * (.5 + .5 * Math.sin(i * 1.7 + ph)); d += ` Q${(x - w / 2).toFixed(0)},${(yy - amp * .4).toFixed(0)} ${x.toFixed(0)},${yy.toFixed(0)}`; }
    d += ' L580,1000 L-40,1000Z'; return P(p, d, col);
  }
  function cloud(p, x, y, s, op) { const g = G(p, { transform: `translate(${x},${y}) scale(${s})`, opacity: op ?? .9 }); E(g, 0, 0, 46, 15, '#fff'); E(g, -20, -9, 22, 15, '#fff'); E(g, 14, -14, 26, 19, '#fff'); E(g, 0, 6, 40, 6, '#e8eef6', { opacity: .6 }); return g; }
  function tree(p, x, y, s, kind, col) {
    const g = G(p, { transform: `translate(${x},${y}) scale(${s})` });
    if (kind === 'pine') { RECT(g, -3, -14, 6, 14, '#6b4a2a'); [[-60, 26], [-42, 21], [-26, 16]].forEach(([yy, w], i) => P(g, `M${-w},${yy + 28} L0,${yy - 6} L${w},${yy + 28}Z`, i % 2 ? (col || '#3f7a4a') : (col ? col : '#356c40'))); return g; }
    if (kind === 'poplar') { RECT(g, -3, -16, 6, 16, '#6b4a2a'); E(g, 0, -62, 15, 50, col || '#5a9a4e'); E(g, 4, -60, 8, 44, '#6aad5a', { opacity: .7 }); return g; }
    if (kind === 'palm') { P(g, 'M-3,0 Q-6,-50 6,-96 L10,-95 Q2,-50 4,0Z', '#8a6038'); const top = G(g, { transform: 'translate(8,-96)' }); [-150, -110, -60, -20, 20, 70].forEach(a => P(top, 'M0,0 Q20,-10 44,8 Q22,0 0,4Z', '#4f9a45', { transform: `rotate(${a})` })); C(top, 0, 2, 5, '#7a5230'); return g; }
    RECT(g, -6, -46, 12, 46, '#7a5230'); P(g, 'M-4,-30 L-14,-44 M4,-34 L14,-48', 'none', { stroke: '#7a5230', 'stroke-width': 5, 'stroke-linecap': 'round' });
    const c = col || '#5fae55'; const crown = G(g);
    C(crown, 0, -70, 36, c); C(crown, -24, -54, 24, '#57a24e'); C(crown, 24, -56, 26, '#6dbb5f'); C(crown, -8, -92, 22, '#6dbb5f'); C(crown, 14, -86, 20, '#57a24e');
    C(crown, -12, -78, 10, '#7cc86b', { opacity: .7 });
    if (kind === 'fruit') [[-14, -60], [12, -74], [20, -50], [-22, -44], [2, -92]].forEach(([fx, fy]) => C(crown, fx, fy, 5, '#e8453c'));
    return g;
  }
  function house(p, x, y, s, o) {
    o = o || {}; const g = G(p, { transform: `translate(${x},${y}) scale(${s})` });
    const wall = o.wall || '#f6efe0', roof = o.roof || '#b5503a';
    RECT(g, -40, -46, 80, 46, wall); RECT(g, -40, -8, 80, 8, '#d9cfb8', { opacity: .6 });
    P(g, 'M-50,-44 L0,-84 L50,-44Z', roof); P(g, 'M-50,-44 L0,-84 L0,-44Z', '#000', { opacity: .08 });
    RECT(g, 22, -86, 9, 20, '#a8a29a');
    RECT(g, -28, -34, 16, 16, '#5aa0d0', { stroke: '#3a6a8a', 'stroke-width': 2.5 }); P(g, 'M-20,-34 V-18 M-28,-26 H-12', 'none', { stroke: '#3a6a8a', 'stroke-width': 1.6 });
    RECT(g, 6, -32, 16, 32, '#7a5230', { rx: 2 }); C(g, 18, -16, 1.4, '#e6b347');
    if (o.light) { RECT(g, -27, -33, 14, 14, '#ffd36b'); C(g, -20, -26, 16, 'url(#glowSoft)'); }
    return g;
  }
  function church(p, x, y, s) {
    const g = G(p, { transform: `translate(${x},${y}) scale(${s})` });
    RECT(g, -44, -60, 88, 60, '#f7f1e4'); P(g, 'M-52,-58 L0,-96 L52,-58Z', '#7a3b2a');
    RECT(g, -14, -150, 28, 90, '#f7f1e4'); P(g, 'M-18,-148 Q0,-188 18,-148Z', '#3a6a5a'); P(g, 'M-18,-148 Q0,-188 0,-148Z', '#000', { opacity: .1 });
    P(g, 'M-1.6,-206 H1.6 V-196 H7 V-192.6 H1.6 V-178 H-1.6 V-192.6 H-7 V-196 H-1.6Z', '#f2c14e');
    P(g, 'M-8,-120 Q0,-134 8,-120 V-104 H-8Z', '#3a4a6a'); RECT(g, -10, -36, 20, 36, '#6b3a22', { rx: 10 });
    [-30, 30].forEach(wx => P(g, `M${wx - 6},-30 Q${wx},-42 ${wx + 6},-30 V-16 H${wx - 6}Z`, '#5aa0d0', { stroke: '#3a6a8a', 'stroke-width': 1.6 }));
    return g;
  }
  function fence(p, y, x0, x1, col) { const g = G(p); for (let x = x0; x <= x1; x += 16) P(g, `M${x - 3},${y} V${y - 26} L${x},${y - 30} L${x + 3},${y - 26} V${y}Z`, col || '#a8743f'); RECT(g, x0 - 4, y - 21, x1 - x0 + 8, 4, col || '#946232'); RECT(g, x0 - 4, y - 10, x1 - x0 + 8, 4, col || '#946232'); return g; }
  function flowers(p, n, y0, y1, cols) { const g = G(p); cols = cols || ['#ff7aa2', '#ffd14d', '#ffffff', '#b48cff', '#ff9a5a']; for (let i = 0; i < n; i++) { const x = rnd() * 540, y = y0 + rnd() * (y1 - y0); const f = G(g, { transform: `translate(${x.toFixed(0)},${y.toFixed(0)})` }); el('line', { x1: 0, y1: 0, x2: 0, y2: 10, stroke: '#4f9a45', 'stroke-width': 1.8 }, f); C(f, 0, 0, 3.6 + rnd() * 1.4, cols[i % cols.length]); C(f, 0, 0, 1.4, '#ffe08a'); } return g; }
  function grass(p, n, y0, y1, col) { const g = G(p); for (let i = 0; i < n; i++) { const x = rnd() * 540, y = y0 + rnd() * (y1 - y0), h = 6 + rnd() * 8; P(g, `M${x.toFixed(0)},${y.toFixed(0)} q-2,${-h * .6} -4,${-h} M${x.toFixed(0)},${y.toFixed(0)} q1,${-h * .7} 1,${-h * 1.1} M${x.toFixed(0)},${y.toFixed(0)} q3,${-h * .6} 5,${-h * .9}`, 'none', { stroke: col || '#5f9e4c', 'stroke-width': 1.6, 'stroke-linecap': 'round' }); } return g; }
  function sun(p, x, y, r, col) { const g = G(p, { transform: `translate(${x},${y})` }); C(g, 0, 0, r * 4, 'url(#glow)', { opacity: .7 }); C(g, 0, 0, r, col || '#fff3c4'); return g; }
  function moon(p, x, y) { const g = G(p, { transform: `translate(${x},${y})` }); C(g, 0, 0, 120, 'url(#glowCool)', { opacity: .35 }); C(g, 0, 0, 34, '#fff8e0'); C(g, 12, -8, 30, '#fff8e0', { opacity: 0 }); C(g, -10, 6, 6, '#efe4c4'); C(g, 8, 12, 4, '#efe4c4'); C(g, 10, -10, 5, '#efe4c4'); return g; }
  function stars(p, n, h) { const g = G(p, { class: 'stars', 'data-n': n || 110, 'data-h': h || 600 }); return g; }
  function smoke(scene, p, x, y) { const g = G(p); const puffs = [0, 1, 2, 3].map(() => C(g, x, y, 6, '#e9e6ef', { opacity: 0 })); live(scene, t => puffs.forEach((c, i) => { const u = ((t * .25 + i / 4) % 1); c.setAttribute('cx', (x + Math.sin(u * 5 + i) * 6 + u * 14).toFixed(1)); c.setAttribute('cy', (y - u * 70).toFixed(1)); c.setAttribute('r', (5 + u * 12).toFixed(1)); c.setAttribute('opacity', (Math.sin(u * Math.PI) * .55).toFixed(2)); })); }
  function driftClouds(scene, g, speed) { live(scene, t => g.setAttribute('transform', `translate(${(Math.sin(t * .05) * 10 + t * speed).toFixed(2)},0)`)); }
  function swayTrees(scene, list) { list.forEach((tg, i) => { const base = tg.getAttribute('transform'); live(scene, t => tg.setAttribute('transform', base + ` rotate(${(Math.sin(t * 1.1 + i) * .8).toFixed(2)})`)); }); }
  function layer(p, d) { return G(p, { 'data-depth': d }); }

  // ---------- fundaluri ----------
  const BGS = {
    'noapte': (g, o, sc) => {
      const hz = o.horizon || 690;
      const sky = layer(g, .1); RECT(sky, -60, -60, 660, 1080, 'url(#skyNight)'); stars(sky, 130, hz - 60); if (o.moon !== '0') moon(sky, o.moonX || 410, o.moonY || 330);
      const far = layer(g, .3); hills(far, hz - 50, '#1f2c52', 60, 5, 1);
      const mid = layer(g, .6); hills(mid, hz + 10, '#18234a', 40, 6, 3);
      const near = G(g); hills(near, hz + 90, '#121a38', 22, 5, 2); grass(near, 40, hz + 90, 960, '#24305a');
    },
    'sat-zi': (g, o, sc) => {
      const hz = o.horizon || 660, warm = o.time === 'apus';
      const sky = layer(g, .1); RECT(sky, -60, -60, 660, 1080, warm ? 'url(#skySunset)' : 'url(#skyDay)'); const sp = (o.sun || (warm ? '270,560' : '420,330')).split(',').map(Number); sun(sky, sp[0], sp[1], warm ? 46 : 30, warm ? '#ffe2a0' : '#fffbe6');
      const cl = G(sky); cloud(cl, 90, 300, 1.1, warm ? .55 : .9); cloud(cl, 330, 240, .8, warm ? .5 : .85); cloud(cl, 520, 380, 1.2, warm ? .5 : .85); driftClouds(sc, cl, 2.2);
      const far = layer(g, .3); hills(far, hz - 40, warm ? '#9a6a8a' : '#9cc7a6', 50, 4, 2);
      const mid = layer(g, .6); hills(mid, hz + 6, warm ? '#7a5a6a' : '#86bf78', 34, 5, 4);
      const trees = [];
      if (o.church !== '0') church(mid, o.churchX || 120, hz + 6, .62);
      house(mid, 300, hz + 12, .55, { light: warm }); house(mid, 420, hz + 14, .5, { roof: '#8a4a32', light: warm });
      smoke(sc, mid, 300 + 26 * .55, hz + 12 - 86 * .55);
      trees.push(tree(mid, 220, hz + 14, .55, 'round', warm ? '#6a7a4a' : undefined), tree(mid, 505, hz + 18, .6, 'poplar'));
      const near = G(g); P(near, `M-40,${hz + 70} Q270,${hz + 40} 580,${hz + 70} V1000 H-40Z`, warm ? '#8aa05a' : '#84c66f'); P(near, `M-40,${hz + 150} Q270,${hz + 120} 580,${hz + 150} V1000 H-40Z`, warm ? '#7a9050' : '#74b660');
      P(near, `M200,1000 Q250,${hz + 150} 290,${hz + 70} L306,${hz + 70} Q290,${hz + 150} 360,1000Z`, '#e8d4a4', { opacity: .75 });
      fence(near, hz + 110, 380, 540); trees.push(tree(near, 40, hz + 150, .9, 'round'));
      flowers(near, 40, hz + 120, 940); grass(near, 50, hz + 80, 950);
      swayTrees(sc, trees);
    },
    'camp': (g, o, sc) => {
      const hz = o.horizon || 640;
      const sky = layer(g, .1); RECT(sky, -60, -60, 660, 1080, 'url(#skyDawn)'); sun(sky, 270, hz - 80, 40, '#fff1c0'); const cl = G(sky); cloud(cl, 110, 290, 1, .8); cloud(cl, 440, 340, .9, .8); driftClouds(sc, cl, 1.8);
      const far = layer(g, .3); hills(far, hz - 10, '#c9b27a', 26, 4, 1); tree(far, 90, hz - 10, .35, 'round'); tree(far, 470, hz - 6, .3, 'poplar');
      const mid = layer(g, .6); P(mid, `M-40,${hz + 20} Q270,${hz} 580,${hz + 20} V1000 H-40Z`, '#e8c35a');
      const near = G(g); P(near, `M-40,${hz + 120} Q270,${hz + 90} 580,${hz + 120} V1000 H-40Z`, '#dcb24a');
      const wheat = G(near); for (let i = 0; i < 90; i++) { const x = rnd() * 560 - 10, y = hz + 110 + rnd() * 240, h = 26 + rnd() * 20; const w = G(wheat, { transform: `translate(${x.toFixed(0)},${y.toFixed(0)})` }); P(w, `M0,0 Q1,${-h / 2} 0,${-h}`, 'none', { stroke: '#c9962e', 'stroke-width': 1.4 }); E(w, 0, -h, 2.4, 6, '#f0c860'); }
      live(sc, t => [...wheat.children].forEach((w, i) => { if (i % 3) return; const b = w.getAttribute('transform').split(' rotate')[0]; w.setAttribute('transform', b + ` rotate(${(Math.sin(t * 1.4 + i * .3) * 4).toFixed(1)})`); }));
    },
    'desert': (g, o, sc) => {
      const hz = o.horizon || 650;
      const sky = layer(g, .1); RECT(sky, -60, -60, 660, 1080, 'url(#skyGarden)'); sun(sky, 400, 340, 36, '#fff6d8');
      const far = layer(g, .3); hills(far, hz - 20, '#e9c48a', 40, 3, 1);
      // cetate în depărtare
      const city = G(far, { opacity: .55 }); [[60, 40], [110, 70], [150, 50], [190, 64]].forEach(([x, h]) => RECT(city, x, hz - 40 - h, 34, h + 20, '#d9a86a')); P(city, `M128,${hz - 110} Q145,${hz - 140} 162,${hz - 110}Z`, '#d9a86a');
      const mid = layer(g, .6); hills(mid, hz + 30, '#e2b06c', 30, 3, 4); tree(mid, 420, hz + 34, .7, 'palm'); tree(mid, 470, hz + 40, .55, 'palm');
      const near = G(g); hills(near, hz + 130, '#d49c58', 20, 2, 2);
      for (let i = 0; i < 18; i++) E(near, rnd() * 540, hz + 160 + rnd() * 250, 3 + rnd() * 4, 1.6 + rnd() * 2, '#b8803e', { opacity: .5 });
      tree(near, 50, hz + 200, 1.05, 'palm');
    },
    'oras-vechi': (g, o, sc) => {
      const hz = o.horizon || 660;
      const sky = layer(g, .1); RECT(sky, -60, -60, 660, 1080, o.time === 'apus' ? 'url(#skySunset)' : 'url(#skyGarden)'); sun(sky, 120, 330, 30, '#fff6d8');
      const far = layer(g, .3); const fc = '#d8b47e';
      [[10, 120], [70, 160], [140, 110], [330, 150], [400, 120], [470, 170]].forEach(([x, h]) => { RECT(far, x, hz - h, 60, h, fc); for (let k = 0; k < 2; k++) RECT(far, x + 14 + k * 22, hz - h + 24, 8, 12, '#a07a4a'); });
      C(far, 250, hz - 170, 46, '#e6c27a'); RECT(far, 200, hz - 170, 100, 170, fc); P(far, `M246,${hz - 214} h8 v-18 h-8z`, '#f2c14e');
      const mid = layer(g, .6);
      RECT(mid, -40, hz - 70, 620, 110, '#c99a5e'); for (let x = -40; x < 580; x += 24) RECT(mid, x, hz - 84, 14, 16, '#c99a5e');
      RECT(mid, 220, hz - 130, 100, 170, '#b8884e'); for (let x = 220; x < 320; x += 20) RECT(mid, x, hz - 144, 12, 16, '#b8884e');
      P(mid, `M240,${hz + 40} V${hz - 40} Q270,${hz - 82} 300,${hz - 40} V${hz + 40}Z`, '#5a3a22');
      tree(mid, 60, hz + 40, .7, 'palm'); tree(mid, 470, hz + 44, .6, 'palm');
      const near = G(g); P(near, `M-40,${hz + 40} H580 V1000 H-40Z`, '#e3c08a'); P(near, `M230,${hz + 40} L310,${hz + 40} L420,1000 L120,1000Z`, '#d4ad72', { opacity: .7 });
      for (let i = 0; i < 26; i++) E(near, rnd() * 540, hz + 70 + rnd() * 300, 6 + rnd() * 8, 2.4, '#c99a5e', { opacity: .35 });
    },
    'oras': (g, o, sc) => {
      const hz = o.horizon || 700;
      const sky = layer(g, .1); RECT(sky, -60, -60, 660, 1080, 'url(#skySunset)'); sun(sky, 300, hz - 120, 40, '#ffe2a0');
      const far = layer(g, .3); for (let i = 0; i < 12; i++) { const x = -20 + i * 50, h = 160 + rnd() * 200; RECT(far, x, hz - h, 46, h + 40, '#6a5a8a', { opacity: .8 }); }
      const mid = layer(g, .6); const bl = ['#3d3a62', '#4a456e', '#35335a'];
      for (let i = 0; i < 8; i++) { const x = -30 + i * 76, h = 140 + rnd() * 240, w = 66; RECT(mid, x, hz - h, w, h + 60, bl[i % 3]); for (let yy = hz - h + 16; yy < hz + 20; yy += 22) for (let xx = x + 8; xx < x + w - 8; xx += 16) if (rnd() > .35) RECT(mid, xx, yy, 8, 11, rnd() > .5 ? '#ffd36b' : '#f7e3a8', { opacity: .9 }); }
      // turnul bisericii cu clopote
      const tw = G(mid, { transform: `translate(${o.towerX || 270},${hz})` }); RECT(tw, -26, -330, 52, 340, '#5a4e7a'); P(tw, 'M-30,-330 L0,-400 L30,-330Z', '#3a3258'); P(tw, 'M-1.6,-430 h3.2 v-0 v30 h-3.2z M-8,-420 h16 v3.4 h-16z', '#f2c14e');
      P(tw, 'M-16,-300 Q0,-326 16,-300 V-260 H-16Z', '#2a2440'); const bell = G(tw, { transform: 'translate(0,-298)' }); const bi = G(bell); P(bi, 'M-11,30 Q-11,8 0,6 Q11,8 11,30 Q0,34 -11,30Z', '#e6b347'); C(bi, 0, 32, 3, '#b8862a');
      live(sc, t => bi.setAttribute('transform', `rotate(${(Math.sin(t * 3.2) * 16 * (o.bells === '1' ? 1 : .15)).toFixed(2)})`));
      const near = G(g); RECT(near, -40, hz + 20, 620, 400, '#2a2742'); RECT(near, -40, hz + 20, 620, 8, '#4a466a'); for (let x = 20; x < 540; x += 90) { RECT(near, x, hz - 50, 4, 70, '#1e1c30'); C(near, x + 2, hz - 54, 6, '#ffe7a6'); C(near, x + 2, hz - 54, 24, 'url(#glowSoft)'); }
    },
    'casa': (g, o, sc) => {
      const sky = layer(g, .2); RECT(sky, -60, -60, 660, 1080, '#e9d8b8');
      RECT(sky, -60, 640, 660, 420, '#a8743f'); for (let y = 660; y < 1000; y += 34) P(sky, `M-60,${y} H600`, 'none', { stroke: '#8a5a2e', 'stroke-width': 2, opacity: .5 });
      const mid = layer(g, .5);
      // fereastra cu cerul
      const night = o.time === 'noapte';
      RECT(mid, 330, 250, 150, 190, night ? '#22335f' : '#bfe3f6', { stroke: '#7a5230', 'stroke-width': 10, rx: 4 }); P(mid, 'M405,250 V440 M330,345 H480', 'none', { stroke: '#7a5230', 'stroke-width': 6 });
      if (night) { C(mid, 440, 290, 16, '#fff8e0'); } else { cloud(mid, 380, 300, .45, .9); }
      RECT(mid, 320, 440, 170, 12, '#8a5a2e', { rx: 3 });
      // colțul cu icoana și candela
      const ic = G(mid, { transform: 'translate(110,300)' }); RECT(ic, -36, -46, 72, 92, '#c8913a', { rx: 4 }); RECT(ic, -30, -40, 60, 80, '#f2d690'); C(ic, 0, -14, 15, '#ffe9a8', { stroke: '#d8a84a', 'stroke-width': 2 }); C(ic, 0, -14, 8, '#e8c19c'); P(ic, 'M-18,40 Q-16,6 0,4 Q16,6 18,40Z', '#7a2430');
      P(ic, 'M-8,62 Q0,76 8,62Z', '#b8283c'); P(ic, 'M-8,62 L0,50 L8,62', 'none', { stroke: '#b8862a', 'stroke-width': 1.2 }); const fl = P(ic, 'M0,56 Q3,61 0,64 Q-3,61 0,56Z', '#ffb43c'); C(ic, 0, 60, 26, 'url(#glowSoft)', { opacity: .8 });
      live(sc, t => fl.setAttribute('transform', `translate(0,60) scale(${(1 + Math.sin(t * 11) * .1).toFixed(3)},${(1 + Math.sin(t * 7.3) * .16).toFixed(3)}) translate(0,-60)`));
      const near = G(g);
      // masa cu pâine
      if (o.table !== '0') { RECT(near, 300, 700, 220, 16, '#7a4a26', { rx: 4 }); RECT(near, 316, 716, 12, 120, '#6b4022'); RECT(near, 492, 716, 12, 120, '#6b4022'); E(near, 380, 694, 28, 13, '#d49a52'); P(near, 'M362,690 l6,-8 M378,688 l6,-8 M394,690 l6,-8', 'none', { stroke: '#b07a3a', 'stroke-width': 2 }); P(near, 'M440,700 Q452,676 464,700Z', '#c58a4a'); }
      E(near, 200, 860, 170, 34, '#b0342c', { opacity: .9 }); E(near, 200, 860, 150, 26, 'none', { stroke: '#f2c14e', 'stroke-width': 2, 'stroke-dasharray': '6 6' });
    },
    'biserica': (g, o, sc) => {
      const sky = layer(g, .2); RECT(sky, -60, -60, 660, 1080, '#4a3a5a'); RECT(sky, -60, 690, 660, 400, '#6b5a4a'); for (let x = -60; x < 600; x += 60) P(sky, `M${x},690 L${x - 30},1000`, 'none', { stroke: '#5a4a3a', 'stroke-width': 2 });
      const mid = layer(g, .5);
      // arcade și ferestre cu lumină
      [70, 470].forEach(x => { P(mid, `M${x - 26},520 V330 Q${x},290 ${x + 26},330 V520Z`, '#ffe9b0'); C(mid, x, 420, 90, 'url(#glowSoft)', { opacity: .7 }); });
      // iconostas
      const ic = G(mid, { transform: 'translate(270,0)' });
      RECT(ic, -190, 300, 380, 400, '#b8862a'); RECT(ic, -180, 310, 360, 380, '#e6b347');
      for (let i = -2; i <= 2; i++) { const x = i * 70; RECT(ic, x - 28, 360, 56, 140, '#f2d690', { rx: 3 }); C(ic, x, 392, 14, '#ffe9a8', { stroke: '#c8913a', 'stroke-width': 1.6 }); C(ic, x, 392, 7, '#e8c19c'); P(ic, `M${x - 16},496 Q${x - 14},420 ${x},414 Q${x + 14},420 ${x + 16},496Z`, ['#7a2430', '#2f5fa8', '#7a2430', '#3a6a5a', '#7a2430'][i + 2]); }
      P(ic, 'M-34,700 V560 Q0,520 34,560 V700Z', '#8a5a2a'); P(ic, 'M-1.6,250 h3.2 v40 h-3.2z M-12,262 h24 v3.4 h-24z', '#f2c14e');
      const near = G(g);
      // sfeșnice cu lumânări
      [[120, 760], [420, 760]].forEach(([x, y], k) => { RECT(near, x - 3, y - 90, 6, 90, '#b8862a'); E(near, x, y, 24, 6, '#b8862a'); for (let i = -2; i <= 2; i++) { RECT(near, x + i * 9 - 1.6, y - 108, 3.2, 18, '#f6efd8'); const f = P(near, `M${x + i * 9},${y - 118} Q${x + i * 9 + 2.4},${y - 112} ${x + i * 9},${y - 108} Q${x + i * 9 - 2.4},${y - 112} ${x + i * 9},${y - 118}Z`, '#ffb43c'); live(sc, t => f.setAttribute('opacity', (.8 + Math.sin(t * 9 + i + k) * .2).toFixed(2))); } C(near, x, y - 112, 50, 'url(#glowSoft)', { opacity: .8 }); });
    },
    'rai': (g, o, sc) => {
      const sky = layer(g, .1); RECT(sky, -60, -60, 660, 1080, 'url(#skyGold)'); C(sky, 270, 480, 260, 'url(#glow)', { opacity: .8 });
      const rays = G(sky, { class: 'godrays', transform: 'translate(270,180)', 'data-n': 11, 'data-spread': 120 });
      const far = layer(g, .35); const c1 = G(far); [[60, 560, 1.6], [240, 600, 1.9], [460, 560, 1.7]].forEach(([x, y, s]) => cloud(c1, x, y, s, .85)); driftClouds(sc, c1, 1.5);
      const mid = layer(g, .65); tree(mid, 70, 760, .8, 'fruit'); tree(mid, 480, 750, .7, 'fruit');
      const near = G(g); [[40, 830, 2.2], [200, 850, 2.4], [360, 840, 2.3], [520, 830, 2.2]].forEach(([x, y, s]) => cloud(near, x, y, s, 1)); RECT(near, -40, 860, 620, 200, '#fff'); flowers(near, 26, 850, 940, ['#ffd14d', '#ffffff', '#ffb3c7']);
    },
    'mare': (g, o, sc) => {
      const hz = o.horizon || 600;
      const sky = layer(g, .1); RECT(sky, -60, -60, 660, 1080, o.time === 'furtuna' ? '#4a5470' : 'url(#skyDay)'); if (o.time !== 'furtuna') sun(sky, 400, hz - 100, 34, '#fffbe6'); const cl = G(sky); cloud(cl, 120, 320, 1.2, o.time === 'furtuna' ? .35 : .9); cloud(cl, 420, 260, 1, o.time === 'furtuna' ? .3 : .85); driftClouds(sc, cl, 3);
      const far = layer(g, .3); hills(far, hz + 4, '#7aa8b8', 18, 3, 1);
      const seaC = o.time === 'furtuna' ? ['#3a5878', '#2e4a68', '#253e5a'] : ['#4fa6c8', '#3d92b8', '#2f7ea6'];
      const waves = [];
      [[hz + 4, .4, 4], [hz + 120, .7, 7], [hz + 260, 1, 11]].forEach(([y, d, a], i) => { const L = layer(g, d); RECT(L, -60, y + 10, 680, 1000, seaC[i]); const w = P(L, '', seaC[i]); waves.push([w, y, a, i]); });
      live(sc, t => waves.forEach(([w, y, a, i]) => { let d = `M-60,${y + 12}`; for (let x = -60; x <= 620; x += 20) d += ` L${x},${(y + Math.sin(x * .03 + t * (1.2 + i * .4) + i) * a).toFixed(1)}`; d += ' L620,' + (y + 14) + 'Z'; w.setAttribute('d', d); }));
    },
    'munte': (g, o, sc) => {
      const hz = o.horizon || 680;
      const sky = layer(g, .1); RECT(sky, -60, -60, 660, 1080, 'url(#skyDay)'); sun(sky, 120, 300, 28, '#fffbe6');
      const far = layer(g, .25); P(far, `M-40,${hz} L80,${hz - 260} L170,${hz - 150} L280,${hz - 330} L400,${hz - 170} L480,${hz - 240} L580,${hz - 120} V1000 H-40Z`, '#8a9ab8');
      P(far, `M50,${hz - 214} L80,${hz - 260} L106,${hz - 222} L92,${hz - 228} L80,${hz - 212}Z M244,${hz - 270} L280,${hz - 330} L318,${hz - 272} L298,${hz - 280} L280,${hz - 262} L262,${hz - 280}Z M460,${hz - 210} L480,${hz - 240} L502,${hz - 210}Z`, '#f4f7fb');
      const mid = layer(g, .55); hills(mid, hz - 20, '#5a8a6a', 40, 4, 2); for (let i = 0; i < 9; i++) tree(mid, 20 + i * 62 + rnd() * 20, hz + 10 + rnd() * 30, .5 + rnd() * .2, 'pine');
      const near = G(g); hills(near, hz + 110, '#4f7a4a', 20, 4, 3); grass(near, 50, hz + 110, 950, '#3f6a3a'); tree(near, 470, hz + 220, 1, 'pine');
    },
    'gradina': (g, o, sc) => {
      const sky = layer(g, .1); RECT(sky, -60, -60, 660, 1080, 'url(#skyGarden)'); C(sky, 270, 400, 200, 'url(#glow)', { opacity: .8 });
      const cl = G(sky); cloud(cl, 90, 370, .9, .85); cloud(cl, 450, 340, 1, .85); driftClouds(sc, cl, 1.5);
      const far = layer(g, .35); P(far, 'M-40,700 Q150,660 280,690 T580,680 V1000 H-40Z', '#a8da8f');
      const mid = layer(g, .65); const tr = [tree(mid, 40, 790, 1, 'fruit'), tree(mid, 505, 786, .95, 'fruit')]; swayTrees(sc, tr);
      const hives = +(o.hives || 0); for (let i = 0; i < hives; i++) { const hx = 300 + i * 78, hy = 790; const hv = G(mid, { transform: `translate(${hx},${hy}) scale(1.35)` }); RECT(hv, -22, -40, 44, 40, '#e6b347', { rx: 4 }); P(hv, 'M-28,-40 L0,-56 L28,-40Z', '#b5503a'); for (let k = 0; k < 3; k++) RECT(hv, -22, -32 + k * 11, 44, 2, '#c8913a'); RECT(hv, -6, -8, 12, 5, '#5a3a22', { rx: 2 }); }
      const near = G(g); P(near, 'M-40,780 Q270,750 580,782 V1000 H-40Z', '#84c66f'); flowers(near, 70, 800, 950); grass(near, 40, 790, 950);
    },
  };
  BGS['sat-apus'] = (g, o, sc) => BGS['sat-zi'](g, Object.assign({}, o, { time: 'apus' }), sc);

  function build(root) {
    (root || document).querySelectorAll('g.bg[data-bg]:not([data-built])').forEach(g => {
      g.setAttribute('data-built', '1'); const sc = g.closest('.scene');
      const o = {}; for (const k in g.dataset) o[k] = isNaN(+g.dataset[k]) ? g.dataset[k] : (g.dataset[k] === '0' ? '0' : +g.dataset[k]);
      const fn = BGS[g.dataset.bg]; if (fn) fn(g, o, sc); else console.warn('fundal necunoscut', g.dataset.bg);
    });
  }
  function update(scene, t) { ITEMS.forEach(it => { if (it.scene === scene) it.fn(t); }); }
  window.BG = { build, update, list: Object.keys(BGS), parts: { hills, cloud, tree, house, church, fence, flowers, grass, sun, moon } };
})();
