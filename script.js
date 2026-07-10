document.documentElement.classList.add("js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Fake loading screen — dismisses after 1.5s */

const loader = document.querySelector("[data-loader]");
const loaderStatus = document.querySelector("[data-loader-status]");
const loaderMessages = ["Indexing repository…", "Embedding vectors…", "Warming the agent…"];

if (loader) {
  document.body.style.overflow = "hidden";
  let messageIndex = 0;
  const messageTimer = window.setInterval(() => {
    messageIndex = (messageIndex + 1) % loaderMessages.length;
    if (loaderStatus) loaderStatus.textContent = loaderMessages[messageIndex];
  }, 320);

  window.setTimeout(() => {
    window.clearInterval(messageTimer);
    loader.classList.add("loaded");
    document.body.style.overflow = "";
  }, 1500);
}

const mobileMenu = document.querySelector("[data-mobile-menu]");
const mobileMenuSummary = mobileMenu?.querySelector("summary");

if (mobileMenu) {
  mobileMenu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => mobileMenu.removeAttribute("open"));
  });

  document.addEventListener("click", (event) => {
    if (mobileMenu.open && !mobileMenu.contains(event.target)) {
      mobileMenu.removeAttribute("open");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !mobileMenu.open) return;
    mobileMenu.removeAttribute("open");
    mobileMenuSummary?.focus();
  });
}

const revealElements = document.querySelectorAll("[data-reveal]");
revealElements.forEach((element) => {
  const delay = element.dataset.delay;
  if (delay) element.style.setProperty("--reveal-delay", `${delay}ms`);
});

if (reducedMotion || !("IntersectionObserver" in window)) {
  revealElements.forEach((element) => element.classList.add("revealed"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("revealed");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8%", threshold: 0.08 },
  );
  revealElements.forEach((element) => revealObserver.observe(element));
}

if (window.location.hash) {
  try {
    const initialTarget = document.querySelector(window.location.hash);
    if (initialTarget) {
      initialTarget.querySelectorAll("[data-reveal]").forEach((element) => {
        element.classList.add("revealed");
      });
      const previousScrollBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "auto";
      window.requestAnimationFrame(() => {
        initialTarget.scrollIntoView({ block: "start" });
        document.documentElement.style.scrollBehavior = previousScrollBehavior;
      });
    }
  } catch {
    // Ignore malformed fragments.
  }
}

const header = document.querySelector("[data-header]");
const progress = document.querySelector(".scroll-progress span");
let scrollTicking = false;

function updateScrollUI() {
  const scrollTop = window.scrollY;
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const ratio = scrollable > 0 ? Math.min(scrollTop / scrollable, 1) : 0;
  header?.classList.toggle("scrolled", scrollTop > 28);
  if (progress) progress.style.transform = `scaleX(${ratio})`;
  scrollTicking = false;
}

window.addEventListener(
  "scroll",
  () => {
    if (scrollTicking) return;
    scrollTicking = true;
    window.requestAnimationFrame(updateScrollUI);
  },
  { passive: true },
);
updateScrollUI();

/* Hero card — cycle the Prompt-to-Diagram mode */

const diagramModes = [
  {
    name: "Architecture",
    nodes: ["services", "stores", "data flow"],
  },
  {
    name: "UML Sequence",
    nodes: ["user", "go api", "bedrock"],
  },
  {
    name: "ER Diagram",
    nodes: ["entities", "relations", "keys"],
  },
];

const cycleButton = document.querySelector("[data-cycle]");
const modeName = document.querySelector("[data-mode-name]");
const modeCount = document.querySelector("[data-mode-count]");
const modeViz = document.querySelector("[data-mode-viz]");
const pipeline = document.querySelector("[data-pipeline]");
let modeIndex = 0;

function renderMode() {
  const mode = diagramModes[modeIndex];
  if (modeName) modeName.textContent = mode.name;
  if (modeCount) modeCount.textContent = `mode ${modeIndex + 1} / ${diagramModes.length}`;
  if (modeViz) {
    modeViz.innerHTML = "";
    mode.nodes.forEach((node, index) => {
      const chip = document.createElement("span");
      chip.textContent = node;
      if (index === mode.nodes.length - 1) chip.classList.add("good-node");
      modeViz.appendChild(chip);
      if (index < mode.nodes.length - 1) {
        const arrow = document.createElement("i");
        arrow.textContent = "→";
        modeViz.appendChild(arrow);
      }
    });
  }
}

cycleButton?.addEventListener("click", () => {
  modeIndex = (modeIndex + 1) % diagramModes.length;
  pipeline?.classList.add("shuffling");
  window.setTimeout(() => pipeline?.classList.remove("shuffling"), 520);
  renderMode();
});

renderMode();

/* Featured project — layer tabs */

const layers = {
  engine: {
    index: "LAYER 01 / CODE INTELLIGENCE",
    title: "contextplus",
    copy:
      "A custom code intelligence engine using tree-sitter AST parsing across 36 programming languages, paired with Jina AI vector embeddings for semantic code search over any repository.",
    tags: ["tree-sitter", "AST parsing", "Jina AI embeddings", "semantic search"],
    note: "contextplus — the custom code intelligence engine.",
  },
  pipeline: {
    index: "LAYER 02 / AGENTIC RAG",
    title: "RAG on Bedrock",
    copy:
      "A RAG-powered agentic pipeline on Amazon Bedrock (Claude Sonnet 4) with a multi-round tool-use loop — up to 6 rounds — for conversational Q&A over any GitHub repository.",
    tags: ["Amazon Bedrock", "Claude Sonnet 4", "6-round tool use", "conversational Q&A"],
    note: "The reasoning loop that answers questions about your code.",
  },
  backend: {
    index: "LAYER 03 / INFRASTRUCTURE",
    title: "Go backend",
    copy:
      "A Go HTTP backend on AWS EC2 with Server-Sent Events for real-time progress streaming — Bedrock Converse API integration with exponential backoff retry and automatic Groq LLaMA fallback.",
    tags: ["Go", "AWS EC2", "Server-Sent Events", "exponential backoff", "Groq fallback"],
    note: "The part that keeps working when things go wrong.",
  },
  diagrams: {
    index: "LAYER 04 / PROMPT-TO-DIAGRAM",
    title: "Diagrams on demand",
    copy:
      "A Prompt-to-Diagram engine generating Architecture, UML Sequence, and ER diagrams from live code via LLM inference — with natural-language post-generation editing support.",
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
  if (layerTitle) layerTitle.textContent = layer.title;
  if (layerCopy) layerCopy.textContent = layer.copy;
  if (layerNote) layerNote.textContent = layer.note;
  if (layerTags) {
    layerTags.innerHTML = "";
    layer.tags.forEach((tag) => {
      const item = document.createElement("li");
      item.textContent = tag;
      layerTags.appendChild(item);
    });
  }
}

layerTabs.forEach((tab, tabIndex) => {
  tab.addEventListener("click", () => {
    layerTabs.forEach((item) => {
      const active = item === tab;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
    renderLayer(tab.dataset.layer);
  });

  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (tabIndex + direction + layerTabs.length) % layerTabs.length;
    layerTabs[nextIndex].focus();
    layerTabs[nextIndex].click();
  });
});

/* Copy email + toast */

const email = "devanshuverma372@gmail.com";
const copyButton = document.querySelector("[data-copy-email]");
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

copyButton?.addEventListener("click", async () => {
  try {
    await copyText(email);
    showToast("Email copied to clipboard");
    copyButton.textContent = "Copied";
    window.setTimeout(() => (copyButton.textContent = "Copy email"), 2200);
  } catch {
    showToast("Copy failed — please try again");
  }
});
