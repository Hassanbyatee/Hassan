import {
  Droplets,
  Hammer,
  Paintbrush,
  Sparkles,
  Tv,
  Wind,
  Wrench,
  Zap,
} from 'lucide-react';
import { CategoryIconName } from '../types/marketplace';

interface CategoryIconProps {
  name: CategoryIconName;
  className?: string;
}

export function CategoryIcon({ name, className = 'w-5 h-5' }: CategoryIconProps) {
  switch (name) {
    case 'zap':
      return <Zap className={className} aria-hidden="true" />;
    case 'droplets':
      return <Droplets className={className} aria-hidden="true" />;
    case 'hammer':
      return <Hammer className={className} aria-hidden="true" />;
    case 'wind':
      return <Wind className={className} aria-hidden="true" />;
    case 'sparkles':
      return <Sparkles className={className} aria-hidden="true" />;
    case 'paintbrush':
      return <Paintbrush className={className} aria-hidden="true" />;
    case 'wrench':
      return <Wrench className={className} aria-hidden="true" />;
    case 'tv':
      return <Tv className={className} aria-hidden="true" />;
    default:
      return <Wrench className={className} aria-hidden="true" />;
  }
}
