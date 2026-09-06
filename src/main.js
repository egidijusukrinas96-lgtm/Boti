import './style.css';

const assets = [
  ['BTC', 'Bitcoin', '₿'],
  ['ETH', 'Ethereum', 'Ξ'],
  ['USDT', 'Tether', '$'],
  ['XRP', 'XRP Ledger', '✕']
];

let balance = 100;
let running = false;

const app = document.querySelector('#app');

function render() {
  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div>
          <div class="eyebrow">ADRENALINE PROTOCOL</div>
          <h1>ADRENALINE <span>WALLET</span></h1>
        </div>
        <div class="status">● ONLINE</div>
      </header>

      <section class="hero card">
        <div class="label">DEMO CAPITAL · GAME MODE</div>
        <div class="balance">${balance.toFixed(2)} <small>USDT</small></div>
        <div class="sub">Victory/Death simulation — real funds are never automatically destroyed.</div>
        <button id="survive" ${running ? 'disabled' : ''}>${running ? 'RUNNING 24H TEST…' : 'START 24H SURVIVAL'}</button>
        <button id="reset" class="ghost">RESET DEMO</button>
      </section>

      <section class="grid">
        ${assets.map(([ticker, name, icon]) => `
          <article class="asset card">
            <div class="coin">${icon}</div>
            <div><strong>${ticker}</strong><span>${name}</span></div>
            <b>READY</b>
          </article>
        `).join('')}
      </section>

      <section class="card protocol">
        <div class="label">EXTREME FINANCIAL SURVIVAL</div>
        <h2>24H TEST</h2>
        <p>The game engine evaluates a simulated result. Positive result = <strong>VICTORY</strong>. Zero or negative result = <strong>DEATH</strong>.</p>
      </section>

      <footer>NON-CUSTODIAL DESIGN · SIMULATION MODE · ANDROID</footer>
    </main>
  `;

  document.querySelector('#survive').onclick = runTest;
  document.querySelector('#reset').onclick = () => { balance = 100; running = false; render(); };
}

function runTest() {
  running = true;
  render();
  setTimeout(() => {
    const pnl = (Math.random() * 2 - 0.75) * balance;
    if (pnl > 0) {
      balance *= 3;
      alert(`VICTORY\nSimulated profit: +${pnl.toFixed(2)} USDT\nDemo capital x3.`);
    } else {
      balance = 0;
      alert(`DEATH\nSimulated result: ${pnl.toFixed(2)} USDT\nDemo capital reset to zero.`);
    }
    running = false;
    render();
  }, 1400);
}

render();
