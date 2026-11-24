import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AppPage } from '../types/marketplace';

interface FooterProps {
  onNavigate: (page: AppPage, sectionId?: string) => void;
}

export function Footer({ onNavigate }: FooterProps) {
  const { isAdmin } = useAuth();

  return (
    <footer className="bg-[#0B172A] text-slate-300 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-12 border-b border-slate-800">
          <div className="md:col-span-5 space-y-4">
            <div className="flex items-center gap-3">
              <span className="font-display text-2xl font-extrabold text-white">
                خدمتي
              </span>
              <span className="text-xs text-slate-400 font-mono-tabular">
                KHIDMATI
              </span>
            </div>
            <p className="text-sm leading-relaxed text-slate-300 max-w-md">
              منصة عراقية تبدأ من أربيل لربط العائلات وأصحاب المنازل بمقدمي
              الخدمات المهنية الموثوقين يدوياً، عبر معايير واضحة للشفافية وجودة
              العمل.
            </p>
            <div className="flex items-start gap-2.5 text-xs text-emerald-300/90 pt-1">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                التوثيق الفعلي يتم بمراجعة يدوية كاملة للوثائق؛ البيانات المعلّمة
                بـ «نموذج عرض» هي أمثلة توضيحية.
              </span>
            </div>
          </div>

          <div className="md:col-span-3 space-y-3">
            <h3 className="text-sm font-semibold text-white">روابط المنصة</h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('home')}
                  className="hover:text-white transition-colors"
                >
                  الصفحة الرئيسية
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('categories')}
                  className="hover:text-white transition-colors"
                >
                  تصنيفات الخدمات
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('directory')}
                  className="hover:text-white transition-colors"
                >
                  البحث عن مقدم خدمة
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('request-service')}
                  className="hover:text-white transition-colors"
                >
                  اطلب خدمة لمنزلك
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('register')}
                  className="hover:text-white transition-colors"
                >
                  تسجيل مقدم خدمة جديد
                </button>
              </li>
            </ul>
          </div>

          <div className="md:col-span-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">النطاق والثقة</h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('home', 'trust-standards')}
                  className="hover:text-white transition-colors"
                >
                  سياسة التوثيق اليدوي والهوية
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate(isAdmin ? 'admin' : 'auth')}
                  className="hover:text-white transition-colors"
                >
                  {isAdmin ? 'لوحة الإدارة والمراجعة' : 'تسجيل الدخول / حسابي'}
                </button>
              </li>
              <li className="text-slate-400">
                نقطة الانطلاق: أربيل، إقليم كردستان العراق
              </li>
              <li className="text-slate-400">
                التوسع القادم: السليمانية · دهوك · بغداد · البصرة
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-400">
          <p>© {new Date().getFullYear()} منصة خدمتي | KHIDMATI. جميع الحقوق محفوظة.</p>
          <p>مبنية للثقة والشفافية في سوق الخدمات المحلية في العراق.</p>
        </div>
      </div>
    </footer>
  );
}
