# faust-modular-web

**GSoC 2025 – Step 4 prototype** · Proof-of-concept modular synthesizer running entirely in the browser.

## What it demonstrates

| Feature | How |
|---|---|
| Faust → WebAssembly at runtime | `@grame/faustwasm` compiles `.dsp` source in-browser via the Faust LLVM/WASM compiler |
| Draggable module cards | Vanilla JS mouse-event drag with CSS absolute positioning |
| Rotary knobs | SVG arc knobs, drag-up/scroll to adjust, value updates in real time |
| Patch cables (Oscillator → LP Filter → Output) | SVG cubic-bezier paths that reflow as you drag modules |
| Web Audio routing | `FaustMonoAudioWorkletNode` nodes connected through the Web Audio graph |

## Signal path

```
Oscillator (os.osc)  ──orange──▶  LP Filter (fi.resonlp)  ──green──▶  Output
  knobs: Freq, Gain                  knobs: Cutoff, Q
```

## Quick start

```bash
# inside faust-modular-web/
npm install
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`), then click **Start Audio**. The browser will compile both Faust programs to WASM, create AudioWorklet nodes, wire them together, and begin playing.

> **Note – Cross-Origin Isolation**: The Vite dev server sets the required
> `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers automatically
> (configured in `vite.config.js`).  These are needed for `SharedArrayBuffer`
> support inside the Faust WASM runtime.

## Controls

| Action | Effect |
|---|---|
| Drag module header | Reposition module; patch cables follow |
| Drag knob up / down | Increase / decrease value |
| Scroll over knob | Fine-adjust value |
| Pause / Resume button | Suspend / resume the AudioContext |

## Build for production

```bash
npm run build   # outputs to dist/
npm run preview # serve the built output locally
```

## Project structure

```
faust-modular-web/
├── index.html           – shell HTML (toolbar + canvas + hint bar)
├── vite.config.js       – Vite + static-copy for libfaust-wasm.*
├── package.json
└── src/
    ├── main.js          – AudioEngine, Knob, Module, WireRenderer, app init
    └── style.css        – dark hardware-style theme
```

## Faust DSP used

**Oscillator**
```faust
import("stdfaust.lib");
freq = hslider("freq[unit:Hz]", 440, 20, 2000, 0.1);
gain = hslider("gain",          0.5,  0,    1, 0.01);
process = os.osc(freq) * gain;
```

**LP Filter**
```faust
import("stdfaust.lib");
cutoff = hslider("cutoff[unit:Hz]", 1000, 20, 10000, 1);
q      = hslider("Q",                1.0, 0.5,  10.0, 0.01);
process = fi.resonlp(cutoff, q, 1);
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Error: instantiateFaustModuleFromFile` fails | Make sure `libfaust-wasm.js` and `libfaust-wasm.wasm` are in `node_modules/@grame/faustwasm/dist/` after `npm install`. The static-copy plugin copies them to `/` automatically on dev start. |
| No sound after clicking Start | Browser may have blocked autoplay. Click anywhere on the page first, then press Start. |
| `SharedArrayBuffer is not defined` | Ensure you are accessing the page through the Vite dev server (not by opening `index.html` directly), which sets the required COOP/COEP headers. |
| Faust compile error | Check the browser console. The Faust compiler error message is forwarded. |

## License

MIT – see `LICENSE` file (to be added before final submission).
