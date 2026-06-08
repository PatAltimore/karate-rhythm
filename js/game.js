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
  var SUB = 4;                     // arrival slots per beat (16th-note grid)
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

  var FOE_JUMP_HEIGHT = 13;        // foe's own jump-kick arc
  var LEAP_LEAD_BEATS = 0.45;      // foe launches its kick this far before arrival
  var LEAP_FOLLOW_BEATS = 0.45;    // ...and comes down this far after (apex = arrival)

  var HAWK_FLY_Y = 104;            // fixed height the hawk scrolls in at
  var HAWK_DIVE = 22;              // how far it swoops down to strike on its beat

  // ---- Final boss duel -------------------------------------------------
  var BOSS_HP = 30;                // clean strikes to fell the Shogun
  var BOSS_X = 190;                // boss's resting spot (static screen)
  var BOSS_HERO_X = 92;            // hero's resting spot facing the boss
  var LINE_X = 140;                // clash line on the floor between them
  var HERO_CLASH_X = 130;          // hero lunges to here on the beat
  var BOSS_CLASH_X = 151;          // boss lunges to here on the beat — they meet on the line
  var BLOCK_MISS_COST = 12;        // strength lost if you fail to block
  var BOSS_WHIFF_COST = 5;         // strength lost on a mistimed tap
  var DUEL_LEAD_BEATS = 4;         // beats of breathing room before the duel begins

  // ---- Rhythm charts ---------------------------------------------------
  // Foes arrive on a 16th-note grid (SUB = 4). Each one-bar "groove" is 16
  // slots (slot 0 = downbeat); grooves are composed into 4-bar phrases so the
  // rhythm has a real shape — syncopation, bursts and rests — instead of a
  // constant on-beat stream. No groove places hits on adjacent 16ths, so it
  // never degenerates into finger-mashing.
  var R    = [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]; // rest (breathe)
  var ON13 = [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0]; // beats 1 & 3
  var BACK = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]; // backbeat 2 & 4
  var FOUR = [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0]; // four on the floor
  var EIGH = [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]; // straight eighths
  var PUSH = [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0]; // beat + the "and" push
  var OFFB = [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0]; // all off-beats
  var CLAV = [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0]; // son-clave syncopation
  var TRES = [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0]; // tresillo (3-3-2 x2)
  var BRST = [1,0,1,0, 0,0,0,0, 1,0,1,0, 0,0,0,0]; // two eighths, then breathe
  var FILL = [1,0,0,0, 1,0,0,0, 1,0,1,0, 1,0,1,0]; // builds into the next level

  function phrase(a, b, c, d) { return a.concat(b, c, d); } // 4 bars -> 64 slots
  var PHRASES = [
    phrase(ON13, ON13, ON13, BACK), // 0  learn the pulse
    phrase(FOUR, ON13, FOUR, BACK), // 1
    phrase(FOUR, PUSH, FOUR, PUSH), // 2  first syncopation
    phrase(EIGH, ON13, EIGH, BRST), // 3  eighths, then breathe
    phrase(CLAV, FOUR, CLAV, BACK), // 4  clave groove
    phrase(TRES, BRST, TRES, FILL), // 5  tresillo
    phrase(OFFB, FOUR, OFFB, PUSH), // 6  off-beats are tricky
    phrase(EIGH, CLAV, BRST, R),    // 7  busy, then a whole-bar rest
    phrase(TRES, OFFB, CLAV, FILL), // 8
    phrase(CLAV, TRES, BRST, FILL)  // 9  hardest, still a groove
  ];
  var BAR_SLOTS = SUB * 4;          // 16
  var PHRASE_SLOTS = BAR_SLOTS * 4; // 64
  var TOTAL_LEVELS = 10;

  // Per level: [phraseIndex, travelBeats, scrollMul]. Ten finite levels across
  // three acts (1-3, 4-6, 7-10); Act III rows are the densest grooves.
  var LEVELS = [
    null,
    [0, 4.00, 1.00],
    [1, 4.00, 1.06],
    [2, 3.75, 1.12],
    [3, 3.50, 1.18],
    [4, 3.50, 1.24],
    [5, 3.25, 1.30],
    [6, 3.25, 1.36],
    [7, 3.00, 1.40],
    [8, 3.00, 1.44],
    [9, 2.85, 1.48]
  ];

  function levelConfig(level) {
    var r = LEVELS[Math.max(1, Math.min(level, TOTAL_LEVELS))];
    return { chart: PHRASES[r[0]], travelBeats: r[1], scrollMul: r[2] };
  }
  function levelForBeat(beat) {
    if (beat < INTRO_BEATS) return 1;
    return 1 + Math.floor((beat - INTRO_BEATS) / LEVEL_BEATS);
  }
  function boundaryBeat(level) { return INTRO_BEATS + (level - 1) * LEVEL_BEATS; }

  // ---- Acts & checkpoints ----------------------------------------------
  // Three acts (I: 1-3, II: 4-6, III: 7-10), then the boss is "act 4".
  function actForLevel(lvl) { return lvl <= 3 ? 1 : lvl <= 6 ? 2 : 3; }
  function actBaseLevel(act) { return act === 1 ? 1 : act === 2 ? 4 : 7; }
  function actName(a) { return a === 1 ? "ACT I" : a === 2 ? "ACT II" : a === 3 ? "ACT III" : "FINAL"; }
  function enemyRank(lvl) { return lvl <= 3 ? 0 : lvl <= 6 ? 1 : 2; }
  // levelOffset shifts a checkpoint's first raw level up to its act base.
  function effLevel(beat) { return levelForBeat(beat) + levelOffset; }
  function runnerEndBeat() { return boundaryBeat(TOTAL_LEVELS + 1 - levelOffset); }

  var PLAYER_KIT = { gi: S.PAL.white, giSh: S.PAL.giSh, band: S.PAL.belt, hair: S.PAL.black };

  // ---- State ----------------------------------------------------------
  var canvas, ctx, hud, popupLayer, scoreEl, comboEl, fillEl, beatDot, levelEl, muteBtn;
  var actEl, bossHud, bossFill, titleEl, gameoverEl, victoryEl;

  var state = "title";            // title | playing | boss | victory | over
  var paused = false;
  var viewScale = 1;

  var strength, score, kills, combo, bestCombo;
  var best = 0;
  var scrollX, elapsed, nextSlot, nextGateLevel, displayLevel;
  var levelOffset = 0, checkpointAct = 1, displayAct = 1;
  var boss = null, heroDuel = null;
  var enemies = [], sparks = [], gates = [], feathers = [];
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

  // Burst of drifting, fluttering feathers when a hawk is felled.
  function spawnFeathers(x, y) {
    var cols = ["#ece4cc", "#c2a878", "#8a6a44", "#5a3e22"];
    for (var i = 0; i < 14; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 18 + Math.random() * 52;
      feathers.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 36,            // bias the burst upward
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 9,
        life: 0, maxLife: 0.9 + Math.random() * 0.7,
        flutter: Math.random() * Math.PI * 2,
        col: cols[i % cols.length]
      });
    }
  }

  // ---- Spawning & resolution ------------------------------------------
  function spawnEnemy(arrivalBeat, travelBeats, kind, rank) {
    var isHawk = kind === "hawk";
    var kit = isHawk ? null : S.ENEMY_KITS[Math.floor(arrivalBeat * 2) % S.ENEMY_KITS.length];
    enemies.push({
      kind: isHawk ? "hawk" : "foe",
      arrivalTime: audio.getBeatTime(arrivalBeat),
      spawnTime: audio.getBeatTime(arrivalBeat - travelBeats),
      x: ENEMY_SPAWN_X, baseY: isHawk ? HAWK_FLY_Y : GROUND_Y,
      y: isHawk ? HAWK_FLY_Y : GROUND_Y, yOff: 0, bob: 0,
      state: "run", resolved: false, passed: false, leaping: false,
      rank: rank || 0,
      runPhase: Math.random(), flapPhase: Math.random() * 2, kit: kit,
      vx: 0, vy: 0, rot: 0, spin: 0, deadT: 0
    });
  }

  function spawnGate(level) {
    gates.push({ level: level, spawnScroll: scrollX, screenX: W + 24, triggered: false });
  }

  function killEnemy(e, quality) {
    e.resolved = true;

    kills++;
    combo++;
    if (combo > bestCombo) bestCombo = combo;
    var base = quality === "perfect" ? 120 : 70;
    var mult = 1 + Math.floor(combo / 5) * 0.5;
    score += Math.round(base * mult);
    strength = Math.min(100, strength + HIT_HEAL);

    flashT = 0.12;
    popup(quality === "perfect" ? "PERFECT" : "GOOD", quality, e.x, GROUND_Y - 30);
    if (combo > 1 && combo % 5 === 0) popup(combo + " COMBO!", "good", PLAYER_X + 18, GROUND_Y - 48);

    if (e.kind === "hawk") {
      // burst into feathers and crash the cymbal; remove at once (no tumble)
      spawnFeathers(e.x, e.baseY + (e.bob || 0) + (e.yOff || 0));
      addSpark(e.x, e.baseY + (e.yOff || 0), quality);
      audio.playCymbal();
      var ix = enemies.indexOf(e);
      if (ix >= 0) enemies.splice(ix, 1);
    } else {
      e.state = "dead";
      e.deadT = 0;
      e.y = GROUND_Y + (e.yOff || 0);   // knock back from wherever it was mid-leap
      e.vx = 80 + Math.random() * 60;
      e.vy = -150 - Math.random() * 50;
      e.spin = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 4);
      addSpark(76, GROUND_Y - 16, quality);
      audio.playHit(quality);
    }
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

  // ---- Boss duel -------------------------------------------------------
  // 8-beat call-and-response on a static screen. Most beats are STRIKE beats
  // (the hero auto-punches on cymbal beats, kicks on drum beats); two are BLOCK
  // beats where the boss attacks and a well-timed tap defends. At low health the
  // boss attacks more often. One input: tap on the beat.
  function bossBeatType(beatIdx, hpFrac) {
    var m = ((beatIdx % 8) + 8) % 8;
    if (m === 3 || m === 7) return "block";
    if (hpFrac < 0.4 && (m === 1 || m === 5)) return "block"; // enraged
    return (m % 2 === 0) ? "kick" : "punch";                  // drum vs cymbal
  }

  function enterBoss() {
    if (state === "boss") return;
    state = "boss";
    checkpointAct = 4;
    enemies.length = 0; gates.length = 0; feathers.length = 0; combo = 0;
    boss = {
      hp: BOSS_HP, pose: "idle", poseT: 0, bob: 0, hitFlash: 0,
      startBeat: Math.ceil(audio.getCurrentBeat()) + DUEL_LEAD_BEATS,
      checkBeat: 0, resolved: {}, defeated: false, defeatT: 0
    };
    heroDuel = { pose: "idle", poseT: 0 };
    if (audio.setBossMode) audio.setBossMode(true);
    popup("THE SHOGUN", "level", W / 2, 38);
    flashT = 0.2;
  }

  function bossUpdate(dt) {
    if (!boss || !audio.ready) return;
    var nowBeat = audio.getCurrentBeat();
    var bb = nowBeat - boss.startBeat;
    boss.bob = Math.sin(nowBeat * Math.PI * 2) * 1.2;
    if (boss.hitFlash > 0) boss.hitFlash -= dt;
    if (heroDuel.poseT > 0 && (heroDuel.poseT -= dt) <= 0) heroDuel.pose = "idle";
    if (boss.poseT > 0 && (boss.poseT -= dt) <= 0) boss.pose = "idle";

    if (boss.defeated) {
      boss.defeatT += dt;
      if (boss.defeatT > 1.7) victory();
      return;
    }

    var hpFrac = boss.hp / BOSS_HP;

    // telegraph: wind up ~0.5 beat before a block beat
    if (bb >= -1 && boss.pose === "idle") {
      var nb = Math.ceil(bb - 0.0001);
      if (bossBeatType(nb, hpFrac) === "block" && nb - bb < 0.5) {
        boss.pose = "windup"; boss.poseT = 0.5;
      }
    }

    // resolve beats past their hit window: an un-blocked attack lands
    var lastResolvable = Math.floor(bb - HIT_GOOD / audio.beatDuration);
    while (boss.checkBeat <= lastResolvable) {
      var b = boss.checkBeat;
      if (b >= 0 && !boss.resolved[b] && bossBeatType(b, hpFrac) === "block") {
        boss.resolved[b] = true;
        boss.pose = "attack"; boss.poseT = 0.3;
        heroDuel.pose = "hit"; heroDuel.poseT = 0.3;
        strength -= BLOCK_MISS_COST; combo = 0;
        shake(4.5, 0.3); flashDanger = 0.18;
        audio.playMiss();
        if (strength <= 0) { gameOver(); return; }
      }
      boss.checkBeat++;
    }
  }

  function bossAttack() {
    if (state !== "boss" || !boss || boss.defeated) return;
    var bb = audio.getCurrentBeat() - boss.startBeat;
    if (bb < -0.5) return;                          // duel hasn't begun
    var nb = Math.round(bb);
    var errSec = Math.abs(bb - nb) * audio.beatDuration;
    var hpFrac = boss.hp / BOSS_HP;

    if (errSec <= HIT_GOOD && nb >= 0 && !boss.resolved[nb]) {
      boss.resolved[nb] = true;
      var typ = bossBeatType(nb, hpFrac);
      if (typ === "block") {
        heroDuel.pose = "block"; heroDuel.poseT = 0.26;
        if (audio.playCymbal) audio.playCymbal();
      } else {
        var quality = errSec <= HIT_PERFECT ? "perfect" : "good";
        heroDuel.pose = typ; heroDuel.poseT = 0.22;  // 'kick' (drum) or 'punch' (cymbal)
        boss.hp -= 1;
        boss.pose = "hit"; boss.poseT = 0.18; boss.hitFlash = 0.16;
        addSpark(LINE_X, GROUND_Y - 18, quality);
        score += quality === "perfect" ? 60 : 30;
        combo++; if (combo > bestCombo) bestCombo = combo;
        if (typ === "kick") { if (audio.playTaiko) audio.playTaiko(); }
        else { if (audio.playCymbal) audio.playCymbal(); }
        if (boss.hp <= 0) {
          boss.hp = 0; boss.defeated = true; boss.defeatT = 0;
          boss.pose = "hit"; score += 500; flashT = 0.3;
        }
      }
    } else {
      heroDuel.pose = "punch"; heroDuel.poseT = 0.2;
      strength -= BOSS_WHIFF_COST; combo = 0;
      audio.playMiss();
      if (strength <= 0) gameOver();
    }
  }

  // f = how close to "on the beat" we are: 1 exactly on the beat, 0 mid-beat.
  // Both fighters slide toward the clash line, meeting on it as f -> 1, so the
  // tap moment is the moment you SEE them clash on the line.
  function duelCloseness() {
    if (!boss || !audio.ready) return 0;
    var bb = audio.getCurrentBeat() - boss.startBeat;
    if (boss.defeated || bb < -3.5) return 0;
    var phase = bb - Math.floor(bb);
    return (1 + Math.cos(phase * Math.PI * 2)) / 2;
  }

  function bossRender() {
    var nowBeat = audio.ready ? audio.getCurrentBeat() : 0;
    var f = duelCloseness();
    var hx = BOSS_HERO_X + (HERO_CLASH_X - BOSS_HERO_X) * f;
    var bx = BOSS_X - (BOSS_X - BOSS_CLASH_X) * f;

    BG.drawBoss(ctx, nowBeat);

    // the clash line — always visible, flaring as the fighters meet on it
    var lg = ctx.createLinearGradient(0, GROUND_Y - 42, 0, GROUND_Y);
    lg.addColorStop(0, "rgba(245,210,120,0)");
    lg.addColorStop(1, "rgba(245,210,120," + (0.28 + 0.5 * f) + ")");
    ctx.fillStyle = lg; ctx.fillRect(LINE_X - 4, GROUND_Y - 42, 8, 42);
    ctx.fillStyle = "rgba(255,236,176," + (0.45 + 0.5 * f) + ")"; // crisp core
    ctx.fillRect(LINE_X, GROUND_Y - 42, 1, 42);
    // painted marker on the floor
    ctx.fillStyle = "rgba(255,228,150," + (0.55 + 0.45 * f) + ")";
    ctx.fillRect(LINE_X - 7, GROUND_Y + 1, 14, 1);
    ctx.fillRect(LINE_X - 4, GROUND_Y + 2, 8, 1);
    ctx.fillRect(LINE_X - 1, GROUND_Y - 1, 2, 2);

    S.shadow(ctx, hx, GROUND_Y, 16, 0.3);
    S.fighter(ctx, hx, GROUND_Y, {
      facing: 1, pose: heroDuel ? heroDuel.pose : "idle", phase: 0, kit: PLAYER_KIT
    });
    var by = GROUND_Y - (boss ? boss.bob : 0);
    S.shadow(ctx, bx, GROUND_Y, 26, 0.34);
    S.boss(ctx, bx, by, {
      facing: -1, pose: boss ? (boss.defeated ? "defeated" : boss.pose) : "idle"
    });
    if (boss && boss.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = boss.hitFlash / 0.16 * 0.5;
      ctx.fillStyle = "#fff";
      ctx.fillRect(bx - 16, GROUND_Y - 46, 32, 46);
      ctx.restore();
    }
    for (var s = 0; s < sparks.length; s++) S.spark(ctx, sparks[s].x, sparks[s].y, sparks[s].t, sparks[s].color);
  }

  function victory() {
    if (state === "victory") return;
    state = "victory";
    audio.stop();
    if (audio.playVictory) audio.playVictory();
    best = Math.max(best, score);
    try { localStorage.setItem("kr_best", String(best)); } catch (e) {}
    var vScore = document.getElementById("vict-score");
    var vBest = document.getElementById("vict-best");
    if (vScore) vScore.textContent = score;
    if (vBest) vBest.textContent = best;
    var vs = document.getElementById("victory");
    if (vs) vs.classList.remove("hidden");
  }

  // ---- Update ---------------------------------------------------------
  function update(dt) {
    var playing = state === "playing";
    var curBeat = (audio.ready && (playing || state === "boss")) ? audio.getCurrentBeat() : 0;
    var scrollMul = playing ? levelConfig(effLevel(curBeat)).scrollMul : 1;

    // World scrolls while running (or idling on the title); frozen for the duel.
    if (state === "title") scrollX += SCROLL_BASE * dt;
    else if (playing) scrollX += SCROLL_BASE * dt * scrollMul;
    player.runPhase += dt * 7;
    if (player.kicking) {
      player.kickT += dt;
      if (player.kickT >= KICK_DURATION) player.kicking = false;
    }

    if (state === "boss") bossUpdate(dt);

    if (playing && audio.ready) {
      elapsed += dt;
      var now = audio.currentTime;

      // Past level 10 -> hand off to the static boss duel.
      if (effLevel(curBeat) > TOTAL_LEVELS) enterBoss();

      var el = effLevel(curBeat);
      displayAct = actForLevel(Math.min(el, TOTAL_LEVELS));
      if (el >= 4 && checkpointAct < 2) checkpointAct = 2;
      if (el >= 7 && checkpointAct < 3) checkpointAct = 3;

      // Spawn foes whose march-in time has arrived (16th-note slots). The phrase
      // is selected by effective level; foes gain helmets/armour by act rank.
      var guard = 0;
      while (true) {
        var arrivalBeat = nextSlot / SUB;
        var rl = levelForBeat(arrivalBeat);
        var al = rl + levelOffset;
        var cfg = (arrivalBeat < INTRO_BEATS || al > TOTAL_LEVELS) ? null : levelConfig(al);
        var travel = cfg ? cfg.travelBeats : 4.0;
        if (now < audio.getBeatTime(arrivalBeat - travel)) break;
        if (cfg) {
          var rel = nextSlot - boundaryBeat(rl) * SUB;
          var idx = ((rel % PHRASE_SLOTS) + PHRASE_SLOTS) % PHRASE_SLOTS;
          if (cfg.chart[idx] === 1) {
            var isHawk = al >= 2 && (idx === 0 || idx === BAR_SLOTS * 2);
            spawnEnemy(arrivalBeat, travel, isHawk ? "hawk" : "foe", enemyRank(al));
          }
        }
        nextSlot++;
        if (++guard > 512) break;
      }

      // Torii gate ahead of each level boundary (through level 10).
      guard = 0;
      while (curBeat >= boundaryBeat(nextGateLevel) - GATE_LEAD_BEATS &&
             nextGateLevel + levelOffset <= TOTAL_LEVELS) {
        spawnGate(nextGateLevel + levelOffset);
        nextGateLevel++;
        if (++guard > 64) break;
      }

      // March foes in, lock-stepped to the music clock.
      for (var i = enemies.length - 1; i >= 0; i--) {
        var e = enemies[i];
        if (e.state === "run") {
          var p = (now - e.spawnTime) / (e.arrivalTime - e.spawnTime);
          e.x = lerp(ENEMY_SPAWN_X, ENEMY_CONTACT_X, p);

          // Around its arrival beat the enemy attacks: a foe leaps up into a
          // jump-kick, a hawk folds into a downward dive. Both peak on the beat,
          // meeting the hero's kick.
          var bRel = (now - e.arrivalTime) / audio.beatDuration;
          var inWin = bRel > -LEAP_LEAD_BEATS && bRel < LEAP_FOLLOW_BEATS;
          var arc = inWin
            ? Math.sin(clamp((bRel + LEAP_LEAD_BEATS) / (LEAP_LEAD_BEATS + LEAP_FOLLOW_BEATS), 0, 1) * Math.PI)
            : 0;
          e.leaping = inWin;
          if (e.kind === "hawk") {
            e.flapPhase += dt * 9;
            e.bob = Math.sin(now * 6) * 1.5;
            e.yOff = arc * HAWK_DIVE;            // swoop down
          } else {
            e.runPhase += dt * 6;
            e.yOff = -arc * FOE_JUMP_HEIGHT;     // leap up
          }
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
        var ga = actForLevel(g.level);
        if (g.level === actBaseLevel(ga) && ga > 1) {
          displayAct = ga;
          popup(actName(ga), "level", W / 2, 40);
        } else {
          popup("LEVEL " + g.level, "level", W / 2, 44);
        }
        flashT = Math.max(flashT, 0.14);
      }
      if (g.screenX < -60) gates.splice(gi, 1);
    }

    for (var s = sparks.length - 1; s >= 0; s--) {
      sparks[s].t += dt / 0.35;
      if (sparks[s].t >= 1) sparks.splice(s, 1);
    }
    for (var fi = feathers.length - 1; fi >= 0; fi--) {
      var f = feathers[fi];
      f.life += dt;
      if (f.life >= f.maxLife) { feathers.splice(fi, 1); continue; }
      f.vy += 40 * dt;                 // light gravity
      f.vx *= 0.985;                   // air drag
      f.x += (f.vx + Math.sin(f.life * 8 + f.flutter) * 14) * dt; // flutter sideways
      f.y += f.vy * dt;
      f.rot += f.spin * dt;
    }
    if (shakeT > 0) shakeT -= dt;
    if (flashT > 0) flashT -= dt;
    if (flashDanger > 0) flashDanger -= dt;
  }

  // ---- Render ---------------------------------------------------------
  function drawFoe(e) {
    if (e.kind === "hawk") {
      S.shadow(ctx, e.x, GROUND_Y, 12, 0.12);   // faint shadow on the bridge below
      S.hawk(ctx, e.x, e.baseY + (e.bob || 0) + (e.yOff || 0), {
        frame: Math.floor(e.flapPhase), pose: e.leaping ? "dive" : "fly"
      });
      return;
    }
    var dead = e.state === "dead";
    var off = e.yOff || 0;
    if (!dead) S.shadow(ctx, e.x, GROUND_Y, 16, 0.28 * (1 + off / FOE_JUMP_HEIGHT * 0.6));
    S.fighter(ctx, e.x, dead ? e.y : e.y + off, {
      facing: -1,
      pose: dead ? "hit" : (e.leaping ? "kick" : "run"),
      phase: e.runPhase, kit: e.kit, rot: e.rot, rank: e.rank
    });
  }

  function drawFeather(f) {
    var a = 1 - f.life / f.maxLife;
    ctx.save();
    ctx.globalAlpha = clamp(a * 1.4, 0, 1);
    ctx.translate(Math.round(f.x), Math.round(f.y));
    ctx.rotate(f.rot);
    ctx.fillStyle = f.col;
    ctx.fillRect(-2, 0, 4, 1);
    ctx.fillRect(-1, -1, 2, 1);
    ctx.restore();
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

    if (state === "boss" || state === "victory") {
      bossRender();
    } else {
      BG.draw(ctx, scrollX);
      // torii gates sit between the scenery and the fighters, so the hero runs
      // through them (framed by the pillars, the lintel passing overhead).
      for (var gi = 0; gi < gates.length; gi++) BG.torii(ctx, gates[gi].screenX, GROUND_Y);
      enemies.sort(function (a, b) { return b.x - a.x; });
      for (var i = 0; i < enemies.length; i++) drawFoe(enemies[i]);
      drawPlayer();
      for (var s = 0; s < sparks.length; s++) S.spark(ctx, sparks[s].x, sparks[s].y, sparks[s].t, sparks[s].color);
      for (var ff = 0; ff < feathers.length; ff++) drawFeather(feathers[ff]);
      ctx.globalAlpha = 1;
    }
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

    var inBoss = state === "boss" || state === "victory";
    if (actEl) actEl.textContent = inBoss ? "FINAL" : actName(displayAct);
    levelEl.textContent = inBoss ? "BOSS" : displayLevel;

    var pct = clamp(strength, 0, 100);
    fillEl.style.width = pct + "%";
    if (pct < 30) fillEl.classList.add("low"); else fillEl.classList.remove("low");

    if (bossHud) {
      bossHud.style.display = inBoss ? "" : "none";
      if (inBoss && boss && bossFill) {
        bossFill.style.width = clamp(boss.hp / BOSS_HP * 100, 0, 100) + "%";
      }
    }

    if (audio.ready && (state === "playing" || state === "boss")) {
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
    enemies.length = 0; sparks.length = 0; gates.length = 0; feathers.length = 0;
    scrollX = 0; elapsed = 0; nextSlot = 0; nextGateLevel = 2; displayLevel = 1;
    boss = null; heroDuel = null;
    player.kicking = false; player.kickT = 0;
    shakeT = 0; flashT = 0; flashDanger = 0;
  }

  // act: 1-3 start that act of the runner; 4 retries the boss directly.
  function startGame(act) {
    act = act || 1;
    resetState();
    titleEl.classList.add("hidden");
    gameoverEl.classList.add("hidden");
    if (victoryEl) victoryEl.classList.add("hidden");
    hud.style.visibility = "visible";
    lastTime = performance.now();

    audio.start();
    if (audio.setBossMode) audio.setBossMode(act === 4);

    if (act === 4) {
      enterBoss();
    } else {
      levelOffset = actBaseLevel(act) - 1;
      checkpointAct = act;
      displayAct = act;
      displayLevel = actBaseLevel(act);
      state = "playing";
    }
  }

  function gameOver() {
    if (state === "over") return;
    state = "over";
    strength = 0;
    audio.stop();
    if (audio.setBossMode) audio.setBossMode(false);
    audio.playGameOver();

    best = Math.max(best, score);
    try { localStorage.setItem("kr_best", String(best)); } catch (e) {}

    document.getElementById("final-score").textContent = score;
    document.getElementById("best-score").textContent = best;
    document.getElementById("final-kills").textContent = kills;
    document.getElementById("final-combo").textContent = bestCombo;
    document.getElementById("final-level").textContent = checkpointAct === 4 ? "BOSS" : displayLevel;
    var rb = document.getElementById("restart-btn");
    if (rb) rb.textContent = checkpointAct === 1 ? "► AGAIN" : "► " + actName(checkpointAct) + " RETRY";
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
  function tapAction() {
    if (state === "playing") attack();
    else if (state === "boss") bossAttack();
    else if (state === "over") startGame(checkpointAct);
    else startGame(1);                 // title / victory -> fresh run
  }

  function bindInput() {
    var stage = document.getElementById("game");
    stage.addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest("#mute-btn")) return;
      if (e.target.closest && e.target.closest(".btn")) return; // let buttons handle their click
      if (state === "playing" || state === "boss") { e.preventDefault(); tapAction(); }
    });

    window.addEventListener("keydown", function (e) {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        tapAction();
      } else if (e.key === "m" || e.key === "M") {
        toggleMute();
      }
    });

    document.getElementById("start-btn").addEventListener("click", function () { startGame(1); });
    document.getElementById("restart-btn").addEventListener("click", function () { startGame(checkpointAct); });
    var vb = document.getElementById("victory-btn");
    if (vb) vb.addEventListener("click", function () { startGame(1); });
    muteBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleMute();
    });

    window.addEventListener("resize", layout);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        paused = true;
        if (state === "playing" || state === "boss") audio.suspend();
      } else {
        paused = false;
        if (state === "playing" || state === "boss") audio.resume();
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
    actEl = document.getElementById("act");
    bossHud = document.getElementById("boss-hud");
    bossFill = document.getElementById("boss-fill");
    muteBtn = document.getElementById("mute-btn");
    titleEl = document.getElementById("title");
    gameoverEl = document.getElementById("gameover");
    victoryEl = document.getElementById("victory");

    try { best = parseInt(localStorage.getItem("kr_best") || "0", 10) || 0; } catch (e) { best = 0; }

    // The music picks a theme per effective level (act-aware via levelOffset).
    audio.setSectionAt(function (beat) { return effLevel(beat) - 1; });

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
