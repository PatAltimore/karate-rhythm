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
  var master, musicGain, sfxGain, sfxComp;
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
  var bossMode = false;
  var cutsceneMode = false;

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
    { name: "Ascend",  bars: [{ pc: 7, q: "min" }, { pc: 3, q: "maj" }, { pc: 10, q: "maj" }, { pc: 5, q: "maj" }], lead: "wide", bass: "walk",   wave: "sawtooth" },
    // Act III — darker: Neapolitan & tritone harmony, low gritty saw lead.
    { name: "Onslaught", bars: [{ pc: 0, q: "min" }, { pc: 1, q: "maj" }, { pc: 8, q: "maj" }, { pc: 7, q: "maj" }], lead: "wide", bass: "octave", wave: "sawtooth", dark: 1 },
    { name: "Abyss",     bars: [{ pc: 0, q: "min" }, { pc: 6, q: "maj" }, { pc: 10, q: "min" }, { pc: 0, q: "min" }], lead: "roll", bass: "octave", wave: "sawtooth", dark: 1 },
    // The Shogun — haunting boss theme (Neapolitan bII → leading-tone dim → v minor: never resolves).
    { name: "Shogun",    bars: [{ pc: 0, q: "min" }, { pc: 1, q: "maj" }, { pc: 11, q: "dim" }, { pc: 7, q: "min" }], lead: "roll", bass: "octave", wave: "sawtooth", dark: 2 }
  ];
  // Effective level (section 0-9) -> theme index. Acts darken: I,II light; III dark.
  var SECTION_THEME = [0, 1, 0, 2, 3, 4, 5, 6, 5, 6];
  var BOSS_THEME = 7;

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

    // Soft limiter so overlapping gong hits (dense at high levels) never clip.
    sfxComp = ctx.createDynamicsCompressor();
    sfxComp.threshold.value = -12;
    sfxComp.knee.value = 8;
    sfxComp.ratio.value = 12;
    sfxComp.attack.value = 0.002;
    sfxComp.release.value = 0.14;
    sfxGain.connect(sfxComp);
    sfxComp.connect(master);

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

  // Sub-bass heartbeat — quarter-note pulse, strong on beats 1&3, soft on 2&4.
  function heartbeat(t, strong) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(strong ? 54 : 46, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.24);
    g.gain.setValueAtTime(strong ? 0.95 : 0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 0.40);
  }

  // Deep resonant kick for the boss — longer pitch drop, low rumble.
  function heavyKick(t) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(36, t + 0.25);
    g.gain.setValueAtTime(1.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 0.46);
    var n = ctx.createBufferSource(); n.buffer = noiseBuffer;
    var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 180;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.38, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    n.connect(lp); lp.connect(ng); ng.connect(musicGain);
    n.start(t); n.stop(t + 0.18);
  }

  // Tremolo sine drone — slow-pulsing low pad sustained for one chord (~4 beats).
  function ghostDrone(freq, t) {
    var dur = beatDuration * 3.9;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.17, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    var lfo = ctx.createOscillator(), lfog = ctx.createGain();
    lfo.type = "sine"; lfo.frequency.value = 3.1;
    lfog.gain.value = 0.07;
    lfo.connect(lfog); lfog.connect(g.gain);
    o.connect(g); g.connect(musicGain);
    lfo.start(t); lfo.stop(t + dur + 0.05);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // High ringing bell with long decay — marks each 16-beat cycle in the boss fight.
  function hauntBell(freq, t) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.10, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + 3.6);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 3.7);
    var o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o2.type = "sine"; o2.frequency.value = freq * 1.008;
    g2.gain.setValueAtTime(0.05, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
    o2.connect(g2); g2.connect(musicGain);
    o2.start(t); o2.stop(t + 2.45);
  }

  // Koto/shamisen pluck — bright, short decay; the boss-battle melodic riff.
  function pluck(freq, t) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sawtooth"; o.frequency.value = freq;
    var lp = ctx.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(freq * 9, t);
    lp.frequency.exponentialRampToValueAtTime(freq * 1.8, t + 0.10);
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(lp); lp.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 0.30);
  }

  // Dissonant low chord stab (root + tritone + fifth) for dark/boss downbeats.
  function stab(t, pc, amt) {
    var notes = [pc, pc + 6, pc + 7];
    var peak = 0.1 + 0.04 * (amt || 1);
    for (var i = 0; i < notes.length; i++) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.value = octShift(pcFreq(reduce(notes[i]), 3), 90, 220);
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + 0.2);
    }
  }

  // ---- Cut-scene music: Japanese-inspired (shakuhachi, koto, soft taiko) ---
  // D pentatonic minor: D(293.66) F(349.23) G(392.00) A(440.00) C(523.25)
  // All notes are in Hz for clarity; the melody runs on a 64-sixteenth loop.

  function shakuhachi(freq, t, dur) {
    // LFO vibrato — fades in after initial breath onset
    var lfo = ctx.createOscillator(), lfog = ctx.createGain();
    lfo.type = "sine"; lfo.frequency.value = 5.0;
    lfog.gain.setValueAtTime(0, t);
    lfog.gain.linearRampToValueAtTime(freq * 0.013, t + 0.28); // subtle vibrato depth
    lfo.connect(lfog);
    // Main sine — the clean flute tone
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = freq;
    lfog.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.19, t + 0.16);
    g.gain.setValueAtTime(0.19, t + dur * 0.62);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    // Breathiness: narrow bandpass noise around the fundamental
    var n = ctx.createBufferSource(); n.buffer = noiseBuffer;
    var bp = ctx.createBiquadFilter(); bp.type = "bandpass";
    bp.frequency.value = freq * 1.35; bp.Q.value = 14;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.026, t + 0.07);
    ng.gain.setValueAtTime(0.026, t + dur * 0.58);
    ng.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.86);
    lfo.start(t); lfo.stop(t + dur + 0.12);
    o.connect(g); g.connect(musicGain);
    n.connect(bp); bp.connect(ng); ng.connect(musicGain);
    o.start(t); o.stop(t + dur + 0.12);
    n.start(t); n.stop(t + dur * 0.86 + 0.1);
  }

  function kotoPluck(freq, t) {
    var dur = 2.8;
    // Main plucked triangle — earthy, wooden
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.20, t + 0.003); // instant attack
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + dur + 0.06);
    // Slightly inharmonic shimmer — real koto has this
    var o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o2.type = "sine"; o2.frequency.value = freq * 2.008;
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.linearRampToValueAtTime(0.08, t + 0.003);
    g2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.42);
    o2.connect(g2); g2.connect(musicGain);
    o2.start(t); o2.stop(t + dur * 0.42 + 0.06);
    // Brief high-frequency transient — fingernail on the string
    var ns = ctx.createBufferSource(); ns.buffer = noiseBuffer;
    var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = freq * 5;
    var nsg = ctx.createGain();
    nsg.gain.setValueAtTime(0.10, t); nsg.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    ns.connect(hp); hp.connect(nsg); nsg.connect(musicGain);
    ns.start(t); ns.stop(t + 0.05);
  }

  function taikoBoom(t, vol) {         // soft contemplative drum pulse
    var v = vol || 0.26;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(106, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.36);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 0.7);
  }

  function kaneBell(freq, t) {         // temple bell (kane) — long ring
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.13, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.8);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 2.85);
    // Warm harmonic partial a minor 7th up (bell-like inharmonicity)
    var o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o2.type = "sine"; o2.frequency.value = freq * 1.78;
    g2.gain.setValueAtTime(0.05, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    o2.connect(g2); g2.connect(musicGain);
    o2.start(t); o2.stop(t + 1.45);
  }

  // Japanese melody: 64-sixteenth loop (~34 s at 110 BPM).
  // D pentatonic minor. Sparse, mournful, hopeful in turns.
  function scheduleCutscene(step, t) {
    var s = step % 64;
    var BD = beatDuration;

    // Shakuhachi melody events [freq_Hz, duration_beats]
    var mel = {
      0:  [293.66, BD * 4.0],  // D4 — long opening breath
      10: [392.00, BD * 2.8],  // G4 — upward sigh
      18: [440.00, BD * 1.6],  // A4 — slight rise
      24: [349.23, BD * 3.8],  // F4 — falling minor 3rd, melancholic
      36: [293.66, BD * 1.8],  // D4 — return to tonic
      44: [440.00, BD * 3.4],  // A4 — hopeful leap upward
      52: [392.00, BD * 1.4],  // G4 — gentle fall
      56: [349.23, BD * 1.2],  // F4 — breath
      60: [293.66, BD * 4.8]   // D4 — long closing note (overlaps next cycle)
    };
    if (mel[s]) shakuhachi(mel[s][0], t, mel[s][1]);

    // Koto plucks — low register, earthy and sparse
    var kot = { 0: 146.83, 24: 110.00, 40: 196.00, 56: 146.83 };
    // 146.83=D3, 110.00=A2, 196.00=G3
    if (kot[s] !== undefined) kotoPluck(kot[s], t);

    // Soft taiko on downbeats
    if (s === 0)  taikoBoom(t, 0.26);
    if (s === 32) taikoBoom(t, 0.16);

    // Kane (temple bell) — sparse, resonant
    if (s === 16) kaneBell(440.00, t);   // A4
    if (s === 48) kaneBell(293.66, t);   // D4
  }

  // ---- Sequencer -------------------------------------------------------
  function scheduleStep(step, t) {
    if (cutsceneMode) { scheduleCutscene(step, t); return; }
    var beat = step / STEPS_PER_BEAT;
    var section = sectionFor(beat);
    var theme = bossMode
      ? THEMES[BOSS_THEME]
      : THEMES[SECTION_THEME[Math.max(0, Math.min(section, SECTION_THEME.length - 1))]];
    var dark = theme.dark || 0;
    var intensity = bossMode ? 4 : Math.min(4, section);

    var inBar = step % 16;            // 16th within the bar
    var bar = Math.floor((step % 64) / 16); // which of the 4 chords
    var chord = theme.bars[bar];
    var t3 = triad(chord.pc, chord.q);

    // Section change → crash on the new downbeat (not during the boss).
    if (!bossMode && section !== sectionFor((step - 1) / STEPS_PER_BEAT)) crash(t);

    // Drums
    if (bossMode) {
      if (inBar === 0 || inBar === 8) heavyKick(t);
      if (inBar === 4 || inBar === 12) snare(t, false);
      if (inBar === 14) kick(t);                          // "a" of beat 4 — anticipation
      heartbeat(t, inBar === 0 || inBar === 8);           // sub-bass pulse every beat
      hat(t, inBar % 2 === 0);                            // 8th-note hats for drive
      if (inBar === 0 && bar === 0) openhat(t);
    } else {
      if (inBar === 0 || inBar === 8) kick(t);
      if (intensity >= 2 && inBar === 10) kick(t);
      if (inBar === 4 || inBar === 12) snare(t, false);
      if (intensity >= 3 && inBar === 14) snare(t, true);
      if (intensity >= 2) hat(t, inBar % 4 === 0);       // 16ths
      else if (inBar % 2 === 0) hat(t, inBar % 4 === 0); // 8ths
      if (intensity >= 3 && inBar === 0) openhat(t);
      if (inBar >= 8 && inBar % 2 === 0 && sectionFor(beat + 4) !== section) {
        tom(t, 220 - (inBar - 8) * 14); // fill before a section change
      }
    }

    // Dissonant stab on each downbeat in the dark act / the boss fight.
    if ((dark >= 1 || bossMode) && inBar === 0) stab(t, chord.pc, dark + (bossMode ? 1 : 0));
    if (bossMode && inBar === 8) stab(t, chord.pc, 2);  // beat 3 echo stab

    // Boss: tremolo drone sustains under each chord; haunting bell marks each full cycle.
    if (bossMode && inBar === 0) ghostDrone(octShift(pcFreq(reduce(chord.pc), 1), 28, 62), t);
    if (bossMode && inBar === 0 && bar === 0) hauntBell(pcFreq(reduce(chord.pc), 5), t);

    // Boss melodic riff: koto pluck on each quarter beat, cycling through chord tones.
    // root → 5th → min3 → 5th gives a distinctive figure players can "play along to".
    if (bossMode && inBar % 4 === 0) {
      var pluckIntervals = [0, 7, 3, 7];
      pluck(pcFreq(reduce(chord.pc + pluckIntervals[inBar / 4]), 4), t);
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

    // Lead arpeggio on every 8th note (an octave lower when dark/menacing)
    if (inBar % 2 === 0) {
      var shape = leadShape(theme.lead, t3);
      var pc = shape[inBar / 2];
      lead(pcFreq(reduce(pc), dark >= 1 ? 3 : 4), t, beatDuration * 0.45, theme.wave);
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
  // The current chord's tonic, so percussion hits ring in key with the music.
  function currentRoot() {
    var beat = ctx ? (ctx.currentTime - startTime) / beatDuration : 0;
    if (beat < 0) beat = 0;
    var theme = THEMES[sectionFor(beat) % THEMES.length];
    return theme.bars[Math.floor((Math.floor(beat) % 16) / 4)].pc;
  }

  // A clean strike rings like a struck gong, in time and in tune with the
  // track: a taiko-style impact thud for the punch, a ring of inharmonic
  // (bell-like) partials tuned to the current key, and a cymbal sizzle on top.
  function playHit(quality) {
    if (!ctx) return;
    var t = ctx.currentTime;
    var perfect = quality === "perfect";
    var f0 = pcFreq(reduce(currentRoot()), perfect ? 4 : 3);
    var dur = perfect ? 0.55 : 0.36;

    var ring = ctx.createGain();
    ring.gain.value = perfect ? 0.42 : 0.32;
    ring.connect(sfxGain);

    var partials = [1, 1.34, 1.83, 2.41, 3.06];
    var amps = [0.5, 0.34, 0.26, 0.18, 0.12];
    for (var i = 0; i < partials.length; i++) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      var f = f0 * partials[i];
      o.frequency.setValueAtTime(f * 1.012, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.09); // gong swell
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amps[i], t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur * (1 - i * 0.12));
      o.connect(g); g.connect(ring);
      o.start(t); o.stop(t + dur + 0.05);
    }

    // taiko impact body
    var k = ctx.createOscillator(), kg = ctx.createGain();
    k.type = "sine";
    k.frequency.setValueAtTime(190, t);
    k.frequency.exponentialRampToValueAtTime(72, t + 0.1);
    kg.gain.setValueAtTime(0.45, t);
    kg.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    k.connect(kg); kg.connect(sfxGain);
    k.start(t); k.stop(t + 0.16);

    // cymbal sizzle transient
    var n = ctx.createBufferSource(); n.buffer = noiseBuffer;
    var bp = ctx.createBiquadFilter(); bp.type = "bandpass";
    bp.frequency.value = f0 * 3.2; bp.Q.value = 0.6;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(perfect ? 0.4 : 0.28, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + (perfect ? 0.18 : 0.12));
    n.connect(bp); bp.connect(ng); ng.connect(sfxGain);
    n.start(t); n.stop(t + 0.2);
  }

  // Felling a hawk crashes a cymbal — bright filtered noise plus a little
  // metallic shimmer. Hawks land on accent downbeats, so it reads as the kit's
  // crash cymbal landing in time with the track.
  function playCymbal() {
    if (!ctx) return;
    var t = ctx.currentTime;
    var n = ctx.createBufferSource(); n.buffer = noiseBuffer;
    var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 5000;
    var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 9000; bp.Q.value = 0.5;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    n.connect(hp); hp.connect(bp); bp.connect(g); g.connect(sfxGain);
    n.start(t); n.stop(t + 0.65);

    var parts = [5200, 7400];
    for (var i = 0; i < parts.length; i++) {
      var o = ctx.createOscillator(), og = ctx.createGain();
      o.type = "square"; o.frequency.value = parts[i];
      og.gain.setValueAtTime(0.06, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      o.connect(og); og.connect(sfxGain);
      o.start(t); o.stop(t + 0.42);
    }
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

  // O-daiko block hit — tuned to current chord root (octave 2, ~110-165 Hz).
  // Replaces the gong for fireball blocks and boss hits in the duel.
  function playTaikoBlock(quality) {
    if (!ctx) return;
    var t = ctx.currentTime;
    var perfect = quality === "perfect";
    var rootHz = pcFreq(reduce(currentRoot()), 1) * 1.5; // ~82–123 Hz: between original and current
    var vol = perfect ? 1.0 : 0.75;

    // Primary pitched body — fast pitch drop for the "boom"
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(rootHz * 2.2, t);
    o.frequency.exponentialRampToValueAtTime(rootHz, t + 0.055);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (perfect ? 0.30 : 0.22));
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + 0.33);

    // Sub octave for weight
    var s2 = ctx.createOscillator(), sg2 = ctx.createGain();
    s2.type = "sine";
    s2.frequency.value = rootHz * 0.5;
    sg2.gain.setValueAtTime(vol * 0.42, t);
    sg2.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
    s2.connect(sg2); sg2.connect(sfxGain);
    s2.start(t); s2.stop(t + 0.12);

    // Mallet skin transient — low-pass noise burst
    var n = ctx.createBufferSource(); n.buffer = noiseBuffer;
    var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 800;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    n.connect(lp); lp.connect(ng); ng.connect(sfxGain);
    n.start(t); n.stop(t + 0.05);
  }

  // Ko-tsuzumi deflect — higher taiko (octave 3, ~220-330 Hz) for throwing star returns.
  // Bright crack distinguishes deflection from a plain block.
  function playTaikoDeflect() {
    if (!ctx) return;
    var t = ctx.currentTime;
    var rootHz = pcFreq(reduce(currentRoot()), 2) * 1.5; // one octave higher than block

    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(rootHz * 2.0, t);
    o.frequency.exponentialRampToValueAtTime(rootHz, t + 0.04);
    g.gain.setValueAtTime(0.85, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + 0.22);

    // Mid-band crack for the deflection snap
    var n = ctx.createBufferSource(); n.buffer = noiseBuffer;
    var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 1.2;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.55, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    n.connect(bp); bp.connect(ng); ng.connect(sfxGain);
    n.start(t); n.stop(t + 0.07);
  }

  // Electric discharge when a plasma ball is blocked.
  function playPlasmaBlock() {
    if (!ctx) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(1100, t);
    o.frequency.exponentialRampToValueAtTime(240, t + 0.14);
    g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.20);
    var n = ctx.createBufferSource(); n.buffer = noiseBuffer;
    var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3800;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.65, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
    n.connect(hp); hp.connect(ng); ng.connect(sfxGain); n.start(t); n.stop(t + 0.11);
  }

  // Deep taiko boom — the hero's KICK in the boss duel (drum = kick).
  function playTaiko() {
    if (!ctx) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(185, t);
    o.frequency.exponentialRampToValueAtTime(54, t + 0.18);
    g.gain.setValueAtTime(0.95, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + 0.32);
    var n = ctx.createBufferSource(); n.buffer = noiseBuffer;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.3, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(ng); ng.connect(sfxGain); n.start(t); n.stop(t + 0.06);
  }

  // Triumphant fanfare when the Shogun falls.
  function playVictory() {
    if (!ctx) return;
    var t0 = ctx.currentTime;
    var seq = [392, 523.25, 659.25, 783.99, 1046.5];
    for (var i = 0; i < seq.length; i++) {
      var t = t0 + i * 0.13;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square"; o.frequency.value = seq[i];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      o.connect(g); g.connect(sfxGain);
      o.start(t); o.stop(t + 0.47);
    }
  }

  // ---- Cinematic stings -----------------------------------------------

  // Quick ascending fanfare — plays over gameplay music when the hero runs off after clearing an act.
  function playHeroFanfare() {
    if (!ctx) return;
    var t0 = ctx.currentTime;
    var notes = [392.00, 523.25, 659.25, 783.99];
    for (var i = 0; i < notes.length; i++) {
      var t = t0 + i * 0.11;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square"; o.frequency.value = notes[i];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.15, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + (i === 3 ? 0.45 : 0.18));
      o.connect(g); g.connect(sfxGain);
      o.start(t); o.stop(t + (i === 3 ? 0.48 : 0.22));
    }
  }

  // Slow mournful descent — plays when the hero is defeated.
  function playDefeated() {
    if (!ctx) return;
    var t0 = ctx.currentTime;
    // Low thud impact
    var ob = ctx.createOscillator(), gb = ctx.createGain();
    ob.type = "sine";
    ob.frequency.setValueAtTime(110, t0); ob.frequency.exponentialRampToValueAtTime(36, t0 + 0.28);
    gb.gain.setValueAtTime(0.65, t0); gb.gain.exponentialRampToValueAtTime(0.001, t0 + 0.38);
    ob.connect(gb); gb.connect(sfxGain); ob.start(t0); ob.stop(t0 + 0.40);
    // Descending minor melody
    var seq = [[440, 0.45, 0.55], [392, 1.0, 0.45], [349.23, 1.45, 0.45],
               [293.66, 1.9, 0.55], [261.63, 2.45, 0.55], [220, 3.05, 2.0]];
    for (var i = 0; i < seq.length; i++) {
      var t = t0 + seq[i][1], dur = seq[i][2];
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = seq[i][0];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur + 0.05);
    }
  }

  // Mariko's leitmotif — D pentatonic minor koto melody, ~13 seconds.
  // Played during the dungeon panel and the reunion ending.
  function playMarikoSong() {
    if (!ctx) return;
    var t0 = ctx.currentTime + 0.15;
    // Opening bell on D
    kaneBell(293.66, t0);
    // Bass koto anchors
    kotoPluck(146.83, t0);
    kotoPluck(146.83, t0 + 6.5);
    // Closing bell
    kaneBell(587.33, t0 + 11.0);
    // Melody — triangle oscillator + inharmonic shimmer (koto timbre)
    var mel = [
      [587.33, 0.0,  1.8],   // D5 — long opening breath
      [880.00, 2.2,  0.7],   // A5 — upward leap
      [783.99, 3.0,  0.6],   // G5
      [698.46, 3.7,  0.7],   // F5
      [587.33, 4.5,  2.0],   // D5 — return
      [698.46, 6.8,  0.5],   // F5 — second phrase
      [783.99, 7.4,  0.5],   // G5
      [880.00, 8.0,  0.7],   // A5
      [1046.5, 8.8,  1.0],   // C6 — peak
      [880.00, 9.9,  0.5],   // A5
      [783.99, 10.5, 0.4],   // G5
      [587.33, 11.0, 2.8],   // D5 — final
    ];
    for (var mi = 0; mi < mel.length; mi++) {
      (function(freq, off, decay) {
        var t = t0 + off;
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "triangle"; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.18, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.001, t + decay);
        o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + decay + 0.06);
        var o2 = ctx.createOscillator(), g2 = ctx.createGain();
        o2.type = "sine"; o2.frequency.value = freq * 2.006;
        g2.gain.setValueAtTime(0.0001, t);
        g2.gain.linearRampToValueAtTime(0.06, t + 0.012);
        g2.gain.exponentialRampToValueAtTime(0.001, t + decay * 0.38);
        o2.connect(g2); g2.connect(musicGain); o2.start(t); o2.stop(t + decay * 0.38 + 0.06);
      })(mel[mi][0], mel[mi][1], mel[mi][2]);
    }
  }

  // ---- Transport -------------------------------------------------------
  function start() {
    cutsceneMode = false;
    init();
    if (ctx.state === "suspended") ctx.resume();
    startTime = ctx.currentTime + 0.18;
    nextStep = 0;
    running = true;
    if (schedulerId) clearInterval(schedulerId);
    schedulerId = setInterval(scheduler, TICK_MS);
    scheduler();
  }

  // Slow atmospheric loop for the story cut-scenes (its own timeline).
  function startCutscene() {
    bossMode = false;
    cutsceneMode = true;
    init();
    if (ctx.state === "suspended") ctx.resume();
    startTime = ctx.currentTime + 0.12;
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

  function setBossMode(b) {
    b = !!b;
    if (b && !bossMode && ctx) crash(ctx.currentTime);  // crash into the duel
    bossMode = b;
  }

  // ---- Public API ------------------------------------------------------
  return {
    init: init,
    start: start,
    startCutscene: startCutscene,
    stop: stop,
    suspend: suspend,
    resume: resume,
    playHit: playHit,
    playTaikoBlock: playTaikoBlock,
    playTaikoDeflect: playTaikoDeflect,
    playPlasmaBlock: playPlasmaBlock,
    playCymbal: playCymbal,
    playTaiko: playTaiko,
    playMiss: playMiss,
    playGameOver: playGameOver,
    playDefeated: playDefeated,
    playHeroFanfare: playHeroFanfare,
    playMarikoSong: playMarikoSong,
    playVictory: playVictory,
    toggleMute: toggleMute,
    setBossMode: setBossMode,
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
