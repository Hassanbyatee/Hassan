import { FormEvent, useState } from 'react';
import {
  ArrowRight,
  CalendarPlus,
  Check,
  Copy,
  Flag,
  MapPin,
  MessageCircle,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Star,
  X,
} from 'lucide-react';
import { ResilientImage } from '../components/ResilientImage';
import { useAuth } from '../context/AuthContext';
import { submitComplaint, submitCustomerReview } from '../firebase/marketplaceApi';
import {
  AppPage,
  CustomerReview,
  ServiceCategory,
  ServiceProvider,
} from '../types/marketplace';
import {
  buildWhatsAppLink,
  calculateProviderRating,
  formatArabicDate,
  formatPhoneDisplay,
  isValidIraqiPhone,
} from '../utils/format';

interface ProviderProfilePageProps {
  provider: ServiceProvider | undefined;
  category: ServiceCategory | undefined;
  reviews: CustomerReview[];
  onBack: () => void;
  onRequestCategory: (categoryId: string) => void;
  onNavigate: (page: AppPage) => void;
}

export function ProviderProfilePage({
  provider,
  category,
  reviews,
  onBack,
  onRequestCategory,
  onNavigate,
}: ProviderProfilePageProps) {
  const { firebaseUser, userProfile } = useAuth();
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Review Form State
  const [reviewerName, setReviewerName] = useState(
    userProfile?.displayName ?? ''
  );
  const [reviewerNeighborhood, setReviewerNeighborhood] = useState(
    userProfile?.neighborhood ?? ''
  );
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState(false);

  // Report Modal State
  const [reportOpen, setReportOpen] = useState(false);
  const [reporterName, setReporterName] = useState(
    userProfile?.displayName ?? ''
  );
  const [reporterPhone, setReporterPhone] = useState(userProfile?.phone ?? '');
  const [reportReason, setReportReason] = useState('معلومات مضللة أو غير صحيحة');
  const [reportDetails, setReportDetails] = useState('');
  const [reportError, setReportError] = useState('');
  const [reportSuccess, setReportSuccess] = useState(false);

  if (!provider) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-[#0B172A] mb-3">
          لم يتم العثور على ملف مقدم الخدمة
        </h1>
        <p className="text-sm text-slate-600 mb-6">
          قد يكون الملف قد حُذف أو ما زال قيد المراجعة الإدارية.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0B172A] text-white text-sm font-semibold"
        >
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
          <span>العودة إلى الدليل</span>
        </button>
      </div>
    );
  }

  const isVerified = provider.verificationStatus === 'verified';
  const approvedReviews = reviews.filter(
    (r) => r.providerId === provider.id && r.status === 'approved'
  );
  const ratingInfo = calculateProviderRating(provider.id, reviews);
  const whatsappUrl = buildWhatsAppLink(
    provider.whatsapp || provider.phone,
    provider.fullName,
    category?.nameAr
  );

  const handleCopyPhone = async () => {
    try {
      await navigator.clipboard.writeText(provider.phone);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2200);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleReviewSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setReviewError('');
    setReviewSuccess(false);

    if (!firebaseUser) {
      setReviewError('يرجى تسجيل الدخول بحسابك أولاً لإرسال تقييم.');
      return;
    }
    if (provider.isDemo) {
      setReviewError('هذا ملف عرض تجريبي؛ يمكنك تقييم مقدمي الخدمات المسجلين فعلياً.');
      return;
    }
    if (reviewerName.trim().length < 2) {
      setReviewError('يرجى كتابة اسمك الكامل أو اسمك الأول.');
      return;
    }
    if (reviewerNeighborhood.trim().length < 2) {
      setReviewError('يرجى تحديد الحي السكني الذي تم تقديم الخدمة فيه.');
      return;
    }
    if (reviewComment.trim().length < 10) {
      setReviewError('يرجى كتابة تعليق واضح لا يقل عن 10 أحرف حول التجربة.');
      return;
    }

    try {
      await submitCustomerReview({
        providerId: provider.id,
        customerId: firebaseUser.uid,
        customerName: reviewerName.trim(),
        neighborhood: reviewerNeighborhood.trim(),
        rating: reviewRating,
        comment: reviewComment.trim(),
      });
      setReviewComment('');
      setReviewSuccess(true);
    } catch (err) {
      setReviewError(
        err instanceof Error ? err.message : 'تعذّر إرسال التقييم حالياً.'
      );
    }
  };

  const handleReportSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setReportError('');

    if (!firebaseUser) {
      setReportError('يرجى تسجيل الدخول بحسابك لإرسال بلاغ رسمي.');
      return;
    }
    if (provider.isDemo) {
      setReportError('لا يمكن تقديم بلاغ على ملف عرض تجريبي.');
      return;
    }
    if (reporterName.trim().length < 2) {
      setReportError('يرجى إدخال اسمك للمتابعة.');
      return;
    }
    if (!isValidIraqiPhone(reporterPhone)) {
      setReportError('يرجى إدخال رقم هاتف عراقي صحيح (مثال: 07501234567).');
      return;
    }
    if (reportDetails.trim().length < 10) {
      setReportError('يرجى توضيح تفاصيل البلاغ بـ 10 أحرف على الأقل.');
      return;
    }

    try {
      await submitComplaint({
        providerId: provider.id,
        reporterUid: firebaseUser.uid,
        reporterName: reporterName.trim(),
        reporterPhone,
        reason: reportReason,
        details: reportDetails.trim(),
      });
      setReportDetails('');
      setReportSuccess(true);
    } catch (err) {
      setReportError(
        err instanceof Error ? err.message : 'تعذّر إرسال البلاغ حالياً.'
      );
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <div className="mb-6 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#0B172A] transition-colors"
        >
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
          <span>العودة إلى نتائج البحث</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setReportSuccess(false);
            setReportError('');
            setReportOpen(true);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-rose-700 transition-colors"
        >
          <Flag className="w-3.5 h-3.5" aria-hidden="true" />
          <span>الإبلاغ عن هذا الحساب</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 space-y-6">
          <section className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border border-slate-200 shrink-0">
                <ResilientImage
                  src={provider.profileImage}
                  alt={`صورة ${provider.fullName}`}
                  fallbackName={provider.fullName}
                  containerClassName="w-full h-full"
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1.5">
                  <span>{category?.nameAr ?? 'خدمات منزلية'}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {provider.city} — {provider.neighborhood}
                  </span>
                  {provider.isDemo && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>بيانات عرض تجريبية</span>
                    </>
                  )}
                </div>

                <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#0B172A]">
                  {provider.fullName}
                </h1>

                <div className="mt-3">
                  {isVerified ? (
                    <div className="inline-flex flex-wrap items-center gap-2 text-sm text-emerald-700 font-medium">
                      <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>هوية ووثائق موثّقة يدوياً</span>
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-slate-700 tabular-nums">
                        خبرة موثّقة: {provider.yearsExperience} سنوات
                      </span>
                    </div>
                  ) : (
                    <div className="inline-flex flex-wrap items-center gap-2 text-sm text-amber-800 font-medium">
                      <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>حساب غير موثّق يدوياً بعد</span>
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-slate-600 text-xs">
                        سنوات الخبرة المصرّح بها ({provider.yearsExperience}) قيد التحقق
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100">
              <h2 className="text-sm font-bold text-[#0B172A] mb-2">
                نبذة عن الخدمات والخبرة
              </h2>
              <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
                {provider.description}
              </p>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100">
              <h2 className="text-sm font-bold text-[#0B172A] mb-3">
                مناطق الخدمة المشمولة
              </h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-700">
                {provider.serviceAreas.map((area) => (
                  <span key={area} className="inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                    <span>{area}</span>
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
              <div>
                <h2 className="font-display text-xl font-bold text-[#0B172A]">
                  تقييمات العملاء المعتمدة
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  تخضع جميع التقييمات للمراجعة اليدوية قبل نشرها لضمان المصداقية.
                </p>
              </div>
              {ratingInfo.count > 0 ? (
                <div className="flex items-center gap-2 tabular-nums">
                  <Star
                    className="w-5 h-5 text-amber-500 fill-amber-500"
                    aria-hidden="true"
                  />
                  <span className="text-xl font-bold text-[#0B172A]">
                    {ratingInfo.average}
                  </span>
                  <span className="text-xs text-slate-500">
                    من أصل 5 ({ratingInfo.count}{' '}
                    {ratingInfo.hasDemoOnly ? 'تجريبي' : 'تقييم'})
                  </span>
                </div>
              ) : (
                <span className="text-xs text-slate-500">
                  لا توجد تقييمات معتمدة حتى الآن
                </span>
              )}
            </div>

            <div className="divide-y divide-slate-100">
              {approvedReviews.length > 0 ? (
                approvedReviews.map((review) => (
                  <div key={review.id} className="py-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="text-sm font-semibold text-[#0B172A]">
                        {review.customerName}
                        <span className="text-xs font-normal text-slate-500 mr-2">
                          · {review.neighborhood}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums">
                        <span className="text-amber-600 font-semibold">
                          {review.rating} / 5
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatArabicDate(review.createdAt)}</span>
                        {review.isDemo && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>تجريبي</span>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {review.comment}
                    </p>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-sm text-slate-500">
                  كن أول عميل يشارك تقييمه بعد التعامل مع {provider.fullName}.
                </div>
              )}
            </div>

            <form
              onSubmit={handleReviewSubmit}
              className="mt-6 pt-6 border-t border-slate-200 space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-lg font-bold text-[#0B172A]">
                  أضف تقييمك لتجربتك مع مقدم الخدمة
                </h3>
                {!firebaseUser && (
                  <button
                    type="button"
                    onClick={() => onNavigate('auth')}
                    className="text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    سجّل الدخول لإضافة تقييم
                  </button>
                )}
              </div>

              {reviewSuccess && (
                <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm">
                  شكراً لمشاركتك! تم حفظ تقييمك في قاعدة البيانات وهو الآن قيد
                  المراجعة من قِبل الإدارة قبل نشره.
                </div>
              )}

              {reviewError && (
                <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm">
                  {reviewError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="rev-name"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    اسم العميل
                  </label>
                  <input
                    id="rev-name"
                    type="text"
                    value={reviewerName}
                    onChange={(e) => setReviewerName(e.target.value)}
                    placeholder="مثال: علي حسين"
                    className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="rev-hood"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    الحي السكني
                  </label>
                  <input
                    id="rev-hood"
                    type="text"
                    value={reviewerNeighborhood}
                    onChange={(e) => setReviewerNeighborhood(e.target.value)}
                    placeholder="مثال: عنكاوا"
                    className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="rev-rating"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    التقييم العام
                  </label>
                  <select
                    id="rev-rating"
                    value={String(reviewRating)}
                    onChange={(e) => setReviewRating(Number(e.target.value))}
                    className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="5">5 نجوم — ممتاز جداً</option>
                    <option value="4">4 نجوم — جيد جداً</option>
                    <option value="3">3 نجوم — مقبول</option>
                    <option value="2">نجمتان — دون المتوقع</option>
                    <option value="1">نجمة واحدة — تجربة سيئة</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="rev-comment"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  تفاصيل التجربة
                </label>
                <textarea
                  id="rev-comment"
                  rows={3}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="اكتب رأيك بوضوح وموضوعية..."
                  className="w-full p-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-[#0B172A] hover:bg-[#13233E] text-white text-sm font-semibold transition-colors"
              >
                إرسال التقييم للمراجعة
              </button>
            </form>
          </section>
        </div>

        <aside className="lg:col-span-4 space-y-5 lg:sticky lg:top-24">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0B172A]">
              اطلب الخدمة أو تواصل مباشرة
            </h2>

            <button
              type="button"
              onClick={() => onRequestCategory(provider.categoryId)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors min-h-[44px]"
            >
              <CalendarPlus className="w-4 h-4" aria-hidden="true" />
              <span>تقديم طلب خدمة رسمي عبر خدمتي</span>
            </button>

            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-slate-500 mb-0.5">رقم الهاتف</p>
                <p
                  dir="ltr"
                  className="font-mono-tabular text-base font-semibold text-[#0B172A]"
                >
                  {formatPhoneDisplay(provider.phone)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyPhone}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                {copiedPhone ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                    <span>تم النسخ</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>نسخ</span>
                  </>
                )}
              </button>
            </div>

            <a
              href={`tel:${provider.phone}`}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#0B172A] hover:bg-[#13233E] text-white text-sm font-semibold transition-colors min-h-[44px]"
            >
              <Phone className="w-4 h-4" aria-hidden="true" />
              <span>اتصال هاتفي مباشر</span>
            </a>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-sm font-semibold transition-colors min-h-[44px]"
            >
              <MessageCircle className="w-4 h-4" aria-hidden="true" />
              <span>مراسلة عبر واتساب</span>
            </a>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
            <h3 className="text-sm font-bold text-[#0B172A]">
              ملخص حالة التوثيق
            </h3>
            {isVerified ? (
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                راجعت إدارة خدمتي وثائق الهوية والخبرة الخاصة بهذا الحساب يدوياً
                {provider.verifiedAt
                  ? ` بتاريخ ${formatArabicDate(provider.verifiedAt)}`
                  : ''}
                .
              </p>
            ) : (
              <p className="text-xs sm:text-sm text-amber-800 leading-relaxed">
                هذا الحساب معتمد للظهور في الدليل فقط ولم تُستكمل إجراءات توثيق
                وثائقه بعد.
              </p>
            )}
          </div>
        </aside>
      </div>

      {reportOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-dialog-title"
          className="fixed inset-0 z-50 bg-[#0B172A]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <h2
                id="report-dialog-title"
                className="font-display text-xl font-bold text-[#0B172A]"
              >
                الإبلاغ عن مخالفة أو تقديم شكوى
              </h2>
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                aria-label="إغلاق نافذة الإبلاغ"
                className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reportSuccess ? (
              <div className="py-6 space-y-4">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
                  تم حفظ البلاغ في قاعدة البيانات وإشعار فريق الإدارة فوراً
                  لمتابعته.
                </div>
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  className="w-full py-2.5 rounded-lg bg-[#0B172A] text-white text-sm font-semibold"
                >
                  إغلاق
                </button>
              </div>
            ) : (
              <form onSubmit={handleReportSubmit} className="mt-4 space-y-4">
                {reportError && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                    {reportError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="rep-name"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      اسمك
                    </label>
                    <input
                      id="rep-name"
                      type="text"
                      value={reporterName}
                      onChange={(e) => setReporterName(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="rep-phone"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      رقم هاتفك للمتابعة
                    </label>
                    <input
                      id="rep-phone"
                      type="tel"
                      dir="ltr"
                      value={reporterPhone}
                      onChange={(e) => setReporterPhone(e.target.value)}
                      placeholder="0750xxxxxxx"
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-left focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="rep-reason"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    سبب البلاغ
                  </label>
                  <select
                    id="rep-reason"
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="معلومات مضللة أو غير صحيحة">
                      معلومات مضللة أو غير صحيحة
                    </option>
                    <option value="رقم الهاتف لا يعمل أو يخص شخصاً آخر">
                      رقم الهاتف لا يعمل أو يخص شخصاً آخر
                    </option>
                    <option value="عدم وضوح السعر المبدئي قبل الزيارة">
                      عدم وضوح السعر المبدئي قبل الزيارة
                    </option>
                    <option value="سلوك غير مهني أو مخالفة سلامة">
                      سلوك غير مهني أو مخالفة سلامة
                    </option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="rep-details"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    تفاصيل البلاغ
                  </label>
                  <textarea
                    id="rep-details"
                    rows={3}
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    placeholder="اشرح ما حدث بدقة..."
                    className="w-full p-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setReportOpen(false)}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-sm font-semibold"
                  >
                    إرسال البلاغ
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
