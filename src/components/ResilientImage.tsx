import { useState } from 'react';
import { UserCheck } from 'lucide-react';

interface ResilientImageProps {
  src?: string;
  alt: string;
  fallbackName: string;
  className?: string;
  containerClassName?: string;
}

export function ResilientImage({
  src,
  alt,
  fallbackName,
  className = 'w-full h-full object-cover',
  containerClassName = '',
}: ResilientImageProps) {
  const [hasError, setHasError] = useState(false);

  const initials = fallbackName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join(' ');

  if (!src || hasError) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#0B172A] via-[#13233E] to-[#1E3557] text-white select-none ${containerClassName}`}
      >
        <UserCheck className="w-6 h-6 text-emerald-400 mb-1.5" aria-hidden="true" />
        <span className="text-sm font-semibold tracking-wide text-slate-100">
          {initials || 'خ'}
        </span>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden bg-slate-100 ${containerClassName}`}>
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
        className={className}
      />
    </div>
  );
}
