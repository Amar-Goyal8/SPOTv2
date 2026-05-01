const { Router } = require("express");
const { User, UserItem, UserAchievement, Item } = require("../../lib/db");
const { ACHIEVEMENTS, levelProgress, xpForNextLevel, xpForCurrentLevel } = require("../../lib/gamification");
const router = Router();

router.get("/stats", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      matchesScoutedCount: user.matchesScoutedCount,
      level: user.level,
      xp: user.xp,
      cratesEarned: user.cratesEarned,
      cratesOpened: user.cratesOpened,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/full", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    const userItems = await UserItem.find({ userId: user._id }).lean();
    const itemIds = userItems.map((ui) => ui.itemId);
    const items = await Item.find({ itemId: { $in: itemIds } }).lean();

    const userAchievements = await UserAchievement.find({ userId: user._id }).lean();
    const earnedIds = new Set(userAchievements.map((a) => a.achievementId));

    const achievements = ACHIEVEMENTS.map((a) => ({
      ...a,
      earned: earnedIds.has(a.id),
      earnedAt: userAchievements.find((ua) => ua.achievementId === a.id)?.earnedAt,
    }));

    const levelPct = levelProgress(user.xp);
    const nextLevelXp = xpForNextLevel(user.level);
    const currLevelXp = xpForCurrentLevel(user.level);

    res.json({
      user: { ...user },
      items,
      achievements,
      levelProgress: levelPct,
      xpForNextLevel: nextLevelXp,
      xpForCurrentLevel: currLevelXp,
      unopenedCrates: user.cratesEarned - user.cratesOpened,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/equip", async (req, res) => {
  const { userId, slot, itemId } = req.body;
  if (!userId || !slot) return res.status(400).json({ error: "userId and slot required" });
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (itemId) {
      const owned = await UserItem.findOne({ userId: user._id, itemId });
      if (!owned) return res.status(403).json({ error: "Item not owned" });
    }

    user.equippedItems[slot] = itemId || null;
    await user.save();
    res.json({ success: true, equippedItems: user.equippedItems });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
