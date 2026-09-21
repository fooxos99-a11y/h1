import { blockedNazemError, reviewNazemError } from './errors.js';

// Read the remote day before deciding whether a local attempt still needs sending.
export async function submitWithNazemAuthority({ adapter, studentLink, planLink, mapped, applyAttendance, importDay }) {
  const adopt = async (state) => {
    if (state.attendanceStatus != null) {
      mapped.attendanceStatus = state.attendanceStatus;
      await applyAttendance({ date: state.attendanceDate || mapped.date, attendanceStatus: state.attendanceStatus });
    }
    if (!state.final) return null;
    // A final remote result may predate this local attempt. Compare before importing.
    adapter.verifyRecitationResult(state.day, mapped);
    const result = await importDay(state.day);
    if (!result.synced) {
      throw reviewNazemError('تعذر مطابقة متابعة ناظم بورد الطالب؛ لم تُرسل النتيجة المحلية.', 'NAZEM_REMOTE_DAILY_RANGE_UNMATCHED');
    }
    return { authoritative: true, externalId: String(state.day.id), attendanceStatus: state.attendanceStatus };
  };
  const state = await adapter.readRecitationAuthority(studentLink, planLink, mapped);
  const existing = await adopt(state);
  if (existing) return existing;
  if (mapped.taskType === 'link' && state.linkAlreadyRecorded) {
    return { externalId: `link:${state.linkRecordId}`, alreadyRecorded: true,
      status: Number(mapped.linkCount) > 0 ? 'completed' : 'not_completed', metrics: { link: Number(mapped.linkCount) } };
  }
  if (mapped.attendanceStatus == null) {
    throw reviewNazemError('حضور الطالب غير مسجل لهذا اليوم في ناظم أو المنصة.', 'RUWASI_ATTENDANCE_MISSING');
  }
  if ([3, 4].includes(Number(mapped.attendanceStatus))) {
    throw blockedNazemError('لا يمكن إرسال تسميع لطالب حالته غائب أو مستأذن في ناظم.', 'NAZEM_ATTENDANCE_BLOCKS_RECITATION');
  }
  try {
    return await adapter.submitRecitation(studentLink, planLink, mapped);
  } catch (error) {
    if (error.syncStatus !== 'conflict') throw error;
    // Another teacher may have finalized the remote day between reading and saving.
    const latest = await adopt(await adapter.readRecitationAuthority(studentLink, planLink, mapped));
    if (latest) return latest;
    throw error;
  }
}
