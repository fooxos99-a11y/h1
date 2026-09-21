import React from 'react';
import { Award, Crown } from 'lucide-react';
import RankingPointsValue from '@/components/points/RankingPointsValue';

export default function StudentRankingList({ rows, family, showPoints, studentId, limit = 5 }) {
  return rows.length ? <ol className="student-home-rank-list">{rows.slice(0, limit).map((row) => <li key={row.id} data-rank={row.rank} data-self={!family && String(row.id) === String(studentId)}>
    <span className="student-home-rank-medal" aria-label={`المركز ${row.rank}`}>{row.rank === 1 ? <Crown size={21} /> : row.rank <= 3 ? <Award size={21} /> : Number(row.rank).toLocaleString('ar-SA-u-nu-latn')}<small>{row.rank <= 3 ? Number(row.rank).toLocaleString('ar-SA-u-nu-latn') : ''}</small></span>
    <span className="student-home-rank-name"><strong>{row.name}</strong>{!family && row.committeeName && <small>{row.committeeName}</small>}</span>
    {showPoints && <RankingPointsValue wholeNumber={family} value={row.points} className="student-rank-points" iconClassName="h-4 w-4" />}
  </li>)}</ol> : <p className="student-home-empty">لا توجد بيانات ترتيب حاليًا.</p>;
}
