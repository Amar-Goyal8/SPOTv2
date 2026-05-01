const { Router } = require("express");
const { TeamMatchPerformance, Event } = require("../../lib/db.js");
//const { executePipeline } = require("../public/js/analysisPipeline.js");
const { setPath } = require("../../lib/util.js");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const config = require("../../../config/config.json");
const chalk = require("chalk");
let tbaResults;
let tbaOPRResults;
let tbaResultsFetchTime = 0;
let tbaOPRResultFetchTime = 0;

let router = Router();
const GEMINI_MODEL_DEFAULT = "gemini-1.5-flash";

function extractGeminiText(responseData) {
  const candidates = responseData?.candidates || [];
  if (!candidates.length) return "";
  const parts = candidates[0]?.content?.parts || [];
  return parts
    .map((p) => p?.text || "")
    .join("\n")
    .trim();
}

function buildTeamSummaries(tmps) {
  const byTeam = new Map();
  const defenseRegex = /(defen|defence|block|stopshoot|deny|disrupt|pressure|pin|interfere)/i;
  const offenseRegex = /(score|shoot|amp|speaker|goal|cycle|intake|pickup|place|pass)/i;
  const climbRegex = /(climb|hang|park|trap)/i;

  for (const tmp of tmps || []) {
    const team = String(tmp.robotNumber || "");
    if (!team) continue;
    const actionQueue = Array.isArray(tmp.actionQueue) ? tmp.actionQueue : [];
    if (!byTeam.has(team)) {
      byTeam.set(team, {
        team,
        matches: 0,
        totalActions: 0,
        defenseActions: 0,
        offenseActions: 0,
        climbActions: 0,
        defenseRatingSum: 0,
        defenseRatingCount: 0,
        actionCounts: {},
      });
    }
    const stats = byTeam.get(team);
    stats.matches += 1;
    stats.totalActions += actionQueue.length;

    for (const action of actionQueue) {
      const id = String(action?.id || "");
      const idLower = id.toLowerCase();

      stats.actionCounts[id] = (stats.actionCounts[id] || 0) + 1;
      if (defenseRegex.test(idLower)) {
        stats.defenseActions += 1;
        const ratingMatch = idLower.match(/(\d+)$/);
        if (ratingMatch) {
          const value = Number(ratingMatch[1]);
          if (!Number.isNaN(value) && value >= 1 && value <= 5) {
            stats.defenseRatingSum += value;
            stats.defenseRatingCount += 1;
          }
        }
      }
      if (offenseRegex.test(idLower)) stats.offenseActions += 1;
      if (climbRegex.test(idLower)) stats.climbActions += 1;
    }
  }

  return Array.from(byTeam.values())
    .map((stats) => {
      const avgActionsPerMatch = stats.matches ? stats.totalActions / stats.matches : 0;
      const defensePerMatch = stats.matches ? stats.defenseActions / stats.matches : 0;
      const offensePerMatch = stats.matches ? stats.offenseActions / stats.matches : 0;
      const climbPerMatch = stats.matches ? stats.climbActions / stats.matches : 0;
      const avgDefenseRating = stats.defenseRatingCount
        ? stats.defenseRatingSum / stats.defenseRatingCount
        : 0;

      const topActions = Object.entries(stats.actionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id, count]) => ({ id, count }));

      const defenseScore = Number((defensePerMatch * 2.0 + avgDefenseRating * 1.25).toFixed(3));

      return {
        team: stats.team,
        matches: stats.matches,
        avgActionsPerMatch: Number(avgActionsPerMatch.toFixed(2)),
        defensePerMatch: Number(defensePerMatch.toFixed(2)),
        offensePerMatch: Number(offensePerMatch.toFixed(2)),
        climbPerMatch: Number(climbPerMatch.toFixed(2)),
        avgDefenseRating: Number(avgDefenseRating.toFixed(2)),
        defenseScore,
        topActions,
      };
    })
    .sort((a, b) => b.defenseScore - a.defenseScore);
}

router.get("/blueApiOPRStrings", async (req, res) => {
  if (config.TBA_OPR_STRINGS) {
    res.send(config.TBA_OPR_STRINGS);
  } else {
    res.send({ None: "None" });
  }
});

router.get("/blueApiData/:eventID", async (req, res) => {
  const TBA_EVENT_KEY = req.params.eventID;
  const TBA_API_KEY = config.secrets.TBA_API_KEY;

  const event = await Event.findOne({ _id: TBA_EVENT_KEY });
  let eventKey = null;
  if (event) {
    eventKey = event.code.split("_")[0];
  }

  // Gets tba data every 5 minutes (300000 ms)
  if (new Date().getTime() > tbaResultsFetchTime + 300000) {
    tbaResults = (
      await axios.get(
        `https://www.thebluealliance.com/api/v3/event/${eventKey}/matches`,
        {
          headers: {
            "X-TBA-Auth-Key": TBA_API_KEY,
          },
        },
      )
    ).data;
    tbaResultsFetchTime = new Date().getTime();
  }

  res.send(tbaResults);
});

router.get("/blueApiData", async (req, res) => {
  const KEY = config.TBA_EVENT_KEY;
  const TBA_API_KEY = config.secrets.TBA_API_KEY;

  if (new Date().getTime() > tbaResultsFetchTime + 300000) {
    tbaResults = (
      await axios.get(
        `https://www.thebluealliance.com/api/v3/event/${KEY}/matches`,
        {
          headers: {
            "X-TBA-Auth-Key": TBA_API_KEY,
          },
        },
      )
    ).data;
    tbaResultsFetchTime = new Date().getTime();
  }

  res.send(tbaResults);
});

router.get("/blueApiOPR/:eventID", async (req, res) => {
  const TBA_EVENT_KEY = req.params.eventID;
  const TBA_API_KEY = config.secrets.TBA_API_KEY;

  const event = await Event.findOne({ _id: TBA_EVENT_KEY });
  let eventKey = null;
  if (event) {
    eventKey = event.code.split("_")[0];
  }

  // Gets tba data every 5 minutes (300000 ms)
  if (new Date().getTime() > tbaOPRResultFetchTime + 300000) {
    tbaOPRResults = (
      await axios.get(
        `https://www.thebluealliance.com/api/v3/event/${eventKey}/coprs`,
        {
          headers: {
            "X-TBA-Auth-Key": TBA_API_KEY,
          },
        },
      )
    ).data;
    tbaOPRResultFetchTime = new Date().getTime();
  }

  res.send(tbaOPRResults);
});

router.get("/blueApiOPR", async (req, res) => {
  const KEY = config.TBA_EVENT_KEY;
  const TBA_API_KEY = config.secrets.TBA_API_KEY;

  if (new Date().getTime() > tbaOPRResultFetchTime + 300000) {
    tbaOPRResults = (
      await axios.get(
        `https://www.thebluealliance.com/api/v3/event/${KEY}/coprs`,
        {
          headers: {
            "X-TBA-Auth-Key": TBA_API_KEY,
          },
        },
      )
    ).data;
    tbaOPRResultFetchTime = new Date().getTime();
  }

  res.send(tbaOPRResults);
});

router.get("/dataset", async (req, res) => {
  res.json(
    await TeamMatchPerformance.find({
      eventNumber: config.EVENT_NUMBER,
    }),
  );
});

router.get("/isDemo", (req, res) => {
  res.json(config.DEMO);
});

router.get("/dataset/:eventID", async (req, res) => {
  res.json(
    await TeamMatchPerformance.find({ eventNumber: req.params.eventID }),
  );
});

router.delete("/dataset/:id", async (req, res) => {
  const DEMO = config.DEMO;

  if (!DEMO) {
    await TeamMatchPerformance.findByIdAndDelete(req.params.id);
    res.send("Deleted");
  } else {
    return res.send("DEMO mode is enabled, cannot delete");
  }
});

if (!config.secrets.TBA_API_KEY) {
  console.error(
    chalk.whiteBright.bgRed.bold(
      "TBA_API_KEY not found in config.json file! SPOT will not properly function without this.",
    ),
  );
}

router.get("/teams", async (req, res) => {
  if (!config.secrets.TBA_API_KEY) {
    return res.json([]); //no key, no teams
  }
  let teams = [];

  teams = (await axios.get("/schedule/api/tempTeams")).data;

  if (teams.length === 0) {
    teams = (
      await axios
        .get(
          `https://www.thebluealliance.com/api/v3/event/${config.TBA_EVENT_KEY}/teams`,
          {
            headers: {
              "X-TBA-Auth-Key": config.secrets.TBA_API_KEY,
            },
          },
        )
        .catch((e) =>
          console.error(
            e,
            chalk.bold.red("\nError fetching teams from Blue Alliance API!"),
          ),
        )
    ).data;
  }
  res.json(teams);
});

router.get("/teams/:eventID", async (req, res) => {
  if (!config.secrets.TBA_API_KEY) {
    return res.json([]); //no key, no teams
  }
  const event = await Event.findOne({ _id: req.params.eventID });
  let eventKey = null;
  if (event) {
    eventKey = event.code.split("_")[0];
  }
  let teams = (
    await axios
      .get(`https://www.thebluealliance.com/api/v3/event/${eventKey}/teams`, {
        headers: {
          "X-TBA-Auth-Key": config.secrets.TBA_API_KEY,
        },
      })
      .catch((e) =>
        console.error(
          e,
          chalk.bold.red("\nError fetching teams from Blue Alliance API!"),
        ),
      )
  ).data;

  res.json(teams);
});

router.get("/manual", async (req, res) => {
  try {
    const manualDir = path.resolve(__dirname, "../manual");
    const teamsPath = path.join(manualDir, "teams.json");
    const tmpsPath = path.join(manualDir, "tmps.json");

    const teams = fs.existsSync(teamsPath)
      ? JSON.parse(fs.readFileSync(teamsPath, "utf8"))
      : {};
    const tmps = fs.existsSync(tmpsPath)
      ? JSON.parse(fs.readFileSync(tmpsPath, "utf8"))
      : [];

    res.json({ teams, tmps });
  } catch (e) {
    console.error(chalk.red("Failed to load manual analysis data"), e);
    res.json({ teams: {}, tmps: [] });
  }
});
router.get("/csv", async (req, res) => {
  async function executePipeline() {
    // Get tmps from database (or cache if offline)

    let tmps = await axios.get("/analysis/api/dataset").then((res) => res.data);

    // Get all tmps stored in the local storage (from qr code)
    const storage = await TeamMatchPerformance.find({
      eventNumber: config.EVENT_NUMBER,
    });
    if (storage) {
      // Parse the QR code TMPs (for some reason the array is stored as a string, and each TMP is ALSO
      // stored as a string, so the array has to be parsed and each individual TMP has to be parsed)
      //const qrcodeTmps = JSON.parse(storage).map((tmp) => JSON.parse(tmp));

      // Merge the TMPs into one
      tmps = [...tmps, ...storage];
    }

    // Find all the teams across the TMPs
    const teams = [];
    for (const tmp of tmps) {
      teams[tmp.robotNumber] = {};
    }

    let dataset = { tmps, teams };

    const manual = await axios
      .get("/analysis/api/manual")
      .then((res) => res.data);
    const pipelineConfig = await axios
      .get("/config/analysis-pipeline.json")
      .then((res) => res.data);

    // This will show up as a method that doesn't exist since it is gotten from the server
    let tempTransformer = await axios
      .get("/analysis/transformers2.js")
      .then((res) => res.data);
    tempTransformer = eval(tempTransformer);
    tempTransformer = tempTransformer["getTransformers"];
    const transformers = await tempTransformer();

    for (let tfConfig of pipelineConfig) {
      dataset = transformers[tfConfig.type][tfConfig.name].execute(
        dataset,
        tfConfig.outputPath,
        tfConfig.options,
      );
    }

    dataset.tmps = dataset.tmps.concat(
      manual.tmps.map((tmp) => ({
        ...tmp,
        manual: true,
      })),
    );
    for (const [path, teamData] of Object.entries(manual.teams)) {
      for (const [team, value] of Object.entries(teamData)) {
        if (team in dataset.teams) {
          setPath(dataset.teams[team], "manual." + path, value);
        } else {
          dataset.teams[team] = {};
          setPath(dataset.teams[team], "manual." + path, value);
        }
      }
    }

    return dataset;
  }

  let dataset2 = await executePipeline();

  //create rows
  let rows = [];
  let headerRow = true;
  let checkData = function (team) {
    if (
      Object.entries(team).filter(([key, value]) => key != "manual").length == 0
    ) {
      return false;
    }
    return true;
  };

  // Adding the data which is required for the CSV

  const averageKeys = new Set();
  const averageScoreKeys = new Set();
  const cycleKeys = new Set();
  for (let [teamNumber, team] of Object.entries(dataset2.teams).filter(
    ([num, team]) => checkData(team),
  )) {
    Object.keys(team.averages).forEach((key) => averageKeys.add(key));
    Object.keys(team.averageScores).forEach((key) => averageScoreKeys.add(key));
    Object.keys(team.cycles).forEach((key) => cycleKeys.add(key));
  }

  for (let [teamNumber, team] of Object.entries(dataset2.teams).filter(
    ([num, team]) => checkData(team),
  )) {
    if (headerRow) {
      headerRow = false;
      rows.push([
        "Team #",
        ...Array.from(averageKeys).map((key) => key + " Average"), // all averages
        ...Array.from(averageScoreKeys).map((key) => key + " Score Average"), // all average scores
        ...Array.from(cycleKeys).map((key) => key + " Cycle Average Time"), // all cycles (average time
        ...Array.from(cycleKeys).map(
          (key) => key + " Cycle Average Time Complete",
        ), // all cycles (average time complete)
      ]);
    }
    rows.push([
      teamNumber,
      ...Array.from(averageKeys).map((key) =>
        team.averages[key] !== undefined && !isNaN(team.averages[key])
          ? team.averages[key]
          : "0",
      ), // all averages
      ...Array.from(averageScoreKeys).map((key) =>
        team.averageScores[key] !== undefined && !isNaN(team.averageScores[key])
          ? team.averageScores[key]
          : "0",
      ), // all average scores
      ...Array.from(cycleKeys).map((key) =>
        team.cycles[key].averageTime !== undefined &&
        !isNaN(team.cycles[key].averageTime)
          ? team.cycles[key].averageTime
          : "0",
      ), // all cycles (average time)
      ...Array.from(cycleKeys).map((key) =>
        team.cycles[key].averageTimeComplete !== undefined &&
        !isNaN(team.cycles[key].averageTimeComplete)
          ? team.cycles[key].averageTimeComplete
          : "0",
      ), // all cycles (average time complete)
    ]);
  }

  //make into csv
  let csv = rows
    .map((row) => row.reduce((acc, value) => acc + `,${value}`))
    .reduce((acc, row) => acc + `${row}\n`, "");
  res.set({ "Content-Disposition": `attachment; filename="teams.csv"` });
  res.send(csv);
});

router.get("/events", async (req, res) => {
  res.json(await Event.find({}));
});

router.post("/ai-search", async (req, res) => {
  try {
    const question = String(req.body?.question || "").trim();
    const eventID = String(req.body?.eventID || "").trim();
    if (!question) {
      return res.status(400).json({ error: "question is required" });
    }

    const geminiKey = config.secrets?.GEMINI_API_KEY;
    if (!geminiKey) {
      return res.status(400).json({
        error: "GEMINI_API_KEY missing in config.json",
      });
    }

    // Fetch raw TMP data - NO regex processing, Gemini analyzes everything
    const tmps = await TeamMatchPerformance.find(
      eventID ? { eventNumber: eventID } : { eventNumber: config.EVENT_NUMBER },
    ).lean();

    // Build simple team list with raw actionQueue data
    const teamData = tmps.map((tmp) => ({
      team: tmp.robotNumber,
      match: tmp.matchNumber,
      actions: tmp.actionQueue || [],
    }));

    const prompt = [
      "You are an FRC scouting analyst. Analyze the raw match data and answer the user's question.",
      "Data format: Each team has match number and array of actions with timestamps.",
      "Action types: shooting, passing, storing, defense, climbing (hang, trap, park), and ratings (1-5).",
      "",
      `User question: ${question}`,
      `Event: ${eventID || config.EVENT_NUMBER}`,
      "",
      "Raw match data:",
      JSON.stringify(teamData, null, 2),
      "",
      "Response format:",
      "1) Direct answer (2-4 lines)",
      "2) Top team recommendations with specific evidence from the data",
      "3) Confidence level and any data limitations",
    ].join("\n");

    const model = config.secrets?.GEMINI_MODEL || GEMINI_MODEL_DEFAULT;
    const geminiResponse = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          topP: 0.9,
          maxOutputTokens: 1200,
        },
      },
      {
        headers: { "Content-Type": "application/json" },
      },
    );

    const answer = extractGeminiText(geminiResponse.data);
    return res.json({
      answer: answer || "No response from Gemini.",
      teamCount: teamData.length,
      eventID: eventID || config.EVENT_NUMBER,
    });
  } catch (e) {
    console.error(chalk.red("Gemini analysis failed"), e?.response?.data || e);
    return res.status(500).json({ error: "Gemini analysis failed: " + e.message });
  }
});

module.exports = router;
