/* The Sharples Family Tree — view-only zoomable canvas.
 * Data: data/tree.json (privacy-filtered at build time).
 * Layout: pre-computed at build time (scripts/layout.mjs, ELK layered, couples as blocks).
 */
(async function () {
  "use strict";
  let W = 176, H = 64;                 // person card size (canvas units; overridden by layout)
  const Z_FAR = 0.2, Z_MID = 0.42, Z_NEAR = 1.05;   // semantic zoom thresholds

  const data = await fetch("data/tree.json", { cache: "no-cache" }).then(r => r.json());
  if (data.layout) ({ W, H } = data.layout);
  const P = new Map(data.people.map(p => [p.id, p]));
  const F = new Map(data.families.map(f => [f.id, f]));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fullName = p => `${p.given || ""} ${p.surname || ""}`.trim() || "Unknown";

  function years(p) {
    if (p.living) return "Living";
    const b = p.born, d = p.died;
    if (b && d) return `${b} – ${d}`;
    if (b && p.deceased) return `${b} – ?`;
    if (b) return `b. ${b}`;
    if (d) return `d. ${d}`;
    return "";
  }

  // ---------- direct line: ancestors of the root person ----------
  const direct = new Set();
  (function walk(id) {
    const p = P.get(id); if (!p || direct.has(id)) return;
    direct.add(id);
    for (const fid of p.famc) { const f = F.get(fid); if (f) { f.father && walk(f.father); f.mother && walk(f.mother); } }
  })(data.root);

  // ---------- layout (pre-computed at build time by scripts/layout.mjs) ----------
  const bornOf = id => P.get(id)?.born ?? 9999;
  const pos = id => P.get(id);

  // ---------- svg scaffold ----------
  const svg = d3.select("#canvas");
  const root = svg.append("g");
  const defs = svg.append("defs");
  defs.append("clipPath").attr("id", "cardclip").append("rect").attr("width", W).attr("height", H).attr("rx", 10);
  const gLinks = root.append("g"), gDirect = root.append("g"), gUnions = root.append("g"), gPeople = root.append("g");

  // rounded orthogonal path through points
  function ortho(pts, r = 9) {
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const d1 = Math.hypot(x1 - x0, y1 - y0), d2 = Math.hypot(x2 - x1, y2 - y1);
      const rr = Math.min(r, d1 / 2, d2 / 2);
      if (rr < 0.5) { d += ` L${x1},${y1}`; continue; }
      const ax = x1 - (x1 - x0) / d1 * rr, ay = y1 - (y1 - y0) / d1 * rr;
      const bx = x1 + (x2 - x1) / d2 * rr, by = y1 + (y2 - y1) / d2 * rr;
      d += ` L${ax},${ay} Q${x1},${y1} ${bx},${by}`;
    }
    const last = pts[pts.length - 1];
    return d + ` L${last[0]},${last[1]}`;
  }

  for (const f of data.families) {
    if (f.ux == null) continue;
    const onLine = f.children.some(c => direct.has(c));
    const both = f.father && f.mother;
    if (both) {
      const a = pos(f.father), m = pos(f.mother);
      const [l, r] = a.x < m.x ? [a, m] : [m, a];
      const isD = onLine && direct.has(f.father) && direct.has(f.mother);
      (isD ? gDirect : gLinks).append("path").attr("class", "link" + (isD ? " direct" : ""))
        .attr("d", `M${l.x + W / 2},${f.uy} H${r.x - W / 2}`);
    }
    const sx = f.ux, sy = both ? f.uy : f.uy + H / 2;
    for (const c of f.children) {
      const p = pos(c);
      const top = p.y - H / 2, bus = top - 22;
      const d = ortho([[sx, sy], [sx, bus], [p.x, bus], [p.x, top]]);
      const isD = direct.has(c);
      (isD ? gDirect : gLinks).append("path").attr("class", "link" + (isD ? " direct" : "")).attr("d", d);
    }
    if (both) gUnions.append("circle").attr("class", "union" + (onLine ? " direct" : "")).attr("cx", f.ux).attr("cy", f.uy).attr("r", 3.5);
  }

  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  const nodes = gPeople.selectAll("g.person").data(data.people).join("g")
    .attr("class", p => `person ${p.sex}${p.living ? " living" : ""}${direct.has(p.id) ? " direct" : ""}${p.id === data.root ? " root" : ""}`)
    .attr("transform", p => { const n = pos(p.id); return `translate(${n.x - W / 2},${n.y - H / 2})`; })
    .attr("tabindex", 0).attr("role", "button").attr("aria-label", p => `${fullName(p)} ${years(p)}`);
  nodes.append("rect").attr("class", "card").attr("width", W).attr("height", H).attr("rx", 10);
  nodes.append("rect").attr("class", "edge").attr("width", 5).attr("height", H).attr("clip-path", "url(#cardclip)");
  // far: first name, large
  nodes.append("text").attr("class", "far big").attr("x", W / 2).attr("y", H / 2 + 11).attr("text-anchor", "middle")
    .text(p => clip((p.given || "?").split(" ")[0], 10));
  // mid + near
  nodes.append("text").attr("class", "mid given").attr("x", 16).attr("y", 24).text(p => clip(fullName(p), 21));
  nodes.append("text").attr("class", "mid years").attr("x", 16).attr("y", 42).text(p => years(p));
  // near only
  nodes.append("text").attr("class", "near extra").attr("x", 16).attr("y", 56)
    .text(p => clip([p.occupation, (p.bornPlace || "").split(",")[0]].filter(Boolean).join(" · "), 30));

  // ---------- zoom / pan ----------
  const stage = document.getElementById("stage");
  const gens = document.getElementById("gens");
  let T = d3.zoomIdentity;
  const zoom = d3.zoom().scaleExtent([0.04, 3.5]).on("zoom", e => {
    T = e.transform; root.attr("transform", T);
    const k = T.k;
    svg.classed("zz", k < Z_FAR).classed("z0", k < Z_MID).classed("z1", k >= Z_MID && k < Z_NEAR).classed("z2", k >= Z_NEAR);
    drawGens(); drawMini(); hideTip();
  });
  svg.call(zoom).on("dblclick.zoom", null);

  // generation rail: median birth year per rank
  const rows = d3.groups(data.people.filter(p => !p.living && p.born), p => Math.round(pos(p.id).y))
    .map(([y, ps]) => ({ y, yr: d3.median(ps, p => p.born) })).sort((a, b) => a.y - b.y);
  function drawGens() {
    const h = stage.clientHeight; let last = -1e9; const out = [];
    for (const r of rows) {
      const sy = T.applyY(r.y);
      if (sy < 70 || sy > h - 40 || sy - last < 26) continue;
      last = sy; out.push(`<div style="top:${sy}px">c.${Math.round(r.yr / 5) * 5}</div>`);
    }
    gens.innerHTML = out.join("");
  }

  const bounds = () => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of data.people) { const n = pos(p.id); x0 = Math.min(x0, n.x - W / 2); x1 = Math.max(x1, n.x + W / 2); y0 = Math.min(y0, n.y - H / 2); y1 = Math.max(y1, n.y + H / 2); }
    return { x0, y0, x1, y1 };
  };
  function fit(dur = 600) {
    const b = bounds(), w = stage.clientWidth, h = stage.clientHeight;
    const top = 70, bot = 44, side = 30;
    const k = Math.min((w - 2 * side) / (b.x1 - b.x0), (h - top - bot) / (b.y1 - b.y0), 1.2);
    const tx = (w - k * (b.x0 + b.x1)) / 2, ty = top + ((h - top - bot) - k * (b.y1 - b.y0)) / 2 - k * b.y0;
    svg.transition().duration(dur).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
  }
  function flyTo(id, k = Math.max(T.k, 1.0)) {
    const n = pos(id), w = stage.clientWidth, h = stage.clientHeight;
    const panelOpen = !document.getElementById("panel").hidden && w > 720;
    const cx = panelOpen ? (w - 440) / 2 : w / 2, cy = w > 720 ? h / 2 : (110 + h * 0.4) / 2;
    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(cx - k * n.x, cy - k * n.y).scale(k));
  }
  // ---------- minimap ----------
  const mini = document.getElementById("mini"), mctx = mini.getContext("2d");
  const B = bounds(), MW = 240, MH = Math.max(46, Math.min(140, MW * (B.y1 - B.y0) / (B.x1 - B.x0)));
  const dpr = window.devicePixelRatio || 1;
  mini.width = MW * dpr; mini.height = MH * dpr; mini.style.width = MW + "px"; mini.style.height = MH + "px";
  const ms = Math.min((MW - 12) / (B.x1 - B.x0), (MH - 12) / (B.y1 - B.y0));
  const mox = (MW - ms * (B.x1 - B.x0)) / 2 - ms * B.x0, moy = (MH - ms * (B.y1 - B.y0)) / 2 - ms * B.y0;
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  function drawMini() {
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0); mctx.clearRect(0, 0, MW, MH);
    const cm = css("--male"), cf = css("--female"), cg = css("--gold"), cu = css("--line");
    for (const p of data.people) {
      const n = pos(p.id);
      mctx.fillStyle = direct.has(p.id) ? cg : p.sex === "M" ? cm : p.sex === "F" ? cf : cu;
      mctx.globalAlpha = p.living ? 0.45 : 0.9;
      mctx.fillRect(mox + ms * (n.x - W / 2), moy + ms * (n.y - H / 2), Math.max(1.5, ms * W * 0.8), Math.max(1.5, ms * H));
    }
    mctx.globalAlpha = 1;
    const vx0 = -T.x / T.k, vy0 = -T.y / T.k, vw = stage.clientWidth / T.k, vh = stage.clientHeight / T.k;
    mctx.strokeStyle = css("--accent-2"); mctx.lineWidth = 1.5;
    mctx.fillStyle = "rgba(47,111,115,.08)";
    const rx = mox + ms * vx0, ry = moy + ms * vy0, rw = ms * vw, rh = ms * vh;
    mctx.fillRect(rx, ry, rw, rh); mctx.strokeRect(rx, ry, rw, rh);
  }
  function miniPan(ev) {
    const r = mini.getBoundingClientRect();
    const x = (ev.clientX - r.left - mox) / ms, y = (ev.clientY - r.top - moy) / ms;
    svg.call(zoom.translateTo, x, y);
  }
  let miniDrag = false;
  mini.addEventListener("pointerdown", e => { miniDrag = true; mini.setPointerCapture(e.pointerId); miniPan(e); });
  mini.addEventListener("pointermove", e => miniDrag && miniPan(e));
  mini.addEventListener("pointerup", () => (miniDrag = false));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", drawMini);

  document.getElementById("fitBtn").onclick = () => fit();
  document.getElementById("zin").onclick = () => svg.transition().duration(250).call(zoom.scaleBy, 1.5);
  document.getElementById("zout").onclick = () => svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.5);
  window.addEventListener("resize", () => { drawGens(); drawMini(); });

  // ---------- tooltip ----------
  const tip = document.getElementById("tip");
  function showTip(ev, p) {
    const bits = [`<b>${esc(fullName(p))}</b>`];
    if (p.living) bits.push(`<span class="muted">Living — details kept private</span>`);
    else {
      const y = years(p); if (y) bits.push(esc(y));
      if (p.bornPlace) bits.push(`<span class="muted">Born ${esc(p.bornPlace)}</span>`);
      if (p.occupation) bits.push(`<span class="muted">${esc(p.occupation)}</span>`);
    }
    tip.innerHTML = bits.join("<br>"); tip.hidden = false;
    const r = stage.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14;
    if (x + tw > r.width - 8) x = ev.clientX - r.left - tw - 14;
    if (y + th > r.height - 8) y = ev.clientY - r.top - th - 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function hideTip() { tip.hidden = true; }
  nodes.on("mousemove", (ev, p) => showTip(ev, p)).on("mouseleave", hideTip)
    .on("click", (ev, p) => { ev.stopPropagation(); select(p.id, false); })
    .on("keydown", (ev, p) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(p.id, true); } });

  // ---------- detail panel ----------
  const panel = document.getElementById("panel"), body = document.getElementById("panelBody");
  function chip(id, extra = "") {
    const p = P.get(id); if (!p) return "";
    const y = years(p);
    return `<button class="chip ${p.sex}" data-id="${esc(id)}">${esc(fullName(p))}${y ? `<small>${esc(y)}</small>` : ""}${extra}</button>`;
  }
  function relationships(p) {
    const parents = [], sibs = new Set(), spouses = [], kids = [];
    for (const fid of p.famc) { const f = F.get(fid); if (!f) continue; [f.father, f.mother].filter(Boolean).forEach(x => parents.push(x)); f.children.forEach(c => c !== p.id && sibs.add(c)); }
    for (const fid of p.fams) {
      const f = F.get(fid); if (!f) continue;
      const other = f.father === p.id ? f.mother : f.father;
      const m = (f.events || []).find(e => e.type === "Marriage");
      spouses.push({ id: other, marr: m });
      f.children.forEach(c => kids.push(c));
    }
    const byBorn = (a, b) => bornOf(a) - bornOf(b);
    let h = `<dl class="rel">`;
    if (parents.length) h += `<dt>Parents</dt><dd>${parents.map(x => chip(x)).join("")}</dd>`;
    for (const s of spouses) {
      const m = s.marr ? `<small>m. ${esc([s.marr.date, (s.marr.place || "").split(",")[0]].filter(Boolean).join(", "))}</small>` : "";
      h += `<dt>Spouse</dt><dd>${s.id ? chip(s.id, m) : `<span class="chip">Unknown${m}</span>`}</dd>`;
    }
    if (kids.length) h += `<dt>Children</dt><dd>${kids.sort(byBorn).map(x => chip(x)).join("")}</dd>`;
    if (sibs.size) h += `<dt>Siblings</dt><dd>${[...sibs].sort(byBorn).map(x => chip(x)).join("")}</dd>`;
    return h + `</dl>`;
  }
  function render(p) {
    let h = `<h2>${esc(fullName(p))}</h2>`;
    const y = years(p);
    if (y && !p.living) h += `<p class="life">${esc(y)}${p.occupation ? " · " + esc(p.occupation) : ""}</p>`;
    const tags = [];
    if (p.id === data.root) tags.push(`<span class="tag gold">Tree root</span>`);
    else if (direct.has(p.id)) tags.push(`<span class="tag gold">Direct ancestor</span>`);
    if (p.living) tags.push(`<span class="tag">Living</span>`);
    (p.altNames || []).forEach(a => tags.push(`<span class="tag">Also: ${esc(a)}</span>`));
    if (tags.length) h += `<div class="tags">${tags.join("")}</div>`;
    if (p.living) h += `<h3>Details</h3><p class="private">This person may still be living, so only their name and family connections are shown.</p>`;
    h += `<h3>Family</h3>` + relationships(p);

    if (!p.living) {
      const evs = p.events || [];
      if (evs.length) {
        h += `<h3>Life events</h3><ul class="events">`;
        for (const e of evs) {
          const what = e.type + (e.role ? ` (${e.role})` : "");
          h += `<li><div><span class="when">${esc(e.date || "Date unknown")}</span> · <span class="what">${esc(what)}</span></div>`;
          if (e.place) h += `<div class="where">${esc(e.place)}</div>`;
          if (e.desc) h += `<div class="where">${esc(e.desc)}</div>`;
          for (const n of e.notes || []) h += `<div class="note">${esc(n)}</div>`;
          h += `</li>`;
        }
        h += `</ul>`;
      }
      if ((p.notes || []).length) h += `<h3>Notes</h3><div class="notes">${p.notes.map(n => `<p>${esc(n)}</p>`).join("")}</div>`;
      const cites = new Map();
      for (const c of [...(p.cites || []), ...evs.flatMap(e => e.cites || [])]) {
        const k = [c.source, c.page, c.link, c.text].join("|"); if (!cites.has(k)) cites.set(k, c);
      }
      if (cites.size) {
        h += `<h3>Sources (${cites.size})</h3><ul class="srcs">`;
        for (const c of cites.values()) {
          h += `<li><div class="st">${esc(c.source || "Source")}</div>`;
          if (c.page) h += `<div class="pg">${esc(c.page)}</div>`;
          if (c.text) h += `<details><summary>Transcription</summary><pre>${esc(c.text)}</pre></details>`;
          if (c.link && /^https?:\/\//.test(c.link)) h += `<a href="${esc(c.link)}" target="_blank" rel="noopener">View record ↗</a>`;
          h += `</li>`;
        }
        h += `</ul>`;
      }
    }
    body.innerHTML = h;
    body.querySelectorAll(".chip[data-id]").forEach(b => b.onclick = () => select(b.dataset.id, true));
    panel.scrollTop = 0;
  }
  function select(id, fly) {
    const p = P.get(id); if (!p) return;
    nodes.classed("sel", d => d.id === id);
    panel.hidden = false; render(p); hideTip();
    if (fly) flyTo(id);
    history.replaceState(null, "", "#" + encodeURIComponent(id));
  }
  function closePanel() { panel.hidden = true; nodes.classed("sel", false); history.replaceState(null, "", location.pathname); }
  document.getElementById("closeBtn").onclick = closePanel;
  svg.on("click", () => { if (!panel.hidden) closePanel(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closePanel(); results.hidden = true; } });

  // ---------- direct line focus ----------
  const lineBtn = document.getElementById("lineBtn");
  lineBtn.onclick = () => {
    const on = lineBtn.getAttribute("aria-pressed") !== "true";
    lineBtn.setAttribute("aria-pressed", on); svg.classed("focus", on);
  };

  // ---------- search ----------
  const q = document.getElementById("q"), results = document.getElementById("results");
  let hits = [], cur = -1;
  function drawResults() {
    results.innerHTML = hits.map((p, i) => `<li role="option" data-id="${esc(p.id)}" aria-selected="${i === cur}"><span>${esc(fullName(p))}</span><small>${esc(years(p))}</small></li>`).join("");
    results.hidden = !hits.length;
    results.querySelectorAll("li").forEach(li => li.onmousedown = e => { e.preventDefault(); pick(li.dataset.id); });
  }
  function pick(id) { results.hidden = true; q.value = fullName(P.get(id)); q.blur(); select(id, true); }
  q.addEventListener("input", () => {
    const s = q.value.trim().toLowerCase(); cur = -1;
    hits = s.length < 2 ? [] : data.people.filter(p => [fullName(p), ...(p.altNames || [])].some(n => n.toLowerCase().includes(s)))
      .sort((a, b) => bornOf(a.id) - bornOf(b.id)).slice(0, 14);
    drawResults();
  });
  q.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { cur = Math.min(cur + 1, hits.length - 1); drawResults(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { cur = Math.max(cur - 1, 0); drawResults(); e.preventDefault(); }
    else if (e.key === "Enter" && hits.length) pick(hits[Math.max(cur, 0)].id);
  });
  q.addEventListener("blur", () => setTimeout(() => (results.hidden = true), 120));

  // ---------- stats + initial view ----------
  const yrs = data.people.map(p => p.born).filter(Boolean);
  document.getElementById("stats").textContent =
    `${data.people.length} people · ${data.families.length} families · ${d3.min(yrs)}–${d3.max(yrs)}`;
  // start readable: fill the height, centred on the tree root; "fit" shows everything
  (function initial() {
    const b = bounds(), w = stage.clientWidth, h = stage.clientHeight;
    const k = Math.max(Math.min((h - 70 - 44) / (b.y1 - b.y0), 0.62), Math.min((w - 60) / (b.x1 - b.x0), 1));
    const r = pos(data.root) || { x: (b.x0 + b.x1) / 2 };
    const cx = Math.min(Math.max(r.x, b.x0 + (w / 2 - 80) / k), b.x1 - (w / 2 - 80) / k);
    const ty = 70 + ((h - 70 - 44) - k * (b.y1 - b.y0)) / 2 - k * b.y0;
    svg.call(zoom.transform, d3.zoomIdentity.translate(w / 2 - k * cx, ty).scale(k));
  })();
  const hashId = decodeURIComponent(location.hash.slice(1));
  if (hashId && P.has(hashId)) setTimeout(() => select(hashId, true), 50);
})();
