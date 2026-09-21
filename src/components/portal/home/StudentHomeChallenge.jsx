import React from 'react';
import StudentHomeAction from './StudentHomeAction';
import StudentHomeStatus from './StudentHomeStatus';
import RankingPointsValue from '@/components/points/RankingPointsValue';

export default function StudentHomeChallenge({ challenge, onOpen, error, onRetry }) {
  const finished = ['completed', 'failed'].includes(challenge?.attempt?.status);
  return <section className="student-home-challenge"><div className="student-home-challenge-main"><div className="student-home-puzzle" aria-hidden="true"><i/><i/><i/><i/></div><div><h2>التحدي اليومي</h2>{challenge?.attempt?.gameLabel && <p>{challenge.attempt.gameLabel}</p>}</div></div><div className="student-home-challenge-actions">{challenge && <span className="student-challenge-reward" aria-label={`مكافأة التحدي ${challenge.points} نقطة`}><RankingPointsValue value={challenge.points} iconClassName="h-6 w-6" /></span>}{error ? <StudentHomeStatus message="تعذر تحديث التحدي." onRetry={onRetry} /> : <StudentHomeAction onClick={onOpen}>{finished ? 'عرض النتيجة' : 'ابدأ التحدي'}</StudentHomeAction>}</div></section>;
}
