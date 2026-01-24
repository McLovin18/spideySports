'use client';

import React from 'react';

type CSSPropertiesWithVars = React.CSSProperties & Record<string, string | number>;

interface ConfettiPiece {
  id: number;
  left: number;
  width: number;
  height: number;
  delay: number;
  duration: number;
  color: string;
}

interface ConfettiCelebrationProps {
  pieces?: number;
  duration?: number;
}

const PALETTE = ['#E63946', '#2A9D8F', '#457B9D', '#FFC300', '#F4A261'];

const ConfettiCelebration: React.FC<ConfettiCelebrationProps> = ({ pieces = 60, duration = 4500 }) => {
  const [active, setActive] = React.useState(true);
  const [piecesConfig, setPiecesConfig] = React.useState<ConfettiPiece[]>([]);

  React.useEffect(() => {
    const configs: ConfettiPiece[] = Array.from({ length: pieces }, (_, index) => ({
      id: index,
      left: Math.random() * 100,
      width: 6 + Math.random() * 6,
      height: 10 + Math.random() * 12,
      delay: Math.random() * 0.8,
      duration: 2.4 + Math.random() * 1.2,
      color: PALETTE[index % PALETTE.length],
    }));

    setPiecesConfig(configs);
  }, [pieces]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setActive(false), duration);
    return () => window.clearTimeout(timer);
  }, [duration]);

  if (!active) {
    return null;
  }

  return (
    <>
      <div className="confetti-wrapper">
        {piecesConfig.map((piece) => {
          const style: CSSPropertiesWithVars = {
            left: `${piece.left}%`,
            width: `${piece.width}px`,
            height: `${piece.height}px`,
            backgroundColor: piece.color,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
          };

          return <span key={piece.id} className="confetti-piece" style={style} />;
        })}
      </div>
      <style jsx>{`
        .confetti-wrapper {
          position: fixed;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 2000;
        }

        .confetti-piece {
          position: absolute;
          top: -12%;
          border-radius: 2px;
          opacity: 0;
          animation-name: confetti-fall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }

        @keyframes confetti-fall {
          0% {
            transform: translate3d(0, -100vh, 0) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          100% {
            transform: translate3d(0, 110vh, 0) rotate(360deg);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
};

export default ConfettiCelebration;
