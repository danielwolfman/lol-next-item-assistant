const refreshBtn = document.getElementById("refresh-btn");
const statusText = document.getElementById("status-text");
const statusDetail = document.getElementById("status-detail");
const statusCard = document.getElementById("status-card");
const summaryGrid = document.getElementById("summary-grid");
const recommendationsSection = document.getElementById("recommendations-section");
const recommendationGrid = document.getElementById("recommendation-grid");
const bootsCard = document.getElementById("boots-card");
const bootsState = document.getElementById("boots-state");
const bootsBody = document.getElementById("boots-body");
const replacementCard = document.getElementById("replacement-card");
const replacementState = document.getElementById("replacement-state");
const replacementBody = document.getElementById("replacement-body");
const premadeSection = document.getElementById("premade-section");
const premadeGrid = document.getElementById("premade-grid");
const playerHeading = document.getElementById("player-heading");
const playerStats = document.getElementById("player-stats");
const playerItems = document.getElementById("player-items");
const adBar = document.getElementById("ad-bar");
const apBar = document.getElementById("ap-bar");
const adShare = document.getElementById("ad-share");
const apShare = document.getElementById("ap-share");
const enemyExtra = document.getElementById("enemy-extra");
const threatHeading = document.getElementById("threat-heading");
const threatStats = document.getElementById("threat-stats");
const threatDamage = document.getElementById("threat-damage");
const metaLine = document.getElementById("meta-line");
const metaSource = document.getElementById("meta-source");

let refreshTimer = null;
const openPremadeCards = new Set();

function formatGold(value) {
  return `${Math.round(value)}g`;
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function formatGameTime(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function setStatus(title, detail, ok = true) {
  statusText.textContent = title;
  statusDetail.textContent = detail;
  statusCard.classList.toggle("error", !ok);
}

function renderItems(items) {
  playerItems.innerHTML = "";
  items.forEach((item) => {
    const img = document.createElement("img");
    img.src = item.imageUrl;
    img.alt = item.name;
    img.title = item.name;
    playerItems.appendChild(img);
  });
}

function buildRecommendationCard(rec, index) {
  const card = document.createElement("article");
  card.className = "panel recommendation-card";
  const missingGoldLine = rec.goldKnown === false ? "Unknown from live feed" : formatGold(rec.missingGold);

  const tone = index === 0 ? "best" : index === 1 ? "good" : "situational";
  card.innerHTML = `
    <div class="item-header">
      <div class="item-rank item-rank-${tone}">#${index + 1}</div>
      <img class="item-icon" src="${rec.imageUrl}" alt="${rec.name}" />
      <div>
        <h3>${rec.name}</h3>
        <p class="muted">Score ${rec.totalScore.toFixed(1)} • ${formatGold(rec.totalGold)} total</p>
      </div>
    </div>
    <div class="card-body">
      <div class="card-metric-row">
        <span>Missing gold</span>
        <strong>${missingGoldLine}</strong>
      </div>
      <div class="card-metric-row">
        <span>Key stats</span>
        <strong>${renderStatLine(rec.stats)}</strong>
      </div>
      <div class="reason-list">
        ${rec.reasons.map((reason) => `<p>${reason}</p>`).join("")}
      </div>
    </div>
  `;

  return card;
}

function buildBootCard(boots) {
  const card = document.createElement("div");
  card.className = "boot-card";

  if (boots.state === "owned" && boots.current) {
    card.innerHTML = `
      <div class="item-header">
        <img class="item-icon" src="${boots.current.imageUrl}" alt="${boots.current.name}" />
        <div>
          <h3>${boots.current.name}</h3>
          <p class="muted">Boot slot already filled</p>
        </div>
      </div>
      <div class="reason-list">
        <p>You already own completed boots, so the main item list now focuses on non-boot upgrades.</p>
      </div>
    `;
    return card;
  }

  if (boots.state === "recommended" && boots.recommendation) {
    const rec = boots.recommendation;
    card.innerHTML = `
      <div class="item-header">
        <img class="item-icon" src="${rec.imageUrl}" alt="${rec.name}" />
        <div>
          <h3>${rec.name}</h3>
          <p class="muted">Score ${rec.totalScore.toFixed(1)} • ${formatGold(rec.totalGold)} total</p>
        </div>
      </div>
      <div class="card-body">
        <div class="card-metric-row">
          <span>Missing gold</span>
          <strong>${formatGold(rec.missingGold)}</strong>
        </div>
        <div class="card-metric-row">
          <span>Key stats</span>
          <strong>${renderStatLine(rec.stats)}</strong>
        </div>
        <div class="reason-list">
          ${rec.reasons.map((reason) => `<p>${reason}</p>`).join("")}
        </div>
      </div>
    `;
    return card;
  }

  card.innerHTML = `
    <div class="reason-list">
      <p>No strong boot recommendation yet.</p>
    </div>
  `;
  return card;
}

function buildReplacementCard(replacement) {
  const card = document.createElement("div");
  card.className = "replacement-body-grid";
  const missingGoldLine = replacement.buy.goldKnown === false ? "Unknown from live feed" : formatGold(replacement.buy.missingGold);
  card.innerHTML = `
    <div class="swap-columns">
      <div class="swap-item">
        <p class="panel-label">Sell</p>
        <div class="item-header">
          <img class="item-icon" src="${replacement.sell.imageUrl}" alt="${replacement.sell.name}" />
          <div>
            <h3>${replacement.sell.name}</h3>
            <p class="muted">Current score ${replacement.sell.totalScore.toFixed(1)}</p>
          </div>
        </div>
      </div>
      <div class="swap-arrow">→</div>
      <div class="swap-item">
        <p class="panel-label">Buy</p>
        <div class="item-header">
          <img class="item-icon" src="${replacement.buy.imageUrl}" alt="${replacement.buy.name}" />
          <div>
            <h3>${replacement.buy.name}</h3>
            <p class="muted">Score ${replacement.buy.totalScore.toFixed(1)} • ${formatGold(replacement.buy.totalGold)} total</p>
          </div>
        </div>
      </div>
    </div>
    <div class="card-body">
      <div class="card-metric-row">
        <span>Net score shift</span>
        <strong>${replacement.scoreGain >= 0 ? "+" : ""}${replacement.scoreGain.toFixed(1)}</strong>
      </div>
      <div class="card-metric-row">
        <span>Missing gold</span>
        <strong>${missingGoldLine}</strong>
      </div>
      <div class="reason-list">
        ${replacement.reasons.map((reason) => `<p>${reason}</p>`).join("")}
      </div>
    </div>
  `;
  return card;
}

function renderStatLine(stats) {
  const parts = [];
  if (stats.ap) parts.push(`+${Math.round(stats.ap)} AP`);
  if (stats.ad) parts.push(`+${Math.round(stats.ad)} AD`);
  if (stats.armor) parts.push(`+${Math.round(stats.armor)} Armor`);
  if (stats.mr) parts.push(`+${Math.round(stats.mr)} MR`);
  if (stats.health) parts.push(`+${Math.round(stats.health)} HP`);
  if (stats.attackSpeed) parts.push(`+${Math.round(stats.attackSpeed)}% AS`);
  if (stats.crit) parts.push(`+${Math.round(stats.crit)}% Crit`);
  if (parts.length === 0) {
    return "utility / passive-heavy";
  }
  return parts.slice(0, 3).join(" • ");
}

function renderBoots(boots) {
  bootsCard.classList.remove("hidden");
  bootsBody.innerHTML = "";

  if (boots.state === "owned") {
    bootsState.textContent = "Completed";
  } else if (boots.state === "recommended") {
    bootsState.textContent = "Open slot";
  } else {
    bootsState.textContent = "No call";
  }

  bootsBody.appendChild(buildBootCard(boots));
}

function renderReplacement(payload) {
  replacementBody.innerHTML = "";

  if (!payload.player.fullBuild) {
    replacementCard.classList.add("hidden");
    return;
  }

  replacementCard.classList.remove("hidden");

  if (payload.replacement && payload.replacement.active) {
    replacementState.textContent = "Swap available";
    replacementBody.appendChild(buildReplacementCard(payload.replacement));
    return;
  }

  if (payload.replacement && payload.replacement.perfectBuild) {
    replacementState.textContent = "Build stable";
    const stable = document.createElement("div");
    stable.className = "reason-list";
    stable.innerHTML = payload.replacement.reasons.map((reason) => `<p>${reason}</p>`).join("");
    replacementBody.appendChild(stable);
    return;
  }

  replacementState.textContent = "No better swap";
  const empty = document.createElement("div");
  empty.className = "reason-list";
  empty.innerHTML = "<p>All six slots are completed, but there is no stronger situational swap from the current provider pool.</p>";
  replacementBody.appendChild(empty);
}

function getPremadeCardKey(member) {
  return member.partyPuuid || member.matchedSummonerName || member.partyLabel || member.player.summonerName;
}

function buildPremadeCard(member) {
  const details = document.createElement("details");
  details.className = "panel premade-card";
  const cardKey = getPremadeCardKey(member);
  details.dataset.cardKey = cardKey;
  details.open = openPremadeCards.has(cardKey);
  details.addEventListener("toggle", () => {
    if (details.open) {
      openPremadeCards.add(cardKey);
      return;
    }
    openPremadeCards.delete(cardKey);
  });

  const itemStrip = member.player.items
    .map((item) => `<img src="${item.imageUrl}" alt="${item.name}" title="${item.name}" />`)
    .join("");
  const metaPool = member.meta.pool === "situational" ? "situational items" : "core/full build";
  const bootsMarkup =
    member.boots.state === "recommended" && member.boots.recommendation
      ? `<div class="premade-inline-card">
          <p class="panel-label">Boots</p>
          <div class="item-header">
            <img class="item-icon" src="${member.boots.recommendation.imageUrl}" alt="${member.boots.recommendation.name}" />
            <div>
              <h3>${member.boots.recommendation.name}</h3>
              <p class="muted">Best boot right now</p>
            </div>
          </div>
        </div>`
      : member.boots.state === "owned" && member.boots.current
        ? `<div class="premade-inline-card">
            <p class="panel-label">Boots</p>
            <div class="item-header">
              <img class="item-icon" src="${member.boots.current.imageUrl}" alt="${member.boots.current.name}" />
              <div>
                <h3>${member.boots.current.name}</h3>
                <p class="muted">Boot slot completed</p>
              </div>
            </div>
          </div>`
        : "";
  const replacementMarkup =
    member.player.fullBuild && member.replacement?.active
      ? `<div class="premade-inline-card">
          <p class="panel-label">Swap</p>
          <p><strong>${member.replacement.sell.name}</strong> → <strong>${member.replacement.buy.name}</strong></p>
          <p class="muted">Score shift ${member.replacement.scoreGain >= 0 ? "+" : ""}${member.replacement.scoreGain.toFixed(1)}</p>
        </div>`
      : "";

  details.innerHTML = `
    <summary class="premade-summary">
      <div>
        <p class="panel-label">Premade teammate</p>
        <h3>${member.player.championName} • ${member.player.summonerName}</h3>
        <p class="muted">${member.player.kills}/${member.player.deaths}/${member.player.assists} • ${member.player.cs} CS • Level ${member.player.level}</p>
      </div>
      <div class="premade-summary-side">
        <p class="muted">${member.partyLabel}</p>
        <span class="premade-chevron">+</span>
      </div>
    </summary>
    <div class="premade-body">
      <div class="item-strip">${itemStrip}</div>
      <p class="muted">Model: ${member.meta.modelSummary} Pool: ${metaPool}.</p>
      <p class="muted">Exact current gold is not exposed for teammates by Riot's live feed, so these calls prioritize fit over immediate buy timing.</p>
      <div class="premade-inline-grid">
        ${bootsMarkup}
        ${replacementMarkup}
      </div>
      <div class="premade-recommendation-grid"></div>
    </div>
  `;

  const grid = details.querySelector(".premade-recommendation-grid");
  member.recommendations.forEach((rec, index) => {
    grid.appendChild(buildRecommendationCard(rec, index));
  });
  return details;
}

function renderPremades(payload) {
  premadeGrid.innerHTML = "";

  if (!payload.premades || !payload.premades.detected || !payload.premades.members.length) {
    premadeSection.classList.add("hidden");
    openPremadeCards.clear();
    return;
  }

  premadeSection.classList.remove("hidden");
  const activeKeys = new Set(payload.premades.members.map((member) => getPremadeCardKey(member)));
  for (const key of [...openPremadeCards]) {
    if (!activeKeys.has(key)) {
      openPremadeCards.delete(key);
    }
  }
  payload.premades.members.forEach((member) => {
    premadeGrid.appendChild(buildPremadeCard(member));
  });
}

function renderState(payload) {
  setStatus(
    `Live feed connected on patch ${payload.patch}.`,
    `Game time ${formatGameTime(payload.game.seconds)} • ${Math.round(payload.player.gold)} current gold`
  );

  summaryGrid.classList.remove("hidden");
  recommendationsSection.classList.remove("hidden");

  playerHeading.textContent = `${payload.player.championName} • ${payload.player.summonerName}`;
  playerStats.textContent = `Archetype: ${payload.player.archetype} • Level ${payload.player.level} • Armor ${Math.round(payload.player.armor)} • MR ${Math.round(payload.player.mr)}`;
  renderItems(payload.player.items);

  adBar.style.width = formatPercent(payload.enemyTeam.adShare);
  apBar.style.width = formatPercent(payload.enemyTeam.apShare);
  adShare.textContent = formatPercent(payload.enemyTeam.adShare);
  apShare.textContent = formatPercent(payload.enemyTeam.apShare);
  enemyExtra.textContent = `Healing pressure ${formatPercent(payload.enemyTeam.healingPressure / 1.2)}`;

  if (payload.enemyTeam.topThreat) {
    const threat = payload.enemyTeam.topThreat;
    threatHeading.textContent = threat.championName;
    threatStats.textContent = `${threat.kills}/${threat.deaths}/${threat.assists} • ${threat.cs} CS • ${formatPercent(threat.threatShare)} of enemy threat`;
    threatDamage.textContent = `Damage leaning ${formatPercent(threat.damageProfile.physical)} AD / ${formatPercent(threat.damageProfile.magic)} AP`;
  } else {
    threatHeading.textContent = "No threat detected";
    threatStats.textContent = "-";
    threatDamage.textContent = "-";
  }

  const poolLabel = payload.meta.pool === "situational" ? "situational items" : "core/full build";
  metaLine.textContent = `Model: ${payload.meta.modelSummary} Pool: ${poolLabel}.`;
  metaSource.textContent = "";
  const sourcePrefix = document.createTextNode("Meta reference: ");
  const sourceLink = document.createElement("a");
  sourceLink.href = payload.meta.source.url;
  sourceLink.target = "_blank";
  sourceLink.rel = "noreferrer";
  sourceLink.textContent = `${payload.meta.source.provider} ${payload.meta.source.label}`;
  metaSource.appendChild(sourcePrefix);
  metaSource.appendChild(sourceLink);
  if (payload.meta.source.note) {
    metaSource.appendChild(document.createTextNode(` (${payload.meta.source.note})`));
  }
  if (payload.meta.providerStatus === "fallback" && payload.meta.providerError) {
    metaSource.appendChild(document.createTextNode(` Fallback active: ${payload.meta.providerError}`));
  }

  renderBoots(payload.boots);
  renderReplacement(payload);
  renderPremades(payload);

  recommendationGrid.innerHTML = "";
  payload.recommendations.forEach((rec, index) => {
    recommendationGrid.appendChild(buildRecommendationCard(rec, index));
  });
}

async function loadState() {
  try {
    const response = await fetch("/api/state");
    const payload = await response.json();

    if (!payload.ok) {
      recommendationsSection.classList.add("hidden");
      summaryGrid.classList.add("hidden");
      bootsCard.classList.add("hidden");
      replacementCard.classList.add("hidden");
      premadeSection.classList.add("hidden");
      metaLine.textContent = "";
      metaSource.textContent = "";
      setStatus("Live feed unavailable.", payload.error || "Unknown error", false);
      return;
    }

    renderState(payload);
  } catch (error) {
    recommendationsSection.classList.add("hidden");
    summaryGrid.classList.add("hidden");
    bootsCard.classList.add("hidden");
    replacementCard.classList.add("hidden");
    premadeSection.classList.add("hidden");
    metaLine.textContent = "";
    metaSource.textContent = "";
    setStatus("Request failed.", error.message, false);
  }
}

function startPolling() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  refreshTimer = setInterval(() => {
    loadState();
  }, 4000);
}

refreshBtn.addEventListener("click", () => loadState());

loadState();
startPolling();
