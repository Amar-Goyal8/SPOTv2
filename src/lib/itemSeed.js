const { Item } = require("./db");

const ITEMS = [
  // Badges
  { itemId: "badge_rookie",       name: "Rookie",           type: "badge",  rarity: "common",    description: "Welcome to the team!",             cssClass: "badge-rookie",      value: "🤖" },
  { itemId: "badge_scout",        name: "Scout",            type: "badge",  rarity: "common",    description: "A dedicated scouter",              cssClass: "badge-scout",       value: "🔍" },
  { itemId: "badge_analyst",      name: "Analyst",          type: "badge",  rarity: "rare",      description: "You know your data",               cssClass: "badge-analyst",     value: "📊" },
  { itemId: "badge_speed",        name: "Speed Demon",      type: "badge",  rarity: "rare",      description: "Fastest fingers in the pits",      cssClass: "badge-speed",       value: "⚡" },
  { itemId: "badge_veteran",      name: "Veteran",          type: "badge",  rarity: "epic",      description: "Seen many battles",                cssClass: "badge-veteran",     value: "🏆" },
  { itemId: "badge_legend",       name: "Legend",           type: "badge",  rarity: "legendary", description: "A scouting legend",                cssClass: "badge-legend",      value: "👑" },
  { itemId: "badge_fire",         name: "On Fire",          type: "badge",  rarity: "epic",      description: "Hot streak",                       cssClass: "badge-fire",        value: "🔥" },
  { itemId: "badge_robot",        name: "Roboticist",       type: "badge",  rarity: "common",    description: "You love robots",                  cssClass: "badge-robot",       value: "⚙️" },
  // Titles
  { itemId: "title_rookie",       name: "the Rookie",       type: "title",  rarity: "common",    description: "Just starting out",                cssClass: "title-rookie",      value: "the Rookie" },
  { itemId: "title_scout",        name: "Scout",            type: "title",  rarity: "common",    description: "Official scouter",                 cssClass: "title-scout",       value: "Scout" },
  { itemId: "title_analyst",      name: "Data Analyst",     type: "title",  rarity: "rare",      description: "Masters of data",                  cssClass: "title-analyst",     value: "Data Analyst" },
  { itemId: "title_iron",         name: "Iron Scout",       type: "title",  rarity: "rare",      description: "Never misses a match",             cssClass: "title-iron",        value: "Iron Scout" },
  { itemId: "title_elite",        name: "Elite",            type: "title",  rarity: "epic",      description: "Top of the leaderboard",           cssClass: "title-elite",       value: "Elite" },
  { itemId: "title_legend",       name: "Legend",           type: "title",  rarity: "legendary", description: "The greatest scout",               cssClass: "title-legend",      value: "Legend" },
  // Themes (CSS accent color changes)
  { itemId: "theme_default",      name: "Purple Haze",      type: "theme",  rarity: "common",    description: "Default purple theme",             cssClass: "theme-default",     value: "#6c63ff" },
  { itemId: "theme_blue",         name: "Blueprint",        type: "theme",  rarity: "common",    description: "Classic blue alliance",            cssClass: "theme-blue",        value: "#3b82f6" },
  { itemId: "theme_red",          name: "Red Alliance",     type: "theme",  rarity: "common",    description: "Classic red alliance",             cssClass: "theme-red",         value: "#ef4444" },
  { itemId: "theme_green",        name: "Circuit Board",    type: "theme",  rarity: "rare",      description: "Hacker green",                     cssClass: "theme-green",       value: "#22d3a0" },
  { itemId: "theme_gold",         name: "Gold Standard",    type: "theme",  rarity: "epic",      description: "Championship gold",                cssClass: "theme-gold",        value: "#f59e0b" },
  { itemId: "theme_pink",         name: "Neon Pink",        type: "theme",  rarity: "rare",      description: "Stand out from the crowd",         cssClass: "theme-pink",        value: "#ec4899" },
  { itemId: "theme_legendary",    name: "Legendary Aura",   type: "theme",  rarity: "legendary", description: "Rainbow gradient theme",           cssClass: "theme-legendary",   value: "rainbow" },
  // Borders
  { itemId: "border_plain",       name: "Plain",            type: "border", rarity: "common",    description: "Simple border",                    cssClass: "border-plain",      value: "solid" },
  { itemId: "border_glow_blue",   name: "Blue Glow",        type: "border", rarity: "rare",      description: "Glowing blue border",              cssClass: "border-glow-blue",  value: "glow-blue" },
  { itemId: "border_glow_purple", name: "Purple Glow",      type: "border", rarity: "rare",      description: "Glowing purple border",            cssClass: "border-glow-purple",value: "glow-purple" },
  { itemId: "border_fire",        name: "Fire Border",      type: "border", rarity: "epic",      description: "Animated fire border",             cssClass: "border-fire",       value: "fire" },
  { itemId: "border_legendary",   name: "Legendary Crown",  type: "border", rarity: "legendary", description: "Animated rainbow crown",           cssClass: "border-legendary",  value: "legendary" },
];

async function seedItems() {
  for (const item of ITEMS) {
    await Item.findOneAndUpdate({ itemId: item.itemId }, item, { upsert: true });
  }
  console.log("Item seed complete");
}

module.exports = { seedItems, ITEMS };
