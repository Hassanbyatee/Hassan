import { ArrowLeft } from 'lucide-react';
import { CategoryIcon } from '../components/CategoryIcon';
import { ServiceCategory, ServiceProvider } from '../types/marketplace';

interface CategoriesPageProps {
  categories: ServiceCategory[];
  providers: ServiceProvider[];
  onSelectCategory: (categoryId: string) => void;
  onRegisterClick: () => void;
}

export function CategoriesPage({
  categories,
  providers,
  onSelectCategory,
  onRegisterClick,
}: CategoriesPageProps) {
  const activeCategories = categories.filter((c) => c.isActive);
  const approvedProviders = providers.filter(
    (p) => p.approvalStatus === 'approved'
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
      <div className="max-w-2xl mb-12">
        <p className="text-xs font-medium text-emerald-700 mb-2">
          دليل التخصصات المهنية في خدمتي
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-[#0B172A]">
          تصنيفات الخدمات المنزلية
        </h1>
        <p className="mt-3 text-base text-slate-600 leading-relaxed">
          اختر التخصص الذي يحتاجه منزلك لاستعراض الفنيين المتاحين في أربيل
          وبقية المحافظات مع تصفية حسب الحي وحالة التوثيق.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {activeCategories.map((category) => {
          const matching = approvedProviders.filter(
            (p) => p.categoryId === category.id
          );
          const verifiedCount = matching.filter(
            (p) => p.verificationStatus === 'verified'
          ).length;

          return (
            <article
              key={category.id}
              className="bg-white border border-slate-200/90 rounded-xl p-6 flex flex-col justify-between hover:border-slate-300 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-[#0B172A] text-white flex items-center justify-center shrink-0">
                    <CategoryIcon name={category.icon} className="w-6 h-6" />
                  </div>
                  <div className="text-xs text-slate-500 tabular-nums text-left">
                    <span>{matching.length} مقدم خدمة</span>
                    {verifiedCount > 0 && (
                      <>
                        <span className="mx-1.5" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-emerald-700 font-medium">
                          {verifiedCount} موثّق يدوياً
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <h2 className="font-display text-xl font-bold text-[#0B172A] mb-2">
                  {category.nameAr}
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {category.descriptionAr}
                </p>

                {category.examplesAr.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs font-medium text-slate-500 mb-2">
                      أبرز الأعمال الشائعة:
                    </p>
                    <ul className="space-y-1.5 text-xs sm:text-sm text-slate-700">
                      {category.examplesAr.map((example) => (
                        <li key={example} className="flex items-center gap-2">
                          <span className="text-emerald-600" aria-hidden="true">
                            —
                          </span>
                          <span>{example}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => onSelectCategory(category.id)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0B172A] hover:bg-[#13233E] text-white text-xs sm:text-sm font-semibold transition-colors"
                >
                  <span>عرض مقدمي هذه الخدمة</span>
                  <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={onRegisterClick}
                  className="text-xs font-medium text-slate-600 hover:text-[#0B172A] transition-colors"
                >
                  أنت مختص في هذا المجال؟ سجّل الآن
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
