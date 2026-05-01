let io;
const { TeamMatchPerformance, User } = require("../lib/db.js");
const { awardMatchXP, getOrCreateUser } = require("../lib/gamification.js");
const { seedItems } = require("../lib/itemSeed.js");
const axios = require("axios");
const config = require("../../config/config.json");
const chalk = require("chalk");
const DEMO = config.DEMO;

module.exports = (server) => {
  if (!ScoutingSync.initialized) {
    if (!server) {
      console.warn(chalk.yellow("Pass http server to initialize ScoutingSync."));
    } else {
      ScoutingSync.initialize(server);
    }
  }
  return ScoutingSync;
};

class ScoutingSync {
  static initialized = false;
  static scouters = [];
  static match;
  static SCOUTER_STATUS = {
    NEW: 0,
    WAITING: 1,
    SCOUTING: 2,
    COMPLETE: 3,
    DISCONNECTED_BY_ADMIN: 4,
  };

  static async initialize(server) {
    if (ScoutingSync.initialized) throw new Error("ScoutingSync already initialized!");

    // Attach Socket.IO and register connection handler immediately so
    // /socket.io/socket.io.js is served and connections are accepted before async ops complete
    io = require("socket.io")(server);

    io.on("connection", (socket) => {
      let newScouter = new Scouter(socket);
      newScouter.socket.on("disconnect", () => {
        setTimeout(() => {
          if (!newScouter.connected) {
            ScoutingSync.scouters = ScoutingSync.scouters.filter(
              (x) => !(!x.connected && x.timestamp == newScouter.timestamp)
            );
          }
        }, 60000);
      });
      ScoutingSync.scouters.push(newScouter);
    });

    if (!config.secrets.TBA_API_KEY) {
      console.error(chalk.whiteBright.bgRed.bold("TBA_API_KEY not found in config.json!"));
    }

    ScoutingSync.match = (await ScoutingSync.getMatches())[0] || {
      number: 0,
      match_string: "",
      robots: { red: [], blue: [] },
    };

    await seedItems();

    console.log(chalk.green("ScoutingSync initialized"));
    ScoutingSync.initialized = true;
  }

  static async getMatches(eventKey) {
    if (!eventKey) eventKey = config.TBA_EVENT_KEY;
    if (!config.secrets.TBA_API_KEY) return [];

    let formattedMatches = [];
    let tbaMatches = await axios
      .get(`https://www.thebluealliance.com/api/v3/event/${eventKey}/matches`, {
        headers: { "X-TBA-Auth-Key": config.secrets.TBA_API_KEY },
      })
      .catch((e) => console.log(e, chalk.bold.red("\nError fetching from Blue Alliance!")));

    if (tbaMatches === undefined) {
      if (config.secrets.FMS_API_KEY) {
        let uri = `https://frc-api.firstinspires.org/v3.0/${eventKey.substring(0, 4)}/schedule/${eventKey.substring(4)}?tournamentLevel=practice`;
        let frcMatches = await axios
          .get(uri, { auth: { username: config.secrets.FMS_API_USERNAME, password: config.secrets.FMS_API_KEY } })
          .catch((e) => console.log(e, chalk.bold.red("\nError fetching from FMS!")));
        if (frcMatches === undefined) return formattedMatches;
        formattedMatches = this.formatFMSMatches(frcMatches.data);
      } else return formattedMatches;
    } else {
      formattedMatches = this.formatTBAMatches(tbaMatches.data);
    }
    return formattedMatches;
  }

  static formatFMSMatches(matches) {
    return matches.Schedule.map((match) => {
      const redTeams = match.teams.filter((t) => /Red/.test(t.station)).map((t) => t.teamNumber);
      const blueTeams = match.teams.filter((t) => /Blue/.test(t.station)).map((t) => t.teamNumber);
      return { number: match.matchNumber, match_string: `${config.TBA_EVENT_KEY}_pm${match.matchNumber}`, robots: { red: redTeams, blue: blueTeams } };
    });
  }

  static formatTBAMatches(matches) {
    const matchLevels = ["qm", "ef", "qf", "sf", "f"];
    let levelCounts = {};
    for (let level of matchLevels) levelCounts[level] = matches.filter((x) => x.comp_level == level).length;
    let levelOffsets = {};
    for (let [index, level] of matchLevels.entries()) {
      levelOffsets[level] = matchLevels.slice(0, index).reduce((acc, l) => acc + levelCounts[l], 0);
    }
    return matches
      .map((match) => ({
        number: match.match_number + levelOffsets[match.comp_level],
        match_string: match.key,
        robots: {
          red: match.alliances.red.team_keys.map((x) => x.replace("frc", "")),
          blue: match.alliances.blue.team_keys.map((x) => x.replace("frc", "")),
        },
      }))
      .sort((a, b) => a.number - b.number);
  }

  static assignScouters() {
    if (!ScoutingSync.match || !ScoutingSync.match.robots) return;
    let nextRobots = new Set(ScoutingSync.match.robots.red.concat(ScoutingSync.match.robots.blue));

    for (let scouter of ScoutingSync.scouters) {
      if (scouter.state.connected && scouter.state.status === ScoutingSync.SCOUTER_STATUS.SCOUTING) {
        nextRobots.delete(scouter.state.robotNumber);
      }
    }

    for (let scouter of ScoutingSync.scouters) {
      if (scouter.state.connected && scouter.state.status === ScoutingSync.SCOUTER_STATUS.WAITING) {
        if (nextRobots.size <= 0) nextRobots = new Set(ScoutingSync.match.robots.red.concat(ScoutingSync.match.robots.blue));
        let robotNumber = [...nextRobots][0];
        nextRobots.delete(robotNumber);
        scouter.updateState({ matchNumber: ScoutingSync.match.number, robotNumber });
      }
    }

    let currentMatchWaiting = ScoutingSync.scouters.filter(
      (x) => x.state.matchNumber == ScoutingSync.match.number && x.state.status == ScoutingSync.SCOUTER_STATUS.WAITING && x.state.connected
    );

    if (!DEMO) {
      const activelyScouting = ScoutingSync.scouters.filter(
        (x) => x.state.matchNumber == ScoutingSync.match.number && x.state.status == ScoutingSync.SCOUTER_STATUS.SCOUTING
      ).length > 0;
      if (activelyScouting || currentMatchWaiting.length >= 6) {
        for (let scouter of currentMatchWaiting) scouter.socket.emit("enterMatch");
      }
    } else {
      for (let scouter of currentMatchWaiting) scouter.socket.emit("enterMatch");
    }
  }

  static getScouters() {
    return ScoutingSync.scouters.map((x) => {
      const out = { ...x };
      delete out.socket;
      return out;
    });
  }

  static setMatch(match) {
    ScoutingSync.match = match;
  }
}

class Scouter {
  state = {
    status: ScoutingSync.SCOUTER_STATUS.NEW,
    connected: true,
    offlineMode: false,
  };
  socket;
  timestamp;
  userId = null;

  constructor(socket) {
    this.socket = socket;
    this.timestamp = Date.now();

    this.socket.on("disconnect", () => {
      this.updateState({ connected: false });
      ScoutingSync.assignScouters();
    });

    this.socket.on("updateState", (stateUpdate, ack) => {
      this.state = Object.assign(this.state, stateUpdate);
      ScoutingSync.assignScouters();
      if (ack) ack();
    });

    this.socket.on("setUserId", (userId) => {
      this.userId = userId;
    });

    this.socket.on("teamMatchPerformances", async (teamMatchPerformances, ack) => {
      for (const tmp of teamMatchPerformances) {
        if (this.userId) tmp.userId = this.userId;
      }
      await TeamMatchPerformance.create(teamMatchPerformances);

      // Award XP for each match submitted
      if (this.userId) {
        for (const tmp of teamMatchPerformances) {
          const result = await awardMatchXP(this.userId, tmp.matchDurationMs);
          if (result && result.events && result.events.length) {
            this.socket.emit("gamificationEvents", result.events);
          }
        }
      }

      if (ack) ack(true);
    });

    this.socket.on("syncData", async (clientIds, requestTmps) => {
      if (!DEMO) {
        const serverIds = (await TeamMatchPerformance.find()).map((t) => t.matchId);
        let filtered = clientIds.filter((id) => !serverIds.includes(id));
        filtered = filtered.filter((id) => {
          const parts = id.split("-");
          const newId = `${parts[0]}-${parts[1]}-qrcode-${parts[3]}`;
          return !serverIds.includes(newId);
        });
        requestTmps(filtered);
      } else {
        requestTmps([]);
      }
    });
  }

  updateState(stateUpdate) {
    this.state = Object.assign(this.state, stateUpdate);
    this.socket.emit("updateState", stateUpdate);
  }

  sync() {
    this.socket.emit("syncRequest");
  }
}
