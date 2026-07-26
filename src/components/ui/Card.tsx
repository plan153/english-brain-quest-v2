import type { CSSProperties, ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Card({ children, className = '', style }: CardProps) {
  return (
    <div className={`card ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}
