document.querySelector("#form .save").addEventListener("click", async () => {
  const firstName = document.querySelector("#form .first-name").value.trim();
  const lastName = document.querySelector("#form .last-name").value.trim();
  const matchNumber = document.querySelector("#form .match-number").value;
  const robotNumber = document.querySelector("#form .robot-number").value;

  if (!firstName) { new Popup("error", "Enter your first name", 3000); return; }

  localStorage.setItem("firstName", firstName);
  localStorage.setItem("lastName", lastName);

  if (ScoutingSync.state.offlineMode) {
    ScoutingSync.updateState({
      matchNumber,
      robotNumber,
      scouterId: `${firstName}${lastName}`,
      status: ScoutingSync.SCOUTER_STATUS.WAITING,
    });
    switchPage("match-scouting");
    document.querySelector("#scouting-info").style.display = "block";
  } else {
    await ScoutingSync.updateState({
      scouterId: `${firstName}${lastName}`,
      status: ScoutingSync.SCOUTER_STATUS.WAITING,
    });
    switchPage("waiting");
  }
});

function updateForm() {
  try {
    document.querySelector("#form .first-name").value = localStorage.getItem("firstName") || "";
    document.querySelector("#form .last-name").value = localStorage.getItem("lastName") || "";

    const showManual = ScoutingSync.state.offlineMode || !ScoutingSync.state.connected;
    const matchNumParent = document.querySelector("#form .match-number")?.closest("div");
    const robotNumParent = document.querySelector("#form .robot-number")?.closest("div");
    if (matchNumParent) matchNumParent.style.display = showManual ? "block" : "none";
    if (robotNumParent) robotNumParent.style.display = showManual ? "block" : "none";
  } catch (e) {}
}
