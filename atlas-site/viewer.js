const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const tip = document.getElementById('tip');
const header = document.querySelector('header');
const panel = document.getElementById('panel');
const MIN_ZOOM = 0.02, MAX_ZOOM = 1.5;
const MAX_PICK = 150; // the export still says 138; 150 is this season's limit
let TOP = 36;

const sheets = T.sheets.map(src => { const im = new Image(); im.onload = draw; im.src = src; return im; });
const byId = new Map(T.nodes.map(n => [n.id, n]));
const START = T.start[3];
const adj = new Map();
for (const [a, b] of T.edges) {
  if (!adj.has(a)) adj.set(a, []);
  if (!adj.has(b)) adj.set(b, []);
  adj.get(a).push(b);
  adj.get(b).push(a);
}
for (const n of T.nodes)
  n.text = [n.n, ...n.s, ...n.r, ...(n.v || []).map(v => v[0])].join(' ').replace(/\s+/g, ' ').toLowerCase();

let zoom = 0.1, camX = 0, camY = 0, dpr = 1;

// background on/off, remembered in this browser
let showBg = true;
try { showBg = localStorage.getItem('atlas-bg') !== 'off'; } catch (e) {}
const bgButton = document.getElementById('bg');
function setBg(on) {
  showBg = on;
  bgButton.classList.toggle('on', on);
  try { localStorage.setItem('atlas-bg', on ? 'on' : 'off'); } catch (e) {}
  draw();
}
bgButton.onclick = () => setBg(!showBg);
bgButton.classList.toggle('on', showBg);
if (!T.bg) bgButton.style.display = 'none';

function resize() {
  TOP = header.offsetHeight;
  canvas.style.top = panel.style.top = TOP + 'px';
  dpr = window.devicePixelRatio || 1;
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = (innerHeight - TOP) + 'px';
  canvas.width = innerWidth * dpr;
  canvas.height = (innerHeight - TOP) * dpr;
  draw();
}

function panelW() {
  const w = panel.classList.contains('hidden') ? 0 : panel.offsetWidth;
  return w < innerWidth ? w : 0;
}

function lookAt(x, y) {
  camX = x + panelW() / 2 / zoom;
  camY = y;
  draw();
}

function fit() {
  const [x0, y0, x1, y1] = T.bounds;
  const w = innerWidth - panelW(), h = innerHeight - TOP;
  zoom = Math.min(w / (x1 - x0 + 800), h / (y1 - y0 + 1600));
  lookAt((x0 + x1) / 2, (y0 + y1) / 2);
}

function sprite(r, x, y, scale = 1) {
  if (!r) return;
  const im = sheets[r[0]];
  if (!im.complete || !im.naturalWidth) return;
  const w = r[5] * scale, h = r[6] * scale;
  ctx.drawImage(im, r[1], r[2], r[3], r[4], x - w / 2, y - h / 2, w, h);
}

let pending = false;
function draw() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(render);
}

function ring(n, color, width, gap) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width / zoom;
  ctx.beginPath();
  ctx.arc(n.x, n.y, Math.max(radius(n) + gap / zoom, 7 / zoom), 0, Math.PI * 2);
  ctx.stroke();
}

function render() {
  pending = false;
  const w = canvas.width / dpr, h = canvas.height / dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = T.bg && showBg ? '#0a0c14' : '#08090c'; // background image's edge color, so it blends in
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * (w / 2 - camX * zoom), dpr * (h / 2 - camY * zoom));
  ctx.imageSmoothingQuality = 'high';

  // round background, centered on the start node and framing the whole tree
  if (T.bg && showBg) {
    const [x0, y0, x1, y1] = T.bounds, [sx, sy] = T.start;
    const size = 2.3 * Math.max(sx - x0, x1 - sx, sy - y0, y1 - sy);
    const im = sheets[T.bg[0]];
    if (im.complete && im.naturalWidth)
      ctx.drawImage(im, T.bg[1], T.bg[2], T.bg[3], T.bg[4], sx - size / 2, sy - size / 2, size, size);
  }

  for (const [x, y, r] of T.groups) sprite(r, x, y);

  // links between the nodes
  ctx.strokeStyle = '#6b5a3c';
  ctx.lineWidth = Math.max(8, 1.5 / zoom);
  ctx.beginPath();
  for (const [ax, ay, bx, by] of T.lines) { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }
  for (const [cx, cy, r, a, d] of T.arcs) {
    ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    ctx.arc(cx, cy, r, a, a + d, d < 0);
  }
  ctx.stroke();

  const on = id => id === START || picked.has(id);
  const soon = id => on(id) || (preview && preview.add && preview.add.has(id));
  linkPass((a, b) => on(a) && on(b), '#e8c060');
  if (preview && preview.add) linkPass((a, b) => soon(a) && soon(b) && !(on(a) && on(b)), '#8fd080');

  sprite(T.start[2], T.start[0], T.start[1]);

  for (const n of T.nodes) {
    sprite(n.i, n.x, n.y);
    sprite(picked.has(n.id) && n.fa ? n.fa : n.fr, n.x, n.y);
  }

  // gold when allocated; orange for a multiple-choice node that still needs its choice
  for (const n of picked.values()) ring(n, n.v && !choice.has(n.id) ? '#e07a30' : '#e8c060', 2.5, 2);
  if (preview) for (const id of preview.add || preview.remove)
    ring(byId.get(id), preview.add ? '#8fd080' : '#e07050', 2.5, 2);
  for (const n of matches) ring(n, n === matches[cursor] ? '#ffffff' : '#4fc3ff', 2.5, 6);
  if (hover) ring(hover, '#e8d8a8', 2, 4);

  document.getElementById('pct').textContent = Math.round(zoom * 1000) / 10 + '%';
}

function linkPass(test, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(10, 2.5 / zoom);
  ctx.beginPath();
  for (const [ax, ay, bx, by, a, b] of T.lines)
    if (test(a, b)) { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }
  for (const [cx, cy, r, s, d, a, b] of T.arcs)
    if (test(a, b)) { ctx.moveTo(cx + r * Math.cos(s), cy + r * Math.sin(s)); ctx.arc(cx, cy, r, s, s + d, d < 0); }
  ctx.stroke();
}

function radius(n) { return (n.fr ? n.fr[5] : n.i ? n.i[5] : 60) * 0.45; }

function toWorld(sx, sy) {
  const w = canvas.width / dpr, h = canvas.height / dpr;
  return [(sx - w / 2) / zoom + camX, (sy - TOP - h / 2) / zoom + camY];
}

function zoomAt(factor, sx, sy) {
  const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
  const [wx, wy] = toWorld(sx, sy);
  camX = wx - (wx - camX) * zoom / nz;
  camY = wy - (wy - camY) * zoom / nz;
  zoom = nz;
  draw();
}

function centerOn(n) {
  zoom = Math.max(zoom, 0.3);
  lookAt(n.x, n.y);
}

// node selection logic
const picked = new Map();
const choice = new Map(); // multiple-choice node id -> index into its n.v
const selectable = n => n.k !== 'mastery';
const effects = n => n.v ? (choice.has(n.id) ? n.v[choice.get(n.id)][1] : []) : n.s;

function pathTo(n) {
  const prev = new Map();
  const queue = [START, ...picked.keys()];
  for (const id of queue) prev.set(id, null);
  for (let i = 0; i < queue.length && !prev.has(n.id); i++)
    for (const next of adj.get(queue[i]) || [])
      if (!prev.has(next)) { prev.set(next, queue[i]); queue.push(next); }
  if (!prev.has(n.id)) return null;
  const path = [];
  for (let id = n.id; id !== START && !picked.has(id); id = prev.get(id)) path.push(id);
  return path.reverse();
}

function linked(without) {
  const reach = new Set([START]), stack = [START];
  while (stack.length)
    for (const next of adj.get(stack.pop()) || [])
      if (next !== without && picked.has(next) && !reach.has(next)) { reach.add(next); stack.push(next); }
  return reach;
}

function cut(n) {
  const reach = linked(n.id);
  return [...picked.keys()].filter(id => !reach.has(id));
}

let preview = null;
function makePreview(n) {
  if (!n || !selectable(n)) return null;
  if (picked.has(n.id)) return n.v ? null : { remove: new Set(cut(n)) }; // multiple-choice: the menu decides
  const path = pathTo(n);
  return path && { add: new Set(path) };
}

function unpick(n) {
  for (const id of cut(n)) { picked.delete(id); choice.delete(id); }
}

// Allocates the path to n; false if it doesn't fit in the points left.
function allocate(n) {
  const path = pathTo(n);
  if (!path) return false;
  if (picked.size + path.length > MAX_PICK) { flashFull(path.length); return false; }
  for (const id of path) picked.set(id, byId.get(id));
  return true;
}

function toggle(n) {
  if (!selectable(n)) return;
  if (picked.has(n.id)) unpick(n);
  else if (!allocate(n)) return;
  changed();
}

function choose(n, i) {
  if (!picked.has(n.id) && !allocate(n)) return;
  choice.set(n.id, i);
  changed();
}

function changed() {
  preview = makePreview(hover);
  selectionChanged();
}

// Menu for multiple-choice nodes: pick (or change) the choice, or remove the node.
const menu = document.getElementById('menu');
function openMenu(n, sx, sy) {
  if (!selectable(n) || (!picked.has(n.id) && !pathTo(n))) return;
  tip.style.display = 'none';
  menu.innerHTML = '';
  const title = document.createElement('b');
  title.textContent = n.n;
  menu.append(title);
  for (const s of n.s) {
    const d = document.createElement('div');
    d.className = 'stat';
    d.textContent = s;
    menu.append(d);
  }
  const cur = choice.get(n.id);
  n.v.forEach(([label], i) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (i === cur) b.className = 'on';
    b.onclick = () => { closeMenu(); choose(n, i); };
    menu.append(b);
  });
  if (picked.has(n.id)) {
    const k = cut(n).length;
    const b = document.createElement('button');
    b.className = 'rm';
    b.textContent = k === 1 ? 'Remove' : `Remove (${k} nodes: this one and those linked through it)`;
    b.onclick = () => { closeMenu(); toggle(n); };
    menu.append(b);
  } else {
    const k = pathTo(n).length;
    const d = document.createElement('div');
    d.className = 'hint';
    d.textContent = `Choose one to allocate (${k} ${k === 1 ? 'point' : 'points'})`;
    menu.append(d);
  }
  menu.style.display = 'block';
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(sx + 12, innerWidth - r.width - 8)) + 'px';
  menu.style.top = Math.max(TOP + 4, Math.min(sy + 12, innerHeight - r.height - 8)) + 'px';
}
const menuOpen = () => menu.style.display === 'block';
function closeMenu() { menu.style.display = 'none'; }
addEventListener('pointerdown', e => { if (menuOpen() && !menu.contains(e.target) && e.target !== canvas) closeMenu(); });

let fullTimer = 0;
function flashFull(need) {
  const c = document.getElementById('count');
  c.textContent = `Path needs ${need} points, ${MAX_PICK - picked.size} left`;
  c.classList.add('full');
  clearTimeout(fullTimer);
  fullTimer = setTimeout(updatePanel, 1500);
}

function selectionChanged() {
  const ids = [...picked.keys()].map(id => choice.has(id) ? id + ':' + choice.get(id) : id).join(',');
  try { history.replaceState(null, '', ids ? '#s=' + ids : location.pathname + location.search); } catch (e) {}
  updatePanel();
  draw();
}

// logic for stacking node effects that can be stacked
// e.g. nodes 43934 (Betrayal Chance) and 34644 (Obsessed with Vengeance)
// both have "your maps have % chance to contain jun", or the percentage for betrayal scarab drop
// numerical values for both affixes add up, so 10+20 = 30% to contain jun, and same for scarabs (10+20)
const NUM = /\d+(?:\.\d+)?/g;
function summableIndexes(s) {
  const pct = [];
  let count = 0;
  s.replace(NUM, (m, off) => { if (s[off + m.length] === '%') pct.push(count); count++; return m; });
  return pct.length ? pct : count === 1 ? [0] : [];
}
function summarize(nodes) {
  const groups = new Map();
  for (const n of nodes) for (const s of effects(n)) {
    const key = s.replace(NUM, '#');
    const nums = (s.match(NUM) || []).map(Number);
    const g = groups.get(key);
    if (!g) groups.set(key, { text: s, nums, count: 1, sum: summableIndexes(s) });
    else { g.count++; for (const i of g.sum) g.nums[i] += nums[i]; }
  }
  return [...groups.values()].map(g => {
    let i = 0;
    const text = g.count > 1 && g.sum.length
      ? g.text.replace(NUM, m => g.sum.includes(i) ? String(Math.round(g.nums[i++] * 100) / 100) : (i++, m))
      : g.text;
    return { text, count: g.count };
  }).sort((a, b) => a.text.localeCompare(b.text));
}

function updatePanel() {
  const n = picked.size;
  const c = document.getElementById('count');
  c.textContent = `${n} / ${MAX_PICK} selected`;
  c.classList.toggle('full', n >= MAX_PICK);
  document.getElementById('badge').textContent = n;
  document.getElementById('empty').style.display = n ? 'none' : '';

  const eff = document.getElementById('effects');
  eff.innerHTML = '';
  for (const e of summarize(picked.values())) {
    const li = document.createElement('li');
    li.textContent = e.text;
    if (e.count > 1) {
      const k = document.createElement('span');
      k.className = 'n';
      k.textContent = '×' + e.count;
      li.append(k);
    }
    eff.append(li);
  }

  const list = document.getElementById('picked');
  list.innerHTML = '';
  for (const node of picked.values()) {
    const li = document.createElement('li');
    li.className = node.k;
    const name = document.createElement('span');
    name.textContent = node.n;
    name.title = 'Show on the tree';
    name.onclick = () => centerOn(node);
    const x = document.createElement('button');
    x.textContent = '×';
    x.title = 'Remove';
    x.onclick = () => toggle(node);
    li.append(name, x);
    if (node.v) {
      const sel = document.createElement('select');
      sel.title = 'Choice for this node';
      if (!choice.has(node.id)) sel.append(new Option('Choose one…', '', true, true));
      node.v.forEach(([label], i) => sel.append(new Option(label, i, false, choice.get(node.id) === i)));
      sel.onchange = () => choose(node, +sel.value);
      li.append(sel);
    }
    list.append(li);
  }
}

document.getElementById('max').textContent = MAX_PICK;
document.getElementById('clear').onclick = () => { picked.clear(); choice.clear(); selectionChanged(); };
document.getElementById('toggle').onclick = () => {
  panel.classList.toggle('hidden');
  document.getElementById('toggle').classList.toggle('on', !panel.classList.contains('hidden'));
};

// saving the taken path in the url, node IDs separated by commas,
// "id:choice" for multiple-choice nodes
const saved = /#s=([\d,:]+)/.exec(location.hash);
if (saved) for (const item of saved[1].split(',')) {
  const [id, c] = item.split(':').map(Number);
  const n = byId.get(id);
  if (!n || !selectable(n) || picked.size >= MAX_PICK) continue;
  picked.set(n.id, n);
  if (n.v && n.v[c]) choice.set(n.id, c);
}
{
  const reach = linked(null);
  for (const id of [...picked.keys()]) if (!reach.has(id)) { picked.delete(id); choice.delete(id); }
}
if (innerWidth < 900 && !picked.size) panel.classList.add('hidden');
document.getElementById('toggle').classList.toggle('on', !panel.classList.contains('hidden'));
updatePanel();

const q = document.getElementById('q');
const hits = document.getElementById('hits');
let matches = [], cursor = -1;

// search text for nodes (name, description)
function search() {
  const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
  matches = words.length ? T.nodes.filter(n => words.every(w => n.text.includes(w))) : [];
  cursor = -1;
  hits.textContent = words.length ? (matches.length ? matches.length + ' found' : 'no match') : '';
  draw();
}
q.addEventListener('input', search);
q.addEventListener('keydown', e => {
  if (e.key === 'Enter' && matches.length) {
    cursor = (cursor + (e.shiftKey ? matches.length - 1 : 1)) % matches.length;
    hits.textContent = `${cursor + 1} / ${matches.length}`;
    centerOn(matches[cursor]);
  } else if (e.key === 'Escape') {
    q.value = '';
    search();
    q.blur();
  }
});

// hover logic
let hover = null;
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function showTip(n, sx, sy) {
  let html = '<b>' + esc(n.n) + '</b>';
  for (const s of n.s) html += '<div class="stat">' + esc(s) + '</div>';
  if (n.v) {
    const cur = choice.get(n.id);
    html += '<div class="choices">' + n.v.map(([label], i) =>
      '<div' + (i === cur ? ' class="on"' : '') + '>' + esc(label) + '</div>').join('') + '</div>';
  }
  for (const s of n.r) html += '<div class="rem">' + esc(s) + '</div>';
  if (n.f.length) html += '<div class="fl">' + n.f.map(esc).join('<br>') + '</div>';
  if (n.v && picked.has(n.id)) {
    html += '<div class="hint">' + (choice.has(n.id) ? 'Click to change the choice or remove' : 'Click to choose one') + '</div>';
  } else if (preview) {
    const k = (preview.add || preview.remove).size, left = MAX_PICK - picked.size;
    const pts = k + (k === 1 ? ' point' : ' points');
    html += '<div class="hint">' + (preview.remove
      ? (k === 1 ? 'Click to remove' : `Click to remove ${k} nodes (this one and those linked through it)`)
      : k > left ? `Path needs ${pts}, only ${left} left`
      : n.v ? `Click to choose one and allocate (${pts})`
      : `Click to allocate (${pts})`) + '</div>';
  }
  tip.innerHTML = html;
  tip.style.display = 'block';
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.min(sx + 16, innerWidth - r.width - 8) + 'px';
  tip.style.top = Math.min(sy + 16, innerHeight - r.height - 8) + 'px';
}
function pick(sx, sy) {
  const [wx, wy] = toWorld(sx, sy);
  let best = null, bestD = Infinity;
  for (const n of T.nodes) {
    const d = Math.hypot(n.x - wx, n.y - wy);
    if (d < radius(n) && d < bestD) { best = n; bestD = d; }
  }
  return best;
}

// moving around the tree
let drag = null;
canvas.addEventListener('pointerdown', e => {
  // a click on the tree while the choice menu is open only closes the menu
  const swallow = menuOpen();
  closeMenu();
  drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false, swallow };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (drag) {
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
    drag.moved = true;
    canvas.classList.add('drag');
    camX -= (e.clientX - drag.x) / zoom;
    camY -= (e.clientY - drag.y) / zoom;
    drag.x = e.clientX;
    drag.y = e.clientY;
    tip.style.display = 'none';
    draw();
    return;
  }
  const n = pick(e.clientX, e.clientY);
  if (n !== hover) { hover = n; preview = makePreview(n); draw(); }
  if (n && !menuOpen()) showTip(n, e.clientX, e.clientY); else tip.style.display = 'none';
});
canvas.addEventListener('pointerup', e => {
  const click = drag && !drag.moved && !drag.swallow;
  drag = null;
  canvas.classList.remove('drag');
  if (!click) return;
  const n = pick(e.clientX, e.clientY);
  if (n && n.v) openMenu(n, e.clientX, e.clientY);
  else if (n) {
    toggle(n);
    if (e.pointerType === 'mouse') showTip(n, e.clientX, e.clientY);
  }
});
canvas.addEventListener('pointercancel', () => { drag = null; canvas.classList.remove('drag'); });
canvas.addEventListener('pointerleave', () => { tip.style.display = 'none'; if (hover) { hover = preview = null; draw(); } });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  closeMenu();
  zoomAt(Math.pow(1.0015, -e.deltaY), e.clientX, e.clientY);
}, { passive: false });

const center = () => [(innerWidth - panelW()) / 2, TOP + (innerHeight - TOP) / 2];
document.getElementById('in').onclick = () => zoomAt(1.25, ...center());
document.getElementById('out').onclick = () => zoomAt(0.8, ...center());
document.getElementById('fit').onclick = fit;
addEventListener('keydown', e => {
  if (e.key === 'Escape') closeMenu();
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === '+' || e.key === '=') zoomAt(1.25, ...center());
  if (e.key === '-') zoomAt(0.8, ...center());
  if (e.key === '0') fit();
  if (e.key === 'b') setBg(!showBg);
  if (e.key === '/' || (e.key === 'f' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); q.focus(); q.select(); }
});
addEventListener('resize', resize);

resize();
fit();
