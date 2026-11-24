import { FormEvent, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  FileCheck2,
  MapPin,
  Search,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { getNeighborhoodsByCity, IRAQ_LOCATIONS } from '../data/locations';
import {
  AppPage,
  CustomerReview,
  DirectoryFilters,
  ServiceCategory,
  ServiceProvider,
} from '../types/marketplace';
import { CategoryIcon } from '../components/CategoryIcon';
import { ProviderCard } from '../components/ProviderCard';
import { ResilientImage } from '../components/ResilientImage';

interface HomePageProps {
  categories: ServiceCategory[];
  providers: ServiceProvider[];
  reviews: CustomerReview[];
  onNavigate: (page: AppPage, sectionId?: string) => void;
  onSearchSubmit: (partialFilters: Partial<DirectoryFilters>) => void;
  onSelectProvider: (providerId: string) => void;
}

export function HomePage({
  categories,
  providers,
  reviews,
  onNavigate,
  onSearchSubmit,
  onSelectProvider,
}: HomePageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('أربيل');
  const [selectedNeighborhood, setSelectedNeighborhood] = useState('');

  const neighborhoods = getNeighborhoodsByCity(selectedCity);
  const activeCategories = categories.filter((c) => c.isActive);

  // Public directory only includes approved providers; featured shows verified first
  const approvedProviders = providers.filter(
    (p) => p.approvalStatus === 'approved'
  );
  const featuredVerifiedProviders = approvedProviders
    .filter((p) => p.verificationStatus === 'verified')
    .slice(0, 3);

  const approvedReviews = reviews.filter((r) => r.status === 'approved').slice(0, 3);

  const handleHeroSearch = (e: FormEvent) => {
    e.preventDefault();
    onSearchSubmit({
      query: searchQuery.trim(),
      city: selectedCity,
      neighborhood: selectedNeighborhood,
      categoryId: '',
    });
  };

  return (
    <div>
      {/* 1. Hero Section */}
      <section className="border-b border-slate-200/80 bg-[#FAF9F6]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            {/* Hero Content (Right in RTL) */}
            <div className="lg:col-span-7 flex flex-col justify-center">
              <p className="text-xs sm:text-sm font-medium text-emerald-700 mb-3">
                أربيل، العراق · منصة تجريبية للخدمات المنزلية الموثوقة
              </p>

              <h1
                style={{ textWrap: 'balance' }}
                className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold text-[#0B172A] leading-[1.18] tracking-tight max-w-2xl"
              >
                الخدمة الموثوقة، أقرب مما تتوقع
              </h1>

              <p className="mt-5 text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                ابحث عن كهربائي، سباك، فني تبريد، أو نجار في حيّك داخل أربيل.
                نراجع وثائق وهوية مقدمي الخدمة يدوياً قبل منحهم شارة التوثيق
                لتتواصل معهم مباشرة بثقة ووضوح.
              </p>

              {/* Integrated Hero Search & Location Selector */}
              <form
                onSubmit={handleHeroSearch}
                className="mt-8 bg-white border border-slate-200 rounded-xl p-3 shadow-[0_12px_32px_-16px_rgba(11,23,42,0.12)]"
              >
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <div className="sm:col-span-5 relative">
                    <label htmlFor="hero-search-input" className="sr-only">
                      ما الخدمة التي تبحث عنها؟
                    </label>
                    <Search
                      className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="hero-search-input"
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="مثال: سبلت، كهربائي، تسريب ماء..."
                      className="w-full h-12 pr-10 pl-3 rounded-lg bg-slate-50 border border-slate-200/80 text-sm text-[#0B172A] placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label htmlFor="hero-city-select" className="sr-only">
                      المدينة
                    </label>
                    <select
                      id="hero-city-select"
                      value={selectedCity}
                      onChange={(e) => {
                        setSelectedCity(e.target.value);
                        setSelectedNeighborhood('');
                      }}
                      className="w-full h-12 px-3 rounded-lg bg-slate-50 border border-slate-200/80 text-sm text-[#0B172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    >
                      <option value="">كل المدن</option>
                      {IRAQ_LOCATIONS.map((loc) => (
                        <option key={loc.city} value={loc.city}>
                          {loc.city}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="hero-neighborhood-select" className="sr-only">
                      الحي أو المنطقة
                    </label>
                    <select
                      id="hero-neighborhood-select"
                      value={selectedNeighborhood}
                      onChange={(e) => setSelectedNeighborhood(e.target.value)}
                      disabled={!selectedCity}
                      className="w-full h-12 px-2.5 rounded-lg bg-slate-50 border border-slate-200/80 text-sm text-[#0B172A] disabled:opacity-60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    >
                      <option value="">كل الأحياء</option>
                      {neighborhoods.map((hood) => (
                        <option key={hood} value={hood}>
                          {hood}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      className="w-full h-12 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                    >
                      ابحث الآن
                    </button>
                  </div>
                </div>
              </form>

              {/* Quick Category Shortcuts */}
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
                <span className="text-slate-500">الأكثر طلباً في أربيل:</span>
                {activeCategories.slice(0, 4).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() =>
                      onSearchSubmit({ categoryId: cat.id, city: 'أربيل' })
                    }
                    className="font-medium text-[#0B172A] hover:text-emerald-700 underline decoration-slate-300 underline-offset-4 transition-colors"
                  >
                    {cat.nameAr}
                  </button>
                ))}
              </div>
            </div>

            {/* Hero Editorial Image (Left in RTL) */}
            <div className="lg:col-span-5 flex">
              <div className="relative w-full min-h-[300px] lg:min-h-[440px] rounded-2xl overflow-hidden border border-slate-200">
                <ResilientImage
                  src="/src/assets/images/hero_erbil_craftsman_1795559614558.jpg"
                  alt="فني كهرباء وصيانة منزلية يفحص لوحة الكهرباء في منزل عصري في أربيل"
                  fallbackName="خدمتي أربيل"
                  className="w-full h-full object-cover"
                  containerClassName="w-full h-full"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0B172A]/90 via-[#0B172A]/45 to-transparent p-6 text-white">
                  <p className="text-xs text-emerald-300 font-medium mb-1">
                    معيار خدمتي للتوثيق الميداني
                  </p>
                  <p className="text-sm sm:text-base font-medium leading-snug">
                    فصل واضح بين الحسابات الموثّقة يدوياً والحسابات قيد المراجعة
                    لضمان الشفافية الكاملة قبل دخول الفني إلى منزلك.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Operational Scope Strip (4 columns full-width below hero split) */}
          <div className="mt-12 pt-8 border-t border-slate-200/80 grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="text-xs text-slate-500 mb-1">نطاق الإطلاق الأولي</p>
              <p className="font-display text-lg font-bold text-[#0B172A]">
                12 حياً في أربيل
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">التخصصات المتاحة</p>
              <p className="font-display text-lg font-bold text-[#0B172A] tabular-nums">
                {activeCategories.length} فئات مهنية
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">آلية الاعتماد</p>
              <p className="font-display text-lg font-bold text-[#0B172A]">
                تدقيق يدوي للوثائق
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">طبيعة البيانات الحالية</p>
              <p className="font-display text-lg font-bold text-emerald-700">
                نماذج عرض تجريبية واضحة
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Service Categories Grid */}
      <section className="py-16 lg:py-20 bg-white border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <p className="text-xs font-medium text-emerald-700 mb-2">
                تغطية شاملة لاحتياجات المنزل
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0B172A]">
                تصفّح الخدمات حسب التخصص
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('categories')}
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#0B172A] hover:text-emerald-700 transition-colors self-start sm:self-auto"
            >
              <span>عرض جميع التفاصيل</span>
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {activeCategories.map((category) => {
              const count = approvedProviders.filter(
                (p) => p.categoryId === category.id
              ).length;

              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => onSearchSubmit({ categoryId: category.id })}
                  className="text-right group bg-[#FAF9F6] hover:bg-white border border-slate-200/90 hover:border-emerald-600/50 rounded-xl p-5 transition-all duration-200 flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                >
                  <div>
                    <div className="w-11 h-11 rounded-lg bg-[#0B172A] text-white group-hover:bg-emerald-600 transition-colors flex items-center justify-center mb-4">
                      <CategoryIcon name={category.icon} className="w-5 h-5" />
                    </div>
                    <h3 className="font-display text-lg font-bold text-[#0B172A] mb-1.5">
                      {category.nameAr}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      {category.descriptionAr}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-200/70 flex items-center justify-between text-xs text-slate-500">
                    <span className="tabular-nums">
                      {count > 0 ? `${count} مقدم خدمة في الدليل` : 'متاح للتسجيل'}
                    </span>
                    <span className="text-emerald-700 font-medium group-hover:translate-x-[-2px] transition-transform">
                      استكشف
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. Featured Verified Providers (Demo-Labeled) */}
      <section className="py-16 lg:py-20 bg-[#FAF9F6] border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <div>
              <p className="text-xs font-medium text-emerald-700 mb-2">
                ملفات تجريبية توضيحية موثّقة يدوياً
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0B172A]">
                مقدمو خدمات مميزون في أربيل
              </h2>
              <p className="mt-2 text-sm text-slate-600 max-w-2xl">
                البيانات المعروضة أدناه هي نماذج تجريبية لتوضيح تجربة البحث
                والتحقق؛ لا تُمنح شارة «موثّق يدوياً» إلا بعد مراجعة الوثائق
                الرسمية من قِبل الإدارة.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('directory')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-[#0B172A] hover:border-[#0B172A] transition-colors whitespace-nowrap self-start md:self-auto"
            >
              <span>تصفّح الدليل الكامل</span>
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {featuredVerifiedProviders.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                category={categories.find((c) => c.id === provider.categoryId)}
                reviews={reviews}
                onSelectProvider={onSelectProvider}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 4. How Khidmati Works */}
      <section className="py-16 lg:py-20 bg-white border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-medium text-emerald-700 mb-2">
              خطوات واضحة بدون تعقيد
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0B172A]">
              كيف تعمل منصة خدمتي؟
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-[#FAF9F6] border border-slate-200/90 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono-tabular text-sm font-semibold text-emerald-700">
                  01.
                </span>
                <MapPin className="w-5 h-5 text-[#0B172A]" aria-hidden="true" />
              </div>
              <h3 className="font-display text-lg font-bold text-[#0B172A] mb-2">
                حدّد الخدمة والحي السكني
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                اختر التخصص المطلوب وحدد مدينتك والحي (مثل عنكاوا، بختياري، أو
                شارع 100 متر) لتظهر لك الأسماء المتاحة في نطاقك.
              </p>
            </div>

            <div className="bg-[#FAF9F6] border border-slate-200/90 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono-tabular text-sm font-semibold text-emerald-700">
                  02.
                </span>
                <ShieldCheck className="w-5 h-5 text-[#0B172A]" aria-hidden="true" />
              </div>
              <h3 className="font-display text-lg font-bold text-[#0B172A] mb-2">
                تحقق من حالة التوثيق والتقييمات
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                ميّز بوضوح بين الفني الموثّق يدوياً بالبطاقة الوطنية وسنوات
                الخبرة، وبين الحسابات الجديدة التي لم تُستكمل مراجعتها بعد.
              </p>
            </div>

            <div className="bg-[#FAF9F6] border border-slate-200/90 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono-tabular text-sm font-semibold text-emerald-700">
                  03.
                </span>
                <CheckCircle2 className="w-5 h-5 text-[#0B172A]" aria-hidden="true" />
              </div>
              <h3 className="font-display text-lg font-bold text-[#0B172A] mb-2">
                تواصل مباشرة وشارك تقييمك
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                تواصل بالهاتف أو الواتساب مباشرة دون عمولات مخفية، ثم أضف تقييمك
                الحقيقي ليخضع للمراجعة قبل نشره لمساعدة غيرك.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Trust & Safety + Transparent Pilot Reviews */}
      <section
        id="trust-standards"
        className="py-16 lg:py-20 bg-[#0B172A] text-white border-b border-slate-800"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            {/* Trust Standards Column */}
            <div className="lg:col-span-6 space-y-6">
              <div>
                <p className="text-xs font-medium text-emerald-400 mb-2">
                  الأمان أولاً في كل زيارة منزلية
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                  لماذا يثق العملاء بمنصة خدمتي؟
                </h2>
                <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed">
                  الثقة ليست شعاراً تسويقياً في خدمتي، بل هي قواعد صارمة مطبّقة
                  في لوحة التحكم وواجهة المستخدم:
                </p>
              </div>

              <div className="space-y-4 pt-2">
                <div className="border border-slate-800 bg-[#13233E]/60 rounded-xl p-4 flex items-start gap-3.5">
                  <FileCheck2
                    className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      موافقة إدارية وتوثيق منفصل للهوية
                    </h3>
                    <p className="mt-1 text-xs sm:text-sm text-slate-300 leading-relaxed">
                      أي طلب تسجيل جديد يبقى مخفياً حتى تقبله الإدارة، ولا يحصل
                      على شارة التوثيق إلا بعد مطابقة الوثائق الرسمية يدوياً.
                    </p>
                  </div>
                </div>

                <div className="border border-slate-800 bg-[#13233E]/60 rounded-xl p-4 flex items-start gap-3.5">
                  <Eye
                    className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      مراجعة التقييمات ومنع التلاعب
                    </h3>
                    <p className="mt-1 text-xs sm:text-sm text-slate-300 leading-relaxed">
                      لا نعرض تقييمات وهمية؛ كل تقييم جديد يمر على قائمة المراجعة
                      الإدارية للتحقق من جديته قبل احتسابه في معدل الفني.
                    </p>
                  </div>
                </div>

                <div className="border border-slate-800 bg-[#13233E]/60 rounded-xl p-4 flex items-start gap-3.5">
                  <ShieldCheck
                    className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      إبلاغ فوري وإيقاف الحسابات المخالفة
                    </h3>
                    <p className="mt-1 text-xs sm:text-sm text-slate-300 leading-relaxed">
                      يمكن لأي عميل الإبلاغ عن رقم مضلل أو سلوك غير مهني مباشرة
                      من ملف مقدم الخدمة لتتخذ الإدارة إجراءً فورياً.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Adjacent Proof: Approved & Labeled Pilot Feedback */}
            <div className="lg:col-span-6 space-y-4">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <h3 className="font-display text-lg font-bold text-white">
                  تقييمات معتمدة في النسخة التجريبية
                </h3>
                <span className="text-xs text-slate-400">
                  تُحدّث تلقائياً عند اعتماد تقييمات جديدة
                </span>
              </div>

              <div className="space-y-3.5">
                {approvedReviews.map((review) => {
                  const provider = providers.find(
                    (p) => p.id === review.providerId
                  );
                  return (
                    <div
                      key={review.id}
                      className="bg-[#13233E] border border-slate-800 rounded-xl p-5"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-400 mb-2">
                        <span>
                          {review.customerName} · {review.neighborhood}
                        </span>
                        <span className="tabular-nums text-amber-400 font-semibold">
                          {review.rating} / 5 {review.isDemo ? '· مثال تجريبي' : ''}
                        </span>
                      </div>
                      <p className="text-sm text-slate-200 leading-relaxed">
                        «{review.comment}»
                      </p>
                      {provider && (
                        <button
                          type="button"
                          onClick={() => onSelectProvider(provider.id)}
                          className="mt-3 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                          الخدمة المقدّمة من: {provider.fullName}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Strong Call-To-Action Band */}
      <section className="py-16 bg-[#FAF9F6]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-12 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0B172A]">
                هل أنت فني أو مقدم خدمة محترف في أربيل؟
              </h2>
              <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed">
                سجّل ملفك المهني الآن، أرفق وثائق الخبرة والهوية للمراجعة
                اليدوية، واظهر للعملاء الباحثين عن خدمة موثوقة في منطقتك.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => onNavigate('register')}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-[#0B172A] hover:bg-[#13233E] text-white text-sm font-semibold transition-colors whitespace-nowrap"
              >
                <UserPlus className="w-4 h-4" aria-hidden="true" />
                <span>قدّم طلب انضمام</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('directory')}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg border border-slate-300 hover:border-[#0B172A] text-[#0B172A] text-sm font-semibold transition-colors whitespace-nowrap"
              >
                <span>ابحث عن مقدم خدمة</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
