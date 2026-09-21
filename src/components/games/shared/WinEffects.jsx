import React from 'react';
import './winEffects.css';

const particles = Array.from({ length: 18 }, (_, index) => index);
const bursts = [
  { x: '18%', y: '28%', delay: '0s', scale: 1 },
  { x: '79%', y: '24%', delay: '.42s', scale: 1.15 },
  { x: '30%', y: '72%', delay: '.8s', scale: .9 },
  { x: '72%', y: '68%', delay: '1.18s', scale: 1.05 },
];

const WinEffects = ({ fullscreen = false }) => (
  <div className={`game-win-effects${fullscreen ? ' game-win-effects--fullscreen' : ''}`} aria-hidden="true">
    {bursts.map((burst, burstIndex) => (
      <div
        className="game-win-firework"
        key={`${burst.x}-${burst.y}`}
        style={{ '--x': burst.x, '--y': burst.y, '--delay': burst.delay, '--scale': burst.scale }}
      >
        <div className="game-win-rings" />
        {particles.map((particle) => (
          <span
            key={`${burstIndex}-${particle}`}
            style={{ '--i': particle, '--distance': `${112 + (particle % 4) * 24}px` }}
          />
        ))}
      </div>
    ))}
  </div>
);

export default WinEffects;
