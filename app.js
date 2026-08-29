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

const state = { mode: "shortest" };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

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
  $("#compare-route").textContent = mode === "shortest" ? "⌁ Compare safer route" : "⌁ Compare shortest route";

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
$$([".priority"].join(",")).forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
$("#compare-route").addEventListener("click", () => setMode(state.mode === "shortest" ? "safer" : "shortest"));
$$([".tab"].join(",")).forEach((button) => button.addEventListener("click", () => {
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  $("#factors-panel").classList.toggle("hidden", button.dataset.tab !== "factors");
  $("#formula-panel").classList.toggle("hidden", button.dataset.tab !== "formula");
}));

render();
