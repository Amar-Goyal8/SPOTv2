class ScoutingSync {
  static socket;
  static matches;

  static SCOUTER_STATUS = {
    NEW: 0,
    WAITING: 1,
    SCOUTING: 2,
    COMPLETE: 3,
    DISCONNECTED_BY_ADMIN: 4,
  };

  static state = {
    connected: false,
    offlineMode: true,
    status: ScoutingSync.SCOUTER_STATUS.NEW,
    scouterId: "",
    robotNumber: "",
    matchNumber: 0,
  };

  static async initialize() {
    if (typeof io !== "function") {
      throw new Error("Socket.IO client failed to load");
    }

    ScoutingSync.socket = io();
    ScoutingSync.matches = (
      await fetch("/admin/api/matches")
        .then((r) => (r.ok ? r.json() : { allMatches: [] }))
        .catch(() => ({ allMatches: [] }))
    ).allMatches || [];

    function onConnect() {
      if (ScoutingSync.state.connected) return;
      ScoutingSync.state.offlineMode = false;
      ScoutingSync.state.connected = true;
      ScoutingSync.socket.emit("updateState", ScoutingSync.state);

      const userId = localStorage.getItem("spotUserId");
      if (userId) ScoutingSync.socket.emit("setUserId", userId);

      const dot = document.getElementById("conn-dot");
      const label = document.getElementById("conn-label");
      if (dot) { dot.classList.add("connected"); dot.classList.remove("disconnected"); }
      if (label) label.textContent = "Connected";
      ScoutingSync.sync();
    }

    ScoutingSync.socket.on("connect", onConnect);

    setTimeout(() => {
      if (ScoutingSync.socket.connected) onConnect();
      else new Popup("error", "Failed to connect!");
    }, 1000);

    ScoutingSync.socket.on("connect_error", (err) => new Popup("error", err.toString()));

    ScoutingSync.socket.on("disconnect", () => {
      ScoutingSync.state.connected = false;
      const dot = document.getElementById("conn-dot");
      const label = document.getElementById("conn-label");
      if (dot) { dot.classList.remove("connected"); dot.classList.add("disconnected"); }
      if (label) label.textContent = "Disconnected";
    });

    ScoutingSync.socket.on("updateState", (stateUpdate) => {
      ScoutingSync.updateState(stateUpdate, true);
    });

    ScoutingSync.socket.on("syncRequest", () => ScoutingSync.sync());

    ScoutingSync.socket.on("adminDisconnect", () => {
      switchPage("landing");
      ScoutingSync.state.status = ScoutingSync.SCOUTER_STATUS.DISCONNECTED_BY_ADMIN;
    });

    ScoutingSync.socket.on("gamificationEvents", (events) => {
      if (window.handleGamificationEvents) handleGamificationEvents(events);
    });

    let previousMatchInfo = { robotNumber: null, matchNumber: null };
    ScoutingSync.socket.on("enterMatch", () => {
      setTimeout(() => {
        if (
          (ScoutingSync.state.robotNumber == previousMatchInfo.robotNumber &&
           ScoutingSync.state.matchNumber == previousMatchInfo.matchNumber) ||
          ScoutingSync.state.status === ScoutingSync.SCOUTER_STATUS.NEW
        ) return;

        previousMatchInfo = { robotNumber: ScoutingSync.state.robotNumber, matchNumber: ScoutingSync.state.matchNumber };

        switchPage("match-scouting");
        const info = document.getElementById("scouting-info");
        if (info) info.style.display = "block";

        new Modal("small")
          .header("Match Assignment")
          .text(`You've been assigned <strong>Team ${ScoutingSync.state.robotNumber}</strong> in match <strong>${ScoutingSync.state.matchNumber}</strong>.`)
          .dismiss("Let's go!");
      }, 100);
    });
  }

  static updateState(stateUpdate, incoming = false) {
    return new Promise((res) => {
      Object.assign(ScoutingSync.state, stateUpdate);
      window.dispatchEvent(new CustomEvent("spot:scouting-state-updated"));

      const match = ScoutingSync.matches.find((m) => m.number == ScoutingSync.state.matchNumber);
      if (match) {
        const info = document.getElementById("scouting-info");
        if (info) {
          info.textContent = `Match ${ScoutingSync.state.matchNumber} | Team ${ScoutingSync.state.robotNumber}`;
          info.style.color = match.robots.red.includes(String(ScoutingSync.state.robotNumber)) ? "var(--accent-red)" : "var(--accent)";
        }
      }

      if (!incoming) {
        ScoutingSync.socket.emit("updateState", ScoutingSync.state, () => res(true));
      } else {
        res(true);
      }
    });
  }

  static async sync() {
    if (ScoutingSync.state.offlineMode) return false;

    return new Promise(async (res) => {
      const timeout = setTimeout(() => { new Popup("error", "Failed to sync!"); res(false); }, 5000);
      const tmps = await LocalData.getAllTeamMatchPerformances();
      const ids = tmps.map((t) => t.matchId);
      new Popup("notice", "Syncing...", 5000);
      ScoutingSync.socket.emit("syncData", ids, (requestedIds) => {
        ScoutingSync.socket.emit(
          "teamMatchPerformances",
          tmps.filter((t) => requestedIds.includes(t.matchId)),
          () => {
            new Popup("success", "Sync complete!", 2000);
            clearTimeout(timeout);
            LocalData.clearTeamMatchPerformances();
            res(true);
          }
        );
      });
    });
  }
}

try {
  ScoutingSync.initialize();
} catch (e) {
  console.log("Socket failed", e);
}
