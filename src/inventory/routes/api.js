const { Router } = require("express");
const { User, UserItem, Item } = require("../../lib/db");
const { openCrate, crateTypeForUser } = require("../../lib/gamification");
const router = Router();

router.get("/items", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    const userItems = await UserItem.find({ userId: user._id }).lean();
    const itemIds = userItems.map((ui) => ui.itemId);
    const items = await Item.find({ itemId: { $in: itemIds } }).lean();

    const unopenedCrates = user.cratesEarned - user.cratesOpened;
    const nextCrateType = crateTypeForUser(user);

    res.json({ items, unopenedCrates, nextCrateType, equippedItems: user.equippedItems });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/open-crate", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const result = await openCrate(userId);
    if (result.error) return res.status(400).json(result);
    res.json(result);
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
