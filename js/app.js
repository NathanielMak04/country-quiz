// Screens and game flow: home, play, results and records.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var S = Atlas.store, Q = Atlas.QUIZZES, R = Atlas.REGIONS, CONT = Atlas.CONTINENTS;
  var MATCH = new Atlas.Matcher(COUNTRIES);
  var NAME = {}, CO = {};
  COUNTRIES.forEach(function (c) { NAME[c[0]] = c[1]; CO[c[0]] = c[2]; });
  var CONT_ORDER = ["af", "as", "eu", "na", "sa", "oc"];
  var NS = "http://www.w3.org/2000/svg";

  var settings = S.settings();
  var game = null, lastGame = null, mainMap = null, resMap = null, minis = [], ticker = 0;

  // ---------- small helpers ----------
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function fmt(secs) {
    secs = Math.max(0, Math.round(secs));
    var m = Math.floor(secs / 60), s = secs % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function entriesFor(q) {
    return COUNTRIES.filter(function (c) { return !q.cont || c[2] === q.cont; }).map(function (c) { return c[0]; });
  }
  var VIEWS = ["home", "play", "results", "records"];
  function show(name) {
    VIEWS.forEach(function (v) { $("view-" + v).hidden = v !== name; });
    $("tooltip").hidden = true;
    window.scrollTo(0, 0);
  }
  function ask(title, text, ok) {
    return new Promise(function (resolve) {
      var dlg = $("dialog");
      $("dlg-title").textContent = title;
      $("dlg-text").textContent = text;
      $("dlg-ok").textContent = ok || "OK";
      dlg.returnValue = "cancel";
      function done() { dlg.removeEventListener("close", done); resolve(dlg.returnValue === "ok"); }
      dlg.addEventListener("close", done);
      dlg.showModal();
    });
  }
  function boxFor(ids) {
    var conts = {};
    ids.forEach(function (id) { conts[CO[id]] = 1; });
    var keys = Object.keys(conts);
    if (keys.length === 1) return Q.filter(function (q) { return q.cont === keys[0]; })[0].box;
    return Q[0].box;
  }
  function svgEl(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // ---------- home ----------
  function thumb(q) {
    Atlas.buildDefs();
    var pad = 0.05, b = q.box;
    var w = (b[2] - b[0]) * (1 + 2 * pad), hh = (b[3] - b[1]) * (1 + 2 * pad);
    var svg = svgEl("svg", { "class": "thumb-svg", viewBox: [b[0] - (b[2] - b[0]) * pad, b[1] - (b[3] - b[1]) * pad, w, hh].join(" "), "aria-hidden": "true", preserveAspectRatio: "xMidYMid meet" });
    WORLD.order.forEach(function (id) {
      var i = WORLD.countries[id].b;
      if (i[2] < b[0] - 20 || i[0] > b[2] + 20 || i[3] < b[1] - 20 || i[1] > b[3] + 20) return;
      var inQ = !q.cont || CO[id] === q.cont;
      var color = inQ ? CONT[CO[id]].color : "#E3EAF0";
      svgEl("use", { href: "#p-" + id, "class": "thumb-c", style: "fill:" + color }, svg);
    });
    return svg;
  }

  function renderHome() {
    settings = S.settings();
    Array.prototype.forEach.call($("timer-seg").children, function (b) {
      b.setAttribute("aria-checked", String(b.getAttribute("data-timer") === settings.timer));
    });
    $("minutes").value = String(settings.minutes);
    $("minutes-wrap").hidden = settings.timer !== "down";
    $("forgiving").checked = !!settings.forgiving;
    $("fly").checked = !!settings.fly;

    var grid = $("quiz-grid");
    clear(grid);
    Q.forEach(function (q) {
      var ids = entriesFor(q);
      var best = S.best(q.id);
      var bestText = best ? "Best " + best.found + " / " + best.total + (best.secs != null ? " · " + fmt(best.secs) : "") : "Not played yet";
      var card = h("button", { "class": "qcard" + (q.cont ? "" : " world"), type: "button", "data-quiz": q.id }, [
        h("div", { "class": "qthumb" }),
        h("div", { "class": "qmeta" }, [
          h("h3", { text: q.name === "World" ? "The whole world" : q.name }),
          h("span", { "class": "muted", text: ids.length + " countries" }),
          h("span", { "class": "qbest", text: bestText }),
          h("span", { "class": "qplay", text: "Play" })
        ])
      ]);
      card.firstChild.appendChild(thumb(q));
      grid.appendChild(card);
    });
  }

  // ---------- starting a game ----------
  function startGame(q, override) {
    settings = S.settings();
    var ids = override ? override.ids : entriesFor(q);
    game = {
      quiz: q, ids: ids, entries: new Set(ids), found: new Set(), order: [],
      elapsed: 0, last: performance.now(), paused: false, ended: false,
      mode: settings.timer, limit: settings.minutes * 60, forgiving: settings.forgiving, fly: settings.fly,
      replay: !!override, region: null, box: override ? q.box : q.box
    };
    show("play");
    $("play-title").textContent = override ? "Missed countries" : (q.name === "World" ? "World countries" : q.name);
    $("count-total").textContent = "/ " + ids.length;
    $("btn-pause").textContent = "Pause";
    $("paused").hidden = true;
    var input = $("answer");
    input.disabled = false; input.value = ""; input.className = "";
    $("feedback").textContent = ""; $("feedback").className = "feedback";
    $("region-back").hidden = true; $("region-name").hidden = true;
    $("side-progress").hidden = !!(override || q.cont);
    clear($("found-list"));

    if (mainMap) mainMap.destroy();
    mainMap = new Atlas.MapView($("map"), { interactive: true, labels: true, onHover: hoverTip, label: "Quiz map" });
    mainMap.found = game.found;
    mainMap.setQuiz(ids);
    mainMap.fitBox(q.box, 0.03, false);

    buildInsets();
    buildBars();
    renderClock();
    updateUI();
    clearInterval(ticker);
    ticker = setInterval(tick, 250);
    input.focus();
  }

  function buildInsets() {
    minis.forEach(function (m) { m.destroy(); });
    minis = [];
    var host = $("insets");
    clear(host);
    var list = R.filter(function (r) { return Object.keys(r.callouts).some(function (id) { return game.entries.has(id); }); });
    $("insets-section").hidden = !list.length;
    list.forEach(function (r) {
      var b = r.box;
      var map = h("div", { "class": "inset-map", style: "aspect-ratio:" + ((b[2] - b[0]) / (b[3] - b[1])).toFixed(3) });
      var tally = h("span", { "class": "tally" });
      var card = h("button", { "class": "inset", type: "button", "data-region": r.id, "aria-label": "Open the " + r.name + " zoom map" }, [
        map, h("div", { "class": "inset-meta" }, [h("b", { text: r.name }), tally])
      ]);
      host.appendChild(card);
      var mv = new Atlas.MapView(map, { mini: true, region: r, clipBox: b, label: r.name + " zoom map" });
      mv.found = game.found;
      mv.setQuiz(game.ids);
      mv.fitBox(b, 0, false);
      mv.region = r; mv.tallyEl = tally;
      minis.push(mv);
    });
  }

  function buildBars() {
    var bars = $("bars");
    clear(bars);
    if (game.replay || game.quiz.cont) return;
    CONT_ORDER.forEach(function (k) {
      var fill = h("div", { "class": "bar-fill", style: "background:" + CONT[k].color + ";width:0" });
      var count = h("span", { "class": "muted", text: "0" });
      bars.appendChild(h("div", { "class": "bar", "data-cont": k }, [
        h("div", { "class": "bar-head" }, [h("span", { text: CONT[k].name }), count]),
        h("div", { "class": "bar-track" }, [fill])
      ]));
    });
  }

  function paintAll() {
    if (mainMap) mainMap.paint();
    minis.forEach(function (m) { m.paint(); });
  }

  function updateUI() {
    var n = game.found.size, total = game.ids.length;
    $("count-found").textContent = n;
    Array.prototype.forEach.call($("bars").children, function (row) {
      var k = row.getAttribute("data-cont");
      var all = game.ids.filter(function (id) { return CO[id] === k; });
      var got = all.filter(function (id) { return game.found.has(id); }).length;
      row.querySelector(".bar-fill").style.width = Math.round(100 * got / all.length) + "%";
      row.querySelector(".muted").textContent = got + " / " + all.length;
    });
    minis.forEach(function (m) {
      var ids = Object.keys(m.region.callouts).filter(function (id) { return game.entries.has(id); });
      var got = ids.filter(function (id) { return game.found.has(id); }).length;
      m.tallyEl.textContent = got === ids.length ? "All found ✓" : (ids.length - got) + " left";
      m.tallyEl.classList.toggle("done", got === ids.length);
    });
    $("found-title").textContent = "Found so far (" + n + ")";
  }

  function addFoundRow(id) {
    var li = h("li", null, [h("button", { "class": "found-item", type: "button", "data-id": id }, [
      h("i", { "class": "dot", style: "background:" + CONT[CO[id]].color }),
      h("span", { text: NAME[id] }),
      h("small", { text: CONT[CO[id]].name })
    ])]);
    var list = $("found-list");
    list.insertBefore(li, list.firstChild);
  }

  // ---------- clock ----------
  function renderClock() {
    var el = $("clock");
    el.hidden = game.mode === "none";
    if (game.mode === "none") return;
    var secs = game.mode === "down" ? game.limit - game.elapsed : game.elapsed;
    $("clock-text").textContent = fmt(game.mode === "down" ? Math.ceil(secs) : secs);
    el.classList.toggle("low", game.mode === "down" && secs <= 30);
  }
  function tick() {
    if (!game || game.ended || game.paused) return;
    var now = performance.now();
    game.elapsed += (now - game.last) / 1000;
    game.last = now;
    renderClock();
    if (game.mode === "down" && game.elapsed >= game.limit) { game.elapsed = game.limit; endGame("time"); }
  }
  function setPaused(p) {
    if (!game || game.ended || p === game.paused) return;
    tick();
    game.paused = p;
    game.last = performance.now();
    $("paused").hidden = !p;
    $("btn-pause").textContent = p ? "Resume" : "Pause";
    $("answer").disabled = p;
    if (!p) $("answer").focus();
  }

  // ---------- answering ----------
  function say(kind, text, ms) {
    var f = $("feedback");
    f.className = "feedback " + kind;
    f.textContent = text;
    void f.offsetWidth;
    f.classList.add("pop");
    clearTimeout(game.fbTimer);
    if (ms) game.fbTimer = setTimeout(function () { f.textContent = ""; f.className = "feedback"; }, ms);
  }
  function clearInput() {
    var input = $("answer");
    input.value = ""; input.classList.remove("nomatch", "shake");
    clearTimeout(game.idleTimer);
  }

  function accept(id) {
    game.found.add(id);
    game.order.unshift(id);
    clearInput();
    say("ok", "✓ " + NAME[id], 2400);
    addFoundRow(id);
    mainMap.flash(id);
    minis.forEach(function (m) { m.flash(id); });
    paintAll();
    updateUI();
    if (game.fly && !game.region) mainMap.zoomToCountry(id);
    if (game.found.size === game.ids.length) setTimeout(function () { if (game && !game.ended) endGame("complete"); }, 1100);
  }

  function resolve(id) {
    if (!game.entries.has(id)) {
      clearInput();
      say("info", NAME[id] + " isn't part of this quiz.", 3000);
      return true;
    }
    if (game.found.has(id)) {
      clearInput();
      say("info", "You already found " + NAME[id] + ".", 2600);
      mainMap.flash(id);
      return true;
    }
    accept(id);
    return true;
  }

  // lenient = the player paused typing or pressed Enter, so settle for typos and "Niger" vs "Nigeria" waits.
  function evaluate(n, lenient) {
    var id = MATCH.lookup(n);
    if (id) {
      if (!lenient && MATCH.hasLongerAnswer(n, id)) return false;
      return resolve(id);
    }
    if (lenient && game.forgiving && !MATCH.isPrefix(n)) {
      var f = MATCH.fuzzy(n);
      if (f) return resolve(f);
    }
    return false;
  }

  function onInput() {
    if (!game || game.ended) return;
    var input = $("answer"), n = Atlas.norm(input.value);
    clearTimeout(game.idleTimer);
    input.classList.remove("shake");
    input.classList.toggle("nomatch", !!n && !MATCH.isPrefix(n) && !(game.forgiving && MATCH.fuzzy(n)));
    if (!n) return;
    if (window.AMBIGUOUS[n]) { say("info", window.AMBIGUOUS[n], 5000); return; }
    if (evaluate(n, false)) return;
    game.idleTimer = setTimeout(function () { if (game && !game.ended && Atlas.norm(input.value) === n) evaluate(n, true); }, 700);
  }

  function onEnter() {
    var input = $("answer"), raw = input.value.trim(), n = Atlas.norm(raw);
    if (!n) return;
    if (window.AMBIGUOUS[n]) { say("info", window.AMBIGUOUS[n], 5000); return; }
    if (evaluate(n, true)) return;
    input.classList.remove("shake");
    void input.offsetWidth;
    input.classList.add("shake");
    var near = !game.forgiving ? MATCH.fuzzy(n) : null;
    say("error", near ? "Not quite. Did you mean " + NAME[near] + "?" : "No country called “" + raw + "”.", 3500);
  }

  // ---------- zoom maps ----------
  function openRegion(r) {
    game.region = r;
    mainMap.showRegion(r);
    $("region-back").hidden = false;
    $("region-name").textContent = r.name + " zoom";
    $("region-name").hidden = false;
    $("map").scrollIntoView({ behavior: "smooth", block: "center" });
    $("answer").focus({ preventScroll: true });
  }
  function leaveRegion() {
    game.region = null;
    mainMap.showRegion(null);
    mainMap.fitBox(game.quiz.box, 0.03, true);
    $("region-back").hidden = true;
    $("region-name").hidden = true;
  }

  // ---------- tooltip ----------
  function hoverTip(e, view) {
    var tip = $("tooltip");
    if (!e) { tip.hidden = true; return; }
    var node = e.target && e.target.closest ? e.target.closest("[data-id]") : null;
    var id = node && node.getAttribute("data-id");
    var st = id && view.stateOf(id);
    if (!st) { tip.hidden = true; return; }
    tip.textContent = NAME[id];
    tip.className = st;
    tip.hidden = false;
    var x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + "px";
    tip.style.top = (e.clientY + 18) + "px";
  }

  // ---------- results ----------
  function endGame(reason) {
    if (!game || game.ended) return;
    tick();
    game.ended = true;
    clearInterval(ticker);
    var found = game.found.size, total = game.ids.length;
    var secs = game.mode === "none" ? null : Math.round(game.elapsed);
    game.secs = secs;
    if (!game.replay) {
      S.addRecord({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        quiz: game.quiz.id, at: new Date().toISOString(), found: found, total: total,
        secs: secs, timer: game.mode, done: found === total
      });
    }
    lastGame = game;
    showResults(reason);
  }

  function pill(label, value, cls) {
    return h("div", { "class": "pill big " + (cls || "") }, [h("b", { text: value }), h("span", { text: label })]);
  }

  function showResults(reason) {
    var g = lastGame, found = g.found.size, total = g.ids.length, frac = total ? found / total : 0;
    show("results");
    var title = reason === "time" ? "Time's up!" : found === total ? "Perfect!" : frac >= 0.8 ? "Well done!" : frac >= 0.5 ? "Nice work!" : reason === "giveup" ? "Round over" : "Good start!";
    $("res-title").textContent = title;
    $("res-sub").textContent = (g.replay ? "Missed countries" : (g.quiz.name === "World" ? "World" : g.quiz.name)) + ": you named " + found + " of " + total + (reason === "time" ? " before the clock ran out." : ".");
    var pills = $("res-pills");
    clear(pills);
    pills.appendChild(pill("named", found + " / " + total, "good"));
    if (g.secs != null) pills.appendChild(pill(g.mode === "down" ? "of " + fmt(g.limit) : "time", fmt(g.secs)));
    pills.appendChild(pill("missed", String(total - found), total - found ? "bad" : ""));

    if (resMap) resMap.destroy();
    resMap = new Atlas.MapView($("res-map"), { interactive: true, labels: true, onHover: hoverTip, label: "Results map" });
    resMap.found = g.found;
    resMap.setQuiz(g.ids);
    resMap.setResults(true);
    resMap.fitBox(g.quiz.box, 0.03, false);

    var groups = $("res-groups");
    clear(groups);
    var conts = g.quiz.cont ? [g.quiz.cont] : CONT_ORDER;
    conts.forEach(function (k) {
      var ids = g.ids.filter(function (id) { return CO[id] === k; }).sort(function (a, b) { return NAME[a].localeCompare(NAME[b]); });
      if (!ids.length) return;
      var got = ids.filter(function (id) { return g.found.has(id); }).length;
      var ul = h("ul", { "class": "chips" });
      ids.forEach(function (id) {
        var ok = g.found.has(id);
        ul.appendChild(h("li", { "data-state": ok ? "ok" : "miss" }, [
          h("button", { "class": "chip " + (ok ? "ok" : "miss"), type: "button", "data-id": id }, [
            h("span", { "class": "mark", "aria-hidden": "true", text: ok ? "✓" : "✗" }),
            h("span", { text: NAME[id] }),
            h("span", { "class": "sr-only", text: ok ? " (got it)" : " (missed)" })
          ])
        ]));
      });
      groups.appendChild(h("section", { "class": "group card" }, [
        h("div", { "class": "group-head" }, [
          h("i", { "class": "dot", style: "background:" + CONT[k].color }),
          h("h3", { text: CONT[k].name }),
          h("span", { "class": "muted", text: got + " / " + ids.length })
        ]), ul
      ]));
    });
    applyFilter("all");
    $("btn-missed").disabled = found === total;
  }

  function applyFilter(f) {
    Array.prototype.forEach.call($("res-tabs").children, function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-filter") === f)); });
    Array.prototype.forEach.call($("res-groups").querySelectorAll("li"), function (li) {
      li.hidden = f !== "all" && li.getAttribute("data-state") !== f;
    });
    Array.prototype.forEach.call($("res-groups").querySelectorAll(".group"), function (sec) {
      sec.hidden = !sec.querySelector("li:not([hidden])");
    });
  }

  // ---------- records ----------
  function renderRecords() {
    var recs = S.records();
    $("rec-summary").textContent = recs.length + (recs.length === 1 ? " saved run" : " saved runs") + ", using " + (S.bytes() / 1024).toFixed(1) + " KB of this browser's storage. Nothing is ever uploaded.";
    var card = $("rec-card");
    clear(card);
    ["rec-best", "rec-clear"].forEach(function (id) { $(id).disabled = !recs.length; });
    if (!recs.length) { card.appendChild(h("p", { "class": "muted pad", text: "No runs saved yet. Finish a quiz and it shows up here." })); return; }
    var names = {};
    Q.forEach(function (q) { names[q.id] = q.name; });
    var table = h("table", { "class": "rec-table" });
    var headRow = h("tr");
    ["Quiz", "When", "Score", "Time"].forEach(function (t) { headRow.appendChild(h("th", { text: t })); });
    headRow.appendChild(h("th", null, [h("span", { "class": "sr-only", text: "Delete" })]));
    table.appendChild(h("thead", null, [headRow]));
    var body = h("tbody");
    recs.forEach(function (r) {
      var best = S.best(r.quiz);
      var when = new Date(r.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
      var tr = h("tr", best && best.id === r.id ? { "class": "best" } : null, [
        h("td", { text: names[r.quiz] || r.quiz }),
        h("td", { text: when }),
        h("td", { text: r.found + " / " + r.total + (best && best.id === r.id ? "  ★" : "") }),
        h("td", { text: r.secs == null ? "–" : fmt(r.secs) }),
        h("td", null, [h("button", { "class": "pillbtn danger tiny", type: "button", "data-del": r.id, text: "Delete", "aria-label": "Delete this run" })])
      ]);
      body.appendChild(tr);
    });
    table.appendChild(body);
    card.appendChild(table);
  }

  // ---------- wiring ----------
  function goHome() { show("home"); renderHome(); }

  $("quiz-grid").addEventListener("click", function (e) {
    var card = e.target.closest(".qcard");
    if (card) startGame(Q.filter(function (q) { return q.id === card.getAttribute("data-quiz"); })[0]);
  });
  $("timer-seg").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    settings.timer = b.getAttribute("data-timer");
    S.saveSettings(settings); renderHome();
  });
  $("minutes").addEventListener("change", function () { settings.minutes = +$("minutes").value; S.saveSettings(settings); });
  $("forgiving").addEventListener("change", function () { settings.forgiving = $("forgiving").checked; S.saveSettings(settings); });
  $("fly").addEventListener("change", function () { settings.fly = $("fly").checked; S.saveSettings(settings); });
  $("open-records").addEventListener("click", function () { renderRecords(); show("records"); });
  $("rec-back").addEventListener("click", goHome);
  $("res-back").addEventListener("click", goHome);
  $("btn-home").addEventListener("click", goHome);

  $("play-back").addEventListener("click", function () {
    if (!game || game.ended) { goHome(); return; }
    var leave = function () { clearInterval(ticker); game.ended = true; goHome(); };
    if (!game.found.size) { leave(); return; }
    setPaused(true);
    ask("Leave this quiz?", "This run won't be saved. You have found " + game.found.size + " of " + game.ids.length + ".", "Leave").then(function (ok) {
      if (ok) leave(); else setPaused(false);
    });
  });
  $("btn-giveup").addEventListener("click", function () {
    if (!game || game.ended) return;
    setPaused(true);
    ask("Give up?", "You'll see every country you got and missed. This run is saved.", "Show my results").then(function (ok) {
      if (ok) { game.paused = false; game.last = performance.now(); endGame("giveup"); } else setPaused(false);
    });
  });
  $("btn-pause").addEventListener("click", function () { setPaused(!game.paused); });
  $("btn-resume").addEventListener("click", function () { setPaused(false); });

  var input = $("answer");
  input.addEventListener("input", onInput);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); onEnter(); }
    else if (e.key === "Escape") { clearInput(); $("feedback").textContent = ""; }
  });

  $("zoom-in").addEventListener("click", function () { mainMap.zoomBy(0.6); });
  $("zoom-out").addEventListener("click", function () { mainMap.zoomBy(1 / 0.6); });
  $("zoom-fit").addEventListener("click", leaveRegion);
  $("region-back").addEventListener("click", leaveRegion);
  $("res-zoom-in").addEventListener("click", function () { resMap.zoomBy(0.6); });
  $("res-zoom-out").addEventListener("click", function () { resMap.zoomBy(1 / 0.6); });
  $("res-zoom-fit").addEventListener("click", function () { resMap.showRegion(null); resMap.fitBox(lastGame.quiz.box, 0.03, true); });

  $("insets").addEventListener("click", function (e) {
    var card = e.target.closest(".inset");
    if (!card || !game || game.ended) return;
    openRegion(R.filter(function (r) { return r.id === card.getAttribute("data-region"); })[0]);
  });
  $("found-list").addEventListener("click", function (e) {
    var b = e.target.closest(".found-item");
    if (b && mainMap) { mainMap.zoomToCountry(b.getAttribute("data-id")); mainMap.flash(b.getAttribute("data-id")); $("map").scrollIntoView({ behavior: "smooth", block: "center" }); }
  });
  $("res-groups").addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    var id = b.getAttribute("data-id");
    resMap.showRegion(null);
    resMap.zoomToCountry(id);
    resMap.flash(id);
    $("res-map").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  $("res-tabs").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (b) applyFilter(b.getAttribute("data-filter"));
  });
  $("btn-again").addEventListener("click", function () {
    startGame(lastGame.quiz, lastGame.replay ? { ids: lastGame.ids } : null);
  });
  $("btn-missed").addEventListener("click", function () {
    var missed = lastGame.ids.filter(function (id) { return !lastGame.found.has(id); });
    if (!missed.length) return;
    startGame({ id: "missed", name: "Missed countries", cont: null, box: boxFor(missed) }, { ids: missed });
  });

  $("rec-card").addEventListener("click", function (e) {
    var b = e.target.closest("[data-del]");
    if (b) { S.deleteRecord(b.getAttribute("data-del")); renderRecords(); }
  });
  $("rec-best").addEventListener("click", function () {
    ask("Keep only your best runs?", "Every run except your best one for each quiz will be deleted.", "Delete the rest").then(function (ok) { if (ok) { S.keepBestOnly(); renderRecords(); } });
  });
  $("rec-clear").addEventListener("click", function () {
    ask("Delete all records?", "This removes every saved run from this browser. It can't be undone.", "Delete all").then(function (ok) { if (ok) { S.clearRecords(); renderRecords(); } });
  });
  $("rec-settings").addEventListener("click", function () { S.resetSettings(); settings = S.settings(); renderRecords(); });

  renderHome();
  show("home");

  // When the game is served from a website, keep a copy on the device so it also works offline.
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
})();
