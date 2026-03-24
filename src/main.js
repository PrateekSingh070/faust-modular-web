import {
  instantiateFaustModuleFromFile,
  LibFaust,
  FaustCompiler,
  FaustMonoDspGenerator,
} from "@grame/faustwasm";

const oscCode = `
import("stdfaust.lib");
freq = hslider("freq[unit:Hz][style:knob]", 440, 20, 2000, 0.1);
gain = hslider("gain[style:knob]",          0.5,  0,    1, 0.01);
process = os.osc(freq) * gain;
`;

const filterCode = `
import("stdfaust.lib");
cutoff = hslider("cutoff[unit:Hz][style:knob]", 1000, 20, 10000, 1);
q      = hslider("Q[style:knob]",                1.0, 0.5,  10.0, 0.01);
process = fi.resonlp(cutoff, q, 1);
`;

const state = {
  audioContext: null,
  oscNode: null,
  filterNode: null,
  isRunning: false,
};

const canvas = document.getElementById("canvas");
const wireSvg = document.getElementById("wire-svg");
const startBtn = document.getElementById("start-btn");
const statusEl = document.getElementById("status");

const wires = [];

function setStatus(text, className) {
  statusEl.textContent = text;
  statusEl.className = `status ${className}`;
}

async function buildFaustNode(compiler, context, dspName, dspCode) {
  const generator = new FaustMonoDspGenerator();
  const success = await generator.compile(compiler, dspName, dspCode, "");
  if (!success) {
    throw new Error(`Faust compile failed for "${dspName}"`);
  }
  return generator.createNode(context);
}

async function initAudio() {
  state.audioContext = new AudioContext();

  const libFaustJsUrl = new URL("/libfaust-wasm.js", window.location.href).href;
  const faustModule = await instantiateFaustModuleFromFile(libFaustJsUrl);
  const libFaust = new LibFaust(faustModule);
  const compiler = new FaustCompiler(libFaust);

  state.oscNode = await buildFaustNode(compiler, state.audioContext, "osc", oscCode);
  state.filterNode = await buildFaustNode(compiler, state.audioContext, "filt", filterCode);

  state.oscNode.connect(state.filterNode);
  state.filterNode.connect(state.audioContext.destination);
}

function setParam(node, path, value) {
  if (!node) return;
  node.setParamValue(path, value);
}

function formatKnobValue(value) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  if (value < 10) return value.toFixed(2);
  return value.toFixed(0);
}

function createKnob(parent, options) {
  const root = document.createElement("div");
  root.className = "knob";
  const step = options.step ?? (options.max - options.min) / 200;
  root.innerHTML = `
    <div class="knob-label">${options.label}</div>
    <input
      class="knob-slider"
      type="range"
      min="${options.min}"
      max="${options.max}"
      step="${step}"
      value="${options.value}"
    />
    <div class="knob-value"></div>
  `;
  parent.appendChild(root);

  const slider = root.querySelector(".knob-slider");
  const valueText = root.querySelector(".knob-value");
  valueText.textContent = formatKnobValue(Number(slider.value));

  slider.addEventListener("input", () => {
    const value = Number(slider.value);
    valueText.textContent = formatKnobValue(value);
    options.onChange(value);
  });

  return { element: root, slider };
}

function createModule(container, options) {
  const moduleData = {
    id: options.id,
    x: options.x,
    y: options.y,
    onMoved: options.onMoved || (() => {}),
    element: null,
  };

  const moduleEl = document.createElement("div");
  moduleEl.className = "module";
  moduleEl.id = `mod-${options.id}`;
  moduleEl.style.cssText = `left:${options.x}px; top:${options.y}px; --mod-color:${options.color}`;
  moduleEl.innerHTML = `
    <div class="mod-header">${options.title}</div>
    <div class="mod-body">
      <div class="mod-knobs"></div>
    </div>
    <div class="mod-ports">
      <div class="port port-in" title="Audio In"></div>
      <div class="port port-out" title="Audio Out"></div>
    </div>
  `;
  container.appendChild(moduleEl);
  moduleData.element = moduleEl;

  const knobsHost = moduleEl.querySelector(".mod-knobs");
  for (const knobDef of options.knobDefs) {
    createKnob(knobsHost, knobDef);
  }

  const header = moduleEl.querySelector(".mod-header");
  let startX = 0;
  let startY = 0;
  let mouseStartX = 0;
  let mouseStartY = 0;

  header.addEventListener("mousedown", (event) => {
    startX = moduleData.x;
    startY = moduleData.y;
    mouseStartX = event.clientX;
    mouseStartY = event.clientY;
    moduleEl.classList.add("dragging");

    function onMove(moveEvent) {
      moduleData.x = startX + (moveEvent.clientX - mouseStartX);
      moduleData.y = startY + (moveEvent.clientY - mouseStartY);
      moduleEl.style.left = `${moduleData.x}px`;
      moduleEl.style.top = `${moduleData.y}px`;
      moduleData.onMoved();
    }

    function onUp() {
      moduleEl.classList.remove("dragging");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    event.preventDefault();
  });

  moduleData.getPortPosition = function getPortPosition(type) {
    const port = moduleEl.querySelector(`.port-${type}`);
    const portRect = port.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const x =
      type === "out"
        ? portRect.right - canvasRect.left
        : portRect.left - canvasRect.left;
    return {
      x,
      y: portRect.top + portRect.height / 2 - canvasRect.top,
    };
  };

  return moduleData;
}

function addWire(fromModule, toModule, extraClass = "") {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.classList.add("wire");
  if (extraClass) path.classList.add(extraClass);
  wireSvg.appendChild(path);

  const wire = { fromModule, toModule, path };
  wires.push(wire);
  drawWire(wire);
  return wire;
}

function drawWire(wire) {
  const from = wire.fromModule.getPortPosition("out");
  const to = wire.toModule.getPortPosition("in");
  wire.path.setAttribute(
    "d",
    `M${from.x},${from.y} L${to.x},${to.y}`
  );
}

function redrawAllWires() {
  for (const wire of wires) {
    drawWire(wire);
  }
}

function setModulePosition(moduleData, x, y) {
  moduleData.x = x;
  moduleData.y = y;
  moduleData.element.style.left = `${x}px`;
  moduleData.element.style.top = `${y}px`;
}

function layoutModules() {
  const canvasWidth = canvas.clientWidth;
  const boxWidth = oscModule.element.offsetWidth || 160;
  const minGap = 28;
  const totalWidth = boxWidth * 3 + minGap * 2;
  const startX = Math.max(12, (canvasWidth - totalWidth) / 2);
  const y = 110;

  setModulePosition(oscModule, startX, y);
  setModulePosition(filterModule, startX + boxWidth + minGap, y);
  setModulePosition(outputModule, startX + (boxWidth + minGap) * 2, y);
  redrawAllWires();
}

const PARAMS = {
  oscFreq: "/osc/freq",
  oscGain: "/osc/gain",
  filterCutoff: "/filt/cutoff",
  filterQ: "/filt/Q",
};

const oscModule = createModule(canvas, {
  id: "osc",
  title: "Oscillator",
  x: 40,
  y: 110,
  color: "#e94560",
  onMoved: redrawAllWires,
  knobDefs: [
    {
      label: "Freq",
      min: 20,
      max: 2000,
      value: 440,
      onChange: (value) => setParam(state.oscNode, PARAMS.oscFreq, value),
    },
    {
      label: "Gain",
      min: 0,
      max: 1,
      value: 0.5,
      onChange: (value) => setParam(state.oscNode, PARAMS.oscGain, value),
    },
  ],
});

const filterModule = createModule(canvas, {
  id: "filt",
  title: "LP Filter",
  x: 240,
  y: 110,
  color: "#7c3aed",
  onMoved: redrawAllWires,
  knobDefs: [
    {
      label: "Cutoff",
      min: 20,
      max: 10000,
      value: 1000,
      onChange: (value) => setParam(state.filterNode, PARAMS.filterCutoff, value),
    },
    {
      label: "Q",
      min: 0.5,
      max: 10,
      value: 1.0,
      onChange: (value) => setParam(state.filterNode, PARAMS.filterQ, value),
    },
  ],
});

const outputModule = createModule(canvas, {
  id: "out",
  title: "Output",
  x: 440,
  y: 110,
  color: "#059669",
  onMoved: redrawAllWires,
  knobDefs: [],
});

layoutModules();
window.addEventListener("resize", layoutModules);

addWire(oscModule, filterModule, "wire-osc-filt");
addWire(filterModule, outputModule, "wire-filt-out");

startBtn.addEventListener("click", async () => {
  if (state.isRunning) {
    state.audioContext.suspend();
    state.isRunning = false;
    startBtn.textContent = "Resume";
    setStatus("Paused", "paused");
    return;
  }

  if (state.audioContext && state.audioContext.state === "suspended") {
    state.audioContext.resume();
    state.isRunning = true;
    startBtn.textContent = "Pause";
    setStatus("Running", "running");
    return;
  }

  startBtn.disabled = true;
  setStatus("Compiling DSP…", "compiling");

  try {
    await initAudio();
    state.isRunning = true;
    startBtn.textContent = "Pause";
    startBtn.disabled = false;
    setStatus("Running", "running");

    requestAnimationFrame(redrawAllWires);
  } catch (error) {
    console.error("[faust-modular-web]", error);
    setStatus(`Error: ${error.message}`, "error");
    startBtn.disabled = false;
  }
});
