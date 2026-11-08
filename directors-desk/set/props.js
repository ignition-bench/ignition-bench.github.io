"use strict";

const PROPS = {
  chair:  { cat:"indoor", build(K, w, d, h){
    const seat = 0.45, leg = 0.04, t = 0.05;
    K.box(w, t, d, 0, seat - t/2, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(leg, seat - t, leg, sx*(w/2 - leg), (seat - t)/2, sz*(d/2 - leg));
    K.box(w, h - seat, t, 0, seat + (h - seat)/2, -d/2 + t/2);
  }},
  table:  { cat:"indoor", build(K, w, d, h){
    const t = 0.05, leg = 0.06;
    K.box(w, t, d, 0, h - t/2, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(leg, h - t, leg, sx*(w/2 - leg*1.5), (h - t)/2, sz*(d/2 - leg*1.5));
  }},
  desk:   { cat:"indoor", build(K, w, d, h){
    const t = 0.04;
    K.box(w, t, d, 0, h - t/2, 0);
    for (const sx of [-1, 1]) K.box(t, h - t, d*0.92, sx*(w/2 - t/2 - 0.02), (h - t)/2, 0);
    K.box(w - 0.1, h*0.45, t, 0, h - t - h*0.225, -d/2 + t);
  }},
  bed:    { cat:"indoor", build(K, w, d, h){
    const base = h*0.45;
    K.box(w, base, d, 0, base/2, 0);
    K.box(w - 0.06, h - base, d - 0.06, 0.03, base + (h - base)/2, 0, "soft");
    K.box(0.08, h + 0.45, d, -w/2 + 0.04, (h + 0.45)/2, 0);
    for (const sz of [-1, 1]) K.box(0.35, 0.12, d*0.4, -w/2 + 0.3, h + 0.06, sz*d*0.22, "soft");
  }},
  sofa:   { cat:"indoor", build(K, w, d, h){
    const seat = 0.42, arm = 0.18, back = 0.2;
    K.box(w, seat, d, 0, seat/2, 0, "soft");
    K.box(w, h - seat, back, 0, seat + (h - seat)/2, -d/2 + back/2, "soft");
    for (const sx of [-1, 1]) K.box(arm, h*0.82 - seat, d, sx*(w/2 - arm/2), seat + (h*0.82 - seat)/2, 0, "soft");
  }},
  tv:     { cat:"indoor", build(K, w, d, h){
    const standH = 0.06, screenH = h - 0.12;
    K.box(w*0.45, standH, Math.min(d, 0.22), 0, standH/2, 0);
    K.box(0.06, 0.08, 0.04, 0, standH + 0.04, -0.02);
    K.box(w, screenH, 0.05, 0, h - screenH/2, -0.02);
    K.box(w - 0.06, screenH - 0.06, 0.01, 0, h - screenH/2, 0.006, "screen");
  }},
  shelf:  { cat:"indoor", build(K, w, d, h){
    const t = 0.03, n = 4;
    for (const sx of [-1, 1]) K.box(t, h, d, sx*(w/2 - t/2), h/2, 0);
    K.box(w, h, t, 0, h/2, -d/2 + t/2);
    for (let i = 0; i <= n; i++) K.box(w - 2*t, t, d - t, 0, 0.04 + i*(h - 0.08)/n, t/2);
  }},
  lamp:   { cat:"indoor", build(K, w, d, h){
    const r = Math.min(w, d)/2;
    K.cyl(r*0.7, r*0.8, 0.03, 0, 0.015, 0);
    K.cyl(0.012, 0.012, h*0.62, 0, 0.03 + h*0.31, 0);
    K.cyl(r*0.45, r*0.95, h*0.32, 0, h - h*0.16, 0, "soft");
  }},
  book:   { cat:"indoor", build(K, w, d, h){
    K.box(w, h, d, 0, h/2, 0);
    K.box(w*0.94, h*0.7, d*0.96, 0.012, h/2, 0, "soft");
  }},
  plant:  { cat:"indoor", build(K, w, d, h){
    const r = Math.min(w, d)/2, pot = h*0.38;
    K.cyl(r*0.75, r*0.55, pot, 0, pot/2, 0);
    K.sphere(r*0.95, 0, pot + r*0.8, 0, "soft");
    K.sphere(r*0.6, r*0.45, pot + r*1.35, -r*0.1, "soft");
    K.sphere(r*0.55, -r*0.4, pot + r*1.25, r*0.2, "soft");
  }},
  lowcab: { cat:"indoor", build(K, w, d, h){
    const leg = 0.06, t = 0.02;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.04, leg, 0.04, sx*(w/2 - 0.06), leg/2, sz*(d/2 - 0.06));
    K.box(w, h - leg, d, 0, leg + (h - leg)/2, 0);
    K.box(0.01, h - leg - 0.06, t, 0, leg + (h - leg)/2, d/2 + t/2, "screen");
    for (const sx of [-1, 1]) K.box(0.08, 0.015, 0.02, sx*0.06, leg + (h - leg)*0.6, d/2 + 0.015, "screen");
  }},
  person: { cat:"indoor", build(K, w, d, h){
    const r = 0.12, headR = 0.11;
    K.cyl(r*0.85, r, h - headR*2 - 0.04, 0, (h - headR*2 - 0.04)/2, 0);
    K.sphere(headR, 0, h - headR, 0);
  }},
  tree:   { cat:"outdoor", build(K, w, d, h){
    const r = Math.min(w, d)/2;
    K.cyl(r*0.08, r*0.11, h*0.45, 0, h*0.225, 0, "trunk");
    const c = K.sphere(1, 0, h*0.62, 0, "soft"); c.scale.set(r, h*0.38, r);
  }},
  pine:   { cat:"outdoor", build(K, w, d, h){
    const r = Math.min(w, d)/2;
    K.cyl(r*0.09, r*0.12, h*0.25, 0, h*0.125, 0, "trunk");
    K.raw(new THREE.ConeGeometry(r, h*0.5, 10), 0, h*0.42, 0, "soft");
    K.raw(new THREE.ConeGeometry(r*0.72, h*0.45, 10), 0, h*0.72, 0, "soft");
  }},
  rock:   { cat:"outdoor", build(K, w, d, h){
    const m = K.raw(new THREE.DodecahedronGeometry(1, 0), 0, h*0.45, 0); m.scale.set(w/2, h*0.55, d/2); m.rotation.y = 0.4;
  }},
  bush:   { cat:"outdoor", build(K, w, d, h){
    const r = Math.min(w, d)/2;
    for (const [x, z, k] of [[0, 0, 0.62], [-r*0.38, r*0.2, 0.45], [r*0.4, -r*0.15, 0.48]]){ const m = K.sphere(1, x, h*k*0.8, z, "soft"); m.scale.set(r*k*1.2, h*k, r*k*1.2); }
  }},
  streetlamp: { cat:"outdoor", build(K, w, d, h){
    K.cyl(0.07, 0.09, h, 0, h/2, 0, "dark");
    K.box(0.6, 0.06, 0.06, 0.3, h - 0.05, 0, "dark");
    K.cyl(0.12, 0.2, 0.22, 0.58, h - 0.18, 0, "soft");
  }},
  bench:  { cat:"outdoor", build(K, w, d, h){
    const seat = 0.45;
    K.box(w, 0.05, d*0.75, 0, seat, d*0.1);
    K.box(w, h - seat, 0.05, 0, seat + (h - seat)/2, -d/2 + 0.04);
    for (const sx of [-1, 1]) K.box(0.06, seat, d*0.7, sx*(w/2 - 0.12), seat/2, d*0.05, "dark");
  }},
  fence:  { cat:"outdoor", build(K, w, d, h){
    const n = Math.max(2, Math.round(w) + 1);
    for (let i = 0; i < n; i++) K.box(0.08, h, 0.08, -w/2 + i*(w/(n - 1)), h/2, 0);
    for (const y of [h*0.35, h*0.8]) K.box(w, 0.07, 0.04, 0, y, 0);
  }},
  car:    { cat:"outdoor", build(K, w, d, h){
    const r = h*0.22;
    K.box(w, h*0.42, d, 0, r + h*0.21, 0);
    K.box(w*0.52, h*0.34, d*0.9, -w*0.06, r + h*0.42 + h*0.17, 0, "glass");
    for (const sx of [-1, 1]) for (const sz of [-1, 1]){ const m = K.cyl(r, r, 0.22, sx*w*0.32, r, sz*(d/2 - 0.08), "dark"); m.rotation.x = Math.PI/2; }
  }},
  house:  { cat:"outdoor", build(K, w, d, h){
    const wallH = h*0.58;
    K.box(w, wallH, d, 0, wallH/2, 0);
    const roof = new THREE.ConeGeometry(Math.SQRT1_2*2, h - wallH, 4); roof.rotateY(Math.PI/4);
    const m = K.raw(roof, 0, wallH + (h - wallH)/2, 0, "roof"); m.scale.set(w/2*1.08, 1, d/2*1.08);
    K.box(1.0, 2.1, 0.06, 0, 1.05, d/2 + 0.02, "dark");
  }},
  mountain: { cat:"outdoor", build(K, w, d, h){
    const geo = new THREE.ConeGeometry(1, 1, 7, 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++){ const y = p.getY(i); if (y > -0.49 && y < 0.49){ const k = 1 + 0.12*Math.sin(i*2.7); p.setX(i, p.getX(i)*k); p.setZ(i, p.getZ(i)*k); } }
    geo.computeVertexNormals();
    const m = K.raw(geo, 0, h/2, 0, "soft"); m.scale.set(w/2, h, d/2);
  }},
  hill:   { cat:"outdoor", build(K, w, d, h){
    const m = K.raw(new THREE.SphereGeometry(1, 20, 8, 0, Math.PI*2, 0, Math.PI/2), 0, 0, 0, "soft"); m.scale.set(w/2, h, d/2);
  }},
  bridge: { cat:"outdoor", build(K, w, d, h){
    const deck = h*0.55;
    K.box(w, 0.25, d, 0, deck, 0);
    for (const sz of [-1, 1]){ K.box(w, 0.08, 0.08, 0, h, sz*(d/2 - 0.06)); for (let i = 0; i <= 4; i++) K.box(0.08, h - deck, 0.08, -w/2 + i*w/4, deck + (h - deck)/2, sz*(d/2 - 0.06)); }
    for (const sx of [-1, 1]) K.box(0.5, deck, d, sx*(w/2 - 0.25), deck/2, 0, "dark");
  }},
};

const CONCRETE = 0x8f8d88;
function propKit(group, tintHex, mats, strong){
  const tinted = (kind)=>{
    const key = kind + ":" + tintHex + (strong ? ":s" : "");
    if (!mats[key]){
      const c = new THREE.Color(CONCRETE).lerp(new THREE.Color(tintHex), strong ? (kind==="soft" ? 0.85 : 0.7) : (kind==="soft" ? 0.55 : 0.4));
      const FIXED = { screen: 0x1b1f26, trunk: 0x5a4330, dark: 0x22252b, roof: 0x7a4a3a, glass: 0x6f8faa };
      mats[key] = kind in FIXED
        ? new THREE.MeshStandardMaterial({ color: FIXED[kind], roughness: kind==="screen"||kind==="glass" ? 0.35 : 0.9, metalness: kind==="screen" ? 0.2 : 0 })
        : new THREE.MeshStandardMaterial({ color: c, roughness: kind==="soft" ? 1 : 0.85, metalness: 0 });
    }
    return mats[key];
  };
  const add = (geo, kind, x, y, z)=>{
    const m = new THREE.Mesh(geo, tinted(kind || "hard"));
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; m.userData.kind = kind || "hard";
    group.add(m); return m;
  };
  return {
    box: (w, h, d, x, y, z, kind)=> add(new THREE.BoxGeometry(Math.max(0.005,w), Math.max(0.005,h), Math.max(0.005,d)), kind, x, y, z),
    cyl: (rTop, rBot, h, x, y, z, kind)=> add(new THREE.CylinderGeometry(rTop, rBot, h, 12), kind, x, y, z),
    sphere: (r, x, y, z, kind)=> add(new THREE.SphereGeometry(r, 14, 10), kind, x, y, z),
    raw: (geo, x, y, z, kind)=> add(geo, kind, x, y, z),
  };
}

function buildProp(type, w, d, h, tintHex, mats){
  const g = new THREE.Group();
  const P = PROPS[type];
  const K = propKit(g, tintHex, mats, P && P.cat === "outdoor");
  if (P) P.build(K, w, d, h); else K.box(w, h, d, 0, h/2, 0);
  return g;
}
