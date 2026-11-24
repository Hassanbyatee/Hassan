import {
  MapPin,
  MessageCircle,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Star,
} from 'lucide-react';
import {
  CustomerReview,
  ServiceCategory,
  ServiceProvider,
} from '../types/marketplace';
import {
  buildWhatsAppLink,
  calculateProviderRating,
  formatPhoneDisplay,
} from '../utils/format';
import { ResilientImage } from './ResilientImage';

interface ProviderCardProps {
  provider: ServiceProvider;
  category?: ServiceCategory;
  reviews: CustomerReview[];
  onSelectProvider: (providerId: string) => void;
}

export function ProviderCard({
  provider,
  category,
  reviews,
  onSelectProvider,
}: ProviderCardProps) {
  const isVerified = provider.verificationStatus === 'verified';
  const ratingInfo = calculateProviderRating(provider.id, reviews);
  const whatsappUrl = buildWhatsAppLink(
    provider.whatsapp || provider.phone,
    provider.fullName,
    category?.nameAr
  );

  return (
    <article className="bg-white border border-slate-200/90 rounded-xl p-5 flex flex-col justify-between transition-all duration-200 hover:border-slate-300 hover:shadow-[0_8px_24px_-12px_rgba(11,23,42,0.12)]">
      <div>
        {/* Top row: Portrait + Primary identity */}
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => onSelectProvider(provider.id)}
            className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-slate-200/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <ResilientImage
              src={provider.profileImage}
              alt={`صورة ${provider.fullName}`}
              fallbackName={provider.fullName}
              containerClassName="w-full h-full"
            />
          </button>

          <div className="min-w-0 flex-1">
            {/* Quiet 1-line kicker metadata without pill enclosures */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mb-1">
              <span>{category?.nameAr ?? 'خدمات منزلية'}</span>
              {provider.isDemo && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-500">نموذج عرض</span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => onSelectProvider(provider.id)}
              className="text-right block w-full focus-visible:outline-none focus-visible:underline"
            >
              <h3 className="font-display text-lg font-bold text-[#0B172A] truncate hover:text-emerald-700 transition-colors">
                {provider.fullName}
              </h3>
            </button>

            {/* Explicit verification status — never pretended when unverified */}
            <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium">
              {isVerified ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>موثّق يدوياً</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-700">
                  <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>غير موثّق بعد</span>
                </span>
              )}
              {isVerified && (
                <>
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-slate-600 tabular-nums">
                    خبرة موثّقة {provider.yearsExperience} سنوات
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="mt-4 text-sm text-slate-600 leading-relaxed line-clamp-2">
          {provider.description}
        </p>

        {/* Location & Rating metadata */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <div className="inline-flex items-center gap-1.5 min-w-0">
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {provider.city} — {provider.neighborhood}
              {provider.serviceAreas.length > 1
                ? ` (+${provider.serviceAreas.length - 1} مناطق)`
                : ''}
            </span>
          </div>

          <div className="inline-flex items-center gap-1 tabular-nums shrink-0">
            {ratingInfo.count > 0 ? (
              <>
                <Star
                  className="w-3.5 h-3.5 text-amber-500 fill-amber-500"
                  aria-hidden="true"
                />
                <span className="font-semibold text-[#0B172A]">
                  {ratingInfo.average}
                </span>
                <span className="text-slate-500">
                  ({ratingInfo.count} {ratingInfo.hasDemoOnly ? 'تجريبي' : 'تقييم'})
                </span>
              </>
            ) : (
              <span className="text-slate-400">لا توجد تقييمات بعد</span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSelectProvider(provider.id)}
          className="flex-1 px-3.5 py-2.5 text-xs font-semibold text-white bg-[#0B172A] hover:bg-[#13233E] rounded-lg transition-colors whitespace-nowrap min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          عرض الملف الشخصي
        </button>

        <a
          href={`tel:${provider.phone}`}
          title={`اتصال مباشر: ${formatPhoneDisplay(provider.phone)}`}
          aria-label={`اتصال بـ ${provider.fullName}`}
          className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 text-[#0B172A] hover:bg-slate-50 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          <Phone className="w-4 h-4" aria-hidden="true" />
        </a>

        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="تواصل عبر واتساب"
          aria-label={`تواصل عبر واتساب مع ${provider.fullName}`}
          className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-emerald-200 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          <MessageCircle className="w-4 h-4" aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}
