import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';

const STORAGE_KEY = 'adrenaline.wallet.v2';
const KEY_PREFIX = 'adrenaline_';
const AUTH_TIMEOUT_MS = 30000;
const STORAGE_TIMEOUT_MS = 10000;
let nativeStored = false;

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}

async function prepareStorage() {
  await SecureStorage.setKeyPrefix(KEY_PREFIX);
}

export async function initializeSecureStorage() {
  try {
    await prepareStorage();
    const stored = await withTimeout(
      SecureStorage.get(STORAGE_KEY),
      STORAGE_TIMEOUT_MS,
      'Secure storage did not respond. Restart the app and try again.'
    );
    nativeStored = stored !== null;
    return nativeStored;
  } catch {
    nativeStored = false;
    return false;
  }
}

export async function hasStoredWallet() {
  try {
    await prepareStorage();
    const stored = await withTimeout(
      SecureStorage.get(STORAGE_KEY),
      STORAGE_TIMEOUT_MS,
      'Secure storage did not respond.'
    );
    nativeStored = stored !== null;
  } catch {
    nativeStored = false;
  }
  return nativeStored;
}

export async function saveWallet(wallet) {
  if (!wallet?.seed) throw new Error('Wallet seed is unavailable.');
  await prepareStorage();
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
  await prepareStorage();

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
    stored = await withTimeout(
      SecureStorage.get(STORAGE_KEY),
      STORAGE_TIMEOUT_MS,
      'Authentication succeeded, but secure wallet storage did not respond.'
    );
  } catch (error) {
    throw new Error(error?.message || 'Could not read the secure wallet after authentication.');
  }

  if (!stored || typeof stored !== 'object' || !stored.seed) {
    throw new Error('Authentication succeeded, but no valid wallet was found on this device.');
  }

  nativeStored = true;
  return stored;
}

export async function deleteStoredWallet() {
  await prepareStorage();
  await withTimeout(
    SecureStorage.remove(STORAGE_KEY),
    STORAGE_TIMEOUT_MS,
    'Could not delete the secure wallet.'
  );
  nativeStored = false;
}
