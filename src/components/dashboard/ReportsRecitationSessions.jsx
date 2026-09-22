import React, { useMemo } from 'react';
import RecitationAyahMarks from '@/components/portal/RecitationAyahMarks';
import { getRecitationStatusLabel } from '@/lib/recitationEvaluation';
import { getQuranTaskLabel } from '@/lib/quranTaskLabels';

const formatNumber = (value = 0) => Number(value || 0).toLocaleString('ar-SA-u-nu-latn');

const statusClassName = (row) => {
  if (getRecitationStatusLabel(row) === 'لم يُستكمل') {
    return 'text-amber-600 dark:text-amber-300';
  }
  if (row.executionState === 'extra') {
    return 'text-sky-600 dark:text-sky-300';
  }
  if (row.executionState === 'partial') {
    return 'text-amber-600 dark:text-amber-300';
  }
  if (row.teacherCompleted === true) {
    return 'text-emerald-600 dark:text-emerald-300';
  }
  if (row.teacherCompleted === false) {
    return 'text-red-600 dark:text-red-300';
  }
  return 'text-muted-foreground';
};

const ReportsRecitationSessions = ({ rows = [] }) => {
  const studentCards = useMemo(() => {
    const cards = [];
    const cardMap = new Map();

    rows.forEach((row) => {
      const studentKey = String(row.studentId || row.studentName || 'student');
      if (!cardMap.has(studentKey)) {
        const card = {
          key: studentKey,
          studentName: row.studentName || '-',
          committeeName: row.committeeName || 'بدون حلقة',
          sessions: [],
          sessionMap: new Map(),
        };
        cardMap.set(studentKey, card);
        cards.push(card);
      }

      const card = cardMap.get(studentKey);
      const sessionDate = row.sessionDate || row.taskDate || '-';
      if (!card.sessionMap.has(sessionDate)) {
        const session = { date: sessionDate, items: [] };
        card.sessionMap.set(sessionDate, session);
        card.sessions.push(session);
      }
      card.sessionMap.get(sessionDate).items.push(row);
    });

    return cards.map(({ sessionMap: _sessionMap, ...card }) => card);
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-primary/20 p-8 text-center text-muted-foreground">
        لا توجد جلسات تسميع ضمن الفترة المحددة.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3" dir="rtl">
        {studentCards.map((student) => (
          <article key={student.key} className="rounded-xl border border-primary/15 bg-background/80 p-3 shadow-sm shadow-primary/5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-primary/10 pb-2">
              <h3 className="text-base font-black text-foreground">
                <span className="text-primary">الطالب:</span> {student.studentName}
              </h3>
              <p className="text-xs font-bold text-muted-foreground">{student.committeeName}</p>
            </div>

            <div className="divide-y divide-primary/10">
              {student.sessions.map((session) => (
                <div key={session.date} className="py-1.5">
                  <div className="space-y-1">
                    {session.items.map((row) => (
                      <div key={row.id} className="overflow-hidden rounded-md border border-primary/10 bg-card/55">
                        <div className="grid min-w-0 gap-1 p-2 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                          <span className="text-xs font-black text-primary">{session.date}</span>
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="min-w-0 whitespace-normal text-sm font-black text-foreground">
                              {row.taskType === 'repeat' ? 'تكرار' : (row.actualPreview || row.preview || '-')}
                            </span>
                            {row.taskType !== 'repeat' && (
                              <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-black text-primary">
                                {getQuranTaskLabel(row)}
                              </span>
                            )}
                            {!row.nazemSource && (
                              <span className="rounded-full border border-primary/15 px-2 py-0.5 text-[11px] font-black text-muted-foreground">
                                المحاولة {formatNumber(row.attemptNumber || 1)}
                              </span>
                            )}
                            {row.nazemSource && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-black text-primary">ناظم</span>}
                            {row.taskType === 'memorization' && (
                              <>
                                <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-black text-violet-600">التكرار {formatNumber(row.actualRepeatCount)}</span>
                                <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-black text-cyan-700">السماع {Number(row.actualListeningCount || 0) > 0 ? 'نعم' : 'لا'}</span>
                              </>
                            )}
                            {Number(row.normalFaces || 0) > 0 && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-black text-emerald-600">طبيعي {formatNumber(row.normalFaces)} وجه</span>}
                            {!row.nazemSource && Number(row.compensationFaces || 0) > 0 && <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[11px] font-black text-orange-600">تعويض {formatNumber(row.compensationFaces)} وجه</span>}
                            {!row.nazemSource && Number(row.extraFaces || 0) > 0 && <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-black text-sky-600">زيادة {formatNumber(row.extraFaces)} وجه</span>}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-muted-foreground sm:justify-end">
                            {getRecitationStatusLabel(row) && (
                              <span className={`font-black ${statusClassName(row)}`}>{getRecitationStatusLabel(row)}</span>
                            )}
                            <span>{row.teacherName || '-'}</span>
                            {row.evaluatedAt && <span>{row.evaluatedAt.split(' ')[1]}</span>}
                            <span>أخطاء {formatNumber(row.mistakeCount)}</span>
                            <span>تنبيهات {formatNumber(row.warningCount)}</span>
                            {row.evaluationScore !== null && row.evaluationScore !== undefined && (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-black text-primary">
                                الدرجة {formatNumber(row.evaluationScore)} / {formatNumber(row.evaluationMaxScore || 100)}
                              </span>
                            )}
                          </div>
                        </div>
                        <RecitationAyahMarks
                          marks={row.ayahMarks}
                          historical={Boolean(row.marksFromPreviousAttempt)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default ReportsRecitationSessions;
