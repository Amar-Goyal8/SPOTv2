let config = fetch("/config/config.json").then((res) => res.json());
let matchScoutingConfig = fetch("/config/match-scouting.json").then((res) => res.json());
let qrConfig = fetch("/config/qr.json").then((res) => res.json()).catch(() => ({}));

// Expose config promises for scripts that may load before lexical globals are available.
window.spotConfigPromise = config;
window.spotMatchScoutingConfigPromise = matchScoutingConfig;
window.spotQrConfigPromise = qrConfig;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then((r) => console.log("SW registered:", r.scope))
      .catch((e) => console.log("SW failed:", e));
  });
}

let attemptedPWA = false;
window.addEventListener("beforeinstallprompt", (e) => {
  if (attemptedPWA) return;
  attemptedPWA = true;
  e.preventDefault();
  const prompt = e;
  new Modal("small")
    .text("SPOTv2 is better as an installed app!")
    .action("Install", () => { prompt.prompt(); })
    .dismiss("Maybe Later");
});

function switchPage(pageName) {
  document.body.querySelectorAll(".page").forEach((page) => {
    page.id === pageName ? page.classList.add("visible") : page.classList.remove("visible");
  });
}

function deepClone(obj) {
  const cloned = Array.isArray(obj) ? [] : {};
  if (Array.isArray(obj)) {
    for (const prop of obj) cloned.push(typeof prop !== "object" || !prop ? prop : deepClone(prop));
  } else {
    for (const prop in obj) cloned[prop] = typeof obj[prop] !== "object" || !obj[prop] ? obj[prop] : deepClone(obj[prop]);
  }
  return cloned;
}

class Modal {
  constructor(size) {
    this.overlay = document.createElement("div");
    this.overlay.className = "modal-overlay";
    this.box = document.createElement("div");
    this.box.className = "modal-box";
    this.overlay.appendChild(this.box);
    this.modalExit = () => document.body.contains(this.overlay) && document.body.removeChild(this.overlay);
    this.overlay.addEventListener("click", (e) => { if (e.target === this.overlay) this.modalExit(); });
    document.body.appendChild(this.overlay);
    return this;
  }
  header(text) {
    const el = document.createElement("div");
    el.className = "modal-header"; el.innerHTML = text;
    this.box.appendChild(el); return this;
  }
  text(text) {
    const el = document.createElement("div");
    el.className = "modal-text"; el.innerHTML = text;
    this.box.appendChild(el); return this;
  }
  dismiss(btnText = "Dismiss") {
    const actions = this._getActions();
    const btn = document.createElement("button");
    btn.className = "btn btn-secondary"; btn.innerText = btnText;
    btn.addEventListener("click", this.modalExit);
    actions.appendChild(btn); return this;
  }
  action(btnText, fn) {
    const actions = this._getActions();
    const btn = document.createElement("button");
    btn.className = "btn btn-primary"; btn.innerText = btnText;
    btn.addEventListener("click", fn);
    actions.appendChild(btn); return this;
  }
  _getActions() {
    let actions = this.box.querySelector(".modal-actions");
    if (!actions) { actions = document.createElement("div"); actions.className = "modal-actions"; this.box.appendChild(actions); }
    return actions;
  }
}

class Popup {
  constructor(type, text, duration = 5000) {
    const el = document.createElement("div");
    el.className = `popup ${type}`;
    el.innerText = text;
    document.body.appendChild(el);
    setTimeout(() => { if (document.body.contains(el)) document.body.removeChild(el); }, duration);
  }
  setText(text) { return this; }
  setType(type) { return this; }
}

function showFade(el) { el.classList.add("visible"); }
function hideFade(el) { el.classList.remove("visible"); }
