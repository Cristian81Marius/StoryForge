/* Istorioare cu tâlc – personaje v2
   Rig articulat, animat din timp (determinist, derulabil cadru cu cadru de renderAt).
   Folosire în scenă:
     <g class="ch" data-ch="proroc" data-x="120" data-y="860" data-s="1.6"
        data-do="walk 0-3.4 > 300,820; gest point 3.6; talk 3.8-6.5; face smile 3.8"></g>
   Vezi README-v2.md pentru toate tipurile, gesturile, fețele și comenzile. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, a, p) => { const e = document.createElementNS(NS, tag); if (a) for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  const G = (p, a) => el('g', a, p);
  const P = (p, d, fill, x) => el('path', Object.assign({ d, fill }, x || {}), p);
  const C = (p, cx, cy, r, fill, x) => el('circle', Object.assign({ cx, cy, r, fill }, x || {}), p);
  const E = (p, cx, cy, rx, ry, fill, x) => el('ellipse', Object.assign({ cx, cy, rx, ry, fill }, x || {}), p);
  const S = (p, d, stroke, w, x) => el('path', Object.assign({ d, fill: 'none', stroke, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, x || {}), p);

  // ---------- culori ----------
  const h2r = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const r2h = r => '#' + r.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const A = h2r(a), B = h2r(b); return r2h(A.map((v, i) => v + (B[i] - v) * t)); };
  const dark = (c, t) => mix(c, '#1c1430', t), light = (c, t) => mix(c, '#ffffff', t);

  // ---------- matematică ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => (t = clamp(t, 0, 1), t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeS = t => (t = clamp(t, 0, 1), -(Math.cos(Math.PI * t) - 1) / 2);
  const smooth = t => (t = clamp(t, 0, 1), t * t * (3 - 2 * t));
  const D2R = Math.PI / 180;
  // fereastră lină: 0 înainte de a, 1 între a și b, cu rampe de r secunde
  const win = (t, a, b, r = .18) => clamp(Math.min((t - a) / r, (b - t) / r), 0, 1);

  // ---------- parsarea comenzilor ----------
  function parseDo(str) {
    const cmds = [];
    (str || '').split(';').map(s => s.trim()).filter(Boolean).forEach(s => {
      const m = s.split(/\s+/); const k = m[0];
      const range = x => { const [a, b] = String(x).split('-').map(Number); return [a, isNaN(b) ? a : b]; };
      if (['walk', 'move', 'fly', 'hop', 'run', 'swim'].includes(k)) {
        const [a, b] = range(m[1]); let to = null;
        const gi = m.indexOf('>'); if (gi > 0 && m[gi + 1]) to = m[gi + 1].split(',').map(Number);
        cmds.push({ k: 'path', mode: k, a, b, to });
      } else if (['gest', 'face', 'look', 'eyes'].includes(k)) {
        cmds.push({ k, v: m[1], t: +(m[2] || 0), d: +(m[3] || (k === 'gest' ? .55 : .25)) });
      } else if (k === 'turn' || k === 'jump') {
        cmds.push({ k, t: +(m[1] || 0) });
      } else if (k === 'fade') {
        const [a, b] = range(m[1]); cmds.push({ k, a, b, dir: m[2] || 'in' });
      } else {
        const [a, b] = range(m[1] || '0-999'); cmds.push({ k, a, b });
      }
    });
    return cmds;
  }

  // ---------- IK cu două segmente ----------
  // s: umăr, t: țintă mână, l1/l2 lungimi, side: -1 cot spre stânga, +1 spre dreapta
  function ik(sx, sy, tx, ty, l1, l2, side) {
    let dx = tx - sx, dy = ty - sy; let d = Math.hypot(dx, dy);
    const dmax = l1 + l2 - .01, dmin = Math.abs(l1 - l2) + .5;
    if (d > dmax) { dx *= dmax / d; dy *= dmax / d; d = dmax; }
    if (d < dmin) { d = dmin; }
    const a = Math.atan2(dy, dx);
    const al = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    // alegem soluția cu cotul în partea dorită și mai jos
    let best = null;
    [a + al, a - al].forEach(u => {
      const ex = sx + l1 * Math.cos(u), ey = sy + l1 * Math.sin(u);
      const score = side * (ex - sx) + .35 * (ey - sy);
      if (!best || score > best.score) best = { u, ex, ey, score };
    });
    const f = Math.atan2(sy + dy - best.ey, sx + dx - best.ex);
    // unghi „rotate” SVG pentru un segment desenat în jos (0,1)
    const rot = phi => Math.atan2(-Math.cos(phi), Math.sin(phi)) / D2R;
    const r1 = rot(best.u), r2 = rot(f);
    return [r1, r2 - r1];
  }

  // ---------- gesturi: ținta mâinilor [Lx,Ly,Rx,Ry] în coordonatele corpului ----------
  const GEST = {
    rest: [-18.5, -35, 18.5, -35],
    pray: [-1.6, -55, 1.6, -55],          // mâini împreunate la piept
    raise: [-33, -101, 33, -101],         // brațele ridicate (bucurie, slavă)
    open: [-39, -50, 39, -50],            // brațe deschise (primire)
    point: [-18.5, -35, 47, -68],         // arată spre dreapta
    pointup: [-18.5, -35, 22, -103],      // arată spre cer
    wave: [-18.5, -35, 31, -94],          // face cu mâna
    bless: [-18.5, -35, 27, -86],         // binecuvântează
    cover: [-5, -86, 5, -86],             // mâinile pe față (tristețe, rușine)
    think: [7, -47, 3, -78],              // mâna la bărbie
    hold: [-18.5, -35, 22, -50],          // ține toiagul / un obiect
    carry: [-9, -50, 9, -50],             // poartă ceva cu ambele mâini
    give: [-18.5, -35, 40, -56],          // întinde / dă ceva
    heart: [-18.5, -35, -5, -59],         // mâna pe inimă
    shade: [-18.5, -35, 5, -96],          // mâna streașină la ochi
    knock: [-18.5, -35, 37, -74],         // bate la ușă
    beg: [-24, -52, 24, -52],             // cere, palmele în sus
    hug: [9, -60, -9, -60],               // se strânge în brațe (frig, frică)
    hips: [-23, -46, 23, -46],            // mâinile în șold (mândrie)
    shrug: [-30, -60, 30, -60],
  };
  const ONEHAND = ['point', 'pointup', 'wave', 'bless', 'think', 'give', 'heart', 'shade', 'knock'];
  const OSC = { // oscilații peste gest: [mână, ampX, ampY, frecvență]
    wave: ['R', 6, 0, 2.2], knock: ['R', 5, 0, 3], beg: ['B', 0, 2, .8], raise: ['B', 0, 2.5, .9], bless: ['R', 1.5, 2, .7], cover: ['B', 0, 1.2, 2.6]
  };

  // ---------- fețe ----------
  const FACES = {
    neutral: { eyes: 'open', brow: 'n', mouth: 'n' },
    smile: { eyes: 'open', brow: 'n', mouth: 'smile' },
    joy: { eyes: 'happy', brow: 'up', mouth: 'joy' },
    sad: { eyes: 'open', brow: 'sad', mouth: 'sad' },
    cry: { eyes: 'closed', brow: 'sad', mouth: 'sad', tear: 1 },
    surprise: { eyes: 'wide', brow: 'up', mouth: 'o' },
    angry: { eyes: 'open', brow: 'angry', mouth: 'flat' },
    stern: { eyes: 'open', brow: 'angry', mouth: 'n' },
    fear: { eyes: 'wide', brow: 'sad', mouth: 'wavy' },
    peace: { eyes: 'closed', brow: 'n', mouth: 'smile' },
    pray: { eyes: 'closed', brow: 'n', mouth: 'n' },
    think: { eyes: 'side', brow: 'think', mouth: 'flat' },
    proud: { eyes: 'half', brow: 'angry', mouth: 'smirk' },
  };
  const BROWS = {
    n: ['M-7,-6.3 Q-4.6,-7.6 -2.3,-6.4', 'M2.3,-6.4 Q4.6,-7.6 7,-6.3'],
    up: ['M-7,-8.3 Q-4.6,-9.9 -2.3,-8.6', 'M2.3,-8.6 Q4.6,-9.9 7,-8.3'],
    sad: ['M-7,-5.6 Q-4.6,-6.2 -2.3,-8.2', 'M2.3,-8.2 Q4.6,-6.2 7,-5.6'],
    angry: ['M-7,-8 Q-4.6,-7.4 -2.3,-5.3', 'M2.3,-5.3 Q4.6,-7.4 7,-8'],
    think: ['M-7,-6.3 Q-4.6,-7.6 -2.3,-6.4', 'M2.3,-7.8 Q4.6,-9.4 7,-8.4'],
  };
  const MOUTHS = {
    n: { d: 'M-2.7,7.6 Q0,8.8 2.7,7.6', s: 1 },
    smile: { d: 'M-3.9,6.7 Q0,10.6 3.9,6.7', s: 1 },
    joy: { d: 'M-4.3,6.3 Q0,12.6 4.3,6.3 Q0,7.7 -4.3,6.3Z', f: 1 },
    sad: { d: 'M-3.1,9.2 Q0,6.5 3.1,9.2', s: 1 },
    o: { e: [0, 8.4, 1.9, 2.6] },
    flat: { d: 'M-3,8.1 L3,8.1', s: 1 },
    wavy: { d: 'M-3.2,8.6 Q-1.6,7.3 0,8.6 Q1.6,9.9 3.2,8.6', s: 1 },
    smirk: { d: 'M-3,8.4 Q1,9 3.6,6.8', s: 1 },
  };

  // ---------- presetări de personaje ----------
  const SK = { light: '#f2d2b3', med: '#e8c19c', tan: '#d6a57c', dark: '#a8754f' };
  const PRE = {
    proroc:   { robe: '#5d4a86', belt: '#c8a24a', skin: SK.med, hair: 'bald', hairC: '#ececec', beard: 'long', beardC: '#f4f4f4', aura: 1, prop: 'staff', gest: 'hold', age: 1 },
    sfant:    { robe: '#7a2b35', mantle: '#d9b45a', skin: SK.med, hair: 'short', hairC: '#e2e2e2', beard: 'long', beardC: '#efefef', aura: 1 },
    luminos:  { robe: '#fbf6ea', mantle: '#b8283c', skin: SK.med, hair: 'long', hairC: '#6a4528', beard: 'short', beardC: '#6a4528', aura: 2, glow: 1 },
    inger:    { robe: '#fbf8ee', belt: '#e6b347', skin: SK.light, hair: 'curly', hairC: '#f2c45a', wings: 1, halo: 1 },
    copil:    { robe: '#4f8fd6', belt: '#2f5f9a', skin: SK.light, hair: 'short', hairC: '#7a4b2a', kid: 1 },
    fetita:   { robe: '#e86f8a', belt: '#b84a66', skin: SK.light, hair: 'braids', hairC: '#8a5530', kid: 1 },
    taran:    { robe: '#f4efe2', belt: '#b0342c', ie: '#b0342c', vest: '#3a2e2a', skin: SK.tan, hair: 'short', hairC: '#3b2a1e', hat: 'clop', beard: 'mus', beardC: '#3b2a1e' },
    taranca:  { robe: '#f4efe2', ie: '#b0342c', apron: '#2a2426', skin: SK.med, hat: 'basma', hatC: '#b83a3a' },
    cioban:   { robe: '#efe6d2', belt: '#8a3a2a', vest: '#f6f1e6', vestEdge: '#6b4a2a', skin: SK.tan, hair: 'short', hairC: '#2e241c', hat: 'caciula', beard: 'short', beardC: '#2e241c', prop: 'crook', gest: 'hold' },
    rege:     { robe: '#8e1f2f', mantle: '#c03244', ermine: 1, belt: '#e6b347', skin: SK.med, hair: 'short', hairC: '#6b4a2a', beard: 'short', beardC: '#6b4a2a', hat: 'crown' },
    imparat:  { robe: '#3a2a6a', mantle: '#6b2a8a', ermine: 1, belt: '#e6b347', skin: SK.med, hair: 'short', hairC: '#d9d9d9', beard: 'long', beardC: '#e8e8e8', hat: 'crown', age: 1 },
    bogat:    { robe: '#2e6b5a', mantle: '#c69a3a', belt: '#e6b347', skin: SK.med, hair: 'short', hairC: '#2a2420', beard: 'short', beardC: '#2a2420', hat: 'turban', hatC: '#e9e1c9', belly: 1, prop: 'purse', face: 'proud' },
    preot:    { robe: '#1f1f26', skin: SK.med, hair: 'long', hairC: '#4a3a30', beard: 'long', beardC: '#4a3a30', hat: 'kamilavka', prop: 'cross', cross: 1 },
    calugar:  { robe: '#26232b', skin: SK.med, beard: 'long', beardC: '#9a9a9a', hat: 'culion', prop: 'rope', gest: 'pray' },
    calugarita:{ robe: '#26232b', skin: SK.light, hat: 'culion', hatC: '#1d1b22', prop: 'rope', gest: 'pray' },
    ostas:    { robe: '#7a2f24', armor: '#aab1bb', belt: '#5a3b22', skin: SK.tan, hat: 'helmet', beard: 'short', beardC: '#3b2a1e', prop: 'spear', gest: 'hold' },
    invatat:  { robe: '#e9e2cf', mantle: '#6b5aa3', skin: SK.med, hair: 'bald', hairC: '#b9b9b9', beard: 'short', beardC: '#c9c9c9', prop: 'scroll', gest: 'hold', age: 1 },
    negustor: { robe: '#c0763a', belt: '#5a3b22', vest: '#6b3a22', skin: SK.tan, hat: 'turban', hatC: '#f0e6cf', beard: 'short', beardC: '#2e241c', prop: 'purse' },
    pescar:   { robe: '#5f8aa6', belt: '#3a4a5a', skin: SK.tan, hair: 'curly', hairC: '#2e241c', beard: 'short', beardC: '#2e241c' },
    mama:     { robe: '#3e7cb1', belt: '#2b5a85', skin: SK.light, hat: 'veil', hatC: '#ece4d2' },
    batrana:  { robe: '#6d5a4a', apron: '#3a302a', skin: SK.med, hat: 'basma', hatC: '#3a3436', prop: 'cane', gest: 'hold', age: 1 },
    batran:   { robe: '#7d6a55', belt: '#4a3a2a', skin: SK.med, hair: 'bald', hairC: '#d9d9d9', beard: 'long', beardC: '#e6e6e6', prop: 'cane', gest: 'hold', age: 1 },
    orasean:  { robe: '#3d4a5c', vest: '#2a3240', belt: '#2a3240', skin: SK.light, hair: 'short', hairC: '#3a2a20', hat: 'gentleman' },
    umbra:    { robe: '#2b2140', skin: '#2b2140', silhouette: 1, eyesGlow: '#c9a8ff' },
  };

  // ---------- desen: om, din față ----------
  function hairBack(p, o) {
    const c = o.hairC;
    if (o.hair === 'long') P(p, 'M-14,-4 Q-17.5,16 -13,25 Q0,28 13,25 Q17.5,16 14,-4Z', dark(c, .12));
    if (o.hair === 'braids') { S(p, 'M-12,2 Q-15,14 -13,24', dark(c, .1), 5); S(p, 'M12,2 Q15,14 13,24', dark(c, .1), 5); C(p, -13, 26, 2.6, '#e86f8a'); C(p, 13, 26, 2.6, '#e86f8a'); }
    if (o.hat === 'basma') P(p, 'M-15.5,-2 Q-19.5,16 -15,27 L15,27 Q19.5,16 15.5,-2Z', dark(o.hatC || '#b83a3a', .12));
    if (o.hat === 'veil') P(p, 'M-16,-4 Q-21,18 -19,33 Q0,37 19,33 Q21,18 16,-4Z', dark(o.hatC, .1));
    if (o.hat === 'culion') P(p, 'M-13,-22 Q-18,4 -17,30 Q0,33 17,30 Q18,4 13,-22Z', '#18161c');
  }
  const CAP = 'M-13.6,1.5 Q-15.6,-16.6 0,-16.9 Q15.6,-16.6 13.6,1.5 Q13,-5 10.5,-7.6 Q0,-12.6 -10.5,-7.6 Q-13,-5 -13.6,1.5Z';
  function hairFront(p, o) {
    const c = o.hairC;
    if (o.hair === 'short' || o.hair === 'long' || o.hair === 'braids') { P(p, CAP, c); S(p, 'M-6,-14.5 Q-2,-10.5 3,-12', light(c, .18), 1.2, { opacity: .7 }); }
    if (o.hair === 'curly') { P(p, CAP, c); [[-10, -9, 4.6], [-6, -14, 5], [0, -15.6, 5.2], [6, -14, 5], [10, -9, 4.6], [12.4, -3, 3.6], [-12.4, -3, 3.6]].forEach(([x, y, r]) => C(p, x, y, r, c)); }
    if (o.hair === 'bald') { P(p, 'M-13.6,3.5 Q-15,-5 -12,-8.6 Q-12.2,-2 -10.4,3Z', c); P(p, 'M13.6,3.5 Q15,-5 12,-8.6 Q12.2,-2 10.4,3Z', c); E(p, -4, -9, 4, 2, '#fff', { opacity: .35 }); }
  }
  function hat(p, o) {
    const h = o.hat; if (!h) return;
    if (h === 'basma' || h === 'veil') {
      const c = o.hatC || '#b83a3a';
      P(p, 'M-14.6,3.5 Q-17,-17.8 0,-18.4 Q17,-17.8 14.6,3.5 Q13.4,-6 11,-8.8 Q0,-13.8 -11,-8.8 Q-13.4,-6 -14.6,3.5Z', c);
      P(p, 'M-14.6,3.5 Q-14,11 -7.6,14.4 L-6.4,12 Q-11.2,8.4 -12.6,1Z', c); P(p, 'M14.6,3.5 Q14,11 7.6,14.4 L6.4,12 Q11.2,8.4 12.6,1Z', c);
      if (h === 'basma') { [[-8, -12], [0, -15], [8, -12], [-12, -4], [12, -4]].forEach(([x, y]) => C(p, x, y, 1.3, light(c, .55), { opacity: .8 })); P(p, 'M-3,13.5 L0,17 L3,13.5 L0,12Z', dark(c, .15)); }
      else S(p, 'M-12.6,-6 Q0,-13.6 12.6,-6', dark(c, .2), 1, { opacity: .6 });
    }
    if (h === 'crown') { P(p, 'M-10.5,-11.6 L-11.8,-25 L-5.6,-18.2 L0,-27.8 L5.6,-18.2 L11.8,-25 L10.5,-11.6 Q0,-14.2 -10.5,-11.6Z', '#f2c14e', { stroke: '#b8862a', 'stroke-width': 1 }); C(p, 0, -15.6, 1.8, '#d83a4a'); C(p, -6.6, -14.6, 1.3, '#3a7ad8'); C(p, 6.6, -14.6, 1.3, '#3aa86a'); [-11.8, 0, 11.8].forEach((x, i) => C(p, x, [-25, -27.8, -25][i], 1.5, '#fff3c0')); }
    if (h === 'clop') { E(p, 0, -10.4, 19.5, 3.8, '#2b2522'); P(p, 'M-10.5,-10.6 Q-11.2,-24.6 0,-25 Q11.2,-24.6 10.5,-10.6Z', '#332b27'); P(p, 'M-10.7,-14 Q0,-16 10.7,-14 L10.6,-11.4 Q0,-13.2 -10.6,-11.4Z', '#b0342c'); }
    if (h === 'caciula') { P(p, 'M-12.8,-6.4 Q-14.8,-29 0,-30.6 Q14.8,-29 12.8,-6.4 Q0,-10.6 -12.8,-6.4Z', '#2f2620'); for (let i = 0; i < 9; i++) C(p, -10 + i * 2.5, -26 + Math.abs(i - 4) * 2.2 + (i % 2) * 2, 1.6, '#3d322a'); }
    if (h === 'kamilavka' || h === 'culion') { P(p, 'M-11.8,-8.6 L-12.9,-26.4 Q0,-28.8 12.9,-26.4 L11.8,-8.6 Q0,-11.6 -11.8,-8.6Z', '#18161c'); E(p, 0, -26.6, 13, 2.6, '#2a2730'); }
    if (h === 'culion') { P(p, 'M-14.6,4 Q-15.4,-6 -11.8,-8.6 L-11.2,4Z', '#18161c'); P(p, 'M14.6,4 Q15.4,-6 11.8,-8.6 L11.2,4Z', '#18161c'); }
    if (h === 'helmet') { P(p, 'M-14.4,0 Q-15.8,-19.8 0,-20.4 Q15.8,-19.8 14.4,0 L11,-5.4 Q0,-9.8 -11,-5.4Z', '#aab1bb'); P(p, 'M-8,-16 Q-2,-19 4,-18', 'none', { stroke: '#e3e7ec', 'stroke-width': 1.6, 'stroke-linecap': 'round' }); P(p, 'M-2,-20 Q-1,-32 10,-31.6 Q5,-26 2.4,-19.8Z', '#c0392b'); }
    if (h === 'turban') { const c = o.hatC || '#efe6cf'; P(p, 'M-14.6,-2 Q-17,-22.6 0,-23.4 Q17,-22.6 14.6,-2 Q0,-10.6 -14.6,-2Z', c); S(p, 'M-13,-10 Q0,-16 13,-12', dark(c, .18), 1.3); S(p, 'M-12,-16 Q2,-21 12,-16', dark(c, .18), 1.3); C(p, 0, -12.6, 2.2, '#d83a4a'); }
    if (h === 'gentleman') { E(p, 0, -11.2, 17, 3, '#22252c'); P(p, 'M-9.6,-11.4 L-10.2,-27 Q0,-28.6 10.2,-27 L9.6,-11.4Z', '#2a2e36'); P(p, 'M-9.8,-15 L9.8,-15 L9.7,-12.4 L-9.7,-12.4Z', '#6b2a2a'); }
  }
  function beard(p, o) {
    const c = o.beardC || o.hairC || '#3b2a1e';
    if (o.beard === 'short') P(p, 'M-12,2.4 Q-10.8,14.8 0,16.8 Q10.8,14.8 12,2.4 Q8,7.9 4,8.4 Q0,7.2 -4,8.4 Q-8,7.9 -12,2.4Z', c);
    if (o.beard === 'long') { P(p, 'M-12.2,2.4 Q-12.6,23 0,31 Q12.6,23 12.2,2.4 Q8,8 4,8.4 Q0,7.2 -4,8.4 Q-8,8 -12.2,2.4Z', c); S(p, 'M-4,14 Q-3,21 -1,25 M4,14 Q3,21 1,25', dark(c, .12), 1, { opacity: .6 }); }
  }
  function mustache(p, o) { const c = o.beardC || '#3b2a1e'; if (o.beard) P(p, 'M-6.8,6.7 Q-3.2,4.4 0,6 Q3.2,4.4 6.8,6.7 Q3.2,8 0,7 Q-3.2,8 -6.8,6.7Z', dark(c, .08)); }

  function face(p, o, name) {
    const f = FACES[name] || FACES.neutral; const fg = G(p, { 'data-face': name });
    const ink = o.silhouette ? (o.eyesGlow || '#c9a8ff') : '#2a1f1a';
    const browC = o.silhouette ? 'none' : dark(o.hairC || o.beardC || '#5a4030', .25);
    // obraji
    if (!o.silhouette) { C(fg, -7.8, 4.4, 2.7, '#f09a8a', { opacity: f.mouth === 'joy' ? .55 : .38 }); C(fg, 7.8, 4.4, 2.7, '#f09a8a', { opacity: f.mouth === 'joy' ? .55 : .38 }); }
    // ochi
    const eyes = G(fg, { transform: 'translate(0,-1)' }); const blinkG = G(eyes, { class: 'blink' });
    if (f.eyes === 'open' || f.eyes === 'side' || f.eyes === 'half') {
      const dx = f.eyes === 'side' ? 1.3 : 0;
      [-4.7, 4.7].forEach(x => { E(blinkG, x + dx, 0, 1.95, f.eyes === 'half' ? 1.3 : 2.35, ink); if (!o.silhouette) C(blinkG, x + dx + .7, -.8, .62, '#fff'); });
      if (f.eyes === 'half' && !o.silhouette) [-4.7, 4.7].forEach(x => S(blinkG, `M${x - 2.4},-1.2 L${x + 2.4},-1.2`, dark(o.skin, .35), 1.2));
    } else if (f.eyes === 'wide') {
      [-4.8, 4.8].forEach(x => { E(blinkG, x, 0, 2.9, 3.2, '#fff', { stroke: dark(o.skin, .35), 'stroke-width': .6 }); C(blinkG, x, .3, 1.75, ink); C(blinkG, x + .6, -.4, .5, '#fff'); });
    } else if (f.eyes === 'closed') {
      [-4.7, 4.7].forEach(x => S(eyes, `M${x - 2.4},0 Q${x},2 ${x + 2.4},0`, ink, 1.25));
    } else if (f.eyes === 'happy') {
      [-4.7, 4.7].forEach(x => S(eyes, `M${x - 2.4},1 Q${x},-2.1 ${x + 2.4},1`, ink, 1.35));
    }
    if (f.tear) E(fg, -6, 4, .9, 1.4, '#9fd3ff');
    // sprâncene
    if (!o.silhouette) BROWS[f.brow].forEach(d => S(fg, d, browC, 1.35));
    // nas
    if (!o.silhouette && !o.kid) S(fg, 'M-.3,2.2 Q1.6,3.8 0,4.9', dark(o.skin, .22), 1.05);
    // gură (deschiderea pentru vorbit se face separat)
    if (!o.silhouette) {
      const m = MOUTHS[f.mouth]; const mg = G(fg, { class: 'mouthStatic' });
      if (m.e) E(mg, m.e[0], m.e[1], m.e[2], m.e[3], '#6b2a26');
      else if (m.f) P(mg, m.d, '#8a3a32');
      else S(mg, m.d, '#7a3b2f', 1.3);
    }
    return fg;
  }

  function prop(p, name, o) {
    if (!name) return null; const g = G(p);
    if (name === 'staff') { S(g, 'M0,-82 L0,46', '#7a5230', 4.6); C(g, 0, -83, 3, '#8a6038'); S(g, 'M-1,-70 L-1,30', '#9a6c40', 1.2, { opacity: .6 }); }
    if (name === 'crook') { S(g, 'M0,-74 L0,46', '#7a5230', 4.2); S(g, 'M0,-74 Q0,-92 10,-92 Q19,-92 19,-83', '#7a5230', 4.2); }
    if (name === 'cane') { S(g, 'M0,-6 L0,34', '#6b4a2a', 3.8); S(g, 'M0,-6 Q0,-12 6,-12', '#6b4a2a', 3.8); }
    if (name === 'spear') { S(g, 'M0,-96 L0,46', '#6b4a2a', 3.6); P(g, 'M0,-112 L4.4,-96 L0,-93 L-4.4,-96Z', '#cfd5dc'); }
    if (name === 'scroll') { el('rect', { x: -11, y: -6, width: 22, height: 12, rx: 2, fill: '#f1e4c2' }, g); C(g, -11, 0, 4, '#e2d1a6'); C(g, 11, 0, 4, '#e2d1a6'); S(g, 'M-6,-2 L6,-2 M-6,2 L4,2', '#b89a68', .9); }
    if (name === 'book') { el('rect', { x: -9, y: -12, width: 18, height: 22, rx: 2, fill: '#7a2430' }, g); S(g, 'M0,-7 L0,3 M-4,-3 L4,-3', '#f2c14e', 1.6); }
    if (name === 'candle') { el('rect', { x: -2.4, y: -16, width: 4.8, height: 16, rx: 1.2, fill: '#f6efd8' }, g); C(g, 0, -22, 9, 'url(#chGlow)'); P(g, 'M0,-26 Q3,-21 0,-17.5 Q-3,-21 0,-26Z', '#ffb43c', { class: 'chFlame' }); }
    if (name === 'lamp') { P(g, 'M-9,0 Q0,7 9,0 Q6,-4 0,-4 Q-6,-4 -9,0Z', '#c8913a'); C(g, 9, -6, 9, 'url(#chGlow)'); P(g, 'M9,-11 Q11.5,-6 9,-3 Q6.5,-6 9,-11Z', '#ffb43c', { class: 'chFlame' }); }
    if (name === 'cross') { P(g, 'M-1.8,-14 L1.8,-14 L1.8,-8 L6,-8 L6,-4.4 L1.8,-4.4 L1.8,8 L-1.8,8 L-1.8,-4.4 L-6,-4.4 L-6,-8 L-1.8,-8Z', '#f2c14e', { stroke: '#b8862a', 'stroke-width': .8 }); }
    if (name === 'purse') { P(g, 'M-8,2 Q-11,14 0,15 Q11,14 8,2 Q4,-2 0,-2 Q-4,-2 -8,2Z', '#a8803f'); S(g, 'M-5,0 Q0,3 5,0', '#6b4a22', 1.4); C(g, 0, 8, 2.2, '#f2c14e'); }
    if (name === 'rope') { for (let i = 0; i < 9; i++) C(g, Math.sin(i * .7) * 3, 3 + i * 3, 1.4, '#3a2a22'); }
    if (name === 'bread') { E(g, 0, 0, 10, 7, '#d49a52'); S(g, 'M-5,-3 L-2,3 M0,-4 L3,2 M4,-3 L6,1', '#b07a3a', 1.2); }
    if (name === 'basket') { P(g, 'M-12,-2 L12,-2 L9,12 L-9,12Z', '#b07a3a'); S(g, 'M-12,-2 Q0,-22 12,-2', '#8a5a2a', 2); C(g, -5, -4, 3.6, '#e8453c'); C(g, 2, -5, 3.6, '#f0a63a'); C(g, 7, -3, 3.2, '#84c66f'); }
    if (name === 'flower') { S(g, 'M0,0 L0,-20', '#4f9a45', 1.6); [0, 72, 144, 216, 288].forEach(a => E(g, Math.sin(a * D2R) * 3.4, -22 - Math.cos(a * D2R) * 3.4, 2.6, 2.6, '#ff7aa2')); C(g, 0, -22, 2, '#ffd14d'); }
    if (name === 'coin') { C(g, 0, 0, 4.4, '#f2c14e', { stroke: '#b8862a', 'stroke-width': .8 }); }
    if (name === 'hoe') { S(g, 'M0,-40 L0,44', '#7a5230', 3.6); P(g, 'M-2,40 L12,42 L11,48 L-2,46Z', '#8a9098'); }
    if (name === 'bowl') { P(g, 'M-10,-2 Q0,12 10,-2Z', '#c58a4a'); E(g, 0, -2, 10, 2.4, '#8a5a2a'); }
    return g;
  }

  function buildHuman(root, o) {
    const R = { o, type: 'human' };
    const robe = o.robe, sh = dark(robe, .26), sleeve = light(robe, .06), skin = o.skin;
    const hw = o.belly ? 26 : 24, tw = 14;
    if (o.silhouette) R.sil = 1;
    R.shadow = E(root, 0, 0, 27, 5, '#000', { opacity: .2 });
    const fig = R.fig = G(root);
    const back = G(fig);
    if (o.glow) { const gl = G(back, { class: 'chGlowBody' }); E(gl, 0, -60, 70, 90, 'url(#chGlowBig)'); R.glowEl = gl; }
    if (o.aura) { R.aura = G(back, { transform: 'translate(0,-88)' }); C(R.aura, 0, -2, 26, 'url(#chGlow)', { opacity: .7 }); C(R.aura, 0, -2, 20, 'none', { stroke: '#ffd86b', 'stroke-width': 2.2, opacity: .7 }); }
    if (o.wings) {
      const wing = (side) => { const j = G(back, { transform: `translate(${side * 6},-64)` }); const w = G(j); const d = side < 0 ? 'M0,0 C-40,-36 -80,-14 -70,32 C-52,20 -36,25 -20,33 C-13,18 -5,10 0,0Z' : 'M0,0 C40,-36 80,-14 70,32 C52,20 36,25 20,33 C13,18 5,10 0,0Z'; P(w, d, '#ffffff', { stroke: '#e2d6b0', 'stroke-width': 1.4 }); S(w, side < 0 ? 'M-14,6 Q-34,0 -52,10 M-18,16 Q-36,14 -50,22' : 'M14,6 Q34,0 52,10 M18,16 Q36,14 50,22', '#e8dfc4', 1.3); return w; };
      R.wL = wing(-1); R.wR = wing(1);
    }
    if (o.mantle) P(back, `M-14.5,-71 Q-30,-40 -29.5,-3 Q0,1.5 29.5,-3 Q30,-40 14.5,-71 Q0,-77 -14.5,-71Z`, dark(o.mantle, .12));
    // picioare
    R.feet = [-1, 1].map(s => { const f = G(fig); E(f, 0, -2.6, 7, 3.3, o.silhouette ? robe : '#4a3226'); return f; });
    // corp (respiră)
    const body = R.body = G(fig);
    const bodyIn = G(body);
    const yOff = 0;
    P(bodyIn, `M${-hw},-3 C${-hw + 1},-26 ${-tw - 5},-52 ${-tw},-68 Q0,-78.5 ${tw},-68 C${tw + 5},-52 ${hw - 1},-26 ${hw},-3 Q0,-.6 ${-hw},-3Z`, robe);
    if (!o.silhouette) {
      P(bodyIn, `M3.5,-76.5 Q${tw},-73 ${tw},-68 C${tw + 5},-52 ${hw - 1},-26 ${hw},-3 Q${hw * .5},-1.4 6.5,-1.2 C8.6,-26 7.4,-54 3.5,-76.5Z`, sh, { opacity: .55 });
      S(bodyIn, 'M-2,-62 Q-4.4,-32 -3.2,-2', sh, 1.5, { opacity: .55 });
      S(bodyIn, `M${-hw + 1.5},-6 Q0,-3.4 ${hw - 1.5},-6`, light(robe, .25), 1.2, { opacity: .5 });
      if (o.ie) { const c = o.ie; P(bodyIn, 'M-3,-74.6 L3,-74.6 L3.4,-50 L-3.4,-50Z', c, { opacity: .9 }); for (let i = 0; i < 5; i++) P(bodyIn, `M0,${-72 + i * 4.6} l2,2 l-2,2 l-2,-2Z`, '#f4efe2'); for (let x = -hw + 3; x < hw - 2; x += 5) P(bodyIn, `M${x},-8 l2.4,-2.6 l2.4,2.6 l-2.4,2.6Z`, c, { opacity: .85 }); }
      if (o.apron) { P(bodyIn, 'M-14.8,-44 L-17,-6.5 Q0,-4.6 17,-6.5 L14.8,-44Z', o.apron); for (let y = -38; y < -8; y += 7) S(bodyIn, `M-15.6,${y} L15.6,${y}`, '#b0342c', 1.4, { opacity: .8 }); }
      if (o.vest) { const ve = o.vestEdge || dark(o.vest, .3); P(bodyIn, 'M-14.2,-69.6 Q-19.6,-50 -20.4,-33 L-7.6,-33 Q-6.4,-55 -5,-73Z', o.vest, { stroke: ve, 'stroke-width': 1.4 }); P(bodyIn, 'M14.2,-69.6 Q19.6,-50 20.4,-33 L7.6,-33 Q6.4,-55 5,-73Z', o.vest, { stroke: ve, 'stroke-width': 1.4 }); if (o.vestEdge) [[-12, -60], [-14, -48], [12, -60], [14, -48]].forEach(([x, y]) => C(bodyIn, x, y, 1.6, '#b0342c')); }
      if (o.armor) { P(bodyIn, 'M-15,-70 Q0,-75 15,-70 L17.4,-43 Q0,-38.6 -17.4,-43Z', o.armor); S(bodyIn, 'M-7,-66 Q-9,-55 -8,-46', '#e3e7ec', 1.8); for (let i = -4; i <= 4; i++) P(bodyIn, `M${i * 4.2 - 1.8},-42 L${i * 4.2 + 1.8},-42 L${i * 4.6 + 2},-27 L${i * 4.6 - 2},-27Z`, dark(o.armor, .18)); }
      if (o.belt) P(bodyIn, 'M-17.6,-47.4 Q0,-44.6 17.6,-47.4 L17.9,-42.6 Q0,-39.8 -17.9,-42.6Z', o.belt);
      if (o.belt && o.ie) { S(bodyIn, 'M-5,-42 L-6.4,-28 M-2.4,-42 L-2.8,-30', o.belt, 2.2); }
      if (o.cross) { P(bodyIn, 'M-1.6,-60 L1.6,-60 L1.6,-55 L5,-55 L5,-52 L1.6,-52 L1.6,-44 L-1.6,-44 L-1.6,-52 L-5,-52 L-5,-55 L-1.6,-55Z', '#e6b347'); S(bodyIn, 'M-8,-72 Q0,-62 8,-72', '#e6b347', .9); }
      if (o.mantle) { P(bodyIn, `M-14.5,-71 Q-22,-40 -24.5,-3 L-18.5,-2.6 Q-16.6,-40 -8.6,-73Z`, o.mantle); P(bodyIn, `M14.5,-71 Q22,-40 24.5,-3 L18.5,-2.6 Q16.6,-40 8.6,-73Z`, o.mantle); if (o.ermine) { S(bodyIn, 'M-9.6,-72 Q-17,-40 -19,-3', '#fbf8f2', 3.6); S(bodyIn, 'M9.6,-72 Q17,-40 19,-3', '#fbf8f2', 3.6); S(bodyIn, 'M-14,-73.4 Q0,-66 14,-73.4', '#fbf8f2', 4); for (let i = 0; i < 6; i++) { C(bodyIn, -14 + i * .9, -60 + i * 10, .9, '#222'); C(bodyIn, 14 - i * .9, -60 + i * 10, .9, '#222'); } } }
      S(bodyIn, 'M-6,-75 Q0,-69.6 6,-75', sh, 1.3, { opacity: .7 });
    }
    // cap
    const hj = G(body, { transform: 'translate(0,-74)' }); R.headRot = G(hj);
    el('rect', { x: -4.2, y: -6, width: 8.4, height: 8, rx: 2, fill: o.silhouette ? robe : dark(skin, .1) }, R.headRot);
    const head = R.head = G(R.headRot, { transform: `translate(0,-14)${o.kid ? ' scale(1.14)' : ''}` });
    hairBack(head, o);
    C(head, -12.8, 1.2, 3, o.silhouette ? robe : dark(skin, .06)); C(head, 12.8, 1.2, 3, o.silhouette ? robe : dark(skin, .06));
    C(head, 0, 0, 13, skin);
    if (!o.silhouette) P(head, 'M5,-12 A13,13 0 0 1 5,12 A16,16 0 0 0 5,-12Z', dark(skin, .12), { opacity: .5 });
    beard(head, o);
    R.faceWrap = G(head);
    R.faces = {}; R.faceNames = new Set([o.face || 'neutral']);
    R.mouthTalk = null;
    R.hairFrontG = G(head); hairFront(R.hairFrontG, o); hat(R.hairFrontG, o);
    R.mustacheG = G(head);
    if (o.halo) R.halo = E(head, 0, -25, 12, 3.6, 'none', { stroke: '#ffd04d', 'stroke-width': 2.6 });
    // brațe
    const arm = (side) => {
      const sx = side * 13.6, sy = -65.6; const j = G(body, { transform: `translate(${sx},${sy})` });
      const up = G(j); const sc = o.silhouette ? robe : sleeve;
      S(up, 'M0,0 L0,17', o.silhouette ? robe : sh, 11); S(up, 'M0,0 L0,17', sc, 9.2);
      if (o.ie && !o.silhouette) S(up, 'M0,6 L0,10', o.ie, 9.2, { 'stroke-linecap': 'butt', opacity: .85 });
      const fj = G(up, { transform: 'translate(0,17)' }); const fo = G(fj);
      S(fo, 'M0,0 L0,13.4', o.silhouette ? robe : sh, 10); S(fo, 'M0,0 L0,13.4', sc, 8.4);
      if (o.ermine && !o.silhouette) S(fo, 'M0,11 L0,13.4', '#fbf8f2', 8.6, { 'stroke-linecap': 'butt' });
      const hand = G(fo, { transform: 'translate(0,16)' });
      const pr = G(hand);
      C(hand, 0, 0, 4.5, o.silhouette ? robe : skin);
      return { sx, sy, up, fo, hand, pr, side };
    };
    R.armL = arm(-1); R.armR = arm(1);
    R.l1 = 17; R.l2 = 16;
    if (o.prop) { const side = o.propHand === 'L' ? R.armL : R.armR; R.prop = prop(side.pr, o.prop, o); R.propArm = side; }
    return R;
  }

  // ---------- om îngenuncheat la rugăciune, din profil (privește spre dreapta) ----------
  // genunchii pe pământ, șoldurile jos, spatele drept, capul plecat, ochii închiși, mâinile împreunate
  function buildKneel(root, o) {
    const R = { o, type: 'kneel' };
    const robe = o.robe, sh = dark(robe, .26), skin = o.skin, slv = light(robe, .06);
    R.shadow = E(root, -4, 0, 34, 5.2, '#000', { opacity: .22 });
    const fig = R.fig = G(root);
    if (o.glow) E(fig, 0, -40, 66, 70, 'url(#chGlowBig)');
    if (o.wings) { const w = G(fig, { transform: 'translate(-6,-48)' }); R.wR = G(w); P(R.wR, 'M0,0 C-30,-40 -74,-24 -66,26 C-50,16 -34,20 -20,28 C-12,16 -4,8 0,0Z', '#fff', { stroke: '#e2d6b0', 'stroke-width': 1.4 }); }
    // talpa piciorului din spate
    P(fig, 'M-33.5,-1 Q-34.5,-8 -29,-9.4 L-25,-2Z', '#4a3226');
    const body = R.body = G(fig);
    // roba: gamba pe pământ, șezutul pe călcâie, spatele drept, coapsa până la genunchi
    P(body, 'M-31,0 Q-32,-8 -25,-11.5 Q-16,-14 -12.6,-24 Q-11.4,-38 -8,-48 Q-2,-57.6 6.4,-54.4 Q12.4,-48 12.4,-37 Q12,-26 14,-15 Q19.6,-8 20.6,0 Q0,1.6 -31,0Z', robe);
    P(body, 'M-31,0 Q-32,-8 -25,-11.5 Q-16,-14 -12.6,-24 Q-11.4,-38 -8,-48 Q-5,-53 -1,-55.6 Q-5,-40 -4.4,-28 Q-6,-14 -16,-6 Q-24,-2 -31,0Z', sh, { opacity: .55 });
    S(body, 'M-2,-20 Q8,-17 14.6,-10', sh, 1.5, { opacity: .55 });
    S(body, 'M-26,-5 Q-8,-4 16,-3', light(robe, .2), 1.1, { opacity: .45 });
    if (o.belt) P(body, 'M-11.6,-35 L12.6,-35 L12.4,-30.8 L-11.8,-30.8Z', o.belt);
    if (o.mantle) P(body, 'M-8,-49 Q-12,-30 -17,-12 L-11,-12 Q-6,-30 -3,-52Z', o.mantle);
    // cap plecat
    const hj = G(body, { transform: 'translate(3,-54)' }); R.headRot = G(hj);
    const head = G(R.headRot, { transform: `translate(4,-12.6)${o.kid ? ' scale(1.12)' : ''}` });
    if (o.hat === 'basma' || o.hat === 'veil') P(head, 'M-14,-4 Q-20,16 -14,27 L4,27 Q2,10 -2,0Z', dark(o.hatC || '#b83a3a', .12));
    if (o.hat === 'culion') P(head, 'M-12,-18 Q-19,8 -16,30 L-2,30 Q-6,6 -2,-16Z', '#18161c');
    if (o.hair === 'long' || o.hair === 'braids') P(head, 'M-13,-6 Q-18,12 -10,23 L2,21 Q-2,8 -4,-2Z', dark(o.hairC, .1));
    C(head, -8.6, 1, 2.8, dark(skin, .06));
    C(head, 0, 0, 12.6, skin);
    P(head, 'M11.4,-2.2 Q15.6,1 11.8,3.8Z', skin); S(head, 'M11.4,-2.2 Q15.6,1 11.8,3.8', dark(skin, .2), .9);
    if (o.beard === 'long') P(head, 'M-4,5 Q2,9 12.6,6.4 Q13.6,10 12,15 Q8,24 1,27 Q-2,19 -6,10Z', o.beardC || '#3b2a1e');
    else if (o.beard === 'short') P(head, 'M-4,5 Q2,9 12.6,6.4 Q13,10 11.4,13 Q7,17 1,16 Q-3,12 -6,8Z', o.beardC || '#3b2a1e');
    else if (o.beard === 'mus') P(head, 'M7,5.4 Q11,4.6 12.6,6.6 Q10,7.8 7,6.8Z', o.beardC || '#3b2a1e');
    S(head, 'M3.8,-1.2 Q6.4,1.2 9,-1.2', '#2a1f1a', 1.25);
    S(head, 'M3.6,-5.6 Q6.6,-6.8 9.6,-5.2', dark(o.hairC || o.beardC || '#5a4030', .2), 1.2);
    if (!o.beard || o.beard === 'mus') S(head, 'M8,8 Q10,8.8 11.6,7.4', '#7a3b2f', 1.1);
    C(head, 6.6, 4, 2.4, '#f09a8a', { opacity: .38 });
    const hc = o.hairC;
    if (['short', 'long', 'curly', 'braids'].includes(o.hair)) P(head, 'M-12.6,4 Q-15,-14 1,-13.8 Q11,-13.4 12.4,-6 Q6,-10.4 0,-9.2 Q-4,-8 -5,-2 Q-7,4 -12.6,4Z', hc);
    if (o.hair === 'curly') [[-10, -8, 4.4], [-5, -12, 4.6], [1, -13.4, 4.6], [7, -12, 4]].forEach(([x, y, r]) => C(head, x, y, r, hc));
    if (o.hair === 'bald') P(head, 'M-12.6,4.4 Q-14.8,-4 -10.2,-8.6 Q-6,-6 -6,-.4 Q-6.8,5 -12.6,4.4Z', hc);
    if (o.hat === 'basma' || o.hat === 'veil') P(head, 'M-13.6,8 Q-16,-15 1,-14.8 Q12.6,-14.4 13.4,-5 Q6,-11 0,-10 Q-5,-8 -5.6,0 Q-6.4,8 -13.6,8Z', o.hatC || '#b83a3a');
    if (o.hat === 'kamilavka' || o.hat === 'culion') P(head, 'M-12.4,-2 L-12.2,-22 Q0,-24.6 11.6,-22 L11.2,-6.4 Q0,-9 -12.4,-2Z', '#18161c');
    if (o.hat === 'clop') { P(head, 'M-9,-9 Q-9,-22 1,-22 Q10,-22 10,-9Z', '#332b27'); E(head, 1, -9, 17, 3.2, '#2b2522'); }
    if (o.hat === 'crown') P(head, 'M-9,-10 L-10,-22 L-4,-16 L1,-24 L6,-16 L11,-22 L10,-10Z', '#f2c14e', { stroke: '#b8862a', 'stroke-width': .8 });
    if (o.aura) { R.aura = C(head, -1, -2, 20, 'none', { stroke: '#ffd86b', 'stroke-width': 2.2, opacity: .65 }); C(head, -1, -2, 24, 'url(#chGlow)', { opacity: .45 }); }
    if (o.halo) E(head, 0, -22, 11, 3.4, 'none', { stroke: '#ffd04d', 'stroke-width': 2.4 });
    // brațele: cotul jos, palmele lipite în fața pieptului
    const arms = R.arms = G(body);
    S(arms, 'M-.6,-47 L8.6,-35', sh, 11); S(arms, 'M-.6,-47 L8.6,-35', slv, 9.2);
    S(arms, 'M8.6,-35 L14.6,-46', sh, 10); S(arms, 'M8.6,-35 L14.6,-46', slv, 8.4);
    P(arms, 'M12.4,-45 Q11.4,-54 16,-61 Q20.4,-54 19,-45 Q15.8,-43 12.4,-45Z', skin);
    S(arms, 'M16,-60 L15.8,-46', dark(skin, .22), .8);
    return R;
  }

  // ---------- animale (profil, privesc spre dreapta) ----------
  function legs(p, xs, top, len, col, w) { return xs.map(x => { const j = G(p, { transform: `translate(${x},${top})` }); const l = G(j); S(l, `M0,0 L0,${len}`, col, w); return l; }); }
  function buildAnimal(root, o, kind) {
    const R = { o, type: 'animal', kind };
    R.shadow = E(root, 0, 0, 26, 4.4, '#000', { opacity: .18 });
    const fig = R.fig = G(root);
    const eye = (p, x, y, r = 1.6) => { const b = G(p, { transform: `translate(${x},${y})` }); const bl = G(b, { class: 'blink' }); C(bl, 0, 0, r, '#221a16'); C(bl, r * .35, -r * .4, r * .38, '#fff'); return bl; };
    if (kind === 'oaie' || kind === 'miel') {
      const wool = '#f6f1e7', wsh = '#e2dacb', face = kind === 'miel' ? '#efe6d6' : '#3b3536';
      R.legs = legs(fig, [-13, 13, -7, 18], -16, 15, kind === 'miel' ? '#cdbfa8' : '#3b3536', 4.2);
      const body = R.body = G(fig);
      [[-12, -22, 11], [0, -24, 12], [12, -21, 11], [-17, -17, 8], [17, -16, 8]].forEach(([x, y, r]) => C(body, x, y + 3, r, wsh));
      [[-12, -27, 11], [0, -31, 12.5], [12, -27, 11], [-6, -20, 11], [7, -20, 11], [-19, -22, 8], [19, -21, 8]].forEach(([x, y, r]) => C(body, x, y, r, wool));
      C(body, -24, -27, 4.6, wool);
      const hj = G(body, { transform: 'translate(20,-30)' }); R.headRot = G(hj);
      E(R.headRot, 8, 1, 7, 9.4, face, { transform: 'rotate(-28 8 1)' });
      E(R.headRot, 0, -3, 5.2, 2.2, face, { transform: 'rotate(-35 0 -3)' });
      C(R.headRot, 4, -6, 5.2, wool); C(R.headRot, 0, -3, 3.6, wool);
      R.eyes = [eye(R.headRot, 10, -1, 1.5)];
      if (kind === 'miel') C(R.headRot, 13.6, 5.4, 1.2, '#c78a7a');
    } else if (kind === 'caine') {
      const c = '#b07a4a', cd = '#8a5a32';
      R.legs = legs(fig, [-13, 12, -8, 16], -15, 14, cd, 4.6);
      const tj = G(fig, { transform: 'translate(-18,-24)' }); R.tail = G(tj); S(R.tail, 'M0,0 Q-9,-6 -8,-18', c, 4.4);
      const body = R.body = G(fig); E(body, 0, -21, 20, 10.5, c); E(body, 2, -16, 14, 5, '#d9a877');
      S(body, 'M14,-29 Q19,-27 20,-22', '#c0392b', 3);
      const hj = G(body, { transform: 'translate(17,-27)' }); R.headRot = G(hj);
      C(R.headRot, 5, -7, 9.4, c); E(R.headRot, 13, -3.6, 6.4, 4.6, '#d9a877'); C(R.headRot, 18.6, -5, 2.2, '#2a1d17');
      S(R.headRot, 'M14,-.6 Q16,1 18,0', '#5a3a22', 1);
      R.ear = P(R.headRot, 'M0,-13 Q-6,-5 -2,5 Q3,-1 5,-10Z', cd);
      R.eyes = [eye(R.headRot, 8.6, -9.4, 1.6)];
    } else if (kind === 'magar') {
      const c = '#9a9187', cd = '#6f675e';
      R.legs = legs(fig, [-15, 14, -9, 19], -18, 17, cd, 4.4);
      const tj = G(fig, { transform: 'translate(-24,-28)' }); R.tail = G(tj); S(R.tail, 'M0,0 Q-4,8 -3,16', cd, 2); E(R.tail, -3, 18, 2.4, 4, '#3a342e');
      const body = R.body = G(fig); E(body, 0, -27, 25, 12.5, c); E(body, 2, -21, 17, 5, '#cfc8bd');
      const hj = G(body, { transform: 'translate(20,-34)' }); R.headRot = G(hj);
      P(R.headRot, 'M-6,4 Q0,-10 8,-14 L14,-6 Q8,2 4,10Z', c);
      E(R.headRot, 13, -6, 6.6, 11, c, { transform: 'rotate(55 13 -6)' }); E(R.headRot, 20, -1.4, 5, 4.4, '#d9d2c6');
      R.ear = G(R.headRot); E(R.ear, 6, -22, 2.8, 9, c, { transform: 'rotate(-18 6 -22)' }); E(R.ear, 10, -22, 2.6, 8.6, cd, { transform: 'rotate(8 10 -22)' });
      S(R.headRot, 'M-4,0 Q2,-12 8,-15', '#3a342e', 3);
      R.eyes = [eye(R.headRot, 12, -9, 1.6)];
    } else if (kind === 'leu') {
      const c = '#e2ab4f', cd = '#b9802f', mane = '#b5652a';
      R.legs = legs(fig, [-15, 13, -9, 18], -16, 15, cd, 6);
      const tj = G(fig, { transform: 'translate(-24,-26)' }); R.tail = G(tj); S(R.tail, 'M0,0 Q-12,0 -14,-12', c, 3.4); C(R.tail, -14, -14, 3.6, mane);
      const body = R.body = G(fig); E(body, 0, -25, 25, 12, c); E(body, 3, -19, 17, 4.6, '#f0c983');
      const hj = G(body, { transform: 'translate(22,-34)' }); R.headRot = G(hj);
      for (let i = 0; i < 12; i++) { const a = i * 30 * D2R; C(R.headRot, Math.cos(a) * 12, Math.sin(a) * 12, 7, i % 2 ? mane : dark(mane, .1)); }
      C(R.headRot, 0, 0, 12, mane); C(R.headRot, 3, 1, 10, c); E(R.headRot, 10, 5, 5.4, 4.4, '#f6dca2');
      P(R.headRot, 'M12,1 L16,1.4 L14,4Z', '#5a3020'); S(R.headRot, 'M11,7 Q13,8.6 15,7.4', '#5a3020', 1);
      R.eyes = [eye(R.headRot, 7, -3, 1.6)];
    } else if (kind === 'porumbel' || kind === 'pasare') {
      const c = kind === 'porumbel' ? '#fbfbf8' : '#a87a52', cd = kind === 'porumbel' ? '#dedbd2' : '#7a5232', belly = kind === 'porumbel' ? '#ffffff' : '#e8cfa8';
      R.legs = legs(fig, [-2, 3], -6, 6, '#e08a5a', 1.6);
      const body = R.body = G(fig, { transform: 'translate(0,-14)' });
      P(body, 'M-9,-1 L-23,-6 L-21,1 L-23,6Z', cd);
      E(body, 0, 0, 12, 8.2, c); E(body, 3, 3, 8, 4.4, belly);
      const hj = G(body, { transform: 'translate(9,-5)' }); R.headRot = G(hj);
      C(R.headRot, 2, -2, 5.6, c); P(R.headRot, 'M7,-2.6 L11.6,-1.4 L7,0Z', '#e8a03a'); R.eyes = [eye(R.headRot, 3.6, -3.2, 1.2)];
      if (o.olive) { S(R.headRot, 'M10,-1 Q16,2 20,0', '#4f8a3a', 1.2); E(R.headRot, 15, -1.6, 2.6, 1.2, '#6aa84f'); E(R.headRot, 18.4, 1.4, 2.6, 1.2, '#6aa84f'); }
      const wj = G(body, { transform: 'translate(-1,-3)' }); R.wing = G(wj);
      P(R.wing, 'M0,0 Q-8,-14 -22,-17 Q-14,-7 -19,3 Q-8,4 0,0Z', cd);
      P(R.wing, 'M0,0 Q-6,-10 -16,-13 Q-10,-5 -13,2 Q-6,3 0,0Z', c);
      R.bird = 1;
    } else if (kind === 'albina') {
      const body = R.body = G(fig, { transform: 'translate(0,-30)' });
      R.wings = G(body, { transform: 'translate(0,-6)' });
      E(R.wings, -3, -4, 6, 9, '#ffffff', { opacity: .7, transform: 'rotate(-25 -3 -4)' }); E(R.wings, 3, -4, 5, 8, '#ffffff', { opacity: .55, transform: 'rotate(18 3 -4)' });
      P(body, 'M-9,.6 L-14,1.2 L-9,2.4Z', '#3a2a1a');
      E(body, 0, 0, 9.6, 7, '#f2c230');
      P(body, 'M-4.4,-6.4 Q-2,0 -4.4,6.4 L-1.2,6.9 Q1.2,0 -1.2,-6.9Z', '#2e2418'); P(body, 'M2,-6.8 Q4.2,0 2,6.8 L4.8,6 Q6.8,0 4.8,-6Z', '#2e2418');
      C(body, 10.4, -1, 4.8, '#3a2a1a'); R.eyes = [eye(body, 12, -2, 1.1)];
      S(body, 'M10,-5 Q12,-11 15,-12', '#2e2418', .8);
      R.shadow.setAttribute('rx', 8); R.shadow.setAttribute('opacity', .1); R.bee = 1;
    } else if (kind === 'peste') {
      const c = o.color || '#ff9a4a';
      R.shadow.setAttribute('opacity', 0);
      const body = R.body = G(fig, { transform: 'translate(0,-20)' });
      const tj = G(body, { transform: 'translate(-12,0)' }); R.tail = G(tj); P(R.tail, 'M0,0 L-11,-9 L-8,0 L-11,9Z', dark(c, .15));
      P(body, 'M-14,0 Q-2,-11.6 12,-2.4 Q14.6,0 12,2.4 Q-2,11.6 -14,0Z', c);
      P(body, 'M-2,-7 Q2,-13 7,-5Z', dark(c, .15)); E(body, 0, 4, 7, 2.4, light(c, .35));
      R.eyes = [eye(body, 7, -1.8, 1.5)];
    }
    return R;
  }

  // ---------- registrul ----------
  const ALL = [];
  let SEED = 1;
  function build(scope) {
    (scope || document).querySelectorAll('g.ch:not([data-built])').forEach(node => {
      node.setAttribute('data-built', '1');
      const type = node.dataset.ch || 'proroc';
      const ANIMALS = ['oaie', 'miel', 'caine', 'magar', 'leu', 'porumbel', 'pasare', 'albina', 'peste'];
      const o = Object.assign({}, PRE[type] || {}, JSON.parse(node.dataset.opt || '{}'));
      ['robe', 'mantle', 'hat', 'hatC', 'hair', 'hairC', 'beard', 'beardC', 'prop', 'skin', 'face', 'gest', 'belt', 'color', 'vest', 'apron', 'ie'].forEach(k => { const v = node.dataset[k]; if (v === 'none') delete o[k]; else if (v) o[k] = v; });
      if (node.dataset.olive) o.olive = 1;
      if (o.skin && SK[o.skin]) o.skin = SK[o.skin];
      o.skin = o.skin || SK.med; o.hairC = o.hairC || '#3b2a1e';
      const inner = G(node);
      let R;
      if (ANIMALS.includes(type)) R = buildAnimal(inner, o, type);
      else if (node.dataset.pose === 'kneel') R = buildKneel(inner, o);
      else R = buildHuman(inner, o);
      R.node = node; R.inner = inner; R.seed = SEED++;
      R.x0 = +(node.dataset.x || 270); R.y0 = +(node.dataset.y || 820); R.s0 = +(node.dataset.s || 1.5);
      R.dir0 = +(node.dataset.dir || 1);
      R.k = o.kid ? .74 : 1;
      R.cmds = parseDo(node.dataset.do);
      R.scene = node.closest('.scene');
      if (R.type === 'human') {
        // fețele folosite în cronologie
        const used = new Set([o.face || 'neutral']); R.cmds.filter(c => c.k === 'face').forEach(c => used.add(c.v));
        used.forEach(n => { R.faces[n] = face(R.faceWrap, o, n); });
        R.faceList = [{ t: -1, v: o.face || 'neutral', d: 0 }].concat(R.cmds.filter(c => c.k === 'face')).sort((a, b) => a.t - b.t);
        R.gestList = [{ t: -1, v: o.gest || 'rest', d: 0 }].concat(R.cmds.filter(c => c.k === 'gest')).sort((a, b) => a.t - b.t);
        if (!o.silhouette) { R.mouthTalk = E(R.faceWrap, 0, 8.2, 2.7, 1, '#6b2a26', { opacity: 0 }); }
        mustache(R.mustacheG, o);
      }
      R.lookList = R.cmds.filter(c => c.k === 'look').sort((a, b) => a.t - b.t);
      R.paths = R.cmds.filter(c => c.k === 'path').sort((a, b) => a.a - b.a);
      // pozițiile de pornire ale segmentelor
      let px = R.x0, py = R.y0, ps = R.s0;
      R.paths.forEach(seg => { seg.from = [px, py, ps]; if (seg.to) { px = seg.to[0]; py = seg.to[1]; ps = seg.to[2] != null && !isNaN(seg.to[2]) ? seg.to[2] : ps; } seg.dest = [px, py, ps]; seg.len = Math.hypot(seg.dest[0] - seg.from[0], seg.dest[1] - seg.from[1]); });
      ALL.push(R);
    });
  }

  function valAt(list, t, base) { // pentru look: valoare numerică interpolată
    let v = base, prev = base, T = -1, d = .3;
    list.forEach(c => { if (c.t <= t) { prev = v; v = +c.v; T = c.t; d = c.d || .3; } });
    if (T < 0) return v;
    return lerp(prev, v, ease((t - T) / d));
  }
  function active(R, k, t) { return R.cmds.some(c => c.k === k && t >= c.a && t <= c.b); }
  function amount(R, k, t, r = .25) { let m = 0; R.cmds.forEach(c => { if (c.k === k) m = Math.max(m, win(t, c.a, c.b, r)); }); return m; }

  function update(R, t) {
    const o = R.o, sd = R.seed;
    // ---- poziție pe traseu ----
    let x = R.x0, y = R.y0, s = R.s0, moving = 0, mode = null, phase = t * 1.6, prog = 0;
    for (const seg of R.paths) {
      if (t < seg.a) break;
      const u = seg.b > seg.a ? clamp((t - seg.a) / (seg.b - seg.a), 0, 1) : 1;
      const e = seg.mode === 'fly' || seg.mode === 'swim' ? easeS(u) : ease(u) * .25 + easeS(u) * .75;
      x = lerp(seg.from[0], seg.dest[0], e); y = lerp(seg.from[1], seg.dest[1], e); s = lerp(seg.from[2], seg.dest[2], e);
      if (t <= seg.b) { moving = 1; mode = seg.mode; prog = u;
        const stride = 13 * s; const dist = seg.len * e;
        phase = seg.len > 50 ? dist / stride * Math.PI : (t - seg.a) * (seg.mode === 'run' ? 5.4 : 3.6);
        if (seg.mode === 'run') phase *= 1.0;
      }
    }
    if (!moving && R.cmds.some(c => c.k === 'path' && c.to == null && t >= c.a && t <= c.b)) { moving = 1; mode = R.cmds.find(c => c.k === 'path' && c.to == null && t >= c.a && t <= c.b).mode; phase = t * 3.6; }
    const walkAmt = moving && (mode === 'walk' || mode === 'run') ? 1 : 0;
    // întoarceri
    let dir = R.dir0, flipS = 1;
    R.cmds.filter(c => c.k === 'turn').sort((a, b) => a.t - b.t).forEach(c => { if (t >= c.t) { const u = clamp((t - c.t) / .32, 0, 1); if (u >= .5) dir = -dir; if (u < 1) flipS = Math.abs(Math.cos(u * Math.PI)); } });
    // fade
    let op = 1; R.cmds.filter(c => c.k === 'fade').forEach(c => { const u = clamp((t - c.a) / Math.max(.01, c.b - c.a), 0, 1); if (c.dir === 'in') op = t < c.a ? 0 : smooth(u); else op = t > c.b ? 0 : t < c.a ? op : 1 - smooth(u); });
    // salt
    let jy = 0; R.cmds.filter(c => c.k === 'jump').forEach(c => { const u = (t - c.t) / .55; if (u > 0 && u < 1) jy -= Math.sin(u * Math.PI) * 16; });
    let flyBob = 0; if (mode === 'fly' && moving) flyBob = Math.sin(t * 3.1 + sd) * 4;
    if (mode === 'hop' && moving) jy -= Math.abs(Math.sin(phase * .8)) * 7;
    R.node.setAttribute('transform', `translate(${x.toFixed(2)},${y.toFixed(2)})`);
    R.inner.setAttribute('transform', `scale(${(s * R.k * dir * Math.max(.04, flipS)).toFixed(4)},${(s * R.k).toFixed(4)})`);
    R.node.style.opacity = op;
    // umbra
    const air = Math.min(1, (-jy + Math.abs(flyBob)) / 30) + (mode === 'fly' && moving ? .4 : 0);
    if (R.shadow) R.shadow.setAttribute('transform', `scale(${(1 - air * .45).toFixed(3)})`);

    // clipit (determinist)
    const per = 3.4 + (sd * 0.73 % 1.9), bp = (t + sd * 1.37) % per, bl = bp < .16 ? 1 - Math.sin(bp / .16 * Math.PI) * .92 : 1;
    const blinkScale = `scale(1,${bl.toFixed(3)})`;
    R.node.querySelectorAll('.blink').forEach(b => b.setAttribute('transform', blinkScale));
    R.node.querySelectorAll('.chFlame').forEach((f, i) => f.setAttribute('transform', `scale(${(1 + Math.sin(t * 13 + i) * .08).toFixed(3)},${(1 + Math.sin(t * 9.3 + i * 2) * .14).toFixed(3)})`));

    if (R.type === 'human') updHuman(R, t, { walkAmt, phase, moving, mode, jy, flyBob });
    else if (R.type === 'kneel') updKneel(R, t, { jy });
    else updAnimal(R, t, { walkAmt, phase, moving, mode, jy, flyBob });
  }

  function updHuman(R, t, m) {
    const o = R.o, sd = R.seed;
    const breathe = Math.sin(t * 1.75 + sd) * .5 + .5;
    const step = Math.sin(m.phase), stepC = Math.cos(m.phase);
    const bob = m.walkAmt ? -Math.abs(Math.sin(m.phase)) * 2.6 : 0;
    const bowA = amount(R, 'bow', t, .45), sadA = amount(R, 'slump', t, .5), trem = amount(R, 'tremble', t, .2);
    const age = o.age ? 3 : 0;
    const lean = m.walkAmt * (Math.sin(m.phase * 2) * .6 + 2.2) + bowA * 10 + age;
    const tremX = trem ? Math.sin(t * 42) * .9 * trem : 0;
    R.fig.setAttribute('transform', `translate(${tremX.toFixed(2)},${(bob + m.jy + m.flyBob).toFixed(2)})`);
    R.body.setAttribute('transform', `rotate(${(lean * .35).toFixed(2)}) scale(1,${(1 + breathe * .013 - sadA * .03).toFixed(4)})`);
    // picioare
    R.feet.forEach((f, i) => {
      const side = i ? 1 : -1; const ph = i ? step : -step;
      const fx = side * 8 + (m.walkAmt ? ph * 5.5 : 0); const fy = m.walkAmt ? -Math.max(0, i ? stepC : -stepC) * 3 : 0;
      f.setAttribute('transform', `translate(${fx.toFixed(2)},${fy.toFixed(2)})`);
    });
    // cap
    const talkA = amount(R, 'talk', t, .12);
    const nod = amount(R, 'nod', t, .3) * Math.sin(t * 7) * 5 + talkA * Math.sin(t * 5.3 + sd) * 1.6;
    const shake = amount(R, 'shake', t, .3) * Math.sin(t * 9) * 4;
    const look = valAt(R.lookList, t, 0);
    const idle = Math.sin(t * .9 + sd * 2) * 1.6;
    const hRot = idle + nod + bowA * 14 + sadA * 10 + (o.age ? 4 : 0) + look * 3;
    R.headRot.setAttribute('transform', `rotate(${hRot.toFixed(2)})`);
    R.faceWrap.setAttribute('transform', `translate(${(look * 2.4 + shake * .5).toFixed(2)},${(sadA * 1).toFixed(2)})`);
    R.mustacheG.setAttribute('transform', `translate(${(look * 1.8).toFixed(2)},0)`);
    // fețe (tranziție scurtă)
    let cur = R.faceList[0], prev = null;
    R.faceList.forEach(f => { if (f.t <= t) { prev = cur; cur = f; } });
    const fu = cur.t < 0 ? 1 : clamp((t - cur.t) / .22, 0, 1);
    for (const n in R.faces) R.faces[n].setAttribute('opacity', n === cur.v ? fu : (prev && n === prev.v && n !== cur.v ? 1 - fu : 0));
    if (R.mouthTalk) {
      const open = talkA * clamp(.15 + .85 * Math.abs(Math.sin(t * 11.3 + sd) * .6 + Math.sin(t * 7.1) * .4), 0, 1);
      R.mouthTalk.setAttribute('ry', (.6 + open * 2.4).toFixed(2)); R.mouthTalk.setAttribute('rx', (2.3 + open * .8).toFixed(2));
      R.mouthTalk.setAttribute('opacity', talkA > .02 ? 1 : 0);
      R.faceWrap.querySelectorAll('.mouthStatic').forEach(ms => ms.setAttribute('opacity', 1 - talkA));
    }
    // brațe
    let gc = R.gestList[0], gp = R.gestList[0];
    R.gestList.forEach(g => { if (g.t <= t) { gp = gc; gc = g; } });
    const gu = gc.t < 0 ? 1 : ease((t - gc.t) / (gc.d || .55));
    const gget = n => { const g0 = GEST[n] || GEST.rest; if (R.prop && R.propArm === R.armR && ONEHAND.includes(n)) return [-g0[2], g0[3], GEST.hold[2], GEST.hold[3]]; if (R.prop && R.propArm === R.armR && n === 'rest') return [GEST.rest[0], GEST.rest[1], GEST.hold[2], GEST.hold[3]]; return g0; };
    const A = gget(gp.v), B = gget(gc.v);
    const tg = A.map((v, i) => lerp(v, B[i], gu));
    const osc = OSC[gc.v]; if (osc && gu > .6) { const w = Math.sin((t - gc.t) * osc[3] * Math.PI * 2) * (gu - .6) / .4; const mir = R.prop && R.propArm === R.armR && ONEHAND.includes(gc.v); if ((osc[0] === 'R' && !mir) || osc[0] === 'B') { tg[2] += osc[1] * w; tg[3] += osc[2] * w; } if (osc[0] === 'B' || mir) { tg[0] -= osc[1] * w; tg[1] += osc[2] * w; } }
    // legănarea brațelor la mers (doar când gestul e „rest”)
    const restness = (gc.v === 'rest' ? gu : 0) + (gp.v === 'rest' ? 1 - gu : 0);
    if (m.walkAmt && restness > 0) { tg[0] += -step * 7 * restness; tg[1] -= Math.max(0, -step) * 3 * restness; tg[2] += step * 7 * restness; tg[3] -= Math.max(0, step) * 3 * restness; }
    if (!m.walkAmt) { tg[1] += breathe * .8; tg[3] += breathe * .8; }
    [[R.armL, tg[0], tg[1], -1], [R.armR, tg[2], tg[3], 1]].forEach(([a, tx, ty, side]) => {
      const [r1, r2] = ik(a.sx, a.sy, tx, ty, R.l1, R.l2, side);
      a.up.setAttribute('transform', `rotate(${r1.toFixed(2)})`);
      a.fo.setAttribute('transform', `rotate(${r2.toFixed(2)})`);
      a.pr.setAttribute('transform', `rotate(${(-(r1 + r2) - (lean * .35)).toFixed(2)})`);
    });
    // aripi, aură, strălucire
    if (R.wL) { const flying = m.mode === 'fly' && m.moving; const fa = flying ? Math.sin(t * 2 * Math.PI * 2.4) * 22 : Math.sin(t * 2.2 + sd) * 5; R.wL.setAttribute('transform', `rotate(${(-fa).toFixed(2)})`); R.wR.setAttribute('transform', `rotate(${fa.toFixed(2)})`); }
    if (R.aura) R.aura.setAttribute('opacity', (.75 + Math.sin(t * 2.1 + sd) * .2 + amount(R, 'glow', t, .5) * .5).toFixed(3));
    if (R.glowEl) R.glowEl.setAttribute('opacity', (.8 + Math.sin(t * 1.7) * .15).toFixed(3));
  }

  function updKneel(R, t) {
    const sd = R.seed; const breathe = Math.sin(t * 1.6 + sd) * .5 + .5;
    R.body.setAttribute('transform', `scale(1,${(1 + breathe * .014).toFixed(4)})`);
    const nod = Math.sin(t * .8 + sd) * 2.4 + 16 + amount(R, 'bow', t, .6) * 8 - amount(R, 'lookup', t, .6) * 34;
    R.headRot.setAttribute('transform', `rotate(${nod.toFixed(2)})`);
    if (R.wR) R.wR.setAttribute('transform', `rotate(${(Math.sin(t * 2 + sd) * 4).toFixed(2)})`);
  }

  function updAnimal(R, t, m) {
    const sd = R.seed, k = R.kind;
    const breathe = Math.sin(t * 2.1 + sd) * .5 + .5;
    if (R.legs) R.legs.forEach((l, i) => { const ph = (i % 2 ? 1 : -1) * (i < 2 ? 1 : -1); const a = m.walkAmt ? Math.sin(m.phase) * 22 * ph : 0; l.setAttribute('transform', `rotate(${a.toFixed(2)})`); });
    const bob = m.walkAmt ? -Math.abs(Math.sin(m.phase)) * 2 : 0;
    if (R.bee) {
      const wob = Math.sin(t * 7 + sd) * 3, wob2 = Math.cos(t * 5.3 + sd) * 2.4;
      R.body.setAttribute('transform', `translate(${wob2.toFixed(2)},${(-30 + wob).toFixed(2)}) rotate(${(Math.sin(t * 6) * 6).toFixed(2)})`);
      R.wings.setAttribute('transform', `translate(0,-6) scale(1,${(Math.abs(Math.sin(t * 38 * Math.PI)) * .75 + .25).toFixed(3)})`);
      return;
    }
    if (R.bird) {
      const flying = m.mode === 'fly' && m.moving;
      const fa = flying ? Math.sin(t * 2 * Math.PI * 3) * 55 - 10 : 0;
      R.wing.setAttribute('transform', `rotate(${fa.toFixed(2)})`);
      R.legs.forEach(l => l.setAttribute('opacity', flying ? 0 : 1));
      const peck = amount(R, 'peck', t, .2) * Math.max(0, Math.sin(t * 6)) * 35;
      R.headRot.setAttribute('transform', `rotate(${(Math.sin(t * 1.3 + sd) * 4 + peck).toFixed(2)})`);
      R.fig.setAttribute('transform', `translate(0,${(m.jy + m.flyBob + (flying ? -10 : 0)).toFixed(2)})`);
      return;
    }
    if (k === 'peste') {
      R.tail.setAttribute('transform', `rotate(${(Math.sin(t * 9 + sd) * 18).toFixed(2)})`);
      R.fig.setAttribute('transform', `translate(0,${(Math.sin(t * 2 + sd) * 3).toFixed(2)})`);
      return;
    }
    R.fig.setAttribute('transform', `translate(0,${(bob + m.jy).toFixed(2)})`);
    R.body.setAttribute('transform', `scale(1,${(1 + breathe * .02).toFixed(4)})`);
    const graze = amount(R, 'graze', t, .5);
    const head = Math.sin(t * 1.1 + sd) * 3 + graze * (38 + Math.sin(t * 5) * 3) + (m.walkAmt ? Math.sin(m.phase * 2) * 2 : 0);
    if (R.headRot) R.headRot.setAttribute('transform', `rotate(${head.toFixed(2)})`);
    if (R.tail) { const wag = amount(R, 'wag', t, .3); const a = k === 'caine' ? Math.sin(t * (wag ? 16 : 3) + sd) * (wag ? 26 : 8) : Math.sin(t * 1.8 + sd) * 8; R.tail.setAttribute('transform', `rotate(${a.toFixed(2)})`); }
    if (R.ear && k === 'caine') R.ear.setAttribute('transform', `rotate(${(Math.sin(m.phase * 2) * 6 * m.walkAmt + Math.sin(t * 1.4) * 2).toFixed(2)})`);
  }

  function updateAll(t, scene) { ALL.forEach(R => { if (!scene || R.scene === scene) update(R, t); }); }

  // degradeuri folosite de personaje
  function defs() {
    if (document.getElementById('chGlow')) return;
    const svg = el('svg', { width: 0, height: 0, style: 'position:absolute', 'aria-hidden': 'true' });
    const d = el('defs', null, svg);
    const rg = (id, stops) => { const g = el('radialGradient', { id }, d); stops.forEach(([o, c, a]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a }, g)); };
    rg('chGlow', [[0, '#fff6cf', .95], [.45, '#ffe08a', .45], [1, '#ffd36b', 0]]);
    rg('chGlowBig', [[0, '#fffbe6', .9], [.5, '#ffe7a6', .35], [1, '#ffd36b', 0]]);
    document.body.insertBefore(svg, document.body.firstChild);
  }

  window.CH = { build: s => { defs(); build(s); }, updateAll, update, PRE, GEST, FACES, ALL, ik, util: { mix, dark, light, ease, easeS, smooth, clamp, lerp, win } };
})();
