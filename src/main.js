import './style.css';
import { Client, Wallet, dropsToXrp, xrpToDrops } from 'xrpl';

const TESTNET = 'wss://s.altnet.rippletest.net:51233';
const FAUCET = 'https://faucet.altnet.rippletest.net/accounts';
let wallet = null;
let client = null;

const app = document.querySelector('#app');
const short = v => v ? `${v.slice(0, 8)}…${v.slice(-6)}` : '—';

function render({ status = 'TESTNET', balance = '0', message = '' } = {}) {
  app.innerHTML = `
    <main class="shell">
      <header class="topbar"><div><div class="eyebrow">ADRENALINE PROTOCOL</div><h1>ADRENALINE <span>WALLET</span></h1></div><div class="status">● ${status}</div></header>
      <section class="card hero">
        <div class="label">XRPL TESTNET · NON-CUSTODIAL</div>
        <div class="balance">${balance} <small>XRP</small></div>
        <div class="sub">Testnet only. The signing key stays local to this app session.</div>
        <button id="create">CREATE TESTNET WALLET</button>
        <button id="fund" class="ghost">REQUEST TESTNET XRP</button>
        <button id="refresh" class="ghost">REFRESH BALANCE</button>
      </section>
      <section class="card wallet"><div class="label">WALLET ADDRESS</div><div class="address">${wallet ? wallet.address : 'No wallet created'}</div>${wallet ? `<div class="secret-warning">SECRET CREATED LOCALLY · NEVER SHARE IT</div>` : ''}</section>
      <section class="card send"><div class="label">SEND XRP · TESTNET</div><input id="destination" placeholder="Destination r-address" autocomplete="off"/><input id="amount" inputmode="decimal" placeholder="Amount XRP"/><button id="send">PREVIEW & SIGN TRANSACTION</button><p id="message">${message}</p></section>
      <section class="card protocol"><div class="label">SECURITY MODEL</div><h2>USER CONTROLLED</h2><p>Every payment requires explicit confirmation. Victory/Death never modifies wallet funds.</p></section>
      <footer>XRPL TESTNET · NO MAINNET FUNDS · ANDROID</footer>
    </main>`;
  document.querySelector('#create').onclick = createWallet;
  document.querySelector('#fund').onclick = fundWallet;
  document.querySelector('#refresh').onclick = refreshBalance;
  document.querySelector('#send').onclick = sendXrp;
}

async function connect() {
  if (!client) client = new Client(TESTNET);
  if (!client.isConnected()) await client.connect();
}

async function createWallet() {
  try {
    wallet = Wallet.generate();
    await connect();
    render({ status: 'TESTNET READY', balance: await getBalance() });
  } catch (e) { render({ status: 'ERROR', message: e.message }); }
}

async function getBalance() {
  if (!wallet) return '0';
  try {
    const r = await client.request({ command: 'account_info', account: wallet.address, ledger_index: 'validated' });
    return Number(dropsToXrp(r.result.account_data.Balance)).toFixed(6);
  } catch { return '0'; }
}

async function refreshBalance() {
  if (!wallet) return render({ message: 'Create a Testnet wallet first.' });
  try { await connect(); render({ status: 'TESTNET READY', balance: await getBalance() }); }
  catch (e) { render({ status: 'ERROR', message: e.message }); }
}

async function fundWallet() {
  if (!wallet) return render({ message: 'Create a Testnet wallet first.' });
  try {
    const r = await fetch(FAUCET, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ destination: wallet.address, userAgent: 'Adrenaline Wallet Testnet' }) });
    if (!r.ok) throw new Error(`Faucet HTTP ${r.status}`);
    render({ status: 'FAUCET REQUESTED', message: 'Testnet XRP requested. Tap Refresh Balance shortly.' });
  } catch (e) { render({ status: 'FAUCET ERROR', message: e.message }); }
}

async function sendXrp() {
  if (!wallet) return render({ message: 'Create a Testnet wallet first.' });
  const destination = document.querySelector('#destination').value.trim();
  const amount = document.querySelector('#amount').value.trim();
  if (!destination || !amount || Number(amount) <= 0) return render({ status: 'VALIDATION', message: 'Enter a destination and positive XRP amount.' });
  if (!destination.startsWith('r')) return render({ status: 'VALIDATION', message: 'Destination must be an XRPL r-address.' });
  const ok = window.confirm(`SEND XRP TESTNET\n\nTo: ${short(destination)}\nAmount: ${amount} XRP\n\nSign and submit?`);
  if (!ok) return;
  try {
    await connect();
    const prepared = await client.autofill({ TransactionType: 'Payment', Account: wallet.address, Destination: destination, Amount: xrpToDrops(amount) });
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    render({ status: 'CONFIRMED', balance: await getBalance(), message: `Ledger ${result.result.ledger_index} · TX ${signed.hash}` });
  } catch (e) { render({ status: 'TX ERROR', message: e.message }); }
}

render();
