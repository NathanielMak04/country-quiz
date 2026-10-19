// Turns what the player types into a country id.
(function () {
  window.Atlas = window.Atlas || {};

  // Lower-case, no accents, no punctuation, "&" = "and", "St" = "Saint", no leading "the".
  function norm(s) {
    return String(s)
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ")
      .replace(/['’`.]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/^the /, "")
      .replace(/\bst\b/g, "saint");
  }

  // True when a and b are the same, or differ by one insert, delete, substitution or adjacent swap.
  function withinOne(a, b) {
    if (a === b) return true;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    var i = 0;
    while (i < la && i < lb && a[i] === b[i]) i++;
    if (la === lb) {
      if (a.slice(i + 1) === b.slice(i + 1)) return true;
      return i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
    }
    return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
  }

  function Matcher(countries) {
    this.names = {};        // id -> display name
    this.aliases = [];      // [normalised alias, id]
    this.exact = {};        // normalised alias -> id
    var self = this;
    countries.forEach(function (c) {
      self.names[c[0]] = c[1];
      [c[1]].concat(c[3]).forEach(function (a) {
        var n = norm(a);
        if (self.exact[n] && self.exact[n] !== c[0]) console.warn("Duplicate answer:", a, c[0], self.exact[n]);
        self.exact[n] = c[0];
        self.aliases.push([n, c[0]]);
      });
    });
  }

  Matcher.prototype.lookup = function (n) { return this.exact[n] || null; };

  // Could "n" still turn into a longer answer for a different country? (Niger -> Nigeria)
  Matcher.prototype.hasLongerAnswer = function (n, id) {
    return this.aliases.some(function (p) { return p[1] !== id && p[0].length > n.length && p[0].indexOf(n) === 0; });
  };

  // Is "n" the start of any answer at all? Used to flag typos while typing.
  Matcher.prototype.isPrefix = function (n) {
    return this.aliases.some(function (p) { return p[0].indexOf(n) === 0; });
  };

  // One country whose answer is within one typo of "n", or null when none or several.
  Matcher.prototype.fuzzy = function (n) {
    if (n.length < 6) return null;
    var hit = null;
    for (var i = 0; i < this.aliases.length; i++) {
      var p = this.aliases[i];
      if (p[0].length >= 6 && withinOne(n, p[0])) {
        if (hit && hit !== p[1]) return null;
        hit = p[1];
      }
    }
    return hit;
  };

  Atlas.norm = norm;
  Atlas.Matcher = Matcher;
})();
