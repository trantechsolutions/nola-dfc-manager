const COLORS = {
  slate: { fill: '#0f172a', stroke: '#1e293b', text: '#ffffff' },
  blue: { fill: '#2563eb', stroke: '#1d4ed8', text: '#ffffff' },
  amber: { fill: '#f59e0b', stroke: '#d97706', text: '#ffffff' },
  emerald: { fill: '#059669', stroke: '#047857', text: '#ffffff' },
  red: { fill: '#dc2626', stroke: '#b91c1c', text: '#ffffff' },
};

export default function JerseyBadge({ number, size = 36, className = '', color = 'slate' }) {
  const c = COLORS[color] || COLORS.slate;
  return (
    <div className={`shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 40 44" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
        <path
          d="M8 12L4 8L10 4L15 2H25L30 4L36 8L32 12V40H8V12Z"
          fill={c.fill}
          stroke={c.stroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M8 12L4 8L2 14L6 16L8 12Z" fill={c.fill} stroke={c.stroke} strokeWidth="1" strokeLinejoin="round" />
        <path
          d="M32 12L36 8L38 14L34 16L32 12Z"
          fill={c.fill}
          stroke={c.stroke}
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <path d="M15 2C15 2 17 6 20 6C23 6 25 2 25 2" stroke={c.stroke} strokeWidth="1.5" fill="none" />
        <text
          x="20"
          y="29"
          textAnchor="middle"
          fill={c.text}
          fontSize={String(number).length > 2 ? '10' : '13'}
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          {number ?? '?'}
        </text>
      </svg>
    </div>
  );
}
