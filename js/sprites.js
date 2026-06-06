/* KARATE RHYTHM — sprite renderer
 *
 * Fighters are drawn procedurally from small rectangles (Apple II hi-res had a
 * tiny palette and chunky pixels, so blocky limbs suit the look) and posed by
 * state: a 2-frame run cycle, a flying jump-kick, and a knockout tumble.
 *
 * Colours follow Karateka: a cream-gi, black-haired, black-belt hero against
 * muted earth-toned palace guards.
 *
 * All coordinates are in the canvas's 280x192 internal space. fighter() sets
 * up its own transform: origin at the feet, +x forward, -y up.
 */
window.KR = window.KR || {};
KR.sprites = (function () {
  "use strict";

  var PAL = {
    black: "#15131a",
    white: "#e8e6d4",   // cream gi
    giSh:  "#c2bfa6",
    skin:  "#e0a878",
    skinD: "#b9794a",
    belt:  "#1a1820"    // black belt
  };

  // Palace guards in muted earth tones (no bright primaries).
  var ENEMY_KITS = [
    { gi: "#9c6b3e", giSh: "#6b4527", band: "#2a2018", hair: "#191410" }, // brown gi
    { gi: "#8a4038", giSh: "#5c2622", band: "#2a1818", hair: "#191410" }, // dark red
    { gi: "#566074", giSh: "#363e4e", band: "#1c1c22", hair: "#191410" }, // slate
    { gi: "#6f6a3a", giSh: "#474427", band: "#222016", hair: "#191410" }  // olive
  ];

  function r(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  }

  // ---- Poses (all face +x; feet at origin) -----------------------------
  function drawRun(ctx, k, phase) {
    var frameB = phase % 1 >= 0.5;

    // legs first (behind torso)
    if (!frameB) {
      // open stride: front leg forward, back leg back
      r(ctx, 2, -9, 3, 9, k.gi);  r(ctx, 3, -2, 5, 2, PAL.black); // front
      r(ctx, -4, -9, 3, 7, k.giSh); r(ctx, -6, -2, 5, 2, PAL.black); // back
    } else {
      // passing: support leg down, lead knee raised
      r(ctx, -1, -10, 3, 10, k.gi); r(ctx, -1, -2, 5, 2, PAL.black);
      r(ctx, 2, -9, 3, 3, k.gi); r(ctx, 3, -7, 3, 4, k.gi); r(ctx, 3, -4, 4, 2, PAL.black);
    }

    // torso + belt + head
    r(ctx, -3, -18, 7, 9, k.gi);
    r(ctx, -3, -18, 2, 9, k.giSh);   // shaded back edge
    r(ctx, 0, -18, 1, 6, k.giSh);    // gi seam
    r(ctx, -3, -12, 7, 2, k.band);   // belt
    r(ctx, -3, -25, 7, 7, k.skin);   // head
    r(ctx, -3, -25, 7, 3, k.hair);   // hair
    r(ctx, -3, -22, 1, 2, k.hair);   // sideburn
    r(ctx, 2, -21, 1, 1, PAL.black); // eye

    // arms swing opposite the legs
    if (!frameB) {
      r(ctx, 3, -17, 2, 5, k.gi);  r(ctx, 3, -12, 2, 2, k.skin);   // front low
      r(ctx, -4, -17, 2, 4, k.giSh); r(ctx, -4, -13, 2, 2, k.skin); // back up
    } else {
      r(ctx, 3, -18, 2, 4, k.gi);  r(ctx, 3, -14, 2, 2, k.skin);   // front up
      r(ctx, -4, -17, 2, 5, k.giSh); r(ctx, -4, -12, 2, 2, k.skin); // back low
    }
  }

  function drawKick(ctx, k) {
    // support leg tucked under, pointing down-back
    r(ctx, -3, -10, 3, 4, k.giSh);
    r(ctx, -5, -7, 3, 5, k.giSh);
    r(ctx, -6, -3, 4, 2, PAL.black);

    // torso reclined slightly back
    r(ctx, -4, -17, 7, 9, k.gi);
    r(ctx, -4, -17, 2, 9, k.giSh);
    r(ctx, -4, -11, 7, 2, k.band);    // belt

    // head
    r(ctx, -4, -24, 7, 7, k.skin);
    r(ctx, -4, -24, 7, 3, k.hair);
    r(ctx, 1, -20, 1, 1, PAL.black);

    // KICKING leg thrust straight forward
    r(ctx, 0, -11, 11, 3, k.gi);
    r(ctx, 0, -11, 11, 1, k.giSh);
    r(ctx, 10, -12, 5, 3, PAL.black); // shoe

    // arms: lead fist forward, trailing arm back for balance
    r(ctx, 0, -16, 4, 2, k.gi);  r(ctx, 4, -16, 2, 2, k.skin);
    r(ctx, -6, -15, 3, 2, k.giSh); r(ctx, -7, -15, 2, 2, k.skin);

    // little speed lines behind the foot
    r(ctx, 6, -16, 6, 1, k.giSh);
    r(ctx, 7, -7, 6, 1, k.giSh);
  }

  function drawHit(ctx, k) {
    // splayed knockout pose (usually drawn spinning by the caller)
    r(ctx, -4, -9, 3, 9, k.gi);  r(ctx, -6, -2, 4, 2, PAL.black);
    r(ctx, 2, -9, 3, 9, k.giSh); r(ctx, 3, -2, 4, 2, PAL.black);
    r(ctx, -3, -17, 7, 9, k.gi);
    r(ctx, -3, -11, 7, 2, k.band);
    r(ctx, -3, -24, 7, 7, k.skin);
    r(ctx, -3, -24, 7, 3, k.hair);
    r(ctx, -5, -21, 2, 4, k.giSh); // arms flung up
    r(ctx, 4, -21, 2, 4, k.gi);
    r(ctx, 0, -21, 2, 1, PAL.black); // dazed eyes (X)
    r(ctx, 1, -20, 2, 1, PAL.black);
  }

  // ---- Public draw -----------------------------------------------------
  // opts: { facing:1|-1, pose:'run'|'kick'|'hit', phase, kit, rot }
  function fighter(ctx, cx, feetY, opts) {
    var kit = opts.kit || {
      gi: PAL.white, giSh: PAL.giSh, band: PAL.belt, hair: PAL.black
    };
    var k = {
      gi: kit.gi, giSh: kit.giSh, band: kit.band,
      hair: kit.hair, skin: PAL.skin
    };

    ctx.save();
    ctx.translate(Math.round(cx), Math.round(feetY));
    if (opts.facing < 0) ctx.scale(-1, 1);
    if (opts.rot) {
      ctx.translate(0, -10);
      ctx.rotate(opts.rot);
      ctx.translate(0, 10);
    }

    if (opts.pose === "kick") drawKick(ctx, k);
    else if (opts.pose === "hit") drawHit(ctx, k);
    else drawRun(ctx, k, opts.phase || 0);

    ctx.restore();
  }

  function shadow(ctx, cx, groundY, w, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 0.28 : alpha;
    ctx.fillStyle = "#000";
    var h = Math.max(2, w * 0.32);
    ctx.beginPath();
    ctx.ellipse(Math.round(cx), Math.round(groundY), w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Impact starburst for a successful hit
  function spark(ctx, x, y, t, color) {
    var n = 6, len = 4 + t * 14, a = 1 - t;
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.strokeStyle = color || "#e0a020";
    ctx.lineWidth = 1;
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * Math.PI * 2 + t;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(ang) * (len * 0.3), y + Math.sin(ang) * (len * 0.3));
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctx.stroke();
    }
    ctx.restore();
  }

  return {
    PAL: PAL,
    ENEMY_KITS: ENEMY_KITS,
    fighter: fighter,
    shadow: shadow,
    spark: spark
  };
})();
