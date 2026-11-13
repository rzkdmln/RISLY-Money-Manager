import { describe, it, expect } from 'vitest';
import { shouldShowSyncWarning, syncWarning } from '../../js/ui/sync-warning.js';

const baseStatus = {
  provider: 'firebase',
  connected: false,
  initializing: false,
  state: 'idle',
};

describe('sync warning', () => {
  it('tidak tampil saat provider lokal', () => {
    expect(shouldShowSyncWarning({ ...baseStatus, provider: 'local' })).toBe(false);
    expect(syncWarning({ ...baseStatus, provider: 'local' })).toBe('');
  });

  it('tidak tampil saat handshake awal masih berjalan', () => {
    expect(shouldShowSyncWarning({ ...baseStatus, initializing: true })).toBe(false);
    expect(syncWarning({ ...baseStatus, initializing: true })).toBe('');
  });

  it('tidak tampil saat sedang connecting atau syncing', () => {
    expect(shouldShowSyncWarning({ ...baseStatus, state: 'connecting' })).toBe(false);
    expect(shouldShowSyncWarning({ ...baseStatus, state: 'syncing' })).toBe(false);
  });

  it('tidak tampil saat sudah terhubung', () => {
    expect(shouldShowSyncWarning({ ...baseStatus, connected: true, state: 'synced' })).toBe(false);
  });

  it('tampil setelah inisialisasi selesai tetapi belum terhubung', () => {
    expect(shouldShowSyncWarning(baseStatus)).toBe(true);
    expect(shouldShowSyncWarning({ ...baseStatus, state: 'error' })).toBe(true);
    expect(shouldShowSyncWarning({ ...baseStatus, state: 'offline' })).toBe(true);
    expect(syncWarning(baseStatus)).toContain('Sinkronisasi belum aktif');
    expect(syncWarning(baseStatus)).toContain('data-action="sync-now"');
  });
});
