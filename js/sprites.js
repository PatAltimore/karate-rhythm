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

  function pgon(ctx, pts, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath(); ctx.fill();
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

  // ---- Standing duel poses (idle / punch / block) ----------------------
  function drawIdle(ctx, k) {
    r(ctx, -5, -9, 3, 9, k.giSh);  r(ctx, -7, -2, 5, 2, PAL.black);  // back leg
    r(ctx, 2, -9, 3, 9, k.gi);     r(ctx, 2, -2, 5, 2, PAL.black);   // front leg
    r(ctx, -3, -18, 7, 9, k.gi);
    r(ctx, -3, -18, 2, 9, k.giSh);
    r(ctx, -3, -12, 7, 2, k.band);
    r(ctx, -3, -25, 7, 7, k.skin);
    r(ctx, -3, -25, 7, 3, k.hair);
    r(ctx, 2, -21, 1, 1, PAL.black);
    r(ctx, 3, -19, 2, 5, k.gi);    r(ctx, 3, -20, 2, 2, k.skin);     // front fist up
    r(ctx, -4, -17, 2, 4, k.giSh); r(ctx, -4, -18, 2, 2, k.skin);    // rear fist
  }

  function drawPunch(ctx, k) {
    r(ctx, -5, -9, 3, 9, k.giSh);  r(ctx, -7, -2, 5, 2, PAL.black);  // back leg
    r(ctx, 3, -9, 3, 9, k.gi);     r(ctx, 3, -2, 6, 2, PAL.black);   // front leg (lunge)
    r(ctx, -2, -18, 7, 9, k.gi);                                     // torso leaning in
    r(ctx, -2, -18, 2, 9, k.giSh);
    r(ctx, -2, -12, 7, 2, k.band);
    r(ctx, -2, -25, 7, 7, k.skin);
    r(ctx, -2, -25, 7, 3, k.hair);
    r(ctx, 3, -21, 1, 1, PAL.black);
    r(ctx, 2, -17, 9, 3, k.gi);    r(ctx, 10, -18, 3, 3, k.skin);    // straight punch
    r(ctx, 6, -20, 5, 1, k.giSh);                                    // speed line
    r(ctx, -4, -15, 3, 2, k.giSh); r(ctx, -5, -15, 2, 2, k.skin);    // chambered rear fist
  }

  function drawBlock(ctx, k) {
    r(ctx, -5, -8, 3, 8, k.giSh);  r(ctx, -7, -2, 5, 2, PAL.black);  // braced
    r(ctx, 2, -8, 3, 8, k.gi);     r(ctx, 2, -2, 5, 2, PAL.black);
    r(ctx, -4, -17, 7, 9, k.gi);
    r(ctx, -4, -17, 2, 9, k.giSh);
    r(ctx, -4, -11, 7, 2, k.band);
    r(ctx, -4, -24, 7, 7, k.skin);
    r(ctx, -4, -24, 7, 3, k.hair);
    r(ctx, 1, -20, 1, 1, PAL.black);
    r(ctx, 0, -23, 2, 9, k.gi);    r(ctx, 0, -23, 2, 2, k.skin);     // raised forearm
    r(ctx, -2, -19, 6, 2, k.giSh); r(ctx, 4, -19, 2, 2, k.skin);     // crossed guard
  }

  // Bow pose: formal karate bow before the Shogun duel.
  // Legs upright, torso pitched ~45° forward, head bowed down.
  function drawBow(ctx, k) {
    // legs – straight, together
    r(ctx, -3, -10, 3, 10, k.giSh); r(ctx, -5, -2, 6, 2, PAL.black);
    r(ctx,  1, -10, 3, 10, k.gi);   r(ctx,  0, -2, 5, 2, PAL.black);
    // belt at the hinge point
    r(ctx, -2, -12, 7, 3, k.band);
    // torso pitched forward – step rects rightward as they go up
    r(ctx, -1, -16, 7, 4, k.gi);    r(ctx, -1, -16, 2, 4, k.giSh); // lower back
    r(ctx,  1, -19, 7, 3, k.gi);    r(ctx,  1, -19, 2, 3, k.giSh); // upper torso
    r(ctx,  0, -16, 1, 7, k.giSh);  // gi seam along the lean
    // head bowed well forward and low
    r(ctx, 4, -23, 7, 7, k.skin);
    r(ctx, 4, -23, 7, 3, k.hair);
    r(ctx, 4, -22, 1, 2, k.hair);   // sideburn
    r(ctx, 9, -19, 1, 1, PAL.black); // downward-cast eye
    // arms hang forward and slightly down
    r(ctx, 3, -18, 3, 7, k.gi);     r(ctx, 3, -12, 3, 2, k.skin);
    r(ctx, 5, -17, 2, 6, k.giSh);   r(ctx, 5, -12, 2, 2, k.skin);
  }

  // Head/torso top-left anchors per pose, for the helmet/armour overlay.
  var ANCHOR = {
    run:   { head: { x: -3, y: -25 }, torso: { x: -3, y: -18 } },
    idle:  { head: { x: -3, y: -25 }, torso: { x: -3, y: -18 } },
    punch: { head: { x: -2, y: -25 }, torso: { x: -2, y: -18 } },
    block: { head: { x: -4, y: -24 }, torso: { x: -4, y: -17 } },
    kick:  { head: { x: -4, y: -24 }, torso: { x: -4, y: -17 } },
    hit:   { head: { x: -3, y: -24 }, torso: { x: -3, y: -17 } },
    bow:   { head: { x:  4, y: -23 }, torso: { x:  1, y: -19 } }
  };

  // Kabuto helmet + dō armour overlay for ranked guards. rank: 1 light, 2 full.
  function drawRank(ctx, k, rank, head, torso) {
    var armor = k.armor || "#2c2433", hi = k.armorHi || "#4a3d56", crest = k.crest || "#d8b048";
    var hx = head.x, hy = head.y, tx = torso.x, ty = torso.y;

    // chest plate (dō) over the gi
    r(ctx, tx, ty + 1, 7, 6, armor);
    r(ctx, tx, ty + 2, 7, 1, hi);
    r(ctx, tx, ty + 4, 7, 1, hi);
    if (rank >= 2) { r(ctx, tx - 2, ty, 3, 2, armor); r(ctx, tx + 6, ty, 3, 2, armor); } // sode

    // helmet bowl over the hair
    r(ctx, hx - 1, hy, 9, 3, armor);
    r(ctx, hx, hy - 2, 7, 2, armor);
    r(ctx, hx - 1, hy + 2, 9, 1, hi);          // brow rim
    r(ctx, hx - 2, hy + 2, 1, 4, armor);       // neck guard (shikoro)
    r(ctx, hx + 8, hy + 2, 1, 4, armor);

    if (rank >= 2) {
      pgon(ctx, [hx + 1, hy, hx - 3, hy - 6, hx, hy], crest);        // crescent horns
      pgon(ctx, [hx + 6, hy, hx + 10, hy - 6, hx + 7, hy], crest);
      r(ctx, hx + 2, hy - 2, 3, 2, crest);                          // crest centre
      r(ctx, hx, hy + 5, 7, 2, "#1b151f");                          // menpo (mask)
      r(ctx, hx + 1, hy + 5, 5, 1, "#46202a");
    } else {
      r(ctx, hx + 2, hy - 2, 3, 2, crest);                          // small crest
    }
  }

  // ---- Public draw -----------------------------------------------------
  // opts: { facing:1|-1, pose:'run'|'kick'|'hit'|'idle'|'punch'|'block', phase, kit, rot, rank }
  function fighter(ctx, cx, feetY, opts) {
    var kit = opts.kit || {
      gi: PAL.white, giSh: PAL.giSh, band: PAL.belt, hair: PAL.black
    };
    var k = {
      gi: kit.gi, giSh: kit.giSh, band: kit.band, hair: kit.hair, skin: PAL.skin,
      armor: kit.armor, armorHi: kit.armorHi, crest: kit.crest
    };
    var pose = opts.pose || "run";

    ctx.save();
    ctx.translate(Math.round(cx), Math.round(feetY));
    if (opts.facing < 0) ctx.scale(-1, 1);
    if (opts.rot) {
      ctx.translate(0, -10);
      ctx.rotate(opts.rot);
      ctx.translate(0, 10);
    }

    if (pose === "kick") drawKick(ctx, k);
    else if (pose === "hit") drawHit(ctx, k);
    else if (pose === "idle") drawIdle(ctx, k);
    else if (pose === "punch") drawPunch(ctx, k);
    else if (pose === "block") drawBlock(ctx, k);
    else if (pose === "bow") drawBow(ctx, k);
    else drawRun(ctx, k, opts.phase || 0);

    if (opts.rank) {
      var a = ANCHOR[pose] || ANCHOR.run;
      drawRank(ctx, k, opts.rank, a.head, a.torso);
    }

    // Long hair: flowing blonde tresses down the back (used by the princess).
    // Drawn last so it overlaps the torso behind the head.
    if (opts.kit && opts.kit.longhair) {
      var hc = k.hair;
      r(ctx, -5, -23, 3, 16, hc);   // main fall behind the head/back
      r(ctx, -6, -20, 2, 11, hc);   // outer wisp
      r(ctx, -5, -7,  4,  5, hc);   // lower fan — splays slightly at the end
      r(ctx, -4, -25, 2,  3, hc);   // top cap blending into hair on head
    }

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

  // ---- Hawk (flies in left; broad-winged soar that folds into a dive) --
  // cx, cy = body centre. opts: { frame, pose:'fly'|'dive' }. Always faces left.
  // Compact body + a wide (~26px) bent wingspan to read as a raptor, not a duck.
  function hawk(ctx, cx, cy, opts) {
    cx = Math.round(cx); cy = Math.round(cy);
    var body = "#6a4a2c", dark = "#3a2614", wing = "#5a3e22", wingD = "#2e2012",
        belly = "#9a7a4c", beak = "#e0a030", eye = "#15131a", talon = "#241a0e";

    function head(hy, by) {
      r(ctx, cx - 7, by - 2, 4, 3, body);     // head
      r(ctx, cx - 9, hy, 2, 2, beak);         // hooked beak
      r(ctx, cx - 9, hy + 2, 1, 1, beak);     // hook
      r(ctx, cx - 5, by - 1, 1, 1, eye);
    }

    if (opts.pose === "dive") {
      // stoop: wings swept back, body pitched down, talons thrust forward
      pgon(ctx, [cx - 1, cy - 2, cx + 6, cy - 5, cx + 12, cy - 5, cx + 5, cy - 1], wingD);
      r(ctx, cx + 4, cy - 1, 5, 2, dark);                         // swept tail
      r(ctx, cx - 4, cy - 2, 9, 4, body);                         // body
      r(ctx, cx - 4, cy, 9, 2, belly);
      head(cy + 1, cy + 1);
      pgon(ctx, [cx - 1, cy - 1, cx + 5, cy - 3, cx + 10, cy - 2, cx + 4, cy + 1], wing);
      r(ctx, cx - 6, cy + 2, 2, 4, talon);                        // talons
      r(ctx, cx - 3, cy + 2, 2, 4, talon);
      return;
    }

    // soaring flap: tips swing from high (up-stroke) to flat spread (down-stroke)
    var up = ((opts.frame | 0) % 2) === 0;
    var tipY = up ? cy - 9 : cy + 2;
    var wristY = up ? cy - 5 : cy - 1;

    // far wing (trailing, behind body)
    pgon(ctx, [cx + 1, cy - 1, cx + 6, wristY, cx + 13, tipY, cx + 9, cy + 1], wingD);
    r(ctx, cx + 12, tipY, 2, 1, wingD);                           // splayed tip
    // tail (fanned)
    r(ctx, cx + 4, cy, 5, 3, dark);
    r(ctx, cx + 8, cy + 1, 2, 1, dark);
    // body + head
    r(ctx, cx - 4, cy - 2, 9, 4, body);
    r(ctx, cx - 4, cy, 9, 2, belly);
    head(cy - 1, cy);
    // near wing (leading, in front) — broad, lighter
    pgon(ctx, [cx - 1, cy - 1, cx - 6, wristY, cx - 13, tipY, cx - 9, cy + 1], wing);
    r(ctx, cx - 13, tipY, 2, 1, wing);                            // splayed tip
  }

  // ---- The Shogun boss (large, armoured, horned kabuto) ----------------
  // ~42px tall. opts: { facing, pose:'idle'|'windup'|'attack'|'hit'|'defeated', rot }
  function bossHead(ctx, B, hx, hy) {
    r(ctx, hx, hy + 2, 9, 6, B.skin);                 // face (mostly masked)
    r(ctx, hx, hy + 5, 9, 4, B.mask);                 // menpo
    r(ctx, hx, hy + 6, 9, 1, B.maskHi);
    r(ctx, hx + 1, hy + 4, 2, 1, PAL.black);          // glaring eyes
    r(ctx, hx + 6, hy + 4, 2, 1, PAL.black);
    r(ctx, hx - 1, hy, 11, 4, B.armor);               // helmet bowl
    r(ctx, hx, hy - 2, 9, 2, B.armor);
    r(ctx, hx - 1, hy + 3, 11, 1, B.gold);            // brow band
    r(ctx, hx - 3, hy + 3, 2, 5, B.plate);            // neck guard
    r(ctx, hx + 10, hy + 3, 2, 5, B.plate);
    pgon(ctx, [hx + 2, hy, hx - 4, hy - 12, hx - 1, hy - 2], B.gold); // tall horns
    pgon(ctx, [hx + 7, hy, hx + 13, hy - 12, hx + 10, hy - 2], B.gold);
    r(ctx, hx + 3, hy - 3, 3, 3, B.gold);             // crest disc
  }

  function boss(ctx, cx, feetY, opts) {
    var B = {
      armor: "#2c1c24", plate: "#46232e", gold: "#d8b048",
      mask: "#5a1e26", maskHi: "#7a2a32", skin: "#e0a878"
    };
    var pose = opts.pose || "idle";
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(feetY));
    if (opts.facing < 0) ctx.scale(-1, 1);
    if (opts.rot) { ctx.translate(0, -16); ctx.rotate(opts.rot); ctx.translate(0, 16); }

    if (pose === "defeated") {
      r(ctx, -9, -7, 18, 7, B.armor);                 // collapsed
      r(ctx, -6, -19, 14, 12, B.armor);
      for (var ly = -17; ly <= -9; ly += 3) r(ctx, -6, ly, 14, 1, B.plate);
      r(ctx, -10, -19, 5, 6, B.plate); r(ctx, 5, -19, 5, 6, B.plate);
      bossHead(ctx, B, -3, -25);
      ctx.restore();
      return;
    }

    var lean = pose === "windup" ? -3 : pose === "hit" ? -4 : 0;

    // legs
    if (pose === "attack") {
      r(ctx, -7, -14, 5, 14, B.armor); r(ctx, -9, -3, 6, 3, PAL.black);   // planted
      r(ctx, 2, -12, 12, 4, B.armor);  r(ctx, 13, -13, 4, 4, PAL.black);  // lead strike
    } else {
      r(ctx, -8, -14, 5, 14, B.armor); r(ctx, -10, -3, 6, 3, PAL.black);
      r(ctx, 3, -14, 5, 14, B.armor);  r(ctx, 3, -3, 6, 3, PAL.black);
      r(ctx, -6, -16, 14, 4, B.plate); r(ctx, -6, -14, 14, 1, B.armor);   // tassets
    }

    // torso (dō) with lacing + obi + big sode
    r(ctx, -6 + lean, -30, 14, 16, B.armor);
    for (var ty = -28; ty <= -18; ty += 3) r(ctx, -6 + lean, ty, 14, 1, B.plate);
    r(ctx, -6 + lean, -30, 3, 16, PAL.black);
    r(ctx, -6 + lean, -16, 14, 2, B.gold);
    r(ctx, -10 + lean, -31, 5, 7, B.plate); r(ctx, -10 + lean, -31, 5, 1, B.gold);
    r(ctx, 5 + lean, -31, 5, 7, B.plate);   r(ctx, 5 + lean, -31, 5, 1, B.gold);

    bossHead(ctx, B, -4 + lean, -42);

    // arms per pose
    if (pose === "attack") {
      r(ctx, 6 + lean, -28, 10, 4, B.armor); r(ctx, 15 + lean, -29, 4, 4, B.skin); // punch
      r(ctx, -8 + lean, -26, 4, 3, B.plate);
    } else if (pose === "windup") {
      r(ctx, -11 + lean, -28, 4, 6, B.armor); r(ctx, -12 + lean, -23, 3, 3, B.skin);
      r(ctx, 4 + lean, -30, 4, 4, B.plate);
    } else if (pose === "hit") {
      r(ctx, -9 + lean, -30, 3, 5, B.plate); r(ctx, 6 + lean, -30, 3, 5, B.plate);
    } else { // idle guard
      r(ctx, 5 + lean, -28, 4, 6, B.armor); r(ctx, 5 + lean, -30, 4, 3, B.skin);
      r(ctx, -7 + lean, -28, 4, 6, B.plate); r(ctx, -7 + lean, -30, 4, 3, B.skin);
    }
    ctx.restore();
  }

  return {
    PAL: PAL,
    ENEMY_KITS: ENEMY_KITS,
    fighter: fighter,
    hawk: hawk,
    boss: boss,
    shadow: shadow,
    spark: spark
  };
})();
