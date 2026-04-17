const refreshBtn = document.getElementById("refresh-btn");
const statusText = document.getElementById("status-text");
const statusDetail = document.getElementById("status-detail");
const statusCard = document.getElementById("status-card");
const summaryGrid = document.getElementById("summary-grid");
const recommendationsSection = document.getElementById("recommendations-section");
const recommendationGrid = document.getElementById("recommendation-grid");
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

  metaLine.textContent = `Model: ${payload.meta.modelSummary}`;
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
      metaLine.textContent = "";
      metaSource.textContent = "";
      setStatus("Live feed unavailable.", payload.error || "Unknown error", false);
      return;
    }

    renderState(payload);
  } catch (error) {
    recommendationsSection.classList.add("hidden");
    summaryGrid.classList.add("hidden");
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
