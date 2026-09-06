import './style.css';
import { Client, Wallet, dropsToXrp, xrpToDrops } from 'xrpl';
import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { hasStoredWallet, saveWallet, unlockWallet, deleteStoredWallet } from './secure-storage.js';

const TESTNET = 'wss://s.altnet.rippletest.net:51233';
const FAUCET = 'https://faucet.altnet.rippletest.net/accounts';
let wallet = null;
let client = null;
let recoveryPhrase = '';
let balance = '0';
let locked = false;
let message = '';
let status = 'TESTNET';

const app = document.querySelector('#app');
const short = v => v ? `${v.slice(0, 8)}…${v.slice(-6)}` : '—';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function render() {
  const stored = hasStoredWallet();
  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div><div class="eyebrow">ADRENALINE PROTOCOL</div><h1>ADRENALINE <span>WALLET</span></h1></div>
        <div class="status">● ${status}</div>
      </header>

      <section class="card hero">
        <div class="label">XRPL TESTNET · WALLET SECURITY</div>
        <div class="balance">${balance} <small>XRP</small></div>
        <div class="sub">${wallet && !locked ? short(wallet.address) : stored ? 'Wallet locked' : 'No wallet configured'}</div>
        ${wallet && !locked ? '<div class="unlock-state">🔓 WALLET UNLOCKED</div>' : '<div class="lock-state">🔒 WALLET LOCKED</div>'}
        ${stored && (!wallet || locked) ? '<button id="unlock">UNLOCK WALLET</button>' : ''}
        ${!stored ? '<button id="create">CREATE NEW WALLET</button>' : ''}
        ${!wallet || locked ? '<button id="import" class="ghost">IMPORT RECOVERY PHRASE</button>' : ''}
        ${wallet && !locked ? '<button id="lock" class="ghost">LOCK WALLET</button>' : ''}
      </section>

      ${wallet && !locked ? `
      <section class="card send">
        <div class="label">SEND XRP · TESTNET</div>
        <input id="destination" placeholder="Destination r-address" autocomplete="off"/>
        <input id="amount" inputmode="decimal" placeholder="Amount XRP"/>
        <button id="send">PREVIEW & SIGN TRANSACTION</button>
      </section>
      <section class="card wallet">
        <div class="label">WALLET</div>
        <div class="address">${escapeHtml(wallet.address)}</div>
        <button id="fund" class="ghost">REQUEST TESTNET XRP</button>
        <button id="refresh" class="ghost">REFRESH BALANCE</button>
      </section>
      <section class="card security">
        <div class="label">RECOVERY</div>
        <button id="showPhrase" class="ghost">SHOW RECOVERY PHRASE</button>
        <button id="delete" class="danger">DELETE DEVICE WALLET</button>
      </section>` : `
      <section class="card security">
        <div class="label">SECURITY</div>
        <p>Your recovery phrase is the master key. Anyone who has it can control the wallet.</p>
        <p class="warning">Never send it to support, websites, chat, screenshots or cloud notes.</p>
      </section>`}

      <section class="card protocol"><div class="label">GAME SAFETY</div><h2>USER CONTROLLED</h2><p>Victory/Death is a game layer. It never confiscates, burns or automatically transfers real wallet funds.</p></section>
      <p id="message" class="message">${escapeHtml(message)}</p>
      <footer>XRPL TESTNET · ENCRYPTED WALLET · ANDROID</footer>
    </main>`;

  document.querySelector('#create')?.addEventListener('click', createWallet);
  document.querySelector('#import')?.addEventListener('click', importWallet);
  document.querySelector('#unlock')?.addEventListener('click', unlock);
  document.querySelector('#lock')?.addEventListener('click', lockWallet);
  document.querySelector('#fund')?.addEventListener('click', fundWallet);
  document.querySelector('#refresh')?.addEventListener('click', refreshBalance);
  document.querySelector('#send')?.addEventListener('click', sendXrp);
  document.querySelector('#showPhrase')?.addEventListener('click', showPhrase);
  document.querySelector('#delete')?.addEventListener('click', deleteWallet);
}

function setMessage(text, nextStatus = status) {
  message = text;
  status = nextStatus;
  render();
}

async function connect() {
  if (!client) client = new Client(TESTNET);
  if (!client.isConnected()) await client.connect();
}

async function getBalance() {
  if (!wallet) return '0';
  try {
    await connect();
    const r = await client.request({ command: 'account_info', account: wallet.address, ledger_index: 'validated' });
    return Number(dropsToXrp(r.result.account_data.Balance)).toFixed(6);
  } catch { return '0'; }
}

function makeWalletFromPhrase(phrase) {
  if (!validateMnemonic(phrase, wordlist)) throw new Error('Invalid recovery phrase. Use a valid BIP39 phrase.');
  return Wallet.fromMnemonic(phrase);
}

async function createWallet() {
  try {
    const phrase = generateMnemonic(wordlist, 128);
    const nextWallet = makeWalletFromPhrase(phrase);
    const pin = prompt('Create a 6–12 digit wallet PIN. Do not reuse a sensitive account password.');
    if (!pin) return;
    const confirmPin = prompt('Repeat your wallet PIN.');
    if (pin !== confirmPin) throw new Error('PINs do not match.');
    recoveryPhrase = phrase;
    await saveWallet(nextWallet, pin);
    wallet = nextWallet;
    locked = false;
    balance = await getBalance();
    status = 'WALLET CREATED';
    message = 'IMPORTANT: write down your recovery phrase. It is the only backup for this wallet.';
    render();
    setTimeout(() => showPhrase(true), 50);
  } catch (e) { setMessage(e.message, 'ERROR'); }
}

async function importWallet() {
  try {
    const phrase = prompt('Enter your 12-word BIP39 recovery phrase. It stays on this device.');
    if (!phrase) return;
    const normalized = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
    const nextWallet = makeWalletFromPhrase(normalized);
    const pin = prompt('Create a new 6–12 digit PIN for this device.');
    if (!pin) return;
    const confirmPin = prompt('Repeat your wallet PIN.');
    if (pin !== confirmPin) throw new Error('PINs do not match.');
    recoveryPhrase = normalized;
    await saveWallet(nextWallet, pin);
    wallet = nextWallet;
    locked = false;
    balance = await getBalance();
    setMessage('Wallet imported. Recovery phrase was not uploaded.', 'WALLET READY');
  } catch (e) { setMessage(e.message, 'IMPORT ERROR'); }
}

async function unlock() {
  try {
    const pin = prompt('Enter wallet PIN.');
    if (!pin) return;
    const stored = await unlockWallet(pin);
    wallet = Wallet.fromSeed(stored.seed);
    locked = false;
    recoveryPhrase = '';
    balance = await getBalance();
    setMessage('Wallet unlocked locally.', 'WALLET READY');
  } catch (e) { setMessage(e.message, 'UNLOCK ERROR'); }
}

function lockWallet() {
  wallet = null;
  recoveryPhrase = '';
  balance = '0';
  locked = true;
  setMessage('Wallet locked. Secret material was removed from the active app state.', 'LOCKED');
}

async function showPhrase(initial = false) {
  if (!wallet || locked) return;
  try {
    const pin = prompt(initial ? 'Confirm your wallet PIN to reveal the recovery phrase.' : 'Enter wallet PIN before revealing the recovery phrase.');
    if (!pin) return;
    const stored = await unlockWallet(pin);
    const recovered = Wallet.fromSeed(stored.seed);
    if (!recoveryPhrase) throw new Error('Recovery phrase is not available in this session. Use your original backup phrase.');
    if (recovered.address !== wallet.address) throw new Error('Wallet integrity check failed.');
    alert(`RECOVERY PHRASE — KEEP SECRET\n\n${recoveryPhrase}\n\nNever share or screenshot this phrase.`);
  } catch (e) { setMessage(e.message, 'SECURITY ERROR'); }
}

function deleteWallet() {
  if (!confirm('Delete the encrypted wallet from this device? You can recover it only with your recovery phrase.')) return;
  deleteStoredWallet();
  lockWallet();
  setMessage('Encrypted device wallet deleted. Recovery phrase can restore it.', 'DELETED');
}

async function refreshBalance() {
  if (!wallet || locked) return setMessage('Unlock the wallet first.', 'LOCKED');
  balance = await getBalance();
  setMessage('Balance refreshed.', 'TESTNET READY');
}

async function fundWallet() {
  if (!wallet || locked) return setMessage('Unlock the wallet first.', 'LOCKED');
  try {
    const r = await fetch(FAUCET, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ destination: wallet.address, userAgent: 'Adrenaline Wallet Testnet' }) });
    if (!r.ok) throw new Error(`Faucet HTTP ${r.status}`);
    setMessage('Testnet XRP requested. Refresh balance shortly.', 'FAUCET REQUESTED');
  } catch (e) { setMessage(e.message, 'FAUCET ERROR'); }
}

async function sendXrp() {
  if (!wallet || locked) return setMessage('Unlock the wallet first.', 'LOCKED');
  const destination = document.querySelector('#destination')?.value.trim();
  const amount = document.querySelector('#amount')?.value.trim();
  if (!destination || !amount || Number(amount) <= 0) return setMessage('Enter a destination and positive XRP amount.', 'VALIDATION');
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(destination)) return setMessage('Destination must be a valid XRPL r-address.', 'VALIDATION');
  try {
    await connect();
    const prepared = await client.autofill({ TransactionType: 'Payment', Account: wallet.address, Destination: destination, Amount: xrpToDrops(amount) });
    const fee = dropsToXrp(prepared.Fee || '0');
    const ok = confirm(`TRANSACTION PREVIEW\n\nTo: ${short(destination)}\nAmount: ${amount} XRP\nNetwork fee: ${fee} XRP\nSequence: ${prepared.Sequence}\n\nConfirm local signing and Testnet submission?`);
    if (!ok) return setMessage('Transaction cancelled.', 'CANCELLED');
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    balance = await getBalance();
    setMessage(`Validated ledger ${result.result.ledger_index} · TX ${signed.hash}`, 'CONFIRMED');
  } catch (e) { setMessage(e.message, 'TX ERROR'); }
}

render();
