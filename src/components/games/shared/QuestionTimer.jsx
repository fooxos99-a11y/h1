import React, { useEffect, useState } from 'react';

const QUESTION_TIMER_SECONDS = 60;

const QuestionTimer = ({ resetKey, className = '' }) => {
  const [seconds, setSeconds] = useState(QUESTION_TIMER_SECONDS);

  useEffect(() => {
    setSeconds(QUESTION_TIMER_SECONDS);
    const timer = setInterval(() => {
      setSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [resetKey]);

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = String(seconds % 60).padStart(2, '0');

  return (
    <div className={`question-timer ${seconds === 0 ? 'is-ended' : ''} ${className}`}>
      {minutes}:{remainingSeconds}
    </div>
  );
};

export default QuestionTimer;
