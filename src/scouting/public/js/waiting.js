// Waiting page — update stats from stored user info
(function () {
  const userId = localStorage.getItem("spotUserId");
  if (userId) {
    fetch(`/profile/api/stats?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => {
        const matchEl = document.getElementById("wait-matches");
        const levelEl = document.getElementById("wait-level");
        if (matchEl) matchEl.textContent = data.matchesScoutedCount ?? 0;
        if (levelEl) levelEl.textContent = data.level ?? 1;
      })
      .catch(() => {});
  }
})();
