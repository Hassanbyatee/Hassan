import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AppPage } from '../types/marketplace';

interface NavbarProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage, sectionId?: string) => void;
}

export function Navbar({ currentPage, onNavigate }: NavbarProps) {
  const {
    firebaseUser,
    userProfile,
    isAdmin,
    hasProviderProfile,
    authLoading,
    needsOnboarding,
  } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLinkClick = (page: AppPage, sectionId?: string) => {
    setMobileOpen(false);
    onNavigate(page, sectionId);
  };

  const isProviderUser =
    userProfile?.role === 'provider' || hasProviderProfile;

  const accountTarget: AppPage = !firebaseUser
    ? 'auth'
    : isAdmin
    ? 'admin'
    : isProviderUser
    ? 'provider-dashboard'
    : userProfile?.role === 'customer'
    ? 'customer'
    : 'auth';

  const accountLabel = authLoading
    ? 'جارٍ التحقق...'
    : !firebaseUser
    ? 'تسجيل الدخول'
    : needsOnboarding && !hasProviderProfile
    ? 'إكمال الحساب'
    : isAdmin
    ? 'لوحة الإدارة'
    : isProviderUser
    ? 'لوحة الفني'
    : 'حسابي';

  return (
    <header className="sticky top-0 z-40 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-element clean brand wordmark */}
        <button
          type="button"
          onClick={() => handleLinkClick('home')}
          className="font-display text-2xl font-extrabold tracking-tight text-[#0B172A] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-md px-1"
        >
          خدمتي
        </button>

        {/* Zone 2: 5 concise single-line navigation links */}
        <nav
          aria-label="التنقل الرئيسي"
          className="hidden lg:flex items-center gap-7 text-sm font-medium text-slate-600"
        >
          <button
            type="button"
            onClick={() => handleLinkClick('home')}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-sm ${
              currentPage === 'home'
                ? 'border-emerald-600 text-[#0B172A] font-semibold'
                : 'border-transparent hover:text-[#0B172A] hover:border-slate-300'
            }`}
          >
            الرئيسية
          </button>
          <button
            type="button"
            onClick={() => handleLinkClick('categories')}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-sm ${
              currentPage === 'categories'
                ? 'border-emerald-600 text-[#0B172A] font-semibold'
                : 'border-transparent hover:text-[#0B172A] hover:border-slate-300'
            }`}
          >
            التصنيفات
          </button>
          <button
            type="button"
            onClick={() => handleLinkClick('directory')}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-sm ${
              currentPage === 'directory' || currentPage === 'profile'
                ? 'border-emerald-600 text-[#0B172A] font-semibold'
                : 'border-transparent hover:text-[#0B172A] hover:border-slate-300'
            }`}
          >
            ابحث عن فني
          </button>
          <button
            type="button"
            onClick={() => handleLinkClick('request-service')}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-sm ${
              currentPage === 'request-service'
                ? 'border-emerald-600 text-[#0B172A] font-semibold'
                : 'border-transparent hover:text-[#0B172A] hover:border-slate-300'
            }`}
          >
            اطلب خدمة
          </button>
          <button
            type="button"
            onClick={() => handleLinkClick('register')}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-sm ${
              currentPage === 'register'
                ? 'border-emerald-600 text-[#0B172A] font-semibold'
                : 'border-transparent hover:text-[#0B172A] hover:border-slate-300'
            }`}
          >
            انضم كفني
          </button>
        </nav>

        {/* Zone 3: Single primary action CTA + Mobile menu toggle */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => handleLinkClick(accountTarget)}
            className="hidden sm:inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold text-white bg-[#0B172A] hover:bg-[#13233E] rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          >
            {accountLabel}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
            className="lg:hidden inline-flex items-center justify-center w-11 h-11 rounded-lg border border-slate-200 text-[#0B172A] hover:bg-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-1">
          <button
            type="button"
            onClick={() => handleLinkClick('home')}
            className={`w-full text-right px-4 py-3 rounded-lg text-sm font-medium min-h-[44px] flex items-center justify-between ${
              currentPage === 'home'
                ? 'bg-slate-100 text-[#0B172A] font-semibold'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span>الرئيسية</span>
          </button>
          <button
            type="button"
            onClick={() => handleLinkClick('categories')}
            className={`w-full text-right px-4 py-3 rounded-lg text-sm font-medium min-h-[44px] flex items-center justify-between ${
              currentPage === 'categories'
                ? 'bg-slate-100 text-[#0B172A] font-semibold'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span>التصنيفات</span>
          </button>
          <button
            type="button"
            onClick={() => handleLinkClick('directory')}
            className={`w-full text-right px-4 py-3 rounded-lg text-sm font-medium min-h-[44px] flex items-center justify-between ${
              currentPage === 'directory' || currentPage === 'profile'
                ? 'bg-slate-100 text-[#0B172A] font-semibold'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span>ابحث عن فني</span>
          </button>
          <button
            type="button"
            onClick={() => handleLinkClick('request-service')}
            className={`w-full text-right px-4 py-3 rounded-lg text-sm font-medium min-h-[44px] flex items-center justify-between ${
              currentPage === 'request-service'
                ? 'bg-slate-100 text-[#0B172A] font-semibold'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span>اطلب خدمة</span>
          </button>
          <button
            type="button"
            onClick={() => handleLinkClick('register')}
            className={`w-full text-right px-4 py-3 rounded-lg text-sm font-medium min-h-[44px] flex items-center justify-between ${
              currentPage === 'register'
                ? 'bg-slate-100 text-[#0B172A] font-semibold'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span>انضم كفني</span>
          </button>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => handleLinkClick(accountTarget)}
              className="w-full px-4 py-3 rounded-lg text-sm font-semibold text-white bg-[#0B172A] hover:bg-[#13233E] min-h-[44px]"
            >
              {accountLabel}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
