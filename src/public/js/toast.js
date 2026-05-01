/* Global toast / notification system */
(function () {
  let container = null;
  function ensureContainer() {
    if (container) return container;
    container = document.createElement("div");
    container.className = "toast-container";
    (document.body || document.documentElement).appendChild(container);
    return container;
  }

  window.showToast = function (type, title, message, duration = 4000) {
    const target = ensureContainer();
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const iconMap = {
      xp: "fa-solid fa-bolt",
      level_up: "fa-solid fa-arrow-trend-up",
      achievement: "fa-solid fa-trophy",
      crate: "fa-solid fa-box-open",
    };
    const iconClass = iconMap[type] || "fa-solid fa-circle-info";
    toast.innerHTML = `
      <div class="toast-icon"><i class="${iconClass}"></i></div>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        ${message ? `<div class="toast-message">${message}</div>` : ""}
      </div>
    `;
    target.appendChild(toast);

    const timeout = setTimeout(() => dismissToast(toast), duration);
    toast.addEventListener("click", () => { clearTimeout(timeout); dismissToast(toast); });
  };

  function dismissToast(toast) {
    toast.classList.add("fade-out");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }

  window.handleGamificationEvents = function (events) {
    for (const event of events) {
      if (event.type === "xp_gained") {
        showToast("xp", event.message, null, 2500);
      } else if (event.type === "xp_bonus") {
        showToast("xp", event.message, null, 2500);
      } else if (event.type === "level_up") {
        showLevelUp(event.level);
      } else if (event.type === "achievement") {
        showToast("achievement", event.achievement.name, event.achievement.desc, 5000);
      } else if (event.type === "crate_earned") {
        showToast("crate", "Crate Earned!", event.message, 4000);
      }
    }
  };

  window.showLevelUp = function (level) {
    const overlay = document.createElement("div");
    overlay.className = "levelup-overlay";
    overlay.innerHTML = `
      <div class="levelup-card">
        <div style="font-size:1rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">Level Up!</div>
        <div class="levelup-number">${level}</div>
        <div class="levelup-label">You reached level ${level}!</div>
        <div class="levelup-sub">Keep scouting to earn more rewards</div>
        <button class="btn btn-primary btn-lg" style="margin-top:24px" onclick="this.closest('.levelup-overlay').remove()">Awesome!</button>
      </div>
    `;
    (document.body || document.documentElement).appendChild(overlay);
  };
})();
