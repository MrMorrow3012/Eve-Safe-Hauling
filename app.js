"use strict";

const shipProfiles = {
  iteron: { label: "Iteron Mark V", vulnerability: 14, note: "Large signature and slower alignment increase exposure." },
  sunesis: { label: "Sunesis", vulnerability: 7, note: "A sub-2-second travel fit can sharply reduce catch risk." },
  blockade: { label: "Blockade Runner", vulnerability: 3, note: "Covert travel tools reduce exposure when used correctly." },
  shuttle: { label: "Shuttle", vulnerability: 10, note: "Quick, but fragile and vulnerable to specialized camps." }
};

const routeProfiles = {
  shortest: {
    label: "Shortest route", jumps: 12, eta: "10–14 min",
    systems: [
      { name: "Jita", security: "0.9", danger: "low" },
      { name: "Perimeter", security: "1.0", danger: "low" },
      { name: "Tama", security: "0.3", danger: "critical" },
      { name: "Kedama", security: "0.3", danger: "high" },
      { name: "Dodixie", security: "0.9", danger: "low" }
    ],
    factors: { security: 28, activity: 23, chokepoint: 16, exposure: 6 }
  },
  safer: {
    label: "High-sec detour", jumps: 19, eta: "17–23 min",
    systems: [
      { name: "Jita", security: "0.9", danger: "low" },
      { name: "Perimeter", security: "1.0", danger: "low" },
      { name: "Sivala", security: "0.6", danger: "medium" },
      { name: "Uedama", security: "0.5", danger: "high" },
      { name: "Dodixie", security: "0.9", danger: "low" }
    ],
    factors: { security: 5, activity: 12, chokepoint: 10, exposure: 10 }
  }
};

const state = { mode: "safer", blockedSystems: ["Tama"], suggestions: [], activeSuggestion: 0, searchTimer: null, searchController: null };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function formatIsk(value) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}b ISK`;
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}m ISK`;
  return `${Math.round(value / 1_000)}k ISK`;
}

function cargoPenalty(value) {
  if (value >= 1_000_000_000) return 18;
  if (value >= 500_000_000) return 14;
  if (value >= 100_000_000) return 10;
  if (value >= 25_000_000) return 6;
  return 2;
}

function blockedOnRoute(mode, systems = state.blockedSystems) {
  return routeProfiles[mode].systems
    .map((system) => system.name)
    .filter((systemName) => systems.some((blocked) => blocked.toLowerCase() === systemName.toLowerCase()));
}

async function searchSolarSystems(query, strict, signal) {
  const searchUrl = new URL("https://esi.evetech.net/latest/search/");
  searchUrl.search = new URLSearchParams({ categories: "solar_system", search: query, strict: String(strict), datasource: "tranquility", language: "en" }).toString();
  const searchResponse = await fetch(searchUrl, { signal });
  if (!searchResponse.ok) throw new Error("ESI system search failed");
  const matches = await searchResponse.json();
  const ids = (matches.solar_system || []).slice(0, 20);
  if (!ids.length) return [];
  const namesResponse = await fetch("https://esi.evetech.net/latest/universe/names/?datasource=tranquility", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ids), signal
  });
  if (!namesResponse.ok) throw new Error("ESI name lookup failed");
  const systems = await namesResponse.json();
  const normalized = query.toLocaleLowerCase();
  return systems.filter((item) => item.category === "solar_system").sort((a, b) => {
    const aName = a.name.toLocaleLowerCase();
    const bName = b.name.toLocaleLowerCase();
    const aRank = aName === normalized ? 0 : aName.startsWith(normalized) ? 1 : 2;
    const bRank = bName === normalized ? 0 : bName.startsWith(normalized) ? 1 : 2;
    return aRank - bRank || a.name.localeCompare(b.name);
  });
}

function showSearchStatus(message, isError = false) {
  const status = $("#search-status");
  status.textContent = message;
  status.classList.toggle("error", isError);
  status.hidden = !message;
}

function renderSuggestions() {
  const list = $("#system-suggestions");
  list.innerHTML = state.suggestions.map((system, index) =>
    `<button id="system-option-${system.id}" class="system-suggestion${index === state.activeSuggestion ? " active" : ""}" type="button" role="option" aria-selected="${index === state.activeSuggestion}" data-system-name="${escapeHtml(system.name)}"><span>${escapeHtml(system.name)}</span><small>Solar system</small></button>`
  ).join("");
  list.hidden = !state.suggestions.length;
  $("#block-input").setAttribute("aria-expanded", String(state.suggestions.length > 0));
  if (state.suggestions[state.activeSuggestion]) $("#block-input").setAttribute("aria-activedescendant", `system-option-${state.suggestions[state.activeSuggestion].id}`);
  else $("#block-input").removeAttribute("aria-activedescendant");
  $$('[data-system-name]').forEach((button, index) => {
    button.addEventListener("mouseenter", () => {
      if (state.activeSuggestion !== index) { state.activeSuggestion = index; renderSuggestions(); }
    });
    button.addEventListener("click", () => addBlockedSystem(button.dataset.systemName));
  });
}

function queueSystemSearch() {
  const query = $("#block-input").value.trim();
  window.clearTimeout(state.searchTimer);
  if (state.searchController) state.searchController.abort();
  state.suggestions = [];
  state.activeSuggestion = 0;
  renderSuggestions();
  $("#block-error").hidden = true;
  if (!query) { showSearchStatus(""); return; }
  if (query.length < 3) { showSearchStatus("Type at least 3 characters to search ESI."); return; }
  showSearchStatus("Searching EVE systems…");
  state.searchController = new AbortController();
  state.searchTimer = window.setTimeout(async () => {
    try {
      const systems = await searchSolarSystems(query, false, state.searchController.signal);
      state.suggestions = systems.filter((item) => !state.blockedSystems.some((blocked) => blocked.toLocaleLowerCase() === item.name.toLocaleLowerCase())).slice(0, 8);
      state.activeSuggestion = 0;
      renderSuggestions();
      showSearchStatus(state.suggestions.length ? "" : "No matching unblocked solar systems.");
    } catch (error) {
      if (error.name !== "AbortError") showSearchStatus("ESI search is unavailable. Try again.", true);
    }
  }, 280);
}

function addBlockedSystem(name) {
  const input = $("#block-input");
  const canonicalName = String(name || "").trim();
  if (!canonicalName) return;
  if (state.blockedSystems.some((blocked) => blocked.toLocaleLowerCase() === canonicalName.toLocaleLowerCase())) {
    input.value = "";
    state.suggestions = [];
    renderSuggestions();
    showSearchStatus("");
    return;
  }
  const next = [...state.blockedSystems, canonicalName];
  const everyDemoRouteBlocked = blockedOnRoute("shortest", next).length > 0 && blockedOnRoute("safer", next).length > 0;
  state.blockedSystems = next;
  input.value = "";
  state.suggestions = [];
  renderSuggestions();
  showSearchStatus("");
  $("#block-error").textContent = everyDemoRouteBlocked ? "Every demonstration route now contains a blocked system. Live routing would need to find another path." : "";
  $("#block-error").hidden = !everyDemoRouteBlocked;
  const alternate = state.mode === "shortest" ? "safer" : "shortest";
  if (blockedOnRoute(state.mode).length && !blockedOnRoute(alternate).length) state.mode = alternate;
  render();
}

async function confirmBlockedSystem() {
  const query = $("#block-input").value.trim();
  if (!query) return;
  if (state.suggestions[state.activeSuggestion]) {
    addBlockedSystem(state.suggestions[state.activeSuggestion].name);
    return;
  }
  showSearchStatus("Checking system name with ESI…");
  $("#block-error").hidden = true;
  try {
    const systems = await searchSolarSystems(query, true);
    const exact = systems.find((item) => item.name.toLocaleLowerCase() === query.toLocaleLowerCase());
    if (!exact) {
      showSearchStatus("");
      $("#block-error").textContent = "Choose a valid solar system from the ESI results.";
      $("#block-error").hidden = false;
      return;
    }
    addBlockedSystem(exact.name);
  } catch {
    showSearchStatus("");
    $("#block-error").textContent = "EVE's system search is unavailable right now. Please try again.";
    $("#block-error").hidden = false;
  }
}

function removeBlockedSystem(name) {
  state.blockedSystems = state.blockedSystems.filter((blocked) => blocked !== name);
  $("#block-error").hidden = true;
  render();
}

function calculate() {
  const route = routeProfiles[state.mode];
  const ship = shipProfiles[$("#ship").value];
  const cargo = Math.max(0, Number($("#cargo").value) || 0);
  const cargoValue = cargoPenalty(cargo);
  const total = Math.min(100, route.factors.security + route.factors.activity + route.factors.chokepoint + route.factors.exposure + cargoValue + ship.vulnerability);
  const level = total >= 70 ? "HIGH" : total >= 40 ? "ELEVATED" : "LOW";
  return { route, ship, cargo, cargoValue, total, level };
}

function factor(icon, title, score, max, copy, severity) {
  return `<div class="factor"><div class="factor-icon ${severity}">${icon}</div><div class="factor-body"><div class="factor-top"><strong>${title}</strong><span class="factor-score">+${score}<span>/${max}</span></span></div><p>${copy}</p></div></div>`;
}

function render() {
  const data = calculate();
  const mode = state.mode;
  const origin = $("#origin").value.trim() || "Unknown";
  const destination = $("#destination").value.trim() || "Unknown";
  $("#origin-title").textContent = origin;
  $("#destination-title").textContent = destination;
  $("#cargo-display").textContent = formatIsk(data.cargo);
  $("#jumps").textContent = `${data.route.jumps} jumps`;
  $("#eta").textContent = data.route.eta;
  $("#route-label").textContent = data.route.label;
  $("#excluded-count").textContent = state.blockedSystems.length ? `${state.blockedSystems.length} excluded` : "";
  $("#exclude-tags").innerHTML = state.blockedSystems.map((name) => `<button class="exclude-chip" type="button" data-remove-system="${escapeHtml(name)}">${escapeHtml(name)} ×</button>`).join("");
  $$("[data-remove-system]").forEach((button) => button.addEventListener("click", () => removeBlockedSystem(button.dataset.removeSystem)));
  $$(".priority").forEach((button) => {
    const blocked = blockedOnRoute(button.dataset.mode);
    button.disabled = blocked.length > 0;
    button.title = blocked.length ? `Blocked by ${blocked.join(", ")}` : "";
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });

  $("#route-map").innerHTML = data.route.systems.map((system, index) => `
    <div class="route-stop">
      <div class="node ${system.danger}">${system.danger === "high" || system.danger === "critical" ? "!" : index + 1}</div>
      <div class="system-copy"><strong>${system.name}</strong><span>${system.security} sec</span></div>
    </div>`).join("");

  $("#route-warning").innerHTML = mode === "shortest"
    ? `<span class="warning-icon">▲</span>This route enters low security space through Tama. The time saved does not justify the added risk for this cargo profile.`
    : `<span class="warning-icon safe">✓</span>This route avoids low security space, but Uedama still requires attention because high-sec does not mean risk-free.`;

  const riskCard = $("#risk-card");
  riskCard.className = `risk-card ${data.level.toLowerCase()}`;
  $("#risk-level").textContent = data.level;
  $("#risk-score").textContent = data.total;
  $("#decision-score").textContent = data.total;
  $("#risk-meter").style.width = `${data.total}%`;
  $("#risk-copy").textContent = data.level === "HIGH"
    ? "Do not undock on autopilot. Change the route or reduce what is exposed."
    : data.level === "ELEVATED"
      ? "Travel is possible with preparation, but one or more systems need caution."
      : "No major route warning is present in this demonstration profile.";
  const alternate = mode === "shortest" ? "safer" : "shortest";
  const alternateBlocked = blockedOnRoute(alternate);
  $("#compare-route").disabled = alternateBlocked.length > 0;
  $("#compare-route").textContent = alternateBlocked.length
    ? `⌁ ${alternate === "safer" ? "Safer" : "Shortest"} route blocked by ${alternateBlocked.join(", ")}`
    : mode === "shortest" ? "⌁ Compare safer route" : "⌁ Compare shortest route";

  $("#factors-panel").innerHTML = `<div class="factor-grid">
    ${factor("◇", "Security status", data.route.factors.security, 28, mode === "shortest" ? "Route includes 0.3 low-sec systems." : "Route remains in high security space.", mode === "shortest" ? "critical" : "low")}
    ${factor("◎", "Danger activity", data.route.factors.activity, 23, mode === "shortest" ? "Tama receives a strong activity penalty." : "Uedama receives an elevated warning.", mode === "shortest" ? "critical" : "medium")}
    ${factor("⌖", "Chokepoints", data.route.factors.chokepoint, 16, "Known pipeline systems raise the route baseline.", mode === "shortest" ? "critical" : "medium")}
    ${factor("◈", "Value exposed", data.cargoValue, 18, `${formatIsk(data.cargo)} makes the trip ${data.cargoValue >= 10 ? "more attractive" : "less attractive"} to attackers.`, data.cargoValue >= 10 ? "high" : "low")}
    ${factor("▰", "Ship vulnerability", data.ship.vulnerability, 14, data.ship.note, data.ship.vulnerability >= 10 ? "high" : "low")}
    ${factor("◷", "Route exposure", data.route.factors.exposure, 10, `${data.route.jumps} gates create ${mode === "safer" ? "more encounters, but avoid low-sec" : "a shorter exposure window"}.`, "medium")}
  </div>`;

  const formulaItems = [
    ["Security", data.route.factors.security], ["Activity", data.route.factors.activity],
    ["Chokepoints", data.route.factors.chokepoint], ["Cargo", data.cargoValue],
    ["Ship", data.ship.vulnerability], ["Exposure", data.route.factors.exposure]
  ];
  $("#formula-panel").innerHTML = `<div class="formula">${formulaItems.map(([label, score], index) => `<div class="formula-piece"><span>${label}</span><strong>${score}</strong></div>${index < formulaItems.length - 1 ? '<b class="formula-plus">+</b>' : ""}`).join("")}<b class="formula-plus">=</b><div class="formula-piece total"><span>Total</span><strong>${data.total}</strong></div></div><p class="formula-note">Every point is attributable. Later live-data work will replace the demonstration activity values while preserving this explanation layer.</p>`;

  const briefing = [
    mode === "shortest" ? "Switch to the high-sec detour." : "Keep the route set to high security.",
    "Avoid autopilot: warp gate to gate manually.",
    data.cargo >= 100_000_000 ? "Consider splitting this cargo into smaller trips." : "Cargo exposure is within the lower demo band.",
    $("#ship").value === "sunesis" ? "Confirm the travel fit aligns in under two seconds." : "Review align time, tank, and escape options."
  ];
  $("#briefing-list").innerHTML = briefing.map((item) => `<li><span class="check">✓</span>${item}</li>`).join("");
}

function setMode(mode) {
  state.mode = mode;
  $$(".priority").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  render();
}

$("#route-form").addEventListener("submit", (event) => {
  event.preventDefault();
  $("#results").classList.add("loading");
  window.setTimeout(() => { render(); $("#results").classList.remove("loading"); }, 220);
});
$$(["#origin", "#destination", "#cargo", "#ship"].join(",")).forEach((control) => control.addEventListener("change", render));
$("#cargo").addEventListener("input", () => $("#cargo-display").textContent = formatIsk(Math.max(0, Number($("#cargo").value) || 0)));
$("#block-add").addEventListener("click", () => { void confirmBlockedSystem(); });
$("#block-input").addEventListener("input", queueSystemSearch);
$("#block-input").addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" && state.suggestions.length) {
    event.preventDefault(); state.activeSuggestion = (state.activeSuggestion + 1) % state.suggestions.length; renderSuggestions();
  } else if (event.key === "ArrowUp" && state.suggestions.length) {
    event.preventDefault(); state.activeSuggestion = state.activeSuggestion === 0 ? state.suggestions.length - 1 : state.activeSuggestion - 1; renderSuggestions();
  } else if (event.key === "Enter") {
    event.preventDefault(); void confirmBlockedSystem();
  } else if (event.key === "Escape") {
    state.suggestions = []; renderSuggestions();
  }
});
$$([".priority"].join(",")).forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
$("#compare-route").addEventListener("click", () => { const alternate = state.mode === "shortest" ? "safer" : "shortest"; if (!blockedOnRoute(alternate).length) setMode(alternate); });
$$([".tab"].join(",")).forEach((button) => button.addEventListener("click", () => {
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  $("#factors-panel").classList.toggle("hidden", button.dataset.tab !== "factors");
  $("#formula-panel").classList.toggle("hidden", button.dataset.tab !== "formula");
}));

render();
