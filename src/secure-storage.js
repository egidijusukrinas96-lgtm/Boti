import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';

const STORAGE_KEY = 'adrenaline.wallet.v2';
const KEY_PREFIX = 'adrenaline_';
const LEGACY_PREFIX = 'capacitor-storage_';
const AUTH_TIMEOUT_MS = 30000;
const STORAGE_TIMEOUT_MS = 10000;
let nativeStored = false;

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}

async function prepareStorage(prefix = KEY_PREFIX) {
  await SecureStorage.setKeyPrefix(prefix);
}

function normalizeStoredWallet(value) {
  if (!value) return null;
  if (typeof value === 'object' && value.seed) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && parsed.seed) return parsed;
    } catch {}
  }
  return null;
}

async function readStoredWallet() {
  await prepareStorage(KEY_PREFIX);
  let value = await withTimeout(
    SecureStorage.get(STORAGE_KEY),
    STORAGE_TIMEOUT_MS,
    'Secure wallet storage did not respond.'
  );
  let wallet = normalizeStoredWallet(value);
  if (wallet) return wallet;

  await prepareStorage(LEGACY_PREFIX);
  value = await withTimeout(
    SecureStorage.get(STORAGE_KEY),
    STORAGE_TIMEOUT_MS,
    'Legacy wallet storage did not respond.'
  );
  wallet = normalizeStoredWallet(value);
  if (!wallet) return null;

  await prepareStorage(KEY_PREFIX);
  await withTimeout(
    SecureStorage.set(STORAGE_KEY, wallet, false, false),
    STORAGE_TIMEOUT_MS,
    'Could not migrate the existing wallet to the current secure storage key.'
  );
  return wallet;
}

export async function initializeSecureStorage() {
  try {
    const stored = await readStoredWallet();
    nativeStored = stored !== null;
    await prepareStorage(KEY_PREFIX);
    return nativeStored;
  } catch {
    nativeStored = false;
    await prepareStorage(KEY_PREFIX).catch(() => {});
    return false;
  }
}

export async function hasStoredWallet() {
  try {
    const stored = await readStoredWallet();
    nativeStored = stored !== null;
    await prepareStorage(KEY_PREFIX);
  } catch {
    nativeStored = false;
    await prepareStorage(KEY_PREFIX).catch(() => {});
  }
  return nativeStored;
}

export async function saveWallet(wallet) {
  if (!wallet?.seed) throw new Error('Wallet seed is unavailable.');
  await prepareStorage(KEY_PREFIX);
  await withTimeout(
    SecureStorage.set(STORAGE_KEY, {
      version: 2,
      address: wallet.address,
      seed: wallet.seed,
      publicKey: wallet.publicKey,
      createdAt: new Date().toISOString()
    }, false, false),
    STORAGE_TIMEOUT_MS,
    'Could not save the wallet to secure storage.'
  );
  nativeStored = true;
}

export async function unlockWallet() {
  await prepareStorage(KEY_PREFIX);

  let check;
  try {
    check = await withTimeout(
      BiometricAuth.checkBiometry(),
      AUTH_TIMEOUT_MS,
      'Biometric check timed out. Unlock the phone and try again.'
    );
  } catch (error) {
    throw new Error(error?.message || 'Could not check biometric authentication.');
  }

  if (!check?.isAvailable && !check?.strongBiometryIsAvailable) {
    throw new Error('Biometric authentication is not available. Enable fingerprint/face or a secure device credential.');
  }

  try {
    await withTimeout(
      BiometricAuth.authenticate({
        reason: 'Unlock your Adrenaline Wallet',
        allowDeviceCredential: true,
        androidTitle: 'Unlock Adrenaline Wallet',
        androidSubtitle: 'Authenticate to access your XRPL wallet',
        androidConfirmationRequired: true
      }),
      AUTH_TIMEOUT_MS,
      'Authentication timed out. Please try the unlock button again.'
    );
  } catch (error) {
    throw new Error(error?.message || 'Authentication was cancelled or failed.');
  }

  let stored;
  try {
    stored = await readStoredWallet();
  } catch (error) {
    throw new Error(error?.message || 'Could not read the secure wallet after authentication.');
  }

  if (!stored) {
    throw new Error('Authentication succeeded, but no valid wallet data exists in secure storage. If this app was uninstalled/reinstalled or app data was cleared, restore the wallet with your recovery phrase.');
  }

  nativeStored = true;
  await prepareStorage(KEY_PREFIX);
  return stored;
}

export async function deleteStoredWallet() {
  await prepareStorage(KEY_PREFIX);
  await withTimeout(
    SecureStorage.remove(STORAGE_KEY),
    STORAGE_TIMEOUT_MS,
    'Could not delete the secure wallet.'
  );
  await prepareStorage(LEGACY_PREFIX).catch(() => {});
  await withTimeout(SecureStorage.remove(STORAGE_KEY), STORAGE_TIMEOUT_MS, 'Could not delete legacy wallet data.').catch(() => {});
  await prepareStorage(KEY_PREFIX);
  nativeStored = false;
}
