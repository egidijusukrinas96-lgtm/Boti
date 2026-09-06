package com.adrenaline.wallet;

import android.app.Activity;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.Executor;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureStorage")
public class SecureStoragePlugin extends Plugin {
    private static final String STORE = "AndroidKeyStore";
    private static final String ALIAS = "adrenaline_wallet_key_v1";
    private static final String PREFS = "adrenaline_secure_storage";
    private static final String DATA = "ciphertext";
    private static final String IV = "iv";

    @Override
    public void load() {
        super.load();
        ensureKey();
    }

    private SecretKey ensureKey() {
        try {
            KeyStore ks = KeyStore.getInstance(STORE);
            ks.load(null);
            if (ks.containsAlias(ALIAS)) return ((SecretKey) ks.getKey(ALIAS, null));
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, STORE);
            KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
                    ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .setUserAuthenticationRequired(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                builder.setUserAuthenticationParameters(
                        0,
                        KeyProperties.AUTH_BIOMETRIC_STRONG | KeyProperties.AUTH_DEVICE_CREDENTIAL);
            } else {
                builder.setUserAuthenticationValidityDurationSeconds(-1);
            }
            generator.init(builder.build());
            return generator.generateKey();
        } catch (Exception e) {
            throw new IllegalStateException("Unable to initialize Android Keystore", e);
        }
    }

    @PluginMethod
    public void canAuthenticate(PluginCall call) {
        int result = BiometricManager.from(getContext()).canAuthenticate(
                BiometricManager.Authenticators.BIOMETRIC_STRONG |
                BiometricManager.Authenticators.DEVICE_CREDENTIAL);
        JSObject ret = new JSObject();
        ret.put("available", result == BiometricManager.BIOMETRIC_SUCCESS);
        ret.put("code", result);
        call.resolve(ret);
    }

    @PluginMethod
    public void save(PluginCall call) {
        String value = call.getString("value");
        if (value == null) { call.reject("Missing value"); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, ensureKey());
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            getContext().getSharedPreferences(PREFS, 0).edit()
                    .putString(DATA, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                    .putString(IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                    .apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("Keystore save failed", e);
        }
    }

    @PluginMethod
    public void unlock(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) { call.reject("No Android activity"); return; }
        String encrypted = getContext().getSharedPreferences(PREFS, 0).getString(DATA, null);
        String iv = getContext().getSharedPreferences(PREFS, 0).getString(IV, null);
        if (encrypted == null || iv == null) { call.reject("No secure wallet stored"); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, ensureKey(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            BiometricPrompt.CryptoObject crypto = new BiometricPrompt.CryptoObject(cipher);
            Executor executor = ContextCompat.getMainExecutor(activity);
            BiometricPrompt prompt = new BiometricPrompt(activity, executor, new BiometricPrompt.AuthenticationCallback() {
                @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    try {
                        byte[] bytes = result.getCryptoObject().getCipher().doFinal(Base64.decode(encrypted, Base64.NO_WRAP));
                        JSObject ret = new JSObject();
                        ret.put("value", new String(bytes, StandardCharsets.UTF_8));
                        call.resolve(ret);
                    } catch (Exception e) { call.reject("Secure wallet decrypt failed", e); }
                }
                @Override public void onAuthenticationError(int errorCode, CharSequence errString) {
                    call.reject("Authentication failed: " + errString);
                }
            });
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Unlock Adrenaline Wallet")
                    .setSubtitle("Authenticate to access your wallet")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL)
                    .setConfirmationRequired(true)
                    .build();
            prompt.authenticate(crypto, new android.os.CancellationSignal(), executor, prompt.new AuthenticationCallback() {});
        } catch (Exception e) {
            call.reject("Unable to start secure unlock", e);
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        getContext().getSharedPreferences(PREFS, 0).edit().clear().apply();
        try {
            KeyStore ks = KeyStore.getInstance(STORE);
            ks.load(null);
            if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS);
        } catch (Exception ignored) { }
        call.resolve();
    }
}
