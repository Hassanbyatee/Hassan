import { RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { ProviderCard } from '../components/ProviderCard';
import { getNeighborhoodsByCity, IRAQ_LOCATIONS } from '../data/locations';
import {
  CustomerReview,
  DirectoryFilters,
  ServiceCategory,
  ServiceProvider,
  SortOption,
} from '../types/marketplace';
import { calculateProviderRating } from '../utils/format';

interface DirectoryPageProps {
  categories: ServiceCategory[];
  providers: ServiceProvider[];
  reviews: CustomerReview[];
  filters: DirectoryFilters;
  onFiltersChange: (next: DirectoryFilters) => void;
  onResetFilters: () => void;
  onSelectProvider: (providerId: string) => void;
}

export function DirectoryPage({
  categories,
  providers,
  reviews,
  filters,
  onFiltersChange,
  onResetFilters,
  onSelectProvider,
}: DirectoryPageProps) {
  const activeCategories = categories.filter((c) => c.isActive);
  const neighborhoods = filters.city ? getNeighborhoodsByCity(filters.city) : [];

  const filteredProviders = providers
    .filter((provider) => {
      // Only approved providers are shown publicly
      if (provider.approvalStatus !== 'approved') return false;

      if (filters.categoryId && provider.categoryId !== filters.categoryId) {
        return false;
      }
      if (filters.city && provider.city !== filters.city) {
        return false;
      }
      if (
        filters.neighborhood &&
        provider.neighborhood !== filters.neighborhood &&
        !provider.serviceAreas.includes(filters.neighborhood)
      ) {
        return false;
      }
      if (
        filters.verification === 'verified' &&
        provider.verificationStatus !== 'verified'
      ) {
        return false;
      }
      if (
        filters.verification === 'unverified' &&
        provider.verificationStatus !== 'unverified'
      ) {
        return false;
      }

      if (filters.minRating > 0) {
        const rating = calculateProviderRating(provider.id, reviews);
        if (rating.count === 0 || rating.average < filters.minRating) {
          return false;
        }
      }

      if (filters.query.trim()) {
        const q = filters.query.trim().toLowerCase();
        const catName =
          categories.find((c) => c.id === provider.categoryId)?.nameAr ?? '';
        const haystack = [
          provider.fullName,
          provider.description,
          provider.city,
          provider.neighborhood,
          ...provider.serviceAreas,
          catName,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (filters.sort === 'verified_first') {
        if (a.verificationStatus !== b.verificationStatus) {
          return a.verificationStatus === 'verified' ? -1 : 1;
        }
        return (
          calculateProviderRating(b.id, reviews).average -
          calculateProviderRating(a.id, reviews).average
        );
      }
      if (filters.sort === 'highest_rated') {
        return (
          calculateProviderRating(b.id, reviews).average -
          calculateProviderRating(a.id, reviews).average
        );
      }
      if (filters.sort === 'most_experienced') {
        return b.yearsExperience - a.yearsExperience;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const hasActiveFilter =
    Boolean(filters.query) ||
    Boolean(filters.categoryId) ||
    Boolean(filters.city) ||
    Boolean(filters.neighborhood) ||
    filters.minRating > 0 ||
    filters.verification !== 'all';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-700 mb-1.5">
            دليل مقدمي الخدمات المعتمدين · بيانات تجريبية وإدخالات المستخدمين
          </p>
          <h1 className="font-display text-3xl font-extrabold text-[#0B172A]">
            ابحث عن مقدم خدمة موثوق
          </h1>
        </div>
        <p className="text-sm text-slate-600 tabular-nums">
          النتائج المطابقة: <strong className="text-[#0B172A]">{filteredProviders.length}</strong>
        </p>
      </div>

      {/* Filter Bar */}
      <section
        aria-label="أدوات البحث والتصفية"
        className="bg-white border border-slate-200 rounded-xl p-5 mb-8"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
          {/* Search Input */}
          <div className="sm:col-span-2">
            <label
              htmlFor="dir-search"
              className="block text-xs font-medium text-slate-600 mb-1.5"
            >
              البحث بالاسم أو وصف الخدمة
            </label>
            <div className="relative">
              <Search
                className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="dir-search"
                type="text"
                value={filters.query}
                onChange={(e) =>
                  onFiltersChange({ ...filters, query: e.target.value })
                }
                placeholder="اكتب اسم الفني أو الخدمة..."
                className="w-full h-11 pr-9 pl-3 rounded-lg border border-slate-200 text-sm text-[#0B172A] focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          {/* Category Filter */}
          <div>
            <label
              htmlFor="dir-category"
              className="block text-xs font-medium text-slate-600 mb-1.5"
            >
              التصنيف
            </label>
            <select
              id="dir-category"
              value={filters.categoryId}
              onChange={(e) =>
                onFiltersChange({ ...filters, categoryId: e.target.value })
              }
              className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm text-[#0B172A] bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="">كل التخصصات</option>
              {activeCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.nameAr}
                </option>
              ))}
            </select>
          </div>

          {/* City Filter */}
          <div>
            <label
              htmlFor="dir-city"
              className="block text-xs font-medium text-slate-600 mb-1.5"
            >
              المدينة
            </label>
            <select
              id="dir-city"
              value={filters.city}
              onChange={(e) =>
                onFiltersChange({
                  ...filters,
                  city: e.target.value,
                  neighborhood: '',
                })
              }
              className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm text-[#0B172A] bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="">كل المدن</option>
              {IRAQ_LOCATIONS.map((loc) => (
                <option key={loc.city} value={loc.city}>
                  {loc.city}
                </option>
              ))}
            </select>
          </div>

          {/* Neighborhood Filter */}
          <div>
            <label
              htmlFor="dir-neighborhood"
              className="block text-xs font-medium text-slate-600 mb-1.5"
            >
              الحي السكني
            </label>
            <select
              id="dir-neighborhood"
              value={filters.neighborhood}
              disabled={!filters.city}
              onChange={(e) =>
                onFiltersChange({ ...filters, neighborhood: e.target.value })
              }
              className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm text-[#0B172A] bg-white disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="">
                {filters.city ? 'كل الأحياء' : 'اختر المدينة أولاً'}
              </option>
              {neighborhoods.map((hood) => (
                <option key={hood} value={hood}>
                  {hood}
                </option>
              ))}
            </select>
          </div>

          {/* Minimum Rating */}
          <div>
            <label
              htmlFor="dir-rating"
              className="block text-xs font-medium text-slate-600 mb-1.5"
            >
              التقييم
            </label>
            <select
              id="dir-rating"
              value={String(filters.minRating)}
              onChange={(e) =>
                onFiltersChange({
                  ...filters,
                  minRating: Number(e.target.value),
                })
              }
              className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm text-[#0B172A] bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="0">كل التقييمات</option>
              <option value="4">4 نجوم فأعلى</option>
              <option value="4.5">4.5 نجوم فأعلى</option>
            </select>
          </div>
        </div>

        {/* Secondary Toolbar: Verification segmented filter + Sort + Reset */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 ml-1">
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              <span>حالة التوثيق:</span>
            </span>
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { value: 'all', label: 'الكل' },
                  { value: 'verified', label: 'الموثّقون يدوياً' },
                  { value: 'unverified', label: 'غير موثّق بعد' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() =>
                    onFiltersChange({ ...filters, verification: tab.value })
                  }
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    filters.verification === tab.value
                      ? 'bg-white text-[#0B172A] shadow-sm'
                      : 'text-slate-600 hover:text-[#0B172A]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="dir-sort" className="text-xs text-slate-500 whitespace-nowrap">
                ترتيب حسب:
              </label>
              <select
                id="dir-sort"
                value={filters.sort}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    sort: e.target.value as SortOption,
                  })
                }
                className="h-9 px-2.5 rounded-lg border border-slate-200 text-xs font-medium text-[#0B172A] bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="verified_first">الموثّقون أولاً</option>
                <option value="highest_rated">الأعلى تقييماً</option>
                <option value="most_experienced">الأكثر خبرة</option>
                <option value="newest">الأحدث انضماماً</option>
              </select>
            </div>

            {hasActiveFilter && (
              <button
                type="button"
                onClick={onResetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-[#0B172A] hover:bg-slate-100 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>إعادة ضبط</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Results Grid or Empty State */}
      {filteredProviders.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProviders.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              category={categories.find((c) => c.id === provider.categoryId)}
              reviews={reviews}
              onSelectProvider={onSelectProvider}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <h2 className="font-display text-xl font-bold text-[#0B172A] mb-2">
            لا توجد نتائج مطابقة لخيارات البحث الحالية
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
            جرّب توسيع نطاق الحي أو إزالة بعض الفلاتر لعرض جميع مقدمي الخدمات
            المعتمدين في الدليل.
          </p>
          <button
            type="button"
            onClick={onResetFilters}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0B172A] hover:bg-[#13233E] text-white text-sm font-semibold transition-colors"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>عرض جميع مقدمي الخدمات</span>
          </button>
        </div>
      )}
    </div>
  );
}
