import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';

const STORAGE_KEY = 'adrenaline.wallet.v2';
let nativeStored = false;

export async function initializeSecureStorage() {
  try {
    await SecureStorage.setKeyPrefix('adrenaline_');
    nativeStored = (await SecureStorage.get(STORAGE_KEY)) !== null;
    return nativeStored;
  } catch {
    nativeStored = false;
    return false;
  }
}

export async function hasStoredWallet() {
  try {
    nativeStored = (await SecureStorage.get(STORAGE_KEY)) !== null;
  } catch {
    nativeStored = false;
  }
  return nativeStored;
}

export async function saveWallet(wallet) {
  if (!wallet?.seed) throw new Error('Wallet seed is unavailable.');
  await SecureStorage.set(STORAGE_KEY, {
    version: 2,
    address: wallet.address,
    seed: wallet.seed,
    publicKey: wallet.publicKey,
    createdAt: new Date().toISOString()
  }, false, false);
  nativeStored = true;
}

export async function unlockWallet() {
  const check = await BiometricAuth.checkBiometry();
  if (!check.isAvailable && !check.strongBiometryIsAvailable) {
    throw new Error('Biometric authentication is not available. Enable fingerprint/face or a secure device credential.');
  }

  await BiometricAuth.authenticate({
    reason: 'Unlock your Adrenaline Wallet',
    allowDeviceCredential: true,
    androidTitle: 'Unlock Adrenaline Wallet',
    androidSubtitle: 'Authenticate to access your XRPL wallet',
    androidConfirmationRequired: true
  });

  const stored = await SecureStorage.get(STORAGE_KEY);
  if (!stored || typeof stored !== 'object' || !stored.seed) {
    throw new Error('No valid secure wallet is stored on this device.');
  }
  return stored;
}

export async function deleteStoredWallet() {
  await SecureStorage.setKeyPrefix('adrenaline_');
  await SecureStorage.set(STORAGE_KEY, null);
  nativeStored = false;
}
