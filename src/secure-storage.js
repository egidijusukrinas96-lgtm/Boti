// Unlocked version: uses localStorage instead of biometric/secure storage lock
const STORAGE_KEY = 'adrenaline.wallet.v2';

function readStoredWallet() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function initializeSecureStorage() {
  return readStoredWallet() !== null;
}

export async function hasStoredWallet() {
  return readStoredWallet() !== null;
}

export async function saveWallet(wallet) {
  if (!wallet?.seed) throw new Error('Wallet seed is unavailable.');
  const data = {
    version: 2,
    address: wallet.address,
    seed: wallet.seed,
    publicKey: wallet.publicKey,
    createdAt: new Date().toISOString()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export async function unlockWallet() {
  const stored = readStoredWallet();
  if (!stored) {
    throw new Error('No wallet found in storage.');
  }
  return stored;
}

export async function deleteStoredWallet() {
  localStorage.removeItem(STORAGE_KEY);
}
