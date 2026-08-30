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

const ESI_BASE = "https://esi.evetech.net";
const ESI_COMPATIBILITY_DATE = "2025-09-30";
const state = { mode: "safer", blockedSystems: ["Tama"], suggestions: [], activeSuggestion: 0, searchTimer: null, searchController: null, liveRoute: null, routeLoading: false, routeError: "" };
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

async function searchSolarSystems(query, strict, signal) {
  const searchUrl = new URL(`${ESI_BASE}/search`);
  searchUrl.search = new URLSearchParams({ categories: "solar_system", search: query, strict: String(strict), compatibility_date: ESI_COMPATIBILITY_DATE }).toString();
  const searchResponse = await fetch(searchUrl, { signal });
  if (!searchResponse.ok) throw new Error("ESI system search failed");
  const matches = await searchResponse.json();
  const ids = (matches.solar_system || []).slice(0, 20);
  if (!ids.length) return [];
  const namesResponse = await fetch(`${ESI_BASE}/universe/names?compatibility_date=${ESI_COMPATIBILITY_DATE}`, {
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

async function resolveExactSystem(name) {
  const systems = await searchSolarSystems(name.trim(), true);
  return systems.find((system) => system.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());
}

async function loadLiveRoute(mode = state.mode) {
  const originName = $("#origin").value.trim();
  const destinationName = $("#destination").value.trim();
  if (!originName || !destinationName) return;
  state.routeLoading = true;
  state.routeError = "";
  $("#results").classList.add("loading");
  $(".analyze").textContent = "◎ Loading ESI route…";
  try {
    const [origin, destination, ...blockedMatches] = await Promise.all([
      resolveExactSystem(originName), resolveExactSystem(destinationName), ...state.blockedSystems.map(resolveExactSystem)
    ]);
    if (!origin) throw new Error(`Origin system “${originName}” was not found.`);
    if (!destination) throw new Error(`Destination system “${destinationName}” was not found.`);
    const avoid = blockedMatches.filter(Boolean).map((system) => system.id);
    const preference = mode === "shortest" ? "Shorter" : "Safer";
    const routeResponse = await fetch(`${ESI_BASE}/route/${origin.id}/${destination.id}?compatibility_date=${ESI_COMPATIBILITY_DATE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preference, security_penalty: preference === "Safer" ? 100 : 50, avoid })
    });
    if (!routeResponse.ok) throw new Error(`ESI route calculation failed (${routeResponse.status}).`);
    const routeIds = await routeResponse.json();
    const namesResponse = await fetch(`${ESI_BASE}/universe/names?compatibility_date=${ESI_COMPATIBILITY_DATE}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(routeIds)
    });
    if (!namesResponse.ok) throw new Error("ESI route-name lookup failed.");
    const names = await namesResponse.json();
    const namesById = new Map(names.map((item) => [item.id, item.name]));
    const security = await Promise.all(routeIds.map(async (id) => {
      const response = await fetch(`${ESI_BASE}/universe/systems/${id}?compatibility_date=${ESI_COMPATIBILITY_DATE}`);
      if (!response.ok) return 0;
      const system = await response.json();
      return system.security_status || 0;
    }));
    const blockedIds = new Set(avoid);
    const systems = routeIds.map((id, index) => {
      const value = security[index];
      return {
        id, name: namesById.get(id) || `System ${id}`, security: value.toFixed(1),
        danger: value < 0.5 ? "critical" : value < 0.6 ? "high" : value < 0.8 ? "medium" : "low",
        blocked: blockedIds.has(id)
      };
    });
    state.liveRoute = { origin: origin.name, destination: destination.name, preference, jumps: Math.max(0, systems.length - 1), systems, blockedOnRoute: systems.filter((system) => system.blocked).map((system) => system.name) };
    $("#origin").value = origin.name;
    $("#destination").value = destination.name;
  } catch (error) {
    state.liveRoute = null;
    state.routeError = error.message || "ESI route calculation failed.";
  } finally {
    state.routeLoading = false;
    $("#results").classList.remove("loading");
    $(".analyze").textContent = "◎ Analyze route";
    render();
  }
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
  state.blockedSystems = next;
  state.liveRoute = null;
  input.value = "";
  state.suggestions = [];
  renderSuggestions();
  showSearchStatus("");
  $("#block-error").hidden = true;
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
  state.liveRoute = null;
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
  const displayedSystems = state.liveRoute ? state.liveRoute.systems : data.route.systems;
  const displayedJumps = state.liveRoute ? state.liveRoute.jumps : data.route.jumps;
  const displayedEta = state.liveRoute ? `${Math.max(1, Math.ceil(displayedJumps * .75))}–${Math.max(2, Math.ceil(displayedJumps * 1.15))} min` : data.route.eta;
  $("#origin-title").textContent = origin;
  $("#destination-title").textContent = destination;
  $("#cargo-display").textContent = formatIsk(data.cargo);
  $("#jumps").textContent = `${displayedJumps} jumps`;
  $("#eta").textContent = displayedEta;
  $("#route-label").textContent = state.liveRoute ? `ESI ${state.liveRoute.preference.toLowerCase()}` : data.route.label;
  $("#excluded-count").textContent = state.blockedSystems.length ? `${state.blockedSystems.length} excluded` : "";
  $("#exclude-tags").innerHTML = state.blockedSystems.map((name) => `<button class="exclude-chip" type="button" data-remove-system="${escapeHtml(name)}">${escapeHtml(name)} ×</button>`).join("");
  $$("[data-remove-system]").forEach((button) => button.addEventListener("click", () => removeBlockedSystem(button.dataset.removeSystem)));
  $$(".priority").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });

  $("#route-map").innerHTML = displayedSystems.map((system, index) => `
    <div class="route-stop${system.blocked ? " blocked" : ""}">
      <div class="node ${system.danger}">${system.blocked || system.danger === "high" || system.danger === "critical" ? "!" : index === 0 ? "S" : index}</div>
      <div class="system-copy"><small>${index === 0 ? "Start" : `Jump ${index}`}</small><strong>${escapeHtml(system.name)}</strong><span>${system.security} sec</span></div>
      <b class="route-security ${system.danger}">${system.blocked ? "Blocked" : system.danger}</b>
    </div>`).join("");

  $("#route-warning").innerHTML = state.routeError
    ? `<span class="warning-icon">▲</span>${escapeHtml(state.routeError)}`
    : state.liveRoute && state.liveRoute.blockedOnRoute.length
      ? `<span class="warning-icon">▲</span>ESI returned a route containing ${escapeHtml(state.liveRoute.blockedOnRoute.join(", "))}. Review the route before undocking.`
      : state.liveRoute
        ? `<span class="warning-icon safe">✓</span>Complete ESI route loaded: all ${state.liveRoute.systems.length} systems are shown and your blocked systems were excluded.`
        : `<span class="warning-icon">▲</span>Demonstration route shown. Analyze to load every jump from ESI.`;

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
  $("#compare-route").textContent = mode === "shortest" ? "⌁ Compare safer route" : "⌁ Compare shortest route";

  $("#factors-panel").innerHTML = `<div class="factor-grid">
    ${factor("◇", "Security status", data.route.factors.security, 28, mode === "shortest" ? "Route includes 0.3 low-sec systems." : "Route remains in high security space.", mode === "shortest" ? "critical" : "low")}
    ${factor("◎", "Danger activity", data.route.factors.activity, 23, mode === "shortest" ? "Tama receives a strong activity penalty." : "Uedama receives an elevated warning.", mode === "shortest" ? "critical" : "medium")}
    ${factor("⌖", "Chokepoints", data.route.factors.chokepoint, 16, "Known pipeline systems raise the route baseline.", mode === "shortest" ? "critical" : "medium")}
    ${factor("◈", "Value exposed", data.cargoValue, 18, `${formatIsk(data.cargo)} makes the trip ${data.cargoValue >= 10 ? "more attractive" : "less attractive"} to attackers.`, data.cargoValue >= 10 ? "high" : "low")}
    ${factor("▰", "Ship vulnerability", data.ship.vulnerability, 14, data.ship.note, data.ship.vulnerability >= 10 ? "high" : "low")}
    ${factor("◷", "Route exposure", data.route.factors.exposure, 10, `${displayedJumps} gates create ${mode === "safer" ? "more encounters, but favor safer space" : "a shorter exposure window"}.`, "medium")}
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
  state.liveRoute = null;
  $$(".priority").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  render();
  void loadLiveRoute(mode);
}

$("#route-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void loadLiveRoute();
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
$("#compare-route").addEventListener("click", () => { const alternate = state.mode === "shortest" ? "safer" : "shortest"; setMode(alternate); });
$$([".tab"].join(",")).forEach((button) => button.addEventListener("click", () => {
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  $("#factors-panel").classList.toggle("hidden", button.dataset.tab !== "factors");
  $("#formula-panel").classList.toggle("hidden", button.dataset.tab !== "formula");
}));

render();
void loadLiveRoute();
