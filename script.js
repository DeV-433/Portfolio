document.documentElement.classList.add("js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/* ---------- Boot screen (1.5s) ---------- */
let boot = document.querySelector("[data-boot]");
// Recruiters arriving via ?view=recruiter get straight to the content.
if (boot && document.documentElement.dataset.view === "recruiter") {
  boot.remove();
  boot = null;
}
if (boot) {
  // The loader plays over the page top; don't restore a mid-page scroll.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);
  const statusEl = boot.querySelector("[data-boot-status]");
  const lines = boot.querySelectorAll("[data-boot-lines] li");
  const phases = ["loading environment", "indexing content", "streaming interface"];
  lines.forEach((li, i) => li.style.setProperty("--boot-line-delay", `${140 + i * 210}ms`));
  const total = 1500;
  if (statusEl) {
    phases.forEach((text, i) => {
      window.setTimeout(() => { statusEl.textContent = text + "…"; }, (total / phases.length) * i);
    });
  }
  window.setTimeout(() => {
    boot.classList.add("is-done");
    window.setTimeout(() => {
      boot.classList.add("gone");
      window.dispatchEvent(new Event("boot:done"));
    }, reducedMotion ? 60 : 760);
  }, total);
}

/* Boot gate: hold the counter start and reveal start until the loader lifts,
   so the hero entrance is actually seen. */
let bootDone = true;
function whenBooted(fn) {
  if (bootDone) fn();
  else window.addEventListener("boot:done", fn, { once: true });
}
if (boot) {
  bootDone = false;
  window.addEventListener("boot:done", () => { bootDone = true; }, { once: true });
}

/* ---------- Theme ---------- */
const themeToggle = document.querySelector("[data-theme-toggle]");
const root = document.documentElement;

function applyTheme(theme) {
  root.dataset.theme = theme;
  themeToggle?.setAttribute("aria-pressed", String(theme === "dark"));
  themeToggle?.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
}
applyTheme(root.dataset.theme === "dark" ? "dark" : "light");

/* Animated theme switch via the View Transitions API.
   dark → light : the new (light) theme expands outward from the toggle.
   light → dark : the exact reverse — the old (light) theme contracts
                  back into the toggle, revealing the dark theme behind it. */
let themeLock = false;

function setTheme(next, origin) {
  if (themeLock) return;
  try { localStorage.setItem("theme", next); } catch {}
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animate = !reduce && origin && document.startViewTransition;

  const doApply = () => applyTheme(next);

  if (!animate) {
    doApply();
    return;
  }
  themeLock = true;
  root.classList.add("theme-transitioning");
  const contracting = next === "dark";
  if (contracting) root.classList.add("is-light-to-dark");
  const transition = document.startViewTransition(doApply);
  transition.ready.then(() => {
    const x = origin.x, y = origin.y;
    const end = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );
    const expand = next === "light"; // dark→light expands; light→dark contracts
    const keyframes = expand
      ? [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`]
      : [`circle(${end}px at ${x}px ${y}px)`, `circle(0px at ${x}px ${y}px)`];
    document.documentElement.animate(
      { clipPath: keyframes },
      {
        duration: 560,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        pseudoElement: expand ? "::view-transition-new(root)" : "::view-transition-old(root)",
        // Hold the final clip until the View Transition tears down. Without
        // this, the clip is dropped the moment the animation ends and the
        // contracted old (light) snapshot flashes back for one frame at the
        // end of light → dark before the pseudo-elements are removed.
        fill: "forwards",
      }
    );
  });
  // `finished` resolves after the pseudo-elements are gone, so restoring the
  // default stacking order here can't affect the transition.
  const cleanup = () => {
    root.classList.remove("theme-transitioning");
    root.classList.remove("is-light-to-dark");
    themeLock = false;
  };
  transition.finished.then(cleanup, cleanup);
}

themeToggle?.addEventListener("click", () => {
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  const rect = themeToggle.getBoundingClientRect();
  setTheme(next, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
});
/* System preference changes update the site only when the user hasn't
   made an explicit choice. */
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
systemDark.addEventListener?.("change", (e) => {
  let stored = null;
  try { stored = localStorage.getItem("theme"); } catch {}
  if (!stored) applyTheme(e.matches ? "dark" : "light");
});

/* ---------- Full-screen menu (small screens) ---------- */
const menuToggle = document.querySelector("[data-menu-toggle]");
const menuLabel = menuToggle?.querySelector(".menu-label");
const mobilePanel = document.querySelector("[data-mobile-panel]");
const pageRegions = [...document.querySelectorAll("main, .site-footer")];

function setMenu(open, { focusFirst = false } = {}) {
  if (!menuToggle || !mobilePanel) return;
  if (open === mobilePanel.classList.contains("is-open")) return;
  menuToggle.setAttribute("aria-expanded", String(open));
  if (menuLabel) menuLabel.textContent = open ? "Close" : "Menu";
  mobilePanel.classList.toggle("is-open", open);
  root.classList.toggle("menu-open", open); // locks page scroll
  pageRegions.forEach((el) => { el.inert = open; }); // nothing behind is reachable
  if (open) {
    // Number only the items shown in the current view so the stagger has no gaps.
    let i = 0;
    mobilePanel.querySelectorAll(".mobile-kicker, .mobile-links li, .mobile-foot").forEach((el) => {
      if (el.getClientRects().length) el.style.setProperty("--i", i++);
    });
    if (focusFirst) {
      [...mobilePanel.querySelectorAll(".mobile-links a")].find((a) => a.getClientRects().length)?.focus();
    }
  } else if (mobilePanel.contains(document.activeElement)) {
    menuToggle.focus();
  }
}
menuToggle?.addEventListener("click", (event) => {
  // event.detail === 0 → opened from the keyboard: move focus into the menu.
  setMenu(menuToggle.getAttribute("aria-expanded") !== "true", { focusFirst: event.detail === 0 });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenu(false);
});
// Following any in-page link (menu items, the brand) closes the menu first,
// so the page is scrollable again before the jump.
document.addEventListener("click", (event) => {
  if (event.target.closest('a[href^="#"]')) setMenu(false);
});
// The menu only exists below 960px; don't leave the page locked on resize.
window.matchMedia("(min-width: 961px)").addEventListener("change", (e) => {
  if (e.matches) setMenu(false);
});

/* ---------- Centered scroll for select anchor links ---------- */
/* The contact section has large padding; a default anchor jump leaves
   the card low in the viewport. These links center the target card.
   Because reveal animations can shift layout mid-scroll, the centering
   is corrected once more after the scroll settles. */
function centerTarget(target, behavior) {
  const card = target.querySelector(".contact-card") || target;
  const rect = card.getBoundingClientRect();
  const offset = rect.top + window.scrollY - (window.innerHeight - rect.height) / 2;
  window.scrollTo({ top: Math.max(0, offset), behavior });
}
document.querySelectorAll('a[data-scroll="center"]').forEach((link) => {
  link.addEventListener("click", (e) => {
    const hash = link.getAttribute("href");
    const target = hash && hash.startsWith("#") ? document.querySelector(hash) : null;
    if (!target) return;
    e.preventDefault();
    history.replaceState(null, "", hash);
    const behavior = reducedMotion ? "auto" : "smooth";
    centerTarget(target, behavior);
    if (behavior === "smooth" && "onscrollend" in document) {
      const correct = () => {
        document.removeEventListener("scrollend", correct);
        centerTarget(target, "smooth");
      };
      document.addEventListener("scrollend", correct);
    }
  });
});

/* ---------- Reveal on scroll ---------- */
const revealElements = document.querySelectorAll("[data-reveal]");
revealElements.forEach((el) => {
  if (el.dataset.delay) el.style.setProperty("--reveal-delay", `${el.dataset.delay}ms`);
});
if (reducedMotion || !("IntersectionObserver" in window)) {
  revealElements.forEach((el) => el.classList.add("revealed"));
} else {
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("revealed");
        obs.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8%", threshold: 0.08 }
  );
  // Start observing after the boot screen lifts so the hero entrance
  // is actually seen instead of playing underneath the loader.
  whenBooted(() => revealElements.forEach((el) => observer.observe(el)));
}

/* ---------- Header + progress + active nav ---------- */
const header = document.querySelector("[data-header]");
const progress = document.querySelector("[data-progress]");
const navLinks = [...document.querySelectorAll("[data-nav-link]")];
let ticking = false;

/* Scroll-spy tracks whichever nav links belong to the current view. */
function currentSections() {
  const view = root.dataset.view === "recruiter" ? "recruiter" : "explore";
  // Desktop and menu links point at the same sections; measure each once.
  const ids = new Set(
    navLinks.filter((link) => link.dataset.viewOnly === view).map((link) => link.getAttribute("href"))
  );
  return [...ids].map((id) => document.querySelector(id)).filter(Boolean);
}

/* Cache section offsets so scrolling never forces layout reads. */
let sectionOffsets = [];
let lastNavSection = null; // last item in nav order — wins at page bottom
function measureSections() {
  const sectionEls = currentSections();
  const y0 = window.scrollY;
  sectionOffsets = sectionEls.map((el) => ({ id: el.id, top: y0 + el.getBoundingClientRect().top }));
  lastNavSection = sectionEls.length ? sectionEls[sectionEls.length - 1].id : null;
  sectionOffsets.sort((a, b) => a.top - b.top);
}
measureSections();
window.addEventListener("resize", () => {
  measureSections();
  if (!ticking) {
    ticking = true;
    window.requestAnimationFrame(updateScrollUI);
  }
}, { passive: true });

function updateScrollUI() {
  const y = window.scrollY;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  header?.classList.toggle("scrolled", y > 24);
  if (progress) progress.style.transform = `scaleX(${max > 0 ? Math.min(y / max, 1) : 0})`;

  // Find the last section whose (cached) top has passed the header bias line.
  let current = null;
  const bias = 180;
  for (const s of sectionOffsets) {
    if (s.top - y <= bias) current = s.id;
  }
  // Near the very bottom, the last section should win even if its top hasn't passed the bias line
  if (window.innerHeight + y >= document.documentElement.scrollHeight - 40) {
    current = lastNavSection;
  }
  navLinks.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${current}`);
  });
  ticking = false;
}
window.addEventListener(
  "scroll",
  () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateScrollUI);
  },
  { passive: true }
);
updateScrollUI();

/* ---------- Pointer effects: glow + cursor in one rAF loop ---------- */
const glow = document.querySelector("[data-mouse-glow]");
const dot = document.querySelector("[data-cursor-dot]");
const ring = document.querySelector("[data-cursor-ring]");
const pointerFX = finePointer && !reducedMotion;

if (pointerFX) {
  let mx = window.innerWidth / 2, my = window.innerHeight * 0.3;
  let gx = mx, gy = my;
  let rx = mx, ry = my;
  let visible = false;

  window.addEventListener(
    "pointermove",
    (e) => {
      mx = e.clientX; my = e.clientY;
      wake();
      if (!visible) {
        visible = true;
        dot && (dot.style.opacity = "1");
        ring && (ring.style.opacity = "1");
      }
    },
    { passive: true }
  );
  document.addEventListener("pointerleave", () => {
    visible = false;
    dot && (dot.style.opacity = "0");
    ring && (ring.style.opacity = "0");
  });

  const HALF_GLOW = 280; // half of the glow element's 560px size
  let ringScale = 1, ringTarget = 1;

  // The loop eases everything toward the pointer, then goes to sleep once it
  // has settled, so an idle mouse costs no frames. Pointer events wake it.
  let running = false;
  function loop() {
    gx += (mx - gx) * 0.07;
    gy += (my - gy) * 0.07;
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    ringScale += (ringTarget - ringScale) * 0.22;
    // Compositor-only movement: translate3d/transform never trigger layout.
    if (glow) glow.style.transform = `translate3d(${(gx - HALF_GLOW).toFixed(1)}px, ${(gy - HALF_GLOW).toFixed(1)}px, 0)`;
    if (dot) dot.style.transform = `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%)`;
    if (ring) ring.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0) translate(-50%, -50%) scale(${ringScale.toFixed(3)})`;
    const settled =
      Math.abs(mx - gx) < 0.1 && Math.abs(my - gy) < 0.1 &&
      Math.abs(mx - rx) < 0.1 && Math.abs(my - ry) < 0.1 &&
      Math.abs(ringTarget - ringScale) < 0.001;
    if (settled) running = false;
    else requestAnimationFrame(loop);
  }
  function wake() {
    if (running) return;
    running = true;
    requestAnimationFrame(loop);
  }
  wake();

  const hoverables = "a, button, [role='tab'], .stack-items span";
  document.addEventListener("pointerover", (e) => {
    if (e.target.closest(hoverables)) {
      ringTarget = 1.65;
      ring?.classList.add("is-hover");
      wake();
    }
  });
  document.addEventListener("pointerout", (e) => {
    if (e.target.closest(hoverables)) {
      ringTarget = 1;
      ring?.classList.remove("is-hover");
      wake();
    }
  });
} else {
  dot?.remove();
  ring?.remove();
  glow?.remove();
}

/* ---------- Magnetic buttons ---------- */
if (pointerFX) {
  document.querySelectorAll("[data-magnetic]").forEach((el) => {
    let rect = null;
    el.addEventListener("pointerenter", () => {
      rect = el.getBoundingClientRect(); // measure once, before any translate
    });
    el.addEventListener("pointermove", (e) => {
      if (!rect) return;
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      el.style.setProperty("--mx", `${(dx * 0.12).toFixed(1)}px`);
      el.style.setProperty("--my", `${(dy * 0.28).toFixed(1)}px`);
    });
    el.addEventListener("pointerleave", () => {
      rect = null;
      el.style.setProperty("--mx", "0px");
      el.style.setProperty("--my", "0px");
    });
  });
}

/* ---------- Tilt + per-card glow ---------- */
if (pointerFX) {
  document.querySelectorAll("[data-tilt]").forEach((card) => {
    let raf = null;
    let rect = null;
    card.addEventListener("pointerenter", () => {
      card.style.willChange = "transform";
      rect = card.getBoundingClientRect(); // measure once, before any transform
    });
    card.addEventListener("pointermove", (e) => {
      if (raf || !rect) return;
      raf = requestAnimationFrame(() => {
        const px = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
        const py = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);
        card.style.setProperty("--glow-x", `${(px * 100).toFixed(1)}%`);
        card.style.setProperty("--glow-y", `${(py * 100).toFixed(1)}%`);
        const maxTilt = card.classList.contains("terminal-card") ? 3.2 : 2;
        card.style.transform = `perspective(1200px) rotateX(${((0.5 - py) * maxTilt).toFixed(2)}deg) rotateY(${((px - 0.5) * maxTilt * 1.2).toFixed(2)}deg)`;
        raf = null;
      });
    });
    card.addEventListener("pointerleave", () => {
      card.style.transform = "";
      card.style.willChange = "";
      rect = null;
    });
  });
}

/* ---------- Hero: typewriter, IST clock ---------- */

const typewriterEl = document.querySelector("[data-typewriter]");
if (typewriterEl) {
  if (reducedMotion) {
    typewriterEl.textContent = "Grounded in retrieved code — always.";
  } else {
    const phrases = [
      "Grounded in retrieved code — always.",
      "Every claim traceable to source.",
      "Streamed token by token over SSE.",
    ];
    let pi = 0, ci = 0, deleting = false, waiting = false;
    const step = () => {
      if (waiting) return;
      const phrase = phrases[pi];
      if (!deleting) {
        ci++;
        typewriterEl.textContent = phrase.slice(0, ci);
        if (ci === phrase.length) {
          waiting = true;
          window.setTimeout(() => {
            waiting = false;
            deleting = true;
            step();
          }, 3200);
          return;
        }
        window.setTimeout(step, 34 + Math.random() * 40);
      } else {
        ci--;
        typewriterEl.textContent = phrase.slice(0, ci);
        if (ci === 0) {
          deleting = false;
          pi = (pi + 1) % phrases.length;
          window.setTimeout(step, 420);
          return;
        }
        window.setTimeout(step, 14);
      }
    };
    window.setTimeout(step, 1600);
  }
}

const clocks = document.querySelectorAll("[data-clock]");
if (clocks.length) {
  const fmt = new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
  const update = () => {
    const now = fmt.format(new Date());
    clocks.forEach((el) => { el.textContent = now; });
  };
  update();
  window.setInterval(update, 15000);
}

const yearEl = document.querySelector("[data-year]");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

/* ---------- Featured project layer tabs ---------- */
const layers = {
  engine: {
    index: "LAYER 01 / CODE INTELLIGENCE",
    title: "contextplus",
    copy: "A custom code intelligence engine using tree-sitter AST parsing across 36 programming languages, paired with Jina AI vector embeddings for semantic code search over any repository.",
    tags: ["tree-sitter", "AST parsing", "Jina AI embeddings", "semantic search"],
    note: "contextplus — the custom code intelligence engine.",
  },
  pipeline: {
    index: "LAYER 02 / AGENTIC RAG",
    title: "RAG on Bedrock",
    copy: "A RAG-powered agentic pipeline on Amazon Bedrock (Claude Sonnet 4) with a multi-round tool-use loop — up to 6 rounds — for conversational Q&A over any GitHub repository.",
    tags: ["Amazon Bedrock", "Claude Sonnet 4", "6-round tool use", "conversational Q&A"],
    note: "The reasoning loop that answers questions about your code.",
  },
  backend: {
    index: "LAYER 03 / INFRASTRUCTURE",
    title: "Go backend",
    copy: "A Go HTTP backend on AWS EC2 with Server-Sent Events for real-time progress streaming — Bedrock Converse API integration with exponential backoff retry and automatic Groq LLaMA fallback.",
    tags: ["Go", "AWS EC2", "Server-Sent Events", "exponential backoff", "Groq fallback"],
    note: "The part that keeps working when things go wrong.",
  },
  diagrams: {
    index: "LAYER 04 / PROMPT-TO-DIAGRAM",
    title: "Diagrams on demand",
    copy: "A Prompt-to-Diagram engine generating Architecture, UML Sequence, and ER diagrams from live code via LLM inference — with natural-language post-generation editing support.",
    tags: ["Architecture", "UML Sequence", "ER diagrams", "NL editing"],
    note: "Ask for a diagram. Edit it in plain English.",
  },
};
const layerTabs = [...document.querySelectorAll("[data-layer]")];
const layerIndex = document.querySelector("[data-layer-index]");
const layerTitle = document.querySelector("[data-layer-title]");
const layerCopy = document.querySelector("[data-layer-copy]");
const layerTags = document.querySelector("[data-layer-tags]");
const layerNote = document.querySelector("[data-layer-note]");

function renderLayer(key) {
  const layer = layers[key];
  if (!layer) return;
  if (layerIndex) layerIndex.textContent = layer.index;
  if (layerNote) layerNote.textContent = layer.note;
  const targets = [
    [layerTitle, layer.title],
    [layerCopy, layer.copy],
  ];
  targets.forEach(([el, text]) => {
    if (!el) return;
    el.classList.remove("layer-enter");
    void el.offsetWidth;
    el.textContent = text;
    el.classList.add("layer-enter");
  });
  if (layerTags) {
    layerTags.classList.remove("layer-enter");
    void layerTags.offsetWidth;
    layerTags.innerHTML = "";
    layer.tags.forEach((tag) => {
      const item = document.createElement("li");
      item.textContent = tag;
      layerTags.appendChild(item);
    });
    layerTags.classList.add("layer-enter");
  }
}
layerTabs.forEach((tab, tabIndex) => {
  tab.addEventListener("click", () => {
    layerTabs.forEach((item) => {
      const active = item === tab;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
      item.setAttribute("tabindex", active ? "0" : "-1");
    });
    renderLayer(tab.dataset.layer);
  });
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let next;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = layerTabs.length - 1;
    else {
      const dir = event.key === "ArrowRight" ? 1 : -1;
      next = (tabIndex + dir + layerTabs.length) % layerTabs.length;
    }
    layerTabs[next].focus();
    layerTabs[next].click();
  });
});

/* ---------- Copy email + toast ---------- */
const email = "devanshuverma372@gmail.com";
const copyButtons = document.querySelectorAll("[data-copy-email]");
const toast = document.querySelector("[data-toast]");
let toastTimer;

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}
copyButtons.forEach((copyButton) => {
  copyButton.addEventListener("click", async () => {
    try {
      await copyText(email);
      showToast("Email copied to clipboard");
      copyButton.textContent = "Copied ✓";
      window.setTimeout(() => (copyButton.textContent = "Copy email"), 2200);
    } catch {
      showToast("Copy failed — please try again");
    }
  });
});

/* ---------- Explore / Recruiter view switch ---------- */
/* The view lives in the URL (?view=recruiter) so a recruiter-ready link can be
   shared directly. The inline <head> script applies it before first paint. */
const viewSwitch = document.querySelector("[data-view-switch]");
const skipLink = document.querySelector(".skip-link");
const viewTitles = {
  explore: document.title,
  recruiter: "Devanshu Verma — Recruiter view",
};
const viewMains = {
  explore: document.getElementById("main-content"),
  recruiter: document.getElementById("recruiter-view"),
};
let currentView = root.dataset.view === "recruiter" ? "recruiter" : "explore";
let viewTimer = null;

function syncSwitch(view) {
  if (!viewSwitch) return;
  viewSwitch.dataset.active = view;
  viewSwitch.querySelectorAll("[data-view-option]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.viewOption === view));
  });
}

function applyView(view) {
  if (view === "recruiter") root.dataset.view = "recruiter";
  else delete root.dataset.view;
  document.title = viewTitles[view];
  skipLink?.setAttribute("href", `#${viewMains[view]?.id}`);
  setMenu(false);
  window.scrollTo({ top: 0, behavior: "instant" });
  measureSections();
  updateScrollUI();
}

function setView(view, { push = true, focusContent = false } = {}) {
  if (view === currentView) return;
  currentView = view;
  syncSwitch(view); // the pill starts sliding immediately

  if (push) {
    const url = new URL(window.location.href);
    if (view === "recruiter") url.searchParams.set("view", "recruiter");
    else url.searchParams.delete("view");
    url.hash = "";
    history.pushState(null, "", url);
  }

  const finish = () => {
    applyView(view);
    root.classList.remove("view-leaving");
    if (!reducedMotion) {
      root.classList.add("view-entering");
      window.setTimeout(() => root.classList.remove("view-entering"), 600);
    }
    if (focusContent) {
      const target = viewMains[view];
      if (target && !target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target?.focus({ preventScroll: true });
    }
  };

  window.clearTimeout(viewTimer);
  if (reducedMotion) {
    finish();
    return;
  }
  root.classList.remove("view-entering");
  root.classList.add("view-leaving");
  viewTimer = window.setTimeout(finish, 190);
}

syncSwitch(currentView);
// Initial load: no scroll reset, so deep links like ?view=recruiter#r-skills still land.
document.title = viewTitles[currentView];
skipLink?.setAttribute("href", `#${viewMains[currentView]?.id}`);

document.querySelectorAll("[data-view-option]").forEach((button) => {
  button.addEventListener("click", () => {
    // Buttons outside the header vanish with the old view, so move focus to the new content.
    setView(button.dataset.viewOption, { focusContent: !button.closest("[data-view-switch]") });
  });
});

window.addEventListener("popstate", () => {
  const view = new URLSearchParams(window.location.search).get("view") === "recruiter" ? "recruiter" : "explore";
  setView(view, { push: false });
});

/* "#top" lives in the explore hero; in recruiter view just go to the top. */
document.addEventListener("click", (event) => {
  const link = event.target.closest('a[href="#top"]');
  if (!link || currentView !== "recruiter") return;
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
});
