const express = require("express");
const chalk = require("chalk");
const fs = require("fs");

let app = express();
const server = app.listen(process.env.PORT || 8080, () => {
  console.log(chalk.cyan(`SPOTv2 listening on port ${process.env.PORT || 8080}`));
});

const axios = require("axios");
axios.defaults.baseURL = `http://localhost:${process.env.PORT || 8080}`;

app.set("view engine", "ejs");
let bodyParser = require("body-parser");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.get("/favicon.ico", (req, res) => res.sendFile(__dirname + "/public/icons/favicon.ico"));

const session = require("express-session");
app.use(session({
  secret: "spotv2-secret",
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

if (fs.existsSync("config/config.json")) {
  require("./scouting/scouting-sync.js")(server);

  app.use("/config", require("./configRouter.js"));
  app.use(express.static(__dirname + "/public"));
  app.use("/", require("./scouting/scouting.js"));
  app.use("/profile", require("./profile/profile.js"));
  app.use("/leaderboard", require("./leaderboard/leaderboard.js"));
  app.use("/inventory", require("./inventory/inventory.js"));
  app.use("/admin", require("./admin/admin.js"));
  app.use("/analysis", require("./analysis/analysis.js"));
  app.use("/schedule", require("./schedule/schedule").router);
} else {
  console.log(chalk.cyan.bold.underline("config.json not found! Create one from config.template.json"));
  app.get("/", (req, res) => {
    res.send("<h1>SPOTv2 Setup</h1><p>Copy <code>config/config.template.json</code> to <code>config/config.json</code> and fill in your settings.</p>");
  });
}
