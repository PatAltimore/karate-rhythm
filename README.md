# Karate Rhythm

A rhythm-based side-scrolling fighter in three acts. Inspired by the original
Apple II **Karateka** (1984). You run and kick to defeat guards who march in **on the beat**.

Try it: [https://happy-mushroom-08d27c51e.7.azurestaticapps.net/](https://happy-mushroom-08d27c51e.7.azurestaticapps.net/)

## How to play

- **Click / tap / Space bar** = flying jump-kick.
- Foes arrive exactly on a beat. Strike within the beat-window:
  - within ±70 ms → **PERFECT**
  - within ±150 ms → **GOOD**
- A clean strike fells the foe (one hit) and restores a little strength.
- A **mistimed kick** (whiff) or a **foe that gets past you** costs strength.
- Difficulty ramps as you survive: each level is a distinct 4-bar **groove**
  (backbeats, clave, tresillo, off-beats, burst-then-rest) on a 16th-note grid,
  with shorter approaches.

Press **M** to mute.

## Run it locally

```bash
# Python 3
python -m http.server 8080
# then open http://localhost:8080
```

```bash
# Node (no install)
npx serve .
```

> Opening `index.html` directly via `file://` also works in most browsers, but a
> local server is recommended (some browsers restrict audio/AudioContext on
> `file://`).

## Project layout

```
index.html                  markup + overlays
css/style.css               retro CRT styling, HUD, overlays
js/audio.js                 Web Audio chiptune + the musical beat clock
js/sprites.js               procedural fighter sprites (run / jump-kick / KO)
js/background.js            parallax sky, mountains, palace, scrolling ground
js/game.js                  state, input, rhythm hit-detection, render loop
staticwebapp.config.json    Azure Static Web Apps routing/headers
.github/workflows/          CI deploy to Azure Static Web Apps
```

No dependencies, no bundler. Everything is loaded as classic `<script>` tags.

## Notes & credits

- Inspired by Jordan Mechner's **Karateka** (1984). This is an original homage —
  all art and music are generated in code; no original assets are used.
- Music is synthesized live from oscillators, so the rhythm the game scores
  against is exactly the rhythm you hear.
- The game is designed to be playable on desktop and mobile browsers.