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

  // ===========================================================================
  // ACT 2 — Shogun Barracks: interior corridor, long windows facing outside
  // ===========================================================================
  function barracksScene(ctx, scroll, t) {
    var CEIL = 28;

    // ---- Ceiling — dark timber ------------------------------------------
    ctx.fillStyle = "#110d09";
    ctx.fillRect(0, 0, WIDTH, CEIL);
    // Cross-beams (parallax 0.14, nearly static overhead)
    var bsp = 48, boff = scroll * 0.14;
    var bf = Math.floor(boff / bsp) - 1, bl = Math.ceil((boff + WIDTH) / bsp) + 1;
    for (var bi = bf; bi <= bl; bi++) {
      var bx = Math.round(bi * bsp - boff);
      ctx.fillStyle = "#0b0807"; ctx.fillRect(bx, 0, 11, CEIL);
      ctx.fillStyle = "#1e140c"; ctx.fillRect(bx, 0, 2, CEIL); // lit edge
    }
    // Ceiling-wall join moulding
    ctx.fillStyle = "#0e0a07"; ctx.fillRect(0, CEIL, WIDTH, 3);

    // ---- Back wall — stained timber panels -------------------------------
    ctx.fillStyle = "#1a1210";
    ctx.fillRect(0, CEIL + 3, WIDTH, GROUND_Y - CEIL - 3);

    // ---- Tall windows (parallax 0.30) -----------------------------------
    // Each window sits in the back wall; through it you see the night outside.
    var wsp = 96, woff = scroll * 0.30;
    var wf = Math.floor(woff / wsp) - 1, wl = Math.ceil((woff + WIDTH) / wsp) + 1;
    var wTop = 40, wBot = 124, wW = 46;
    for (var wi = wf; wi <= wl; wi++) {
      var wx = Math.round(wi * wsp - woff + 48); // centred in each 96px bay
      // Outside sky — cold indigo night
      ctx.fillStyle = "#0e1224"; ctx.fillRect(wx, wTop, wW, wBot - wTop);
      // Mountain silhouette in lower half of window
      var mbase = Math.round(wTop + (wBot - wTop) * 0.55);
      ctx.fillStyle = "#090c18"; ctx.fillRect(wx, mbase, wW, wBot - mbase);
      // Jagged peak line across mountain silhouette
      ctx.fillStyle = "#090c18";
      ctx.beginPath(); ctx.moveTo(wx, mbase);
      for (var mp = 0; mp <= wW; mp += 7) {
        ctx.lineTo(wx + mp, mbase - Math.round(hash(wi * 5 + mp, 41) * 10 + 2));
      }
      ctx.lineTo(wx + wW, mbase); ctx.closePath(); ctx.fill();
      // Pale moonlight tint over the window pane
      ctx.fillStyle = "rgba(80,100,170,0.07)"; ctx.fillRect(wx, wTop, wW, wBot - wTop);
      // Heavy timber frame
      ctx.fillStyle = "#0b0806";
      ctx.fillRect(wx - 4, wTop - 3, wW + 8, 4);               // top
      ctx.fillRect(wx - 4, wBot, wW + 8, 4);                   // bottom
      ctx.fillRect(wx - 4, wTop - 3, 4, wBot - wTop + 7);      // left jamb
      ctx.fillRect(wx + wW, wTop - 3, 4, wBot - wTop + 7);     // right jamb
      // Horizontal mid-rail (two-pane style)
      ctx.fillRect(wx - 4, wTop + Math.round((wBot - wTop) * 0.44), wW + 8, 3);
      // Cold moonlight spill on floor directly below window
      ctx.fillStyle = "rgba(65,85,155,0.10)";
      ctx.fillRect(wx, GROUND_Y, wW, 20);
    }

    // ---- Wooden pillars between windows (same parallax, interval start) -
    for (var pi = wf; pi <= wl; pi++) {
      var px = Math.round(pi * wsp - woff);
      ctx.fillStyle = "#281a0e"; ctx.fillRect(px - 8, CEIL + 3, 16, GROUND_Y - CEIL - 3);
      ctx.fillStyle = "#3c2618"; ctx.fillRect(px - 8, CEIL + 3, 2, GROUND_Y - CEIL - 3); // highlight
      ctx.fillStyle = "#160c06"; ctx.fillRect(px + 5, CEIL + 3, 3, GROUND_Y - CEIL - 3); // shadow
      // Cap / base moulding
      ctx.fillStyle = "#160c06"; ctx.fillRect(px - 10, CEIL + 3, 20, 5);
      ctx.fillStyle = "#160c06"; ctx.fillRect(px - 10, GROUND_Y - 5, 20, 5);
      ctx.fillStyle = "#241608"; ctx.fillRect(px - 10, CEIL + 8, 20, 2);
    }

    // ---- Weapon racks (parallax 0.50, offset half-bay from pillars) ------
    var roff = scroll * 0.50;
    var rf = Math.floor(roff / wsp) - 1, rl = Math.ceil((roff + WIDTH) / wsp) + 1;
    for (var ri = rf; ri <= rl; ri++) {
      var rx = Math.round(ri * wsp - roff + 68);
      ctx.fillStyle = "#382410"; ctx.fillRect(rx - 14, 62, 28, 3); // upper rail
      ctx.fillStyle = "#382410"; ctx.fillRect(rx - 14, 88, 28, 3); // lower rail
      for (var wri = 0; wri < 4; wri++) {
        var wrx = rx - 12 + wri * 8;
        ctx.fillStyle = "#46340e"; ctx.fillRect(wrx, 38, 1, 86); // pole shaft
        // Spearhead / blade tip
        ctx.fillStyle = "#8892a2"; ctx.fillRect(wrx - 1, 34, 3, 6);
        ctx.fillStyle = "#60686e"; ctx.fillRect(wrx, 34, 1, 5);
      }
    }

    // ---- Hanging paper lanterns (parallax 0.60) --------------------------
    var llsp = 64, lloff = scroll * 0.60;
    var lf = Math.floor(lloff / llsp) - 1, ll = Math.ceil((lloff + WIDTH) / llsp) + 1;
    var flicker = 0.5 + 0.5 * Math.abs(Math.sin(t * 5.3));
    for (var li = lf; li <= ll; li++) {
      var lx = Math.round(li * llsp - lloff + 32);
      ctx.fillStyle = "#261a0c"; ctx.fillRect(lx, 0, 1, 10);         // cord
      ctx.fillStyle = "#7a2016"; ctx.fillRect(lx - 5, 10, 10, 14);   // body
      ctx.fillStyle = "#cc4818"; ctx.fillRect(lx - 4, 11, 8, 12);    // lit face
      ctx.fillStyle = "#ffbe50"; ctx.fillRect(lx - 2, 13, 4, Math.round(5 + flicker * 2)); // flame
      ctx.fillStyle = "#0e0806"; ctx.fillRect(lx - 6, 10, 12, 3);    // top cap
      ctx.fillStyle = "#0e0806"; ctx.fillRect(lx - 6, 21, 12, 3);    // bottom cap
      // Warm amber glow on ceiling
      var lg = ctx.createRadialGradient(lx, 18, 3, lx, 18, 26);
      lg.addColorStop(0, "rgba(200,100,36,0.14)");
      lg.addColorStop(1, "rgba(200,100,36,0)");
      ctx.fillStyle = lg; ctx.fillRect(lx - 26, 0, 52, 48);
      // Warm pool on floor
      var fp = ctx.createRadialGradient(lx, GROUND_Y + 2, 2, lx, GROUND_Y + 2, 28);
      fp.addColorStop(0, "rgba(190,85,28,0.18)");
      fp.addColorStop(1, "rgba(190,85,28,0)");
      ctx.fillStyle = fp; ctx.fillRect(lx - 28, GROUND_Y, 56, 30);
    }

    // ---- Wooden plank floor ---------------------------------------------
    var fgb = ctx.createLinearGradient(0, GROUND_Y, 0, HEIGHT);
    fgb.addColorStop(0, "#623c18"); fgb.addColorStop(1, "#281408");
    ctx.fillStyle = fgb; ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);
    ctx.fillStyle = "#88502a"; ctx.fillRect(0, GROUND_Y, WIDTH, 1); // sunlit front edge
    var fpsp = 9, fpoff = Math.round(scroll) % fpsp;
    ctx.fillStyle = "#382010";
    for (var fpx = -fpoff; fpx < WIDTH; fpx += fpsp)
      ctx.fillRect(fpx, GROUND_Y, 1, HEIGHT - GROUND_Y);
    ctx.fillStyle = "#724828"; ctx.fillRect(0, GROUND_Y + 3, WIDTH, 1); // grain stripe
  }

  // ===========================================================================
  // ACT 3 — Palace & Dungeon: stone corridors leading to the princess's cell
  // ===========================================================================
  function palaceScene(ctx, scroll, t) {
    // ---- Vaulted stone ceiling -------------------------------------------
    ctx.fillStyle = "#0c0a16";
    ctx.fillRect(0, 0, WIDTH, 36);
    // Arch ribs (parallax 0.10, nearly static)
    var arsp = 88, aroff = scroll * 0.10;
    var arf = Math.floor(aroff / arsp) - 1, arl = Math.ceil((aroff + WIDTH) / arsp) + 1;
    for (var ari = arf; ari <= arl; ari++) {
      var arx = Math.round(ari * arsp - aroff + 44);
      ctx.fillStyle = "#18142a"; ctx.fillRect(arx - 4, 0, 8, 36);
      ctx.fillStyle = "#22203e"; ctx.fillRect(arx - 4, 0, 1, 36); // lit edge
    }

    // ---- Stone block wall (parallax 0.15) --------------------------------
    ctx.fillStyle = "#13102a";
    ctx.fillRect(0, 36, WIDTH, GROUND_Y - 36);
    var soff = scroll * 0.15;
    for (var srow = 0; srow < 8; srow++) {
      var sy = 36 + srow * 14;
      var sShift = srow % 2 === 0 ? 0 : 16;
      var sFirst = Math.floor((soff - sShift) / 32) - 1;
      var sLast  = Math.ceil((soff - sShift + WIDTH) / 32) + 1;
      ctx.fillStyle = "#1c1832";
      for (var sc = sFirst; sc <= sLast; sc++) {
        var ssx = Math.round(sc * 32 - soff + sShift);
        ctx.fillRect(ssx, sy, 30, 12); // stone block face
      }
      // Mortar line between rows
      ctx.fillStyle = "#0e0c1e";
      ctx.fillRect(0, sy + 12, WIDTH, 2);
    }

    // ---- Round-arch windows near ceiling (parallax 0.28) ----------------
    var mwsp = 110, mwoff = scroll * 0.28;
    var mwf = Math.floor(mwoff / mwsp) - 1, mwl = Math.ceil((mwoff + WIDTH) / mwsp) + 1;
    for (var mwi = mwf; mwi <= mwl; mwi++) {
      var mwx = Math.round(mwi * mwsp - mwoff + 55);
      var mwy = 46, mwW = 22, mwH = 32;
      // Blood sky through the arch
      ctx.fillStyle = "#180e1c"; ctx.fillRect(mwx - 11, mwy, mwW, mwH);
      // Blood moon, gently pulsing
      var moonR = 5 + Math.round(Math.abs(Math.sin(t * 0.9 + mwi * 1.4)));
      var mgg = ctx.createRadialGradient(mwx, mwy + 9, 1, mwx, mwy + 9, moonR * 3);
      mgg.addColorStop(0, "rgba(200,65,50,0.40)"); mgg.addColorStop(1, "rgba(130,28,28,0)");
      ctx.fillStyle = mgg; ctx.beginPath(); ctx.arc(mwx, mwy + 9, moonR * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#b43a2e";
      ctx.beginPath(); ctx.arc(mwx, mwy + 9, moonR, 0, Math.PI * 2); ctx.fill();
      // Stone arch surround
      ctx.fillStyle = "#0a0818";
      ctx.fillRect(mwx - 14, mwy - 3, mwW + 3, 4);          // top lintel
      ctx.fillRect(mwx - 14, mwy + mwH, mwW + 3, 4);        // sill
      ctx.fillRect(mwx - 14, mwy - 3, 4, mwH + 7);          // left jamb
      ctx.fillRect(mwx + 9,  mwy - 3, 4, mwH + 7);          // right jamb
    }

    // ---- Ornate stone columns (same parallax as windows, at interval start)
    for (var coi = mwf; coi <= mwl; coi++) {
      var cox = Math.round(coi * mwsp - mwoff);
      ctx.fillStyle = "#1e1a30"; ctx.fillRect(cox - 9, 36, 18, GROUND_Y - 36); // shaft
      ctx.fillStyle = "#2c2844"; ctx.fillRect(cox - 9, 36, 2, GROUND_Y - 36);  // lit edge
      ctx.fillStyle = "#100e1c"; ctx.fillRect(cox + 6, 36, 3, GROUND_Y - 36);  // shadow
      // Capital with gold band
      ctx.fillStyle = "#100e1c"; ctx.fillRect(cox - 12, 36, 24, 6);
      ctx.fillStyle = "#c49430"; ctx.fillRect(cox - 10, 37, 20, 2);
      // Base with gold band
      ctx.fillStyle = "#100e1c"; ctx.fillRect(cox - 12, GROUND_Y - 8, 24, 8);
      ctx.fillStyle = "#c49430"; ctx.fillRect(cox - 10, GROUND_Y - 7, 20, 1);
    }

    // ---- Crimson silk banners between columns (parallax 0.40) -----------
    var bnsp = 110, bnoff = scroll * 0.40;
    var bnf = Math.floor(bnoff / bnsp) - 1, bnl = Math.ceil((bnoff + WIDTH) / bnsp) + 1;
    for (var bni = bnf; bni <= bnl; bni++) {
      var bnx = Math.round(bni * bnsp - bnoff + 55);
      var bnTop = 36, bnH = 84, bnW = 28;
      // Drop shadow
      ctx.fillStyle = "#0e0c1a"; ctx.fillRect(bnx - 13, bnTop + 2, bnW, bnH);
      // Banner cloth
      ctx.fillStyle = "#641418"; ctx.fillRect(bnx - 14, bnTop, bnW, bnH);
      ctx.fillStyle = "#8c2422"; ctx.fillRect(bnx - 14, bnTop, 2, bnH);      // highlight edge
      ctx.fillStyle = "#480c10"; ctx.fillRect(bnx + 12, bnTop, 2, bnH);     // shadow edge
      // Gold hanging rod
      ctx.fillStyle = "#c49430"; ctx.fillRect(bnx - 16, bnTop, bnW + 4, 3);
      // Gold mon / clan crest on banner
      ctx.fillStyle = "#c49430";
      ctx.fillRect(bnx - 4, bnTop + 15, 8, 1);  // top bar ─
      ctx.fillRect(bnx - 4, bnTop + 22, 8, 1);  // mid bar ─
      ctx.fillRect(bnx - 1, bnTop + 11, 2, 15); // vert. stroke │
      ctx.fillRect(bnx - 3, bnTop + 32, 6, 1);
      ctx.fillRect(bnx - 4, bnTop + 38, 8, 1);
      ctx.fillRect(bnx - 3, bnTop + 44, 6, 1);
      // Fringe at bottom
      ctx.fillStyle = "#c49430";
      for (var fri = 0; fri < 6; fri++)
        ctx.fillRect(bnx - 13 + fri * 4, bnTop + bnH, 1, 6);
    }

    // ---- Iron-bar dungeon grilles on lower wall (parallax 0.18) ---------
    // Alternating bays show barred cells — you are running past the dungeon.
    var grsp = 110, groff = scroll * 0.18;
    var grf = Math.floor(groff / grsp) - 1, grl = Math.ceil((groff + WIDTH) / grsp) + 1;
    for (var gri = grf; gri <= grl; gri++) {
      if (gri % 2 === 0) continue; // every other bay
      var grx = Math.round(gri * grsp - groff + 20);
      var grTop = 88, grBot = GROUND_Y - 2, grW = 50;
      // Dark cell interior behind the bars
      ctx.fillStyle = "#080610"; ctx.fillRect(grx - grW / 2, grTop, grW, grBot - grTop);
      // Vertical bars
      for (var bari = 0; bari <= 4; bari++) {
        var barx = Math.round(grx - grW / 2 + bari * (grW / 4));
        ctx.fillStyle = "#181628"; ctx.fillRect(barx - 2, grTop, 4, grBot - grTop);
        ctx.fillStyle = "#26243c"; ctx.fillRect(barx - 2, grTop, 1, grBot - grTop); // gleam
      }
      // Horizontal crossbar mid-height
      ctx.fillStyle = "#181628";
      ctx.fillRect(grx - grW / 2, Math.round(grTop + (grBot - grTop) * 0.5), grW, 3);
      // Stone surround
      ctx.fillStyle = "#0e0c1c";
      ctx.fillRect(grx - grW / 2 - 3, grTop - 2, grW + 6, 4);
      ctx.fillRect(grx - grW / 2 - 3, grTop - 2, 3, grBot - grTop + 4);
      ctx.fillRect(grx + grW / 2,     grTop - 2, 3, grBot - grTop + 4);
    }

    // ---- Wall torches (parallax 0.50) ------------------------------------
    var tsp = 110, toff = scroll * 0.50;
    var tff = Math.floor(toff / tsp) - 1, tfl = Math.ceil((toff + WIDTH) / tsp) + 1;
    var tflicker = 0.5 + 0.5 * Math.abs(Math.sin(t * 4.8));
    for (var tii = tff; tii <= tfl; tii++) {
      var tx = Math.round(tii * tsp - toff + 82);
      bossTorch(ctx, tx, 96, tflicker);
    }

    // ---- Polished dark stone floor ---------------------------------------
    var fgp = ctx.createLinearGradient(0, GROUND_Y, 0, HEIGHT);
    fgp.addColorStop(0, "#262238"); fgp.addColorStop(1, "#100e1c");
    ctx.fillStyle = fgp; ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);
    ctx.fillStyle = "#38324c"; ctx.fillRect(0, GROUND_Y, WIDTH, 1);   // polish sheen
    // Tile grid — vertical joints
    var tfsp = 20, tfoff = Math.round(scroll) % tfsp;
    ctx.fillStyle = "#181428";
    for (var tfx = -tfoff; tfx < WIDTH; tfx += tfsp)
      ctx.fillRect(tfx, GROUND_Y, 1, HEIGHT - GROUND_Y);
    // Horizontal grout lines
    ctx.fillStyle = "#181428";
    ctx.fillRect(0, GROUND_Y + 12, WIDTH, 1);
    ctx.fillRect(0, GROUND_Y + 24, WIDTH, 1);
    // Crimson reflection of banners on polished stone
    ctx.fillStyle = "rgba(88,16,18,0.10)"; ctx.fillRect(0, GROUND_Y, WIDTH, 24);
  }

  function draw(ctx, scroll, act, t) {
    if (act === 2) { barracksScene(ctx, scroll, t || 0); return; }
    if (act === 3) { palaceScene(ctx, scroll, t || 0); return; }
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

  // ---- Wooden arch gate (Act 2 — barracks interior) --------------------
  // Heavy timber post-and-beam frame: the runner passes through doorways
  // between barracks sections. Matches the dark-walnut pillar palette.
  function woodArch(ctx, cx, gY) {
    cx = Math.round(cx);
    var S = "#281c0e", SL = "#3c2618", SD = "#140a04";
    var PW = 10; // post width

    // Left upright
    ctx.fillStyle = S;  ctx.fillRect(cx - 38, 28, PW, gY - 28);
    ctx.fillStyle = SL; ctx.fillRect(cx - 38, 28, 2, gY - 28);   // lit edge
    ctx.fillStyle = SD; ctx.fillRect(cx - 30, 28, 2, gY - 28);   // shadow edge
    ctx.fillStyle = SD; ctx.fillRect(cx - 40, gY - 4, PW + 4, 4); // footing

    // Right upright
    ctx.fillStyle = S;  ctx.fillRect(cx + 28, 28, PW, gY - 28);
    ctx.fillStyle = SL; ctx.fillRect(cx + 28, 28, 2, gY - 28);
    ctx.fillStyle = SD; ctx.fillRect(cx + 36, 28, 2, gY - 28);
    ctx.fillStyle = SD; ctx.fillRect(cx + 26, gY - 4, PW + 4, 4);

    // Main header beam with upswept end caps
    ctx.fillStyle = S;  ctx.fillRect(cx - 48, 28, 96, 12);
    ctx.fillStyle = SL; ctx.fillRect(cx - 48, 28, 96, 2);          // top highlight
    ctx.fillStyle = SD; ctx.fillRect(cx - 48, 38, 96, 2);          // bottom shadow
    ctx.fillStyle = S;  ctx.fillRect(cx - 52, 24, 6, 16);           // left end cap
    ctx.fillStyle = S;  ctx.fillRect(cx + 46, 24, 6, 16);           // right end cap
    ctx.fillStyle = SL; ctx.fillRect(cx - 52, 24, 6, 2);
    ctx.fillStyle = SL; ctx.fillRect(cx + 46, 24, 6, 2);

    // 3-D top face of header — top-lit slab visible above the front beam.
    // Spans the full gate width (pillar-to-pillar) so it reads as the roof
    // of the beam connecting the background left post to the foreground right post.
    var ST = "#4a2c14"; // top-lit wood (lighter than S)
    ctx.fillStyle = SD; ctx.fillRect(cx - 56, 18, 116, 1); // far/back edge (darkest)
    ctx.fillStyle = ST; ctx.fillRect(cx - 56, 19, 116, 5); // top surface (top-lit)
    ctx.fillStyle = SL; ctx.fillRect(cx - 56, 23, 116, 1); // near/front edge highlight

    // Bracket corbels where posts meet beam
    ctx.fillStyle = SD;
    ctx.fillRect(cx - 42, 40, 12, 4);  // left — horizontal
    ctx.fillRect(cx - 42, 40, 4, 10); //        vertical
    ctx.fillRect(cx + 30, 40, 12, 4);  // right — horizontal
    ctx.fillRect(cx + 38, 40, 4, 10); //         vertical

    // Lower crossrail (mortise-and-tenon joint style)
    ctx.fillStyle = S;  ctx.fillRect(cx - 38, 58, 76, 6);
    ctx.fillStyle = SL; ctx.fillRect(cx - 38, 58, 76, 1);
    ctx.fillStyle = SD; ctx.fillRect(cx - 38, 63, 76, 1);

    // Hanging wooden plaque in centre
    ctx.fillStyle = "#3c2612"; ctx.fillRect(cx - 12, 32, 24, 18);
    ctx.fillStyle = SD;        ctx.fillRect(cx - 12, 32, 24, 1);
    ctx.fillStyle = SD;        ctx.fillRect(cx - 12, 49, 24, 1);
    ctx.fillStyle = "#52381a"; // engraved kanji-suggestion marks
    ctx.fillRect(cx - 8, 36, 16, 2);
    ctx.fillRect(cx - 6, 41, 12, 2);
    ctx.fillRect(cx - 4, 46, 8, 1);
  }

  // ---- Stone arch gate (Act 3 — palace corridor) -----------------------
  // Semi-circular masonry arch with pillar shafts, gold accent bands, and
  // a dark passage — matches the palace column/stone-block palette.
  function stoneArch(ctx, cx, gY) {
    cx = Math.round(cx);
    var S = "#1e1a30", SL = "#2c2844", SD = "#0e0c1e", G = "#c49430";
    var archR = 26, SW = 14;   // inner radius, stone surround width
    var archCY = 74;           // arc centre — crown sits at y ≈ 48

    // Dark passage through the arch (drawn first, arch sits in front)
    ctx.fillStyle = "#050310";
    ctx.fillRect(cx - archR, 48, archR * 2, gY - 48);

    // Outer highlight arc (top rim, 1 px lighter)
    ctx.fillStyle = SL;
    ctx.beginPath();
    ctx.arc(cx, archCY, archR + SW + 1, Math.PI, 0);
    ctx.lineTo(cx + archR + SW + 1, archCY);
    ctx.arc(cx, archCY, archR + SW, 0, Math.PI, true);
    ctx.closePath();
    ctx.fill();

    // Main stone arch body
    ctx.fillStyle = S;
    ctx.beginPath();
    ctx.arc(cx, archCY, archR + SW, Math.PI, 0);
    ctx.lineTo(cx + archR + SW, archCY);
    ctx.arc(cx, archCY, archR + 2, 0, Math.PI, true);
    ctx.closePath();
    ctx.fill();

    // Inner shadow arc (gives depth to the throat of the arch)
    ctx.fillStyle = SD;
    ctx.beginPath();
    ctx.arc(cx, archCY, archR + 5, Math.PI, 0);
    ctx.lineTo(cx + archR + 5, archCY);
    ctx.arc(cx, archCY, archR + 2, 0, Math.PI, true);
    ctx.closePath();
    ctx.fill();

    // Left pillar shaft below the haunch
    ctx.fillStyle = SL; ctx.fillRect(cx - archR - SW, archCY, 2, gY - archCY);
    ctx.fillStyle = S;  ctx.fillRect(cx - archR - SW + 2, archCY, SW - 4, gY - archCY);
    ctx.fillStyle = SD; ctx.fillRect(cx - archR - 2, archCY, 2, gY - archCY);

    // Right pillar shaft below the haunch
    ctx.fillStyle = SL; ctx.fillRect(cx + archR, archCY, 2, gY - archCY);
    ctx.fillStyle = S;  ctx.fillRect(cx + archR + 2, archCY, SW - 4, gY - archCY);
    ctx.fillStyle = SD; ctx.fillRect(cx + archR + SW - 2, archCY, 2, gY - archCY);

    // Stone course lines on pillar shafts
    ctx.fillStyle = SD;
    for (var py = archCY + 8; py < gY - 4; py += 10) {
      ctx.fillRect(cx - archR - SW, py, SW, 1);
      ctx.fillRect(cx + archR,      py, SW, 1);
    }

    // Capital at each pillar top — gold band accent
    ctx.fillStyle = S; ctx.fillRect(cx - archR - SW - 2, archCY - 5, SW + 4, 6);
    ctx.fillStyle = G; ctx.fillRect(cx - archR - SW - 1, archCY - 3, SW + 2, 2);
    ctx.fillStyle = S; ctx.fillRect(cx + archR - 2, archCY - 5, SW + 4, 6);
    ctx.fillStyle = G; ctx.fillRect(cx + archR - 1, archCY - 3, SW + 2, 2);

    // Base moulding — gold band accent
    ctx.fillStyle = S; ctx.fillRect(cx - archR - SW - 2, gY - 5, SW + 4, 5);
    ctx.fillStyle = G; ctx.fillRect(cx - archR - SW - 1, gY - 4, SW + 2, 1);
    ctx.fillStyle = S; ctx.fillRect(cx + archR - 2, gY - 5, SW + 4, 5);
    ctx.fillStyle = G; ctx.fillRect(cx + archR - 1, gY - 4, SW + 2, 1);

    // Gold keystone at the crown
    ctx.fillStyle = G;  ctx.fillRect(cx - 6, 48, 12, 4);
    ctx.fillStyle = SL; ctx.fillRect(cx - 8, 46, 16, 3);

    // 3-D entablature slab above the arch — flat stone cap spanning both columns.
    // The top surface shows the gate has depth connecting the background left
    // column to the foreground right column.
    var capL = cx - archR - SW - 2, capW = (archR + SW + 2) * 2;
    ctx.fillStyle = SD; ctx.fillRect(capL, 40, capW, 1);  // far/back edge
    ctx.fillStyle = SL; ctx.fillRect(capL, 41, capW, 5);  // top surface (top-lit stone)
    ctx.fillStyle = S;  ctx.fillRect(capL, 45, capW, 1);  // near/front edge
    ctx.fillStyle = G;  ctx.fillRect(cx - 8, 41, 16, 3);  // gold cap over keystone
  }

  // ---- Gate dispatcher: background layer (arch header + FAR/LEFT pillar) -
  // The left pillar is drawn full-height BEFORE the hero so the hero appears
  // to walk IN FRONT of it — it recedes as you enter the gate.
  // The right (near/foreground) pillar is drawn separately after the hero.

  function toriiLeftPillar(ctx, cx) {
    // Aligns exactly with torii's left structural post (cx - 30, width 7)
    var V = "#b5402c", VD = "#7a2418", VL = "#cf5a40", K = "#2a0f0a";
    var px = cx - 33; // left edge of the left post
    ctx.fillStyle = V;  ctx.fillRect(px, 0, 7, HEIGHT);
    ctx.fillStyle = VD; ctx.fillRect(px, 0, 2, HEIGHT);
    ctx.fillStyle = VL; ctx.fillRect(px + 5, 0, 1, HEIGHT);
    ctx.fillStyle = K;  ctx.fillRect(px - 1, GROUND_Y - 2, 9, 2);
  }

  function woodArchLeftPost(ctx, cx) {
    // Aligns with woodArch left upright (cx - 38, PW 10)
    var S = "#281c0e", SL = "#3c2618", SD = "#140a04";
    ctx.fillStyle = S;  ctx.fillRect(cx - 38, 0, 10, HEIGHT);
    ctx.fillStyle = SD; ctx.fillRect(cx - 38, 0, 2, HEIGHT);
    ctx.fillStyle = SL; ctx.fillRect(cx - 30, 0, 1, HEIGHT);
    ctx.fillStyle = SD; ctx.fillRect(cx - 40, GROUND_Y - 4, 14, 4);
  }

  function stoneArchLeftColumn(ctx, cx) {
    // Aligns with stoneArch left shaft (cx - 40, SW 14)
    var S = "#1e1a30", SL = "#2c2844", SD = "#0e0c1e", G = "#c49430";
    var lx = cx - 40;
    var py;
    ctx.fillStyle = S;  ctx.fillRect(lx, 0, 14, HEIGHT);
    ctx.fillStyle = SD; ctx.fillRect(lx, 0, 2, HEIGHT);
    ctx.fillStyle = SL; ctx.fillRect(lx + 12, 0, 1, HEIGHT);
    ctx.fillStyle = G;
    for (py = 10; py < HEIGHT - 4; py += 26) ctx.fillRect(lx + 2, py, 10, 1);
    ctx.fillStyle = SD; ctx.fillRect(lx - 2, GROUND_Y - 6, 18, 6);
    ctx.fillStyle = G;  ctx.fillRect(lx - 1, GROUND_Y - 5, 16, 1);
  }

  function gate(ctx, cx, gY, act) {
    cx = Math.round(cx);
    // Draw the full-height LEFT pillar first (behind hero), then the arch art
    if (act === 2) { woodArchLeftPost(ctx, cx); woodArch(ctx, cx, gY); return; }
    if (act === 3) { stoneArchLeftColumn(ctx, cx); stoneArch(ctx, cx, gY); return; }
    toriiLeftPillar(ctx, cx); torii(ctx, cx, gY);
  }

  // ---- Gate foreground layer: only the NEAR/RIGHT pillar over the hero ----
  // Drawn AFTER the hero so it appears in front — hero is sandwiched between
  // the far-left column (background) and the near-right column (foreground).
  // The right pillar fades in as the gate approaches (cx 200→120) so it
  // materialises naturally before the hero reaches the opening.

  function toriiFore(ctx, cx) {
    // Aligns with torii's right post (cx + 30 centre, width 7)
    var V = "#b5402c", VD = "#7a2418", VL = "#cf5a40", K = "#2a0f0a";
    var px = cx + 27; // left edge of right post
    ctx.fillStyle = V;  ctx.fillRect(px, 0, 7, HEIGHT);
    ctx.fillStyle = VL; ctx.fillRect(px, 0, 1, HEIGHT);
    ctx.fillStyle = VD; ctx.fillRect(px + 4, 0, 2, HEIGHT);
    ctx.fillStyle = K;  ctx.fillRect(px - 1, GROUND_Y - 2, 9, 2);
  }

  function woodArchFore(ctx, cx) {
    // Aligns with woodArch right upright (cx + 28, PW 10)
    var S = "#281c0e", SL = "#3c2618", SD = "#140a04";
    ctx.fillStyle = S;  ctx.fillRect(cx + 28, 0, 10, HEIGHT);
    ctx.fillStyle = SL; ctx.fillRect(cx + 28, 0, 1, HEIGHT);
    ctx.fillStyle = SD; ctx.fillRect(cx + 36, 0, 2, HEIGHT);
    ctx.fillStyle = SD; ctx.fillRect(cx + 26, GROUND_Y - 4, 14, 4);
  }

  function stoneArchFore(ctx, cx) {
    // Aligns with stoneArch right shaft (cx + 26, SW 14)
    var S = "#1e1a30", SL = "#2c2844", SD = "#0e0c1e", G = "#c49430";
    var rx = cx + 26;
    var py;
    ctx.fillStyle = S;  ctx.fillRect(rx, 0, 14, HEIGHT);
    ctx.fillStyle = SL; ctx.fillRect(rx, 0, 1, HEIGHT);
    ctx.fillStyle = SD; ctx.fillRect(rx + 12, 0, 2, HEIGHT);
    ctx.fillStyle = G;
    for (py = 10; py < HEIGHT - 4; py += 26) ctx.fillRect(rx + 2, py, 10, 1);
    ctx.fillStyle = SD; ctx.fillRect(rx - 2, GROUND_Y - 6, 18, 6);
    ctx.fillStyle = G;  ctx.fillRect(rx - 1, GROUND_Y - 5, 16, 1);
  }

  // Foreground dispatcher — right pillar only, fades in as gate approaches.
  function gateFore(ctx, cx, gY, act) {
    cx = Math.round(cx);
    if (cx < -60 || cx > WIDTH + 20) return;
    // Fade in the near pillar as the gate scrolls into the hero's zone.
    // Full opacity once cx < 120 (hero is inside or past the opening).
    var alpha = Math.max(0, Math.min(1, (200 - cx) / 80));
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (act === 2) { woodArchFore(ctx, cx); }
    else if (act === 3) { stoneArchFore(ctx, cx); }
    else { toriiFore(ctx, cx); }
    ctx.restore();
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

    // 3-D top face of kasagi — top-lit slab spanning both upswept ends.
    // Wider than the front face so it reads as a roof cap from back to front.
    var VT = "#d96545"; // top-lit vermilion (lighter than V)
    ctx.fillStyle = K;  ctx.fillRect(cx - 54, top - 9, 108, 1); // far/back edge
    ctx.fillStyle = VT; ctx.fillRect(cx - 54, top - 8, 108, 6); // top surface
    ctx.fillStyle = VL; ctx.fillRect(cx - 54, top - 2, 108, 1); // near edge highlight

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

  // ---- Cut-scene art (static cinematic panels) -------------------------
  function cutSky(ctx, mode) {
    var g = ctx.createLinearGradient(0, 0, 0, HEIGHT), s = g.addColorStop.bind(g);
    if (mode === "night")      { s(0, "#0e0a1e"); s(0.65, "#1a1230"); s(1, "#2a1a2e"); }
    else if (mode === "blood") { s(0, "#2a1430"); s(0.55, "#5a2030"); s(1, "#7a2a26"); }
    else if (mode === "dawn")  { s(0, "#3a3a6a"); s(0.5, "#d8895a"); s(1, "#f2cc82"); }
    else                       { s(0, "#352a5e"); s(0.45, "#7a4a74"); s(0.78, "#c4684f"); s(1, "#e6904a"); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  function cutMoon(ctx, x, y, r, lit) {
    var mg = ctx.createRadialGradient(x, y, 2, x, y, r * 2.2);
    mg.addColorStop(0, lit ? "rgba(245,210,150,0.5)" : "rgba(210,100,80,0.5)");
    mg.addColorStop(1, "rgba(120,40,40,0)");
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = lit ? "#f0d480" : "#cf7458";
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  function cutFloor(ctx, top, c1, c2) {
    var g = ctx.createLinearGradient(0, top, 0, HEIGHT);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.fillRect(0, top, WIDTH, HEIGHT - top);
  }
  // Tiered castle keep (tenshu) silhouette.
  function cutCastle(ctx, cx, baseY, scale) {
    var c = "#15101f", roof = "#0c0814", lit = "#e8b060";
    var tiers = 4, bw = 18 * scale, th = 11 * scale;
    for (var i = 0; i < tiers; i++) {
      var w = Math.round(bw * (1 - i * 0.16)), hw = w >> 1;
      var y = Math.round(baseY - (i + 1) * th);
      ctx.fillStyle = roof;
      ctx.fillRect(cx - hw - 3, y - 1, w + 6, 2);
      ctx.fillRect(cx - hw - 4, y, 2, 1); ctx.fillRect(cx + hw + 2, y, 2, 1);
      ctx.fillStyle = c; ctx.fillRect(cx - hw, y, w, Math.round(th));
      ctx.fillStyle = lit;
      ctx.fillRect(cx - 2, y + Math.round(th * 0.4), 2, 2);
      ctx.fillRect(cx + 1, y + Math.round(th * 0.4), 2, 2);
    }
    ctx.fillStyle = "#d8b048"; ctx.fillRect(cx - 1, Math.round(baseY - tiers * th - 4), 2, 5);
  }
  function grandGate(ctx, cx, gy) {
    var V = "#7a2418", VD = "#4a1208", K = "#180a06";
    ctx.fillStyle = V; ctx.fillRect(cx - 40, 70, 9, gy - 70); ctx.fillRect(cx + 31, 70, 9, gy - 70);
    ctx.fillStyle = VD; ctx.fillRect(cx - 40, 70, 3, gy - 70); ctx.fillRect(cx + 31, 70, 3, gy - 70);
    ctx.fillStyle = K; ctx.fillRect(cx - 52, 62, 104, 6);            // lintel
    ctx.fillStyle = "#0c0a10"; ctx.fillRect(cx - 56, 56, 112, 6);    // roof
    ctx.fillStyle = "#1a1018"; ctx.fillRect(cx - 31, 84, 62, gy - 84); // dark opening
  }
  var KIT_PRINCESS = { gi: "#f0ede4", giSh: "#c8c4b8", band: "#e0c050", hair: "#241018" };

  function cutEmbers(ctx, t) {
    ctx.fillStyle = "rgba(232,150,80,0.55)";
    for (var i = 0; i < 9; i++) {
      var x = (i * 37 + Math.sin(t * 0.7 + i) * 9 + WIDTH) % WIDTH;
      var y = GROUND_Y - 8 - ((t * 9 + i * 23) % 74);
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }

  // Animated cinematic panel. t = seconds the panel has been on screen.
  function cut(ctx, scene, t) {
    var SP = KR.sprites, gy = GROUND_Y, EK = SP.ENEMY_KITS;
    function bob(seed) { return gy - (0.5 + 0.5 * Math.sin(t * 2.4 + seed)); } // subtle breathing
    if (scene === "castle") {
      cutSky(ctx, "night");
      cutMoon(ctx, 196, 50, 16 + Math.sin(t * 0.9) * 1.3);     // pulsing blood moon
      ridge(ctx, 0, 0, 118, 26, 42, "#241a38", 3);
      cutCastle(ctx, 120, 150, 4.4);
      cutFloor(ctx, gy, "#191222", "#0c0810");
      cutEmbers(ctx, t);
      // Faint rose glow from the highest tower window — the princess's chamber.
      // (At scale 4.4 the topmost visible tier sits near y=5; window row at y≈24.)
      var cwg = ctx.createRadialGradient(120, 25, 1, 120, 25, 14);
      cwg.addColorStop(0, "rgba(210,100,140,0.28)");
      cwg.addColorStop(1, "rgba(210,100,140,0)");
      ctx.fillStyle = cwg; ctx.fillRect(106, 12, 28, 28);
      ctx.fillStyle = "rgba(220,110,150,0.6)";
      ctx.fillRect(118, 24, 2, 2);   // the lit window itself, rose-tinted
    } else if (scene === "dungeon") {
      // Princess held captive — stone cell, iron bars, torch, moonlit window
      // Dark stone walls with block texture
      ctx.fillStyle = "#0c0a12"; ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#13101c";
      for (var dr = 0; dr < 9; dr++) {
        var deven = dr % 2 === 0;
        for (var dc = 0; dc < 10; dc++) {
          ctx.fillRect(dc * 32 + (deven ? 0 : 16), dr * 20, 30, 18);
        }
      }
      // Moonlit window (upper right) — her only contact with the outside world
      var mwx = 196, mwy = 24;
      var mspill = ctx.createRadialGradient(mwx + 12, mwy + 10, 2, mwx + 12, mwy + 10, 44);
      mspill.addColorStop(0, "rgba(140,150,210,0.20)"); mspill.addColorStop(1, "rgba(140,150,210,0)");
      ctx.fillStyle = mspill; ctx.fillRect(mwx - 24, mwy - 10, 72, 66);
      ctx.fillStyle = "#1c1830"; ctx.fillRect(mwx, mwy, 24, 18);
      ctx.fillStyle = "rgba(140,152,215,0.48)"; ctx.fillRect(mwx + 1, mwy + 1, 22, 16);
      ctx.fillStyle = "#0c0a18";
      ctx.fillRect(mwx + 11, mwy, 2, 18);  // window cross
      ctx.fillRect(mwx, mwy + 8, 24, 2);
      // Damp stone floor
      ctx.fillStyle = "#14102a"; ctx.fillRect(0, gy, WIDTH, HEIGHT - gy);
      ctx.fillStyle = "#1e1836"; ctx.fillRect(0, gy, WIDTH, 1);
      // Torch on left wall — warm amber flicker
      bossTorch(ctx, 26, 88, 0.5 + 0.5 * Math.abs(Math.sin(t * 5.6)));
      // Princess — idle, breathing, behind the bars (drawn first so bars overlay her)
      var pby = gy - (0.4 + 0.4 * Math.sin(t * 1.85));
      ctx.save(); ctx.globalAlpha = 0.90;
      SP.fighter(ctx, 165, Math.round(pby), { facing: -1, pose: "idle", kit: KIT_PRINCESS });
      ctx.restore();
      // Iron bars — vertical beams across the left two-thirds of the frame
      for (var bi = 0; bi < 8; bi++) {
        var bxi = 14 + bi * 15;
        ctx.fillStyle = "#0c0a16"; ctx.fillRect(bxi, 0, 5, HEIGHT);
        ctx.fillStyle = "#1c1a2c"; ctx.fillRect(bxi, 0, 1, HEIGHT); // edge highlight
      }
      ctx.fillStyle = "#0a0814"; ctx.fillRect(0, 0, 14, HEIGHT);    // solid wall edge
      ctx.fillStyle = "#0c0a16";
      ctx.fillRect(12, 54, 128, 5);   // horizontal cross-bar (upper)
      ctx.fillRect(12, 108, 128, 5);  // horizontal cross-bar (lower)
      // Torch light tinting the whole cell
      var tgl = ctx.createRadialGradient(26, 88, 6, 26, 88, 100);
      tgl.addColorStop(0, "rgba(230,145,65,0.14)"); tgl.addColorStop(1, "rgba(230,145,65,0)");
      ctx.fillStyle = tgl; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    } else if (scene === "setout") {
      var sc = t * 16;                                          // slow travel
      cutSky(ctx, "dusk");
      ridge(ctx, sc, 0.18, 110, 22, 52, "#3b2a55", 0);
      cutCastle(ctx, 234, 134, 1.7);
      ridge(ctx, sc, 0.5, 132, 20, 34, "#271e3c", 40);
      cutFloor(ctx, gy, "#2a1c12", "#120c08");
      SP.fighter(ctx, 60, gy, { facing: 1, pose: "run", phase: t * 1.6 }); // walking
    } else if (scene === "river") {
      var sc2 = t * 18;
      cutSky(ctx, "blood");
      ridge(ctx, sc2, 0.18, 116, 26, 46, "#3a1e3a", 9);
      cutCastle(ctx, 214, 118, 2.3);
      ridge(ctx, sc2, 0.4, 134, 18, 34, "#1f1426", 40);
      bridge(ctx, sc2); water(ctx, sc2); piers(ctx, sc2);
      SP.fighter(ctx, 56, gy, { facing: 1, pose: "run", phase: t * 1.6 }); // hero walks in place
      // guards belong to the world, so they scroll left with the bridge
      SP.fighter(ctx, 198 - sc2, bob(1), { facing: -1, pose: "idle", kit: EK[0] });
      SP.fighter(ctx, 234 - sc2, bob(2), { facing: -1, pose: "idle", kit: EK[1], rank: 1 });
    } else if (scene === "gates") {
      cutSky(ctx, "night");
      cutMoon(ctx, 210, 44, 13);
      cutCastle(ctx, 140, 118, 3.2);
      cutFloor(ctx, gy, "#191222", "#0c0810");
      grandGate(ctx, 140, gy);
      SP.fighter(ctx, 52, bob(0), { facing: 1, pose: "idle" });
      SP.fighter(ctx, 108, bob(1), { facing: -1, pose: "idle", kit: EK[2], rank: 2 });
      SP.fighter(ctx, 172, bob(3), { facing: -1, pose: "idle", kit: EK[1], rank: 2 });
    } else if (scene === "throne") {
      drawBoss(ctx, t * 2.2);                                   // torches flicker
      SP.boss(ctx, 150, gy, { facing: -1, pose: "idle" });
      var hx = -12 + Math.min(1, t / 2.2) * 72;                // hero strides in
      SP.fighter(ctx, hx, gy, { facing: 1, pose: t < 2.2 ? "run" : "idle", phase: t * 1.6 });
    } else if (scene === "cliff") {
      // Hero crests the clifftop and steps onto the palace approach road.
      // Full dusk sky + mountain panorama fill the background; the Act-1
      // wooden bridge road stretches to the right with the palace ahead.
      // The rocky ledge at the left edge shows the sheer height climbed.

      var edgeX = 46; // x where rocky cliff top meets the wooden bridge

      // Dusk sky across the full frame
      cutSky(ctx, "dusk");

      // Mountain panorama — static, hero has arrived and paused
      ridge(ctx, 0, 0, 100, 24, 54, "#3b2a55", 0);   // hazy far range
      ridge(ctx, 0, 0, 126, 18, 38, "#271e3c", 40);   // near range

      // Palace in the far distance — the goal, just visible ahead on the right
      cutCastle(ctx, 222, 134, 1.8);

      // ---- Bridge road from edgeX across the screen ----------------------
      var bdg = ctx.createLinearGradient(0, gy, 0, gy + 12);
      bdg.addColorStop(0, "#7a5630"); bdg.addColorStop(1, "#553b20");
      ctx.fillStyle = bdg;
      ctx.fillRect(edgeX, gy, WIDTH - edgeX, 12);
      ctx.fillStyle = "#a8763e";
      ctx.fillRect(edgeX, gy, WIDTH - edgeX, 1); // sunlit top edge
      // Plank seams + grain highlights
      for (var bpx = edgeX; bpx < WIDTH; bpx += 11) {
        ctx.fillStyle = "#3a2814"; ctx.fillRect(bpx, gy, 1, 12);
        ctx.fillStyle = "#8a6236"; ctx.fillRect(bpx + 2, gy + 2, 1, 9);
      }
      // Front support beam
      ctx.fillStyle = "#2e1f12";
      ctx.fillRect(edgeX, gy + 12, WIDTH - edgeX, 5);

      // River below the bridge — shows this is the same road from Act 1
      var rwg = ctx.createLinearGradient(0, gy + 17, 0, HEIGHT);
      rwg.addColorStop(0.0, "#6e5566");
      rwg.addColorStop(0.4, "#3c4866");
      rwg.addColorStop(1.0, "#1b2742");
      ctx.fillStyle = rwg;
      ctx.fillRect(edgeX, gy + 17, WIDTH - edgeX, HEIGHT - gy - 17);
      ctx.fillStyle = "#b89080"; // water surface sheen
      ctx.fillRect(edgeX, gy + 17, WIDTH - edgeX, 1);
      // Ripples + sunset glint on the water
      ctx.fillStyle = "#8a6f78";
      ctx.fillRect(edgeX + 12, gy + 22, 28, 1);
      ctx.fillRect(edgeX + 68, gy + 28, 22, 1);
      ctx.fillRect(edgeX + 128, gy + 24, 30, 1);
      ctx.fillStyle = "rgba(255,200,140,0.18)";
      for (var wy = gy + 19; wy < HEIGHT; wy += 3) {
        var ww = 8 + (wy % 5);
        ctx.fillRect(Math.round(164 + Math.sin(wy * 1.2) * 7 - ww / 2), wy, ww, 1);
      }

      // ---- Cliff face below the rocky ledge (left side) ------------------
      // Dark rock face visible below edgeX — conveys the sheer height climbed.
      var cfg = ctx.createLinearGradient(0, gy + 4, 0, HEIGHT);
      cfg.addColorStop(0, "#1c1830"); cfg.addColorStop(1, "#0a0814");
      ctx.fillStyle = cfg;
      ctx.fillRect(0, gy + 4, edgeX - 2, HEIGHT - gy - 4);
      // Horizontal rock strata lines
      ctx.fillStyle = "#2a264a";
      var strs = [gy + 10, gy + 20, gy + 33, gy + 48, gy + 65];
      for (var si = 0; si < strs.length; si++) {
        ctx.fillRect(5 + (si % 3) * 9, strs[si], 10 + (si * 7) % 18, 1);
      }
      // Vertical crack running down the face
      ctx.fillStyle = "#100e20";
      ctx.fillRect(edgeX - 14, gy + 4, 2, HEIGHT - gy - 4);

      // ---- Rocky cliff-top ledge surface (left of edgeX) ----------------
      // Rough purple-grey stone where the hero hauls themselves over the lip.
      ctx.fillStyle = "#2c2448";
      ctx.fillRect(0, gy - 3, edgeX + 2, 7);    // ledge slab
      ctx.fillStyle = "#3e3460";
      ctx.fillRect(0, gy - 3, edgeX + 2, 1);    // dusk-lit top face
      ctx.fillStyle = "#1a1630";
      ctx.fillRect(0, gy + 4, edgeX - 2, 2);    // shadow under the lip
      // Small surface chips for texture
      ctx.fillStyle = "#4a4070";
      ctx.fillRect(9, gy - 2, 5, 1);
      ctx.fillRect(22, gy - 1, 7, 1);
      ctx.fillRect(35, gy - 2, 4, 1);

      // Thin shadow where cliff edge meets bridge — depth transition
      ctx.fillStyle = "rgba(0,0,0,0.36)";
      ctx.fillRect(edgeX - 3, 0, 5, HEIGHT);

      // ---- Hero animation ------------------------------------------------
      // Phase 1 (t < ARRIVE): hero rises up over the rocky ledge, pulling in
      //   from below the cliff edge at the left.
      // Phase 2 (t >= ARRIVE): hero strides forward along the bridge road.
      var ARRIVE = 2.5;
      if (t < ARRIVE) {
        var cf = t / ARRIVE;
        var ce = 1 - (1 - cf) * (1 - cf); // ease-out
        // Rises from 34 px below ground up through the ledge, arrives at gy
        var hcy = Math.round(gy + 34 - 36 * ce);
        SP.fighter(ctx, edgeX - 6, hcy, { facing: 1, pose: "run", phase: t * 2.8 });
      } else {
        // Now on the bridge, striding toward the palace
        var wp = Math.min(1, (t - ARRIVE) / 1.6);
        var we = wp * (2 - wp); // ease-out
        SP.fighter(ctx, Math.round(edgeX + 4 + we * 52), gy,
                   { facing: 1, pose: "run", phase: t * 1.6 });
      }
    } else if (scene === "dawn") {
      cutSky(ctx, "dawn");
      cutMoon(ctx, 150, 150 - Math.min(1, t / 2.6) * 92, 18, true); // sun rises
      ridge(ctx, 0, 0, 112, 22, 52, "#9a7a86", 0);
      cutCastle(ctx, 150, 132, 2.6);
      ridge(ctx, 0, 0, 134, 18, 34, "#6a5a6a", 40);
      cutFloor(ctx, gy, "#7a5a44", "#4a3424");
      SP.fighter(ctx, 96, bob(0), { facing: 1, pose: "idle" });
      SP.fighter(ctx, 126, bob(2), { facing: -1, pose: "idle", kit: KIT_PRINCESS });
    }
  }

  return {
    draw: draw, gate: gate, gateFore: gateFore, torii: torii, drawBoss: drawBoss, cut: cut,
    WIDTH: WIDTH, HEIGHT: HEIGHT, GROUND_Y: GROUND_Y
  };
})();
