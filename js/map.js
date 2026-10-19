// The map: draws countries from shapes.js, handles zoom and pan, halos, labels and zoom-map markers.
(function () {
  window.Atlas = window.Atlas || {};
  var NS = "http://www.w3.org/2000/svg";
  var W = WORLD.W, H = WORLD.H;
  var proj = Atlas.proj;
  var names = {};
  window.COUNTRIES.forEach(function (c) { names[c[0]] = c[1]; });

  function svgEl(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // Every shape is defined once in a hidden <svg>; each map just <use>s it.
  var defsBuilt = false;
  function buildDefs() {
    if (defsBuilt) return;
    defsBuilt = true;
    var host = svgEl("svg", { width: 0, height: 0, "aria-hidden": "true", style: "position:absolute" });
    var defs = svgEl("defs", null, host);
    var ne = "non-scaling-stroke";
    WORLD.order.forEach(function (id) {
      svgEl("path", { id: "p-" + id, d: WORLD.countries[id].d, "vector-effect": ne }, defs);
    });
    svgEl("path", { id: "p-bg", d: WORLD.bg, "vector-effect": ne }, defs);
    svgEl("path", { id: "p-bgw", d: WORLD.bgw, "vector-effect": ne }, defs);
    var g = "";
    function pt(lon, lat, first) { var p = proj(lon, lat); return (first ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1); }
    var lon, lat, i;
    for (lon = -180; lon <= 360; lon += 30) for (lat = 85, i = 0; lat >= -57; lat -= 5, i++) g += pt(lon, lat, i === 0);
    for (lat = -30; lat <= 60; lat += 30) for (lon = -180, i = 0; lon <= 360; lon += 10, i++) g += pt(lon, lat, i === 0);
    svgEl("path", { id: "p-grid", d: g, "vector-effect": ne }, defs);
    document.body.appendChild(host);
  }

  function intersects(b, box, pad) {
    return !(b[2] < box[0] - pad || b[0] > box[2] + pad || b[3] < box[1] - pad || b[1] > box[3] + pad);
  }

  function MapView(host, opts) {
    buildDefs();
    this.opts = opts || {};
    this.host = host;
    this.svg = svgEl("svg", { "class": "map-svg", preserveAspectRatio: "xMidYMid meet", role: "img", "aria-label": this.opts.label || "Map" }, host);
    this.vb = { x: 0, y: 0, w: W, h: H };
    this.inQuiz = new Set();
    this.found = new Set();
    this.results = false;
    this.flashId = null;
    this.region = this.opts.region || null;
    this.showCallouts = !!this.opts.region && !!this.opts.mini;
    this.uses = {};
    this.lastClass = {};
    this.halos = {};
    this.labels = {};
    this.leaders = {};
    this.callouts = {};
    this.width = 1;
    this.height = 1;
    this.raf = 0;
    this.anim = 0;
    this.build();
    var self = this;
    if (window.ResizeObserver) {
      this.ro = new ResizeObserver(function () { self.onResize(); });
      this.ro.observe(host);
    }
    if (this.opts.interactive) this.bindInput();
    this.onResize();
  }

  MapView.prototype.build = function () {
    var svg = this.svg, self = this;
    var clip = this.opts.clipBox;
    svgEl("rect", { "class": "ocean", x: -700, y: -400, width: W + 1700, height: H + 800 }, svg);
    svgEl("use", { href: "#p-grid", "class": "grid" }, svg);
    svgEl("use", { href: "#p-bg", "class": "bgland" }, svg);
    svgEl("use", { href: "#p-bgw", "class": "bgland" }, svg);
    svgEl("use", { href: "#p-bgw", "class": "bgland", transform: "translate(" + (-W) + " 0)" }, svg);
    WORLD.order.forEach(function (id) {
      var info = WORLD.countries[id];
      if (clip && !intersects(info.b, clip, 40) && !(Atlas.WRAP.indexOf(id) > -1 && intersects([info.b[0] - W, info.b[1], info.b[2] - W, info.b[3]], clip, 40))) return;
      var list = self.uses[id] = [];
      var u = svgEl("use", { href: "#p-" + id, "class": "c", "data-id": id }, svg);
      list.push(u);
      if (Atlas.WRAP.indexOf(id) > -1) list.push(svgEl("use", { href: "#p-" + id, "class": "c", "data-id": id, transform: "translate(" + (-W) + " 0)" }, svg));
    });
    this.haloLayer = svgEl("g", { "class": "halos" }, svg);
    this.leaderLayer = svgEl("g", { "class": "leaders" }, svg);
    this.labelLayer = svgEl("g", { "class": "labels" }, svg);
    this.calloutLayer = svgEl("g", { "class": "callouts" }, svg);
    WORLD.order.forEach(function (id) {
      if (!self.uses[id]) return;
      var b = WORLD.countries[id].b;
      if (Math.max(b[2] - b[0], b[3] - b[1]) < 40) {
        self.halos[id] = svgEl("circle", { "class": "halo", "data-id": id, display: "none" }, self.haloLayer);
      }
      if (self.opts.labels) {
        var t = svgEl("text", { "class": "lbl", "data-id": id, display: "none", "text-anchor": "middle" }, self.labelLayer);
        t.textContent = names[id];
        self.labels[id] = t;
        self.leaders[id] = {
          line: svgEl("line", { "class": "lbl-line", display: "none" }, self.leaderLayer),
          dot: svgEl("circle", { "class": "lbl-dot", display: "none" }, self.leaderLayer)
        };
      }
    });
    if (this.region) {
      Object.keys(this.region.callouts).forEach(function (id) { self.addCallout(id, self.region.callouts[id]); });
    }
  };

  MapView.prototype.addCallout = function (id, off) {
    if (this.callouts[id]) return;
    var c = WORLD.countries[id].c;
    var g = svgEl("g", { "class": "co", "data-id": id, display: "none" }, this.calloutLayer);
    var line = svgEl("line", { "class": "co-line" }, g);
    var dot = svgEl("circle", { "class": "co-dot" }, g);
    var ring = svgEl("circle", { "class": "co-ring", "data-id": id }, g);
    var q = svgEl("text", { "class": "co-q", "text-anchor": "middle" }, g);
    q.textContent = "?";
    var text = svgEl("text", { "class": "co-label" }, g);
    text.textContent = names[id];
    this.callouts[id] = { g: g, line: line, dot: dot, ring: ring, q: q, text: text, ax: c[0], ay: c[1], x: c[0] + off[0], y: c[1] + off[1] };
  };

  MapView.prototype.stateOf = function (id) {
    if (!this.inQuiz.has(id)) return "";
    var f = this.found.has(id);
    if (this.results) return f ? "ok" : "miss";
    return f ? "ok" : "";
  };

  MapView.prototype.setQuiz = function (ids) {
    this.inQuiz = new Set(ids);
    this.lastClass = {};
    this.paint();
  };

  MapView.prototype.setResults = function (on) { this.results = on; this.paint(); };

  MapView.prototype.paint = function () {
    var self = this;
    Object.keys(this.uses).forEach(function (id) {
      var cls = "c";
      if (!self.inQuiz.has(id)) cls += " ctx";
      else {
        var s = self.stateOf(id);
        if (s) cls += " " + s;
      }
      if (self.flashId === id) cls += " flash";
      if (self.lastClass[id] !== cls) {
        self.lastClass[id] = cls;
        self.uses[id].forEach(function (u) { u.setAttribute("class", cls); });
      }
    });
    this.updateOverlays();
  };

  MapView.prototype.flash = function (id) {
    var self = this;
    this.flashId = id;
    this.paint();
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(function () { self.flashId = null; self.paint(); }, 1700);
  };

  MapView.prototype.updateOverlays = function () {
    var vb = this.vb, upp = vb.w / this.width, self = this;
    var mini = !!this.opts.mini;
    var id, s, b, px;
    for (id in this.halos) {
      s = this.stateOf(id);
      var h = this.halos[id];
      b = WORLD.countries[id].b;
      px = Math.max(b[2] - b[0], b[3] - b[1]) / upp;
      var hidden = this.callouts[id] && this.showCallouts;
      // tiny countries not found yet get a visible "still to find" pin
      var pending = !s && !this.results && this.inQuiz.has(id);
      if ((s || pending) && px < 20 && !hidden) {
        var c = WORLD.countries[id].c;
        h.setAttribute("cx", c[0]); h.setAttribute("cy", c[1]);
        h.setAttribute("r", ((pending ? (mini ? 4 : 6) : (mini ? 8 : 12)) * upp).toFixed(3));
        h.setAttribute("class", "halo " + (s || "pending"));
        h.setAttribute("display", "inline");
      } else if (h.getAttribute("display") !== "none") h.setAttribute("display", "none");
    }
    if (this.opts.labels) this.layoutLabels(upp);
    for (id in this.callouts) {
      var co = this.callouts[id];
      if (!this.showCallouts || !this.inQuiz.has(id)) { co.g.setAttribute("display", "none"); continue; }
      s = this.stateOf(id);
      var r = (mini ? 9 : 11) * upp;
      co.g.setAttribute("display", "inline");
      co.g.setAttribute("class", "co " + s);
      co.q.setAttribute("x", co.x); co.q.setAttribute("y", (co.y + r * 0.42).toFixed(3));
      co.q.setAttribute("font-size", (r * 1.25).toFixed(3));
      co.q.setAttribute("display", s ? "none" : "inline");
      co.line.setAttribute("x1", co.ax); co.line.setAttribute("y1", co.ay);
      co.line.setAttribute("x2", co.x); co.line.setAttribute("y2", co.y);
      co.dot.setAttribute("cx", co.ax); co.dot.setAttribute("cy", co.ay); co.dot.setAttribute("r", (2.2 * upp).toFixed(3));
      co.ring.setAttribute("cx", co.x); co.ring.setAttribute("cy", co.y); co.ring.setAttribute("r", r.toFixed(3));
      if (s) {
        var fpx = mini ? 11 : 12.5;
        var right = co.x + r + (names[id].length * fpx * 0.6) * upp > vb.x + vb.w;
        co.text.setAttribute("x", (right ? co.x - r - 4 * upp : co.x + r + 4 * upp).toFixed(3));
        co.text.setAttribute("y", (co.y + 4 * upp).toFixed(3));
        co.text.setAttribute("text-anchor", right ? "end" : "start");
        co.text.setAttribute("font-size", (fpx * upp).toFixed(3));
        co.text.setAttribute("stroke-width", (3.4 * upp).toFixed(3));
        co.text.setAttribute("display", "inline");
      } else co.text.setAttribute("display", "none");
    }
    if (this.opts.onView) this.opts.onView(this);
  };

  // Puts a name on every country that has one to show. Names start centred on their country; when that would
  // overlap a name already placed, the name moves to the nearest free spot and a thin line points back to the country.
  MapView.prototype.layoutLabels = function (upp) {
    var vb = this.vb, VW = this.width, VH = this.height, id, s;
    var items = [];
    for (id in this.labels) {
      s = this.stateOf(id);
      var info = WORLD.countries[id];
      if (!s || (this.callouts[id] && this.showCallouts)) { this.hideLabel(id); continue; }
      var ax = (info.c[0] - vb.x) / upp, ay = (info.c[1] - vb.y) / upp;
      if (ax < -30 || ax > VW + 30 || ay < -15 || ay > VH + 15) { this.hideLabel(id); continue; }
      var b = info.b, size = Math.max(b[2] - b[0], b[3] - b[1]) / upp;
      items.push({ id: id, ax: ax, ay: ay, w: names[id].length * 6.5 + 6, h: 15, tiny: !!this.halos[id] && size < 20, area: info.a });
    }
    items.sort(function (a, b) { return b.area - a.area; });

    var CELL = 64, grid = {}, placed = [], stamp = 0;
    function cells(r, fn) {
      for (var cx = Math.floor((r.x - 2) / CELL); cx <= Math.floor((r.x + r.w + 2) / CELL); cx++)
        for (var cy = Math.floor((r.y - 2) / CELL); cy <= Math.floor((r.y + r.h + 2) / CELL); cy++) fn(cx + "_" + cy);
    }
    function overlap(r) {
      stamp++;
      var total = 0;
      cells(r, function (k) {
        var list = grid[k];
        if (!list) return;
        for (var i = 0; i < list.length; i++) {
          var p = list[i];
          if (p.seen === stamp) continue;
          p.seen = stamp;
          var ox = Math.min(r.x + r.w + 2, p.x + p.w) - Math.max(r.x - 2, p.x);
          var oy = Math.min(r.y + r.h + 2, p.y + p.h) - Math.max(r.y - 2, p.y);
          if (ox > 0 && oy > 0) total += ox * oy;
        }
      });
      return total;
    }

    var self = this;
    items.forEach(function (it) {
      var w = it.w, h = it.h, ax = it.ax, ay = it.ay, cand = [];
      if (!it.tiny) cand.push([ax - w / 2, ay - h / 2, 0]);
      (it.tiny ? [15, 30, 48, 72] : [10, 26, 44, 70, 100]).forEach(function (g) {
        var d = g * 0.7;
        cand.push([ax + g, ay - h / 2, 1], [ax - g - w, ay - h / 2, 1], [ax - w / 2, ay - g - h, 1], [ax - w / 2, ay + g, 1],
          [ax + d, ay - d - h, 1], [ax - d - w, ay - d - h, 1], [ax + d, ay + d, 1], [ax - d - w, ay + d, 1]);
      });
      var best = null, bestScore = Infinity;
      for (var i = 0; i < cand.length && bestScore > 0; i++) {
        var c = cand[i], r = { x: c[0], y: c[1], w: w, h: h };
        var off = (r.x < 2 || r.y < 2 || r.x + w > VW - 2 || r.y + h > VH - 2) ? 400 : 0;
        var score = overlap(r) + off + (c[2] ? 0.5 : 0);
        if (score < bestScore) { bestScore = score; best = { r: r, moved: c[2] }; }
      }
      var rect = best.r;
      cells(rect, function (k) { (grid[k] = grid[k] || []).push(rect); });
      self.showLabel(it, rect, best.moved, upp);
    });
  };

  MapView.prototype.hideLabel = function (id) {
    var t = this.labels[id], l = this.leaders[id];
    if (t.getAttribute("display") !== "none") {
      t.setAttribute("display", "none");
      l.line.setAttribute("display", "none");
      l.dot.setAttribute("display", "none");
    }
  };

  MapView.prototype.showLabel = function (it, rect, moved, upp) {
    var vb = this.vb, t = this.labels[it.id], l = this.leaders[it.id];
    t.setAttribute("x", (vb.x + (rect.x + rect.w / 2) * upp).toFixed(3));
    t.setAttribute("y", (vb.y + (rect.y + 11.5) * upp).toFixed(3));
    t.setAttribute("font-size", (11 * upp).toFixed(3));
    t.setAttribute("stroke-width", (3 * upp).toFixed(3));
    t.setAttribute("display", "inline");
    var px = Math.max(rect.x, Math.min(it.ax, rect.x + rect.w)), py = Math.max(rect.y, Math.min(it.ay, rect.y + rect.h));
    if (moved && Math.hypot(it.ax - px, it.ay - py) > 14) {
      l.line.setAttribute("x1", (vb.x + it.ax * upp).toFixed(3)); l.line.setAttribute("y1", (vb.y + it.ay * upp).toFixed(3));
      l.line.setAttribute("x2", (vb.x + px * upp).toFixed(3)); l.line.setAttribute("y2", (vb.y + py * upp).toFixed(3));
      l.dot.setAttribute("cx", (vb.x + it.ax * upp).toFixed(3)); l.dot.setAttribute("cy", (vb.y + it.ay * upp).toFixed(3));
      l.dot.setAttribute("r", (2.2 * upp).toFixed(3));
      l.line.setAttribute("display", "inline"); l.dot.setAttribute("display", "inline");
    } else {
      l.line.setAttribute("display", "none"); l.dot.setAttribute("display", "none");
    }
  };

  MapView.prototype.scheduleOverlay = function () {
    var self = this;
    if (this.raf) return;
    this.raf = requestAnimationFrame(function () { self.raf = 0; self.updateOverlays(); });
  };

  MapView.prototype.onResize = function () {
    var r = this.host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.width = r.width; this.height = r.height;
    var cx = this.vb.x + this.vb.w / 2, cy = this.vb.y + this.vb.h / 2;
    if (this.pendingBox) {
      var pb = this.pendingBox; this.pendingBox = null;
      this.fitBox(pb.box, pb.pad, false);
      return;
    }
    var w = this.vb.w, h = w * r.height / r.width;
    this.setVB({ x: cx - w / 2, y: cy - h / 2, w: w, h: h });
  };

  MapView.prototype.clamp = function (vb) {
    var aspect = this.width / this.height;
    vb.w = Math.max(10, Math.min(vb.w, (W + 700)));
    vb.h = vb.w / aspect;
    var cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
    cx = Math.max(-100, Math.min(W + 360, cx));
    cy = Math.max(-40, Math.min(H + 40, cy));
    vb.x = cx - vb.w / 2; vb.y = cy - vb.h / 2;
    return vb;
  };

  MapView.prototype.setVB = function (vb) {
    this.vb = this.clamp(vb);
    this.svg.setAttribute("viewBox", [this.vb.x, this.vb.y, this.vb.w, this.vb.h].map(function (n) { return n.toFixed(2); }).join(" "));
    this.scheduleOverlay();
  };

  MapView.prototype.boxToVB = function (box, pad) {
    var aspect = this.width / this.height;
    var bw = (box[2] - box[0]) * (1 + 2 * pad), bh = (box[3] - box[1]) * (1 + 2 * pad);
    var w = Math.max(bw, bh * aspect), h = w / aspect;
    return { x: (box[0] + box[2]) / 2 - w / 2, y: (box[1] + box[3]) / 2 - h / 2, w: w, h: h };
  };

  MapView.prototype.fitBox = function (box, pad, animate) {
    pad = pad == null ? 0.03 : pad;
    this.box = box;
    if (!this.host.clientWidth) { this.pendingBox = { box: box, pad: pad }; return; }
    var target = this.boxToVB(box, pad);
    if (animate) this.flyTo(target, 700); else this.setVB(target);
  };

  MapView.prototype.flyTo = function (target, ms) {
    var self = this, from = { x: this.vb.x + this.vb.w / 2, y: this.vb.y + this.vb.h / 2, w: this.vb.w };
    var to = { x: target.x + target.w / 2, y: target.y + target.h / 2, w: target.w };
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    cancelAnimationFrame(this.anim);
    if (reduce) { this.setVB(target); return; }
    var t0 = performance.now();
    var aspect = this.width / this.height;
    (function step(now) {
      var t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      var w = Math.exp(Math.log(from.w) + (Math.log(to.w) - Math.log(from.w)) * e);
      var cx = from.x + (to.x - from.x) * e, cy = from.y + (to.y - from.y) * e;
      self.setVB({ x: cx - w / 2, y: cy - w / aspect / 2, w: w, h: w / aspect });
      if (t < 1) self.anim = requestAnimationFrame(step);
    })(t0);
  };

  MapView.prototype.zoomToCountry = function (id) {
    var info = WORLD.countries[id];
    if (!info) return;
    var b = info.b;
    var ring = Math.max(b[2] - b[0], b[3] - b[1]);
    var box = ring > 400 ? [info.c[0] - 120, info.c[1] - 80, info.c[0] + 120, info.c[1] + 80] : b.slice();
    var min = 70;
    if (box[2] - box[0] < min) { var cx = (box[0] + box[2]) / 2; box[0] = cx - min / 2; box[2] = cx + min / 2; }
    if (box[3] - box[1] < min * 0.6) { var cy = (box[1] + box[3]) / 2; box[1] = cy - min * 0.3; box[3] = cy + min * 0.3; }
    this.flyTo(this.boxToVB(box, 0.35), 800);
  };

  MapView.prototype.showRegion = function (region) {
    var self = this;
    this.region = region;
    Object.keys(this.callouts).forEach(function (id) { self.callouts[id].g.setAttribute("display", "none"); });
    this.callouts = {};
    this.calloutLayer.textContent = "";
    this.showCallouts = !!region;
    if (region) {
      Object.keys(region.callouts).forEach(function (id) { if (self.uses[id]) self.addCallout(id, region.callouts[id]); });
      this.flyTo(this.boxToVB(region.box, 0.02), 800);
    }
    this.paint();
  };

  MapView.prototype.zoomBy = function (f) {
    var vb = this.vb, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2, w = vb.w * f, h = vb.h * f;
    this.flyTo({ x: cx - w / 2, y: cy - h / 2, w: w, h: h }, 260);
  };

  MapView.prototype.bindInput = function () {
    var self = this, svg = this.svg, pointers = {}, moved = 0, lastDist = 0, tip = this.opts.onHover;
    svg.style.touchAction = "none";
    function rect() { return svg.getBoundingClientRect(); }
    function zoomAt(f, clientX, clientY) {
      var r = rect(), vb = self.vb;
      var fx = (clientX - r.left) / r.width, fy = (clientY - r.top) / r.height;
      var w = Math.max(10, Math.min(W + 700, vb.w * f)), h = w * vb.h / vb.w;
      cancelAnimationFrame(self.anim);
      self.setVB({ x: vb.x + fx * (vb.w - w), y: vb.y + fy * (vb.h - h), w: w, h: h });
    }
    svg.addEventListener("wheel", function (e) {
      e.preventDefault();
      zoomAt(Math.exp(e.deltaY * 0.0016), e.clientX, e.clientY);
    }, { passive: false });
    svg.addEventListener("dblclick", function (e) { zoomAt(0.5, e.clientX, e.clientY); });
    svg.addEventListener("pointerdown", function (e) {
      svg.setPointerCapture(e.pointerId);
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      moved = 0;
      var keys = Object.keys(pointers);
      if (keys.length === 2) {
        var a = pointers[keys[0]], b = pointers[keys[1]];
        lastDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      cancelAnimationFrame(self.anim);
      svg.classList.add("grabbing");
    });
    svg.addEventListener("pointermove", function (e) {
      var p = pointers[e.pointerId];
      if (!p) { if (tip) tip(e, self); return; }
      var keys = Object.keys(pointers), r = rect();
      if (keys.length === 2) {
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        var a = pointers[keys[0]], b = pointers[keys[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastDist) zoomAt(lastDist / d, (a.x + b.x) / 2, (a.y + b.y) / 2);
        lastDist = d;
        moved = 99;
        return;
      }
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      moved += Math.abs(dx) + Math.abs(dy);
      p.x = e.clientX; p.y = e.clientY;
      var vb = self.vb;
      self.setVB({ x: vb.x - dx * vb.w / r.width, y: vb.y - dy * vb.h / r.height, w: vb.w, h: vb.h });
      if (tip) tip(null, self);
    });
    function up(e) {
      delete pointers[e.pointerId];
      lastDist = 0;
      if (!Object.keys(pointers).length) svg.classList.remove("grabbing");
      if (e.type === "pointerup" && moved < 6 && tip) tip(e, self, true);
    }
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", up);
    svg.addEventListener("pointerleave", function () { if (tip) tip(null, self); });
  };

  MapView.prototype.destroy = function () {
    if (this.ro) this.ro.disconnect();
    cancelAnimationFrame(this.raf); cancelAnimationFrame(this.anim);
    clearTimeout(this.flashTimer);
    this.svg.remove();
  };

  Atlas.MapView = MapView;
  Atlas.buildDefs = buildDefs;
})();
