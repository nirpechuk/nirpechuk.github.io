// Talk tree. ids match <section id="..."> in index.html.
const TREE = {
  id: 'title', title: 'Title', children: [
    { id: 'intro-nested',   title: 'TTT as nested optimization' },
    { id: 'intro-table',    title: 'The LLM menu' },
    { id: 'intro-robotics', title: 'What is different in robotics' },
    { id: 'intro-vla',      title: 'VLA preliminaries' },
    { id: 'map', title: 'Map', children: [
      { id: 'robottt', title: 'RoboTTT', children: [
        { id: 'robottt-mechanism', title: 'Mechanism' },
        { id: 'robottt-recipe',    title: 'Training recipe' },
        { id: 'robottt-decoupled', title: 'Decoupling fast and slow updates' },
        { id: 'robottt-results',   title: 'Results', children: [
          { id: 'robottt-context-main',    title: 'Remembering context' },
          { id: 'robottt-context-scaling', title: 'Context as a scaling axis', optional: true },
          { id: 'robottt-feedback',        title: 'Learning from feedback' },
          { id: 'robottt-examples',        title: 'Learning from examples' },
          { id: 'robottt-ablations',       title: 'Ablations' },
        ]},
        { id: 'robottt-bridge', title: 'Two questions' },
      ]},
      { id: 't2mem', title: 'T²Mem', children: [
        { id: 't2mem-tasks',        title: 'Memory-dependent tasks', optional: true },
        { id: 't2mem-interface',    title: 'Memory between VLM and AE' },
        { id: 't2mem-adaptive',     title: 'Surprise-gated updates' },
        { id: 't2mem-alternating',  title: 'Alternating memory–policy learning', optional: true },
        { id: 't2mem-results-bench', title: 'Results: RoboMME' },
        { id: 't2mem-results-use',   title: 'Results: is the memory used?' },
      ]},
      { id: 'conclusions', title: 'Conclusions and my thoughts' },
      { id: 'backup', title: 'Backup', children: [
        { id: 'backup-robottt-tasks',    title: 'RoboTTT tasks and rubrics' },
        { id: 'backup-robottt-training', title: 'RoboTTT training details' },
        { id: 'backup-t2mem-eta',        title: 'T²Mem step-size calibration' },
        { id: 'backup-t2mem-recipe',     title: 'T²Mem training and inference order' },
        { id: 'backup-t2mem-tasks',      title: 'T²Mem task walkthroughs' },
        { id: 'backup-t2mem-table',      title: 'Full RoboMME table' },
      ]},
    ]},
  ]
};

const nodes = {}, parent = {}, order = [];
(function walk(n, p) { nodes[n.id] = n; parent[n.id] = p; order.push(n.id); (n.children || []).forEach(c => walk(c, n.id)); })(TREE, null);

function show(id) {
  if (!nodes[id]) id = 'title';
  document.querySelectorAll('.slide').forEach(s => s.classList.remove('on'));
  let el = document.getElementById(id);
  if (!el) { el = document.getElementById('placeholder'); document.getElementById('ph-title').textContent = nodes[id].title; }
  el.classList.add('on');
  const chain = []; for (let c = id; c; c = parent[c]) chain.unshift(c);
  document.getElementById('crumbs').innerHTML = chain.map((c, i) =>
    i === chain.length - 1 ? `<span class="here">${nodes[c].title}</span>` : `<a href="#${c}">${nodes[c].title}</a>`
  ).join('<span class="sep">›</span>') + (nodes[id].optional ? '<span class="optchip">optional</span>' : '');
  const sibs = parent[id] ? nodes[parent[id]].children : [TREE];
  const k = sibs.findIndex(s => s.id === id);
  document.getElementById('index').textContent = parent[id] ? `${k + 1} / ${sibs.length}` : '';
  window.scrollTo(0, 0);
  syncVideos();
}
function syncVideos() {
  document.querySelectorAll('video.vid').forEach(v => {
    const item = v.closest('.citem');
    const on = v.closest('.slide').classList.contains('on') && document.getElementById('lightbox').hidden && (!item || item.classList.contains('on'));
    if (on) { v.play().catch(() => {}); } else { v.pause(); }
  });
}
function current() { return location.hash.slice(1) || 'title'; }
function go(id) { if (id) location.hash = id; }
window.addEventListener('hashchange', () => show(current()));
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!document.getElementById('lightbox').hidden) { if (e.key === 'Escape') closeLightbox(); e.preventDefault(); return; }
  const id = current(), p = parent[id];
  const sibs = p ? nodes[p].children : [TREE];
  const k = sibs.findIndex(s => s.id === id);
  const d = order.indexOf(id);
  if (e.key === 'ArrowRight') go(e.shiftKey ? sibs[k + 1]?.id : order[d + 1]);
  else if (e.key === 'ArrowLeft') go(e.shiftKey ? sibs[k - 1]?.id : order[d - 1]);
  else if (e.key === 'ArrowUp') go(p);
  else if (e.key === 'ArrowDown' || e.key === 'Enter') go(nodes[id].children?.[0]?.id);
  else if (e.key === ' ' || e.key === 'PageDown') go(e.shiftKey ? order[d - 1] : order[d + 1]);
  else if (e.key === 'PageUp') go(order[d - 1]);
  else if (e.key >= '1' && e.key <= '9') go(nodes[id].children?.[+e.key - 1]?.id);
  else if (e.key === 'm' || e.key === 'M') go('map');
  else if (e.key === 'b' || e.key === 'B') go('backup');
  else if (e.key === 'k' || e.key === 'K') { document.body.classList.toggle('nokeys'); }
  else return;
  e.preventDefault();
});
renderMathInElement(document.body, {
  delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
  throwOnError: false,
});
// ---- click-to-expand for figures and inline diagrams ----
const lb = document.getElementById('lightbox'), lbBody = document.getElementById('lb-body');
function openLightbox(el) {
  lbBody.innerHTML = '';
  if (el.tagName === 'VIDEO' || el.dataset.full) {
    // clips: "label=src;label=src" (optional); otherwise data-full or the element's own src
    const clips = el.dataset.clips ? el.dataset.clips.split(';').map(c => { const [label, src] = c.split('='); return { label, src }; })
                                   : [{ label: '', src: el.dataset.full || el.currentSrc || el.src }];
    const v = document.createElement('video');
    v.controls = true; v.autoplay = true; v.playsInline = true; v.muted = false;
    v.addEventListener('click', e => e.stopPropagation());
    lbBody.appendChild(v);
    const bar = document.createElement('div'); bar.id = 'lb-clips';
    clips.forEach((c, i) => {
      const btn = document.createElement('button'); btn.textContent = c.label || 'play';
      btn.addEventListener('click', e => { e.stopPropagation(); v.src = c.src; v.play().catch(() => {}); bar.querySelectorAll('button').forEach(x => x.classList.remove('on')); btn.classList.add('on'); });
      if (i === 0) btn.classList.add('on');
      bar.appendChild(btn);
    });
    if (clips.length > 1 || clips[0].label) lbBody.appendChild(bar);
    v.src = clips[0].src;
  } else {
    const clone = el.cloneNode(true);
    clone.removeAttribute('style'); clone.classList.remove('fig');
    lbBody.appendChild(clone);
  }
  lb.hidden = false;
  syncVideos();
}
function closeLightbox() { lb.hidden = true; lbBody.innerHTML = ''; syncVideos(); }
document.querySelectorAll('.slide img.fig, .slide svg[role="img"], .slide video.vid:not(.nolb), .slide .vidlink').forEach(el => {
  el.classList.add('zoomable');
  el.addEventListener('click', e => { e.stopPropagation(); openLightbox(el); });
});
lb.addEventListener('click', closeLightbox);
document.getElementById('lb-close').addEventListener('click', e => { e.stopPropagation(); closeLightbox(); });
show(current());

// ---- click-through carousels: one item visible at a time, click advances ----
document.querySelectorAll('.carousel').forEach(car => {
  const items = [...car.querySelectorAll('.citem')];
  car.addEventListener('click', e => {
    e.stopPropagation();
    const k = items.findIndex(it => it.classList.contains('on'));
    items[k].classList.remove('on');
    items[(k + 1) % items.length].classList.add('on');
    syncVideos();
  });
});
