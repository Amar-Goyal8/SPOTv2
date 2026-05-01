const { Router } = require("express");
const ScoutingSync = require("../../scouting/scouting-sync")();
let router = Router();
const config = require("../../../config/config.json");
const { TeamMatchPerformance, Event } = require("../../lib/db");
let axios = require("axios");
const DEMO = config.DEMO;

router.use((req, res, next) => {
  const startupSafeRoutes = new Set(["/matches", "/isDemo", "/auth"]);
  if (!ScoutingSync.initialized && !startupSafeRoutes.has(req.path)) {
    res.status(503).send("ScoutingSync not ready yet!");
  } else {
    next();
  }
});

function isAuthorized(req) {
  return DEMO || req.headers.authorization === config.secrets.ACCESS_CODE;
}

router.get("/auth", (req, res) => {
  if (DEMO) return res.json({ status: 2 });
  if (!config.secrets.ACCESS_CODE) return res.json({ status: 2 });
  res.json({ status: config.secrets.ACCESS_CODE === req.headers.authorization ? 1 : 0 });
});

router.get("/isDemo", (req, res) => res.json(DEMO));

router.get("/scouters", (req, res) => {
  if (!isAuthorized(req)) return res.json({ error: "Not Authorized" });
  res.json(ScoutingSync.getScouters());
});

router.get("/data", async (req, res) => {
  res.json(await TeamMatchPerformance.find());
});

router.get("/enterMatch", async (req, res) => {
  if (!isAuthorized(req)) return res.json({ error: "Not Authorized" });
  for (let scouter of ScoutingSync.scouters) {
    if (scouter.state.status == ScoutingSync.SCOUTER_STATUS.WAITING) {
      scouter.updateState({ status: ScoutingSync.SCOUTER_STATUS.SCOUTING });
      scouter.socket.emit("enterMatch");
    }
  }
  res.json(true);
});

router.get("/disconnectScouter/:scouterId", (req, res) => {
  if (!isAuthorized(req)) return res.json({ error: "Not Authorized" });
  for (let scout of ScoutingSync.scouters) {
    if (scout.state.scouterId === req.params.scouterId) {
      scout.socket.emit("adminDisconnect");
      scout.socket.disconnect();
    }
  }
  res.json(true);
});

router.post("/setMatch", (req, res) => {
  if (!isAuthorized(req)) return res.json({ error: "Not Authorized" });
  ScoutingSync.setMatch(req.body);
  ScoutingSync.assignScouters();
  res.json(true);
});

router.post("/flagMatch", async (req, res) => {
  try {
    const { id, flagged } = req.body;
    if (!id || typeof flagged !== "boolean") return res.status(400).json({ success: false, error: "Invalid payload" });
    const match = await TeamMatchPerformance.findByIdAndUpdate(id, { flagged }, { new: true });
    if (!match) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, flagged: match.flagged });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed" });
  }
});

router.get("/matches", async (req, res) => {
  try {
    let manualSchedule = (await axios.get("/schedule/api/matches").catch(() => ({ data: [] }))).data;
    if (manualSchedule && manualSchedule.length) {
      res.json({ allMatches: manualSchedule, currentMatch: ScoutingSync.match });
    } else {
      res.json({ allMatches: await ScoutingSync.getMatches(), currentMatch: ScoutingSync.match });
    }
  } catch (e) {
    res.json({ allMatches: [], currentMatch: ScoutingSync.match });
  }
});

router.get("/matches/:eventID", async (req, res) => {
  const event = await Event.findOne({ _id: req.params.eventID });
  let eventKey = event ? event.code.split("_")[0] : null;
  res.json({ allMatches: await ScoutingSync.getMatches(eventKey), currentMatch: ScoutingSync.match });
});

module.exports = router;
