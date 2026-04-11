import { cn } from '@/lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  animated?: boolean;
}

const SIZE_MAP = {
  sm: 20,
  md: 28,
  lg: 40,
  xl: 72,
} as const;

export function Logo({ size = 'md', className, animated = false }: LogoProps) {
  const px = SIZE_MAP[size];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(animated && 'animate-logo-in', className)}
      aria-label="Lodestar logo"
    >
      <defs>
        <linearGradient
          id="lodestar-gradient"
          x1="0"
          y1="0"
          x2="64"
          y2="64"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="55%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      {/* 8-point star = two overlapping 4-point stars */}
      <path
        d="M32 2 L37 27 L62 32 L37 37 L32 62 L27 37 L2 32 L27 27 Z"
        fill="url(#lodestar-gradient)"
      />
      <path
        d="M32 12 L34 30 L52 32 L34 34 L32 52 L30 34 L12 32 L30 30 Z"
        fill="white"
        fillOpacity="0.25"
      />
    </svg>
  );
}

export function LogoLockup({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Logo size="md" />
      <span className="text-lg font-bold tracking-tight">Lodestar</span>
    </div>
  );
}
