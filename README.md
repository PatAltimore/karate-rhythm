# KARATE RHYTHM

An endless, auto-running side-scrolling fighter in the spirit of the original
Apple II **Karateka** (1984). You always run forward through a parallax dusk
landscape; foes march in **on the beat** of a procedurally generated chiptune.
Click / tap / press **Space** to launch a flying jump-kick — land it *in rhythm*
to fell the foe. Mistime it, or let a foe slip through, and you lose **strength**.
When the strength meter empties, the run ends.

It's a 100% static web app — plain HTML5 Canvas + Web Audio, no build step, no
backend — so it hosts for **free** on Azure Static Web Apps.

## How to play

- **You run automatically.** The world scrolls; the hero runs in place.
- **Click / tap / Space** = flying jump-kick.
- Foes arrive exactly on a beat. Strike within the beat-window:
  - within ±70 ms → **PERFECT**
  - within ±150 ms → **GOOD**
- A clean strike fells the foe (one hit) and restores a little strength.
- A **mistimed kick** (whiff) or a **foe that gets past you** costs strength.
- Watch the **beat dot** at the top and listen to the kick drum — they mark the beat.
- Difficulty ramps as you survive: each level is a distinct 4-bar **groove**
  (backbeats, clave, tresillo, off-beats, burst-then-rest) on a 16th-note grid,
  with shorter approaches — so it's a rhythm to *play*, not a constant tap.

Press **M** to mute.

## Run it locally

It's just static files. Any static server works. From the project root:

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

## Deploy to Azure (free)

### Option A — Azure Static Web Apps via GitHub (recommended, free tier)

1. Push this repo to GitHub.
2. In the Azure Portal: **Create a resource → Static Web App**.
   - Plan type: **Free**.
   - Sign in to GitHub and pick this repo + branch (`main`).
   - **Build presets: Custom.** App location: `/`. Api location: *(blank)*.
     Output location: *(blank)*.
3. Azure commits a workflow and runs the first deploy. (This repo already
   includes an equivalent workflow at
   `.github/workflows/azure-static-web-apps.yml`; if you let the Portal generate
   its own, you can delete one to avoid duplicate deploys.)
4. If you use the included workflow, add the repo secret
   **`AZURE_STATIC_WEB_APPS_API_TOKEN`** (Azure Portal → your SWA → *Manage
   deployment token*).

Your app goes live at `https://<name>.azurestaticapps.net`.

### Option B — SWA CLI (deploy from your machine)

```bash
npm install -g @azure/static-web-apps-cli
swa login
swa deploy . --env production
```

### Option C — Azure Storage static website (also effectively free)

```bash
az storage blob service-properties update --account-name <acct> \
  --static-website --index-document index.html
az storage blob upload-batch -s . -d '$web' --account-name <acct>
```

Any of these serve the files as-is; there is nothing to compile.

## Notes & credits

- Inspired by Jordan Mechner's **Karateka** (1984). This is an original homage —
  all art and music are generated in code; no original assets are used.
- Music is synthesized live from oscillators, so the rhythm the game scores
  against is exactly the rhythm you hear.
- Tested in current Chrome/Edge/Firefox/Safari. Works on desktop and touch.
