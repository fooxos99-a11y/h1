const LetterHiveBoard = ({ hexes, letters, onHexClick }) => { return (<svg viewBox="-70 -70 690 605" className="letter-hive-svg">
    <foreignObject x="-80" y="-80" width="710" height="624">
      <div className="letter-hive-board-glow" />
    </foreignObject>
    {hexes.map((status, index) => {
      const row = Math.floor(index / 5);
      const col = index % 5;
      const x = col * 100 + (row % 2 === 0 ? 0 : 50);
      const y = row * 87;
      const isClaimed = status !== null;
      const _resolveFillColor = () => {
        if (status === 'red') {
          return '#df103a';
        }
        if (status === 'green') {
          return '#10dfb5';
        }
        return '#ffffff';
      };
      const fillColor = _resolveFillColor();
      const textColor = status ? '#ffffff' : '#2c3e50';
      const _resolveBorderColor = () => {
        if (status === 'red') {
          return 'rgba(120, 14, 36, 0.95)';
        }
        if (status === 'green') {
          return 'rgba(5, 116, 94, 0.95)';
        }
        return 'rgba(77, 55, 125, 0.82)';
      };
      const borderColor = _resolveBorderColor();
      const _resolveOuterBorderColor = () => {
        if (status === 'red') {
          return 'rgba(255, 205, 214, 0.42)';
        }
        if (status === 'green') {
          return 'rgba(209, 250, 229, 0.42)';
        }
        return 'rgba(124, 58, 237, 0.18)';
      };
      const outerBorderColor = _resolveOuterBorderColor();
      const _resolveShadowFill = () => {
        if (status === 'red') {
          return 'rgba(223,16,58,0.22)';
        }
        if (status === 'green') {
          return 'rgba(16,223,181,0.22)';
        }
        return 'rgba(44,62,80,0.08)';
      };
      const shadowFill = _resolveShadowFill();

      return (
        <g key={`${x}:${y}`} transform={`translate(${x},${y})`} onClick={() => onHexClick(index)} style={{ cursor: status ? 'default' : 'pointer' }}>
          <polygon points="50,7 103,36 103,90 50,120 -3,90 -3,36" fill={shadowFill} />
          <polygon points="50,0 100,29 100,87 50,116 0,87 0,29" fill={fillColor} stroke={outerBorderColor} strokeWidth={6} />
          <polygon points="50,0 100,29 100,87 50,116 0,87 0,29" fill={fillColor} stroke={borderColor} strokeWidth={2.4} style={{ transition: 'fill 0.3s ease' }} />
          {!isClaimed ? <polygon points="50,10 89,33 89,79 50,102 11,79 11,33" fill="rgba(255,255,255,0.92)" style={{ pointerEvents: 'none' }} /> : null}
          {!isClaimed ? <polygon points="50,16 80,33 80,42 50,59 20,42 20,33" fill="rgba(255,255,255,0.24)" style={{ pointerEvents: 'none' }} /> : null}
          <polygon points="50,5 95,31 95,85 50,111 5,85 5,31" fill="none" stroke={status ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)'} strokeWidth={1.35} />
          {!isClaimed ? (
            <text x="50" y="58" className="letter-hive-hex-text" style={{ fill: textColor }}>
              {letters[index]}
            </text>
          ) : null}
        </g>
      );
    })}
  </svg>); };

export default LetterHiveBoard;
