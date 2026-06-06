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

  // ---- Ground ----------------------------------------------------------
  function ground(ctx, scroll) {
    var g = ctx.createLinearGradient(0, GROUND_Y, 0, HEIGHT);
    g.addColorStop(0, "#3c2c1c");
    g.addColorStop(1, "#15100a");
    ctx.fillStyle = g;
    ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);

    // sunset-lit top rim
    ctx.fillStyle = "#5a3f24";
    ctx.fillRect(0, GROUND_Y, WIDTH, 2);
    ctx.fillStyle = "#b9824a";
    ctx.fillRect(0, GROUND_Y, WIDTH, 1);

    // faint flagstone seams (mid layer)
    var sp = 22, off = (scroll % sp);
    ctx.fillStyle = "#241a10";
    for (var x = -off; x < WIDTH; x += sp) {
      ctx.fillRect(Math.round(x), GROUND_Y + 6, 1, HEIGHT - GROUND_Y - 6);
    }
    ctx.fillStyle = "#48351f";
    for (var x2 = -off; x2 < WIDTH; x2 += sp) {
      ctx.fillRect(Math.round(x2 + 4), GROUND_Y + 10, 3, 1);
    }

    // fast foreground speed-streaks
    var sp2 = 30, off2 = ((scroll * 1.6) % sp2);
    ctx.fillStyle = "#543c22";
    for (var x3 = -off2; x3 < WIDTH; x3 += sp2) {
      ctx.fillRect(Math.round(x3), HEIGHT - 7, 12, 2);
    }
  }

  function draw(ctx, scroll) {
    sky(ctx);
    ridge(ctx, scroll, 0.08, 100, 22, 60, "#6a5d85", 11);  // hazy far range
    ridge(ctx, scroll, 0.16, 114, 30, 44, "#453a62", 29);  // mid range
    palace(ctx, scroll);
    ridge(ctx, scroll, 0.30, 132, 24, 34, "#271e3c", 53);  // near range
    ground(ctx, scroll);
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

  return { draw: draw, torii: torii, WIDTH: WIDTH, HEIGHT: HEIGHT, GROUND_Y: GROUND_Y };
})();
