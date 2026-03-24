# faust-modular-web

Small browser prototype for my GSoC exploration.

The goal is simple: compile Faust DSP in the browser, connect modules in Web Audio, and control parameters from a minimal UI.

## Current setup

- Oscillator -> LP Filter -> Output
- Faust DSP compiled in-browser with `@grame/faustwasm`
- Draggable modules
- Slider-based controls
- Visible patch lines between module terminals

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173/` and click **Start Audio**.

## Notes

- This is a prototype, not a full modular synth yet.
- Routing is fixed for now.
- No preset save/load yet.

## Tech

- Vite
- Web Audio API
- Faust WASM (`@grame/faustwasm`)
