import React from 'react';
import { SUBTLE_HEX_PATTERN } from './letterHiveData';

const LetterHiveBackground = () => (
  <div className="letter-hive-bg" aria-hidden="true">
    <div className="letter-hive-bg-radials" />
    <div className="letter-hive-bg-red" />
    <div className="letter-hive-bg-green" />
    <div className="letter-hive-bg-glass" />
    <div className="letter-hive-bg-glass-inner" />
    <div className="letter-hive-bg-pattern" style={{ backgroundImage: SUBTLE_HEX_PATTERN }} />
  </div>
);

export default LetterHiveBackground;
