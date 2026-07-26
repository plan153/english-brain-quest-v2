import type { ButtonHTMLAttributes } from 'react';

type Variant = 'default' | 'primary' | 'recording';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variantClass: Record<Variant, string> = {
  default: 'action-btn',
  primary: 'action-btn primary',
  recording: 'action-btn recording',
};

export function Button({ variant = 'default', className = '', ...rest }: ButtonProps) {
  return (
    <button
      className={`${variantClass[variant]} ${className}`.trim()}
      {...rest}
    />
  );
}
