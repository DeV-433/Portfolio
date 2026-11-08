/* =============================================================
   Glass light toggle
   Port of "Glass Light Toggle" by Zsolt Kacso
   (https://experiments.thisiswhitespace.com/glass-light-toggle).
   Everything optical (glass, refraction, LED scatter) is one WebGL2
   fragment shader. The pixel icons are simulated on the CPU (per-pixel
   springs) and rasterised into a small 2D canvas the shader samples
   *through* the glass.

   Adapted for the header: the toggle is laid out in its original design
   space (432 × 224) and scaled to the button's height; the page behind it
   is transparent, so its shadow and light spill composite onto the site.

   Usage: window.createGlassToggle(button, { theme, onChange, onFrame }) → { set } | null
   p = 0 is dark (moon), p = 1 is light (sun).
   onChange(theme)  fires when the toggle commits to a new side.
   onFrame(info)    fires every frame with { theme (0..1, the knob's own
                    dark→light blend), target, dragging, settled } so the
                    page can follow the knob live.
   ============================================================= */
(function () {
  "use strict";

  // ---------------------------------------------------------------- layout (design px)
  const TRACK = { w: 432, h: 224, r: 72 };
  const PAD = 13;
  const KNOB_HALF = (TRACK.h - PAD * 2) / 2; // 99
  const KNOB_R = 58;
  const GRID = 17, C0 = 8, PITCH = 5.7, PSIZE = 4.6;
  const M = 64; // margin around the track for shadow + light spill
  const DW = TRACK.w + M * 2, DH = TRACK.h + M * 2;
  const cx = DW / 2, cy = DH / 2;
  const inner = TRACK.w / 2 - PAD - KNOB_HALF;
  const leftX = cx - inner, rightX = cx + inner;
  const box = { w: TRACK.w + 120, h: TRACK.h + 120 };
  box.x = cx - box.w / 2; box.y = cy - box.h / 2;

  // ---------------------------------------------------------------- tunables (shipped values)
  const P = {
    moonColor: "#6f86ff",
    sunColor: "#ffa82e",
    intensity: 1.89,
    lightWidth: 0.92,
    orbit: true,
    refraction: 40,
    frost: 0.76,
    swirl: 1.62,
    burst: 0.38,
    glow: 0.64,
    stiffness: 129,
  };
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const CM = hex(P.moonColor), CS = hex(P.sunColor);

  // ---------------------------------------------------------------- icons
  function buildMoon() {
    const out = [];
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      const dx = x - C0, dy = y - C0;
      const inMain = dx * dx + dy * dy <= 6.6 * 6.6;
      const sx = x - 11.3, sy = y - 5.6;
      const inShadow = sx * sx + sy * sy <= 5.4 * 5.4;
      if (inMain && !inShadow) out.push({ x, y, b: 1, kind: "lit" });
      else if (inMain && inShadow && (x + y) % 2 === 0) out.push({ x, y, b: 0.2, kind: "earth" });
    }
    for (const c of out) if ((c.x === 3 && c.y === 9) || (c.x === 6 && c.y === 12) || (c.x === 4 && c.y === 12)) c.b = 0.5;
    const stars = [[15, 1, 1], [14, 1, 0.45], [16, 1, 0.45], [15, 0, 0.45], [15, 2, 0.45], [11, 0, 0.75], [16, 5, 0.6]];
    for (const [x, y, b] of stars) out.push({ x, y, b, kind: "star" });
    return out;
  }

  function buildSun() {
    const m = new Map();
    const add = (x, y, b, kind, ang = 0) => { const k = x + "," + y; if (!m.has(k)) m.set(k, { x, y, b, kind, ang }); };
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      const dx = x - C0, dy = y - C0;
      if (dx * dx + dy * dy <= 3.7 * 3.7) add(x, y, 1, "core");
    }
    for (let a = 0; a < 8; a++) {
      const ang = a * Math.PI / 4;
      const rs = a % 2 ? [5.9, 7.2] : [5.6, 6.6, 7.6];
      for (const r of rs) add(Math.round(C0 + Math.cos(ang) * r), Math.round(C0 + Math.sin(ang) * r), 1, "ray", ang);
    }
    return [...m.values()];
  }

  const MOON = buildMoon();
  const SUN = buildSun();

  const angKey = (c) => {
    const a = Math.atan2(c.y - C0, c.x - C0);
    return ((a + Math.PI * 0.75 + Math.PI * 2) % (Math.PI * 2)) + Math.hypot(c.x - C0, c.y - C0) * 1e-3;
  };
  const rnd = (a, b) => a + Math.random() * (b - a);

  // Pair moon pixels with sun pixels by sweeping angle, so the morph reads as one coherent swirl.
  function pairUp() {
    const A = [...MOON].sort((p, q) => angKey(p) - angKey(q));
    const B = [...SUN].sort((p, q) => angKey(p) - angKey(q));
    const pairs = [];
    const big = A.length >= B.length ? A : B, small = big === A ? B : A;
    let last = -1;
    for (let i = 0; i < big.length; i++) {
      const j = Math.floor(i * small.length / big.length);
      const first = j !== last; last = j;
      const s = { ...small[j], b: first ? small[j].b : 0 };
      pairs.push(big === A ? [big[i], s] : [s, big[i]]);
    }
    return pairs.map(([a, b]) => {
      const lead = 1 - a.x / (GRID - 1);
      return {
        a, b,
        delay: 0.04 + lead * 0.26 + rnd(0, 0.06),
        curl: rnd(-1, 1) * 16 + (a.y - C0) * 0.9,
        lift: rnd(2, 12),
        k: rnd(260, 460),
        drag: rnd(0.004, 0.016),
        phase: rnd(0, Math.PI * 2),
        tw: rnd(1.5, 3.2),
        x: 0, y: 0, vx: 0, vy: 0, inited: false,
      };
    });
  }

  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const easeIO = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  // ---------------------------------------------------------------- shader
  const VS = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;

  // Same optics as the original. Differences: the page layer is transparent
  // (premultiplied alpha: shadow = black with alpha, light = emitted colour),
  // and edge widths scale with uPx so the toggle stays crisp at header size.
  const FS = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes; uniform float uPx;
uniform vec2 uC; uniform vec2 uTH; uniform float uTR;
uniform vec2 uK; uniform vec2 uKH; uniform float uKR;
uniform float uTheme, uTime, uLed, uLift, uFade;
uniform vec4 uBox;
uniform sampler2D uPix, uGlow;
uniform vec3 uLight;
uniform float uTheta, uHalfW, uRefract, uFrost, uGlowAmt;
#define AMBER uLight
float gPixA = 0.;
float AA, LW, DS;

// One glow model for both themes. On dark, light adds. On a bright surface adding does
// nothing, so emit as a saturated tint with the same falloff: same perceived strength.
vec3 glow(vec3 col, float amt){
  vec3 dark = col + uLight * amt;
  vec3 lit  = mix(col, uLight * 1.04 + 0.03, clamp(1. - exp(-amt * 1.3), 0., 0.88));
  return mix(dark, lit, uTheme);
}
// The same model on a premultiplied layer that may be transparent.
vec4 glowP(vec4 c, float amt){
  vec3 add = uLight * amt;
  vec4 dark = vec4(c.rgb + add, min(1., c.a + max(add.r, max(add.g, add.b)) * (1. - c.a)));
  float f = clamp(1. - exp(-amt * 1.3), 0., 0.88);
  vec4 lit = c * (1. - f) + vec4(uLight * 1.04 + 0.03, 1.) * f;
  return mix(dark, lit, uTheme);
}

float sdRB(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.)) + min(max(q.x,q.y),0.) - r; }
float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }

float tex(sampler2D s, vec2 p){
  vec2 uv = (p - uBox.xy) / uBox.zw;
  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) return 0.;
  return texture(s, uv).a;
}

// The light strip hugs the glass from outside and travels around its perimeter.
float ledSd(vec2 p){
  vec2 q = p - uK;
  float sk = sdRB(q, uKH, uKR);
  float a = atan(q.y, q.x);
  float da = abs(atan(sin(a - uTheta), cos(a - uTheta)));
  float tang = max(da - uHalfW, 0.) * 104.;
  float rad = sk - 6.5;
  return length(vec2(rad, tang)) - LW;
}

float ledFloor(vec2 p){
  float ls = max(ledSd(p), 0.);
  return (exp(-ls/14.)*0.85 + exp(-ls/55.)*0.32) * uLed;
}

// The world under the glass: track floor + LED wash + pixel matrix.
vec3 floorScene(vec2 p, float frost, vec2 ca){
  float th = uTheme;
  vec3 base = mix(vec3(0.030), vec3(0.900), th);
  base *= 1. + (p.y - uC.y)/uTH.y * mix(0.05, 0.012, th);
  float sOff = sdRB(p - uC - vec2(0., 7.), uTH, uTR);
  float inner = smoothstep(-14., 3., sOff);
  base = mix(base * (1. - inner*0.6), base - inner*0.085, th);

  float g = ledFloor(p);
  base = glow(base, g*0.55);

  vec3 a;
  a.r = mix(tex(uPix, p - ca), tex(uGlow, p - ca)*1.35, frost);
  a.g = mix(tex(uPix, p     ), tex(uGlow, p     )*1.35, frost);
  a.b = mix(tex(uPix, p + ca), tex(uGlow, p + ca)*1.35, frost);
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  float inkT = smoothstep(0.40, 0.56, lum);
  vec3 pc = mix(vec3(1.0, 0.965, 0.925), vec3(0.11, 0.105, 0.10), inkT);
  pc = mix(pc + AMBER*g*0.9, pc + vec3(0.25,0.08,0.0)*g, th);
  gPixA = clamp(a.g, 0., 1.);
  vec3 col = mix(base, pc, clamp(a, 0., 1.));
  col += vec3(1.0, 0.78, 0.55) * tex(uGlow, p) * uGlowAmt * (1. - th);
  return col;
}

void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uPx; // design space
  AA = max(0.6, 0.6 / uPx);   // ~half a device pixel, in design px
  LW = max(1.5, 0.75 / uPx);  // keep the strip at least ~1.5 device px thick
  DS = max(1., 0.5 / uPx);    // widen hairline highlights the same way
  float th = uTheme;

  // ---- page (transparent; premultiplied)
  vec4 col = vec4(0.);
  float st = sdRB(p - uC, uTH, uTR);
  float sh = 1. - smoothstep(-10., 34., sdRB(p - uC - vec2(0., 14.), uTH, uTR));
  float sh2 = 1. - smoothstep(-2., 4., sdRB(p - uC - vec2(0., 1.5), uTH, uTR));
  float a1 = sh * mix(0.5, 0.17, th), a2 = sh2 * mix(0.3, 0.08, th);
  col.a = 1. - (1. - a1) * (1. - a2);

  // LED spill onto the page
  float ls = max(ledSd(p), 0.);
  float spill = (exp(-ls/18.)*0.5 + exp(-ls/85.)*0.34) * uLed;
  col = glowP(col, spill*0.6);
  // fade out before the canvas edge
  col *= 1. - smoothstep(uFade * 0.3, uFade, st);

  // ---- track
  if (st < AA * 2.) {
    vec3 tc = floorScene(p, 0., vec2(0.));
    float sk0 = sdRB(p - uK - vec2(0., 7. + uLift*5.), uKH, uKR);
    float ksh = 1. - smoothstep(-8., 20. + uLift*8., sk0);
    tc *= 1. - ksh * mix(0.6, 0.2, th);
    float rim = 1. - smoothstep(0., 1.3 * DS, abs(st + 0.75 * DS));
    float bottom = smoothstep(-uTH.y*0.6, uTH.y, p.y - uC.y);
    tc += rim * mix(mix(0.035, 0.09, bottom), mix(-0.07, 0.07, bottom), th);
    col = mix(vec4(tc, 1.), col, smoothstep(-AA, AA, st));
  }

  // ---- glass knob
  float sk = sdRB(p - uK, uKH, uKR);
  if (sk < AA * 2.) {
    vec2 e = vec2(0.5, 0.);
    vec2 n = vec2(sdRB(p + e.xy - uK, uKH, uKR) - sdRB(p - e.xy - uK, uKH, uKR),
                  sdRB(p + e.yx - uK, uKH, uKR) - sdRB(p - e.yx - uK, uKH, uKR));
    n = n / max(length(n), 1e-4);
    float d = max(-sk, 0.);
    float t = clamp(d / 26., 0., 1.);
    float slope = pow(1. - t, 2.6);

    // refraction: bevel bends rays inward, centre magnifies slightly
    vec2 off = -n * slope * uRefract - (p - uK) * 0.055;
    float frost = 0.06 + uFrost * slope;
    vec3 g = floorScene(p + off, frost, n * slope * 3.2 + (p - uK) * 0.006);

    float vy = clamp((p.y - (uK.y - uKH.y)) / (2. * uKH.y), 0., 1.);
    vec3 dGlass = g * 0.84 + vec3(0.135) * (1. - vy * 0.55);
    vec3 lGlass = mix(g, vec3(0.99), 0.5 * (1. - gPixA * 0.8));
    vec3 kc = mix(dGlass, lGlass, th);

    // LED light entering the glass from below and scattering inside it
    float lq = max(ledSd(p), 0.);
    float sc = (exp(-lq / 24.) * 0.8 + exp(-lq / 64.) * 0.2) * uLed;
    kc = glow(kc, sc * 0.8);
    // light trapped in the bevel (total internal reflection), strongest near the source
    float rg = exp(-d / (2.2 * DS)) * exp(-lq / 40.) * uLed;
    kc = glow(kc, rg * 1.3);

    // specular
    vec2 Ld = normalize(vec2(-0.35, -1.0));
    float ndl = dot(n, Ld);
    kc += pow(max(ndl, 0.), 2.) * exp(-d / (1.25 * DS)) * mix(0.42, 0.7, th);
    kc += max(ndl, 0.) * slope * mix(0.07, 0.16, th);
    kc *= 1. - max(-ndl, 0.) * slope * mix(0.28, 0.07, th);
    kc += exp(-d / (0.7 * DS)) * mix(0.07, 0.12, th);

    col = mix(vec4(kc, 1.), col, smoothstep(-AA, AA, sk));
  }

  // ---- the light source itself
  float lsd = ledSd(p);
  float lm = 1. - smoothstep(-AA, AA, lsd);
  vec3 lc = mix(uLight * 1.05, mix(uLight, vec3(1.0), 0.65), smoothstep(-0.2, -LW * 0.9, lsd));
  col = mix(col, vec4(lc * (0.8 + 0.35 * uLed), 1.), lm);
  col = glowP(col, exp(-max(lsd, 0.) / 4.5) * 0.55 * uLed * (1. - lm));

  col.rgb += (hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * 0.022 * col.a;
  col.a = clamp(col.a, 0., 1.);
  o = vec4(clamp(col.rgb, 0., col.a), col.a);
}`;

  // ---------------------------------------------------------------- factory
  function createGlassToggle(button, { theme = "light", onChange, onFrame } = {}) {
    const canvas = document.createElement("canvas");
    canvas.className = "glass-toggle-canvas";
    canvas.setAttribute("aria-hidden", "true");
    const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: true, alpha: true });
    if (!gl) return null;

    function sh(type, src) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (err) {
      console.warn("[glass-toggle]", err);
      return null;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aLoc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(aLoc);
    gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

    const U = {};
    for (const n of ["uRes", "uPx", "uC", "uTH", "uTR", "uK", "uKH", "uKR", "uTheme", "uTime", "uLed", "uLift", "uFade", "uBox", "uPix", "uGlow", "uLight", "uTheta", "uHalfW", "uRefract", "uFrost", "uGlowAmt"])
      U[n] = gl.getUniformLocation(prog, n);

    function mkTex(unit) {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    const texPix = mkTex(0), texGlow = mkTex(1);
    gl.uniform1i(U.uPix, 0); gl.uniform1i(U.uGlow, 1);

    // pixel canvases (in device pixels of the design-space box)
    const pcan = document.createElement("canvas");
    const pctx = pcan.getContext("2d");
    const gcan = document.createElement("canvas");
    const gctx = gcan.getContext("2d");
    const HAS_FILTER = typeof gctx.filter === "string" && (gctx.filter = "blur(1px)", gctx.filter === "blur(1px)");
    gctx.filter = "none";

    const PIX = pairUp();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const start = theme === "light" ? 1 : 0;
    const state = {
      p: start, v: 0, target: start,
      dragging: false, dragStartX: 0, dragStartP: 0, moved: 0, lastT: 0, dragV: 0, pendingClick: false,
      hover: 0, hoverT: 0, press: 0, pressT: 0, led: 1, kick: 0, dir: start ? -1 : 1, sp: start, spv: 0,
    };
    let committed = start;

    button.classList.add("is-glass");
    button.prepend(canvas);

    // ---- sizing: the button's height sets the scale
    let S = 1, R = 1;
    function resize() {
      const h = button.clientHeight || 38;
      S = h / TRACK.h;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.style.width = `${DW * S}px`;
      canvas.style.height = `${DH * S}px`;
      canvas.style.left = `${-M * S}px`;
      canvas.style.top = `${-M * S}px`;
      canvas.width = Math.max(1, Math.round(DW * S * dpr));
      canvas.height = Math.max(1, Math.round(DH * S * dpr));
      R = canvas.width / DW; // device px per design px
      pcan.width = Math.max(1, Math.round(box.w * R)); pcan.height = Math.max(1, Math.round(box.h * R));
      gcan.width = Math.max(1, Math.round(box.w * R / 2)); gcan.height = Math.max(1, Math.round(box.h * R / 2));
      gl.viewport(0, 0, canvas.width, canvas.height);
      for (const px of PIX) px.inited = false;
    }
    resize();
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(button);
    window.addEventListener("resize", resize);

    // ---- simulation
    function pixelTarget(px, p, time, kx) {
      // Translation is carried by the glass; the morph is a local rearrangement around it.
      const t = Math.min(1, Math.max(0, (p - px.delay) / 0.62));
      const e = easeIO(t);
      const ox = (px.a.x - C0) * PITCH, oy = (px.a.y - C0) * PITCH;
      const tx = (px.b.x - C0) * PITCH, ty = (px.b.y - C0) * PITCH;
      const dx = tx - ox, dy = ty - oy, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const arc = Math.sin(Math.PI * e);
      let x = ox + dx * e + nx * px.curl * P.swirl * arc;
      let y = oy + dy * e + ny * px.curl * P.swirl * arc;
      // breathe outward mid-morph, like the icon exhales and re-forms
      const r = Math.hypot(x, y) || 1;
      x += (x / r) * px.lift * arc * 1.4 * P.burst;
      y += (y / r) * px.lift * arc * 1.4 * P.burst;

      let ba = px.a.b, bb = px.b.b;
      if (px.a.kind === "star") ba *= 0.45 + 0.55 * Math.pow(Math.sin(time * px.tw + px.phase), 2);
      if (px.b.kind === "ray") bb *= 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(time * 2.2 - px.b.ang));
      const bright = (ba + (bb - ba) * e) * (1 + 0.3 * arc);
      const size = PSIZE * (1 - 0.45 * arc);
      return { x: kx + x, y: cy + y, bright, size };
    }

    let lastT = performance.now();
    function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min(1 / 30, (now - lastT) / 1000); lastT = now;
      if (!button.offsetParent) return; // hidden (e.g. recruiter view)
      const time = now / 1000;
      const s = state;

      // knob position spring (scrubbed directly while dragging)
      if (!s.dragging) {
        const k = P.stiffness, c = 2 * Math.sqrt(k) * 0.6;
        const steps = 4, h = dt / steps;
        for (let i = 0; i < steps; i++) {
          const a = -k * (s.p - s.target) - c * s.v;
          s.v += a * h; s.p += s.v * h;
        }
      }
      s.hover += (s.hoverT - s.hover) * Math.min(1, dt * 10);
      s.press += (s.pressT - s.press) * Math.min(1, dt * 18);
      s.kick *= Math.exp(-dt * 3.5);
      s.led = 1 + s.hover * 0.08 + Math.min(Math.abs(s.v) * 0.05, 0.18) + s.kick * 0.12;

      const pc = Math.min(1, Math.max(0, s.p));
      const over = Math.max(-s.p, s.p - 1, 0);
      const speed = Math.abs(s.v);
      const stretch = Math.min(speed * 6.5, 16);
      let khx = KNOB_HALF + stretch - over * 110;
      let khy = Math.min(KNOB_HALF - stretch * 0.45 + over * 30, KNOB_HALF + 5);
      const squeeze = 1 - s.press * 0.035;
      khx *= squeeze; khy *= squeeze;
      let kx = leftX + (rightX - leftX) * pc;
      if (s.p > 1) kx += over * 110; else if (s.p < 0) kx -= over * 110;
      const theme = smooth(0.18, 0.82, pc);

      // Light orbit: bottom → leading side → top, then onward round the other side.
      {
        const goal = easeIO(pc), k = 70, c = 2 * Math.sqrt(k);
        s.spv += (-k * (s.sp - goal) - c * s.spv) * dt;
        s.sp += s.spv * dt;
      }
      const sp = Math.min(1, Math.max(0, s.sp));
      if (sp < 0.015) s.dir = 1; else if (sp > 0.985) s.dir = -1;
      const HALF = Math.PI / 2;
      let theta = s.dir > 0 ? HALF - Math.PI * sp : -HALF - Math.PI * (1 - sp);
      if (!P.orbit) theta = HALF;

      // pixels: each one springs toward its path position (organic trailing)
      const kvx = s.v * (rightX - leftX);
      for (const px of PIX) {
        const tg = pixelTarget(px, pc, time, 0);
        const rx = tg.x, ry = tg.y - cy;
        if (!px.inited) { px.x = rx; px.y = ry; px.vx = 0; px.vy = 0; px.inited = true; }
        const kk = px.k, cc = 2 * Math.sqrt(kk) * 0.72;
        px.vx += (-kk * (px.x - rx) - cc * px.vx) * dt;
        px.vy += (-kk * (px.y - ry) - cc * px.vy) * dt;
        px.x += px.vx * dt; px.y += px.vy * dt;
        const drag = Math.max(-14, Math.min(14, -kvx * px.drag));
        px.sx = kx + px.x + drag; px.sy = cy + px.y;
        px.bright = tg.bright; px.size = tg.size;
      }

      // raster pixels
      pctx.setTransform(1, 0, 0, 1, 0, 0);
      pctx.clearRect(0, 0, pcan.width, pcan.height);
      pctx.setTransform(R, 0, 0, R, -box.x * R, -box.y * R);
      pctx.fillStyle = "#fff";
      for (const px of PIX) {
        if (px.bright <= 0.002) continue;
        pctx.globalAlpha = Math.min(1, px.bright);
        const sz = px.size;
        pctx.fillRect(px.sx - sz / 2, px.sy - sz / 2, sz, sz);
      }
      pctx.globalAlpha = 1;
      gctx.setTransform(1, 0, 0, 1, 0, 0);
      gctx.clearRect(0, 0, gcan.width, gcan.height);
      if (HAS_FILTER) {
        gctx.filter = `blur(${4 * R / 2}px)`;
        gctx.drawImage(pcan, 0, 0, gcan.width, gcan.height);
        gctx.filter = "none";
      } else {
        const r = 3 * R / 2;
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          gctx.globalAlpha = 0.16;
          gctx.drawImage(pcan, Math.cos(a) * r, Math.sin(a) * r, gcan.width, gcan.height);
        }
        gctx.globalAlpha = 1;
      }

      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texPix);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pcan);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texGlow);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gcan);

      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uPx, R);
      gl.uniform2f(U.uC, cx, cy);
      gl.uniform2f(U.uTH, TRACK.w / 2, TRACK.h / 2);
      gl.uniform1f(U.uTR, TRACK.r);
      gl.uniform2f(U.uK, kx, cy);
      gl.uniform2f(U.uKH, khx, khy);
      gl.uniform1f(U.uKR, Math.min(KNOB_R, khx - 1, khy - 1));
      gl.uniform1f(U.uTheme, theme);
      gl.uniform1f(U.uTime, time);
      gl.uniform1f(U.uLed, s.led * P.intensity);
      gl.uniform1f(U.uFade, M - 2);
      gl.uniform3f(U.uLight, CM[0] + (CS[0] - CM[0]) * theme, CM[1] + (CS[1] - CM[1]) * theme, CM[2] + (CS[2] - CM[2]) * theme);
      gl.uniform1f(U.uTheta, theta);
      gl.uniform1f(U.uHalfW, P.lightWidth);
      gl.uniform1f(U.uRefract, P.refraction);
      gl.uniform1f(U.uFrost, P.frost);
      gl.uniform1f(U.uGlowAmt, P.glow);
      gl.uniform1f(U.uLift, s.hover * (1 - s.press));
      gl.uniform4f(U.uBox, box.x, box.y, box.w, box.h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      onFrame?.({
        theme,
        target: s.target,
        dragging: s.dragging,
        settled: !s.dragging && Math.abs(s.p - s.target) < 0.002 && Math.abs(s.v) < 0.02,
      });
    }

    // ---- commit: tell the site once the target settles on a new side
    function commit() {
      if (state.target === committed) return;
      committed = state.target;
      onChange?.(committed ? "light" : "dark");
    }
    function snapIfReduced() {
      if (!reducedMotion.matches) return;
      state.p = state.target; state.v = 0;
      state.sp = state.target; state.spv = 0;
      for (const px of PIX) px.inited = false;
    }
    function toggle() {
      state.target = state.target > 0.5 ? 0 : 1;
      state.kick = 1;
      snapIfReduced();
      commit();
    }

    // ---- input
    const inRoundRect = (x, y, hx0, hy0, hw, hh, r) => {
      const qx = Math.abs(x - hx0) - hw + r, qy = Math.abs(y - hy0) - hh + r;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r <= 0;
    };
    const toD = (clientX, clientY) => {
      const rect = button.getBoundingClientRect();
      return [cx - TRACK.w / 2 + (clientX - rect.left) / S, cy - TRACK.h / 2 + (clientY - rect.top) / S];
    };
    const knobX = () => leftX + (rightX - leftX) * Math.min(1, Math.max(0, state.p));
    const overKnob = (x, y) => inRoundRect(x, y, knobX(), cy, KNOB_HALF, KNOB_HALF, KNOB_R);

    button.addEventListener("pointerenter", (e) => { state.hoverT = e.pointerType === "mouse" ? 1 : 0; });
    button.addEventListener("pointerleave", () => { state.hoverT = 0; });
    // Move/up are read on window: while the page's View Transition runs, hit
    // testing goes to the transition overlay, not the button.
    let activePointer = null;
    window.addEventListener("pointermove", (e) => {
      const s = state;
      if (!s.dragging || e.pointerId !== activePointer) return;
      const dx = (e.clientX - s.dragStartX) / S;
      s.moved = Math.max(s.moved, Math.abs(e.clientX - s.dragStartX));
      let p = s.dragStartP + dx / (rightX - leftX);
      if (p > 1) p = 1 + (p - 1) * 0.22;
      if (p < 0) p = p * 0.22;
      const t = performance.now();
      const ddt = Math.max(1, t - s.lastT) / 1000;
      s.dragV = s.dragV * 0.6 + ((p - s.p) / ddt) * 0.4;
      s.v = s.dragV; s.p = p; s.lastT = t;
    });
    button.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const s = state;
      activePointer = e.pointerId;
      try { button.setPointerCapture(e.pointerId); } catch {}
      s.pressT = 1; s.moved = 0;
      if (overKnob(...toD(e.clientX, e.clientY))) {
        s.dragging = true; s.dragStartX = e.clientX; s.dragStartP = s.p; s.lastT = performance.now(); s.dragV = 0;
      } else {
        s.pendingClick = true;
      }
    });
    function release(e) {
      if (e.pointerId !== activePointer) return;
      activePointer = null;
      const s = state;
      s.pressT = 0;
      if (s.dragging) {
        s.dragging = false;
        if (s.moved < 3) toggle();
        else { s.target = (s.p + s.dragV * 0.15) > 0.5 ? 1 : 0; s.kick = 0.6; snapIfReduced(); commit(); }
      } else if (s.pendingClick) toggle();
      s.pendingClick = false;
    }
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", (e) => {
      if (e.pointerId !== activePointer) return;
      activePointer = null;
      state.pressT = 0; state.pendingClick = false;
      if (state.dragging) { state.dragging = false; state.target = state.p > 0.5 ? 1 : 0; commit(); }
    });
    // Pointer input is handled above; the native click only matters for the keyboard.
    button.addEventListener("click", (e) => { if (e.detail === 0) toggle(); });
    button.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" && state.target !== 0) { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowRight" && state.target !== 1) { e.preventDefault(); toggle(); }
    });

    requestAnimationFrame(frame);

    return {
      // Sync from outside (system preference, another control) without re-firing onChange.
      set(next) {
        const t = next === "light" ? 1 : 0;
        if (t === state.target && t === committed) return;
        state.target = t; committed = t; state.kick = 1;
        snapIfReduced();
      },
    };
  }

  window.createGlassToggle = createGlassToggle;
})();
