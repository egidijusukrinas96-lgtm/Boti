import { Client, Wallet, xrpToDrops, dropsToXrp, TrustSetFlags } from 'xrpl';
import { unlockWallet } from './secure-storage.js';

const MAINNET = 'wss://s1.ripple.com';
const RLUSD = { currency: '524C555344000000000000000000000000000000', issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De' };
let timer = null;
let running = false;
let mode = 'paper';
let capitalXrp = 0;
let maxTradeXrp = 0;
let stopLossPct = 5;
let takeProfitPct = 8;
let entryPct = 0.35;
let intervalMs = 20000;
let startValueXrp = 0;
let wallet = null;
let client = null;
let history = [];
let lastSide = 'FLAT';
let consecutiveErrors = 0;

const esc = (v='') => String(v).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

function openBot() {
  if (document.querySelector('#botModal')) return;
  const modal = document.createElement('div');
  modal.id = 'botModal';
  modal.innerHTML = `<div class="bot-overlay"><div class="bot-card"><div class="bot-label">ADRENALINE BOT</div><h2>24H XRP TRADING BOT</h2><p><b>LIVE MODE trades real XRP on XRPL Mainnet.</b> The bot uses the XRPL DEX and RLUSD. It does not guarantee profit and it never destroys or confiscates funds.</p><div class="bot-mode"><button id="paperMode" class="active">PAPER</button><button id="liveMode">LIVE XRP</button></div><div id="liveWarning" class="warning" style="display:none;margin:10px 0;font-size:12px;line-height:1.5">REAL MONEY: LIVE mode can lose XRP/RLUSD. Activate only money you can afford to lose.</div><label>MAX XRP ALLOCATION</label><input id="botCapital" type="number" min="1" step="0.1" value="10" inputmode="decimal"><label>MAX XRP PER TRADE</label><input id="botTrade" type="number" min="0.1" step="0.1" value="2" inputmode="decimal"><div class="risk-grid"><div><label>STOP LOSS %</label><input id="botStop" type="number" min="0.1" max="50" step="0.1" value="5"></div><div><label>TAKE PROFIT %</label><input id="botTake" type="number" min="0.1" max="100" step="0.1" value="8"></div></div><label>ENTRY THRESHOLD %</label><input id="botEntry" type="number" min="0.05" max="10" step="0.05" value="0.35"><div class="bot-actions"><button id="botTrust" class="ghost" style="display:none">SET RLUSD TRUST LINE</button><button id="botLaunch">⚡ LAUNCH 24H BOT</button><button id="botClose" class="ghost">CANCEL</button></div><div id="botStatus" class="bot-status">READY · PAPER MODE</div></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector('#paperMode').addEventListener('click', () => setMode('paper'));
  modal.querySelector('#liveMode').addEventListener('click', () => setMode('live'));
  modal.querySelector('#botClose').addEventListener('click', closeBot);
  modal.querySelector('#botLaunch').addEventListener('click', startBot);
  modal.querySelector('#botTrust').addEventListener('click', setupTrustline);
}

function setMode(next) {
  mode = next;
  const paper = document.querySelector('#paperMode');
  const live = document.querySelector('#liveMode');
  const warning = document.querySelector('#liveWarning');
  const trust = document.querySelector('#botTrust');
  if (paper) paper.classList.toggle('active', mode === 'paper');
  if (live) live.classList.toggle('active', mode === 'live');
  if (warning) warning.style.display = mode === 'live' ? 'block' : 'none';
  if (trust) trust.style.display = mode === 'live' ? 'block' : 'none';
  setStatus(mode === 'live' ? 'LIVE XRP MODE · RLUSD DEX · READY' : 'READY · PAPER MODE');
}

function readInputs() {
  capitalXrp = Number(document.querySelector('#botCapital')?.value || 0);
  maxTradeXrp = Number(document.querySelector('#botTrade')?.value || 0);
  stopLossPct = Number(document.querySelector('#botStop')?.value || 0);
  takeProfitPct = Number(document.querySelector('#botTake')?.value || 0);
  entryPct = Number(document.querySelector('#botEntry')?.value || 0);
  return Number.isFinite(capitalXrp) && capitalXrp >= 1 && Number.isFinite(maxTradeXrp) && maxTradeXrp > 0 && maxTradeXrp <= capitalXrp && stopLossPct > 0 && takeProfitPct > 0 && entryPct > 0;
}

async function connect() { if (!client) client = new Client(MAINNET); if (!client.isConnected()) await client.connect(); }

async function getBalances() {
  await connect();
  const info = await client.request({command:'account_info', account:wallet.address, ledger_index:'validated'});
  const lines = await client.request({command:'account_lines', account:wallet.address, ledger_index:'validated'});
  const rlusd = (lines.result.lines || []).find(x => x.currency === RLUSD.currency && x.account === RLUSD.issuer);
  return { xrp: Number(dropsToXrp(info.result.account_data.Balance)), rlusd: Number(rlusd?.balance || 0), ownerCount: Number(info.result.account_data.OwnerCount || 0) };
}

async function hasTrustline() {
  const b = await getBalances();
  return b.rlusd !== null && (await client.request({command:'account_lines', account:wallet.address, ledger_index:'validated'})).result.lines?.some(x => x.currency === RLUSD.currency && x.account === RLUSD.issuer);
}

async function setupTrustline() {
  try {
    const stored = await unlockWallet();
    wallet = Wallet.fromSeed(stored.seed, {algorithm:'ecdsa-secp256k1'});
    await connect();
    const exists = await hasTrustline();
    if (exists) return setStatus('RLUSD TRUST LINE ALREADY ACTIVE');
    const ok = confirm('REAL XRPL TRANSACTION\n\nCreate an RLUSD trust line. This increases the account owner reserve by 0.2 XRP while the trust line exists. Continue?');
    if (!ok) return setStatus('TRUST LINE CANCELLED');
    const tx = await client.autofill({TransactionType:'TrustSet', Account:wallet.address, LimitAmount:{currency:RLUSD.currency, issuer:RLUSD.issuer, value:'100000'}});
    const signed = wallet.sign(tx);
    const result = await client.submitAndWait(signed.tx_blob);
    if (result.result?.meta?.TransactionResult !== 'tesSUCCESS') throw new Error(result.result?.meta?.TransactionResult || 'Trust line failed');
    setStatus(`RLUSD TRUST LINE ACTIVE · ${signed.hash}`);
  } catch (e) { setStatus(`TRUST LINE ERROR · ${e.message}`); }
}

async function getPrice() {
  await connect();
  const book = await client.getOrderbook({currency:'XRP'}, {currency:RLUSD.currency, issuer:RLUSD.issuer}, {limit:10, ledger_index:'validated', taker:wallet.address});
  const sells = book.sell || [];
  const buys = book.buy || [];
  if (!sells.length || !buys.length) throw new Error('RLUSD/XRP order book has insufficient liquidity');
  const ask = Number(sells[0].quality || 0);
  const bidQuality = Number(buys[0].quality || 0);
  if (!(ask > 0) || !(bidQuality > 0)) throw new Error('Invalid order book price');
  const bid = 1 / bidQuality;
  const mid = (ask + bid) / 2;
  return {ask, bid, mid};
}

async function submitMarket(side, xrpAmount, price) {
  const rlusdAmount = xrpAmount / price;
  const tx = side === 'BUY_RLUSD'
    ? {TransactionType:'OfferCreate', Account:wallet.address, Flags:131072, TakerGets:xrpToDrops(xrpAmount.toFixed(6)), TakerPays:{currency:RLUSD.currency, issuer:RLUSD.issuer, value:rlusdAmount.toFixed(6)}}
    : {TransactionType:'OfferCreate', Account:wallet.address, Flags:131072, TakerGets:{currency:RLUSD.currency, issuer:RLUSD.issuer, value:rlusdAmount.toFixed(6)}, TakerPays:xrpToDrops(xrpAmount.toFixed(6))};
  const prepared = await client.autofill(tx);
  const signed = wallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);
  const code = result.result?.meta?.TransactionResult;
  if (code !== 'tesSUCCESS') throw new Error(`Trade rejected: ${code || 'unknown'}`);
  return {hash:signed.hash, rlusd:rlusdAmount, xrp:xrpAmount, code};
}

async function cycle() {
  if (!running) return;
  try {
    const price = await getPrice();
    history.push(price.mid); if (history.length > 20) history.shift();
    const sma = history.reduce((a,b)=>a+b,0) / history.length;
    const balances = await getBalances();
    const allocated = Math.min(capitalXrp, Math.max(0, balances.xrp - 1.5));
    const positionValue = balances.rlusd * price.mid;
    const totalValue = balances.xrp + positionValue;
    const pnlPct = startValueXrp > 0 ? ((totalValue - startValueXrp) / startValueXrp) * 100 : 0;
    const launch = document.querySelector('#botLaunch');
    if (pnlPct <= -stopLossPct) { await emergencyExit(price); return; }
    if (pnlPct >= takeProfitPct) { await emergencyExit(price); return; }
    const bullish = price.mid > sma * (1 + entryPct / 100);
    const bearish = price.mid < sma * (1 - entryPct / 100);
    let action = 'HOLD';
    if (mode === 'paper') {
      action = bullish ? 'PAPER BUY SIGNAL' : bearish ? 'PAPER SELL SIGNAL' : 'PAPER HOLD';
    } else if (balances.rlusd <= 0.000001 && bullish && allocated > 0.5) {
      const size = Math.min(maxTradeXrp, allocated);
      const trade = await submitMarket('BUY_RLUSD', size, price.ask);
      lastSide='RLUSD'; action=`BOUGHT ~${trade.rlusd.toFixed(4)} RLUSD`;
    } else if (balances.rlusd > 0.000001 && bearish) {
      const size = Math.min(maxTradeXrp, balances.rlusd * price.bid);
      if (size > 0.2) { const trade = await submitMarket('SELL_RLUSD', size, price.bid); lastSide='XRP'; action=`SOLD ~${trade.rlusd.toFixed(4)} RLUSD`; }
    }
    consecutiveErrors = 0;
    setStatus(`${mode.toUpperCase()} · PRICE ${price.mid.toFixed(6)} RLUSD/XRP · ${action}<br>Equity ${totalValue.toFixed(4)} XRP · P/L ${pnlPct.toFixed(2)}% · ${lastSide}`);
    if (launch) launch.disabled = false;
  } catch (e) {
    consecutiveErrors++;
    setStatus(`BOT ERROR ${consecutiveErrors}/3 · ${esc(e.message)}`);
    if (consecutiveErrors >= 3) stopBot('BOT STOPPED AFTER 3 CONSECUTIVE ERRORS');
  }
}

async function emergencyExit(price) {
  try {
    const balances = await getBalances();
    if (balances.rlusd > 0.000001) await submitMarket('SELL_RLUSD', Math.min(maxTradeXrp, balances.rlusd * price.bid), price.bid);
    stopBot('RISK LIMIT HIT · RLUSD POSITION EXITED WHERE LIQUIDITY ALLOWED');
  } catch (e) { stopBot(`RISK EXIT ERROR · ${e.message}`); }
}

async function startBot() {
  if (!readInputs()) return setStatus('INVALID RISK SETTINGS');
  if (mode === 'live') {
    const ok = confirm(`REAL XRP BOT ACTIVATION\n\nMax allocation: ${capitalXrp} XRP\nMax trade: ${maxTradeXrp} XRP\nStop loss: ${stopLossPct}%\nTake profit: ${takeProfitPct}%\nEntry threshold: ${entryPct}%\n\nThe bot will submit real XRPL DEX transactions automatically while running. Continue?`);
    if (!ok) return setStatus('LIVE BOT CANCELLED');
    try {
      const stored = await unlockWallet();
      wallet = Wallet.fromSeed(stored.seed, {algorithm:'ecdsa-secp256k1'});
      await connect();
      if (!(await hasTrustline())) return setStatus('RLUSD TRUST LINE REQUIRED · TAP SET RLUSD TRUST LINE');
      const b = await getBalances();
      if (b.xrp < Math.max(1.5, Math.min(capitalXrp, maxTradeXrp) + 1.5)) return setStatus(`NOT ENOUGH XRP · AVAILABLE ${b.xrp.toFixed(4)} XRP`);
    } catch (e) { return setStatus(`LIVE ACTIVATION ERROR · ${e.message}`); }
  } else {
    wallet = null;
  }
  running = true;
  history = [];
  consecutiveErrors = 0;
  startValueXrp = mode === 'live' ? (await getBalances()).xrp : capitalXrp;
  document.querySelector('#botLaunch').disabled = true;
  document.querySelector('#botLaunch').textContent = 'BOT RUNNING';
  await cycle();
  clearInterval(timer);
  timer = setInterval(cycle, intervalMs);
}

function stopBot(reason='BOT STOPPED') { running=false; clearInterval(timer); timer=null; setStatus(reason); const b=document.querySelector('#botLaunch'); if(b){b.disabled=false;b.textContent='↻ RESTART BOT';} }
function closeBot(){stopBot('BOT CLOSED');document.querySelector('#botModal')?.remove();}
function setStatus(text){const el=document.querySelector('#botStatus');if(el)el.innerHTML=text;}

window.addEventListener('adrenaline:open-bot', openBot);
