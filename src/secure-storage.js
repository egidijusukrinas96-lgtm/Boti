const STORAGE_KEY = 'adrenaline.wallet.v2';

export async function initializeSecureStorage() {
  return true;
}

export async function hasStoredWallet() {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export async function saveWallet(wallet) {
  // Paimame sėklą arba privačiojo rakto reikšmę tiesiogiai
  const seed = wallet.seed || wallet._secret || (typeof wallet.secret === 'function' ? wallet.secret() : wallet.secret);
  const address = wallet.address || wallet.classicAddress;

  if (!seed || !address) {
    throw new Error('Wallet seed is unavailable.');
  }

  const data = {
    version: 2,
    address: address,
    seed: seed,
    createdAt: new Date().toISOString()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export async function unlockWallet() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    throw new Error('No wallet found in storage.');
  }
  return JSON.parse(raw);
}

export async function deleteStoredWallet() {
  localStorage.removeItem(STORAGE_KEY);
}
