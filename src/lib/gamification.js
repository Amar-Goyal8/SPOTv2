const { User, Item, UserItem, UserAchievement, CrateHistory } = require("./db");

const LEVEL_THRESHOLDS = [0, 200, 500, 1000, 1800, 3000, 5000, 8000, 12000, 18000];

const ACHIEVEMENTS = [
  { id: "first_match",    name: "First Blood",    desc: "Scout your first match",         xp: 50,  condition: (u) => u.matchesScoutedCount >= 1 },
  { id: "hat_trick",      name: "Hat Trick",       desc: "3 consecutive matches",          xp: 75,  condition: (u) => u.consecutiveMatches >= 3 },
  { id: "five_streak",    name: "On Fire",         desc: "5 consecutive matches",          xp: 125, condition: (u) => u.consecutiveMatches >= 5 },
  { id: "iron_scout",     name: "Iron Scout",      desc: "Scout 10 total matches",         xp: 100, condition: (u) => u.matchesScoutedCount >= 10 },
  { id: "veteran",        name: "Veteran",         desc: "Scout 25 total matches",         xp: 200, condition: (u) => u.matchesScoutedCount >= 25 },
  { id: "legend",         name: "Legend",          desc: "Scout 50 total matches",         xp: 400, condition: (u) => u.matchesScoutedCount >= 50 },
  { id: "speed_demon",    name: "Speed Demon",     desc: "Finish a match in under 2:30",   xp: 75,  condition: null }, // checked separately
  { id: "level_5",        name: "Rising Star",     desc: "Reach level 5",                  xp: 100, condition: (u) => u.level >= 5 },
  { id: "level_10",       name: "Elite Scout",     desc: "Reach level 10",                 xp: 200, condition: (u) => u.level >= 10 },
  { id: "crate_opener",   name: "Unboxing",        desc: "Open 5 crates",                  xp: 50,  condition: (u) => u.cratesOpened >= 5 },
  { id: "crate_addict",   name: "Crate Addict",    desc: "Open 20 crates",                 xp: 150, condition: (u) => u.cratesOpened >= 20 },
  { id: "legendary_drop", name: "Lucky",           desc: "Get a legendary item",           xp: 150, condition: null }, // checked separately
];

function calcLevel(xp) {
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }
  return level;
}

function xpForNextLevel(level) {
  return LEVEL_THRESHOLDS[level] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
}

function xpForCurrentLevel(level) {
  return LEVEL_THRESHOLDS[level - 1] || 0;
}

function levelProgress(xp) {
  const level = calcLevel(xp);
  const curr = xpForCurrentLevel(level);
  const next = xpForNextLevel(level);
  if (next === curr) return 100;
  return Math.floor(((xp - curr) / (next - curr)) * 100);
}

function crateTypeForUser(user) {
  if (user.consecutiveMatches >= 5) return "legendary";
  if (user.matchesScoutedCount >= 25) return "epic";
  if (user.matchesScoutedCount >= 10) return "rare";
  return "common";
}

async function getItemsByRarity(rarity) {
  const rarityPool = { common: ["common"], rare: ["common", "rare"], epic: ["common", "rare", "epic"], legendary: ["common", "rare", "epic", "legendary"] };
  return await Item.find({ rarity: { $in: rarityPool[rarity] || ["common"] } });
}

async function awardMatchXP(userId, matchDurationMs) {
  const user = await User.findById(userId);
  if (!user) return null;

  const prevLevel = user.level;
  let xpGain = 100;
  const events = [];

  // Streak bonus
  if (user.consecutiveMatches >= 5) {
    xpGain += 50;
    events.push({ type: "xp_bonus", message: "+50 XP On Fire streak bonus!" });
  } else if (user.consecutiveMatches >= 3) {
    xpGain += 25;
    events.push({ type: "xp_bonus", message: "+25 XP hat trick bonus!" });
  }

  // Speed bonus
  if (matchDurationMs && matchDurationMs <= 150000) {
    xpGain += 25;
    events.push({ type: "xp_bonus", message: "+25 XP speed bonus!" });
  }

  user.xp += xpGain;
  user.matchesScoutedCount += 1;
  user.consecutiveMatches += 1;
  user.lastMatchTimestamp = Date.now();
  user.level = calcLevel(user.xp);

  // Level up
  if (user.level > prevLevel) {
    events.push({ type: "level_up", message: `Level up! You are now level ${user.level}!`, level: user.level });
  }

  // Crate check (every 3 matches)
  if (user.matchesScoutedCount % 3 === 0) {
    const crateType = crateTypeForUser(user);
    user.cratesEarned += 1;
    events.push({ type: "crate_earned", message: `You earned a ${crateType} crate!`, crateType });
  }

  await user.save();

  // Achievement checks
  const achievementEvents = await checkAchievements(user, matchDurationMs);
  events.push(...achievementEvents);

  events.push({ type: "xp_gained", message: `+${xpGain} XP`, xp: xpGain });
  return { user, events };
}

async function checkAchievements(user, matchDurationMs) {
  const earned = await UserAchievement.find({ userId: user._id }).lean();
  const earnedIds = earned.map((a) => a.achievementId);
  const events = [];

  for (const achievement of ACHIEVEMENTS) {
    if (earnedIds.includes(achievement.id)) continue;

    let unlocked = false;
    if (achievement.id === "speed_demon") {
      unlocked = matchDurationMs && matchDurationMs <= 150000;
    } else if (achievement.id === "legendary_drop") {
      // checked in openCrate
    } else if (achievement.condition) {
      unlocked = achievement.condition(user);
    }

    if (unlocked) {
      await UserAchievement.create({ userId: user._id, achievementId: achievement.id });
      user.xp += achievement.xp;
      user.level = calcLevel(user.xp);
      await user.save();
      events.push({ type: "achievement", message: `Achievement unlocked: ${achievement.name}!`, achievement });
    }
  }

  return events;
}

async function openCrate(userId) {
  const user = await User.findById(userId);
  if (!user || user.cratesEarned <= user.cratesOpened) {
    return { error: "No crates available" };
  }

  const crateType = crateTypeForUser(user);
  const items = await getItemsByRarity(crateType);

  if (!items.length) return { error: "No items available" };

  const item = items[Math.floor(Math.random() * items.length)];

  const existing = await UserItem.findOne({ userId: user._id, itemId: item.itemId });
  if (!existing) {
    await UserItem.create({ userId: user._id, itemId: item.itemId });
  }

  await CrateHistory.create({ userId: user._id, crateType, itemsAwarded: [item.itemId] });
  user.cratesOpened += 1;
  await user.save();

  const events = [];
  if (item.rarity === "legendary") {
    const earnedIds = (await UserAchievement.find({ userId: user._id }).lean()).map((a) => a.achievementId);
    if (!earnedIds.includes("legendary_drop")) {
      await UserAchievement.create({ userId: user._id, achievementId: "legendary_drop" });
      const ach = ACHIEVEMENTS.find((a) => a.id === "legendary_drop");
      user.xp += ach.xp;
      user.level = calcLevel(user.xp);
      await user.save();
      events.push({ type: "achievement", message: "Achievement unlocked: Lucky!", achievement: ach });
    }
  }

  // Check crate achievement
  const crateAch = await checkAchievements(user, null);
  events.push(...crateAch);

  return { item, crateType, events, user };
}

async function getOrCreateUser(googlePayload) {
  let user = await User.findOne({ googleId: googlePayload.sub });
  if (!user) {
    user = await User.create({
      googleId: googlePayload.sub,
      name: googlePayload.name,
      email: googlePayload.email,
      picture: googlePayload.picture,
    });
    await seedStarterItems(user);
  }
  return user;
}

async function seedStarterItems(user) {
  const starterItem = await Item.findOne({ itemId: "badge_rookie" });
  if (starterItem) {
    await UserItem.create({ userId: user._id, itemId: "badge_rookie" });
    user.equippedItems.badge = "badge_rookie";
    await user.save();
  }
}

module.exports = {
  ACHIEVEMENTS,
  LEVEL_THRESHOLDS,
  calcLevel,
  levelProgress,
  xpForNextLevel,
  xpForCurrentLevel,
  awardMatchXP,
  checkAchievements,
  openCrate,
  getOrCreateUser,
  crateTypeForUser,
};
