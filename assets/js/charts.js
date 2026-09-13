import { fmtMoney, fmtPct, fmtDate } from "./utils.js";

const Chart = window.Chart;

let crosshairRegistered = false;
function registerCrosshair() {
  if (crosshairRegistered || !Chart) return;
  crosshairRegistered = true;
  Chart.register({
    id: "crosshairLine",
    afterDraw(chart) {
      if (chart.tooltip?._active?.length) {
        const x = chart.tooltip._active[0].element.x;
        const { top, bottom } = chart.chartArea;
        const ctx = chart.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.lineWidth = 1;
        ctx.strokeStyle = getCssVar("--chart-crosshair") || "#68736E";
        ctx.stroke();
        ctx.restore();
      }
    },
  });
}

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function baseFont() {
  return { family: "'Assistant','Noto Sans Hebrew',system-ui,sans-serif", size: 12 };
}

function gridColor() {
  return getCssVar("--chart-grid") || "rgba(104,115,110,0.15)";
}
function textColor() {
  return getCssVar("--text-muted") || "#68736E";
}

export function destroyChart(canvas) {
  if (canvas.__chart) {
    canvas.__chart.destroy();
    canvas.__chart = null;
  }
}

export function createValueVsContributionsChart(canvas, { labels, values, contributions, currency = "ILS", positiveColor, dateLabels }) {
  registerCrosshair();
  destroyChart(canvas);
  const posColor = positiveColor || getCssVar("--brand-primary") || "#245E48";
  const contribColor = getCssVar("--text-muted") || "#9BA69F";

  canvas.__chart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "שווי התיק",
          data: values,
          borderColor: posColor,
          backgroundColor: hexToRgba(posColor, 0.12),
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 5,
          borderWidth: 2.5,
        },
        {
          label: "הפקדות נטו",
          data: contributions,
          borderColor: contribColor,
          borderDash: [5, 4],
          backgroundColor: "transparent",
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 1.8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true, position: "bottom", labels: { color: textColor(), font: baseFont(), usePointStyle: true, boxWidth: 8 } },
        tooltip: {
          rtl: true,
          textAlign: "right",
          callbacks: {
            title(items) {
              const i = items[0].dataIndex;
              return dateLabels ? dateLabels[i] : items[0].label;
            },
            label(item) {
              const v = item.raw;
              return `${item.dataset.label}: ${fmtMoney(v, currency)}`;
            },
            afterBody(items) {
              const i = items[0].dataIndex;
              const value = values[i], contrib = contributions[i];
              const gain = value - contrib;
              const ret = Math.abs(contrib) < 1 ? null : (gain / contrib) * 100;
              const lines = [`רווח: ${fmtMoney(gain, currency)}`];
              if (ret != null) lines.push(`תשואה: ${fmtPct(ret)}`);
              return lines;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor(), font: baseFont(), maxRotation: 0, autoSkip: true } },
        y: {
          grid: { color: gridColor() },
          ticks: { color: textColor(), font: baseFont(), callback: (v) => fmtCompactAxis(v, currency) },
        },
      },
    },
  });
  return canvas.__chart;
}

function fmtCompactAxis(v, currency) {
  const abs = Math.abs(v);
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : "₪";
  if (abs >= 1000000) return `${sym}${(v / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${sym}${Math.round(v / 1000)}K`;
  return `${sym}${Math.round(v)}`;
}

function hexToRgba(hex, alpha) {
  if (!hex || hex[0] !== "#") return hex;
  const h = hex.slice(1);
  const bigint = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function createBarChart(canvas, { labels, values, currency = "ILS", positiveColor, negativeColor, valueFormatter, dateLabels }) {
  destroyChart(canvas);
  const pos = positiveColor || getCssVar("--positive") || "#23845B";
  const neg = negativeColor || getCssVar("--negative") || "#B94A4A";
  const colors = values.map((v) => (v >= 0 ? pos : neg));
  const fmt = valueFormatter || ((v) => fmtMoney(v, currency, { forceSign: true }));

  canvas.__chart = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 4, maxBarThickness: 42 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          rtl: true,
          textAlign: "right",
          callbacks: {
            title(items) { const i = items[0].dataIndex; return dateLabels ? dateLabels[i] : items[0].label; },
            label(item) { return fmt(item.raw); },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor(), font: baseFont() } },
        y: { grid: { color: gridColor() }, ticks: { color: textColor(), font: baseFont(), callback: (v) => fmt(v) } },
      },
    },
  });
  return canvas.__chart;
}

export function createDonutChart(canvas, { items, currency = "ILS" }) {
  destroyChart(canvas);
  const total = items.reduce((s, i) => s + i.value, 0);
  canvas.__chart = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels: items.map((i) => i.name),
      datasets: [{ data: items.map((i) => i.value), backgroundColor: items.map((i) => i.color), borderWidth: 2, borderColor: getCssVar("--surface") || "#fff" }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: { display: false },
        tooltip: {
          rtl: true,
          callbacks: {
            label(item) {
              const pct = total ? Math.round((item.raw / total) * 100) : 0;
              return `${item.label}: ${fmtMoney(item.raw, currency)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
  return canvas.__chart;
}

export function createComparisonChart(canvas, { labels, series, normalized, dateLabels }) {
  registerCrosshair();
  destroyChart(canvas);
  canvas.__chart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: series.map((s) => ({
        label: s.name,
        data: s.values,
        borderColor: s.color,
        backgroundColor: "transparent",
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2.2,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true, position: "bottom", labels: { color: textColor(), font: baseFont(), usePointStyle: true, boxWidth: 8 } },
        tooltip: {
          rtl: true,
          callbacks: {
            title(items) { const i = items[0].dataIndex; return dateLabels ? dateLabels[i] : items[0].label; },
            label(item) {
              return normalized ? `${item.dataset.label}: ${item.raw.toFixed(1)}` : `${item.dataset.label}: ${fmtMoney(item.raw)}`;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor(), font: baseFont() } },
        y: { grid: { color: gridColor() }, ticks: { color: textColor(), font: baseFont(), callback: (v) => (normalized ? v : fmtCompactAxis(v, "ILS")) } },
      },
    },
  });
  return canvas.__chart;
}

export function renderHeatmap(container, byYear) {
  const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  const monthNames = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"];
  const years = Array.from(byYear.keys()).sort();
  let allVals = [];
  years.forEach((y) => months.forEach((m) => { const c = byYear.get(y)[m]; if (c && c.returnPct != null) allVals.push(c.returnPct); }));
  const maxAbs = Math.max(...allVals.map((v) => Math.abs(v)), 1);

  let html = `<div class="heatmap"><div class="heatmap-row heatmap-head"><div class="heatmap-cell heatmap-label"></div>${monthNames.map((m) => `<div class="heatmap-cell heatmap-label">${m}</div>`).join("")}</div>`;
  years.forEach((y) => {
    html += `<div class="heatmap-row"><div class="heatmap-cell heatmap-label">${y}</div>`;
    months.forEach((m) => {
      const c = byYear.get(y)[m];
      if (!c || c.returnPct == null) {
        html += `<div class="heatmap-cell heatmap-empty"></div>`;
      } else {
        const intensity = Math.min(Math.abs(c.returnPct) / maxAbs, 1);
        const bg = c.returnPct >= 0 ? `rgba(35,132,91,${0.15 + intensity * 0.65})` : `rgba(185,74,74,${0.15 + intensity * 0.65})`;
        const textCol = intensity > 0.55 ? "#fff" : "var(--text-primary)";
        html += `<div class="heatmap-cell heatmap-value" data-month="${y}-${m}" style="background:${bg};color:${textCol}" title="${monthNames[parseInt(m, 10) - 1]} ${y}: ${c.returnPct.toFixed(1)}%">${c.returnPct.toFixed(1)}%</div>`;
      }
    });
    html += `</div>`;
  });
  html += `</div>`;
  container.innerHTML = html;
}
