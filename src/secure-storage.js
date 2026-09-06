const STORAGE_KEY = 'adrenaline.wallet.v1';

// Best-effort encrypted-at-rest layer for the Capacitor web runtime.
// The wallet secret is never stored as plaintext. The encryption key is
// derived from a user PIN with PBKDF2 and the payload is encrypted with AES-GCM.
// For a production Mainnet release, replace this module with a native Android
// Keystore-backed Capacitor plugin so the key itself is hardware/OS protected.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function deriveKey(pin, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function saveWallet(wallet, pin) {
  if (!wallet?.seed) throw new Error('Wallet seed is unavailable.');
  if (!/^\d{6,12}$/.test(pin)) throw new Error('PIN must contain 6–12 digits.');

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  const plaintext = encoder.encode(JSON.stringify({
    address: wallet.address,
    seed: wallet.seed,
    algorithm: wallet.publicKey?.startsWith('ED') ? 'ed25519' : 'secp256k1'
  }));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: 1,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(ciphertext))
  }));
}

export function hasStoredWallet() {
  return Boolean(localStorage.getItem(STORAGE_KEY));
}

export async function unlockWallet(pin) {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error('No encrypted wallet found on this device.');
  if (!/^\d{6,12}$/.test(pin)) throw new Error('Enter your 6–12 digit PIN.');

  try {
    const record = JSON.parse(raw);
    const salt = base64ToBytes(record.salt);
    const iv = base64ToBytes(record.iv);
    const key = await deriveKey(pin, salt);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, base64ToBytes(record.data));
    return JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new Error('Incorrect PIN or corrupted wallet backup.');
  }
}

export function deleteStoredWallet() {
  localStorage.removeItem(STORAGE_KEY);
}
