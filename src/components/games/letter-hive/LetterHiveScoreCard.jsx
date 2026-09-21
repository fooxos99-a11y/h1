import React from 'react';
import useRewardUnits from '@/hooks/useRewardUnits';

const LetterHiveScoreCard = ({ name, score, color, side }) => {
  const rewardUnits = useRewardUnits();
  return (
  <div
    className="letter-hive-score-card"
    style={{
      borderColor: color,
      borderRadius: side === 'left' ? '42px 14px 14px 42px' : '14px 42px 42px 14px',
      boxShadow: `0 14px 30px -8px ${color}33`,
    }}
  >
    <div className="letter-hive-score-badge" style={{ background: color }}>
      {side === 'left' ? 'الفريق الثاني' : 'الفريق الأول'}
    </div>
    <div className="letter-hive-score-name">{name}</div>
    <div className="letter-hive-score-value" style={{ color }}>{score}</div>
    <div className="letter-hive-score-label">{rewardUnits.short}</div>
  </div>
  );
};

export default LetterHiveScoreCard;
