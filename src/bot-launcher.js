let botTimer = null;
let botEndsAt = 0;
let botRunning = false;

function mountBotButton() {
  const actions = document.querySelector('.quick-actions');
  if (!actions || document.querySelector('#botStart')) return;
  const button = document.createElement('button');
  button.id = 'botStart';
  button.textContent = '⚡ START BOT';
  button.addEventListener('click', openBot);
  actions.appendChild(button);
}

function openBot() {
  if (document.querySelector('#botModal')) return;
  const modal = document.createElement('div');
  modal.id = 'botModal';
  modal.innerHTML = `
    <div class="bot-overlay">
      <div class="bot-card">
        <div class="bot-label">ADRENALINE BOT</div>
        <h2>EXTREME FINANCIAL SURVIVAL</h2>
        <p>24-hour game challenge. This mode uses a virtual game balance only. It never trades, burns, confiscates or transfers your real XRP.</p>
        <label>VIRTUAL STARTING CAPITAL</label>
        <input id="botCapital" type="number" min="1" step="1" value="100" inputmode="decimal">
        <div class="bot-actions">
          <button id="botLaunch">⚡ LAUNCH 24H BOT</button>
          <button id="botClose" class="ghost">CANCEL</button>
        </div>
        <div id="botStatus" class="bot-status">READY · SIMULATION ONLY</div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.querySelector('#botClose').addEventListener('click', () => modal.remove());
  document.querySelector('#botLaunch').addEventListener('click', startBot);
}

function startBot() {
  const capital = Number(document.querySelector('#botCapital')?.value || 0);
  if (!Number.isFinite(capital) || capital <= 0) {
    document.querySelector('#botStatus').textContent = 'ENTER A VALID VIRTUAL CAPITAL';
    return;
  }
  botRunning = true;
  botEndsAt = Date.now() + 24 * 60 * 60 * 1000;
  const status = document.querySelector('#botStatus');
  const launch = document.querySelector('#botLaunch');
  if (launch) launch.disabled = true;
  tickBot(status, capital);
  clearInterval(botTimer);
  botTimer = setInterval(() => tickBot(status, capital), 1000);
}

function tickBot(status, capital) {
  if (!botRunning || !status) return;
  const remaining = Math.max(0, botEndsAt - Date.now());
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const simulatedPnl = capital * 0.08 * Math.sin((Date.now() / 60000) % (Math.PI * 2));
  const equity = capital + simulatedPnl;
  status.innerHTML = `RUNNING · ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}<br>Virtual equity: ${equity.toFixed(2)} · P/L: ${simulatedPnl >= 0 ? '+' : ''}${simulatedPnl.toFixed(2)}<br><small>SIMULATION ONLY · REAL XRP UNTOUCHED</small>`;
  if (remaining === 0) finishBot(capital, equity, status);
}

function finishBot(capital, equity, status) {
  botRunning = false;
  clearInterval(botTimer);
  const victory = equity > capital;
  status.innerHTML = victory
    ? `🏆 VICTORY · Virtual capital: ${equity.toFixed(2)}<br><small>GAME RESULT ONLY — NO REAL FUNDS MOVED</small>`
    : `☠ DEATH · Virtual capital: ${equity.toFixed(2)}<br><small>GAME RESULT ONLY — NO REAL FUNDS DESTROYED</small>`;
  const launch = document.querySelector('#botLaunch');
  if (launch) {
    launch.disabled = false;
    launch.textContent = '↻ RESTART 24H BOT';
  }
}

const observer = new MutationObserver(mountBotButton);
observer.observe(document.documentElement, { childList: true, subtree: true });
mountBotButton();
