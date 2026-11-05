import { describe, it, expect } from 'vitest';
import {
  createDeviceKeyMaterial,
  encryptMessage,
  decryptMessage,
  exportAccountKeyBackup,
  importAccountKeyBackup
} from '../lib/crypto/messageEncryption.js';

function bundleFrom(material) {
  return {
    userId: 'recipient-user',
    deviceId: material.privateJwks.deviceId,
    identityPublicKey: material.publicRegistration.identityPublicKey,
    signedPreKeyPublic: material.publicRegistration.signedPreKeyPublic,
    signedPreKeySignature: material.publicRegistration.signedPreKeySignature,
    oneTimePreKey: material.publicRegistration.oneTimePreKeys[0],
  };
}

describe('browser crypto primitives', () => {
  it('creates public registration and private device material', async () => {
    const k = await createDeviceKeyMaterial('test-device', 2);
    expect(k.publicRegistration.deviceId).toBe('test-device');
    expect(k.publicRegistration.oneTimePreKeys).toHaveLength(2);
    expect(k.privateJwks.signedPreKeyPrivateKey).toBeTruthy();
  });

  it('encrypts a message for a registered device and decrypts it locally', async () => {
    const recipient = await createDeviceKeyMaterial('recipient-device', 2);
    const payload = await encryptMessage('private hello 🔐', 'sender-device', [bundleFrom(recipient)]);
    const clear = await decryptMessage(payload, 'recipient-device', recipient.privateJwks);
    expect(clear).toBe('private hello 🔐');
  });

  it('rejects a tampered ciphertext', async () => {
    const recipient = await createDeviceKeyMaterial('recipient-device-tamper', 1);
    const payload = await encryptMessage('do not change me', 'sender-device', [bundleFrom(recipient)]);
    payload.ciphertext = `${payload.ciphertext.slice(0, -2)}AA`;
    await expect(decryptMessage(payload, 'recipient-device-tamper', recipient.privateJwks)).rejects.toBeTruthy();
  });

  it('allows another device of the same account to view and decrypt past messages', async () => {
    // Device 1 receives an encrypted message
    const device1 = await createDeviceKeyMaterial('device-1', 2);
    const payload = await encryptMessage('historical secret message', 'sender-device', [bundleFrom(device1)]);

    // Device 2 of the same account has different deviceId but shares account private key material
    const device2 = {
      privateJwks: {
        ...device1.privateJwks,
        deviceId: 'device-2'
      }
    };

    // Device 2 decrypts the message encrypted for Device 1!
    const clearOnDevice2 = await decryptMessage(payload, 'device-2', device2.privateJwks);
    expect(clearOnDevice2).toBe('historical secret message');
  });

  it('backs up and restores account keys using password for same-account multi-device sync', async () => {
    const original = await createDeviceKeyMaterial('phone-1', 5);
    const password = 'SuperSecretAccountPassword123!';

    // Export backup
    const backup = await exportAccountKeyBackup(original, password);
    expect(backup.encryptedData).toBeTruthy();
    expect(backup.salt).toBeTruthy();
    expect(backup.iv).toBeTruthy();

    // Import on second device with correct password
    const restored = await importAccountKeyBackup(backup, password);
    expect(restored.publicRegistration.identityPublicKey).toBe(original.publicRegistration.identityPublicKey);
    expect(restored.privateJwks.signedPreKeyPrivateKey.x).toBe(original.privateJwks.signedPreKeyPrivateKey.x);

    // Fails with wrong password
    await expect(importAccountKeyBackup(backup, 'WrongPassword!')).rejects.toBeTruthy();
  });
});
