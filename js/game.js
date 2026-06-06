/* KARATE RHYTHM — game logic, input, and the render loop.
 *
 * The runner is endless: the world always scrolls and the hero always runs in
 * place. Foes march in from the right and reach striking range exactly on a
 * musical beat. A click/tap/Space launches a flying jump-kick; if a foe is in
 * the beat-window it is felled, otherwise you whiff and bleed strength. Foes
 * that slip past also cost strength. Zero strength ends the run.
 *
 * Difficulty climbs through open-ended levels: each level packs a denser
 * rhythm chart, a shorter approach, and faster scroll. Every new level is
 * heralded by a vermilion torii gate that scrolls in for the hero to run
 * through.
 */
(function () {
  "use strict";

  var audio = KR.audio, S = KR.sprites, BG = KR.bg;
  var W = BG.WIDTH, H = BG.HEIGHT, GROUND_Y = BG.GROUND_Y;

  // ---- Tunable constants ----------------------------------------------
  var PLAYER_X = 60;
  var ENEMY_SPAWN_X = 300;
  var ENEMY_CONTACT_X = 88;        // x where a foe lands on its beat

  var INTRO_BEATS = 8;             // grace beats before foes appear
  var LEVEL_BEATS = 32;            // beats per difficulty level (8 bars)
  var SUB = 2;                     // arrival slots per beat (eighth-note grid)
  var GATE_LEAD_BEATS = 8;         // spawn the torii this far before a boundary

  var HIT_PERFECT = 0.07;          // +/- seconds for a perfect strike
  var HIT_GOOD = 0.15;             // +/- seconds still counts as a hit

  var WHIFF_COST = 6;              // strength lost on a mistimed kick
  var PASS_COST = 14;              // strength lost when a foe gets through
  var HIT_HEAL = 2;                // strength regained on a clean strike
  var START_STRENGTH = 100;

  var SCROLL_BASE = 46;            // px/sec world scroll (x level multiplier)
  var KICK_DURATION = 0.34;
  var JUMP_HEIGHT = 17;
  var GRAVITY = 540;

  // Arrival density charts at eighth-note resolution, one bar = 8 slots.
  // Slot 0 is the downbeat (lands with the kick drum).
  var DENSITY = [
    [1,0,0,0, 1,0,0,0], // d0  2 per bar (quarter notes, sparse)
    [1,0,1,0, 1,0,1,0], // d1  4 per bar (every beat)
    [1,0,1,0, 1,0,1,1], // d2  + an eighth
    [1,0,1,1, 1,0,1,1], // d3  eighths creeping in
    [1,1,1,0, 1,1,1,1], // d4  busy
    [1,1,1,1, 1,1,1,1]  // d5  every eighth (max)
  ];

  // Per level: [densityIndex, travelBeats, scrollMul]. Levels past the table
  // hold at the hardest row, so the run can go forever.
  var LEVELS = [
    null,
    [0, 4.0, 1.00],
    [1, 4.0, 1.06],
    [1, 3.5, 1.12],
    [2, 3.5, 1.18],
    [2, 3.0, 1.24],
    [3, 3.0, 1.30],
    [3, 2.5, 1.36],
    [4, 2.5, 1.42],
    [4, 2.5, 1.48],
    [5, 2.5, 1.54]
  ];

  function levelConfig(level) {
    var c = LEVELS[Math.max(1, Math.min(level, LEVELS.length - 1))];
    return { chart: DENSITY[c[0]], travelBeats: c[1], scrollMul: c[2] };
  }
  function levelForBeat(beat) {
    if (beat < INTRO_BEATS) return 1;
    return 1 + Math.floor((beat - INTRO_BEATS) / LEVEL_BEATS);
  }
  function boundaryBeat(level) { return INTRO_BEATS + (level - 1) * LEVEL_BEATS; }

  var PLAYER_KIT = { gi: S.PAL.white, giSh: S.PAL.giSh, band: S.PAL.belt, hair: S.PAL.black };

  // ---- State ----------------------------------------------------------
  var canvas, ctx, hud, popupLayer, scoreEl, comboEl, fillEl, beatDot, levelEl, muteBtn;
  var titleEl, gameoverEl;

  var state = "title";            // title | playing | over
  var paused = false;
  var viewScale = 1;

  var strength, score, kills, combo, bestCombo;
  var best = 0;
  var scrollX, elapsed, nextSlot, nextGateLevel, displayLevel;
  var enemies = [], sparks = [], gates = [];
  var player = { runPhase: 0, kicking: false, kickT: 0 };

  var shakeT = 0, shakeDur = 0.2, shakeMag = 0;
  var flashT = 0, flashDanger = 0;
  var lastTime = 0;

  // ---- Helpers --------------------------------------------------------
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function shake(mag, dur) { shakeMag = mag; shakeDur = dur; shakeT = dur; }

  function popup(text, cls, gx, gy) {
    if (gy == null) gy = GROUND_Y - 34;
    var d = document.createElement("div");
    d.className = "popup " + cls;
    d.textContent = text;
    d.style.left = (gx * viewScale) + "px";
    d.style.top = (gy * viewScale) + "px";
    popupLayer.appendChild(d);
    d.addEventListener("animationend", function () { d.remove(); });
  }

  function addSpark(x, y, quality) {
    sparks.push({ x: x, y: y, t: 0, color: quality === "perfect" ? "#f6cf6a" : "#e8e6d4" });
  }

  // ---- Spawning & resolution ------------------------------------------
  function spawnEnemy(arrivalBeat, travelBeats) {
    var kit = S.ENEMY_KITS[Math.floor(arrivalBeat * 2) % S.ENEMY_KITS.length];
    enemies.push({
      arrivalTime: audio.getBeatTime(arrivalBeat),
      spawnTime: audio.getBeatTime(arrivalBeat - travelBeats),
      x: ENEMY_SPAWN_X, y: GROUND_Y,
      state: "run", resolved: false, passed: false,
      runPhase: Math.random(), kit: kit,
      vx: 0, vy: 0, rot: 0, spin: 0, deadT: 0
    });
  }

  function spawnGate(level) {
    gates.push({ level: level, spawnScroll: scrollX, screenX: W + 24, triggered: false });
  }

  function killEnemy(e, quality) {
    e.resolved = true;
    e.state = "dead";
    e.deadT = 0;
    e.vx = 80 + Math.random() * 60;
    e.vy = -150 - Math.random() * 50;
    e.spin = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 4);

    kills++;
    combo++;
    if (combo > bestCombo) bestCombo = combo;
    var base = quality === "perfect" ? 120 : 70;
    var mult = 1 + Math.floor(combo / 5) * 0.5;
    score += Math.round(base * mult);
    strength = Math.min(100, strength + HIT_HEAL);

    addSpark(76, GROUND_Y - 12, quality);
    flashT = 0.12;
    popup(quality === "perfect" ? "PERFECT" : "GOOD", quality, e.x, GROUND_Y - 30);
    if (combo > 1 && combo % 5 === 0) popup(combo + " COMBO!", "good", PLAYER_X + 18, GROUND_Y - 48);
    audio.playHit(quality);
  }

  function whiff() {
    combo = 0;
    strength -= WHIFF_COST;
    shake(2.5, 0.16);
    popup("MISS", "miss", PLAYER_X + 28, GROUND_Y - 30);
    audio.playMiss();
    if (strength <= 0) gameOver();
  }

  function registerPass(e) {
    e.resolved = true;
    e.passed = true;
    combo = 0;
    strength -= PASS_COST;
    shake(4.5, 0.3);
    flashDanger = 0.16;
    popup("HIT!", "miss", PLAYER_X + 6, GROUND_Y - 34);
    audio.playMiss();
    if (strength <= 0) gameOver();
  }

  function attack() {
    if (state !== "playing") return;
    player.kicking = true;
    player.kickT = 0;

    var t = audio.currentTime;
    var target = null, bestErr = Infinity;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.resolved || e.state !== "run") continue;
      var err = Math.abs(t - e.arrivalTime);
      if (err < bestErr) { bestErr = err; target = e; }
    }
    if (target && bestErr <= HIT_GOOD) {
      killEnemy(target, bestErr <= HIT_PERFECT ? "perfect" : "good");
    } else {
      whiff();
    }
  }

  // ---- Update ---------------------------------------------------------
  function update(dt) {
    var curBeat = (audio.ready && state === "playing") ? audio.getCurrentBeat() : 0;
    var scrollMul = (state === "playing") ? levelConfig(levelForBeat(curBeat)).scrollMul : 1;

    // The world always scrolls and the hero always runs (even on the title).
    scrollX += SCROLL_BASE * dt * scrollMul;
    player.runPhase += dt * 7;
    if (player.kicking) {
      player.kickT += dt;
      if (player.kickT >= KICK_DURATION) player.kicking = false;
    }

    if (state === "playing" && audio.ready) {
      elapsed += dt;
      var now = audio.currentTime;

      // Spawn any foes whose march-in time has arrived (eighth-note slots).
      var guard = 0;
      while (true) {
        var arrivalBeat = nextSlot / SUB;
        var cfg = arrivalBeat < INTRO_BEATS ? null : levelConfig(levelForBeat(arrivalBeat));
        var travel = cfg ? cfg.travelBeats : 4.0;
        if (now < audio.getBeatTime(arrivalBeat - travel)) break;
        if (cfg && cfg.chart[((nextSlot % (4 * SUB)) + (4 * SUB)) % (4 * SUB)] === 1) {
          spawnEnemy(arrivalBeat, travel);
        }
        nextSlot++;
        if (++guard > 512) break;
      }

      // Schedule a torii gate ahead of each level boundary.
      guard = 0;
      while (curBeat >= boundaryBeat(nextGateLevel) - GATE_LEAD_BEATS) {
        spawnGate(nextGateLevel);
        nextGateLevel++;
        if (++guard > 64) break;
      }

      // March foes in, lock-stepped to the music clock.
      for (var i = enemies.length - 1; i >= 0; i--) {
        var e = enemies[i];
        if (e.state === "run") {
          var p = (now - e.spawnTime) / (e.arrivalTime - e.spawnTime);
          e.x = lerp(ENEMY_SPAWN_X, ENEMY_CONTACT_X, p);
          e.runPhase += dt * 6;
          if (!e.resolved && now > e.arrivalTime + HIT_GOOD) registerPass(e);
          if (e.x < -30) enemies.splice(i, 1);
        } else { // dead — tumble away
          e.deadT += dt;
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          e.vy += GRAVITY * dt;
          e.rot += e.spin * dt;
          if (e.y > GROUND_Y + 50 || e.deadT > 1.4) enemies.splice(i, 1);
        }
      }
    }

    // Torii gates ride the foreground; crossing the hero ushers in the level.
    for (var gi = gates.length - 1; gi >= 0; gi--) {
      var g = gates[gi];
      g.screenX = (W + 24) - (scrollX - g.spawnScroll);
      if (!g.triggered && g.screenX <= PLAYER_X) {
        g.triggered = true;
        displayLevel = g.level;
        popup("LEVEL " + g.level, "level", W / 2, 44);
        flashT = Math.max(flashT, 0.14);
      }
      if (g.screenX < -60) gates.splice(gi, 1);
    }

    for (var s = sparks.length - 1; s >= 0; s--) {
      sparks[s].t += dt / 0.35;
      if (sparks[s].t >= 1) sparks.splice(s, 1);
    }
    if (shakeT > 0) shakeT -= dt;
    if (flashT > 0) flashT -= dt;
    if (flashDanger > 0) flashDanger -= dt;
  }

  // ---- Render ---------------------------------------------------------
  function drawFoe(e) {
    if (e.state === "run") S.shadow(ctx, e.x, GROUND_Y, 16, 0.28);
    S.fighter(ctx, e.x, e.y, {
      facing: -1,
      pose: e.state === "dead" ? "hit" : "run",
      phase: e.runPhase, kit: e.kit, rot: e.rot
    });
  }

  function drawPlayer() {
    var yOff = 0, pose = "run";
    if (player.kicking) {
      pose = "kick";
      var kp = player.kickT / KICK_DURATION;
      yOff = -Math.sin(kp * Math.PI) * JUMP_HEIGHT;
    }
    S.shadow(ctx, PLAYER_X, GROUND_Y, 16, 0.28 * (1 - (-yOff) / JUMP_HEIGHT * 0.7));
    S.fighter(ctx, PLAYER_X, GROUND_Y + yOff, {
      facing: 1, pose: pose, phase: player.runPhase, kit: PLAYER_KIT
    });
  }

  function render() {
    var ox = 0, oy = 0;
    if (shakeT > 0) {
      var m = shakeMag * (shakeT / shakeDur);
      ox = (Math.random() * 2 - 1) * m;
      oy = (Math.random() * 2 - 1) * m;
    }

    ctx.save();
    ctx.translate(Math.round(ox), Math.round(oy));
    BG.draw(ctx, scrollX);

    // torii gates sit between the scenery and the fighters, so the hero runs
    // through them (framed by the pillars, the lintel passing overhead).
    for (var gi = 0; gi < gates.length; gi++) BG.torii(ctx, gates[gi].screenX, GROUND_Y);

    enemies.sort(function (a, b) { return b.x - a.x; });
    for (var i = 0; i < enemies.length; i++) drawFoe(enemies[i]);
    drawPlayer();
    for (var s = 0; s < sparks.length; s++) S.spark(ctx, sparks[s].x, sparks[s].y, sparks[s].t, sparks[s].color);
    ctx.restore();

    if (flashT > 0) {
      ctx.fillStyle = "rgba(255,255,255," + (flashT / 0.14 * 0.20) + ")";
      ctx.fillRect(0, 0, W, H);
    }
    if (flashDanger > 0) {
      ctx.fillStyle = "rgba(200,40,40," + (flashDanger / 0.16 * 0.4) + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---- HUD ------------------------------------------------------------
  function updateHUD() {
    scoreEl.textContent = score;
    comboEl.textContent = combo > 1 ? "x" + combo : "";
    levelEl.textContent = displayLevel;

    var pct = clamp(strength, 0, 100);
    fillEl.style.width = pct + "%";
    if (pct < 30) fillEl.classList.add("low"); else fillEl.classList.remove("low");

    if (audio.ready && state === "playing") {
      var beat = audio.getCurrentBeat();
      var frac = beat - Math.floor(beat);
      var pulse = 1 + 0.7 * (1 - clamp(frac / 0.4, 0, 1));
      beatDot.style.transform = "scale(" + pulse.toFixed(3) + ")";
      beatDot.style.background = frac < 0.12 ? "#e0a020" : "#3a3a4a";
    }
  }

  // ---- Game flow ------------------------------------------------------
  function resetState() {
    strength = START_STRENGTH;
    score = 0; kills = 0; combo = 0; bestCombo = 0;
    enemies.length = 0; sparks.length = 0; gates.length = 0;
    scrollX = 0; elapsed = 0; nextSlot = 0; nextGateLevel = 2; displayLevel = 1;
    player.kicking = false; player.kickT = 0;
    shakeT = 0; flashT = 0; flashDanger = 0;
  }

  function startGame() {
    resetState();
    titleEl.classList.add("hidden");
    gameoverEl.classList.add("hidden");
    hud.style.visibility = "visible";

    state = "playing";
    audio.start();
    lastTime = performance.now();
  }

  function gameOver() {
    if (state === "over") return;
    state = "over";
    strength = 0;
    audio.stop();
    audio.playGameOver();

    best = Math.max(best, score);
    try { localStorage.setItem("kr_best", String(best)); } catch (e) {}

    document.getElementById("final-score").textContent = score;
    document.getElementById("best-score").textContent = best;
    document.getElementById("final-kills").textContent = kills;
    document.getElementById("final-combo").textContent = bestCombo;
    document.getElementById("final-level").textContent = displayLevel;
    gameoverEl.classList.remove("hidden");
  }

  // ---- Layout ---------------------------------------------------------
  function layout() {
    var maxW = window.innerWidth, maxH = window.innerHeight;
    var scale = Math.min(maxW / W, maxH / H);
    var w = Math.max(1, Math.floor(W * scale));
    var h = Math.max(1, Math.floor(H * scale));
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";

    var gx = Math.floor((maxW - w) / 2);
    var gy = Math.floor((maxH - h) / 2);
    hud.style.left = gx + "px";
    hud.style.top = gy + "px";
    hud.style.width = w + "px";
    hud.style.height = h + "px";
    viewScale = w / W;
  }

  // ---- Input ----------------------------------------------------------
  function bindInput() {
    var stage = document.getElementById("game");
    stage.addEventListener("pointerdown", function (e) {
      if (state !== "playing") return;
      if (e.target.closest && e.target.closest("#mute-btn")) return;
      e.preventDefault();
      attack();
    });

    window.addEventListener("keydown", function (e) {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        if (state === "playing") attack();
        else startGame();
      } else if (e.key === "m" || e.key === "M") {
        toggleMute();
      }
    });

    document.getElementById("start-btn").addEventListener("click", startGame);
    document.getElementById("restart-btn").addEventListener("click", startGame);
    muteBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleMute();
    });

    window.addEventListener("resize", layout);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        paused = true;
        if (state === "playing") audio.suspend();
      } else {
        paused = false;
        if (state === "playing") audio.resume();
        lastTime = performance.now();
      }
    });
  }

  function toggleMute() {
    var m = audio.toggleMute();
    muteBtn.classList.toggle("muted", m);
  }

  // ---- Boot -----------------------------------------------------------
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = (now - lastTime) / 1000;
    lastTime = now;
    if (paused) return;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    update(dt);
    render();
    updateHUD();
  }

  function init() {
    canvas = document.getElementById("screen");
    ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    hud = document.getElementById("hud");
    popupLayer = document.getElementById("popup-layer");
    scoreEl = document.getElementById("score");
    comboEl = document.getElementById("combo");
    fillEl = document.getElementById("strength-fill");
    beatDot = document.getElementById("beat-dot");
    levelEl = document.getElementById("level");
    muteBtn = document.getElementById("mute-btn");
    titleEl = document.getElementById("title");
    gameoverEl = document.getElementById("gameover");

    try { best = parseInt(localStorage.getItem("kr_best") || "0", 10) || 0; } catch (e) { best = 0; }

    // The music picks a fresh theme per level: map musical beat -> section.
    audio.setSectionAt(function (beat) { return levelForBeat(beat) - 1; });

    resetState();
    hud.style.visibility = "hidden";

    layout();
    bindInput();
    lastTime = performance.now();
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
