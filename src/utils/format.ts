import { CustomerReview, ServiceRequestStatus } from '../types/marketplace';

export function normalizeIraqiPhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+964')) {
    return '0' + digits.slice(4);
  }
  if (digits.startsWith('00964')) {
    return '0' + digits.slice(5);
  }
  if (digits.startsWith('964')) {
    return '0' + digits.slice(3);
  }
  return digits;
}

export function isValidIraqiPhone(raw: string): boolean {
  const normalized = normalizeIraqiPhone(raw);
  return /^07[3-9]\d{8}$/.test(normalized);
}

export function toIraqiE164(raw: string): string {
  const normalized = normalizeIraqiPhone(raw);
  if (/^07\d{9}$/.test(normalized)) {
    return `+964${normalized.slice(1)}`;
  }
  return normalized.startsWith('+') ? normalized : `+${normalized}`;
}

export function formatPhoneDisplay(raw: string): string {
  const normalized = normalizeIraqiPhone(raw);
  if (/^07\d{9}$/.test(normalized)) {
    return `${normalized.slice(0, 4)} ${normalized.slice(4, 7)} ${normalized.slice(7)}`;
  }
  return raw;
}

export function formatIQD(amount: number): string {
  return `${new Intl.NumberFormat('ar-IQ').format(Math.round(amount))} د.ع`;
}

export const REQUEST_STATUS_META: Record<
  ServiceRequestStatus,
  { labelAr: string; tone: string }
> = {
  Pending: { labelAr: 'قيد الانتظار', tone: 'text-amber-700' },
  Approved: { labelAr: 'معتمد للإسناد', tone: 'text-sky-700' },
  Assigned: { labelAr: 'تم تعيين فني', tone: 'text-indigo-700' },
  'In Progress': { labelAr: 'قيد التنفيذ', tone: 'text-blue-700' },
  Completed: { labelAr: 'مكتمل', tone: 'text-emerald-700' },
  Cancelled: { labelAr: 'ملغي', tone: 'text-slate-500' },
  Disputed: { labelAr: 'محل نزاع', tone: 'text-rose-700' },
};

export function buildWhatsAppLink(
  phone: string,
  providerName: string,
  categoryName?: string
): string {
  const normalized = normalizeIraqiPhone(phone);
  const international = normalized.startsWith('0')
    ? `964${normalized.slice(1)}`
    : normalized.replace(/\D/g, '');
  const message = categoryName
    ? `مرحباً ${providerName}، شاهدت ملفك على منصة خدمتي وأرغب بالاستفسار عن خدمة (${categoryName}).`
    : `مرحباً ${providerName}، شاهدت ملفك على منصة خدمتي وأرغب بالاستفسار عن خدماتك.`;
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}

export function calculateProviderRating(
  providerId: string,
  reviews: CustomerReview[]
): { average: number; count: number; hasDemoOnly: boolean } {
  const approved = reviews.filter(
    (r) => r.providerId === providerId && r.status === 'approved'
  );
  if (approved.length === 0) {
    return { average: 0, count: 0, hasDemoOnly: false };
  }
  const sum = approved.reduce((acc, item) => acc + item.rating, 0);
  const hasDemoOnly = approved.every((item) => item.isDemo);
  return {
    average: Number((sum / approved.length).toFixed(1)),
    count: approved.length,
    hasDemoOnly,
  };
}

export function formatArabicDate(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat('ar-IQ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(isoDate));
  } catch {
    return isoDate.slice(0, 10);
  }
}
