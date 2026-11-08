"use strict";

const U = 40;
const DOOR_W2D = DOOR_WIDTH_2D;
const WIN_W2D = 0.9*U;
const PLAN_PAL = {
  dark:  { board:"#15263f", around:"#0e1828", gridMajor:"#2c4669", gridMinor:"#1c3251", edge:"#5a7cab", tick:"#6f8fb8", ruler:"#9db8dc", ink:"#e8f0fc", dim:"#a9bedb", glass:"#6fd0ff", sel:"#ffd24d", selFill:"rgba(255,210,77,.10)" },
  light: { board:"#ffffff", around:"#eef0f3", gridMajor:"#d7d7dc", gridMinor:"#eceef0", edge:"#b8b8c0", tick:"#9a9aa4", ruler:"#7a7a86", ink:"#1e1e26", dim:"#7a7a86", glass:"#3a86b8", sel:"#2f6fed", selFill:"rgba(47,111,237,.08)" },
};
let PAL = PLAN_PAL.dark;
let INK = PAL.ink, DIM = PAL.dim;
function planTheme(name){ PAL = PLAN_PAL[name] || PLAN_PAL.dark; INK = PAL.ink; DIM = PAL.dim; }
const INK_SOFT = "rgba(30,30,38,.42)";

const PLAN_SYMBOLS = {
  chair(g, x, y, w, h){ g.appendChild(rr(x, y, w, Math.max(3, h*0.14), INK_SOFT)); },
  sofa(g, x, y, w, h){
    const back = 0.2*U, arm = 0.18*U;
    g.appendChild(rr(x, y, w, back, INK_SOFT));
    g.appendChild(rr(x, y+back, arm, h-back, INK_SOFT)); g.appendChild(rr(x+w-arm, y+back, arm, h-back, INK_SOFT));
  },
  bed(g, x, y, w, h){
    g.appendChild(rr(x, y, 0.08*U, h, INK_SOFT));
    for (const s of [-1, 1]) g.appendChild(rr(x+0.12*U, y+h/2+s*h*0.22-h*0.2, 0.35*U, h*0.4, "rgba(255,255,255,.75)", INK_SOFT));
  },
  table(g, x, y, w, h){
    const i = 0.09*U;
    for (const [px, py] of [[x+i, y+i], [x+w-i, y+i], [x+i, y+h-i], [x+w-i, y+h-i]]) g.appendChild(makeSvgEl("circle", {cx:px, cy:py, r:1.8, fill:INK_SOFT}));
  },
  desk(g, x, y, w, h){
    g.appendChild(rr(x+2, y+1.2, w-4, 1.6, INK_SOFT));
    g.appendChild(rr(x+0.6, y, 1.6, h, INK_SOFT)); g.appendChild(rr(x+w-2.2, y, 1.6, h, INK_SOFT));
  },
  tv(g, x, y, w, h){
    g.appendChild(rr(x, y+h*0.25, w, 2.4, "#1e1e26"));
    g.appendChild(rr(x+w*0.275, y+h*0.5, w*0.45, h*0.4, INK_SOFT));
  },
  shelf(g, x, y, w, h){
    g.appendChild(rr(x, y, w, 1.4, INK_SOFT));
    g.appendChild(rr(x, y, 1.4, h, INK_SOFT)); g.appendChild(rr(x+w-1.4, y, 1.4, h, INK_SOFT));
    g.appendChild(makeSvgEl("line", {x1:x+3, y1:y+h*0.55, x2:x+w-3, y2:y+h*0.55, stroke:INK_SOFT, "stroke-width":0.8, "stroke-dasharray":"2 2"}));
  },
};
Object.assign(PLAN_SYMBOLS, {
  lamp(g, x, y, w, h){ g.appendChild(makeSvgEl("circle", {cx:x+w/2, cy:y+h/2, r:Math.min(w,h)*0.42, fill:"none", stroke:INK_SOFT, "stroke-width":1})); g.appendChild(makeSvgEl("circle", {cx:x+w/2, cy:y+h/2, r:1.4, fill:INK})); },
  book(g, x, y, w, h){ g.appendChild(rr(x, y, 1.4, h, INK_SOFT)); g.appendChild(makeSvgEl("line", {x1:x+3, y1:y+h*0.3, x2:x+w-2, y2:y+h*0.3, stroke:INK_SOFT, "stroke-width":0.6})); },
  plant(g, x, y, w, h){ for (const [dx, dy, r] of [[0.5,0.45,0.32],[0.32,0.62,0.22],[0.68,0.62,0.22]]) g.appendChild(makeSvgEl("circle", {cx:x+w*dx, cy:y+h*dy, r:Math.min(w,h)*r, fill:"rgba(40,90,45,.35)", stroke:INK_SOFT, "stroke-width":0.6})); },
  lowcab(g, x, y, w, h){ g.appendChild(makeSvgEl("line", {x1:x+w/2, y1:y+2, x2:x+w/2, y2:y+h, stroke:INK_SOFT, "stroke-width":0.8})); g.appendChild(rr(x, y+h-1.6, w, 1.6, INK_SOFT)); },
  tree(g, x, y, w, h){ g.appendChild(makeSvgEl("circle", {cx:x+w/2, cy:y+h/2, r:Math.min(w,h)*0.08, fill:"rgba(90,60,40,.8)"})); g.appendChild(makeSvgEl("circle", {cx:x+w/2, cy:y+h/2, r:Math.min(w,h)*0.32, fill:"none", stroke:INK_SOFT, "stroke-width":1, "stroke-dasharray":"3 2"})); },
  pine(g, x, y, w, h){ const cx = x+w/2, cy = y+h/2, r = Math.min(w,h)*0.42; const pts = []; for (let i = 0; i < 16; i++){ const a = i/16*Math.PI*2, k = i%2 ? 0.55 : 1; pts.push((cx+Math.cos(a)*r*k).toFixed(1)+","+(cy+Math.sin(a)*r*k).toFixed(1)); } g.appendChild(makeSvgEl("polygon", {points:pts.join(" "), fill:"none", stroke:INK_SOFT, "stroke-width":1})); },
  bush(g, x, y, w, h){ for (const [dx, dy] of [[0.35,0.4],[0.62,0.38],[0.5,0.66]]) g.appendChild(makeSvgEl("circle", {cx:x+w*dx, cy:y+h*dy, r:Math.min(w,h)*0.2, fill:"none", stroke:INK_SOFT, "stroke-width":0.8})); },
  rock(g, x, y, w, h){ g.appendChild(makeSvgEl("polyline", {points:`${x+w*0.25},${y+h*0.35} ${x+w*0.5},${y+h*0.55} ${x+w*0.75},${y+h*0.3}`, fill:"none", stroke:INK_SOFT, "stroke-width":1})); },
  streetlamp(g, x, y, w, h){ g.appendChild(makeSvgEl("circle", {cx:x+w/2, cy:y+h/2, r:Math.min(w,h)*0.22, fill:INK_SOFT})); },
  bench(g, x, y, w, h){ g.appendChild(rr(x, y, w, Math.max(2, h*0.2), INK_SOFT)); },
  fence(g, x, y, w, h){ for (let i = 0; i <= Math.round(w/40); i++) g.appendChild(makeSvgEl("rect", {x:x + i*(w/Math.max(1, Math.round(w/40))) - 2, y:y + h/2 - 2, width:4, height:4, fill:INK_SOFT})); },
  car(g, x, y, w, h){ g.appendChild(rr(x+w*0.3, y+h*0.12, w*0.42, h*0.76, "rgba(110,140,170,.75)", INK_SOFT)); },
  house(g, x, y, w, h){ g.appendChild(makeSvgEl("path", {d:`M${x},${y} L${x+w/2},${y+h/2} L${x+w},${y} M${x},${y+h} L${x+w/2},${y+h/2} L${x+w},${y+h}`, fill:"none", stroke:INK_SOFT, "stroke-width":1.2})); },
  mountain(g, x, y, w, h){ for (const k of [0.66, 0.36]) g.appendChild(makeSvgEl("ellipse", {cx:x+w/2, cy:y+h/2, rx:w*k/2, ry:h*k/2, fill:"none", stroke:"rgba(230,240,255,.55)", "stroke-width":Math.max(1, Math.min(w,h)*0.012)})); g.appendChild(makeSvgEl("path", {d:`M${x+w/2-w*0.06},${y+h/2+h*0.04} L${x+w/2},${y+h/2-h*0.06} L${x+w/2+w*0.06},${y+h/2+h*0.04} Z`, fill:"rgba(240,245,255,.7)"})); },
  hill(g, x, y, w, h){ g.appendChild(makeSvgEl("ellipse", {cx:x+w/2, cy:y+h/2, rx:w*0.3, ry:h*0.3, fill:"none", stroke:"rgba(230,240,255,.45)", "stroke-width":Math.max(1, Math.min(w,h)*0.012)})); },
});
const PLAN_FRONT = { bed:"right", person:null, lamp:null, book:null, plant:null, tree:null, pine:null, rock:null, bush:null, streetlamp:null, fence:null, car:"right", mountain:null, hill:null, bridge:null };
const PLAN_ROUND = ["tree", "pine", "bush", "plant", "streetlamp", "lamp"];
function rr(x, y, w, h, fill, stroke){ const a = {x, y, width:Math.max(0.5,w), height:Math.max(0.5,h), rx:1, fill}; if (stroke){ a.stroke = stroke; a["stroke-width"] = 0.6; } return makeSvgEl("rect", a); }

function renderWallLine(el, isWall){
  const g = makeSvgEl("g", {"data-id":el.id, class:"shape-el"});
  if (isWall){
    g.appendChild(makeSvgEl("line", {x1:el.x1,y1:el.y1,x2:el.x2,y2:el.y2, stroke:INK, "stroke-width":10, "stroke-linecap":"square", "pointer-events":"stroke"}));
    g.appendChild(makeSvgEl("line", {x1:el.x1,y1:el.y1,x2:el.x2,y2:el.y2, stroke:PAL.board, "stroke-width":7, "stroke-linecap":"square", "pointer-events":"none"}));
    const lbl = wallLengthLabel(el); if (lbl) g.appendChild(lbl);
  } else {
    g.appendChild(makeSvgEl("line", {x1:el.x1,y1:el.y1,x2:el.x2,y2:el.y2, stroke:DIM, "stroke-width":2.5, "stroke-linecap":"round", "stroke-dasharray":"6 4", "pointer-events":"stroke"}));
  }
  if (el.note){ const t=makeSvgEl("title",{}); t.textContent=el.note; g.appendChild(t); }
  return g;
}
function wallLengthLabel(el){
  const dx = el.x2-el.x1, dy = el.y2-el.y1, len = Math.hypot(dx, dy);
  if (len < 10) return null;
  let nx = -dy/len, ny = dx/len;
  if (ny > 0 || (ny === 0 && nx > 0)){ nx = -nx; ny = -ny; }
  let ang = Math.atan2(dy, dx)*180/Math.PI;
  if (ang > 90) ang -= 180; else if (ang <= -90) ang += 180;
  const mx = (el.x1+el.x2)/2 + nx*11, my = (el.y1+el.y2)/2 + ny*11;
  const tx = makeSvgEl("text", {x:mx, y:my, "font-size":8*planK(), fill:DIM, "text-anchor":"middle", "dominant-baseline":"middle", transform:`rotate(${ang} ${mx} ${my})`, "pointer-events":"none"});
  tx.textContent = (len/U).toFixed(1).replace(/\.0$/, "") + "m";
  return tx;
}
function renderObject(el){
  const g = makeSvgEl("g", {"data-id":el.id, class:"shape-el"});
  const cx = el.x+el.w/2, cy = el.y+el.h/2;
  const wrap = makeSvgEl("g", { transform: `rotate(${el.rot} ${cx} ${cy})` });
  if (el.on) wrap.appendChild(makeSvgEl("rect", {x:el.x-4,y:el.y-4,width:el.w+8,height:el.h+8, rx:7, fill:"#ffd84d", "fill-opacity":0.22, stroke:"#ffd84d", "stroke-width":1.5, "pointer-events":"none"}));
  wrap.appendChild(makeSvgEl("rect", {x:el.x,y:el.y,width:el.w,height:el.h, rx:PLAN_ROUND.includes(el.type) || el.type === "hill" ? Math.min(el.w, el.h)/2 : el.type === "rock" || el.type === "mountain" ? Math.min(el.w, el.h)*0.35 : 4, fill:COLORS[el.type], "fill-opacity":el.type==="person"?1:0.85, stroke:INK,"stroke-opacity":0.35}));
  if (PLAN_SYMBOLS[el.type]) PLAN_SYMBOLS[el.type](wrap, el.x, el.y, el.w, el.h);
  const front = el.type in PLAN_FRONT ? PLAN_FRONT[el.type] : "down";
  if (front === "down") wrap.appendChild(makeSvgEl("polygon", {points:`${cx-4},${el.y+el.h+2} ${cx+4},${el.y+el.h+2} ${cx},${el.y+el.h+7}`, fill:INK}));
  else if (front === "right") wrap.appendChild(makeSvgEl("polygon", {points:`${el.x+el.w+2},${cy-4} ${el.x+el.w+2},${cy+4} ${el.x+el.w+7},${cy}`, fill:INK}));
  g.appendChild(wrap);
  const swapped = ((el.rot||0) % 180) !== 0, halfH = swapped ? el.w/2 : el.h/2;
  const fr = (el.rot||0)*Math.PI/180, fdy = front === "down" ? Math.cos(fr) : front === "right" ? Math.sin(fr) : 0;
  const K = planK();
  const label = makeSvgEl("text", {x:cx, y:cy+halfH+(fdy > 0.5 ? 17 : 13)*K, "font-size":10*K, fill:DIM, "text-anchor":"middle"});
  label.textContent = curLabels()[el.type] + (el.on ? " 💡" : "");
  g.appendChild(label);
  if (el.note){ const t=makeSvgEl("title",{}); t.textContent=el.note; g.appendChild(t); }
  return g;
}
function attachFrame(el){
  const wall = getEl(el.wallId); if (!wall) return null;
  const dx = wall.x2-wall.x1, dy = wall.y2-wall.y1, len = Math.hypot(dx, dy) || 1;
  const ux = dx/len, uy = dy/len;
  return { px: wall.x1 + dx*el.t, py: wall.y1 + dy*el.t, ux, uy, nx: -uy, ny: ux };
}
function renderAttachMarker(el){
  const g = makeSvgEl("g", {"data-id":el.id, class:"shape-el"});
  const F = attachFrame(el); if (!F) return g;
  const { px, py, ux, uy, nx, ny } = F;
  const DW = el.type==="door" ? doorW2D(el) : WIN_W2D;
  const half = DW/2;
  const ax = px-ux*half, ay = py-uy*half, bx = px+ux*half, by = py+uy*half;
  g.appendChild(makeSvgEl("line", {x1:ax, y1:ay, x2:bx, y2:by, stroke:PAL.board, "stroke-width":11, "pointer-events":"none"}));
  if (isDoor2(el)){
    const side = (el.swing||0) < 2 ? 1 : -1, leaf = half;
    for (const hinge of [-1, 1]){
      const hx = px+ux*hinge*half, hy = py+uy*hinge*half, ox = hx+nx*side*leaf, oy = hy+ny*side*leaf;
      const a0 = Math.atan2(-uy*hinge, -ux*hinge), a1 = Math.atan2(ny*side, nx*side);
      let da = a1 - a0; while (da > Math.PI) da -= 2*Math.PI; while (da < -Math.PI) da += 2*Math.PI;
      const pts = []; for (let i = 0; i <= 12; i++){ const a = a0 + da*i/12; pts.push((hx+Math.cos(a)*leaf).toFixed(2)+","+(hy+Math.sin(a)*leaf).toFixed(2)); }
      g.appendChild(makeSvgEl("polyline", {points:pts.join(" "), fill:"none", stroke:DIM, "stroke-width":0.8, "stroke-dasharray":"3 2", "pointer-events":"none"}));
      g.appendChild(makeSvgEl("line", {x1:hx, y1:hy, x2:ox, y2:oy, stroke:INK, "stroke-width":2, "stroke-linecap":"round", class:"door-leaf"}));
    }
    for (const [qx, qy] of [[ax, ay], [bx, by]]) g.appendChild(makeSvgEl("line", {x1:qx-nx*5, y1:qy-ny*5, x2:qx+nx*5, y2:qy+ny*5, stroke:INK, "stroke-width":1.5}));
  } else if (el.type==="door"){
    const s = el.swing||0, side = s < 2 ? 1 : -1, hinge = s % 2 === 0 ? -1 : 1;
    const hx = px+ux*hinge*half, hy = py+uy*hinge*half;
    const ox = hx+nx*side*DOOR_W2D, oy = hy+ny*side*DOOR_W2D;
    const a0 = Math.atan2(-uy*hinge, -ux*hinge), a1 = Math.atan2(ny*side, nx*side);
    let da = a1 - a0; while (da > Math.PI) da -= 2*Math.PI; while (da < -Math.PI) da += 2*Math.PI;
    const pts = []; for (let i = 0; i <= 12; i++){ const a = a0 + da*i/12; pts.push((hx+Math.cos(a)*DOOR_W2D).toFixed(2)+","+(hy+Math.sin(a)*DOOR_W2D).toFixed(2)); }
    g.appendChild(makeSvgEl("polyline", {points:pts.join(" "), fill:"none", stroke:DIM, "stroke-width":0.8, "stroke-dasharray":"3 2", "pointer-events":"none"}));
    g.appendChild(makeSvgEl("line", {x1:hx, y1:hy, x2:ox, y2:oy, stroke:INK, "stroke-width":2, "stroke-linecap":"round"}));
    for (const [qx, qy] of [[ax, ay], [bx, by]]) g.appendChild(makeSvgEl("line", {x1:qx-nx*5, y1:qy-ny*5, x2:qx+nx*5, y2:qy+ny*5, stroke:INK, "stroke-width":1.5}));
  } else {
    for (const o of [-2.2, 2.2]) g.appendChild(makeSvgEl("line", {x1:ax+nx*o, y1:ay+ny*o, x2:bx+nx*o, y2:by+ny*o, stroke:PAL.glass, "stroke-width":1.2}));
    for (const [qx, qy] of [[ax, ay], [bx, by]]) g.appendChild(makeSvgEl("line", {x1:qx-nx*5, y1:qy-ny*5, x2:qx+nx*5, y2:qy+ny*5, stroke:INK, "stroke-width":1.5}));
  }
  g.appendChild(makeSvgEl("circle", {cx:px, cy:py, r:10, fill:"rgba(0,0,0,0)"}));
  const t = makeSvgEl("title", {}); t.textContent = el.type === "door" ? doorName(el) : curLabels()[el.type]; g.appendChild(t);
  return g;
}
