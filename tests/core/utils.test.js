import {
  describe, it, expect,
} from 'vitest';
import {
  expressionResult,
  evaluateExpression,
  formatCurrency,
  formatNumber,
  formatDate,
  formatMonth,
  parseDateDMY,
  formatDateDMY,
  sanitizeNoteHTML,
  stripHTML,
  escapeHTML,
  deepClone,
  debounce,
  throttle,
  groupBy,
  sortBy,
  unique,
  sum,
  clamp,
  safeNumber,
  toNumber,
  localDateISO,
  todayISO,
  monthKey,
  monthRange,
  relativeDay,
  timeAgo,
  setPrivacyHidden,
} from '../../js/core/utils.js';

/* -------------------------------------------------------------------------- */
/*  expressionResult / evaluateExpression                                     */
/* -------------------------------------------------------------------------- */

describe('expressionResult / evaluateExpression', () => {
  it('mengembalikan null untuk string kosong', () => {
    expect(expressionResult('')).toBeNull();
    expect(expressionResult('   ')).toBeNull();
  });

  it('menghitung penjumlahan dasar', () => {
    expect(expressionResult('2+3')).toBe(5);
    expect(expressionResult('10-4')).toBe(6);
    expect(expressionResult('3*4')).toBe(12);
    expect(expressionResult('10/2')).toBe(5);
  });

  it('menghandle kurung dan prioritas operator', () => {
    expect(expressionResult('(2+3)*4')).toBe(20);
    expect(expressionResult('2+3*4')).toBe(14);
    expect(expressionResult('10/2+3')).toBe(8);
  });

  it('mengembalikan null bagi pembagian nol', () => {
    expect(expressionResult('5/0')).toBeNull();
  });

  it('mengembalikan null untuk karakter tidak valid', () => {
    expect(expressionResult('2 + abc')).toBeNull();
    expect(expressionResult('2 && 3')).toBeNull();
  });

  it('mengonversi notasi Indonesia (titik ribuan, koma desimal)', () => {
    expect(expressionResult('1.000.000+250.000')).toBe(1250000);
    expect(expressionResult('1.500,50+250,25')).toBe(1750.75);
  });

  it('mengonversi simbol perkalian/pembagian Indonesia', () => {
    expect(expressionResult('6×7')).toBe(42);
    expect(expressionResult('20÷4')).toBe(5);
    expect(expressionResult('5−3')).toBe(2);
  });

  it('mengembalikan 0 untuk ekspresi kosong via evaluateExpression', () => {
    expect(evaluateExpression('')).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  formatCurrency / formatNumber                                             */
/* -------------------------------------------------------------------------- */

describe('formatCurrency', () => {
  it('memformat angka biasa dengan Rp', () => {
    expect(formatCurrency(150000)).toContain('Rp');
    expect(formatCurrency(150000)).toContain('150.000');
  });

  it('memformat angka negatif', () => {
    expect(formatCurrency(-50000)).toContain('-Rp');
    expect(formatCurrency(-50000)).toContain('50.000');
  });

  it('menyembunyikan nominal saat privacyHidden aktif', () => {
    setPrivacyHidden(true);
    expect(formatCurrency(150000)).toBe('Rp ••••••');
    setPrivacyHidden(false);
  });

  it('mengembalikan Rp 0 untuk nol', () => {
    expect(formatCurrency(0)).toContain('Rp');
  });
});

describe('formatNumber', () => {
  it('memformat dengan pemisah ribuan', () => {
    expect(formatNumber(1000000)).toBe('1.000.000');
  });
});

/* -------------------------------------------------------------------------- */
/*  formatDate / formatDateLong / formatMonth                                 */
/* -------------------------------------------------------------------------- */

describe('formatDate', () => {
  it('memformat tanggal ISO', () => {
    const result = formatDate('2025-01-15');
    expect(result).toContain('15');
    expect(result).toContain('2025');
  });

  it('mengembalikan "—" untuk tanggal tidak valid', () => {
    expect(formatDate('')).toBe('—');
    expect(formatDate('invalid')).toBe('—');
  });
});

describe('formatMonth', () => {
  it('memformat bulan dan tahun', () => {
    expect(formatMonth('2025-03')).toContain('2025');
  });
});

describe('parseDateDMY / formatDateDMY', () => {
  it('mengonversi dd/mm/yyyy ke YYYY-MM-DD', () => {
    expect(parseDateDMY('15/03/2025')).toBe('2025-03-15');
  });

  it('mengembalikan string kosong untuk tanggal tidak valid', () => {
    expect(parseDateDMY('99/99/9999')).toBe('');
    expect(parseDateDMY('')).toBe('');
  });

  it('menerima YYYY-MM-DD as-is', () => {
    expect(parseDateDMY('2025-03-15')).toBe('2025-03-15');
  });

  it('formatDateDMY mengembalikan dd/mm/yyyy', () => {
    expect(formatDateDMY('2025-03-15')).toBe('15/03/2025');
  });
});

/* -------------------------------------------------------------------------- */
/*  sanitizeNoteHTML / stripHTML / escapeHTML                                 */
/* -------------------------------------------------------------------------- */

describe('sanitizeNoteHTML', () => {
  it('menag ge tag yang diizinkan', () => {
    expect(sanitizeNoteHTML('<b>halo</b> <i>dunia</i>')).toContain('halo');
    expect(sanitizeNoteHTML('<b>halo</b>')).toContain('<b>');
  });

  it('menghapus tag berbahaya (script, iframe, img)', () => {
    const dirty = '<script>alert(1)</script><b>aman</b>';
    const clean = sanitizeNoteHTML(dirty);
    expect(clean).not.toContain('<script>');
    expect(clean).not.toContain('alert');
    expect(clean).toContain('aman');
  });

  it('menghapus atribut dari semua tag', () => {
    const clean = sanitizeNoteHTML('<b style="color:red" onclick="x()">halo</b>');
    expect(clean).not.toContain('style=');
    expect(clean).not.toContain('onclick=');
    expect(clean).toContain('halo');
  });

  it('mengembalikan string kosong untuk input kosong', () => {
    expect(sanitizeNoteHTML('')).toBe('');
    expect(sanitizeNoteHTML(null)).toBe('');
  });
});

describe('stripHTML', () => {
  it('mengembalikan teks polos dari HTML', () => {
    expect(stripHTML('<b>halo</b> <i>dunia</i>')).toBe('halo dunia');
  });
});

describe('escapeHTML', () => {
  it('meng-escape karakter HTML', () => {
    expect(escapeHTML('<script>')).toBe('&lt;script&gt;');
    expect(escapeHTML('"&"')).toBe('&quot;&amp;&quot;');
  });
});

/* -------------------------------------------------------------------------- */
/*  deepClone / debounce / throttle                                           */
/* -------------------------------------------------------------------------- */

describe('deepClone', () => {
  it('meng-clone objek dalam', () => {
    const original = { a: 1, b: { c: 2 }, d: [1, 2, 3] };
    const clone = deepClone(original);
    expect(clone).toEqual(original);
    clone.b.c = 999;
    expect(original.b.c).toBe(2);
  });
});

describe('debounce', () => {
  it('menunda pemanggilan fungsi', async () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d();
    d();
    d();
    expect(fn).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 100));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('throttle', () => {
  it('membatasi frekwensi pemanggilan', async () => {
    const fn = vi.fn();
    const t = throttle(fn, 50);
    t();
    t();
    t();
    expect(fn).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 100));
    t();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

/* -------------------------------------------------------------------------- */
/*  groupBy / sortBy / unique / sum / clamp / safeNumber / toNumber          */
/* -------------------------------------------------------------------------- */

describe('groupBy', () => {
  it('mengelompokkan items berdasarkan kunci', () => {
    const items = [
      { type: 'a', val: 1 },
      { type: 'b', val: 2 },
      { type: 'a', val: 3 },
    ];
    expect(groupBy(items, (i) => i.type)).toEqual({
      a: [{ type: 'a', val: 1 }, { type: 'a', val: 3 }],
      b: [{ type: 'b', val: 2 }],
    });
  });
});

describe('sortBy', () => {
  it('mengurutkan ascending dan descending', () => {
    const items = [{ v: 3 }, { v: 1 }, { v: 2 }];
    expect(sortBy(items, (i) => i.v, 'asc').map((i) => i.v)).toEqual([1, 2, 3]);
    expect(sortBy(items, (i) => i.v, 'desc').map((i) => i.v)).toEqual([3, 2, 1]);
  });
});

describe('unique', () => {
  it('menghapus duplikat', () => {
    expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
    expect(unique(['a', '', 'b', ''])).toEqual(['a', 'b']);
  });
});

describe('sum', () => {
  it('menjumlahkan nilai dengan safeNumber', () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(sum([1, null, undefined, 'invalid'])).toBe(1);
  });
});

describe('clamp', () => {
  it('membatasi nilai antara min dan max', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe('safeNumber / toNumber', () => {
  it('mengembalikan fallback untuk nilai tidak valid', () => {
    expect(safeNumber('abc')).toBe(0);
    expect(safeNumber('abc', 42)).toBe(42);
    expect(toNumber('1.500')).toBe(1500);
    expect(toNumber('invalid', 99)).toBe(99);
  });
});

/* -------------------------------------------------------------------------- */
/*  localDateISO / todayISO / monthKey / monthRange                           */
/* -------------------------------------------------------------------------- */

describe('localDateISO', () => {
  it('mengembalikan YYYY-MM-DD tanpa shift zona waktu', () => {
    const d = new Date('2025-03-15T10:30:00Z');
    expect(localDateISO(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('monthKey', () => {
  it('mengembalikan YYYY-MM', () => {
    expect(monthKey('2025-03-15')).toBe('2025-03');
  });
});

describe('monthRange', () => {
  it('mengembalikan range awal dan akhir bulan', () => {
    const range = monthRange('2025-02');
    expect(range.start).toBe('2025-02-01');
    expect(range.end).toBe('2025-02-28');
    expect(range.days).toBe(28);
  });
});

/* -------------------------------------------------------------------------- */
/*  relativeDay / timeAgo                                                     */
/* -------------------------------------------------------------------------- */

describe('relativeDay', () => {
  it('mengembalikan "Hari ini" untuk hari ini', () => {
    expect(relativeDay(todayISO())).toBe('Hari ini');
  });
});

describe('timeAgo', () => {
  it('mengembalikan "Baru saja" untuk waktu terdekat', () => {
    expect(timeAgo(new Date().toISOString())).toBe('Baru saja');
  });
});
