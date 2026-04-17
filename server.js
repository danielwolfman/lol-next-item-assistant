const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 3210);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const CACHE_DIR = path.join(ROOT, ".cache");
const PATCH_FILE = path.join(CACHE_DIR, "patch-version.json");
const ITEMS_FILE = path.join(CACHE_DIR, "item-data.json");
const CHAMPIONS_FILE = path.join(CACHE_DIR, "champion-data.json");
const META_BUILD_TTL_MS = 1000 * 60 * 60 * 6;

const STATIC_FILES = {
  "/": "index.html",
  "/app.js": "app.js",
  "/styles.css": "styles.css"
};

const cache = {
  staticData: null
};

const DAMAGE_ARCHETYPE_HINTS = {
  marksman: { physical: 0.96, magic: 0.04 },
  fighter: { physical: 0.78, magic: 0.22 },
  bruiser: { physical: 0.72, magic: 0.28 },
  tank: { physical: 0.52, magic: 0.48 },
  mage: { physical: 0.08, magic: 0.92 },
  "ad-assassin": { physical: 0.9, magic: 0.1 },
  "ap-assassin": { physical: 0.18, magic: 0.82 },
  enchanter: { physical: 0.15, magic: 0.85 }
};

const ARCHETYPE_WEIGHTS = {
  marksman: {
    ad: 1.1,
    ap: 0.05,
    attackSpeed: 1.0,
    crit: 1.2,
    armor: 0.18,
    mr: 0.18,
    health: 0.18,
    mana: 0.08,
    lifesteal: 0.55,
    offenseBias: 1.2,
    defenseBias: 0.8,
    feature: {
      crit: 5,
      armorPen: 3.5,
      onHit: 2.8,
      haste: 0.8,
      healShield: 0,
      stasis: 0
    }
  },
  mage: {
    ad: 0.05,
    ap: 1.15,
    attackSpeed: 0.05,
    crit: 0,
    armor: 0.26,
    mr: 0.22,
    health: 0.22,
    mana: 0.35,
    lifesteal: 0,
    offenseBias: 1.15,
    defenseBias: 0.75,
    feature: {
      crit: 0,
      armorPen: 0,
      magicPen: 3.8,
      onHit: 0.6,
      haste: 2.4,
      healShield: 0,
      stasis: 6
    }
  },
  fighter: {
    ad: 0.9,
    ap: 0.08,
    attackSpeed: 0.35,
    crit: 0.15,
    armor: 0.35,
    mr: 0.35,
    health: 0.55,
    mana: 0.12,
    lifesteal: 0.35,
    offenseBias: 1,
    defenseBias: 1,
    feature: {
      crit: 0.4,
      armorPen: 2.2,
      magicPen: 0,
      onHit: 1.8,
      haste: 2.2,
      healShield: 0,
      stasis: 1
    }
  },
  bruiser: {
    ad: 0.55,
    ap: 0.55,
    attackSpeed: 0.22,
    crit: 0,
    armor: 0.32,
    mr: 0.32,
    health: 0.58,
    mana: 0.12,
    lifesteal: 0.16,
    offenseBias: 0.95,
    defenseBias: 1,
    feature: {
      crit: 0,
      armorPen: 1.4,
      magicPen: 1.8,
      onHit: 1.5,
      haste: 2.4,
      healShield: 0,
      stasis: 1.5
    }
  },
  tank: {
    ad: 0.12,
    ap: 0.08,
    attackSpeed: 0.08,
    crit: 0,
    armor: 0.95,
    mr: 0.95,
    health: 1.15,
    mana: 0.2,
    lifesteal: 0,
    offenseBias: 0.55,
    defenseBias: 1.4,
    feature: {
      crit: 0,
      armorPen: 0,
      magicPen: 0,
      onHit: 0,
      haste: 2.6,
      healShield: 0,
      stasis: 0
    }
  },
  "ad-assassin": {
    ad: 1.15,
    ap: 0,
    attackSpeed: 0.2,
    crit: 0.25,
    armor: 0.12,
    mr: 0.12,
    health: 0.18,
    mana: 0.08,
    lifesteal: 0.18,
    offenseBias: 1.25,
    defenseBias: 0.65,
    feature: {
      crit: 0.2,
      armorPen: 4.6,
      magicPen: 0,
      onHit: 0.6,
      haste: 2.2,
      healShield: 0,
      stasis: 0
    }
  },
  "ap-assassin": {
    ad: 0,
    ap: 1.18,
    attackSpeed: 0.08,
    crit: 0,
    armor: 0.2,
    mr: 0.2,
    health: 0.16,
    mana: 0.12,
    lifesteal: 0,
    offenseBias: 1.2,
    defenseBias: 0.7,
    feature: {
      crit: 0,
      armorPen: 0,
      magicPen: 4.2,
      onHit: 0.8,
      haste: 2.4,
      healShield: 0,
      stasis: 4
    }
  },
  enchanter: {
    ad: 0,
    ap: 0.62,
    attackSpeed: 0,
    crit: 0,
    armor: 0.22,
    mr: 0.24,
    health: 0.25,
    mana: 0.55,
    lifesteal: 0,
    offenseBias: 0.7,
    defenseBias: 0.9,
    feature: {
      crit: 0,
      armorPen: 0,
      magicPen: 0.8,
      onHit: 0,
      haste: 3.4,
      healShield: 5.2,
      stasis: 1
    }
  }
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function stripMarkup(text) {
  return String(text || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function championSlug(value) {
  return normalizeToken(value);
}

function unique(values) {
  return [...new Set(values)];
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function readJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function httpGetJson(targetUrl, { insecure = false, timeoutMs = 4500 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const client = url.protocol === "https:" ? https : http;
    const req = client.get(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        rejectUnauthorized: !insecure,
        timeout: timeoutMs
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode} from ${targetUrl}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`Invalid JSON from ${targetUrl}: ${error.message}`));
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error(`Timed out requesting ${targetUrl}`));
    });
    req.on("error", reject);
  });
}

function httpGetText(targetUrl, { insecure = false, timeoutMs = 4500 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const client = url.protocol === "https:" ? https : http;
    const req = client.get(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        rejectUnauthorized: !insecure,
        timeout: timeoutMs,
        headers: {
          "User-Agent": "LoL-Item-Coach/0.2"
        }
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode} from ${targetUrl}`));
            return;
          }
          resolve(body);
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error(`Timed out requesting ${targetUrl}`));
    });
    req.on("error", reject);
  });
}

function getMetaBuildCacheFile(slug) {
  return path.join(CACHE_DIR, `mobalytics-build-${slug}.json`);
}

function readFreshMetaBuild(slug) {
  const filePath = getMetaBuildCacheFile(slug);
  const cached = readJsonIfPresent(filePath);
  if (!cached || !cached.fetchedAt) {
    return null;
  }
  if (Date.now() - Number(cached.fetchedAt) > META_BUILD_TTL_MS) {
    return null;
  }
  return cached;
}

function extractSectionItemIds(html, headingText, { maxChars = 7000, limit = 12 } = {}) {
  const lower = html.toLowerCase();
  const index = lower.indexOf(String(headingText || "").toLowerCase());
  if (index < 0) {
    return [];
  }
  const slice = html.slice(index, index + maxChars);
  const matches = [...slice.matchAll(/\/game-items\/(\d+)\.png/gi)].map((match) => String(match[1]));
  return unique(matches).slice(0, limit);
}

async function loadMobalyticsBuild(player, staticData) {
  const championId = player.champion?.id || player.championName;
  const slug = championSlug(championId);
  const cached = readFreshMetaBuild(slug);
  if (cached) {
    return cached;
  }

  ensureDir(CACHE_DIR);
  const url = `https://mobalytics.gg/lol/champions/${slug}/build`;
  const html = await httpGetText(url, { timeoutMs: 9000 });
  const coreIds = extractSectionItemIds(html, "Core Items", { maxChars: 4000, limit: 6 });
  const fullBuildIds = extractSectionItemIds(html, "Full Build", { maxChars: 5000, limit: 8 });
  const situationalIds = extractSectionItemIds(html, "situational items", { maxChars: 3500, limit: 8 });

  if (!coreIds.length && !fullBuildIds.length && !situationalIds.length) {
    throw new Error(`Unable to parse Mobalytics build data for ${player.championName}.`);
  }

  const payload = {
    provider: "Mobalytics",
    url,
    fetchedAt: Date.now(),
    champion: decodeHtmlEntities(player.championName),
    coreIds,
    fullBuildIds,
    situationalIds,
    bootIds: unique([...coreIds, ...fullBuildIds]).filter((itemId) => staticData.items[itemId]?.features?.isBoots)
  };

  writeJson(getMetaBuildCacheFile(slug), payload);
  return payload;
}

async function loadStaticData() {
  if (cache.staticData) {
    return cache.staticData;
  }

  ensureDir(CACHE_DIR);

  const cachedVersion = readJsonIfPresent(PATCH_FILE);
  const cachedItems = readJsonIfPresent(ITEMS_FILE);
  const cachedChampions = readJsonIfPresent(CHAMPIONS_FILE);

  let version = cachedVersion?.version || null;
  let itemsPayload = cachedItems;
  let championsPayload = cachedChampions;

  try {
    const versions = await httpGetJson("https://ddragon.leagueoflegends.com/api/versions.json", {
      timeoutMs: 8000
    });
    version = versions[0];
    writeJson(PATCH_FILE, { version });
  } catch (error) {
    if (!version) {
      throw new Error(`Unable to load Riot patch version: ${error.message}`);
    }
  }

  const pending = [];

  if (!itemsPayload) {
    pending.push(
      httpGetJson(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`, {
        timeoutMs: 12000
      }).then((payload) => {
        itemsPayload = payload;
        writeJson(ITEMS_FILE, payload);
      })
    );
  }

  if (!championsPayload) {
    pending.push(
      httpGetJson(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`, {
        timeoutMs: 12000
      }).then((payload) => {
        championsPayload = payload;
        writeJson(CHAMPIONS_FILE, payload);
      })
    );
  }

  if (pending.length) {
    try {
      await Promise.all(pending);
    } catch (error) {
      if (!itemsPayload || !championsPayload) {
        throw new Error(`Unable to load Riot static data: ${error.message}`);
      }
    }
  }

  const itemMap = {};
  for (const [itemId, item] of Object.entries(itemsPayload.data || {})) {
    itemMap[itemId] = buildItemRecord(itemId, item);
  }

  const championMap = {};
  for (const champion of Object.values(championsPayload.data || {})) {
    const aliases = new Set([
      normalizeToken(champion.id),
      normalizeToken(champion.name),
      normalizeToken(champion.key)
    ]);
    championMap[normalizeToken(champion.id)] = {
      id: champion.id,
      key: champion.key,
      name: champion.name,
      tags: champion.tags || [],
      info: champion.info || {},
      partype: champion.partype || "",
      aliases: [...aliases]
    };
    for (const alias of aliases) {
      championMap[alias] = championMap[normalizeToken(champion.id)];
    }
  }

  cache.staticData = {
    version,
    items: itemMap,
    champions: championMap
  };
  return cache.staticData;
}

function buildItemRecord(itemId, item) {
  const stats = item.stats || {};
  const description = stripMarkup(item.description);
  const lower = description.toLowerCase();
  const tags = item.tags || [];
  const tagSet = new Set(tags.map((tag) => tag.toLowerCase()));

  const record = {
    id: String(itemId),
    name: item.name,
    gold: item.gold || {},
    maps: item.maps || {},
    tags,
    depth: item.depth || 0,
    from: item.from || [],
    description,
    image: item.image || {},
    stats: {
      health: Number(stats.FlatHPPoolMod || 0),
      armor: Number(stats.FlatArmorMod || 0),
      mr: Number(stats.FlatSpellBlockMod || 0),
      ad: Number(stats.FlatPhysicalDamageMod || 0),
      ap: Number(stats.FlatMagicDamageMod || 0),
      mana: Number(stats.FlatMPPoolMod || 0),
      attackSpeed: Number(stats.PercentAttackSpeedMod || 0) * 100,
      crit: Number(stats.FlatCritChanceMod || 0) * 100,
      lifesteal: Number(stats.PercentLifeStealMod || 0) * 100,
      moveSpeed:
        Number(stats.FlatMovementSpeedMod || 0) + Number(stats.PercentMovementSpeedMod || 0) * 100
    },
    features: {
      isBoots: tagSet.has("boots"),
      hasAbilityHaste: tagSet.has("abilityhaste") || lower.includes("ability haste"),
      hasArmorPen: tagSet.has("armorpenetration") || lower.includes("armor penetration") || lower.includes("lethality"),
      hasMagicPen: tagSet.has("magicpenetration") || lower.includes("magic penetration"),
      hasCrit: tagSet.has("criticalstrike"),
      hasOnHit: tagSet.has("onhit") || lower.includes("on-hit"),
      hasGrievousWounds: lower.includes("grievous wounds"),
      hasHealShieldPower: lower.includes("heal and shield power"),
      hasStasis: lower.includes("stasis"),
      hasShield: lower.includes("shield"),
      lowerText: `${item.name} ${lower}`.toLowerCase()
    }
  };

  return record;
}

function getMockGameData() {
  return {
    gameData: {
      gameMode: "CLASSIC",
      gameTime: 1295
    },
    activePlayer: {
      summonerName: "PoC Player",
      currentGold: 1120,
      level: 11,
      championStats: {
        armor: 64,
        magicResist: 44,
        currentHealth: 1470,
        maxHealth: 1890,
        attackDamage: 89,
        abilityPower: 194
      }
    },
    allPlayers: [
      {
        summonerName: "PoC Player",
        team: "ORDER",
        championName: "Ahri",
        rawChampionName: "game_character_displayname_Ahri",
        level: 11,
        items: [{ itemID: 3020 }, { itemID: 3100 }, { itemID: 1028 }],
        scores: { kills: 3, deaths: 2, assists: 4, creepScore: 112 },
        championStats: {
          armor: 64,
          magicResist: 44,
          maxHealth: 1890,
          currentHealth: 1470,
          abilityPower: 194,
          attackDamage: 89
        }
      },
      {
        summonerName: "Ally Top",
        team: "ORDER",
        championName: "Ornn",
        rawChampionName: "game_character_displayname_Ornn",
        level: 12,
        items: [{ itemID: 3068 }, { itemID: 1031 }],
        scores: { kills: 1, deaths: 3, assists: 5, creepScore: 118 }
      },
      {
        summonerName: "Ally Jungle",
        team: "ORDER",
        championName: "Vi",
        rawChampionName: "game_character_displayname_Vi",
        level: 10,
        items: [{ itemID: 6694 }, { itemID: 3047 }],
        scores: { kills: 2, deaths: 4, assists: 3, creepScore: 92 }
      },
      {
        summonerName: "Ally ADC",
        team: "ORDER",
        championName: "Jinx",
        rawChampionName: "game_character_displayname_Jinx",
        level: 10,
        items: [{ itemID: 3006 }, { itemID: 6672 }],
        scores: { kills: 4, deaths: 3, assists: 2, creepScore: 128 }
      },
      {
        summonerName: "Ally Supp",
        team: "ORDER",
        championName: "Nami",
        rawChampionName: "game_character_displayname_Nami",
        level: 9,
        items: [{ itemID: 2065 }, { itemID: 3114 }],
        scores: { kills: 0, deaths: 3, assists: 9, creepScore: 24 }
      },
      {
        summonerName: "Enemy Top",
        team: "CHAOS",
        championName: "Darius",
        rawChampionName: "game_character_displayname_Darius",
        level: 12,
        items: [{ itemID: 3078 }, { itemID: 3047 }],
        scores: { kills: 2, deaths: 1, assists: 2, creepScore: 122 }
      },
      {
        summonerName: "Enemy Jungle",
        team: "CHAOS",
        championName: "Zed",
        rawChampionName: "game_character_displayname_Zed",
        level: 12,
        items: [{ itemID: 3142 }, { itemID: 6692 }, { itemID: 1036 }],
        scores: { kills: 7, deaths: 1, assists: 1, creepScore: 111 }
      },
      {
        summonerName: "Enemy Mid",
        team: "CHAOS",
        championName: "Viktor",
        rawChampionName: "game_character_displayname_Viktor",
        level: 11,
        items: [{ itemID: 6653 }, { itemID: 3020 }],
        scores: { kills: 2, deaths: 2, assists: 3, creepScore: 116 }
      },
      {
        summonerName: "Enemy ADC",
        team: "CHAOS",
        championName: "Jhin",
        rawChampionName: "game_character_displayname_Jhin",
        level: 10,
        items: [{ itemID: 3006 }, { itemID: 6676 }],
        scores: { kills: 4, deaths: 2, assists: 2, creepScore: 120 }
      },
      {
        summonerName: "Enemy Supp",
        team: "CHAOS",
        championName: "Leona",
        rawChampionName: "game_character_displayname_Leona",
        level: 9,
        items: [{ itemID: 3860 }, { itemID: 3047 }],
        scores: { kills: 0, deaths: 2, assists: 8, creepScore: 23 }
      }
    ]
  };
}

async function getLiveGameData() {
  return httpGetJson("https://127.0.0.1:2999/liveclientdata/allgamedata", {
    insecure: true,
    timeoutMs: 2500
  });
}

function getStat(source, keys, fallback = 0) {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null && !Number.isNaN(Number(source[key]))) {
      return Number(source[key]);
    }
  }
  return fallback;
}

function buildMetaSource(player) {
  const championId = player.champion?.id || player.championName;
  const slug = championSlug(championId);
  return {
    provider: "Mobalytics",
    label: `${player.championName} build page`,
    url: `https://mobalytics.gg/lol/champions/${slug}/build`,
    note: "Candidate pool is constrained to this provider's build lists."
  };
}

function resolveChampion(rawName, champions) {
  const token = normalizeToken(
    String(rawName || "")
      .replace("game_character_displayname_", "")
      .replace("game_character_displayname", "")
  );
  return champions[token] || null;
}

function deriveArchetype(champion) {
  if (!champion) {
    return "fighter";
  }
  const tags = new Set(champion.tags || []);
  const attack = Number(champion.info?.attack || 0);
  const magic = Number(champion.info?.magic || 0);

  if (tags.has("Marksman")) {
    return "marksman";
  }
  if (tags.has("Support") && tags.has("Tank")) {
    return "tank";
  }
  if (tags.has("Support")) {
    return "enchanter";
  }
  if (tags.has("Tank") && tags.has("Mage")) {
    return "tank";
  }
  if (tags.has("Tank")) {
    return tags.has("Fighter") ? "fighter" : "tank";
  }
  if (tags.has("Mage") && tags.has("Assassin")) {
    return magic >= attack ? "ap-assassin" : "ad-assassin";
  }
  if (tags.has("Mage")) {
    return tags.has("Fighter") ? "bruiser" : "mage";
  }
  if (tags.has("Assassin")) {
    return magic > attack ? "ap-assassin" : "ad-assassin";
  }
  if (tags.has("Fighter")) {
    return "fighter";
  }
  return magic > attack ? "mage" : "fighter";
}

function normalizePlayer(rawPlayer, champions) {
  const champion =
    resolveChampion(rawPlayer.championName || rawPlayer.rawChampionName || rawPlayer.rawChampionNameText, champions) ||
    resolveChampion(rawPlayer.rawChampionName, champions);
  const championName = champion?.name || rawPlayer.championName || stripMarkup(rawPlayer.rawChampionName || "Unknown");
  const rawItems = Array.isArray(rawPlayer.items) ? rawPlayer.items : [];
  const itemIds = rawItems
    .map((entry) => entry.itemID ?? entry.itemId ?? entry.id ?? entry.ID)
    .map((value) => String(value || "0"))
    .filter((value) => value !== "0");
  const scores = rawPlayer.scores || {};
  const championStats = rawPlayer.championStats || {};

  return {
    name: rawPlayer.summonerName || rawPlayer.riotIdGameName || "Unknown Player",
    team: rawPlayer.team || "ORDER",
    champion,
    championName,
    archetype: deriveArchetype(champion),
    level: Number(rawPlayer.level || 1),
    items: itemIds,
    kills: Number(scores.kills || 0),
    deaths: Number(scores.deaths || 0),
    assists: Number(scores.assists || 0),
    cs: Number(scores.creepScore || scores.CreepScore || 0),
    championStats: {
      armor: getStat(championStats, ["armor", "bonusArmor", "armorTotal"]),
      mr: getStat(championStats, ["magicResist", "spellBlock", "mr"]),
      health: getStat(championStats, ["maxHealth", "health", "resourceMax"]),
      currentHealth: getStat(championStats, ["currentHealth", "health", "maxHealth"]),
      ad: getStat(championStats, ["attackDamage", "physicalDamage"]),
      ap: getStat(championStats, ["abilityPower", "magicDamage"])
    }
  };
}

function computeDamageProfile(player, itemMap) {
  const baseHint = DAMAGE_ARCHETYPE_HINTS[player.archetype] || DAMAGE_ARCHETYPE_HINTS.fighter;
  let physical = baseHint.physical;
  let magic = baseHint.magic;

  let adSum = 0;
  let apSum = 0;
  let critSum = 0;

  for (const itemId of player.items) {
    const item = itemMap[itemId];
    if (!item) {
      continue;
    }
    adSum += item.stats.ad;
    apSum += item.stats.ap;
    critSum += item.stats.crit;
  }

  physical += adSum / 180 + critSum / 150;
  magic += apSum / 180;

  const total = Math.max(0.01, physical + magic);
  return {
    physical: physical / total,
    magic: magic / total
  };
}

function computeThreatScore(player, itemMap) {
  const itemTotal = player.items.reduce((sum, itemId) => sum + Number(itemMap[itemId]?.gold?.total || 0), 0);
  const completedItems = player.items.filter((itemId) => Number(itemMap[itemId]?.gold?.total || 0) >= 2200).length;
  const snowballKDA = player.kills * 1.8 + player.assists * 0.65 - player.deaths * 0.9;
  const farmValue = player.cs * 0.028;
  const itemValue = itemTotal / 1650;
  const levelValue = player.level * 0.85;
  return Math.max(1, 6 + snowballKDA + farmValue + itemValue + completedItems * 1.4 + levelValue);
}

function summariseEnemyField(enemies, itemMap) {
  const assessed = enemies.map((player) => {
    const damage = computeDamageProfile(player, itemMap);
    const threatScore = computeThreatScore(player, itemMap);
    const healingSignals = player.items.reduce((sum, itemId) => {
      const item = itemMap[itemId];
      if (!item) {
        return sum;
      }
      const text = item.features.lowerText;
      const lifestealScore = item.stats.lifesteal > 0 ? 0.4 : 0;
      const sustainText = text.includes("heal") || text.includes("omnivamp") || text.includes("lifesteal") ? 0.45 : 0;
      return sum + lifestealScore + sustainText;
    }, 0);

    return {
      ...player,
      threatScore,
      damage,
      healingSignals
    };
  });

  const totalThreat = assessed.reduce((sum, player) => sum + player.threatScore, 0) || 1;
  const physicalShare =
    assessed.reduce((sum, player) => sum + player.threatScore * player.damage.physical, 0) / totalThreat;
  const magicShare =
    assessed.reduce((sum, player) => sum + player.threatScore * player.damage.magic, 0) / totalThreat;
  const healingPressure =
    assessed.reduce((sum, player) => sum + player.healingSignals * (player.threatScore / totalThreat), 0);
  const topThreat = assessed.slice().sort((left, right) => right.threatScore - left.threatScore)[0];

  return {
    players: assessed,
    totalThreat,
    physicalShare,
    magicShare,
    healingPressure,
    topThreat
  };
}

function deriveBuildPhase(level, gameMinutes) {
  if (level <= 6 || gameMinutes < 9) {
    return "lane";
  }
  if (level <= 12 || gameMinutes < 22) {
    return "mid";
  }
  return "late";
}

function computeLiveSignal(players, enemies, enemyField, itemMap, gameMinutes) {
  const totalKills = players.reduce((sum, player) => sum + player.kills, 0);
  const totalCompletedItems = players.reduce(
    (sum, player) => sum + player.items.filter((itemId) => Number(itemMap[itemId]?.gold?.total || 0) >= 2200).length,
    0
  );
  const enemyKillLead = enemies.length ? Math.max(...enemies.map((player) => player.kills - player.deaths), 0) : 0;
  const sortedThreats = enemyField.players.slice().sort((left, right) => right.threatScore - left.threatScore);
  const topThreatGap =
    sortedThreats.length >= 2
      ? clamp((sortedThreats[0].threatScore - sortedThreats[1].threatScore) / 10, 0, 1)
      : 0;
  const timeSignal = clamp((gameMinutes - 6) / 10, 0, 1);
  const killSignal = clamp(totalKills / 18, 0, 1);
  const itemSignal = clamp(totalCompletedItems / 8, 0, 1);
  const snowballSignal = clamp(enemyKillLead / 4, 0, 1);

  return clamp(
    timeSignal * 0.34 + killSignal * 0.28 + itemSignal * 0.18 + topThreatGap * 0.12 + snowballSignal * 0.08,
    0,
    1
  );
}

function classifyNeeds(self, activePlayer, enemyField, gameMinutes, liveSignal) {
  const armor = getStat(activePlayer?.championStats || {}, ["armor"], self.championStats.armor);
  const mr = getStat(activePlayer?.championStats || {}, ["magicResist", "spellBlock", "mr"], self.championStats.mr);
  const health = getStat(activePlayer?.championStats || {}, ["maxHealth", "health"], self.championStats.health);
  const gold = Number(activePlayer?.currentGold || 0);
  const deathsPressure = Math.max(0, self.deaths - self.kills + 1) * 0.18;
  const topThreatShare = enemyField.topThreat ? enemyField.topThreat.threatScore / enemyField.totalThreat : 0.2;
  const reactiveThreat = topThreatShare * liveSignal;
  const dangerIndex = deathsPressure + reactiveThreat * 0.9;
  const armorNeed = clamp((enemyField.physicalShare * 170 - armor) / 110 * liveSignal + dangerIndex, 0, 1.7);
  const mrNeed = clamp((enemyField.magicShare * 150 - mr) / 100 * liveSignal + dangerIndex * 0.9, 0, 1.7);
  const healthNeed = clamp((gameMinutes * 70 - health) / 1300 + dangerIndex * 0.7, 0, 1.5);

  return {
    gold,
    armor,
    mr,
    health,
    armorNeed,
    mrNeed,
    healthNeed,
    damageNeed:
      (ARCHETYPE_WEIGHTS[self.archetype]?.offenseBias || 1) +
      clamp((gameMinutes - 8) / 20, 0, 0.35) -
      clamp(dangerIndex - 0.45, 0, 0.35),
    defenseNeed:
      (ARCHETYPE_WEIGHTS[self.archetype]?.defenseBias || 1) + dangerIndex + (healthNeed + armorNeed + mrNeed) * 0.18
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function countOwnedComponents(targetItem, ownedIds) {
  const direct = targetItem.from || [];
  return direct.filter((componentId) => ownedIds.has(String(componentId))).length;
}

function ownsBoots(self, itemMap) {
  return self.items.some((itemId) => itemMap[itemId]?.features?.isBoots);
}

function findOwnedBoot(self, itemMap) {
  for (const itemId of self.items) {
    const item = itemMap[itemId];
    if (item?.features?.isBoots) {
      return item;
    }
  }
  return null;
}

function isNonBuildSlotItem(item) {
  if (!item) {
    return true;
  }

  const lower = item.features?.lowerText || "";
  return (
    item.tags.includes("Trinket") ||
    item.tags.includes("Consumable") ||
    lower.includes("trinket") ||
    lower.includes("ward") ||
    lower.includes("elixir")
  );
}

function getBuildSlotItemIds(itemIds, itemMap) {
  return itemIds.filter((itemId) => !isNonBuildSlotItem(itemMap[itemId]));
}

function isCompletedInventoryItem(item) {
  if (!item) {
    return false;
  }
  if (isNonBuildSlotItem(item)) {
    return false;
  }
  if (item.features.isBoots) {
    return true;
  }
  return Number(item.gold.total || 0) >= 2200 || Number(item.depth || 0) >= 2;
}

function hasFullCompletedBuild(self, itemMap) {
  const buildSlotItemIds = getBuildSlotItemIds(self.items, itemMap);
  if (buildSlotItemIds.length < 6) {
    return false;
  }
  return buildSlotItemIds.every((itemId) => isCompletedInventoryItem(itemMap[itemId]));
}

function isExcludedItem(item, selfArchetype) {
  const lower = item.features.lowerText;
  if (!item.maps["11"] || !item.gold.purchasable) {
    return true;
  }
  if (item.gold.total < 900) {
    return true;
  }
  if (!item.features.isBoots && item.gold.total < 2200) {
    return true;
  }
  if (item.depth < 2 && !item.features.isBoots) {
    return true;
  }
  if (
    lower.includes("elixir") ||
    lower.includes("trinket") ||
    lower.includes("wardstone") ||
    lower.includes("world atlas") ||
    lower.includes("runic compass") ||
    lower.includes("bounty of worlds") ||
    lower.includes("scorchclaw") ||
    lower.includes("gustwalker") ||
    lower.includes("mosstomper")
  ) {
    return true;
  }
  if (item.tags.includes("Consumable") || item.tags.includes("Trinket") || item.tags.includes("Jungle")) {
    return true;
  }
  if (selfArchetype !== "enchanter" && lower.includes("support")) {
    return true;
  }
  return false;
}

function computePhaseBonus(item, context) {
  const lower = item.name.toLowerCase();
  const stats = item.stats;
  const feature = item.features;
  const phase = context.phase;
  const archetype = context.self.archetype;
  let bonus = 0;

  if (phase === "lane") {
    if (archetype === "mage" || archetype === "ap-assassin") {
      if (stats.ap >= 80) {
        bonus += 4.5;
      }
      if (stats.mana >= 300 || feature.hasAbilityHaste || feature.hasMagicPen) {
        bonus += 2.2;
      }
      if (stats.armor + stats.mr >= 40 && stats.ap < 70 && !feature.hasStasis) {
        bonus -= 10;
      }
    } else if (archetype === "marksman") {
      if (stats.ad >= 40 || stats.attackSpeed >= 25 || stats.crit >= 25) {
        bonus += 4.2;
      }
      if (stats.armor + stats.mr >= 40 && stats.ad + stats.attackSpeed < 35) {
        bonus -= 9;
      }
    } else if (archetype === "tank") {
      if (stats.health >= 300 || stats.armor >= 35 || stats.mr >= 35) {
        bonus += 5;
      }
    } else if (archetype === "enchanter") {
      if (stats.mana >= 300 || feature.hasAbilityHaste || feature.hasHealShieldPower) {
        bonus += 4.8;
      }
    } else {
      if (stats.health >= 250 || stats.ad >= 35 || stats.ap >= 70) {
        bonus += 3.4;
      }
      if (feature.hasAbilityHaste) {
        bonus += 1.4;
      }
    }

    if (item.gold.total >= 3400 && countOwnedComponents(item, context.ownedIds) === 0) {
      bonus -= 3.5;
    }
  }

  if (phase === "mid") {
    if (feature.hasAbilityHaste) {
      bonus += 1.2;
    }
    if (item.gold.total >= 3000) {
      bonus += 1.1;
    }
  }

  if (phase === "late") {
    if (item.gold.total >= 3200) {
      bonus += 2.8;
    }
    if (lower.includes("deathcap") || lower.includes("infinity edge") || lower.includes("void")) {
      bonus += 1.6;
    }
  }

  return bonus;
}

function scoreItem(item, context) {
  const weights = ARCHETYPE_WEIGHTS[context.self.archetype] || ARCHETYPE_WEIGHTS.fighter;
  const ownedIds = context.ownedIds;
  const stats = item.stats;
  const feature = item.features;
  const enemyField = context.enemyField;
  const needs = context.needs;
  const topThreat = enemyField.topThreat;
  const liveWeight = context.liveSignal;

  let base = 0;
  base += (stats.ad / 40) * weights.ad * 10;
  base += (stats.ap / 60) * weights.ap * 10;
  base += (stats.attackSpeed / 25) * weights.attackSpeed * 10;
  base += (stats.crit / 25) * weights.crit * 10;
  base += (stats.health / 300) * weights.health * 10;
  base += (stats.armor / 35) * weights.armor * 10;
  base += (stats.mr / 35) * weights.mr * 10;
  base += (stats.mana / 400) * weights.mana * 10;
  base += (stats.lifesteal / 10) * weights.lifesteal * 10;

  if (feature.hasAbilityHaste) {
    base += weights.feature.haste || 0;
  }
  if (feature.hasArmorPen) {
    base += weights.feature.armorPen || 0;
  }
  if (feature.hasMagicPen) {
    base += weights.feature.magicPen || 0;
  }
  if (feature.hasCrit) {
    base += weights.feature.crit || 0;
  }
  if (feature.hasOnHit) {
    base += weights.feature.onHit || 0;
  }
  if (feature.hasHealShieldPower) {
    base += weights.feature.healShield || 0;
  }
  if (feature.hasStasis) {
    base += weights.feature.stasis || 0;
  }
  const phaseBonus = computePhaseBonus(item, context);

  const adCounterValue = (stats.armor / 35) * 7.2 + (stats.health / 350) * 3.6 + (feature.hasStasis ? 5.5 : 0);
  const apCounterValue = (stats.mr / 35) * 7.2 + (stats.health / 350) * 3.5 + (feature.hasShield ? 1.2 : 0);
  const antiHealValue = feature.hasGrievousWounds ? 5.2 : 0;

  const counterScore =
    (adCounterValue * enemyField.physicalShare * needs.armorNeed * needs.defenseNeed +
      apCounterValue * enemyField.magicShare * needs.mrNeed * needs.defenseNeed +
      antiHealValue * clamp(enemyField.healingPressure, 0, 1.2)) *
    liveWeight;

  let topThreatBonus = 0;
  if (topThreat && liveWeight >= 0.35) {
    const threatIsPhysical = topThreat.damage.physical >= topThreat.damage.magic;
    if (threatIsPhysical) {
      topThreatBonus += adCounterValue * (topThreat.threatScore / enemyField.totalThreat) * 0.9 * liveWeight;
    } else {
      topThreatBonus += apCounterValue * (topThreat.threatScore / enemyField.totalThreat) * 0.9 * liveWeight;
    }
  }

  let progressionBonus = 0;
  const ownedComponents = countOwnedComponents(item, ownedIds);
  progressionBonus += ownedComponents * 2.4;

  const missingGold = Math.max(0, Number(item.gold.total || 0) - needs.gold);
  const affordabilityBonus = clamp(5 - missingGold / 450, 0, 5);

  let bootsModifier = 0;
  if (item.features.isBoots) {
    bootsModifier += !context.hasBoots && context.gameMinutes >= 6 ? 4.5 : -18;
    const lowerName = item.name.toLowerCase();
    if (lowerName.includes("steelcaps")) {
      bootsModifier += enemyField.physicalShare * needs.armorNeed * 8 * liveWeight;
    }
    if (lowerName.includes("mercury")) {
      bootsModifier += enemyField.magicShare * needs.mrNeed * 8 * liveWeight;
    }
    if (lowerName.includes("sorcer")) {
      bootsModifier += context.prefersMagic ? 6 : -4;
    }
    if (lowerName.includes("berserker")) {
      bootsModifier += context.self.archetype === "marksman" ? 6 : -2;
    }
    if (lowerName.includes("lucidity")) {
      bootsModifier += feature.hasAbilityHaste || context.self.archetype === "mage" || context.self.archetype === "enchanter" ? 5 : 0;
    }
  }

  let penalties = 0;
  if (ownedIds.has(item.id)) {
    penalties -= 36;
  }
  if (item.gold.total >= 3600 && needs.gold < 900 && ownedComponents === 0) {
    penalties -= 2.8;
  }
  if (context.self.archetype === "tank" && stats.ad + stats.ap >= 80 && stats.armor + stats.mr + stats.health < 250) {
    penalties -= 8;
  }
  if (
    (context.self.archetype === "mage" ||
      context.self.archetype === "ap-assassin" ||
      context.self.archetype === "marksman" ||
      context.self.archetype === "enchanter") &&
    stats.ad + stats.ap < 20 &&
    stats.armor + stats.mr + stats.health >= 220
  ) {
    penalties -= 18;
  }

  const totalScore =
    base + phaseBonus + counterScore + topThreatBonus + progressionBonus + affordabilityBonus + bootsModifier + penalties;
  const reasons = buildReasons(item, context, {
    base,
    phaseBonus,
    counterScore,
    topThreatBonus,
    progressionBonus,
    affordabilityBonus,
    bootsModifier
  });

  return {
    itemId: item.id,
    name: item.name,
    isBoots: item.features.isBoots,
    totalScore,
    missingGold,
    totalGold: Number(item.gold.total || 0),
    imageUrl: `https://ddragon.leagueoflegends.com/cdn/${context.version}/img/item/${item.image.full}`,
    reasons,
    stats,
    tags: item.tags
  };
}

function buildReasons(item, context, breakdown) {
  const reasons = [];
  const topThreat = context.enemyField.topThreat;
  const lowerName = item.name.toLowerCase();
  const lowSignal = context.liveSignal < 0.35;

  if (lowSignal && breakdown.phaseBonus >= 2.5) {
    if (context.phase === "lane") {
      reasons.push(`Low-signal lane phase, so this stays on a standard level ${context.self.level} meta curve.`);
    } else {
      reasons.push("Game state is still low-signal, so this leans on the standard build curve first.");
    }
  }

  if (breakdown.base >= 12) {
    if (context.self.archetype === "mage" || context.self.archetype === "ap-assassin") {
      reasons.push("Strong AP-side meta fit for your champion profile.");
    } else if (context.self.archetype === "marksman") {
      reasons.push("Matches a standard DPS curve for a marksman build.");
    } else if (context.self.archetype === "tank") {
      reasons.push("Fits a front-line item curve well.");
    } else {
      reasons.push("Fits your champion's usual stat pattern well.");
    }
  }

  if (!lowSignal && breakdown.counterScore >= 7.5) {
    if (context.enemyField.physicalShare >= context.enemyField.magicShare && item.stats.armor > 0) {
      reasons.push(
        `Enemy comp is ${Math.round(context.enemyField.physicalShare * 100)}% AD by threat, so armor pays off now.`
      );
    } else if (item.stats.mr > 0) {
      reasons.push(
        `Enemy comp is ${Math.round(context.enemyField.magicShare * 100)}% AP by threat, so MR is worth stacking.`
      );
    } else if (item.features.hasGrievousWounds) {
      reasons.push("Enemy sustain is climbing, so anti-heal has real value.");
    }
  }

  if (!lowSignal && (breakdown.topThreatBonus >= 2.5 || item.features.hasStasis) && topThreat) {
    const threatType = topThreat.damage.physical >= topThreat.damage.magic ? "physical" : "magic";
    reasons.push(
      `${topThreat.championName} is the biggest current threat at ${topThreat.kills}/${topThreat.deaths}/${topThreat.assists}, and this item helps into ${threatType} burst.`
    );
  }

  if (breakdown.progressionBonus >= 2.4) {
    reasons.push("You already own part of the build path, so this is a clean tempo continuation.");
  }

  if (breakdown.affordabilityBonus >= 3.5) {
    reasons.push(`You are only ${Math.max(0, Math.round(context.needs.gold ? Math.max(0, item.gold.total - context.needs.gold) : 0))}g away from the full item.`);
  }

  if (item.features.isBoots && breakdown.bootsModifier > 3) {
    if (lowerName.includes("steelcaps")) {
      reasons.push("Boot slot is open and Steelcaps are the cleanest cheap answer to the AD pressure.");
    } else if (lowerName.includes("mercury")) {
      reasons.push("Boot slot is open and Mercs smooth out the AP pressure.");
    } else {
      reasons.push("Boot slot is still open, so this is a low-friction tempo spike.");
    }
  }

  if (reasons.length === 0) {
    reasons.push("Solid hybrid of stat efficiency and current-game fit.");
  }

  return reasons.slice(0, 3);
}

function buildReplacementRecommendation(self, scoredItems, itemMap, staticData, context) {
  const ownedCompleted = self.items
    .map((itemId) => itemMap[itemId])
    .filter((item) => item && isCompletedInventoryItem(item))
    .map((item) => ({
      itemId: item.id,
      name: item.name,
      stats: item.stats,
      imageUrl: `https://ddragon.leagueoflegends.com/cdn/${staticData.version}/img/item/${item.image.full}`,
      totalGold: Number(item.gold.total || 0),
      totalScore: scoreItem(item, context).totalScore,
      isBoots: item.features.isBoots
    }))
    .sort((left, right) => left.totalScore - right.totalScore);

  const replaceable = ownedCompleted.filter((item) => !item.isBoots);
  const currentItem = replaceable[0] || ownedCompleted[0] || null;
  if (!currentItem) {
    return null;
  }

  const candidate = scoredItems.find((item) => item.itemId !== currentItem.itemId && !self.items.includes(item.itemId)) || null;
  if (!candidate) {
    return null;
  }

  const scoreGain = candidate.totalScore - currentItem.totalScore;
  return {
    active: true,
    sell: {
      itemId: currentItem.itemId,
      name: currentItem.name,
      imageUrl: currentItem.imageUrl,
      totalScore: currentItem.totalScore
    },
    buy: candidate,
    scoreGain,
    reasons: [
      `Your six slots are already filled, so this is a swap call rather than a next-slot buy.`,
      `${candidate.name} currently scores ${scoreGain >= 0 ? "+" : ""}${scoreGain.toFixed(1)} better than ${currentItem.name} in this game state.`,
      ...candidate.reasons.slice(0, 2)
    ].slice(0, 3)
  };
}

async function analyzeGame(rawGame, staticData) {
  const players = (rawGame.allPlayers || []).map((player) => normalizePlayer(player, staticData.champions));
  const selfName = rawGame.activePlayer?.summonerName || players[0]?.name;
  const self = players.find((player) => player.name === selfName) || players[0];
  if (!self) {
    throw new Error("Could not identify the active player from Live Client Data.");
  }

  const enemies = players.filter((player) => player.team !== self.team);
  const enemyField = summariseEnemyField(enemies, staticData.items);
  const gameMinutes = Math.max(1, Number(rawGame.gameData?.gameTime || 0) / 60);
  const phase = deriveBuildPhase(self.level, gameMinutes);
  const liveSignal = computeLiveSignal(players, enemies, enemyField, staticData.items, gameMinutes);
  const needs = classifyNeeds(self, rawGame.activePlayer || {}, enemyField, gameMinutes, liveSignal);
  const ownedIds = new Set(self.items);
  const hasBoots = ownsBoots(self, staticData.items);
  const ownedBoot = findOwnedBoot(self, staticData.items);
  const fullBuild = hasFullCompletedBuild(self, staticData.items);
  const buildSlotItemIds = getBuildSlotItemIds(self.items, staticData.items);
  const prefersMagic =
    self.archetype === "mage" || self.archetype === "ap-assassin" || self.archetype === "enchanter";
  let externalBuild = null;
  let providerError = null;

  try {
    externalBuild = await loadMobalyticsBuild(self, staticData);
  } catch (error) {
    providerError = error.message;
  }

  const baselinePoolIds = unique([...(externalBuild?.coreIds || []), ...(externalBuild?.fullBuildIds || [])]).filter(
    (itemId) => staticData.items[itemId] && !staticData.items[itemId].features.isBoots
  );
  const situationalPoolIds = unique(externalBuild?.situationalIds || []).filter(
    (itemId) => staticData.items[itemId] && !staticData.items[itemId].features.isBoots
  );
  const preferredPoolIds =
    liveSignal >= 0.35
      ? situationalPoolIds.length
        ? situationalPoolIds
        : baselinePoolIds
      : baselinePoolIds.length
        ? baselinePoolIds
        : situationalPoolIds;
  const fallbackPoolIds = unique(Object.keys(staticData.items).filter((itemId) => !staticData.items[itemId].features.isBoots));
  const candidatePoolIds = preferredPoolIds.length ? preferredPoolIds : fallbackPoolIds;

  const scoredItems = candidatePoolIds
    .map((itemId) => staticData.items[itemId])
    .filter((item) => item && !isExcludedItem(item, self.archetype))
    .map((item) =>
      scoreItem(item, {
        self,
        ownedIds,
        enemyField,
        needs,
        gameMinutes,
        phase,
        liveSignal,
        hasBoots,
        prefersMagic,
        version: staticData.version
      })
    )
    .sort((left, right) => right.totalScore - left.totalScore);

  const bootPoolIds = unique(externalBuild?.bootIds || []).filter((itemId) => staticData.items[itemId]);
  const scoredBoots = !hasBoots
    ? bootPoolIds
        .map((itemId) => staticData.items[itemId])
        .filter((item) => item && !isExcludedItem(item, self.archetype))
        .map((item) =>
          scoreItem(item, {
            self,
            ownedIds,
            enemyField,
            needs,
            gameMinutes,
            phase,
            liveSignal,
            hasBoots,
            prefersMagic,
            version: staticData.version
          })
        )
        .sort((left, right) => right.totalScore - left.totalScore)
    : [];
  const bestBoot = !hasBoots ? scoredBoots[0] || null : null;
  const recommendations = scoredItems
    .filter((result) => !result.isBoots)
    .filter((result) => result.totalScore > 7)
    .slice(0, 6);
  const replacement =
    fullBuild
      ? buildReplacementRecommendation(self, scoredItems.filter((result) => !result.isBoots), staticData.items, staticData, {
          self,
          ownedIds,
          enemyField,
          needs,
          gameMinutes,
          phase,
          liveSignal,
          hasBoots,
          prefersMagic,
          version: staticData.version
        })
      : null;

  const topThreatShare = enemyField.topThreat
    ? enemyField.topThreat.threatScore / enemyField.totalThreat
    : 0;

  return {
    patch: staticData.version,
    gameActive: true,
    game: {
      mode: rawGame.gameData?.gameMode || "CLASSIC",
      seconds: Number(rawGame.gameData?.gameTime || 0),
      minutes: gameMinutes,
      phase,
      liveSignal
    },
    player: {
      summonerName: self.name,
      championName: self.championName,
      archetype: self.archetype,
      gold: needs.gold,
      level: self.level,
      fullBuild,
      armor: needs.armor,
      mr: needs.mr,
      health: needs.health,
      items: buildSlotItemIds.map((itemId) => {
        const item = staticData.items[itemId];
        return item
          ? {
              id: itemId,
              name: item.name,
              imageUrl: `https://ddragon.leagueoflegends.com/cdn/${staticData.version}/img/item/${item.image.full}`
            }
          : null;
      }).filter(Boolean)
    },
    enemyTeam: {
      adShare: enemyField.physicalShare,
      apShare: enemyField.magicShare,
      healingPressure: clamp(enemyField.healingPressure, 0, 1.2),
      topThreat: liveSignal >= 0.35 && enemyField.topThreat
        ? {
            championName: enemyField.topThreat.championName,
            score: enemyField.topThreat.threatScore,
            kills: enemyField.topThreat.kills,
            deaths: enemyField.topThreat.deaths,
            assists: enemyField.topThreat.assists,
            cs: enemyField.topThreat.cs,
            threatShare: topThreatShare,
            damageProfile: enemyField.topThreat.damage
          }
        : null
    },
    needs: {
      armorNeed: needs.armorNeed,
      mrNeed: needs.mrNeed,
      healthNeed: needs.healthNeed,
      damageNeed: needs.damageNeed,
      defenseNeed: needs.defenseNeed
    },
    meta: {
      modelSummary:
        liveSignal >= 0.35
          ? "Mobalytics situational-item pool + live enemy threat + live damage mix + your current stats."
          : "Mobalytics core/full build pool + your current level, gold, and build state.",
      source: buildMetaSource(self),
      pool: liveSignal >= 0.35 ? "situational" : "baseline",
      providerStatus: externalBuild ? "ok" : "fallback",
      providerError
    },
    boots: hasBoots
      ? {
          state: "owned",
          current: {
            id: ownedBoot.id,
            name: ownedBoot.name,
            imageUrl: `https://ddragon.leagueoflegends.com/cdn/${staticData.version}/img/item/${ownedBoot.image.full}`
          }
        }
      : bestBoot
        ? {
            state: "recommended",
            recommendation: bestBoot
          }
        : {
            state: "none"
          },
    replacement,
    recommendations
  };
}

function serveStatic(res, fileName) {
  const filePath = path.join(PUBLIC_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(fileName);
  const contentType =
    ext === ".css"
      ? "text/css; charset=utf-8"
      : ext === ".js"
        ? "application/javascript; charset=utf-8"
        : "text/html; charset=utf-8";

  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

async function handleApiState(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const forceMock = url.searchParams.get("mock") === "1";

  try {
    const staticData = await loadStaticData();
    let rawGame = null;
    let source = "live";

    if (forceMock) {
      rawGame = getMockGameData();
      source = "mock";
    } else {
      try {
        rawGame = await getLiveGameData();
      } catch (error) {
        sendJson(res, 200, {
          ok: false,
          gameActive: false,
          source: "live",
          patch: staticData.version,
          error: "League Live Client API was not reachable on https://127.0.0.1:2999. Start a game, then refresh.",
          details: error.message
        });
        return;
      }
    }

    const analysis = await analyzeGame(rawGame, staticData);
    sendJson(res, 200, {
      ok: true,
      source,
      ...analysis
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error.message
    });
  }
}

function createServer() {
  return http.createServer(async (req, res) => {
    if (req.url.startsWith("/api/state")) {
      await handleApiState(req, res);
      return;
    }

    const staticFile = STATIC_FILES[req.url];
    if (staticFile) {
      serveStatic(res, staticFile);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });
}

function startServer(port = PORT) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      console.log(`LoL sidecar PoC listening on http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

module.exports = {
  startServer,
  createServer,
  analyzeGame,
  loadStaticData,
  getMockGameData
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
