/**
 * Faust Modular Web – main entry point
 *
 * Demonstrates:
 *   • Compiling Faust DSP (oscillator + LP filter) to WebAssembly at runtime
 *     using @grame/faustwasm
 *   • Draggable "module" cards with physically-styled knobs
 *   • SVG patch cables wiring Oscillator → LP Filter → Output
 */

import {
  instantiateFaustModuleFromFile,
  LibFaust,
  FaustCompiler,
  FaustMonoDspGenerator,
} from "@grame/faustwasm";

// ─── Faust DSP source snippets ──────────────────────────────────────────────

const DSP = {
  osc: `
import("stdfaust.lib");
freq = hslider("freq[unit:Hz][style:knob]", 440, 20, 2000, 0.1);
gain = hslider("gain[style:knob]",          0.5,  0,    1, 0.01);
process = os.osc(freq) * gain;
`,
  filt: `
import("stdfaust.lib");
cutoff = hslider("cutoff[unit:Hz][style:knob]", 1000, 20, 10000, 1);
q      = hslider("Q[style:knob]",                1.0, 0.5,  10.0, 0.01);
process = fi.resonlp(cutoff, q, 1);
`,
};

// ─── AudioEngine ────────────────────────────────────────────────────────────

class AudioEngine {
  constructor() {
    this.ctx       = null;   // AudioContext
    this.oscNode   = null;   // FaustMonoAudioWorkletNode
    this.filtNode  = null;
  }

  /** Compile both DSPs, build the Web Audio graph, return param paths. */
  async init() {
    this.ctx = new AudioContext();

    // Load the Faust WASM compiler (libfaust-wasm.js is served at root by
    // vite-plugin-static-copy; it pulls libfaust-wasm.wasm from the same dir)
    const libFaustJsUrl = new URL("/libfaust-wasm.js", window.location.href).href;
    const faustModule   = await instantiateFaustModuleFromFile(libFaustJsUrl);
    const libFaust      = new LibFaust(faustModule);
    const compiler      = new FaustCompiler(libFaust);

    const compile = async (name, code) => {
      const gen = new FaustMonoDspGenerator();
      const ok  = await gen.compile(compiler, name, code, "");
      if (!ok) throw new Error(`Faust compile failed for '${name}'`);
      const node = await gen.createNode(this.ctx);
      return node;
    };

    [this.oscNode, this.filtNode] = await Promise.all([
      compile("osc",  DSP.osc),
      compile("filt", DSP.filt),
    ]);

    // Signal chain: oscillator → filter → master out
    this.oscNode.connect(this.filtNode);
    this.filtNode.connect(this.ctx.destination);
  }

  setParam(node, path, value) { node?.setParamValue(path, value); }
  suspend() { this.ctx?.suspend(); }
  resume()  { this.ctx?.resume();  }
}

// ─── Knob ────────────────────────────────────────────────────────────────────
//
// SVG knob: drag up/down (or scroll) to change value.
// Visually shows a filled arc tracking the 270° sweep (–135° … +135°).

class Knob {
  constructor(parent, { label, min, max, value, onChange }) {
    this.min      = min;
    this.max      = max;
    this.value    = value;
    this.onChange = onChange;

    this._drag = { active: false, startY: 0, startVal: 0 };

    this.el = document.createElement("div");
    this.el.className = "knob";
    this.el.innerHTML = `
      <svg viewBox="0 0 56 56" width="56" height="56">
        <circle cx="28" cy="28" r="20" class="knob-ring"/>
        <path   class="knob-arc"/>
        <circle cx="28" cy="28" r="14" class="knob-body"/>
        <line   class="knob-dot" x1="28" y1="28" stroke-width="2.5"/>
      </svg>
      <div class="knob-label">${label}</div>
      <div class="knob-value"></div>
    `;
    parent.appendChild(this.el);

    this._arcEl   = this.el.querySelector(".knob-arc");
    this._dotEl   = this.el.querySelector(".knob-dot");
    this._valEl   = this.el.querySelector(".knob-value");

    this._render();
    this._bind();
  }

  // 0–1 normalised position
  _norm() { return (this.value - this.min) / (this.max - this.min); }

  _render() {
    const n     = this._norm();
    const START = -135 * (Math.PI / 180);  // start of sweep (radians)
    const SWEEP =  270 * (Math.PI / 180);  // total sweep (270°)
    const angle = START + n * SWEEP;

    // Indicator dot endpoint
    const R = 13;
    this._dotEl.setAttribute("x2", (28 + R * Math.sin(angle)).toFixed(2));
    this._dotEl.setAttribute("y2", (28 - R * Math.cos(angle)).toFixed(2));

    // Filled arc
    if (n > 0.001) {
      const r    = 20;
      const sx   = 28 + r * Math.sin(START);
      const sy   = 28 - r * Math.cos(START);
      const ex   = 28 + r * Math.sin(angle);
      const ey   = 28 - r * Math.cos(angle);
      const big  = n > 0.5 ? 1 : 0;
      this._arcEl.setAttribute(
        "d", `M${sx.toFixed(2)},${sy.toFixed(2)} A${r},${r} 0 ${big},1 ${ex.toFixed(2)},${ey.toFixed(2)}`
      );
    } else {
      this._arcEl.setAttribute("d", "");
    }

    const v = this.value;
    this._valEl.textContent =
      v >= 1000 ? `${(v / 1000).toFixed(1)}k` :
      v < 10    ? v.toFixed(2)                 :
                  v.toFixed(0);
  }

  _bind() {
    const svg = this.el.querySelector("svg");

    svg.addEventListener("mousedown", (e) => {
      Object.assign(this._drag, { active: true, startY: e.clientY, startVal: this.value });
      document.body.style.cursor     = "ns-resize";
      document.body.style.userSelect = "none";
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!this._drag.active) return;
      const delta = (this._drag.startY - e.clientY) / 180;
      this._set(this._drag.startVal + delta * (this.max - this.min));
    });

    window.addEventListener("mouseup", () => {
      if (!this._drag.active) return;
      this._drag.active              = false;
      document.body.style.cursor     = "";
      document.body.style.userSelect = "";
    });

    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      this._set(this.value - (e.deltaY / 1200) * (this.max - this.min));
    }, { passive: false });
  }

  _set(v) {
    this.value = Math.max(this.min, Math.min(this.max, v));
    this._render();
    this.onChange(this.value);
  }
}

// ─── Module ──────────────────────────────────────────────────────────────────

class Module {
  /**
   * @param {HTMLElement} container  – #canvas div
   * @param {{ id, title, x, y, color, knobDefs, onMoved }} opts
   *   knobDefs: Array<{ label, min, max, value, onChange }>
   */
  constructor(container, { id, title, x, y, color, knobDefs, onMoved }) {
    this.id      = id;
    this.x       = x;
    this.y       = y;
    this._onMoved = onMoved ?? (() => {});

    this.el = document.createElement("div");
    this.el.className  = "module";
    this.el.id         = `mod-${id}`;
    this.el.style.cssText = `left:${x}px; top:${y}px; --mod-color:${color}`;
    this.el.innerHTML = `
      <div class="mod-header">${title}</div>
      <div class="mod-body">
        <div class="mod-knobs"></div>
      </div>
      <div class="mod-ports">
        <div class="port port-in"  title="Audio In"></div>
        <div class="port port-out" title="Audio Out"></div>
      </div>
    `;
    container.appendChild(this.el);

    // Build knobs
    const knobsEl = this.el.querySelector(".mod-knobs");
    this.knobs = knobDefs.map(def => new Knob(knobsEl, def));

    this._makeDraggable();
  }

  /** Centre coords of IN or OUT port relative to #canvas */
  portPos(type) {
    const port   = this.el.querySelector(`.port-${type}`);
    const pr     = port.getBoundingClientRect();
    const cr     = document.getElementById("canvas").getBoundingClientRect();
    return {
      x: pr.left + pr.width  / 2 - cr.left,
      y: pr.top  + pr.height / 2 - cr.top,
    };
  }

  _makeDraggable() {
    const header = this.el.querySelector(".mod-header");
    let ox, oy, mx, my;

    header.addEventListener("mousedown", (e) => {
      ox = this.x; oy = this.y;
      mx = e.clientX; my = e.clientY;
      this.el.classList.add("dragging");

      const onMove = (e) => {
        this.x = ox + e.clientX - mx;
        this.y = oy + e.clientY - my;
        this.el.style.left = `${this.x}px`;
        this.el.style.top  = `${this.y}px`;
        this._onMoved();
      };
      const onUp = () => {
        this.el.classList.remove("dragging");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup",   onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup",   onUp);
      e.preventDefault();
    });
  }
}

// ─── WireRenderer ────────────────────────────────────────────────────────────

class WireRenderer {
  constructor(svgEl) {
    this._svg   = svgEl;
    this._wires = [];   // [{ from: Module, to: Module, el: SVGPathElement, cls }]
  }

  addWire(fromMod, toMod, cls = "") {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.classList.add("wire");
    if (cls) path.classList.add(cls);
    this._svg.appendChild(path);
    const wire = { from: fromMod, to: toMod, el: path };
    this._wires.push(wire);
    this._draw(wire);
    return wire;
  }

  refresh() { this._wires.forEach(w => this._draw(w)); }

  _draw({ from, to, el }) {
    const a  = from.portPos("out");
    const b  = to.portPos("in");
    const cx = (a.x + b.x) / 2;
    // Cubic bezier with vertical control points for a natural cable droop
    el.setAttribute(
      "d",
      `M${a.x},${a.y} C${cx},${a.y} ${cx},${b.y} ${b.x},${b.y}`
    );
  }
}

// ─── App ─────────────────────────────────────────────────────────────────────

const engine  = new AudioEngine();
let   running = false;

const canvas  = document.getElementById("canvas");
const wireSvg = document.getElementById("wire-svg");
const wires   = new WireRenderer(wireSvg);

// Parameter paths follow the pattern /<dsp-name>/<param-name>
// The DSP names "osc" and "filt" are set when calling gen.compile(...)
const P = {
  oscFreq:    "/osc/freq",
  oscGain:    "/osc/gain",
  filtCutoff: "/filt/cutoff",
  filtQ:      "/filt/Q",
};

// ── Create modules (knob onChange callbacks reference engine, set lazily) ──
const oscMod = new Module(canvas, {
  id: "osc", title: "Oscillator",
  x: 60, y: 110, color: "#e94560",
  onMoved: () => wires.refresh(),
  knobDefs: [
    { label: "Freq",  min: 20,  max: 2000, value: 440, onChange: v => engine.setParam(engine.oscNode,  P.oscFreq,    v) },
    { label: "Gain",  min: 0,   max: 1,    value: 0.5, onChange: v => engine.setParam(engine.oscNode,  P.oscGain,    v) },
  ],
});

const filtMod = new Module(canvas, {
  id: "filt", title: "LP Filter",
  x: 350, y: 110, color: "#7c3aed",
  onMoved: () => wires.refresh(),
  knobDefs: [
    { label: "Cutoff", min: 20, max: 10000, value: 1000, onChange: v => engine.setParam(engine.filtNode, P.filtCutoff, v) },
    { label: "Q",      min: 0.5, max: 10,  value: 1.0,  onChange: v => engine.setParam(engine.filtNode, P.filtQ,      v) },
  ],
});

const outMod = new Module(canvas, {
  id: "out", title: "Output",
  x: 640, y: 110, color: "#059669",
  onMoved: () => wires.refresh(),
  knobDefs: [],   // no parameters – represents AudioContext.destination
});

// ── Toolbar controls ────────────────────────────────────────────────────────
const startBtn  = document.getElementById("start-btn");
const statusEl  = document.getElementById("status");

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className   = `status ${cls}`;
}

startBtn.addEventListener("click", async () => {
  if (running) {
    engine.suspend();
    startBtn.textContent = "Resume";
    setStatus("Paused", "paused");
    return;
  }
  if (engine.ctx?.state === "suspended") {
    engine.resume();
    startBtn.textContent = "Pause";
    setStatus("Running", "running");
    return;
  }

  // First launch
  startBtn.disabled = true;
  setStatus("Compiling DSP…", "compiling");

  try {
    await engine.init();
    running = true;
    startBtn.textContent = "Pause";
    startBtn.disabled    = false;
    setStatus("Running", "running");

    // Draw cables after modules are fully laid out (ports have final geometry)
    requestAnimationFrame(() => {
      wires.addWire(oscMod,  filtMod, "wire-osc-filt");
      wires.addWire(filtMod, outMod,  "wire-filt-out");
    });
  } catch (err) {
    console.error("[faust-modular-web]", err);
    setStatus(`Error: ${err.message}`, "error");
    startBtn.disabled = false;
  }
});
