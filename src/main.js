import './style.css';
import { Client, Wallet, dropsToXrp, xrpToDrops, isValidClassicAddress } from 'xrpl';
import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { hasStoredWallet, saveWallet, unlockWallet, deleteStoredWallet, initializeSecureStorage } from './secure-storage.js';

const TESTNET = 'wss://s.altnet.rippletest.net:51233';
const FAUCET = 'https://faucet.altnet.rippletest.net/accounts';
const PORTFOLIO = [
  { symbol: 'BTC', network: 'Bitcoin Testnet', mode: 'STAGED' },
  { symbol: 'ETH', network: 'Ethereum Sepolia', mode: 'STAGED' },
  { symbol: 'USDT', network: 'Ethereum Sepolia', mode: 'STAGED' },
  { symbol: 'XRP', network: 'XRPL Testnet', mode: 'LIVE TESTNET' }
];

let wallet = null;
let client = null;
let recoveryPhrase = '';
let balance = '0';
let locked = false;
let message = '';
let status = 'TESTNET';
let menuOpen = false;
let activePanel = '';

const app = document.querySelector('#app');
const short = v => v ? `${v.slice(0, 8)}…${v.slice(-6)}` : '—';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function portfolioMarkup() {
  return PORTFOLIO.map(asset => `
    <div class="asset-row">
      <div><strong>${asset.symbol}</strong><span>${asset.network}</span></div>
      <div class="asset-status">${asset.mode}</div>
    </div>`).join('');
}

function panelMarkup() {
  if (!activePanel) return '';
  if (activePanel === 'deposit') return `
    <section class="card action-panel">
      <div class="panel-head"><div><div class="label">DEPOSIT</div><h2>Receive assets</h2></div><button id="closePanel" class="icon-btn">×</button></div>
      <div class="asset-select"><button class="asset-choice active">XRP · XRPL TESTNET</button><button class="asset-choice disabled">BTC · COMING SOON</button><button class="asset-choice disabled">ETH · COMING SOON</button><button class="asset-choice disabled">USDT · COMING SOON</button></div>
      <div class="deposit-box"><div class="label">YOUR XRP TESTNET ADDRESS</div><div class="deposit-address">${wallet && !locked ? escapeHtml(wallet.address) : 'Unlock wallet to view address'}</div><button id="copyAddress" ${wallet && !locked ? '' : 'disabled'}>COPY ADDRESS</button></div>
      <p class="hint">Only send XRP on XRPL Testnet to this address. BTC, ETH and USDT deposits will be enabled after their testnet integrations are added.</p>
    </section>`;
  if (activePanel === 'withdraw') return `
    <section class="card action-panel">
      <div class="panel-head"><div><div class="label">WITHDRAW</div><h2>Send XRP</h2></div><button id="closePanel" class="icon-btn">×</button></div>
      ${wallet && !locked ? `<input id="destination" placeholder="Destination r-address" autocomplete="off"/><input id="amount" inputmode="decimal" placeholder="Amount XRP"/><button id="send">🔐 PREVIEW · BIOMETRIC · SEND</button><p class="hint">You will see the exact transaction and fee before biometric authentication and local signing.</p>` : '<p class="warning">Unlock the wallet first to withdraw.</p><button id="unlockFromPanel">🔐 UNLOCK WALLET</button>'}
    </section>`;
  return '';
}

async function render() {
  const stored = await hasStoredWallet();
  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div><div class="eyebrow">ADRENALINE PROTOCOL</div><h1>ADRENALINE <span>WALLET</span></h1></div>
        <div class="top-actions"><div class="status">● ${status}</div><button id="menuBtn" class="menu-btn" aria-label="Open menu">☰</button></div>
      </header>
      ${menuOpen ? `<nav class="menu card"><button id="menuPortfolio">◉ PORTFOLIO</button><button id="menuDeposit">↓ DEPOSIT</button><button id="menuWithdraw">↑ WITHDRAW</button><button id="menuWallet">▣ WALLET</button><button id="menuSecurity">⌕ SECURITY</button></nav>` : ''}

      <section class="card hero">
        <div class="label">UNIFIED PORTFOLIO · TESTNET MODE</div>
        <div class="balance">${balance} <small>XRP</small></div>
        <div class="sub">${wallet && !locked ? short(wallet.address) : stored ? 'Wallet locked' : 'No wallet configured'}</div>
        ${wallet && !locked ? '<div class="unlock-state">🔓 WALLET UNLOCKED</div>' : '<div class="lock-state">🔒 WALLET LOCKED</div>'}
        <div class="quick-actions"><button id="depositBtn">↓ DEPOSIT</button><button id="withdrawBtn" class="outline">↑ WITHDRAW</button></div>
        ${stored && (!wallet || locked) ? '<button id="unlock">🔐 UNLOCK WITH BIOMETRIC</button>' : ''}
        ${!stored ? '<button id="create">CREATE NEW WALLET</button>' : ''}
        ${!wallet || locked ? '<button id="import" class="ghost">IMPORT RECOVERY PHRASE</button>' : ''}
        ${wallet && !locked ? '<button id="lock" class="ghost">LOCK WALLET</button>' : ''}
      </section>

      ${panelMarkup()}

      <section id="portfolio" class="card portfolio">
        <div class="label">ASSET PORTFOLIO</div>
        ${portfolioMarkup()}
        <p class="hint">XRP is connected to XRPL Testnet now. BTC, ETH and ERC-20 USDT are staged as separate testnet integrations.</p>
      </section>

      ${wallet && !locked ? `
      <section id="wallet" class="card wallet">
        <div class="label">XRPL WALLET</div>
        <div class="address">${escapeHtml(wallet.address)}</div>
        <button id="fund" class="ghost">REQUEST TESTNET XRP</button>
        <button id="refresh" class="ghost">REFRESH BALANCE</button>
      </section>
      <section id="security" class="card security">
        <div class="label">RECOVERY</div>
        <p>Recovery phrase is kept only in the active app session and is never stored in secure storage.</p>
        ${recoveryPhrase ? '<button id="showPhrase" class="ghost">SHOW RECOVERY PHRASE</button>' : '<p class="warning">Your recovery phrase is not available in this session. Use your original backup phrase if you need to restore the wallet.</p>'}
        <button id="delete" class="danger">DELETE DEVICE WALLET</button>
      </section>` : `
      <section id="security" class="card security">
        <div class="label">SECURITY</div>
        <p>Wallet secrets are stored with the native Android secure-storage plugin. Unlock requires biometric/device authentication.</p>
        <p class="warning">Never share your recovery phrase. Anyone with it can control the wallet.</p>
      </section>`}

      <section class="card protocol"><div class="label">GAME SAFETY</div><h2>USER CONTROLLED</h2><p>Victory/Death is a game layer. It never confiscates, burns or automatically transfers real wallet funds.</p></section>
      <p id="message" class="message">${escapeHtml(message)}</p>
      <footer>TESTNET-FIRST · LOCAL SIGNING · USER CONTROLLED FUNDS</footer>
    </main>`;

  document.querySelector('#menuBtn')?.addEventListener('click', () => { menuOpen = !menuOpen; void render(); });
  document.querySelector('#depositBtn')?.addEventListener('click', () => { activePanel = 'deposit'; menuOpen = false; void render(); });
  document.querySelector('#withdrawBtn')?.addEventListener('click', () => { activePanel = 'withdraw'; menuOpen = false; void render(); });
  document.querySelector('#menuDeposit')?.addEventListener('click', () => { activePanel = 'deposit'; menuOpen = false; void render(); });
  document.querySelector('#menuWithdraw')?.addEventListener('click', () => { activePanel = 'withdraw'; menuOpen = false; void render(); });
  document.querySelector('#menuPortfolio')?.addEventListener('click', () => { activePanel = ''; menuOpen = false; void render(); });
  document.querySelector('#menuWallet')?.addEventListener('click', () => { activePanel = ''; menuOpen = false; document.querySelector('#wallet')?.scrollIntoView({ behavior: 'smooth' }); });
  document.querySelector('#menuSecurity')?.addEventListener('click', () => { activePanel = ''; menuOpen = false; document.querySelector('#security')?.scrollIntoView({ behavior: 'smooth' }); });
  document.querySelector('#closePanel')?.addEventListener('click', () => { activePanel = ''; void render(); });
  document.querySelector('#copyAddress')?.addEventListener('click', copyAddress);
  document.querySelector('#unlockFromPanel')?.addEventListener('click', unlock);
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

function setMessage(text, nextStatus = status) { message = text; status = nextStatus; void render(); }

async function connect() { if (!client) client = new Client(TESTNET); if (!client.isConnected()) await client.connect(); }

async function getBalance() {
  if (!wallet) return '0';
  try { await connect(); const r = await client.request({ command: 'account_info', account: wallet.address, ledger_index: 'validated' }); return Number(dropsToXrp(r.result.account_data.Balance)).toFixed(6); }
  catch { return '0'; }
}

function makeWalletFromPhrase(phrase) { if (!validateMnemonic(phrase, wordlist)) throw new Error('Invalid recovery phrase. Use a valid BIP39 phrase.'); return Wallet.fromMnemonic(phrase); }

async function createWallet() {
  try { const phrase = generateMnemonic(wordlist, 128); const nextWallet = makeWalletFromPhrase(phrase); await saveWallet(nextWallet); wallet = nextWallet; recoveryPhrase = phrase; locked = false; balance = await getBalance(); status = 'WALLET CREATED'; message = 'Back up the recovery phrase now.'; await render(); setTimeout(() => showPhrase(true), 50); }
  catch (e) { setMessage(e.message, 'ERROR'); }
}

async function importWallet() {
  try { const phrase = prompt('Enter your 12-word BIP39 recovery phrase. It stays on this device and is not uploaded.'); if (!phrase) return; const normalized = phrase.trim().toLowerCase().replace(/\s+/g, ' '); const nextWallet = makeWalletFromPhrase(normalized); await saveWallet(nextWallet); wallet = nextWallet; recoveryPhrase = normalized; locked = false; balance = await getBalance(); setMessage('Wallet imported into Android secure storage.', 'WALLET READY'); }
  catch (e) { setMessage(e.message, 'IMPORT ERROR'); }
}

async function unlock() {
  try { const stored = await unlockWallet(); wallet = Wallet.fromSeed(stored.seed); locked = false; recoveryPhrase = ''; balance = await getBalance(); activePanel = ''; setMessage('Wallet unlocked with biometric/device authentication.', 'WALLET READY'); }
  catch (e) { setMessage(e.message, 'UNLOCK ERROR'); }
}

function lockWallet() { wallet = null; recoveryPhrase = ''; balance = '0'; locked = true; activePanel = ''; setMessage('Wallet locked.', 'LOCKED'); }

async function showPhrase() {
  if (!wallet || locked || !recoveryPhrase) return;
  try { const stored = await unlockWallet(); const recovered = Wallet.fromSeed(stored.seed); if (recovered.address !== wallet.address) throw new Error('Wallet integrity check failed.'); alert(`RECOVERY PHRASE — KEEP SECRET\n\n${recoveryPhrase}\n\nNever share or screenshot this phrase.`); }
  catch (e) { setMessage(e.message, 'SECURITY ERROR'); }
}

async function deleteWallet() {
  if (!confirm('Delete the encrypted wallet from this device? You can recover it only with your recovery phrase.')) return;
  try { await deleteStoredWallet(); lockWallet(); setMessage('Encrypted device wallet deleted.', 'DELETED'); } catch (e) { setMessage(e.message, 'DELETE ERROR'); }
}

async function refreshBalance() { if (!wallet || locked) return setMessage('Unlock the wallet first.', 'LOCKED'); balance = await getBalance(); setMessage('Balance refreshed.', 'TESTNET READY'); }

async function fundWallet() {
  if (!wallet || locked) return setMessage('Unlock the wallet first.', 'LOCKED');
  try { const r = await fetch(FAUCET, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ destination: wallet.address, userAgent: 'Adrenaline Wallet Testnet' }) }); if (!r.ok) throw new Error(`Faucet HTTP ${r.status}`); setMessage('Testnet XRP requested. Refresh balance shortly.', 'FAUCET REQUESTED'); }
  catch (e) { setMessage(e.message, 'FAUCET ERROR'); }
}

async function copyAddress() {
  if (!wallet || locked) return setMessage('Unlock the wallet first.', 'LOCKED');
  try { await navigator.clipboard.writeText(wallet.address); setMessage('XRP address copied.', 'COPIED'); } catch { setMessage('Could not copy address.', 'COPY ERROR'); }
}

async function sendXrp() {
  if (!wallet || locked) return setMessage('Unlock the wallet first.', 'LOCKED');
  const destination = document.querySelector('#destination')?.value.trim();
  const amount = document.querySelector('#amount')?.value.trim();
  const numericAmount = Number(amount);
  if (!destination || !amount || !Number.isFinite(numericAmount) || numericAmount <= 0) return setMessage('Enter a valid positive XRP amount.', 'VALIDATION');
  if (!isValidClassicAddress(destination)) return setMessage('Destination is not a valid XRPL classic address.', 'VALIDATION');
  if (destination === wallet.address) return setMessage('Destination must be different from your own address.', 'VALIDATION');
  try {
    await connect();
    const prepared = await client.autofill({ TransactionType: 'Payment', Account: wallet.address, Destination: destination, Amount: xrpToDrops(amount) });
    const fee = dropsToXrp(prepared.Fee || '0');
    const ok = confirm(`TRANSACTION PREVIEW\n\nTo: ${destination}\nAmount: ${amount} XRP\nNetwork fee: ${fee} XRP\nSequence: ${prepared.Sequence}\nNetwork: XRPL TESTNET\n\nContinue to biometric authentication and local signing?`);
    if (!ok) return setMessage('Transaction cancelled.', 'CANCELLED');
    const stored = await unlockWallet(); const signingWallet = Wallet.fromSeed(stored.seed); if (signingWallet.address !== wallet.address) throw new Error('Wallet integrity check failed.');
    const signed = signingWallet.sign(prepared); signingWallet.seed = '';
    const result = await client.submitAndWait(signed.tx_blob); balance = await getBalance(); activePanel = ''; setMessage(`Validated ledger ${result.result.ledger_index} · TX ${signed.hash}`, 'CONFIRMED');
  } catch (e) { setMessage(e.message, 'TX ERROR'); }
}

async function boot() { await initializeSecureStorage(); await render(); }
boot();
