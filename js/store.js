// Settings and saved runs, kept in the browser's localStorage. Falls back to memory when storage is blocked.
(function () {
  window.Atlas = window.Atlas || {};
  var mem = {};
  var KEY_SETTINGS = "atlasquiz.settings.v1";
  var KEY_RECORDS = "atlasquiz.records.v1";
  var MAX_RECORDS = 300;

  function read(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      if (raw != null) return JSON.parse(raw);
    } catch (e) { /* storage blocked: fall through to memory */ }
    return key in mem ? JSON.parse(mem[key]) : fallback;
  }
  function write(key, value) {
    var raw = JSON.stringify(value);
    mem[key] = raw;
    try { window.localStorage.setItem(key, raw); } catch (e) { /* kept in memory only */ }
  }
  function remove(key) {
    delete mem[key];
    try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  var DEFAULTS = { timer: "none", minutes: 15, forgiving: true, fly: false };

  var store = {
    settings: function () { return Object.assign({}, DEFAULTS, read(KEY_SETTINGS, {})); },
    saveSettings: function (s) { write(KEY_SETTINGS, s); },
    resetSettings: function () { remove(KEY_SETTINGS); },

    records: function () { return read(KEY_RECORDS, []); },
    addRecord: function (r) {
      var all = store.records();
      all.unshift(r);
      write(KEY_RECORDS, all.slice(0, MAX_RECORDS));
    },
    deleteRecord: function (id) {
      write(KEY_RECORDS, store.records().filter(function (r) { return r.id !== id; }));
    },
    clearRecords: function () { remove(KEY_RECORDS); },
    keepBestOnly: function () {
      var best = {};
      store.records().forEach(function (r) { if (!best[r.quiz] || store.better(r, best[r.quiz])) best[r.quiz] = r; });
      write(KEY_RECORDS, Object.keys(best).map(function (k) { return best[k]; }));
    },
    // More found wins; with equal scores the faster run wins (runs without a clock lose ties).
    better: function (a, b) {
      if (a.found !== b.found) return a.found > b.found;
      var sa = a.secs == null ? Infinity : a.secs, sb = b.secs == null ? Infinity : b.secs;
      return sa < sb;
    },
    best: function (quiz) {
      var best = null;
      store.records().forEach(function (r) { if (r.quiz === quiz && (!best || store.better(r, best))) best = r; });
      return best;
    },
    bytes: function () {
      return JSON.stringify(store.records()).length + JSON.stringify(read(KEY_SETTINGS, {})).length;
    }
  };
  Atlas.store = store;
})();
