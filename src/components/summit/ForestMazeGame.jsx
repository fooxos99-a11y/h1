import React, { useId, useRef, useState } from 'react';

const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

const segmentPoints = (from, to, step = 1.25) => {
  const segmentLength = distance(from, to);
  const count = Math.max(1, Math.ceil(segmentLength / step));
  return Array.from({ length: count }, (_, index) => {
    const progress = (index + 1) / count;
    return {
      x: from.x + ((to.x - from.x) * progress),
      y: from.y + ((to.y - from.y) * progress),
    };
  });
};

const ForestMazeGame = ({ challenge, isSubmitting, onComplete }) => {
  const gradientId = useId().replaceAll(':', '');
  const surfaceRef = useRef(null);
  const draggingRef = useRef(false);
  const completedRef = useRef(false);
  const start = { x: challenge.start[0], y: challenge.start[1] };
  const goal = { x: challenge.goal[0], y: challenge.goal[1] };
  const playerRadius = Number(challenge.playerRadius || 3);
  const positionRef = useRef(start);
  const traceRef = useRef([start]);
  const [position, setPosition] = useState(start);
  const [collision, setCollision] = useState(false);

  const eventPoint = (event) => {
    const bounds = surfaceRef.current.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100,
    };
  };

  const isSafe = (point) => (
    point.x >= playerRadius
    && point.x <= 100 - playerRadius
    && point.y >= playerRadius
    && point.y <= 100 - playerRadius
    && challenge.stones.every((stone) => (
      Math.hypot(point.x - stone.x, point.y - stone.y) > stone.r + playerRadius
    ))
  );

  const resetAfterCollision = () => {
    draggingRef.current = false;
    setCollision(true);
    positionRef.current = start;
    traceRef.current = [start];
    setPosition(start);
    window.setTimeout(() => setCollision(false), 650);
  };

  const beginDrag = (event) => {
    if (isSubmitting || completedRef.current) return;
    const point = eventPoint(event);
    if (distance(point, positionRef.current) > playerRadius + 7) return;
    event.preventDefault();
    draggingRef.current = true;
    setCollision(false);
    if (Number.isInteger(event.pointerId)) surfaceRef.current.setPointerCapture?.(event.pointerId);
  };

  const drag = (event) => {
    if (!draggingRef.current || completedRef.current) return;
    event.preventDefault();
    const next = eventPoint(event);
    const samples = segmentPoints(positionRef.current, next);
    if (samples.some((point) => !isSafe(point))) {
      resetAfterCollision();
      return;
    }

    const nextTrace = [...traceRef.current, ...samples];
    positionRef.current = next;
    traceRef.current = nextTrace;
    setPosition(next);
    if (distance(next, goal) <= 6.5) {
      draggingRef.current = false;
      completedRef.current = true;
      if (Number.isInteger(event.pointerId)) surfaceRef.current.releasePointerCapture?.(event.pointerId);
      onComplete({ trace: nextTrace });
    }
  };

  const endDrag = (event) => {
    draggingRef.current = false;
    if (Number.isInteger(event.pointerId) && surfaceRef.current?.hasPointerCapture?.(event.pointerId)) {
      surfaceRef.current.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[460px] space-y-3 text-center [font-family:var(--font-ui)]">
      <div className="rounded-[2rem] border border-emerald-200/20 bg-white/[.07] p-2.5 shadow-[0_1.25rem_3.5rem_rgba(0,15,25,.35)] backdrop-blur sm:p-3">
        <div className="mb-2.5 flex items-center justify-between gap-2 px-1 text-xs font-black">
          <span className="rounded-full bg-amber-300 px-3 py-1.5 text-[#14382d]">ابدأ من المؤشر</span>
          <span className="text-white/70">اسحب دون لمس الأشجار</span>
          <span className="rounded-full bg-emerald-300 px-3 py-1.5 text-[#14382d]">الوصول للراية</span>
        </div>
        <svg
          ref={surfaceRef}
          viewBox="0 0 100 100"
          role="application"
          aria-label="متاهة مسار الغابة: اسحب من نقطة البداية إلى الراية وتجنب الأشجار"
          className={`mx-auto aspect-square w-full touch-none select-none overflow-hidden rounded-[1.55rem] border-2 shadow-[inset_0_0_45px_rgba(0,0,0,.38)] ${collision ? 'border-red-300 animate-shake' : 'border-emerald-100/25'}`}
          onPointerDown={beginDrag}
          onPointerMove={drag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ touchAction: 'none' }}
        >
          <defs>
            <linearGradient id={`${gradientId}-ground`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#176b53" />
              <stop offset="0.52" stopColor="#0a4d40" />
              <stop offset="1" stopColor="#04352f" />
            </linearGradient>
            <radialGradient id={`${gradientId}-tree`} cx="34%" cy="26%" r="76%">
              <stop offset="0" stopColor="#69c980" />
              <stop offset="0.48" stopColor="#278253" />
              <stop offset="1" stopColor="#0b4937" />
            </radialGradient>
            <pattern id={`${gradientId}-texture`} width="9" height="9" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r=".45" fill="#d6ffe5" opacity=".13" />
              <circle cx="7" cy="6" r=".3" fill="#c3f7d4" opacity=".1" />
            </pattern>
            <filter id={`${gradientId}-shadow`} x="-80%" y="-80%" width="260%" height="260%">
              <feDropShadow dx="0" dy="1.2" stdDeviation="1.3" floodColor="#001f1a" floodOpacity=".65" />
            </filter>
            <filter id={`${gradientId}-player-glow`} x="-120%" y="-120%" width="340%" height="340%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.2" floodColor="#fbd15c" floodOpacity=".95" />
            </filter>
          </defs>
          <rect width="100" height="100" rx="6" fill={`url(#${gradientId}-ground)`} />
          <rect width="100" height="100" rx="6" fill={`url(#${gradientId}-texture)`} />
          <path d="M-5 11 Q20 4 44 10 T105 7" fill="none" stroke="#8ce3a7" strokeOpacity=".12" strokeWidth="3" />
          <path d="M-5 91 Q24 83 49 91 T105 86" fill="none" stroke="#021f1c" strokeOpacity=".3" strokeWidth="5" />
          <polyline
            points={traceRef.current.filter((_point, index) => index % 3 === 0).map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke="#f8d675"
            strokeOpacity=".38"
            strokeWidth="1.15"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          />
          {challenge.stones.map((tree, index) => (
            <g key={`${tree.x}-${tree.y}-${index}`} filter={`url(#${gradientId}-shadow)`} aria-hidden="true">
              <ellipse cx={tree.x + 1} cy={tree.y + 2.5} rx={tree.r + 1} ry={tree.r * 0.72} fill="#001f1a" opacity=".48" />
              <circle cx={tree.x} cy={tree.y} r={tree.r + 1.1} fill="#0d5a42" />
              <circle cx={tree.x} cy={tree.y} r={tree.r} fill={`url(#${gradientId}-tree)`} stroke="#9ce5ac" strokeOpacity=".22" strokeWidth=".45" />
              <circle cx={tree.x - 1.35} cy={tree.y - 1.45} r={tree.r * 0.28} fill="#d2f5d8" opacity=".24" />
            </g>
          ))}
          <g transform={`translate(${goal.x} ${goal.y})`} aria-hidden="true">
            <circle r="7.4" fill="#6ee7b7" opacity=".14" />
            <circle r="5.4" fill="none" stroke="#6ee7b7" strokeOpacity=".38" strokeWidth=".8" />
            <path d="M-2.3 5.5V-5.7" stroke="#fff" strokeWidth="1.25" strokeLinecap="round" />
            <path d="M-1.7-5.2h7l-1.9 2.4 1.9 2.4h-7z" fill="#f3c84f" stroke="#fff" strokeWidth=".45" strokeLinejoin="round" />
          </g>
          <g
            transform={`translate(${position.x} ${position.y})`}
            filter={`url(#${gradientId}-player-glow)`}
            className="cursor-grab active:cursor-grabbing"
            aria-hidden="true"
          >
            <circle r={playerRadius + 3.1} fill="#fbd15c" opacity=".16" />
            <circle r={playerRadius + 1} fill="#073c35" stroke="#fff" strokeWidth=".8" />
            <path d="M0-2.4 2.1 2.1 0 1.25-2.1 2.1Z" fill="#fbd15c" />
          </g>
        </svg>
      </div>
      <p className={`min-h-5 text-xs font-black ${collision ? 'text-red-200' : 'text-white/55'}`} aria-live="polite">
        {collision ? 'لامست شجرة؛ عُدت إلى البداية.' : 'المتاهة تتغير في كل محاولة.'}
      </p>
    </div>
  );
};

export default ForestMazeGame;
