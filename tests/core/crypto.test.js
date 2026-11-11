import {
  describe, it, expect,
} from 'vitest';
import {
  createEncryptionCredentials,
  encryptWorkspace,
  decryptWorkspace,
  encryptBackup,
  decryptBackup,
  verifyPinAgainstVerifier,
  ENC_ITERATIONS,
} from '../../js/core/crypto.js';

/* -------------------------------------------------------------------------- */
/*  createEncryptionCredentials                                               */
/* -------------------------------------------------------------------------- */

describe('crypto.createEncryptionCredentials', () => {
  it('menghasilkan salt, verifier, dan kunci CryptoKey', async () => {
    const result = await createEncryptionCredentials('123456');
    expect(result.salt).toBeDefined();
    expect(result.iterations).toBe(ENC_ITERATIONS);
    expect(result.verifier).toBeDefined();
    expect(result.key).toBeDefined();
    expect(typeof result.key).toBe('object');
  });

  it('salt berbeda setiap pemanggilan (acak)', async () => {
    const a = await createEncryptionCredentials('123456');
    const b = await createEncryptionCredentials('123456');
    expect(a.salt).not.toBe(b.salt);
  });

  it('verifier berbeda untuk PIN berbeda', async () => {
    const a = await createEncryptionCredentials('111111');
    const b = await createEncryptionCredentials('222222');
    expect(a.verifier).not.toBe(b.verifier);
  });
});

/* -------------------------------------------------------------------------- */
/*  encryptWorkspace / decryptWorkspace                                       */
/* -------------------------------------------------------------------------- */

describe('crypto.encryptWorkspace / decryptWorkspace', () => {
  it('enkripsi lalu dekripsi mengembalikan data asli', async () => {
    const data = { hello: 'world', number: 42, list: [1, 2, 3] };
    const { key } = await createEncryptionCredentials('123456');

    const encrypted = await encryptWorkspace(data, key);
    expect(encrypted.encrypted).toBe(true);
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.ciphertext).toBeDefined();

    const decrypted = await decryptWorkspace(encrypted, key);
    expect(decrypted).toEqual(data);
  });

  it('data tidak terenkripsi (legacy) dikembalikan apa adanya', async () => {
    const data = { foo: 'bar' };
    const { key } = await createEncryptionCredentials('123456');

    const legacy = { data, updatedAt: '2025-01-01' };
    const decrypted = await decryptWorkspace(legacy, key);
    expect(decrypted).toEqual(data);
  });

  it('null dikembalikan null', async () => {
    const { key } = await createEncryptionCredentials('123456');
    const decrypted = await decryptWorkspace(null, key);
    expect(decrypted).toBeNull();
  });

  it('PIN salah gagal dekripsi', async () => {
    const data = { secret: 'rahasia' };
    const { key } = await createEncryptionCredentials('123456');
    const wrongKey = (await createEncryptionCredentials('654321')).key;

    const encrypted = await encryptWorkspace(data, key);
    await expect(decryptWorkspace(encrypted, wrongKey)).rejects.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/*  encryptBackup / decryptBackup                                             */
/* -------------------------------------------------------------------------- */

describe('crypto.encryptBackup / decryptBackup', () => {
  it('enkripsi backup dengan passphrase bisa dipulihkan', async () => {
    const data = { app: 'risly-money-manager', data: { foo: 'bar' } };
    const encrypted = await encryptBackup(data, 'my-secret-passphrase');
    expect(typeof encrypted).toBe('string');

    const decrypted = await decryptBackup(encrypted, 'my-secret-passphrase');
    expect(decrypted).toEqual(data);
  });

  it('passphrase salah gagal dekripsi backup', async () => {
    const data = { app: 'risly-money-manager' };
    const encrypted = await encryptBackup(data, 'correct-passphrase');
    await expect(decryptBackup(encrypted, 'wrong-passphrase')).rejects.toThrow();
  });

  it('format backup tidak valid dilempar error', async () => {
    await expect(decryptBackup('not-valid-base64-json', 'pass')).rejects.toThrow();
    await expect(decryptBackup(JSON.stringify({ foo: 'bar' }), 'pass')).rejects.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/*  verifyPinAgainstVerifier                                                  */
/* -------------------------------------------------------------------------- */

describe('crypto.verifyPinAgainstVerifier', () => {
  it('mengembalikan true untuk PIN yang cocok', async () => {
    const { verifier, salt, iterations } = await createEncryptionCredentials('123456');
    const valid = await verifyPinAgainstVerifier('123456', verifier, salt, iterations);
    expect(valid).toBe(true);
  });

  it('mengembalikan false untuk PIN yang salah', async () => {
    const { verifier, salt, iterations } = await createEncryptionCredentials('123456');
    const valid = await verifyPinAgainstVerifier('000000', verifier, salt, iterations);
    expect(valid).toBe(false);
  });

  it('mengembalikan false untuk verifier/salt kosong', async () => {
    expect(await verifyPinAgainstVerifier('123456', '', '')).toBe(false);
    expect(await verifyPinAgainstVerifier('123456', null, null)).toBe(false);
  });
});
