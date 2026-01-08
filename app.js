const $ = (id) => document.getElementById(id);

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
};

const todayKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const da = String(d.getDate()).padStart(2,"0");
  return `day:${y}-${m}-${da}`;
};

function defaultRules() {
  return { dailyMaxLoss: -30000, stopLoss: -3000, takeProfit: 10000, maxTrades: 5 };
}

function loadRules() {
  const rules = store.get("rules", defaultRules());
  $("dailyMaxLoss").value = rules.dailyMaxLoss;
  $("stopLoss").value = rules.stopLoss;
  $("takeProfit").value = rules.takeProfit;
  $("maxTrades").value = rules.maxTrades;
  return rules;
}

function saveRules() {
  const rules = {
    dailyMaxLoss: Number($("dailyMaxLoss").value || -30000),
    stopLoss: Number($("stopLoss").value || -3000),
    takeProfit: Number($("takeProfit").value || 10000),
    maxTrades: Number($("maxTrades").value || 5),
  };
  store.set("rules", rules);
  return rules;
}

function loadDay() {
  return store.get(todayKey(), { trades: [] });
}

function saveDay(day) {
  store.set(todayKey(), day);
}

function calcPnL(trade) {
  const entry = Number(trade.entry);
  const exit = Number(trade.exit);
  const qty = Number(trade.qty);
  if (!isFinite(entry) || !isFinite(exit) || !isFinite(qty)) return 0;
  const diff = (trade.side === "LONG") ? (exit - entry) : (entry - exit);
  return Math.round(diff * qty);
}

function computeStats(trades) {
  let pnl = 0;
  let wins = 0, losses = 0;
  let streakLoss = 0;
  for (const t of trades) {
    const p = calcPnL(t);
    pnl += p;
    if (p > 0) { wins++; streakLoss = 0; }
    else if (p < 0) { losses++; streakLoss++; }
  }
  const n = trades.length;
  const winRate = n ? Math.round((wins / n) * 100) : 0;
  const avg = n ? Math.round(pnl / n) : 0;
  return { pnl, n, wins, losses, streakLoss, winRate, avg };
}

function render() {
  const rules = store.get("rules", defaultRules());
  const day = loadDay();
  const stats = computeStats(day.trades);

  $("pnlPill").textContent = `今日の損益：${stats.pnl.toLocaleString()}円`;
  $("pnlPill").className = `pill ${stats.pnl >= 0 ? "ok" : "ng"}`;
  $("countPill").textContent = `回数：${stats.n}/${rules.maxTrades}`;
  $("streakPill").textContent = `連敗：${stats.streakLoss}`;

  $("summary").textContent =
    `勝率 ${stats.winRate}% / 平均 ${stats.avg.toLocaleString()}円 / 勝 ${stats.wins} 負 ${stats.losses}`;

  const tbody = $("table").querySelector("tbody");
  tbody.innerHTML = "";
  day.trades.slice().reverse().forEach((t, idxFromEnd) => {
    const realIdx = day.trades.length - 1 - idxFromEnd;
    const tr = document.createElement("tr");
    const pnl = calcPnL(t);
    tr.innerHTML = `
      <td>${new Date(t.ts).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}</td>
      <td>${escapeHtml(t.symbol || "")}</td>
      <td>${t.side === "LONG" ? "買い" : "売り"}</td>
      <td>${t.entry} → ${t.exit}</td>
      <td>${t.qty}</td>
      <td class="${pnl>=0?"good":"danger"}">${pnl.toLocaleString()}円</td>
      <td>${escapeHtml(t.note||"")}</td>
      <td><button class="secondary" data-del="${realIdx}">削除</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-del"));
      const d = loadDay();
      d.trades.splice(i,1);
      saveDay(d);
      render();
    });
  });
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function preCheck() {
  const rules = store.get("rules", defaultRules());
  const day = loadDay();
  const stats = computeStats(day.trades);

  const reasons = [];

  if (stats.n >= rules.maxTrades) reasons.push(`回数オーバー（${stats.n}/${rules.maxTrades}）`);
  if (stats.pnl <= rules.dailyMaxLoss) reasons.push(`日次最大損失に到達（${stats.pnl} <= ${rules.dailyMaxLoss}）`);
  if (stats.streakLoss >= 2) reasons.push(`連敗中（${stats.streakLoss}連敗）→ 取り返しトレード注意`);

  const msg = reasons.length
    ? `❌ ストップ推奨：${reasons.join(" / ")}`
    : `✅ OK：ルール的には入れる。ただし「根拠」「損切り」「枚数」確認。`;

  $("checkResult").textContent = msg;
  $("checkResult").className = reasons.length ? "danger" : "good";
}

function addTrade() {
  const rules = store.get("rules", defaultRules());
  const day = loadDay();
  const stats = computeStats(day.trades);

  const t = {
    ts: Date.now(),
    symbol: $("symbol").value.trim(),
    side: $("side").value,
    entry: Number($("entry").value),
    exit: Number($("exit").value),
    qty: Number($("qty").value),
    note: $("note").value.trim(),
  };

  if (!t.symbol) return alert("銘柄を入れて");
  if (!isFinite(t.entry) || !isFinite(t.exit) || !isFinite(t.qty)) return alert("価格/枚数が変だよ");
  if (t.qty <= 0) return alert("枚数は1以上");

  // 事前ブレーキ
  if (stats.n >= rules.maxTrades) return alert("今日は回数上限。入るな。");
  if (stats.pnl <= rules.dailyMaxLoss) return alert("日次最大損失到達。入るな。");

  const pnl = calcPnL(t);
  // 目安チェック（強制ではなく警告）
  if (pnl <= rules.stopLoss) {
    if (!confirm(`このトレード損失が損切り目安（${rules.stopLoss}円）以下だよ。追加する？`)) return;
  }
  if (pnl >= rules.takeProfit) {
    if (!confirm(`利確目安（${rules.takeProfit}円）以上だよ。追加する？`)) return;
  }

  day.trades.push(t);
  saveDay(day);

  $("symbol").value = "";
  $("entry").value = "";
  $("exit").value = "";
  $("qty").value = "";
  $("note").value = "";

  render();
}

function resetToday() {
  if (!confirm("今日の履歴を全部消す？")) return;
  saveDay({ trades: [] });
  render();
}

function exportJSON() {
  const day = loadDay();
  const text = JSON.stringify({ date: todayKey(), ...day }, null, 2);
  navigator.clipboard.writeText(text).then(()=>alert("JSONコピーした"));
}
function exportCSV() {
  const day = loadDay();
  const rows = [["ts","symbol","side","entry","exit","qty","pnl","note"]];
  for (const t of day.trades) {
    rows.push([
      new Date(t.ts).toISOString(),
      t.symbol,
      t.side,
      t.entry,
      t.exit,
      t.qty,
      calcPnL(t),
      (t.note||"").replace(/\n/g," ")
    ]);
  }
  const text = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  navigator.clipboard.writeText(text).then(()=>alert("CSVコピーした"));
}

$("saveRules").addEventListener("click", ()=>{ saveRules(); alert("保存した"); render(); });
$("resetToday").addEventListener("click", resetToday);
$("preCheck").addEventListener("click", preCheck);
$("addTrade").addEventListener("click", addTrade);
$("exportJson").addEventListener("click", exportJSON);
$("exportCsv").addEventListener("click", exportCSV);

loadRules();
render();
