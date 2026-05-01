const express = require("express");
const router = express.Router();

router.use(express.static(__dirname + "/public"));
router.use("/api", require("./routes/api.js"));

router.get("/", (req, res) => {
  res.render(__dirname + "/views/index.ejs");
});

module.exports = router;
