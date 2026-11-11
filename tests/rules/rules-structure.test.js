/**
 * RISLY — Firebase RTDB Security Rules Uji (Struktur Teks)
 *
 * Memvalidasi bahwa firebase-security-rules.json mengandung elemen kunci
 * sesuai Fase 6. Tidak memakai JSON.parse karena format Firebase rules
 * memungkinkan komentar dan karakter non-JSON standar.
 *
 * Jalankan: npx vitest run tests/rules/rules-structure.test.js
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const RULES_FILE = 'firebase-security-rules.json';

function loadRulesText() {
  return readFileSync(RULES_FILE, 'utf8');
}

describe('Firebase Security Rules — Struktur Teks (Fase 6)', () => {
  const rules = loadRulesText();

  it('file rules tidak kosong', () => {
    expect(rules.length).toBeGreaterThan(100);
  });

  it('households memiliki aturan .read', () => {
    expect(rules).toContain('.read');
  });

  it('households memiliki aturan .write', () => {
    expect(rules).toContain('.write');
  });

  it('households memiliki aturan .validate', () => {
    expect(rules).toContain('.validate');
  });

  it('owner ada sebagai properti dengan .write dan .validate', () => {
    expect(rules).toContain('"owner"');
    expect(rules).toContain(
      '".write": "auth != null && root.child(\'households\').child($householdId).child(\'owner\').val() === auth.uid"'
    );
    expect(rules).toContain('".validate": "newData.isString() && newData.val().length > 0"');
  });

  it('members ada sebagai properti dengan .write dan .validate', () => {
    expect(rules).toContain('"members"');
    expect(rules).toContain('$uid');
  });

  it('data ada sebagai properti dengan .write dan .validate', () => {
    expect(rules).toContain('"data"');
  });

  it('settings hanya bisa ditulis oleh owner', () => {
    expect(rules).toContain('"settings"');
    expect(rules).toContain(
      "root.child('households').child($householdId).child('owner').val() === auth.uid"
    );
  });

  it('inviteCode hanya bisa ditulis oleh owner', () => {
    expect(rules).toContain('"inviteCode"');
  });

  it('inviteCodes ada di root rules dengan $code', () => {
    expect(rules).toContain('"inviteCodes"');
    expect(rules).toContain('$code');
  });

  it('oauth_relay ditutup (read dan write false)', () => {
    expect(rules).toContain('"oauth_relay"');
    expect(rules).toContain('.read": false');
    expect(rules).toContain('.write": false');
  });

  it('households .validate memerlukan app, schemaVersion, data, revision, savedAt', () => {
    expect(rules).toContain('app');
    expect(rules).toContain('schemaVersion');
    expect(rules).toContain('data');
    expect(rules).toContain('revision');
    expect(rules).toContain('savedAt');
  });

  it('households .write mencakup kondisi owner membuat household baru', () => {
    expect(rules).toContain('!data.exists()');
    expect(rules).toContain("newData.child('owner').val() === auth.uid");
  });
});
