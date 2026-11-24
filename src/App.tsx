import { useEffect, useMemo, useState } from 'react';
import { Footer } from './components/Footer';
import { Navbar } from './components/Navbar';
import { INITIAL_CATEGORIES, INITIAL_PROVIDERS, INITIAL_REVIEWS } from './data/seedData';
import {
  subscribeApprovedProviders,
  subscribeApprovedReviews,
  subscribeCategories,
  subscribePlatformSettings,
} from './firebase/marketplaceApi';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AuthPage } from './pages/AuthPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { CustomerDashboardPage } from './pages/CustomerDashboardPage';
import { DirectoryPage } from './pages/DirectoryPage';
import { HomePage } from './pages/HomePage';
import { ProviderDashboardPage } from './pages/ProviderDashboardPage';
import { ProviderProfilePage } from './pages/ProviderProfilePage';
import { RegisterProviderPage } from './pages/RegisterProviderPage';
import { ServiceRequestPage } from './pages/ServiceRequestPage';
import {
  AppPage,
  CustomerReview,
  DirectoryFilters,
  PlatformSettings,
  ServiceCategory,
  ServiceProvider,
} from './types/marketplace';

import { useAuth, PENDING_AUTH_PAGE_KEY } from './context/AuthContext';

const DEFAULT_FILTERS: DirectoryFilters = {
  query: '',
  categoryId: '',
  city: '',
  neighborhood: '',
  minRating: 0,
  verification: 'all',
  sort: 'verified_first',
};

function getInitialPage(): AppPage {
  if (typeof window === 'undefined') return 'home';
  try {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('page');
    if (p === 'auth' || p === 'register' || p === 'request-service') {
      params.delete('page');
      const cleaned = params.toString();
      const nextUrl = `${window.location.pathname}${cleaned ? `?${cleaned}` : ''}`;
      window.history.replaceState({}, '', nextUrl);
      return p;
    }
  } catch {
    // Ignore URL parsing issues
  }
  return 'home';
}

export default function App() {
  const { firebaseUser, authLoading, needsOnboarding } = useAuth();
  const [categories, setCategories] = useState<ServiceCategory[]>(INITIAL_CATEGORIES);
  const [firestoreProviders, setFirestoreProviders] = useState<ServiceProvider[]>([]);
  const [firestoreReviews, setFirestoreReviews] = useState<CustomerReview[]>([]);
  const [settings, setSettings] = useState<PlatformSettings>({
    commissionRatePercent: 10,
    weeklyCycleDays: 7,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  });

  const [currentPage, setCurrentPage] = useState<AppPage>(getInitialPage);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [requestCategoryId, setRequestCategoryId] = useState<string>('');
  const [filters, setFilters] = useState<DirectoryFilters>(DEFAULT_FILTERS);

  useEffect(() => {
    const unsubCats = subscribeCategories(setCategories);
    const unsubProvs = subscribeApprovedProviders(setFirestoreProviders);
    const unsubRevs = subscribeApprovedReviews(setFirestoreReviews);
    const unsubSettings = subscribePlatformSettings(setSettings);
    return () => {
      unsubCats();
      unsubProvs();
      unsubRevs();
      unsubSettings();
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    try {
      const pendingPage = sessionStorage.getItem(PENDING_AUTH_PAGE_KEY) as AppPage | null;
      if (pendingPage) {
        sessionStorage.removeItem(PENDING_AUTH_PAGE_KEY);
        if (firebaseUser) {
          setCurrentPage(needsOnboarding && pendingPage !== 'register' ? 'auth' : pendingPage);
          return;
        }
      }
    } catch {
      // Ignore storage access failures
    }
    if (firebaseUser && needsOnboarding && currentPage === 'home') {
      setCurrentPage('auth');
    }
  }, [authLoading, firebaseUser, needsOnboarding, currentPage]);

  // Merge real Firestore approved providers with clearly labeled demo showcase profiles
  const publicProviders = useMemo(() => {
    const demoApproved = INITIAL_PROVIDERS.filter(
      (p) => p.approvalStatus === 'approved'
    );
    const seen = new Set(firestoreProviders.map((p) => p.id));
    return [...firestoreProviders, ...demoApproved.filter((d) => !seen.has(d.id))];
  }, [firestoreProviders]);

  const publicReviews = useMemo(() => {
    const demoApproved = INITIAL_REVIEWS.filter((r) => r.status === 'approved');
    const seen = new Set(firestoreReviews.map((r) => r.id));
    return [...firestoreReviews, ...demoApproved.filter((d) => !seen.has(d.id))];
  }, [firestoreReviews]);

  const navigateTo = (page: AppPage, sectionId?: string) => {
    setCurrentPage(page);
    if (sectionId) {
      setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 60);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSearchSubmit = (partialFilters: Partial<DirectoryFilters>) => {
    setFilters({ ...DEFAULT_FILTERS, ...partialFilters });
    navigateTo('directory');
  };

  const handleSelectProvider = (providerId: string) => {
    setSelectedProviderId(providerId);
    navigateTo('profile');
  };

  const handleRequestCategory = (categoryId: string) => {
    setRequestCategoryId(categoryId);
    navigateTo('request-service');
  };

  const activeProvider = publicProviders.find((p) => p.id === selectedProviderId);

  return (
    <div dir="rtl" className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#0B172A]">
      <Navbar currentPage={currentPage} onNavigate={navigateTo} />

      <main className="flex-1">
        {currentPage === 'home' && (
          <HomePage
            categories={categories}
            providers={publicProviders}
            reviews={publicReviews}
            onNavigate={navigateTo}
            onSearchSubmit={handleSearchSubmit}
            onSelectProvider={handleSelectProvider}
          />
        )}

        {currentPage === 'categories' && (
          <CategoriesPage
            categories={categories}
            providers={publicProviders}
            onSelectCategory={(categoryId) =>
              handleSearchSubmit({ categoryId })
            }
            onRegisterClick={() => navigateTo('register')}
          />
        )}

        {currentPage === 'directory' && (
          <DirectoryPage
            categories={categories}
            providers={publicProviders}
            reviews={publicReviews}
            filters={filters}
            onFiltersChange={setFilters}
            onResetFilters={() => setFilters(DEFAULT_FILTERS)}
            onSelectProvider={handleSelectProvider}
          />
        )}

        {currentPage === 'profile' && (
          <ProviderProfilePage
            provider={activeProvider}
            category={categories.find(
              (c) => c.id === activeProvider?.categoryId
            )}
            reviews={publicReviews}
            onBack={() => navigateTo('directory')}
            onRequestCategory={handleRequestCategory}
            onNavigate={navigateTo}
          />
        )}

        {currentPage === 'register' && (
          <RegisterProviderPage
            categories={categories}
            onNavigate={navigateTo}
          />
        )}

        {currentPage === 'auth' && <AuthPage onNavigate={navigateTo} />}

        {currentPage === 'request-service' && (
          <ServiceRequestPage
            categories={categories}
            initialCategoryId={requestCategoryId}
            onNavigate={navigateTo}
          />
        )}

        {currentPage === 'customer' && (
          <CustomerDashboardPage onNavigate={navigateTo} />
        )}

        {currentPage === 'provider-dashboard' && (
          <ProviderDashboardPage
            categories={categories}
            settings={settings}
            onNavigate={navigateTo}
          />
        )}

        {currentPage === 'admin' && (
          <AdminDashboardPage
            categories={categories}
            settings={settings}
            onNavigate={navigateTo}
            onViewPublicProfile={handleSelectProvider}
          />
        )}
      </main>

      <Footer onNavigate={navigateTo} />
    </div>
  );
}
