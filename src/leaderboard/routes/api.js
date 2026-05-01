const { Router } = require("express");
const { User, Item } = require("../../lib/db");
const router = Router();

router.get("/", async (req, res) => {
  try {
    const users = await User.find({}).sort({ xp: -1 }).limit(50).lean();
    const leaderboard = await Promise.all(users.map(async (user, i) => {
      const titleItem = user.equippedItems?.title
        ? await Item.findOne({ itemId: user.equippedItems.title }).lean()
        : null;
      const badgeItem = user.equippedItems?.badge
        ? await Item.findOne({ itemId: user.equippedItems.badge }).lean()
        : null;
      return {
        rank: i + 1,
        _id: user._id,
        name: user.name,
        picture: user.picture,
        level: user.level,
        xp: user.xp,
        matchesScoutedCount: user.matchesScoutedCount,
        title: titleItem?.value || "Scout",
        badge: badgeItem?.value || null,
        badgeName: badgeItem?.name || null,
      };
    }));
    res.json(leaderboard);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
