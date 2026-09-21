import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getNazemQuranPosition,
  normalizeQuranSurahName,
} from '../server/integrations/nazem/quranPosition.js';
import { normalizeRemotePlanSnapshot } from '../server/integrations/nazem/service.js';

test('Nazem Quran positions tolerate Arabic spelling variants and سورة prefix', async () => {
  const connection = {
    async query(sql, params = []) {
      if (sql.includes('FROM quran_surahs')) {
        return [[
          { surah: 17, name: 'الإسراء' },
          { surah: 34, name: 'سبأ' },
        ]];
      }
      assert.deepEqual(params, [17, 1]);
      return [[{ page: 282, surah: 17, ayah: 1 }]];
    },
  };

  assert.equal(normalizeQuranSurahName(' سُورَةُ الإسراء '), 'الاسرا');
  assert.deepEqual(
    await getNazemQuranPosition(connection, 'سورة بني إسرائيل', '١'),
    { page: 282, surah: 17, ayah: 1 },
  );
});

test('empty Nazem revision cards are ignored during plan import', () => {
  const snapshot = normalizeRemotePlanSnapshot({
    externalId: '51',
    primary: {
      tab: 'الحفظ',
      amount: 'وجه كامل',
      startSurah: 'البقرة',
      startAyah: 1,
      endSurah: 'البقرة',
      endAyah: 10,
    },
    revision: {
      tab: 'المراجعة',
      startSurah: '',
      startAyah: 0,
      endSurah: '',
      endAyah: 0,
    },
  });

  assert.equal(snapshot.revision, null);
});
