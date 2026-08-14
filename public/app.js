const fmt = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 });
const fmtPct = (n) => `${Number(n).toFixed(1)}%`;
const ils = (n) => `₪${fmt.format(Math.round(Number(n) || 0))}`;

let state = {
  meta: null,
  channels: [],
};

// ---------- עזרים כלליים ----------
async function api(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'שגיאה לא צפויה' }));
    throw new Error(err.error || 'שגיאה לא צפויה');
  }
  return res.status === 204 ? null : res.json();
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

function activeChannels() {
  return state.channels.filter((c) => c.active === 'כן' || c.active === true);
}

// ---------- ניווט טאבים ----------
document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
});

// ============================================================
// לוח בקרה
// ============================================================
async function loadDashboard(month) {
  const dash = await api(`/dashboard${month ? `?month=${month}` : ''}`);
  renderMonthSelect(dash);
  renderCompleteness(dash.completeness);
  renderTotals(dash.totals);
  renderDashboardTable(dash.channels);
  await renderHistoryChart();
}

function renderMonthSelect(dash) {
  const sel = document.getElementById('dashMonthSelect');
  const months = new Set(dash.availableMonths || []);
  months.add(dash.month);
  const sorted = [...months].sort();
  sel.innerHTML = sorted.map((m) => `<option value="${m}">${m}</option>`).join('');
  sel.value = dash.month;
}

function renderCompleteness(c) {
  const el = document.getElementById('completenessBanner');
  if (c.complete) {
    el.className = 'banner show ok';
    el.textContent = `✔ מילאת נתונים לכל ${c.total} האפיקים עבור חודש ${c.month}.`;
  } else {
    el.className = 'banner show warn';
    el.textContent = `⚠ חסרה יתרה לחודש ${c.month} עבור: ${c.missing.map((m) => m.name).join(', ')} (${c.filledCount}/${c.total} מולאו). עדכן בטאב "יתרות חודשיות".`;
  }
}

function renderTotals(t) {
  const el = document.getElementById('totalsCards');
  const cards = [
    { label: 'סה"כ הפקדות', value: ils(t.totalDeposits) },
    { label: 'יתרה כוללת (ברוטו)', value: ils(t.currentBalance) },
    { label: 'רווח כולל', value: ils(t.grossGain) },
    { label: 'מס משוער', value: ils(t.tax) },
    { label: 'יתרה כוללת אחרי מס', value: ils(t.netAfterTax) },
    { label: 'עלות דמי ניהול שנתית משוערת', value: ils(t.feeAccumAnnualCost) },
  ];
  el.innerHTML = cards
    .map((c) => `<div class="stat-card"><div class="label">${c.label}</div><div class="value">${c.value}</div></div>`)
    .join('');
}

function renderDashboardTable(items) {
  const tbody = document.querySelector('#dashboardTable tbody');
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="8">אין אפיקים פעילים. הוסף אפיק בטאב "אפיקי חיסכון".</td></tr>`;
    return;
  }
  tbody.innerHTML = items
    .map((it) => {
      const gainClass = it.grossGain >= 0 ? 'gain-pos' : 'gain-neg';
      const balanceNote = it.balanceMonth
        ? it.balanceIsExactMonth
          ? ''
          : ` (יתרה אחרונה שדווחה: ${it.balanceMonth})`
        : ' (לא הוזנה יתרה)';
      return `<tr>
        <td>${it.name}</td>
        <td>${it.type}</td>
        <td>${ils(it.totalDeposits)}</td>
        <td>${ils(it.currentBalance)}${balanceNote}</td>
        <td class="${gainClass}">${ils(it.grossGain)}</td>
        <td>${it.taxable ? ils(it.tax) : 'פטור'}</td>
        <td>${ils(it.netAfterTax)}</td>
        <td>${ils(it.feeAccumAnnualCost)} (${fmtPct(it.feeAccumPct)})</td>
      </tr>`;
    })
    .join('');
}

let historyChart = null;
async function renderHistoryChart() {
  const history = await api('/history');
  const ctx = document.getElementById('historyChart');
  const labels = history.map((h) => h.month);
  const gross = history.map((h) => h.totals.currentBalance);
  const net = history.map((h) => h.totals.netAfterTax);
  if (historyChart) historyChart.destroy();
  historyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'יתרה ברוטו', data: gross, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', tension: 0.25, fill: true },
        { label: 'יתרה אחרי מס', data: net, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.1)', tension: 0.25, fill: true },
      ],
    },
    options: {
      responsive: true,
      scales: { y: { ticks: { callback: (v) => ils(v) } } },
      plugins: { legend: { position: 'bottom' } },
    },
  });
}

document.getElementById('dashMonthSelect').addEventListener('change', (e) => loadDashboard(e.target.value));

document.getElementById('saveTaxRateBtn').addEventListener('click', async () => {
  const taxRate = document.getElementById('taxRateInput').value;
  await api('/settings', { method: 'PUT', body: JSON.stringify({ taxRate }) });
  toast('שיעור המס עודכן');
  await loadDashboard(document.getElementById('dashMonthSelect').value);
});

// ============================================================
// אפיקים
// ============================================================
async function loadChannels() {
  state.channels = await api('/channels');
  renderChannelsTable();
  fillChannelSelects();
}

function renderChannelsTable() {
  const tbody = document.querySelector('#channelsTable tbody');
  const list = activeChannels();
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7">אין אפיקים עדיין.</td></tr>`;
    return;
  }
  tbody.innerHTML = list
    .map(
      (c) => `<tr>
        <td>${c.name}</td>
        <td>${c.type}</td>
        <td>${fmtPct(c.feeDepositPct)}</td>
        <td>${fmtPct(c.feeAccumPct)}</td>
        <td>${c.taxable}</td>
        <td>${c.notes || ''}</td>
        <td><button class="link-btn" data-del-channel="${c.id}">מחיקה</button></td>
      </tr>`
    )
    .join('');
}

function fillChannelSelects() {
  const list = activeChannels();
  const opts = list.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  document.getElementById('depChannel').innerHTML = opts;
}

document.getElementById('channelForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    name: document.getElementById('chName').value,
    type: document.getElementById('chType').value,
    feeDepositPct: document.getElementById('chFeeDeposit').value || 0,
    feeAccumPct: document.getElementById('chFeeAccum').value || 0,
    taxable: document.getElementById('chTaxable').checked,
    notes: document.getElementById('chNotes').value,
  };
  await api('/channels', { method: 'POST', body: JSON.stringify(body) });
  e.target.reset();
  document.getElementById('chTaxable').checked = true;
  toast('האפיק נוסף בהצלחה');
  await loadChannels();
  await loadBalanceFormRows();
});

document.querySelector('#channelsTable tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-del-channel]');
  if (!btn) return;
  if (!confirm('להסיר אפיק זה? ההיסטוריה שלו תישמר בקובץ אך הוא לא יופיע יותר ברשימות.')) return;
  await api(`/channels/${btn.dataset.delChannel}`, { method: 'DELETE' });
  toast('האפיק הוסר');
  await loadChannels();
  await loadBalanceFormRows();
});

// ============================================================
// הפקדות
// ============================================================
async function loadDeposits() {
  const deposits = await api('/deposits');
  const byId = Object.fromEntries(state.channels.map((c) => [String(c.id), c.name]));
  const tbody = document.querySelector('#depositsTable tbody');
  if (!deposits.length) {
    tbody.innerHTML = `<tr><td colspan="5">אין הפקדות רשומות עדיין.</td></tr>`;
    return;
  }
  tbody.innerHTML = deposits
    .map(
      (d) => `<tr>
        <td>${d.date}</td>
        <td>${byId[String(d.channelId)] || '—'}</td>
        <td>${ils(d.amount)}</td>
        <td>${d.notes || ''}</td>
        <td><button class="link-btn" data-del-deposit="${d.id}">מחיקה</button></td>
      </tr>`
    )
    .join('');
}

document.getElementById('depositForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    channelId: document.getElementById('depChannel').value,
    date: document.getElementById('depDate').value,
    amount: document.getElementById('depAmount').value,
    notes: document.getElementById('depNotes').value,
  };
  await api('/deposits', { method: 'POST', body: JSON.stringify(body) });
  e.target.reset();
  toast('ההפקדה נרשמה');
  await loadDeposits();
  await loadDashboard(document.getElementById('dashMonthSelect').value);
});

document.querySelector('#depositsTable tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-del-deposit]');
  if (!btn) return;
  if (!confirm('למחוק הפקדה זו?')) return;
  await api(`/deposits/${btn.dataset.delDeposit}`, { method: 'DELETE' });
  toast('ההפקדה נמחקה');
  await loadDeposits();
  await loadDashboard(document.getElementById('dashMonthSelect').value);
});

// ============================================================
// יתרות חודשיות
// ============================================================
async function loadBalanceFormRows() {
  const month = document.getElementById('balMonthInput').value;
  const balances = month ? await api('/balances') : [];
  const forMonth = Object.fromEntries(
    balances.filter((b) => b.month === month).map((b) => [String(b.channelId), b.balance])
  );
  const tbody = document.querySelector('#balancesFormTable tbody');
  const list = activeChannels();
  tbody.innerHTML = list
    .map(
      (c) => `<tr>
        <td>${c.name}</td>
        <td><input type="number" step="0.01" min="0" data-balance-input="${c.id}" value="${forMonth[c.id] ?? ''}" placeholder="יתרה נוכחית" /></td>
      </tr>`
    )
    .join('');
}

document.getElementById('loadBalancesBtn').addEventListener('click', loadBalanceFormRows);

document.getElementById('balancesForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const month = document.getElementById('balMonthInput').value;
  if (!month) return toast('יש לבחור חודש');
  const inputs = document.querySelectorAll('[data-balance-input]');
  const entries = [...inputs]
    .map((inp) => ({ channelId: inp.dataset.balanceInput, balance: inp.value }))
    .filter((en) => en.balance !== '');
  if (!entries.length) return toast('לא הוזנו יתרות');
  await api('/balances/bulk', { method: 'POST', body: JSON.stringify({ month, entries }) });
  toast('היתרות נשמרו');
  await loadBalancesHistory();
  await loadDashboard(month);
  document.getElementById('dashMonthSelect').value = month;
});

async function loadBalancesHistory() {
  const balances = await api('/balances');
  const byId = Object.fromEntries(state.channels.map((c) => [String(c.id), c.name]));
  const tbody = document.querySelector('#balancesTable tbody');
  if (!balances.length) {
    tbody.innerHTML = `<tr><td colspan="5">אין יתרות רשומות עדיין.</td></tr>`;
    return;
  }
  tbody.innerHTML = balances
    .map(
      (b) => `<tr>
        <td>${b.month}</td>
        <td>${byId[String(b.channelId)] || '—'}</td>
        <td>${ils(b.balance)}</td>
        <td>${b.updatedAt || ''}</td>
        <td><button class="link-btn" data-del-balance="${b.id}">מחיקה</button></td>
      </tr>`
    )
    .join('');
}

document.querySelector('#balancesTable tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-del-balance]');
  if (!btn) return;
  if (!confirm('למחוק רשומת יתרה זו?')) return;
  await api(`/balances/${btn.dataset.delBalance}`, { method: 'DELETE' });
  toast('הרשומה נמחקה');
  await loadBalancesHistory();
  await loadDashboard(document.getElementById('dashMonthSelect').value);
});

// ============================================================
// אתחול
// ============================================================
async function init() {
  state.meta = await api('/meta');
  document.getElementById('taxRateInput').value = state.meta.taxRate;
  document.getElementById('chType').innerHTML = state.meta.channelTypes.map((t) => `<option value="${t}">${t}</option>`).join('');
  document.getElementById('depDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('balMonthInput').value = state.meta.currentMonth;

  await loadChannels();
  await loadDeposits();
  await loadBalanceFormRows();
  await loadBalancesHistory();
  await loadDashboard(state.meta.currentMonth);
}

init().catch((err) => {
  console.error(err);
  toast(`שגיאה בטעינה: ${err.message}`);
});
