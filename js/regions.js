// Projection helpers, quiz definitions and the zoom-map ("region") definitions.
// All coordinates are in map units (see WORLD in shapes.js): x grows east, y grows south.
(function () {
  var W = WORLD.W, H = WORLD.H, S = WORLD.S, X0 = WORLD.X0, Y0 = WORLD.Y0;

  // Natural Earth projection, identical to tools/build_data.py
  function ne(lon, lat) {
    var l = lon * Math.PI / 180, p = lat * Math.PI / 180, p2 = p * p, p4 = p2 * p2;
    return [
      l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))),
      p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)))
    ];
  }
  function proj(lon, lat) {
    var p = ne(lon, lat);
    return [p[0] * S + X0, Y0 - p[1] * S];
  }
  // Longitudes above 180 are allowed, which is how the Pacific is drawn east of the date line.
  function boxLL(lon0, lat0, lon1, lat1) {
    var pts = [proj(lon0, lat0), proj(lon0, lat1), proj(lon1, lat0), proj(lon1, lat1)];
    if ((lat0 < 0 && lat1 > 0) || (lat0 > 0 && lat1 < 0)) pts.push(proj(lon0, 0), proj(lon1, 0));
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    return [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
  }

  var CONTINENTS = {
    af: { name: "Africa", color: "#F2A93B" },
    as: { name: "Asia", color: "#9BC53D" },
    eu: { name: "Europe", color: "#4FA3E0" },
    na: { name: "North America", color: "#2DB8A6" },
    sa: { name: "South America", color: "#E0709A" },
    oc: { name: "Oceania", color: "#8E79D6" }
  };

  var QUIZZES = [
    { id: "world", name: "World", cont: null, box: [0, 6, W, 866], blurb: "All 197 countries" },
    { id: "af", name: "Africa", cont: "af", box: boxLL(-26, 38, 53, -36) },
    { id: "as", name: "Asia", cont: "as", box: boxLL(25, 58, 146, -12) },
    { id: "eu", name: "Europe", cont: "eu", box: boxLL(-26, 72, 58, 33) },
    { id: "na", name: "North America", cont: "na", box: boxLL(-170, 84, -52, 5) },
    { id: "sa", name: "South America", cont: "sa", box: boxLL(-82, 13, -33, -56) },
    { id: "oc", name: "Oceania", cont: "oc", box: boxLL(110, 16, 210, -48) }
  ];

  // Zoom maps. "callouts" gives each tiny country a marker on a leader line: [dx, dy] in map units
  // from the country's anchor point. Add or move entries freely.
  var REGIONS = [
    { id: "europe", name: "Europe", box: boxLL(-12, 53, 32, 34), callouts: {
      AND: [-12, 10], MCO: [-4, 14], SMR: [14, -6], VAT: [-6, 12], LIE: [12, -12], LUX: [-8, -12], MLT: [10, 8] } },
    { id: "caribbean", name: "Caribbean", box: boxLL(-92, 27, -58, 8), callouts: {
      KNA: [-16, -10], ATG: [-22, -1], DMA: [-22, 9], LCA: [-20, 8], VCT: [-12, 14], GRD: [-14, 16], BRB: [14, -8], TTO: [0, 14] } },
    { id: "middleeast", name: "Middle East", box: boxLL(30, 42, 60, 12), callouts: {
      LBN: [-4, -18], PSE: [-16, 10], KWT: [-10, -14], BHR: [-18, 2], QAT: [12, -8] } },
    { id: "indian", name: "Indian Ocean", box: boxLL(40, 12, 76, -22), callouts: {
      COM: [12, -12], SYC: [10, -12], MUS: [12, 10], MDV: [14, 0] } },
    { id: "seasia", name: "South-East Asia", box: boxLL(96, 9, 128, -11), callouts: {
      SGP: [-14, 12], BRN: [14, -10] } },
    { id: "pacific", name: "Pacific", box: boxLL(125, 17, 210, -24), callouts: {
      PLW: [0, -14], FSM: [0, 16], MHL: [0, -16], NRU: [10, -12], TUV: [12, -10], KIR: [10, -16], WSM: [10, -12] } }
  ];

  // Countries drawn a second time, one world-width to the left, so they also show at the map's left edge.
  var WRAP = ["KIR", "TON", "WSM", "FJI", "NZL", "TUV"];

  window.Atlas = window.Atlas || {};
  Atlas.proj = proj;
  Atlas.boxLL = boxLL;
  Atlas.CONTINENTS = CONTINENTS;
  Atlas.QUIZZES = QUIZZES;
  Atlas.REGIONS = REGIONS;
  Atlas.WRAP = WRAP;
})();
