/* KARATE RHYTHM — parallax background, Karateka-styled.
 *
 * Layers, slowest to fastest: a hazy pink dusk sky with a soft horizon glow,
 * three jagged indigo mountain ranges, Akuma's palace nestled in the ridges,
 * then the dark courtyard ground. Mountains are drawn as straight lines between
 * deterministically-placed peaks so the skyline is angular (as on the Apple II)
 * and tiles forever as it scrolls.
 *
 * Also exposes torii(), the vermilion gate the runner passes through between
 * levels.
 */
window.KR = window.KR || {};
KR.bg = (function () {
  "use strict";

  var WIDTH = 280, HEIGHT = 192, GROUND_Y = 150;
  var WATER_Y = GROUND_Y + 14;   // river surface sits just below the bridge deck

  function hash(n, seed) {
    var x = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function sky(ctx) {
    var g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0.00, "#352a5e");  // muted indigo
    g.addColorStop(0.38, "#7a4a74");  // mauve
    g.addColorStop(0.68, "#c4684f");  // rose
    g.addColorStop(0.86, "#df9560");  // peach
    g.addColorStop(1.00, "#e8b27c");  // pale horizon
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, GROUND_Y);

    // soft hazy glow where the sun has set, low and centred
    var gl = ctx.createRadialGradient(132, 152, 8, 132, 152, 120);
    gl.addColorStop(0, "rgba(255,214,150,0.40)");
    gl.addColorStop(1, "rgba(255,214,150,0)");
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, WIDTH, GROUND_Y);
  }

  // Angular ridge: straight lines between peaks placed every `spacing` world px.
  function ridge(ctx, scroll, parallax, baseY, amp, spacing, color, seed) {
    var off = scroll * parallax;
    var first = Math.floor(off / spacing) - 1;
    var last = Math.ceil((off + WIDTH) / spacing) + 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-spacing, GROUND_Y);
    for (var pi = first; pi <= last; pi++) {
      var sx = pi * spacing - off;
      var h = hash(pi, seed) * 0.7 + hash(pi * 3 + 7, seed) * 0.3; // jagged
      var y = baseY - h * amp;
      ctx.lineTo(Math.round(sx), Math.round(y));
    }
    ctx.lineTo(WIDTH + spacing, GROUND_Y);
    ctx.closePath();
    ctx.fill();
  }

  // ---- Akuma's palace silhouette (a tiered pagoda-fortress) -------------
  function eave(ctx, cx, y, half, c) {
    ctx.fillStyle = c;
    for (var i = 0; i < 3; i++) ctx.fillRect(cx - half + i, y - i, (half - i) * 2, 1);
    ctx.fillRect(cx - half - 1, y, 2, 1);
    ctx.fillRect(cx + half - 1, y, 2, 1);
  }

  function fortress(ctx, cx, baseY) {
    var c = "#1c1530";
    ctx.fillStyle = c;
    // walls
    ctx.fillRect(cx - 16, baseY - 12, 32, 12);
    // body
    ctx.fillRect(cx - 9, baseY - 26, 18, 14);
    eave(ctx, cx, baseY - 26, 16, c);
    ctx.fillRect(cx - 7, baseY - 34, 14, 8);
    eave(ctx, cx, baseY - 34, 12, c);
    ctx.fillRect(cx - 5, baseY - 41, 10, 7);
    eave(ctx, cx, baseY - 41, 9, c);
    ctx.fillRect(cx - 1, baseY - 46, 2, 5); // spire
  }

  function palace(ctx, scroll) {
    var period = 820;
    var base = WIDTH * 0.66 - (scroll * 0.16) % period;
    for (var i = -1; i <= 1; i++) fortress(ctx, Math.round(base + i * period), 122);
  }

  // ---- Japan-inspired scenery -----------------------------------------
  function blob(ctx, x, y, rw, rh, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function mountFuji(ctx, cx, baseY) {
    var body = "#2c2348", snow = "#5b5070", lit = "#9a7a92";
    var peakY = baseY - 58, hb = 72, bend = peakY + 20;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(cx - hb, baseY);
    ctx.lineTo(cx - 20, bend);
    ctx.lineTo(cx - 11, peakY);
    ctx.lineTo(cx + 11, peakY);
    ctx.lineTo(cx + 20, bend);
    ctx.lineTo(cx + hb, baseY);
    ctx.closePath(); ctx.fill();
    // jagged snow cap
    ctx.fillStyle = snow;
    ctx.beginPath();
    ctx.moveTo(cx - 16, peakY + 16);
    ctx.lineTo(cx - 11, peakY);
    ctx.lineTo(cx - 3, peakY + 5);
    ctx.lineTo(cx + 2, peakY + 1);
    ctx.lineTo(cx + 11, peakY);
    ctx.lineTo(cx + 16, peakY + 16);
    ctx.lineTo(cx + 9, peakY + 11);
    ctx.lineTo(cx + 2, peakY + 16);
    ctx.lineTo(cx - 5, peakY + 12);
    ctx.lineTo(cx - 10, peakY + 16);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = lit;
    ctx.fillRect(cx - 10, peakY + 1, 7, 2);
  }

  function fujiLayer(ctx, scroll) {
    var period = 940;
    var base = WIDTH * 0.42 - (scroll * 0.12) % period;
    for (var i = -1; i <= 1; i++) mountFuji(ctx, Math.round(base + i * period), 124);
  }

  function pineTree(ctx, cx, baseY, s) {
    var H = Math.round(26 * s);
    var trunk = "#231a2e", fol = "#1f3a30", folLit = "#315442";
    ctx.fillStyle = trunk;
    ctx.fillRect(cx - 1, baseY - Math.round(H * 0.5), 2, Math.round(H * 0.5));
    blob(ctx, cx - 1, baseY - H * 0.55, 11 * s, 4 * s, fol);
    blob(ctx, cx, baseY - H * 0.78, 8.5 * s, 3.5 * s, fol);
    blob(ctx, cx + 1, baseY - H, 6 * s, 3 * s, fol);
    blob(ctx, cx - 2, baseY - H * 0.58, 7 * s, 1.6 * s, folLit);
    blob(ctx, cx + 1, baseY - H - 0.5, 3.5 * s, 1.2 * s, folLit);
  }

  function sakuraTree(ctx, cx, baseY, s) {
    var H = Math.round(24 * s);
    var trunk = "#2a2030", b0 = "#8a4f66", b1 = "#b56b86", b2 = "#d49ab0";
    ctx.fillStyle = trunk;
    ctx.fillRect(cx - 1, baseY - Math.round(H * 0.6), 2, Math.round(H * 0.6));
    ctx.fillRect(cx - 4, baseY - Math.round(H * 0.75), 3, 2);
    ctx.fillRect(cx + 2, baseY - Math.round(H * 0.8), 3, 2);
    blob(ctx, cx - 5 * s, baseY - H * 0.8, 6 * s, 5 * s, b0);
    blob(ctx, cx + 5 * s, baseY - H * 0.82, 6 * s, 5 * s, b0);
    blob(ctx, cx, baseY - H, 8 * s, 6 * s, b1);
    blob(ctx, cx - 4 * s, baseY - H * 0.85, 4.5 * s, 3.5 * s, b1);
    blob(ctx, cx + 4 * s, baseY - H * 0.88, 4.5 * s, 3.5 * s, b1);
    blob(ctx, cx - 2 * s, baseY - H - 1, 3 * s, 2 * s, b2);
    blob(ctx, cx + 3 * s, baseY - H * 0.9, 2 * s, 1.6 * s, b2);
  }

  function bamboo(ctx, cx, baseY, s) {
    var stalk = "#2c4630", node = "#1c2e20", leaf = "#36563a";
    var n = 3 + Math.round(s);
    for (var k = 0; k < n; k++) {
      var sx = Math.round(cx + (k - (n - 1) / 2) * 4);
      var H = Math.round((26 + (k % 2) * 6) * s);
      ctx.fillStyle = stalk;
      ctx.fillRect(sx, baseY - H, 2, H);
      ctx.fillStyle = node;
      for (var y = baseY - 6; y > baseY - H; y -= 7) ctx.fillRect(sx, y, 2, 1);
      ctx.fillStyle = leaf;
      ctx.fillRect(sx + 2, baseY - H + 3, 4, 1);
      ctx.fillRect(sx - 3, baseY - H + 7, 3, 1);
    }
  }

  function templeSmall(ctx, cx, baseY, s) {
    var wall = "#1f1730", roof = "#15101f", lit = "#e0a850", rim = "#3a2f50";
    var w = Math.round(22 * s), bh = Math.round(11 * s);
    ctx.fillStyle = wall;
    ctx.fillRect(cx - (w >> 1), baseY - bh, w, bh);
    ctx.fillStyle = lit;
    ctx.fillRect(cx - 2, baseY - bh + 3, 4, 4);
    var rh = Math.round(7 * s), half = Math.round(w * 0.75);
    ctx.fillStyle = roof;
    for (var i = 0; i < 3; i++) ctx.fillRect(cx - half + i, baseY - bh - rh + i, (half - i) * 2, 1);
    ctx.fillRect(cx - half, baseY - bh - rh + 3, half * 2, 3);
    ctx.fillRect(cx - half - 1, baseY - bh - rh + 2, 2, 2);
    ctx.fillRect(cx + half - 1, baseY - bh - rh + 2, 2, 2);
    ctx.fillStyle = rim;
    ctx.fillRect(cx - half, baseY - bh - rh, half * 2, 1);
  }

  function banner(ctx, cx, baseY, s) {
    var pole = "#2a2230", cloth = "#7a2a2a", clothLit = "#9a3a36", mark = "#d8c8a0";
    var H = Math.round(24 * s), ch = Math.round(H * 0.7);
    ctx.fillStyle = pole;
    ctx.fillRect(cx, baseY - H, 1, H);
    ctx.fillRect(cx, baseY - H, 7, 1);
    ctx.fillStyle = cloth;
    ctx.fillRect(cx + 1, baseY - H + 1, 6, ch);
    ctx.fillStyle = clothLit;
    ctx.fillRect(cx + 1, baseY - H + 1, 1, ch);
    ctx.fillStyle = mark;
    ctx.fillRect(cx + 3, baseY - H + 4, 2, 1);
    ctx.fillRect(cx + 3, baseY - H + 8, 2, 1);
    ctx.fillRect(cx + 3, baseY - H + 12, 2, 1);
  }

  function lantern(ctx, cx, baseY, s) {
    var stone = "#3a3540", hi = "#4f4a58", glow = "#f0b860", glowC = "#ffe0a0";
    var H = Math.round(18 * s);
    ctx.fillStyle = stone;
    ctx.fillRect(cx - 3, baseY - 3, 6, 3);
    ctx.fillRect(cx - 1, baseY - H + 8, 2, H - 11);
    ctx.fillRect(cx - 4, baseY - H + 2, 8, 6);
    ctx.fillStyle = glow;
    ctx.fillRect(cx - 2, baseY - H + 4, 4, 3);
    ctx.fillStyle = glowC;
    ctx.fillRect(cx - 1, baseY - H + 4, 2, 2);
    ctx.fillStyle = stone;
    ctx.fillRect(cx - 5, baseY - H, 10, 2);
    ctx.fillStyle = hi;
    ctx.fillRect(cx - 5, baseY - H, 10, 1);
    ctx.fillStyle = stone;
    ctx.fillRect(cx - 1, baseY - H - 2, 2, 2);
  }

  function fence(ctx, cx, baseY, s) {
    var post = "#3a2a1c", rail = "#4a3724", tip = "#6a4a2a", dark = "#241a10";
    var w = Math.round(26 * s), H = Math.round(13 * s);
    var x0 = cx - (w >> 1), x1 = cx + (w >> 1);
    ctx.fillStyle = rail;
    ctx.fillRect(x0, baseY - H + 3, w, 2);
    ctx.fillRect(x0, baseY - 3, w, 2);
    for (var x = x0; x <= x1; x += 4) {
      ctx.fillStyle = post; ctx.fillRect(x, baseY - H, 2, H);
      ctx.fillStyle = tip; ctx.fillRect(x, baseY - H, 2, 1);
    }
    ctx.fillStyle = post;
    ctx.fillRect(x0 - 1, baseY - H - 2, 2, H + 2);
    ctx.fillRect(x1 - 1, baseY - H - 2, 2, H + 2);
    ctx.fillStyle = dark;
    ctx.fillRect(x0, baseY - 1, w, 1);
  }

  var MID_TYPES = [pineTree, sakuraTree, bamboo, templeSmall, banner];
  var FORE_TYPES = [fence, fence, lantern];

  // Deterministic procedural scatter so a layer's props tile forever.
  function scatter(ctx, scroll, parallax, spacing, baseY, seed, types, gap) {
    var off = scroll * parallax;
    var first = Math.floor(off / spacing) - 1;
    var last = Math.ceil((off + WIDTH) / spacing) + 1;
    for (var i = first; i <= last; i++) {
      if (hash(i * 2 + 1, seed) < gap) continue;
      var jx = (hash(i * 7 + 3, seed) - 0.5) * spacing * 0.45;
      var x = i * spacing - off + jx;
      var sc = 0.8 + hash(i * 5 + 11, seed) * 0.5;
      var ti = Math.floor(hash(i * 13 + 5, seed) * types.length);
      if (ti >= types.length) ti = types.length - 1;
      types[ti](ctx, Math.round(x), baseY, sc);
    }
  }

  // ---- Wooden bridge the hero runs along (parallax 1.0) ----------------
  function bridge(ctx, scroll) {
    var top = GROUND_Y, bot = GROUND_Y + 12, beam = WATER_Y; // 150 / 162 / 164
    var g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, "#7a5630");
    g.addColorStop(1, "#553b20");
    ctx.fillStyle = g;
    ctx.fillRect(0, top, WIDTH, bot - top);

    // sunlit front edge of the deck
    ctx.fillStyle = "#a8763e";
    ctx.fillRect(0, top, WIDTH, 1);

    // cross-plank seams + plank highlights, scrolling with the world
    var sp = 11, off = (scroll % sp);
    for (var x = -off; x < WIDTH; x += sp) {
      ctx.fillStyle = "#3a2814";
      ctx.fillRect(Math.round(x), top, 1, bot - top);
      ctx.fillStyle = "#8a6236";
      ctx.fillRect(Math.round(x) + 2, top + 2, 1, bot - top - 3);
    }

    // front support beam (the thickness of the bridge)
    ctx.fillStyle = "#2e1f12";
    ctx.fillRect(0, bot, WIDTH, beam - bot);
  }

  // ---- River in the foreground (fastest parallax = closest) ------------
  function water(ctx, scroll) {
    var top = WATER_Y;
    var g = ctx.createLinearGradient(0, top, 0, HEIGHT);
    g.addColorStop(0.0, "#6e5566");   // warm sky reflected at the surface
    g.addColorStop(0.4, "#3c4866");
    g.addColorStop(1.0, "#1b2742");   // deep water
    ctx.fillStyle = g;
    ctx.fillRect(0, top, WIDTH, HEIGHT - top);

    ctx.fillStyle = "#b89080";
    ctx.fillRect(0, top, WIDTH, 1);   // bright surface line

    // layered ripples flowing fast (nearer rows move faster)
    var rows = [
      [top + 4, 1.5, "#8a6f78", 22, 8],
      [top + 9, 1.8, "#566486", 28, 10],
      [top + 15, 2.1, "#384a6e", 32, 12],
      [top + 21, 2.4, "#283a58", 36, 14]
    ];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], off = (scroll * r[1]) % r[3];
      ctx.fillStyle = r[2];
      for (var x = -off; x < WIDTH; x += r[3]) ctx.fillRect(Math.round(x), r[0], r[4], 1);
    }

    // shimmering sunset glint under the sky's glow (~x132)
    ctx.fillStyle = "rgba(255,200,140,0.22)";
    for (var y = top + 2; y < HEIGHT; y += 3) {
      var w = 9 + (y % 6);
      var gx = 132 + Math.sin(y * 1.3 + scroll * 0.05) * 7;
      ctx.fillRect(Math.round(gx - w / 2), y, w, 1);
    }
  }

  // ---- Bridge piers standing in the river (drawn over the water) -------
  function piers(ctx, scroll) {
    var sp = 78, off = (scroll % sp), top = GROUND_Y + 11;
    for (var x = -off; x < WIDTH + 10; x += sp) {
      var px = Math.round(x);
      ctx.fillStyle = "#33240f";
      ctx.fillRect(px - 2, top, 5, HEIGHT - top);
      ctx.fillStyle = "#5a4020";
      ctx.fillRect(px - 2, top, 1, HEIGHT - top);          // lit edge
      ctx.fillStyle = "#2a1d0d";
      ctx.fillRect(px - 4, WATER_Y + 3, 9, 2);             // cross-brace
      ctx.fillStyle = "rgba(20,30,55,0.5)";
      ctx.fillRect(px - 2, WATER_Y + 8, 5, HEIGHT - (WATER_Y + 8)); // submerged, darker
    }
  }

  function draw(ctx, scroll) {
    sky(ctx);
    ridge(ctx, scroll, 0.08, 100, 22, 60, "#6a5d85", 11);  // hazy far range
    fujiLayer(ctx, scroll);                                // Mount Fuji
    ridge(ctx, scroll, 0.16, 114, 30, 44, "#453a62", 29);  // mid range
    palace(ctx, scroll);
    ridge(ctx, scroll, 0.30, 132, 24, 34, "#271e3c", 53);  // near range
    scatter(ctx, scroll, 0.5, 58, 146, 401, MID_TYPES, 0.32);  // trees, temples, banners
    bridge(ctx, scroll);                                       // wooden deck
    scatter(ctx, scroll, 1.0, 82, GROUND_Y, 733, FORE_TYPES, 0.42); // lanterns/rails on it
    water(ctx, scroll);                                        // river (closest, fastest)
    piers(ctx, scroll);                                        // posts standing in the river
  }

  // ---- Torii gate (level marker the runner passes through) -------------
  function torii(ctx, cx, gY) {
    cx = Math.round(cx);
    var V = "#b5402c", VD = "#7a2418", VL = "#cf5a40", K = "#2a0f0a";
    var top = 50;

    function pillar(px) {
      ctx.fillStyle = V;  ctx.fillRect(px - 3, top + 6, 7, gY - (top + 6));
      ctx.fillStyle = VD; ctx.fillRect(px - 3, top + 6, 2, gY - (top + 6));
      ctx.fillStyle = VL; ctx.fillRect(px + 3, top + 6, 1, gY - (top + 6));
      ctx.fillStyle = K;  ctx.fillRect(px - 4, gY - 2, 9, 2); // footing
    }
    pillar(cx - 30);
    pillar(cx + 30);

    // nuki (lower tie beam) pierces the pillars
    ctx.fillStyle = V;  ctx.fillRect(cx - 40, top + 18, 80, 5);
    ctx.fillStyle = VD; ctx.fillRect(cx - 40, top + 21, 80, 2);

    // kasagi (top lintel) with upswept ends
    ctx.fillStyle = K;  ctx.fillRect(cx - 46, top - 1, 92, 1);
    ctx.fillStyle = V;  ctx.fillRect(cx - 46, top, 92, 7);
    ctx.fillStyle = VL; ctx.fillRect(cx - 46, top, 92, 1);
    ctx.fillStyle = V;  ctx.fillRect(cx - 49, top - 2, 4, 9);
    ctx.fillRect(cx + 45, top - 2, 4, 9);

    // gakuzuka (centre plaque)
    ctx.fillStyle = VD; ctx.fillRect(cx - 5, top + 9, 10, 8);
    ctx.fillStyle = K;  ctx.fillRect(cx - 5, top + 9, 10, 1);
  }

  // ---- Static boss arena (no scroll): dark palace under a blood moon ----
  function bossPillar(ctx, cx, fy) {
    ctx.fillStyle = "#7a2418"; ctx.fillRect(cx - 5, 18, 10, fy - 18);
    ctx.fillStyle = "#5a1810"; ctx.fillRect(cx - 5, 18, 3, fy - 18);
    ctx.fillStyle = "#9a3422"; ctx.fillRect(cx + 3, 18, 1, fy - 18);
    ctx.fillStyle = "#2a0f0a"; ctx.fillRect(cx - 7, 16, 14, 4); ctx.fillRect(cx - 7, fy - 4, 14, 4);
  }
  function bossBanner(ctx, cx, top) {
    ctx.fillStyle = "#2a0f0a"; ctx.fillRect(cx - 6, top, 12, 2);
    ctx.fillStyle = "#6a1a18"; ctx.fillRect(cx - 5, top + 2, 10, 34);
    ctx.fillStyle = "#8a2a26"; ctx.fillRect(cx - 5, top + 2, 1, 34);
    ctx.fillStyle = "#d8b048";
    ctx.fillRect(cx - 2, top + 10, 4, 4); ctx.fillRect(cx - 1, top + 16, 2, 7);
  }
  function bossTorch(ctx, x, y, fl) {
    ctx.fillStyle = "#2a1a0e"; ctx.fillRect(x - 1, y, 2, 14);
    var glow = ctx.createRadialGradient(x, y - 2, 1, x, y - 2, 11);
    glow.addColorStop(0, "rgba(255,200,120,0.7)"); glow.addColorStop(1, "rgba(255,140,60,0)");
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y - 2, 11, 0, Math.PI * 2); ctx.fill();
    var h = 6 + fl * 4;
    ctx.fillStyle = "#ffcf6a"; ctx.fillRect(x - 2, y - h, 4, h);
    ctx.fillStyle = "#ff8a3a"; ctx.fillRect(x - 1, y - h + 2, 2, h - 2);
  }

  function drawBoss(ctx, beat) {
    var g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, "#140e1e"); g.addColorStop(0.6, "#1e1426"); g.addColorStop(1, "#2a1620");
    ctx.fillStyle = g; ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // blood moon through a round window
    var mx = 140, my = 56;
    var mg = ctx.createRadialGradient(mx, my, 4, mx, my, 32);
    mg.addColorStop(0, "rgba(210,100,80,0.55)"); mg.addColorStop(1, "rgba(120,40,40,0)");
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, 32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#cf7458"; ctx.beginPath(); ctx.arc(mx, my, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#a85544"; ctx.beginPath(); ctx.arc(mx + 4, my - 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#0e0a14"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mx, my, 19, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx - 19, my); ctx.lineTo(mx + 19, my);
    ctx.moveTo(mx, my - 19); ctx.lineTo(mx, my + 19); ctx.stroke();

    // floor
    var fy = GROUND_Y;
    var fg = ctx.createLinearGradient(0, fy, 0, HEIGHT);
    fg.addColorStop(0, "#3a2418"); fg.addColorStop(1, "#160d0a");
    ctx.fillStyle = fg; ctx.fillRect(0, fy, WIDTH, HEIGHT - fy);
    ctx.fillStyle = "#5a3a22"; ctx.fillRect(0, fy, WIDTH, 1);
    ctx.fillStyle = "#241509";
    for (var x = 0; x < WIDTH; x += 20) ctx.fillRect(x, fy + 3, 1, HEIGHT - fy - 3);

    bossPillar(ctx, 22, fy); bossPillar(ctx, WIDTH - 22, fy);
    bossBanner(ctx, 54, 26); bossBanner(ctx, WIDTH - 54, 26);
    var fl = 0.5 + 0.5 * Math.abs(Math.sin(beat * 3.1));
    bossTorch(ctx, 40, 100, fl); bossTorch(ctx, WIDTH - 40, 100, fl);
  }

  return {
    draw: draw, torii: torii, drawBoss: drawBoss,
    WIDTH: WIDTH, HEIGHT: HEIGHT, GROUND_Y: GROUND_Y
  };
})();
