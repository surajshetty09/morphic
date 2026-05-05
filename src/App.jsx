import { useEffect, useRef, useState, useCallback } from "react";
import {
  GRID, generateTerrain, flatTerrain, applyBrush,
  computeSlopes, renderTerrain
} from "./terrain.js";
import "./App.css";

const BRUSHES = [
  { id: "raise",   icon: "▲", label: "Raise",   color: "#e8845a", desc: "Lift land upward" },
  { id: "lower",   icon: "▼", label: "Lower",   color: "#5aaee8", desc: "Carve into earth" },
  { id: "smooth",  icon: "◉", label: "Smooth",  color: "#a8e85a", desc: "Blend terrain" },
  { id: "flatten", icon: "▬", label: "Plateau", color: "#e8d45a", desc: "Create flat land" },
  { id: "noise",   icon: "≋", label: "Chaos",   color: "#c85ae8", desc: "Roughen terrain" },
];

const WORLDS = [
  { name: "Archipelago", seed: 42 },
  { name: "Pangaea",     seed: 17 },
  { name: "Ridgeline",   seed: 99 },
  { name: "Blank Ocean", seed: -1 }, // flat
];

export default function App() {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null); // cursor overlay
  const heightsRef = useRef(flatTerrain());
  const slopesRef = useRef(new Float32Array(GRID * GRID));
  const mouseRef = useRef({ down: false, x: 0, y: 0 });
  const settingsRef = useRef({ brush: "raise", radius: 10, strength: 0.018 });
  const animRef = useRef({ waterAnim: 0, lightAngle: Math.PI * 0.25 });
  const rafRef = useRef();
  const imgDataRef = useRef(null);
  const dirtyRef = useRef(true);
  const [ui, setUi] = useState({
    brush: "raise", radius: 10, strength: 3,
    showHelp: true, showWorlds: false,
    activeWorld: "Archipelago",
    elevInfo: null,
  });

  // Initialize canvas and first terrain
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: false });
    let W, H;

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      imgDataRef.current = ctx.createImageData(W, H);
      dirtyRef.current = true;
    };
    resize();
    window.addEventListener("resize", resize);

    // Load initial world
    heightsRef.current = generateTerrain(42);
    slopesRef.current = computeSlopes(heightsRef.current);
    dirtyRef.current = true;

    const loop = (ts) => {
      const anim = animRef.current;
      anim.waterAnim = ts * 0.001;
      anim.lightAngle = Math.PI * 0.25 + Math.sin(ts * 0.0001) * 0.3;

      if (dirtyRef.current || true) { // always re-render for water animation
        renderTerrain(
          heightsRef.current, slopesRef.current,
          imgDataRef.current, W, H,
          anim.waterAnim, anim.lightAngle
        );
        ctx.putImageData(imgDataRef.current, 0, 0);
        dirtyRef.current = false;
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // Brush application
  const applyAt = useCallback((px, py) => {
    const canvas = canvasRef.current;
    const W = canvas.width, H = canvas.height;
    const gx = (px / W) * (GRID - 1);
    const gy = (py / H) * (GRID - 1);
    const s = settingsRef.current;
    const newH = applyBrush(heightsRef.current, gx, gy, s.radius, s.strength, s.brush);
    heightsRef.current = newH;
    slopesRef.current = computeSlopes(newH);
    dirtyRef.current = true;

    // Elevation info
    const idx = Math.round(gy) * GRID + Math.round(gx);
    const elev = heightsRef.current[idx];
    setUi(u => ({ ...u, elevInfo: { x: px, y: py, h: elev } }));
  }, []);

  // Mouse/touch handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;

    const getPos = e => {
      const src = e.touches ? e.touches[0] : e;
      return { x: src.clientX, y: src.clientY };
    };

    const onDown = e => {
      if (e.target !== canvas && e.target !== overlay) return;
      e.preventDefault();
      mouseRef.current.down = true;
      const { x, y } = getPos(e);
      mouseRef.current.x = x; mouseRef.current.y = y;
      applyAt(x, y);
    };

    const onMove = e => {
      const { x, y } = getPos(e);
      mouseRef.current.x = x; mouseRef.current.y = y;
      // Update cursor overlay position
      if (overlay) {
        const r = settingsRef.current.radius;
        const scale = canvas.width / GRID;
        const size = r * scale * 2;
        overlay.style.left = (x - size/2) + "px";
        overlay.style.top  = (y - size/2) + "px";
        overlay.style.width  = size + "px";
        overlay.style.height = size + "px";
      }
      if (mouseRef.current.down) applyAt(x, y);
    };

    const onUp = () => { mouseRef.current.down = false; };

    window.addEventListener("mousedown",  onDown);
    window.addEventListener("mousemove",  onMove);
    window.addEventListener("mouseup",    onUp);
    window.addEventListener("touchstart", onDown, { passive: false });
    window.addEventListener("touchmove",  onMove, { passive: true });
    window.addEventListener("touchend",   onUp);

    return () => {
      window.removeEventListener("mousedown",  onDown);
      window.removeEventListener("mousemove",  onMove);
      window.removeEventListener("mouseup",    onUp);
      window.removeEventListener("touchstart", onDown);
      window.removeEventListener("touchmove",  onMove);
      window.removeEventListener("touchend",   onUp);
    };
  }, [applyAt]);

  const loadWorld = (w) => {
    if (w.seed === -1) heightsRef.current = flatTerrain();
    else heightsRef.current = generateTerrain(w.seed);
    slopesRef.current = computeSlopes(heightsRef.current);
    dirtyRef.current = true;
    setUi(u => ({ ...u, activeWorld: w.name, showWorlds: false }));
  };

  const setBrush = (id) => {
    settingsRef.current.brush = id;
    setUi(u => ({ ...u, brush: id }));
  };
  const setRadius = (v) => {
    settingsRef.current.radius = v;
    setUi(u => ({ ...u, radius: v }));
  };
  const setStrength = (v) => {
    settingsRef.current.strength = v * 0.006;
    setUi(u => ({ ...u, strength: v }));
  };

  const activeBrush = BRUSHES.find(b => b.id === ui.brush);
  const elevLabel = ui.elevInfo
    ? ui.elevInfo.h < 0.28 ? "Ocean" : ui.elevInfo.h < 0.32 ? "Beach"
    : ui.elevInfo.h < 0.58 ? "Forest" : ui.elevInfo.h < 0.84 ? "Mountain" : "Summit"
    : null;

  return (
    <div className="app">
      <canvas ref={canvasRef} className="canvas" />

      {/* Brush cursor ring */}
      <div ref={overlayRef} className="brush-cursor" style={{ borderColor: activeBrush?.color }} />

      {/* Header */}
      <header className="header">
        <div className="logo">
          <span className="logo-gem">◈</span>
          <div>
            <span className="logo-title">MORPHIC</span>
            <span className="logo-tag">Terrain Sculptor</span>
          </div>
        </div>
        <button className="world-trigger" onClick={() => setUi(u => ({ ...u, showWorlds: !u.showWorlds }))}>
          <span className="world-icon">🌍</span>
          <span>{ui.activeWorld}</span>
          <span className="caret">▾</span>
        </button>
      </header>

      {/* World selector */}
      {ui.showWorlds && (
        <div className="worlds-panel">
          <div className="worlds-label">SELECT WORLD</div>
          {WORLDS.map(w => (
            <button key={w.name}
              className={`world-btn ${ui.activeWorld === w.name ? "active" : ""}`}
              onClick={() => loadWorld(w)}>
              {w.name}
            </button>
          ))}
        </div>
      )}

      {/* Brush toolbar */}
      <div className="toolbar">
        <div className="tool-section">
          <div className="section-label">BRUSH</div>
          <div className="brush-btns">
            {BRUSHES.map(b => (
              <button key={b.id}
                className={`brush-btn ${ui.brush === b.id ? "active" : ""}`}
                style={{ "--c": b.color }}
                onClick={() => setBrush(b.id)}
                title={b.desc}>
                <span className="brush-icon">{b.icon}</span>
                <span className="brush-label">{b.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="tool-divider" />

        <div className="tool-section sliders">
          <div className="slider-group">
            <div className="slider-row">
              <span className="slider-lbl">SIZE</span>
              <input type="range" min="3" max="30" value={ui.radius} className="tslider"
                style={{ "--pct": `${((ui.radius-3)/27)*100}%` }}
                onChange={e => setRadius(+e.target.value)} />
              <span className="slider-val">{ui.radius}</span>
            </div>
            <div className="slider-row">
              <span className="slider-lbl">FORCE</span>
              <input type="range" min="1" max="10" value={ui.strength} className="tslider"
                style={{ "--pct": `${((ui.strength-1)/9)*100}%` }}
                onChange={e => setStrength(+e.target.value)} />
              <span className="slider-val">{ui.strength}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Elevation readout */}
      {ui.elevInfo && (
        <div className="elev-badge" style={{ left: ui.elevInfo.x + 18, top: ui.elevInfo.y - 36 }}>
          <span className="elev-zone">{elevLabel}</span>
          <span className="elev-num">{Math.round(ui.elevInfo.h * 8848)}m</span>
        </div>
      )}

      {/* Legend */}
      <div className="legend">
        {[
          { color:"#0a2060", label:"Deep Sea" },
          { color:"#c2b280", label:"Coast" },
          { color:"#4a8c3a", label:"Forest" },
          { color:"#8a7060", label:"Highland" },
          { color:"#e8e8f0", label:"Summit" },
        ].map(({ color, label }) => (
          <div key={label} className="legend-item">
            <span className="legend-swatch" style={{ background: color }} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Help overlay */}
      {ui.showHelp && (
        <div className="help-overlay" onClick={() => setUi(u => ({ ...u, showHelp: false }))}>
          <div className="help-card" onClick={e => e.stopPropagation()}>
            <div className="help-gem">◈</div>
            <h1 className="help-title">MORPHIC</h1>
            <p className="help-sub">A living world at your fingertips</p>
            <div className="help-grid">
              <div className="help-item">
                <div className="hi-icon" style={{color:"#e8845a"}}>▲</div>
                <div className="hi-text"><strong>Raise</strong> — Lift mountains from the deep</div>
              </div>
              <div className="help-item">
                <div className="hi-icon" style={{color:"#5aaee8"}}>▼</div>
                <div className="hi-text"><strong>Lower</strong> — Carve valleys and ocean floors</div>
              </div>
              <div className="help-item">
                <div className="hi-icon" style={{color:"#a8e85a"}}>◉</div>
                <div className="hi-text"><strong>Smooth</strong> — Blend and soften edges</div>
              </div>
              <div className="help-item">
                <div className="hi-icon" style={{color:"#e8d45a"}}>▬</div>
                <div className="hi-text"><strong>Plateau</strong> — Create flat tablelands</div>
              </div>
              <div className="help-item">
                <div className="hi-icon" style={{color:"#c85ae8"}}>≋</div>
                <div className="hi-text"><strong>Chaos</strong> — Roughen with random noise</div>
              </div>
              <div className="help-item">
                <div className="hi-icon">🌍</div>
                <div className="hi-text"><strong>Worlds</strong> — Switch procedural presets</div>
              </div>
            </div>
            <button className="help-start" onClick={() => setUi(u => ({ ...u, showHelp: false }))}>
              BEGIN SCULPTING →
            </button>
          </div>
        </div>
      )}

      {/* Help trigger */}
      <button className="help-fab" onClick={() => setUi(u => ({ ...u, showHelp: true }))}>◈</button>
    </div>
  );
}
