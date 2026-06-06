/* KARATE RHYTHM — audio engine
 *
 * Generates a looping chiptune entirely from oscillators (no audio files, so
 * nothing to license and the rhythm is known exactly). It also exposes the
 * musical clock the gameplay uses to spawn foes precisely on the beat:
 *
 *   audio.startTime          audioContext time of beat 0
 *   audio.beatDuration       seconds per beat
 *   audio.currentTime        audioContext.currentTime
 *   audio.getBeatTime(n)     audio time of beat n
 *   audio.getCurrentBeat()   fractional beat position right now
 *
 * The music is divided into SECTIONS that map one-to-one onto game levels (the
 * game injects the mapping via setSectionAt). Each section selects a different
 * theme — its own chord progression, arpeggio shape, bass style and lead
 * waveform — and the drums intensify as the sections climb, so the soundtrack
 * keeps evolving instead of looping. Section changes are aligned to bar lines,
 * heralded by a tom fill and a crash so each new level lands with a flourish.
 *
 * The tempo never changes, so the beat-grid the gameplay depends on is rock
 * steady regardless of which theme is playing.
 */
window.KR = window.KR || {};
KR.audio = (function () {
  "use strict";

  var ctx = null;
  var master, musicGain, sfxGain;
  var noiseBuffer = null;

  var BPM = 110;
  var beatDuration = 60 / BPM;
  var STEPS_PER_BEAT = 4;            // 16th-note resolution
  var stepDuration = beatDuration / STEPS_PER_BEAT;

  var startTime = 0;                 // audio time of beat 0
  var nextStep = 0;                  // next 16th step to schedule
  var schedulerId = null;
  var LOOKAHEAD = 0.12;              // seconds scheduled ahead
  var TICK_MS = 25;
  var running = false;
  var muted = false;

  // Injected by the game: beat -> section index (0-based). Defaults below.
  var sectionResolver = null;
  var INTRO_BEATS = 8, LEVEL_BEATS = 32; // fallback section spacing

  // ---- Note helpers ----------------------------------------------------
  // pc = semitones above A (A=0, C=3, E=7, ...). oct anchors A4 = (0,4) = 440.
  function pcFreq(pc, oct) { return 440 * Math.pow(2, ((oct - 4) * 12 + pc) / 12); }
  function reduce(pc) { return ((pc % 12) + 12) % 12; }
  function octShift(f, lo, hi) { while (f > hi) f *= 0.5; while (f < lo) f *= 2; return f; }
  function triad(pc, q) {
    var iv = q === "maj" ? [0, 4, 7] : q === "dim" ? [0, 3, 6] : [0, 3, 7];
    return [pc + iv[0], pc + iv[1], pc + iv[2]];
  }

  // Note table for the game-over flourish.
  var N = { E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00 };

  // ---- Themes (one per section, cycled) --------------------------------
  // bars: 4 chords {pc, q}.  lead: arpeggio shape.  bass: figure.  wave: lead osc.
  var THEMES = [
    { name: "Temple",  bars: [{ pc: 0, q: "min" }, { pc: 8, q: "maj" }, { pc: 3, q: "maj" }, { pc: 10, q: "maj" }], lead: "up",   bass: "root",   wave: "square" },
    { name: "Descent", bars: [{ pc: 0, q: "min" }, { pc: 10, q: "maj" }, { pc: 8, q: "maj" }, { pc: 7, q: "maj" }], lead: "down", bass: "octave", wave: "sawtooth" },
    { name: "Tempest", bars: [{ pc: 5, q: "min" }, { pc: 1, q: "maj" }, { pc: 8, q: "maj" }, { pc: 3, q: "maj" }], lead: "wide", bass: "octave", wave: "square" },
    { name: "Shadow",  bars: [{ pc: 3, q: "min" }, { pc: 11, q: "maj" }, { pc: 6, q: "maj" }, { pc: 1, q: "maj" }], lead: "roll", bass: "root",   wave: "triangle" },
    { name: "Ascend",  bars: [{ pc: 7, q: "min" }, { pc: 3, q: "maj" }, { pc: 10, q: "maj" }, { pc: 5, q: "maj" }], lead: "wide", bass: "walk",   wave: "sawtooth" }
  ];

  function leadShape(style, t) {
    switch (style) {
      case "down": return [t[2], t[1], t[0], t[1], t[2], t[1], t[0], t[1]];
      case "wide": return [t[0], t[2], t[1], t[0], t[2], t[1], t[2], t[0]];
      case "roll": return [t[0], t[1], t[2], t[0], t[1], t[2], t[0], t[1]];
      default:     return [t[0], t[1], t[2], t[1], t[0], t[1], t[2], t[1]]; // up
    }
  }

  function sectionFor(beat) {
    if (sectionResolver) return Math.max(0, sectionResolver(beat) | 0);
    return Math.max(0, Math.floor((beat - INTRO_BEATS) / LEVEL_BEATS));
  }

  // ---- Setup -----------------------------------------------------------
  function init() {
    if (ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.55;
    musicGain.connect(master);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.7;
    sfxGain.connect(master);

    noiseBuffer = makeNoise();
    applyMute();
  }

  function makeNoise() {
    var len = Math.floor(ctx.sampleRate * 1.0);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---- Instruments -----------------------------------------------------
  function kick(t) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    g.gain.setValueAtTime(1.0, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 0.22);
  }

  function snare(t, ghost) {
    var n = ctx.createBufferSource(); n.buffer = noiseBuffer;
    var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1400;
    var g = ctx.createGain();
    g.gain.setValueAtTime(ghost ? 0.22 : 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (ghost ? 0.08 : 0.14));
    n.connect(hp); hp.connect(g); g.connect(musicGain);
    n.start(t); n.stop(t + 0.16);
  }

  function hat(t, accent) {
    var n = ctx.createBufferSource(); n.buffer = noiseBuffer;
    var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 8000;
    var g = ctx.createGain();
    g.gain.setValueAtTime(accent ? 0.22 : 0.10, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    n.connect(hp); hp.connect(g); g.connect(musicGain);
    n.start(t); n.stop(t + 0.05);
  }

  function openhat(t) {
    var n = ctx.createBufferSource(); n.buffer = noiseBuffer;
    var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7000;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    n.connect(hp); hp.connect(g); g.connect(musicGain);
    n.start(t); n.stop(t + 0.2);
  }

  function tom(t, freq) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 0.18);
  }

  function crash(t) {
    var n = ctx.createBufferSource(); n.buffer = noiseBuffer;
    var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 4000;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    n.connect(hp); hp.connect(g); g.connect(musicGain);
    n.start(t); n.stop(t + 0.55);
  }

  function bass(freq, t, dur) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.01);
    g.gain.setValueAtTime(0.5, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function lead(freq, t, dur, wave) {
    var o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = wave; o2.type = wave;
    o.frequency.value = freq; o2.frequency.value = freq; o2.detune.value = 9;
    var peak = wave === "sawtooth" ? 0.12 : wave === "triangle" ? 0.2 : 0.16;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); o2.connect(g); g.connect(musicGain);
    o.start(t); o2.start(t);
    o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
  }

  // ---- Sequencer -------------------------------------------------------
  function scheduleStep(step, t) {
    var beat = step / STEPS_PER_BEAT;
    var section = sectionFor(beat);
    var theme = THEMES[section % THEMES.length];
    var intensity = Math.min(4, section);

    var inBar = step % 16;            // 16th within the bar
    var bar = Math.floor((step % 64) / 16); // which of the 4 chords
    var chord = theme.bars[bar];
    var t3 = triad(chord.pc, chord.q);

    // Section change → crash on the new downbeat.
    if (section !== sectionFor((step - 1) / STEPS_PER_BEAT)) crash(t);

    // Drums
    if (inBar === 0 || inBar === 8) kick(t);
    if (intensity >= 2 && inBar === 10) kick(t);
    if (inBar === 4 || inBar === 12) snare(t, false);
    if (intensity >= 3 && inBar === 14) snare(t, true);
    if (intensity >= 2) hat(t, inBar % 4 === 0);       // 16ths
    else if (inBar % 2 === 0) hat(t, inBar % 4 === 0); // 8ths
    if (intensity >= 3 && inBar === 0) openhat(t);

    // Tom fill across the second half of the last bar before a section change.
    if (inBar >= 8 && inBar % 2 === 0 && sectionFor(beat + 4) !== section) {
      tom(t, 220 - (inBar - 8) * 14);
    }

    // Bass
    if (theme.bass === "octave") {
      if (inBar % 2 === 0) {
        bass(octShift(pcFreq(chord.pc + (inBar % 4 === 0 ? 0 : 12), 2), 70, 165), t, beatDuration * 0.45);
      }
    } else if (theme.bass === "walk") {
      if (inBar % 4 === 0) {
        var wi = inBar === 0 ? 0 : inBar === 4 ? 2 : inBar === 8 ? 1 : 0;
        bass(octShift(pcFreq(t3[wi], 2), 70, 165), t, beatDuration * 0.9);
      }
    } else { // root
      if (inBar % 4 === 0) bass(octShift(pcFreq(chord.pc, 2), 70, 165), t, beatDuration * 0.9);
    }

    // Lead arpeggio on every 8th note
    if (inBar % 2 === 0) {
      var shape = leadShape(theme.lead, t3);
      var pc = shape[inBar / 2];
      lead(pcFreq(reduce(pc), 4), t, beatDuration * 0.45, theme.wave);
    }
  }

  function scheduler() {
    if (!running) return;
    var until = ctx.currentTime + LOOKAHEAD;
    while (startTime + nextStep * stepDuration < until) {
      scheduleStep(nextStep, startTime + nextStep * stepDuration);
      nextStep++;
    }
  }

  // ---- Sound effects ---------------------------------------------------
  function playHit(quality) {
    if (!ctx) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "square";
    var lo = quality === "perfect" ? 740 : 560;
    var hi = quality === "perfect" ? 1760 : 1180;
    o.frequency.setValueAtTime(lo, t);
    o.frequency.exponentialRampToValueAtTime(hi, t + 0.08);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + 0.18);

    var n = ctx.createBufferSource(); n.buffer = noiseBuffer;
    var g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.35, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    n.connect(g2); g2.connect(sfxGain);
    n.start(t); n.stop(t + 0.1);
  }

  function playMiss() {
    if (!ctx) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.25);
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + 0.3);
  }

  function playGameOver() {
    if (!ctx) return;
    var t0 = ctx.currentTime;
    var seq = [N.A4, N.G4, N.F4, N.E4];
    for (var i = 0; i < seq.length; i++) {
      var t = t0 + i * 0.16;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square";
      o.frequency.value = seq[i] / 2;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g); g.connect(sfxGain);
      o.start(t); o.stop(t + 0.32);
    }
  }

  // ---- Transport -------------------------------------------------------
  function start() {
    init();
    if (ctx.state === "suspended") ctx.resume();
    startTime = ctx.currentTime + 0.18;
    nextStep = 0;
    running = true;
    if (schedulerId) clearInterval(schedulerId);
    schedulerId = setInterval(scheduler, TICK_MS);
    scheduler();
  }

  function stop() {
    running = false;
    if (schedulerId) { clearInterval(schedulerId); schedulerId = null; }
  }

  function suspend() { if (ctx && ctx.state === "running") ctx.suspend(); }
  function resume() { if (ctx && ctx.state === "suspended") ctx.resume(); }

  function applyMute() {
    if (!master) return;
    master.gain.value = muted ? 0 : 0.85;
  }
  function toggleMute() { muted = !muted; applyMute(); return muted; }

  // ---- Public API ------------------------------------------------------
  return {
    init: init,
    start: start,
    stop: stop,
    suspend: suspend,
    resume: resume,
    playHit: playHit,
    playMiss: playMiss,
    playGameOver: playGameOver,
    toggleMute: toggleMute,
    setSectionAt: function (fn) { sectionResolver = fn; },
    get muted() { return muted; },
    get bpm() { return BPM; },
    get beatDuration() { return beatDuration; },
    get startTime() { return startTime; },
    get currentTime() { return ctx ? ctx.currentTime : 0; },
    get ready() { return !!ctx; },
    getBeatTime: function (beat) { return startTime + beat * beatDuration; },
    getCurrentBeat: function () {
      if (!ctx) return 0;
      return (ctx.currentTime - startTime) / beatDuration;
    }
  };
})();
