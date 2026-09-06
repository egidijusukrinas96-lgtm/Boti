import './style.css';
import './bot-launcher.js';
import { Client, Wallet, dropsToXrp, xrpToDrops, isValidClassicAddress } from 'xrpl';
import QRCode from 'qrcode';
import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { hasStoredWallet, saveWallet, unlockWallet, deleteStoredWallet, initializeSecureStorage } from './secure-storage.js';

const MAINNET = 'wss://s1.ripple.com';
const PORTFOLIO = [
  { symbol: 'BTC', network: 'Bitcoin', mode: 'COMING SOON' },
  { symbol: 'ETH', network: 'Ethereum', mode: 'COMING SOON' },
  { symbol: 'USDT', network: 'Ethereum', mode: 'COMING SOON' },
  { symbol: 'XRP', network: 'XRPL Mainnet', mode: 'LIVE' }
];
let wallet = null, client = null, recoveryPhrase = '', balance = '0', locked = true, message = '', status = 'MAINNET', menuOpen = false, activePanel = '', busy = false;
const app = document.querySelector('#app');
const short = v => v ? `${v.slice(0, 8)}…${v.slice(-6)}` : '—';
const escapeHtml = (value = '') => String(value).replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));
function portfolioMarkup() { return PORTFOLIO.map(a => `<div class="asset-row"><div><strong>${a.symbol}</strong><span>${a.network}</span></div><div class="asset-status">${a.mode}</div></div>`).join(''); }
function panelMarkup() {
  if (activePanel === 'deposit') return `<section class="card action-panel"><div class="panel-head"><div><div class="label">DEPOSIT · XRP</div><h2>Receive real XRP</h2></div><button id="closePanel" class="icon-btn">×</button></div><div class="asset-select"><button class="asset-choice active">XRP · XRPL MAINNET</button><button class="asset-choice disabled">BTC · COMING SOON</button><button class="asset-choice disabled">ETH · COMING SOON</button><button class="asset-choice disabled">USDT · COMING SOON</button></div>${wallet && !locked ? `<div class="deposit-box"><div class="label">SCAN OR COPY YOUR XRP ADDRESS</div><div class="qr-wrap"><canvas id="depositQr" width="220" height="220"></canvas></div><div class="deposit-address">${escapeHtml(wallet.address)}</div><button id="copyAddress">COPY XRP ADDRESS</button></div><div class="deposit-steps"><strong>HOW TO ADD MONEY</strong><ol><li>Copy the address or scan the QR.</li><li>In your exchange/wallet choose <b>XRP / XRP Ledger (XRPL)</b>.</li><li>Paste the address and send a small test amount first.</li><li>Return here and tap <b>REFRESH XRP BALANCE</b>.</li></ol></div><button id="refreshDeposit" class="outline-btn">↻ REFRESH XRP BALANCE</button>` : '<div class="deposit-box"><div class="warning">Unlock your wallet to see the XRP address and QR code.</div><button id="unlockFromPanel">🔐 UNLOCK WALLET</button></div>'}<p class="hint">REAL XRPL MAINNET deposit. This app is non-custodial and does not take custody of your XRP.</p></section>`;
  if (activePanel === 'withdraw') return `<section class="card action-panel"><div class="panel-head"><div><div class="label">WITHDRAW · XRP</div><h2>Send real XRP</h2></div><button id="closePanel" class="icon-btn">×</button></div>${wallet && !locked ? `<input id="destination" placeholder="Destination r-address" autocomplete="off"/><input id="amount" inputmode="decimal" placeholder="Amount XRP"/><button id="send">🔐 PREVIEW · BIOMETRIC · SEND</button><p class="hint">You will see amount, fee and destination before biometric authentication and local signing.</p>` : '<p class="warning">Unlock the wallet first to withdraw.</p><button id="unlockFromPanel">🔐 UNLOCK WALLET</button>'}</section>`;
  return '';
}
async function render() {
  const stored = await hasStoredWallet();
  app.innerHTML = `<main class="shell"><header class="topbar"><div><div class="eyebrow">ADRENALINE PROTOCOL</div><h1>ADRENALINE <span>WALLET</span></h1></div><div class="top-actions"><div class="status">● ${status}</div><button id="menuBtn" class="menu-btn">☰</button></div></header>${menuOpen ? `<nav class="menu card"><button id="menuPortfolio">◉ PORTFOLIO</button><button id="menuDeposit">↓ DEPOSIT</button><button id="menuWithdraw">↑ WITHDRAW</button><button id="menuWallet">▣ WALLET</button><button id="menuSecurity">⌕ SECURITY</button><button id="menuBot">⚡ BOT</button></nav>` : ''}<section class="card hero"><div class="label">UNIFIED PORTFOLIO · XRP MAINNET</div><div class="balance">${balance} <small>XRP</small></div><div class="sub">${wallet && !locked ? short(wallet.address) : stored ? 'Wallet locked' : 'No wallet configured'}</div>${wallet && !locked ? '<div class="unlock-state">🔓 WALLET UNLOCKED</div>' : '<div class="lock-state">🔒 WALLET LOCKED</div>'}<div class="quick-actions"><button id="depositBtn">↓ DEPOSIT XRP</button><button id="withdrawBtn" class="outline">↑ WITHDRAW XRP</button><button id="botHero" class="bot-button">⚡ START BOT</button></div>${stored && (!wallet || locked) ? `<button id="unlock" ${busy ? 'disabled' : ''}>${busy ? '⏳ UNLOCKING...' : '🔐 UNLOCK WITH BIOMETRIC'}</button>` : ''}${!stored ? '<button id="create">CREATE NEW WALLET</button>' : ''}${!wallet || locked ? '<button id="import" class="ghost">IMPORT RECOVERY PHRASE</button>' : ''}${wallet && !locked ? '<button id="lock" class="ghost">LOCK WALLET</button>' : ''}</section>${panelMarkup()}<section id="portfolio" class="card portfolio"><div class="label">ASSET PORTFOLIO</div>${portfolioMarkup()}<p class="hint">XRP is live on XRPL Mainnet. BTC, ETH and ERC-20 USDT are not enabled yet.</p></section>${wallet && !locked ? `<section id="wallet" class="card wallet"><div class="label">XRPL MAINNET WALLET</div><div class="address">${escapeHtml(wallet.address)}</div><button id="refresh" class="ghost">REFRESH BALANCE</button></section><section id="security" class="card security"><div class="label">RECOVERY</div><p>Your recovery phrase is shown only when creating/importing a wallet and is never sent to a server.</p>${recoveryPhrase ? '<button id="showPhrase" class="ghost">SHOW RECOVERY PHRASE</button>' : '<p class="warning">Recovery phrase is not available in this session. Keep your original backup safe.</p>'}<button id="delete" class="danger">DELETE DEVICE WALLET</button></section>` : `<section id="security" class="card security"><div class="label">SECURITY</div><p>Wallet secrets are stored with native Android secure storage. Unlock requires biometric/device authentication.</p><p class="warning">Never share your recovery phrase.</p></section>`}<section class="card protocol"><div class="label">GAME SAFETY</div><h2>USER CONTROLLED</h2><p>Victory/Death is a game layer. It never confiscates, burns or automatically transfers real wallet funds.</p></section><p id="message" class="message">${escapeHtml(message)}</p><footer>XRPL MAINNET · LOCAL SIGNING · USER CONTROLLED FUNDS</footer></main>`;
  document.querySelector('#menuBtn')?.addEventListener('click', () => { menuOpen = !menuOpen; void render(); });
  document.querySelector('#depositBtn')?.addEventListener('click', () => { activePanel='deposit'; menuOpen=false; void render(); });
  document.querySelector('#withdrawBtn')?.addEventListener('click', () => { activePanel='withdraw'; menuOpen=false; void render(); });
  document.querySelector('#botHero')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('adrenaline:open-bot')));
  document.querySelector('#menuBot')?.addEventListener('click', () => { menuOpen=false; void render(); setTimeout(() => window.dispatchEvent(new CustomEvent('adrenaline:open-bot')), 30); });
  document.querySelector('#menuDeposit')?.addEventListener('click', () => { activePanel='deposit'; menuOpen=false; void render(); });
  document.querySelector('#menuWithdraw')?.addEventListener('click', () => { activePanel='withdraw'; menuOpen=false; void render(); });
  document.querySelector('#menuPortfolio')?.addEventListener('click', () => { activePanel=''; menuOpen=false; void render(); });
  document.querySelector('#menuWallet')?.addEventListener('click', () => { menuOpen=false; void render(); setTimeout(()=>document.querySelector('#wallet')?.scrollIntoView({behavior:'smooth'}),30); });
  document.querySelector('#menuSecurity')?.addEventListener('click', () => { menuOpen=false; void render(); setTimeout(()=>document.querySelector('#security')?.scrollIntoView({behavior:'smooth'}),30); });
  document.querySelector('#closePanel')?.addEventListener('click', () => { activePanel=''; void render(); });
  document.querySelector('#copyAddress')?.addEventListener('click', copyAddress); document.querySelector('#unlockFromPanel')?.addEventListener('click', unlock);
  document.querySelector('#create')?.addEventListener('click', createWallet); document.querySelector('#import')?.addEventListener('click', importWallet); document.querySelector('#unlock')?.addEventListener('click', unlock); document.querySelector('#lock')?.addEventListener('click', lockWallet); document.querySelector('#refresh')?.addEventListener('click', refreshBalance); document.querySelector('#refreshDeposit')?.addEventListener('click', refreshBalance); document.querySelector('#send')?.addEventListener('click', sendXrp); document.querySelector('#showPhrase')?.addEventListener('click', showPhrase); document.querySelector('#delete')?.addEventListener('click', deleteWallet);
  const qrCanvas = document.querySelector('#depositQr'); if (qrCanvas && wallet && !locked) { try { await QRCode.toCanvas(qrCanvas, wallet.address, {width:220, margin:2, errorCorrectionLevel:'M'}); } catch(e) { setMessage(`QR error: ${e.message}`, 'QR ERROR'); } }
}
function setMessage(text,nextStatus=status){message=text;status=nextStatus;void render();}
async function connect(){if(!client)client=new Client(MAINNET);if(!client.isConnected())await client.connect();}
async function getBalance(){if(!wallet)return '0';try{await connect();const r=await client.request({command:'account_info',account:wallet.address,ledger_index:'validated'});return Number(dropsToXrp(r.result.account_data.Balance)).toFixed(6);}catch{return '0';}}
function makeWalletFromPhrase(phrase){if(!validateMnemonic(phrase,wordlist))throw new Error('Invalid 12-word BIP39 recovery phrase.');return Wallet.fromMnemonic(phrase,{algorithm:'ecdsa-secp256k1'});}
async function createWallet(){try{const phrase=generateMnemonic(wordlist,128);const nextWallet=makeWalletFromPhrase(phrase);await saveWallet(nextWallet);wallet=nextWallet;recoveryPhrase=phrase;locked=false;status='MAINNET WALLET CREATED';message='BACK UP YOUR RECOVERY PHRASE NOW';await render();setTimeout(()=>showPhrase(),100);}catch(e){setMessage(e.message,'ERROR');}}
async function importWallet(){try{const phrase=prompt('Enter your 12-word BIP39 recovery phrase. It stays on this device and is not uploaded.');if(!phrase)return;const normalized=phrase.trim().toLowerCase().replace(/\s+/g,' ');const nextWallet=makeWalletFromPhrase(normalized);await saveWallet(nextWallet);wallet=nextWallet;recoveryPhrase=normalized;locked=false;setMessage('Wallet imported. XRP Mainnet is ready.','MAINNET READY');}catch(e){setMessage(e.message,'IMPORT ERROR');}}
async function unlock(){
  if (busy) return;
  busy = true;
  status = 'AUTHENTICATING';
  message = 'Confirm fingerprint/face/device credential…';
  await render();
  try {
    const stored = await unlockWallet();
    if (!stored || typeof stored !== 'object' || !stored.seed) throw new Error('Secure wallet data was not found after authentication.');
    const restored = Wallet.fromSeed(stored.seed, {algorithm:'ecdsa-secp256k1'});
    if (stored.address && restored.address !== stored.address) throw new Error('Stored wallet integrity check failed.');
    wallet = restored;
    locked = false;
    recoveryPhrase = '';
    activePanel = '';
    busy = false;
    status = 'MAINNET READY';
    message = `Wallet unlocked · ${short(wallet.address)}`;
    await render();
    void refreshBalance(false);
  } catch (e) {
    busy = false;
    wallet = null;
    locked = true;
    status = 'UNLOCK ERROR';
    message = e?.message || 'Wallet unlock failed.';
    await render();
  }
}
function lockWallet(){wallet=null;recoveryPhrase='';balance='0';locked=true;activePanel='';setMessage('Wallet locked.','LOCKED');}
async function showPhrase(){if(!wallet||locked||!recoveryPhrase)return;try{const stored=await unlockWallet();const recovered=Wallet.fromSeed(stored.seed,{algorithm:'ecdsa-secp256k1'});if(recovered.address!==wallet.address)throw new Error('Wallet integrity check failed.');alert(`RECOVERY PHRASE — KEEP SECRET\n\n${recoveryPhrase}\n\nWrite it down and store it offline. Never share or screenshot it.`);}catch(e){setMessage(e.message,'SECURITY ERROR');}}
async function deleteWallet(){if(!confirm('Delete the encrypted wallet from this device? You can recover it only with your recovery phrase.'))return;try{await deleteStoredWallet();lockWallet();setMessage('Encrypted device wallet deleted.','DELETED');}catch(e){setMessage(e.message,'DELETE ERROR');}}
async function refreshBalance(showMessage = true){if(!wallet||locked)return;try{status='UPDATING BALANCE';if(showMessage)message='Reading XRPL Mainnet balance…';if(showMessage)await render();balance=await getBalance();status='MAINNET READY';message=`XRPL Mainnet balance: ${balance} XRP`;await render();}catch(e){status='BALANCE ERROR';message=e?.message||'Could not read XRPL balance.';await render();}}
async function copyAddress(){if(!wallet||locked)return setMessage('Unlock the wallet first.','LOCKED');try{await navigator.clipboard.writeText(wallet.address);setMessage('XRP Mainnet address copied.','COPIED');}catch{setMessage('Could not copy address.','COPY ERROR');}}
async function sendXrp(){if(!wallet||locked)return setMessage('Unlock the wallet first.','LOCKED');const destination=document.querySelector('#destination')?.value.trim();const amount=document.querySelector('#amount')?.value.trim();const numericAmount=Number(amount);if(!destination||!amount||!Number.isFinite(numericAmount)||numericAmount<=0)return setMessage('Enter a valid positive XRP amount.','VALIDATION');if(!isValidClassicAddress(destination))return setMessage('Destination is not a valid XRPL classic address.','VALIDATION');if(destination===wallet.address)return setMessage('Destination must be different from your own address.','VALIDATION');try{await connect();const prepared=await client.autofill({TransactionType:'Payment',Account:wallet.address,Destination:destination,Amount:xrpToDrops(amount)});const fee=dropsToXrp(prepared.Fee||'0');const ok=confirm(`REAL XRP TRANSACTION PREVIEW\n\nTo: ${destination}\nAmount: ${amount} XRP\nNetwork fee: ${fee} XRP\nSequence: ${prepared.Sequence}\nNetwork: XRPL MAINNET\n\nThis uses real XRP. Continue to biometric authentication and local signing?`);if(!ok)return setMessage('Transaction cancelled.','CANCELLED');const stored=await unlockWallet();const signingWallet=Wallet.fromSeed(stored.seed,{algorithm:'ecdsa-secp256k1'});if(signingWallet.address!==wallet.address)throw new Error('Wallet integrity check failed.');const signed=signingWallet.sign(prepared);const result=await client.submitAndWait(signed.tx_blob);balance=await getBalance();activePanel='';const txResult=result.result?.meta?.TransactionResult||result.result?.engine_result||'';if(txResult&&txResult!=='tesSUCCESS')throw new Error(`XRPL rejected transaction: ${txResult}`);setMessage(`Validated ledger ${result.result.ledger_index} · TX ${signed.hash}`,'CONFIRMED');}catch(e){setMessage(e.message,'TX ERROR');}}
async function boot(){await initializeSecureStorage();await render();} boot();
