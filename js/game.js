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

  // ---- Final boss duel (projectile-blocking battle) -------------------
  var BOSS_HP = 360;              // HP the Shogun starts with
  var DUEL_HERO_X = 52;           // hero stands at left of throne room
  var DUEL_BOSS_X = 224;          // Shogun stands at right of throne room
  var FIGHT_START = 5;            // entrance beats before projectiles start
  var PROJ_TRAVEL_BEATS = 2;      // beats for a throwing star to cross the room
  var FIRE_TRAVEL_BEATS = 1.5;   // fireballs travel faster and come in straight
  var PROJ_STEP = 0.5;            // beats per pattern step (8th-note resolution)
  var PROJ_MISS_COST = 30;        // strength lost when hit by a projectile
  var PROJ_STAR_DAMAGE = 8;       // boss HP lost when a throwing star is deflected
  var PLAYER_REGEN = 2;           // strength/second passive recovery during duel
  var BOSS_REGEN = 0.6;           // HP/second the Shogun recovers — punishes slow deflection rate

  // ---- Story cut-scenes (between acts) ---------------------------------
  var CUTSCENES = {
    intro: [
      { scene: "castle",  text: "The Shogun Akuma has seized the mountain castle — and taken the princess captive." },
      { scene: "dungeon", text: "In the dungeon keep she waits, her hope dimming with each passing hour." },
      { scene: "setout",  text: "At dusk you set out alone. Only rhythm and resolve will carry you to her." },
      { scene: "cliff",   text: "You scale the cliff to the palace road. His guards stand between you and her freedom." }
    ],
    act2:    [{ scene: "river",  text: "Beyond the river his guards grow stronger. She endures — you cannot fail her." }],
    act3:    [{ scene: "gates",  text: "The castle gates. His mightiest warriors bar the final road to the princess." }],
    boss:    [{ scene: "throne", text: "The Shogun rises from his throne. Defeat him — and the princess goes free." }],
    victory: [{ scene: "dawn",   text: "The Shogun falls. The princess is freed. Dawn breaks over the restored castle." }]
  };
  var CUT_PANEL_DUR = 5.5;         // seconds each panel auto-holds (tap to advance)
  var FADE_DUR = 0.45;             // fade-to-black duration on transitions

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
  function actEndLevel(act) { return act === 1 ? 3 : act === 2 ? 6 : 10; }
  function actName(a) { return a === 1 ? "ACT I" : a === 2 ? "ACT II" : a === 3 ? "ACT III" : "FINAL"; }
  function enemyRank(lvl) { return lvl <= 3 ? 0 : lvl <= 6 ? 1 : 2; }
  // levelOffset shifts a checkpoint's first raw level up to its act base.
  function effLevel(beat) { return levelForBeat(beat) + levelOffset; }
  function runnerEndBeat() { return boundaryBeat(TOTAL_LEVELS + 1 - levelOffset); }

  var PLAYER_KIT = { gi: S.PAL.white, giSh: S.PAL.giSh, band: S.PAL.belt, hair: S.PAL.black };

  // ---- State ----------------------------------------------------------
  var canvas, ctx, hud, popupLayer, scoreEl, comboEl, fillEl, levelEl, muteBtn;
  var actEl, bossHud, bossFill, strengthWrap, titleEl, gameoverEl, victoryEl, cutsceneEl, cutsceneTextEl;

  var state = "title";            // title | playing | boss | victory | over
  var paused = false;
  var viewScale = 1;

  // ---- Cheat codes (keyboard, title or cut-scene) ---------------------
  // Type: ACT2, ACT3, BOSS   (case-insensitive, no spaces needed)
  var cheatBuf = "";

  var strength, score, kills, combo, bestCombo;
  var best = 0;
  var scrollX, elapsed, nextSlot, nextGateLevel, displayLevel;
  var levelOffset = 0, checkpointAct = 1, displayAct = 1;
  var boss = null, heroDuel = null, bossWhiffBeat = -99;
  var cutscene = null, cutsceneAct = 1, runAct = 1, transition = null;
  var enemies = [], sparks = [], gates = [], feathers = [];
  var player = { runPhase: 0, kicking: false, kickT: 0 };
  var deathT = 0;

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

  // ---- Boss duel — projectile patterns --------------------------------
  // Shogun throws fireballs (F) and throwing stars (S) in rhythm.
  // Player taps to block on the beat when each projectile arrives.
  // F blocked → dissipates. S blocked → deflected back, damages Shogun.
  // Miss → player takes damage. Patterns loop; phase escalates as boss HP falls.
  // Each character = one beat. Projectiles travel PROJ_TRAVEL_BEATS to reach hero.
  var PROJ_PATTERNS = [
    "F.S.F...F.S...F.F.S.F.S.FS..F.S.",  // phase 0: quarter-note groove, 13 per 16 beats
    "FS.F.S..F.S.FS..FS.F.S..F.S.FSFS",  // phase 1: quarter + 8th pairs, 18 per 16 beats
    "FSF.S.F.FS.FSF..FSF.S.FSFSFS.FS."   // phase 2: dense but rhythmic, 22 per 16 beats
  ];
  function bossDuelPhase() {
    if (!boss) return 0;
    var f = boss.hp / BOSS_HP;
    return f > 0.9 ? 0 : f > 0.5 ? 1 : 2;
  }

  function enterBoss() {
    state = "boss";
    checkpointAct = 4; cutsceneAct = 4;
    enemies.length = 0; gates.length = 0; feathers.length = 0; combo = 0;
    strength = START_STRENGTH;
    hideOverlays();
    hud.style.visibility = "visible";
    if (audio.setBossMode) audio.setBossMode(true);
    audio.start();
    boss = {
      hp: BOSS_HP,
      projectiles: [],    // active fireballs and throwing stars
      spawnedThrough: -1, // highest beat index for which a projectile has been spawned
      pose: "idle", poseT: 0,
      bob: 0, hitFlash: 0,
      startBeat: Math.ceil(audio.getCurrentBeat()),
      defeated: false, defeatT: 0
    };
    heroDuel = { pose: "idle", poseT: 0 };
    bossWhiffBeat = -99;
    popup("THE SHOGUN", "level", W / 2, 38);
    flashT = 0.2;
    lastTime = performance.now();
  }

  function bossUpdate(dt) {
    if (!boss || !audio.ready) return;
    var nowBeat = audio.getCurrentBeat();
    var bb = nowBeat - boss.startBeat;       // beats since entrance
    var fightBeat = bb - FIGHT_START;        // beats since fighting started (negative during entrance)
    boss.bob = Math.sin(nowBeat * Math.PI * 2) * 1.0;
    if (boss.hitFlash > 0) boss.hitFlash -= dt;
    if (heroDuel.poseT > 0 && (heroDuel.poseT -= dt) <= 0) heroDuel.pose = "idle";
    if (boss.poseT > 0 && (boss.poseT -= dt) <= 0) boss.pose = "idle";

    if (boss.defeated) {
      boss.defeatT += dt;
      if (boss.defeatT > 1.8) victory();
      return;
    }

    if (fightBeat < 0) return;

    // Passive regen
    strength = Math.min(START_STRENGTH, strength + PLAYER_REGEN * dt);
    if (!boss.defeated) boss.hp = Math.min(BOSS_HP, boss.hp + BOSS_REGEN * dt);

    // Spawn projectiles at each 8th-note step
    var spawnUpTo = Math.floor(fightBeat / PROJ_STEP) + 1;
    while (boss.spawnedThrough < spawnUpTo) {
      var patIdx = boss.spawnedThrough;
      boss.spawnedThrough++;
      if (patIdx < 0) continue;
      var pat = PROJ_PATTERNS[bossDuelPhase()];
      var ch = pat[patIdx % pat.length];
      if (ch === "F" || ch === "S") {
        var isFire = ch === "F";
        var travelB = isFire ? FIRE_TRAVEL_BEATS : PROJ_TRAVEL_BEATS;
        var arrivalBeat = patIdx * PROJ_STEP + PROJ_TRAVEL_BEATS; // tap beat unchanged for both
        boss.projectiles.push({
          type: isFire ? "fire" : "star",
          throwBeat: arrivalBeat - travelB,
          arrivalBeat: arrivalBeat,
          travelBeats: travelB,
          state: "flying",
          endBeat: -1,
          deflectBeat: -1
        });
      }
    }

    // Update projectiles
    var hitGoodBeats = HIT_GOOD / audio.beatDuration;
    for (var i = boss.projectiles.length - 1; i >= 0; i--) {
      var p = boss.projectiles[i];
      if (p.state === "flying") {
        if (fightBeat > p.arrivalBeat + hitGoodBeats + 0.05) {
          p.state = "missed"; p.endBeat = fightBeat;
          heroDuel.pose = "hit"; heroDuel.poseT = 0.45;
          strength -= PROJ_MISS_COST; combo = 0;
          shake(5, 0.3); flashDanger = 0.22;
          if (audio.playMiss) audio.playMiss();
          popup("HIT!", "miss", W / 2, 52);
          if (strength <= 0) { gameOver(); return; }
        }
      } else if (p.state === "deflected") {
        var defProg = (fightBeat - p.deflectBeat) / PROJ_TRAVEL_BEATS;
        if (defProg >= 1) {
          p.state = "boss_hit"; p.endBeat = fightBeat;
          boss.hp -= PROJ_STAR_DAMAGE;
          boss.pose = "hit"; boss.poseT = 0.45; boss.hitFlash = 0.22;
          addSpark(DUEL_BOSS_X - 8, GROUND_Y - 24, "perfect");
          if (audio.playTaikoBlock) audio.playTaikoBlock("perfect");
          if (boss.hp <= 0) {
            boss.hp = 0; boss.defeated = true; boss.defeatT = 0;
            boss.pose = "hit"; score += 600; flashT = 0.3;
          }
        }
      }
      // Remove finished projectiles after brief fade
      if (p.state !== "flying" && p.state !== "deflected" &&
          p.endBeat >= 0 && fightBeat > p.endBeat + 0.7) {
        boss.projectiles.splice(i, 1);
      }
    }
  }

  function bossAttack() {
    if (state !== "boss" || !boss || boss.defeated) return;
    var bb = audio.getCurrentBeat() - boss.startBeat;
    var fightBeat = bb - FIGHT_START;
    if (fightBeat < -0.3) return;

    // Find the nearest flying projectile within the hit window
    var best = null, bestErr = Infinity;
    for (var i = 0; i < boss.projectiles.length; i++) {
      var p = boss.projectiles[i];
      if (p.state !== "flying") continue;
      var err = Math.abs(p.arrivalBeat - fightBeat) * audio.beatDuration;
      if (err < HIT_GOOD && err < bestErr) { best = p; bestErr = err; }
    }

    if (!best) {
      // Whiff: penalise once per beat so holding space doesn't drain instantly
      var curBeat = audio.getCurrentBeat();
      if (curBeat - bossWhiffBeat >= 1.0) {
        bossWhiffBeat = curBeat;
        combo = 0;
        strength -= WHIFF_COST;
        shake(2.5, 0.16);
        popup("MISS", "miss", DUEL_HERO_X + 18, GROUND_Y - 30);
        audio.playMiss();
        if (strength <= 0) gameOver();
      }
      return;
    }

    var quality = bestErr <= HIT_PERFECT ? "perfect" : "good";
    if (best.type === "fire") {
      // Block fireball — dissipates harmlessly
      best.state = "blocked"; best.endBeat = fightBeat;
      heroDuel.pose = "block"; heroDuel.poseT = 0.35;
      score += quality === "perfect" ? 50 : 25;
      combo++; if (combo > bestCombo) bestCombo = combo;
      addSpark(DUEL_HERO_X + 14, GROUND_Y - 22, quality);
      if (audio.playTaikoBlock) audio.playTaikoBlock(quality);
      popup((quality === "perfect" ? "PERFECT " : "") + "BLOCK!", quality, W / 2, 52);
    } else {
      // Deflect throwing star back at the Shogun
      best.state = "deflected"; best.deflectBeat = fightBeat;
      heroDuel.pose = "block"; heroDuel.poseT = 0.35;
      score += quality === "perfect" ? 80 : 45;
      combo++; if (combo > bestCombo) bestCombo = combo;
      if (audio.playTaikoDeflect) audio.playTaikoDeflect();
      popup((quality === "perfect" ? "PERFECT " : "") + "DEFLECT!", quality, W / 2, 52);
    }
  }

  function bossRender() {
    var nowBeat = audio.ready ? audio.getCurrentBeat() : 0;
    var bb = boss ? nowBeat - boss.startBeat : 0;
    var fightBeat = bb - FIGHT_START;
    BG.drawBoss(ctx, nowBeat);

    // Hero: walks in from the left, bows, then holds a fighting stance
    var hx = DUEL_HERO_X;
    var hpose = heroDuel ? heroDuel.pose : "idle";
    if (boss && bb < FIGHT_START) {
      if (bb < 2) { hx = lerp(-14, DUEL_HERO_X, clamp(bb / 2, 0, 1)); hpose = "run"; }
      else if (bb < 3.2) hpose = "bow";
      else hpose = "idle";
    }
    S.shadow(ctx, hx, GROUND_Y, 16, 0.3);
    S.fighter(ctx, hx, GROUND_Y, { facing: 1, pose: hpose, phase: bb * 1.6, kit: PLAYER_KIT });

    // Boss: walks in from the right, bows back, then fights
    var bx = DUEL_BOSS_X;
    var bossRot = 0;
    var bpose = "idle";
    if (boss) {
      if (bb < FIGHT_START) {
        // Walk in from right over first 2 beats
        if (bb < 2) bx = lerp(W + 14, DUEL_BOSS_X, clamp(bb / 2, 0, 1));
        // Bow: smooth arc from beat 2 to 3.5 (mirrors hero's bow at 2–3.2)
        if (bb >= 2 && bb < 3.5) {
          var bowT = (bb - 2) / 1.5;
          bossRot = Math.sin(bowT * Math.PI) * 0.35;
        }
      }
      if (boss.defeated) bpose = "defeated";
      else if (boss.poseT > 0) bpose = boss.pose;
      else if (fightBeat >= 0) {
        // Windup/attack based on upcoming 8th-note throw in the pattern
        var checkEnd = fightBeat + 1.2;
        var bStart = Math.max(0, Math.floor(fightBeat / PROJ_STEP));
        var bEnd = Math.ceil(checkEnd / PROJ_STEP);
        for (var b = bStart; b <= bEnd; b++) {
          var pat2 = PROJ_PATTERNS[bossDuelPhase()];
          var pch = pat2[b % pat2.length];
          if (pch === "F" || pch === "S") {
            var eta = b * PROJ_STEP - fightBeat;
            if (eta >= 0 && eta <= 1.2) { bpose = eta < 0.4 ? "attack" : "windup"; break; }
          }
        }
      }
    }
    S.shadow(ctx, bx, GROUND_Y, 26, 0.34);
    S.boss(ctx, bx, GROUND_Y - (boss ? boss.bob : 0), { facing: -1, pose: bpose, rot: bossRot });
    if (boss && boss.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = boss.hitFlash / 0.18 * 0.5;
      ctx.fillStyle = "#fff";
      ctx.fillRect(bx - 16, GROUND_Y - 46, 32, 46);
      ctx.restore();
    }

    // Draw projectiles in flight
    if (boss && fightBeat >= 0) {
      for (var pi = 0; pi < boss.projectiles.length; pi++) {
        drawProjectile(ctx, boss.projectiles[pi], fightBeat);
      }
    }

    for (var s = 0; s < sparks.length; s++) S.spark(ctx, sparks[s].x, sparks[s].y, sparks[s].t, sparks[s].color);

    drawBossHUD(ctx);
  }

  function drawProjectile(ctx, p, fightBeat) {
    var py = GROUND_Y - 22;
    var px, alpha = 1;

    if (p.state === "flying") {
      var travelB = p.travelBeats || PROJ_TRAVEL_BEATS;
      var prog = (fightBeat - p.throwBeat) / travelB;
      px = Math.round(lerp(DUEL_BOSS_X - 16, DUEL_HERO_X + 16, clamp(prog, 0, 1)));
      // Stars arc slightly; fireballs come in straight
      if (p.type === "star") py -= Math.round(Math.sin(clamp(prog, 0, 1) * Math.PI) * 4);
    } else if (p.state === "deflected") {
      var defProg = (fightBeat - p.deflectBeat) / PROJ_TRAVEL_BEATS;
      px = Math.round(lerp(DUEL_HERO_X + 16, DUEL_BOSS_X - 16, clamp(defProg, 0, 1)));
      // High arc back — launches upward and drops onto the boss
      py -= Math.round(Math.sin(clamp(defProg, 0, 1) * Math.PI) * 28);
    } else if (p.state === "blocked" || p.state === "missed") {
      px = DUEL_HERO_X + 16;
      alpha = Math.max(0, 1 - (fightBeat - p.endBeat) * 5);
    } else if (p.state === "boss_hit") {
      px = DUEL_BOSS_X - 16;
      alpha = Math.max(0, 1 - (fightBeat - p.endBeat) * 5);
    } else { return; }

    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;

    if (p.type === "fire") {
      // Fireball: orange/yellow glowing orb
      ctx.fillStyle = "#ff4400";
      ctx.fillRect(px - 4, py - 2, 8, 4);
      ctx.fillRect(px - 2, py - 4, 4, 8);
      ctx.fillStyle = "#ff8800";
      ctx.fillRect(px - 3, py - 3, 6, 6);
      ctx.fillStyle = "#ffee00";
      ctx.fillRect(px - 1, py - 1, 2, 2);
    } else {
      // Throwing star: spinning silver shuriken (alternates + and × every 1/8 beat)
      var spin = Math.floor(fightBeat * 8) % 2;
      ctx.fillStyle = "#8888cc";
      if (spin === 0) {
        ctx.fillRect(px - 4, py - 1, 8, 2);  // horizontal bar
        ctx.fillRect(px - 1, py - 4, 2, 8);  // vertical bar
      } else {
        ctx.fillRect(px - 4, py - 3, 3, 3);  // top-left blade
        ctx.fillRect(px + 1, py - 3, 3, 3);  // top-right blade
        ctx.fillRect(px - 4, py, 3, 3);       // bottom-left blade
        ctx.fillRect(px + 1, py, 3, 3);       // bottom-right blade
      }
      ctx.fillStyle = "#ccccff";
      ctx.fillRect(px - 1, py - 1, 2, 2);   // bright center
    }
    ctx.restore();
  }

  function drawBossHUD(ctx) {
    if (!boss) return;
    var bH = 4, bX = 2, bW = W - 4;
    var bY = GROUND_Y + 8;   // Shogun HP bar
    var pY = GROUND_Y + 16;  // Player strength bar

    // Shogun HP (red)
    ctx.fillStyle = "#1a0505";
    ctx.fillRect(bX, bY, bW, bH);
    var bFill = Math.round(clamp(boss.hp / BOSS_HP, 0, 1) * bW);
    ctx.fillStyle = "#cc2222";
    ctx.fillRect(bX, bY, bFill, bH);
    ctx.fillStyle = "#ff6666";
    ctx.fillRect(bX, bY, bFill, 1);

    // Player strength (green or red when low)
    ctx.fillStyle = "#050f05";
    ctx.fillRect(bX, pY, bW, bH);
    var pFill = Math.round(clamp(strength / START_STRENGTH, 0, 1) * bW);
    var pCol = strength < 30 ? "#dd4422" : "#22aa44";
    ctx.fillStyle = pCol;
    ctx.fillRect(bX, pY, pFill, bH);
    ctx.fillStyle = strength < 30 ? "#ff8866" : "#44ff88";
    ctx.fillRect(bX, pY, pFill, 1);
  }

  function victory() {
    if (state === "victory" || state === "cutscene") return;
    audio.stop();
    if (audio.playVictory) audio.playVictory();
    best = Math.max(best, score);
    try { localStorage.setItem("kr_best", String(best)); } catch (e) {}
    goCutscene("victory", showVictoryOverlay);
  }

  function showVictoryOverlay() {
    state = "victory";
    audio.stop();
    var vScore = document.getElementById("vict-score");
    var vBest = document.getElementById("vict-best");
    if (vScore) vScore.textContent = score;
    if (vBest) vBest.textContent = best;
    if (victoryEl) victoryEl.classList.remove("hidden");
  }

  // ---- Cut-scenes ------------------------------------------------------
  function hideOverlays() {
    titleEl.classList.add("hidden");
    gameoverEl.classList.add("hidden");
    if (victoryEl) victoryEl.classList.add("hidden");
    if (cutsceneEl) cutsceneEl.classList.add("hidden");
  }

  function pauseForCutscene(key, onDone) {
    var panels = CUTSCENES[key];
    if (!panels) { onDone(); return; }
    audio.stop();                          // end whatever was playing
    if (audio.startCutscene) audio.startCutscene();  // slow atmospheric score
    state = "cutscene";
    hud.style.visibility = "hidden";
    cutscene = { panels: panels, index: 0, t: 0, onDone: onDone };
    showCutPanel();
  }
  function showCutPanel() {
    if (cutsceneTextEl) cutsceneTextEl.textContent = cutscene.panels[cutscene.index].text;
    if (cutsceneEl) cutsceneEl.classList.remove("hidden");
  }
  function cutsceneAdvance() {
    if (!cutscene) return;
    if (++cutscene.index >= cutscene.panels.length) cutsceneFinish();
    else { cutscene.t = 0; showCutPanel(); }
  }
  function cutsceneFinish() {
    if (!cutscene) return;
    var done = cutscene.onDone;
    cutscene = null;
    if (cutsceneEl) cutsceneEl.classList.add("hidden");
    done();
  }

  // ---- Fade-to-black transitions ---------------------------------------
  function fadeThen(mid) {
    shakeT = 0; flashT = 0; flashDanger = 0;   // clear lingering screen effects
    transition = { phase: "out", t: 0, mid: mid };
  }
  function transitionAlpha() {
    if (!transition) return 0;
    return transition.phase === "out"
      ? clamp(transition.t / FADE_DUR, 0, 1)
      : clamp(1 - transition.t / FADE_DUR, 0, 1);
  }
  // Fade out (action frozen) -> show the cut-scene -> fade in; the cut-scene's
  // end then fades out -> runs after() -> fades in.
  function goCutscene(key, after) {
    fadeThen(function () {
      pauseForCutscene(key, function () { fadeThen(after); });
    });
  }

  // ---- Update ---------------------------------------------------------
  function update(dt) {
    if (transition) {
      transition.t += dt;
      if (transition.phase === "out") {
        if (transition.t < FADE_DUR) return;          // action frozen while fading out
        transition.phase = "in"; transition.t = 0; transition.mid();  // swap scene at black
      }
      if (transition.t >= FADE_DUR) transition = null;
    }
    if (state === "cutscene") {
      if (cutscene) {
        cutscene.t += dt;
        if (cutscene.t >= CUT_PANEL_DUR) cutsceneAdvance();
      }
      return;   // everything else is frozen during a cut-scene
    }
    var playing = state === "playing";
    var curBeat = (audio.ready && (playing || state === "boss")) ? audio.getCurrentBeat() : 0;
    var scrollMul = playing ? levelConfig(effLevel(curBeat)).scrollMul : 1;

    // World scrolls while running (or idling on the title); frozen for the duel.
    if (state === "title") scrollX += SCROLL_BASE * dt;
    else if (playing) scrollX += SCROLL_BASE * dt * scrollMul;
    if (state !== "over") player.runPhase += dt * 7;
    else deathT += dt;
    if (player.kicking) {
      player.kickT += dt;
      if (player.kickT >= KICK_DURATION) player.kicking = false;
    }

    if (state === "boss") bossUpdate(dt);

    if (playing && audio.ready) {
      elapsed += dt;
      var now = audio.currentTime;

      // End of the current act -> a story cut-scene, then the next act (the
      // boss after act III). Each act is its own runner segment.
      var el = effLevel(curBeat);
      displayAct = actForLevel(Math.min(el, TOTAL_LEVELS));
      if (el > actEndLevel(runAct)) {
        if (runAct >= 3) {
          goCutscene("boss", enterBoss);
        } else {
          var nxt = runAct + 1;
          goCutscene("act" + nxt, function () { startAct(nxt); });
        }
        return;
      }

      // Spawn foes whose march-in time has arrived (16th-note slots). The phrase
      // is selected by effective level; foes gain helmets/armour by act rank.
      var guard = 0;
      while (true) {
        var arrivalBeat = nextSlot / SUB;
        var rl = levelForBeat(arrivalBeat);
        var al = rl + levelOffset;
        var cfg = (arrivalBeat < INTRO_BEATS || al > actEndLevel(runAct)) ? null : levelConfig(al);
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
        popup("LEVEL " + g.level, "level", W / 2, 44);
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
      phase: e.leaping ? 0.47 : e.runPhase, // leaping guards show mid-extension
      kit: e.kit, rot: e.rot, rank: e.rank
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
    if (state === "over") {
      var FALL_DUR = 0.4;
      var prog = Math.min(1, deathT / FALL_DUR);
      var ease = 1 - Math.pow(1 - prog, 2); // ease-out: tips quickly then settles
      var rot = ease * Math.PI / 2;
      S.shadow(ctx, PLAYER_X + ease * 10, GROUND_Y, 16 + ease * 8, 0.28);
      // Sink anchor 4px below GROUND_Y so only the back edge of the lying body shows
      S.fighter(ctx, PLAYER_X, GROUND_Y + 4, {
        facing: 1, pose: "hit", rot: rot, kit: PLAYER_KIT
      });
      return;
    }
    var yOff = 0, pose = "run", kickPhase = 0;
    if (player.kicking) {
      pose = "kick";
      kickPhase = player.kickT / KICK_DURATION;
      yOff = -Math.sin(kickPhase * Math.PI) * JUMP_HEIGHT;
    }
    S.shadow(ctx, PLAYER_X, GROUND_Y, 16, 0.28 * (1 - (-yOff) / JUMP_HEIGHT * 0.7));
    S.fighter(ctx, PLAYER_X, GROUND_Y + yOff, {
      facing: 1, pose: pose,
      phase: player.kicking ? kickPhase : player.runPhase,
      kit: PLAYER_KIT
    });
  }

  function render() {
    var ox = 0, oy = 0;
    if (shakeT > 0 && (state === "playing" || state === "boss")) {
      var m = shakeMag * (shakeT / shakeDur);
      ox = (Math.random() * 2 - 1) * m;
      oy = (Math.random() * 2 - 1) * m;
    }

    ctx.save();
    ctx.translate(Math.round(ox), Math.round(oy));

    if (state === "cutscene") {
      if (cutscene) BG.cut(ctx, cutscene.panels[cutscene.index].scene, cutscene.t);
    } else if (state === "boss" || state === "victory") {
      bossRender();
    } else if (state === "over" && checkpointAct === 4) {
      var nowBeat = audio.ready ? audio.getCurrentBeat() : 0;
      BG.drawBoss(ctx, nowBeat);
      S.shadow(ctx, DUEL_BOSS_X, GROUND_Y, 26, 0.34);
      S.boss(ctx, DUEL_BOSS_X, GROUND_Y, { facing: -1, pose: "idle" });
      drawPlayer();
    } else {
      BG.draw(ctx, scrollX, runAct, elapsed);
      // torii gates sit between the scenery and the fighters, so the hero runs
      // through them (framed by the pillars, the lintel passing overhead).
      BG.drawFg(ctx, scrollX, runAct);
      for (var gi = 0; gi < gates.length; gi++) BG.gate(ctx, gates[gi].screenX, GROUND_Y, runAct);
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
    var fa = transitionAlpha();
    if (fa > 0) {
      ctx.fillStyle = "rgba(0,0,0," + fa.toFixed(3) + ")";
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

    // In boss mode the bars are drawn on canvas; hide the HTML versions
    if (strengthWrap) strengthWrap.style.display = inBoss ? "none" : "";
    if (bossHud)      bossHud.style.display      = "none";

    if (!inBoss) {
      var pct = clamp(strength, 0, 100);
      fillEl.style.width = pct + "%";
      if (pct < 30) fillEl.classList.add("low"); else fillEl.classList.remove("low");
    }

  }

  // ---- Game flow ------------------------------------------------------
  function resetState() {
    strength = START_STRENGTH;
    score = 0; kills = 0; combo = 0; bestCombo = 0;
    enemies.length = 0; sparks.length = 0; gates.length = 0; feathers.length = 0;
    scrollX = 0; elapsed = 0; nextSlot = 0; nextGateLevel = 2; displayLevel = 1;
    boss = null; heroDuel = null; cutscene = null;
    player.kicking = false; player.kickT = 0;
    shakeT = 0; flashT = 0; flashDanger = 0;
  }

  // Fresh run from the title: unlock audio, then the intro cut-scene -> act 1.
  function newGame() {
    resetState();                          // full reset (score 0)
    runAct = 1; checkpointAct = 1; cutsceneAct = 1; displayAct = 1;
    hideOverlays();
    audio.init(); audio.resume();          // unlock audio during this gesture
    goCutscene("intro", function () { startAct(1); });
  }

  // Begin (or retry) an act of the runner; act 4 hands off to the boss.
  // Score persists across acts; only newGame() zeroes it.
  function startAct(act) {
    if (act === 4) { enterBoss(); return; }
    strength = START_STRENGTH; combo = 0;
    enemies.length = 0; sparks.length = 0; gates.length = 0; feathers.length = 0;
    boss = null; heroDuel = null;
    scrollX = 0; elapsed = 0; nextSlot = 0; nextGateLevel = 2;
    player.kicking = false; player.kickT = 0;
    shakeT = 0; flashT = 0; flashDanger = 0;
    levelOffset = actBaseLevel(act) - 1;
    runAct = act; checkpointAct = act; cutsceneAct = act;
    displayAct = act; displayLevel = actBaseLevel(act);
    hideOverlays();
    hud.style.visibility = "visible";
    if (audio.setBossMode) audio.setBossMode(false);
    audio.start();                         // this act's runner music
    lastTime = performance.now();
    state = "playing";
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
    deathT = 0;
    var rb = document.getElementById("restart-btn");
    var tb = document.getElementById("title-btn");
    var retryLabel = checkpointAct === 1 ? "► Try again" : "► " + actName(checkpointAct) + " RETRY";
    if (rb) { rb.textContent = retryLabel + " (1)"; rb.disabled = true; }
    if (tb) tb.disabled = true;
    gameoverEl.classList.remove("hidden");
    setTimeout(function () {
      if (rb) { rb.textContent = retryLabel; rb.disabled = false; }
      if (tb) tb.disabled = false;
    }, 1000);
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

  // ---- Cheat activation -----------------------------------------------
  function cheatActivate(act) {
    cheatBuf = "";
    audio.init(); audio.resume();    // unlock audio on this user gesture
    audio.stop();                    // kill any cut-scene music
    resetState();
    checkpointAct = act; cutsceneAct = act;
    cutscene = null; transition = null;
    if (cutsceneEl) cutsceneEl.classList.add("hidden");
    if (audio.setBossMode) audio.setBossMode(false);
    hideOverlays();
    flashT = 0.4;                    // white flash = acknowledgement
    fadeThen(function () {
      if (act === 4) enterBoss();
      else startAct(act);
    });
  }

  // ---- Input ----------------------------------------------------------
  function tapAction() {
    if (state === "playing") attack();
    else if (state === "boss") bossAttack();
    else if (state === "cutscene") return;     // cut-scenes auto-advance; use SKIP
    else if (state === "over") return;         // game-over: require button click, no accidental key restart
    else newGame();                    // title / victory -> fresh run with intro
  }

  function bindInput() {
    var stage = document.getElementById("game");
    stage.addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest("#mute-btn")) return;
      if (e.target.closest && e.target.closest(".btn")) return; // let buttons handle their click
      if (state === "playing" || state === "boss" || state === "cutscene") { e.preventDefault(); tapAction(); }
    });

    window.addEventListener("keydown", function (e) {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        tapAction();
      } else if (e.key === "m" || e.key === "M") {
        toggleMute();
      }

      // Cheat codes: type ACT2 / ACT3 / BOSS during the title or cut-scene.
      if (state === "title" || state === "cutscene") {
        var ch = e.key.length === 1 ? e.key.toUpperCase() : "";
        if (ch && /[A-Z0-9]/.test(ch)) {
          cheatBuf = (cheatBuf + ch).slice(-8);
          var tail = cheatBuf.slice(-4);
          if (tail === "ACT2") { cheatActivate(2); }
          else if (tail === "ACT3") { cheatActivate(3); }
          else if (tail === "BOSS") { cheatActivate(4); }
        }
      } else {
        cheatBuf = "";   // clear buffer when not on title/cutscene
      }
    });

    document.getElementById("start-btn").addEventListener("click", newGame);
    document.querySelectorAll(".cheat-btn").forEach(function(btn) {
      btn.addEventListener("click", function(e) {
        e.stopPropagation();
        cheatActivate(parseInt(btn.dataset.act, 10));
      });
    });
    document.getElementById("restart-btn").addEventListener("click", function () { startAct(checkpointAct); });
    var tb = document.getElementById("title-btn");
    if (tb) tb.addEventListener("click", function () {
      gameoverEl.classList.add("hidden");
      titleEl.classList.remove("hidden");
    });
    var vb = document.getElementById("victory-btn");
    if (vb) vb.addEventListener("click", newGame);
    var cs = document.getElementById("cutscene-skip");
    if (cs) cs.addEventListener("click", function (e) { e.stopPropagation(); cutsceneFinish(); });
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
    levelEl = document.getElementById("level");
    actEl = document.getElementById("act");
    bossHud = document.getElementById("boss-hud");
    bossFill = document.getElementById("boss-fill");
    strengthWrap = document.querySelector(".strength-wrap");
    muteBtn = document.getElementById("mute-btn");
    titleEl = document.getElementById("title");
    gameoverEl = document.getElementById("gameover");
    victoryEl = document.getElementById("victory");
    cutsceneEl = document.getElementById("cutscene");
    cutsceneTextEl = document.getElementById("cutscene-text");

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
