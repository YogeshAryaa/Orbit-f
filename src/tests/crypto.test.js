import { describe, it, expect } from 'vitest';
import { createDeviceKeyMaterial, encryptMessage, decryptMessage } from '../lib/crypto/messageEncryption.js';

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
});
