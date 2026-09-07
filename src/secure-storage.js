const STORAGE_KEY = 'adrenaline.wallet.v2';

export async function initializeSecureStorage() {
  return true;
}

export async function hasStoredWallet() {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export async function saveWallet(wallet) {
  // Pagauname sėklą iš bet kurio galimo XRPL bibliotekos formato
  let seed = wallet.seed;
  if (!seed && typeof wallet.secret === 'function') seed = wallet.secret();
  if (!seed && wallet.secret) seed = wallet.secret;
  if (!seed && wallet._secret) seed = wallet._secret;
  
  if (!seed) {
    throw new Error('Wallet seed is unavailable.');
  }

  const data = {
    version: 2,
    address: wallet.address,
    seed: seed,
    publicKey: wallet.publicKey || wallet.classicAddress,
    createdAt: new Date().toISOString()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export async function unlockWallet() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    throw new Error('No wallet found in storage.');
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.seed) {
      throw new Error('Wallet seed is unavailable.');
    }
    return parsed;
  } catch (e) {
    throw new Error('Wallet data is corrupted.');
  }
}

export async function deleteStoredWallet() {
  localStorage.removeItem(STORAGE_KEY);
}
