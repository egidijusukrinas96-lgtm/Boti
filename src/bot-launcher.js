let botTimer = null;
let botEndsAt = 0;
let botRunning = false;
let botCapital = 0;

function openBot() {
  if (document.querySelector('#botModal')) return;
  const modal = document.createElement('div');
  modal.id = 'botModal';
  modal.innerHTML = `<div class="bot-overlay"><div class="bot-card"><div class="bot-label">ADRENALINE BOT</div><h2>EXTREME FINANCIAL SURVIVAL</h2><p>24-hour game challenge. This mode uses a virtual game balance only. It never trades, burns, confiscates or transfers your real XRP.</p><label>VIRTUAL STARTING CAPITAL</label><input id="botCapital" type="number" min="1" step="1" value="100" inputmode="decimal"><div class="bot-actions"><button id="botLaunch">⚡ LAUNCH 24H BOT</button><button id="botClose" class="ghost">CANCEL</button></div><div id="botStatus" class="bot-status">READY · SIMULATION ONLY</div></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector('#botClose')?.addEventListener('click', () => { clearInterval(botTimer); modal.remove(); });
  modal.querySelector('#botLaunch')?.addEventListener('click', startBot);
}

function startBot() {
  botCapital = Number(document.querySelector('#botCapital')?.value || 0);
  if (!Number.isFinite(botCapital) || botCapital <= 0) {
    const status = document.querySelector('#botStatus');
    if (status) status.textContent = 'ENTER A VALID VIRTUAL CAPITAL';
    return;
  }
  botRunning = true;
  botEndsAt = Date.now() + 24 * 60 * 60 * 1000;
  const launch = document.querySelector('#botLaunch');
  if (launch) launch.disabled = true;
  clearInterval(botTimer);
  tickBot();
  botTimer = setInterval(tickBot, 1000);
}

function tickBot() {
  const status = document.querySelector('#botStatus');
  if (!botRunning || !status) return;
  const remaining = Math.max(0, botEndsAt - Date.now());
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const simulatedPnl = botCapital * 0.08 * Math.sin((Date.now() / 60000) % (Math.PI * 2));
  const equity = botCapital + simulatedPnl;
  status.innerHTML = `RUNNING · ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}<br>Virtual equity: ${equity.toFixed(2)} · P/L: ${simulatedPnl >= 0 ? '+' : ''}${simulatedPnl.toFixed(2)}<br><small>SIMULATION ONLY · REAL XRP UNTOUCHED</small>`;
  if (remaining === 0) finishBot(equity);
}

function finishBot(equity) {
  botRunning = false;
  clearInterval(botTimer);
  const status = document.querySelector('#botStatus');
  if (!status) return;
  status.innerHTML = equity > botCapital
    ? `🏆 VICTORY · Virtual capital: ${equity.toFixed(2)}<br><small>GAME RESULT ONLY — NO REAL FUNDS MOVED</small>`
    : `☠ DEATH · Virtual capital: ${equity.toFixed(2)}<br><small>GAME RESULT ONLY — NO REAL FUNDS DESTROYED</small>`;
  const launch = document.querySelector('#botLaunch');
  if (launch) { launch.disabled = false; launch.textContent = '↻ RESTART 24H BOT'; }
}

window.addEventListener('adrenaline:open-bot', openBot);
