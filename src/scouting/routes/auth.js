const { OAuth2Client } = require("google-auth-library");
const oAuth2Client = new OAuth2Client(process.env.CLIENT_ID);
const config = require("../../../config/config.json");
const { getOrCreateUser } = require("../../lib/gamification.js");
const { Router } = require("express");

let router = Router();

router.get("/verify", async (req, res) => {
  const verification = await verifyUser(req.header("token"));
  if (verification.status) {
    const user = await getOrCreateUser(verification.user);
    res.json({ ...verification, dbUser: { _id: user._id, name: user.name, picture: user.picture, level: user.level, xp: user.xp, equippedItems: user.equippedItems } });
  } else {
    res.json({ ...verification });
  }
});

router.get("/isDemo", (req, res) => {
  res.json(config.DEMO);
});

async function verifyUser(token) {
  const ticket = await oAuth2Client
    .verifyIdToken({ idToken: token, audience: process.env.CLIENT_ID })
    .catch(() => ({ status: false }));
  if (!ticket || !ticket.getPayload) return { status: false };
  return { status: true, user: ticket.getPayload() };
}

module.exports = router;
