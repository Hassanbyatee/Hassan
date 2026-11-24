import { FormEvent, useEffect, useState } from 'react';
import {
  Bell,
  Briefcase,
  Check,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileCheck2,
  FolderKanban,
  LayoutDashboard,
  Lock,
  MessageSquareWarning,
  Plus,
  Receipt,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { AdminCustomerManagement } from '../components/AdminCustomerManagement';
import { useAuth } from '../context/AuthContext';
import {
  adminAddOrToggleCategory,
  adminAssignServiceRequest,
  adminDeleteProvider,
  adminMarkStatementOverdue,
  adminMarkStatementPaid,
  adminRefundPayment,
  adminResolveComplaint,
  adminUpdatePlatformCommissionRate,
  adminUpdateProviderStatus,
  adminUpdateRequestStatus,
  adminUpdateReviewStatus,
  adminUpdateUserSuspension,
  ensureAdminSeedData,
  fetchProviderPrivateDocs,
  markNotificationRead,
  subscribeAdminWorkspace,
} from '../firebase/marketplaceApi';
import {
  AccountDeletionRequest,
  AppPage,
  AppUser,
  CategoryIconName,
  CommissionRecord,
  CustomerAdminMeta,
  CustomerReview,
  NotificationItem,
  PaymentGateway,
  PaymentRecord,
  PlatformSettings,
  ProviderReport,
  ServiceCategory,
  ServiceProvider,
  ServiceRequest,
  ServiceRequestStatus,
  VerificationDocument,
  WeeklyStatement,
} from '../types/marketplace';
import {
  formatArabicDate,
  formatIQD,
  formatPhoneDisplay,
  REQUEST_STATUS_META,
} from '../utils/format';

type AdminTab =
  | 'overview'
  | 'requests'
  | 'customers'
  | 'providers'
  | 'commissions'
  | 'categories'
  | 'moderation'
  | 'notifications';

interface AdminDashboardPageProps {
  categories: ServiceCategory[];
  settings: PlatformSettings;
  onNavigate: (page: AppPage) => void;
  onViewPublicProfile: (providerId: string) => void;
}

export function AdminDashboardPage({
  categories,
  settings,
  onNavigate,
  onViewPublicProfile,
}: AdminDashboardPageProps) {
  const { firebaseUser, isAdmin, signOutUser } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  const [users, setUsers] = useState<AppUser[]>([]);
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [statements, setStatements] = useState<WeeklyStatement[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [complaints, setComplaints] = useState<ProviderReport[]>([]);
  const [customerMeta, setCustomerMeta] = useState<CustomerAdminMeta[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<
    AccountDeletionRequest[]
  >([]);

  // Gateway health from Node.js server
  const [gatewayHealth, setGatewayHealth] = useState<{
    zainCashConfigured: boolean;
    zainCashWebhookConfigured: boolean;
    emailProviderConfigured: boolean;
  }>({
    zainCashConfigured: false,
    zainCashWebhookConfigured: false,
    emailProviderConfigured: false,
  });

  // Filters & Feedback
  const [requestStatusFilter, setRequestStatusFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Inspect Docs Modal
  const [inspectProvider, setInspectProvider] =
    useState<ServiceProvider | null>(null);
  const [inspectedDocs, setInspectedDocs] = useState<VerificationDocument[]>(
    []
  );

  // Assign Provider Modal
  const [assigningRequest, setAssigningRequest] =
    useState<ServiceRequest | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState('');

  // Commission Rate Config
  const [rateInput, setRateInput] = useState(
    String(settings.commissionRatePercent)
  );

  // Manual Payment Modal
  const [payingStatement, setPayingStatement] =
    useState<WeeklyStatement | null>(null);
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentGateway>('manual_cash');
  const [txReference, setTxReference] = useState('');

  // Refund Modal
  const [refundingPayment, setRefundingPayment] =
    useState<PaymentRecord | null>(null);
  const [refundReason, setRefundReason] = useState('');

  // Category Form
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatIcon, setNewCatIcon] = useState<CategoryIconName>('wrench');

  useEffect(() => {
    setRateInput(String(settings.commissionRatePercent));
  }, [settings.commissionRatePercent]);

  useEffect(() => {
    if (!firebaseUser || !isAdmin) return;
    void ensureAdminSeedData(firebaseUser.uid);

    void fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setGatewayHealth(d))
      .catch(() => {});

    return subscribeAdminWorkspace({
      onUsers: setUsers,
      onProviders: setProviders,
      onRequests: setRequests,
      onReviews: setReviews,
      onCommissions: setCommissions,
      onStatements: setStatements,
      onPayments: setPayments,
      onNotifications: setNotifications,
      onComplaints: setComplaints,
      onCustomerMeta: setCustomerMeta,
      onDeletionRequests: setDeletionRequests,
    });
  }, [firebaseUser, isAdmin]);

  if (!firebaseUser || !isAdmin) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-[#0B172A] text-white flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-bold text-[#0B172A]">
            وصول مقيّد للمشرفين المخوّلين فقط
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            لوحة الإدارة محمية بقواعد أمان Firestore وصلاحيات المشرفين. لا
            يمكن للمستخدمين منح أنفسهم صلاحية المشرف.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigate(firebaseUser ? 'home' : 'auth')}
              className="px-5 py-2.5 rounded-lg bg-[#0B172A] text-white text-sm font-semibold"
            >
              {firebaseUser ? 'العودة للرئيسية' : 'تسجيل الدخول'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Required 8 KPIs
  const totalCustomers = users.filter((u) => u.role === 'customer').length;
  const totalProvidersCount = providers.length;
  const pendingProviders = providers.filter(
    (p) => p.approvalStatus === 'pending'
  );
  const verifiedProvidersCount = providers.filter(
    (p) => p.verificationStatus === 'verified'
  ).length;
  const newRequestsCount = requests.filter(
    (r) => r.status === 'Pending'
  ).length;
  const completedJobsCount = requests.filter(
    (r) => r.status === 'Completed'
  ).length;
  const totalPlatformRevenue = commissions
    .filter((c) => c.status === 'paid')
    .reduce((sum, c) => sum + c.commissionAmount, 0);
  const outstandingCommissions = commissions
    .filter((c) => c.status !== 'paid')
    .reduce((sum, c) => sum + c.commissionAmount, 0);

  const unreadAdminNotifications = notifications.filter(
    (n) => n.recipientRole === 'admin' && !n.isRead
  ).length;
  const approvedProviders = providers.filter(
    (p) => p.approvalStatus === 'approved'
  );

  const notify = (msg: string) => {
    setErrorMsg('');
    setFeedbackMsg(msg);
  };

  const fail = (err: unknown) => {
    setFeedbackMsg('');
    setErrorMsg(err instanceof Error ? err.message : 'تعذّر تنفيذ الإجراء.');
  };

  const handleInspectProvider = async (prov: ServiceProvider) => {
    setInspectProvider(prov);
    setInspectedDocs([]);
    try {
      const docs = await fetchProviderPrivateDocs(prov.id);
      setInspectedDocs(docs);
    } catch {
      setInspectedDocs([]);
    }
  };

  const handleSaveCommissionRate = async (e: FormEvent) => {
    e.preventDefault();
    const num = Number(rateInput);
    if (Number.isNaN(num) || num < 0 || num > 50) {
      fail(new Error('يرجى إدخال نسبة عمولة صحيحة بين 0% و 50%.'));
      return;
    }
    try {
      await adminUpdatePlatformCommissionRate(num, firebaseUser.uid);
      notify(`تم تحديث نسبة عمولة المنصة إلى ${num}% بنجاح.`);
    } catch (err) {
      fail(err);
    }
  };

  const handleConfirmManualPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!payingStatement || txReference.trim().length < 2) {
      fail(new Error('يرجى إدخال رقم المرجع أو الإيصال لتأكيد السداد.'));
      return;
    }
    try {
      await adminMarkStatementPaid({
        statement: payingStatement,
        paymentMethod,
        transactionReference: txReference,
      });
      setPayingStatement(null);
      setTxReference('');
      notify('تم تأكيد سداد الكشف الأسبوعي وتحديث العمولات بنجاح.');
    } catch (err) {
      fail(err);
    }
  };

  const handleRefundSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!refundingPayment || refundReason.trim().length < 4) return;
    try {
      await adminRefundPayment(refundingPayment.id, refundReason);
      setRefundingPayment(null);
      setRefundReason('');
      notify('تم تسجيل حالة الاسترجاع للدفعة.');
    } catch (err) {
      fail(err);
    }
  };

  const handleAssignSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!assigningRequest || !selectedProviderId) return;
    const prov = approvedProviders.find((p) => p.id === selectedProviderId);
    if (!prov) return;
    try {
      await adminAssignServiceRequest({
        requestId: assigningRequest.id,
        providerId: prov.id,
        providerName: prov.fullName,
        customerId: assigningRequest.customerId,
      });
      setAssigningRequest(null);
      setSelectedProviderId('');
      notify(`تم تعيين ${prov.fullName} للطلب ${assigningRequest.id}.`);
    } catch (err) {
      fail(err);
    }
  };

  const handleCreateCategory = async (e: FormEvent) => {
    e.preventDefault();
    if (newCatName.trim().length < 2 || newCatDesc.trim().length < 5) return;
    const id = `cat-${Date.now().toString(36)}`;
    try {
      await adminAddOrToggleCategory({
        id,
        slug: id,
        nameAr: newCatName.trim(),
        descriptionAr: newCatDesc.trim(),
        examplesAr: [],
        icon: newCatIcon,
        isActive: true,
      });
      setNewCatName('');
      setNewCatDesc('');
      notify('تمت إضافة التصنيف الجديد إلى Firestore.');
    } catch (err) {
      fail(err);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Admin Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-xs text-emerald-700 font-medium mb-1">
            لوحة الإدارة المحمية · {firebaseUser.email}
          </p>
          <h1 className="font-display text-2xl font-extrabold text-[#0B172A]">
            إدارة منصة خدمتي — أربيل والعراق
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-[#0B172A] hover:bg-slate-50"
          >
            <Bell className="w-4 h-4 text-emerald-700" aria-hidden="true" />
            <span>الإشعارات ({unreadAdminNotifications})</span>
          </button>
          <button
            type="button"
            onClick={() => void signOutUser().then(() => onNavigate('home'))}
            className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{feedbackMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sidebar */}
        <aside className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-3 space-y-1">
          {(
            [
              { id: 'overview', label: 'نظرة عامة', icon: LayoutDashboard },
              {
                id: 'requests',
                label: 'طلبات العملاء',
                icon: ClipboardList,
                count: newRequestsCount,
              },
              {
                id: 'customers',
                label: 'إدارة العملاء',
                icon: UserCog,
                count: deletionRequests.filter((d) => d.status === 'pending')
                  .length,
              },
              {
                id: 'providers',
                label: 'مقدمو الخدمات والتوثيق',
                icon: Users,
                count: pendingProviders.length,
              },
              {
                id: 'commissions',
                label: 'العمولات والمدفوعات',
                icon: Receipt,
              },
              {
                id: 'categories',
                label: 'التصنيفات',
                icon: FolderKanban,
              },
              {
                id: 'moderation',
                label: 'التقييمات والشكاوى',
                icon: MessageSquareWarning,
                count:
                  reviews.filter((r) => r.status === 'pending').length +
                  complaints.filter((c) => c.status !== 'resolved').length,
              },
              {
                id: 'notifications',
                label: 'مركز الإشعارات',
                icon: Bell,
                count: unreadAdminNotifications,
              },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[42px] ${
                  active
                    ? 'bg-[#0B172A] text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="inline-flex items-center gap-2.5 truncate">
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </span>
                {'count' in item && item.count > 0 && (
                  <span
                    className={`font-mono-tabular text-xs px-1.5 py-0.5 rounded ${
                      active
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Main Viewport */}
        <div className="lg:col-span-9 space-y-6">
          {/* TAB 1: OVERVIEW (8 KPIs) */}
          {activeTab === 'overview' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">إجمالي العملاء</p>
                  <p className="font-mono-tabular text-2xl font-bold text-[#0B172A]">
                    {totalCustomers}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">مقدمو الخدمات</p>
                  <p className="font-mono-tabular text-2xl font-bold text-[#0B172A]">
                    {totalProvidersCount}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">طلبات انضمام معلّقة</p>
                  <p className="font-mono-tabular text-2xl font-bold text-amber-700">
                    {pendingProviders.length}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">مقدمون موثّقون</p>
                  <p className="font-mono-tabular text-2xl font-bold text-emerald-700">
                    {verifiedProvidersCount}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">طلبات خدمة جديدة</p>
                  <p className="font-mono-tabular text-2xl font-bold text-sky-700">
                    {newRequestsCount}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">أعمال مكتملة</p>
                  <p className="font-mono-tabular text-2xl font-bold text-emerald-700">
                    {completedJobsCount}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">إيرادات المنصة المحصّلة</p>
                  <p className="font-mono-tabular text-lg font-bold text-[#0B172A]">
                    {formatIQD(totalPlatformRevenue)}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">عمولات مستحقة</p>
                  <p className="font-mono-tabular text-lg font-bold text-rose-700">
                    {formatIQD(outstandingCommissions)}
                  </p>
                </div>
              </div>

              {/* Pending Providers Approval Queue on Overview */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-bold text-[#0B172A]">
                    طلبات انضمام مقدمي الخدمات بانتظار الموافقة ({pendingProviders.length})
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setProviderFilter('pending');
                      setActiveTab('providers');
                    }}
                    className="text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    عرض الكل في إدارة مقدمي الخدمات
                  </button>
                </div>
                {pendingProviders.length === 0 ? (
                  <p className="text-sm text-slate-500 py-3">
                    لا توجد طلبات انضمام معلّقة حالياً. عند تسجيل أي فني جديد سيظهر هنا فوراً للمراجعة والاعتماد.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {pendingProviders.map((prov) => {
                      const cat = categories.find(
                        (c) => c.id === prov.categoryId
                      );
                      return (
                        <div
                          key={prov.id}
                          className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-0.5">
                            <p className="text-sm font-bold text-[#0B172A]">
                              {prov.fullName}{' '}
                              <span className="text-xs font-normal text-slate-500">
                                · {cat?.nameAr ?? prov.categoryId} ·{' '}
                                {prov.city} — {prov.neighborhood}
                              </span>
                            </p>
                            <p className="text-xs text-slate-600">
                              <span dir="ltr" className="font-mono-tabular">
                                {formatPhoneDisplay(prov.phone)}
                              </span>{' '}
                              · خبرة {prov.yearsExperience} سنوات
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleInspectProvider(prov)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              مراجعة الوثائق
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void adminUpdateProviderStatus(prov.id, {
                                  approvalStatus: 'approved',
                                })
                                  .then(() =>
                                    notify(`تم اعتماد حساب ${prov.fullName} بنجاح.`)
                                  )
                                  .catch(fail)
                              }
                              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                            >
                              اعتماد الحساب
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void adminUpdateProviderStatus(prov.id, {
                                  approvalStatus: 'rejected',
                                })
                                  .then(() => notify(`تم رفض طلب ${prov.fullName}.`))
                                  .catch(fail)
                              }
                              className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-medium"
                            >
                              رفض
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-[#0B172A]">
                  أحدث طلبات العملاء ({requests.length})
                </h2>
                {requests.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4">
                    لا توجد طلبات خدمة مسجلة حتى الآن.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {requests.slice(0, 5).map((req) => (
                      <div
                        key={req.id}
                        className="py-3 flex flex-wrap items-center justify-between gap-3 text-sm"
                      >
                        <div>
                          <strong className="text-[#0B172A]">
                            {req.categoryName}
                          </strong>{' '}
                          <span className="text-xs text-slate-500">
                            · {req.customerName} ({req.city} — {req.neighborhood})
                          </span>
                        </div>
                        <span
                          className={`text-xs font-semibold ${
                            REQUEST_STATUS_META[req.status].tone
                          }`}
                        >
                          {REQUEST_STATUS_META[req.status].labelAr}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB 2: SERVICE REQUESTS */}
          {activeTab === 'requests' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="font-display text-lg font-bold text-[#0B172A]">
                  إدارة طلبات الخدمة ({requests.length})
                </h2>
                <select
                  value={requestStatusFilter}
                  onChange={(e) => setRequestStatusFilter(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-slate-200 text-xs bg-white"
                >
                  <option value="all">كل الحالات</option>
                  {(
                    Object.keys(REQUEST_STATUS_META) as ServiceRequestStatus[]
                  ).map((st) => (
                    <option key={st} value={st}>
                      {REQUEST_STATUS_META[st].labelAr} ({st})
                    </option>
                  ))}
                </select>
              </div>

              <div className="divide-y divide-slate-100">
                {requests
                  .filter((r) =>
                    requestStatusFilter === 'all'
                      ? true
                      : r.status === requestStatusFilter
                  )
                  .map((req) => (
                    <div key={req.id} className="py-4 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-slate-500">
                          <strong className="text-sm text-[#0B172A]">
                            {req.categoryName}
                          </strong>{' '}
                          · {req.customerName} · {req.customerPhone} ·{' '}
                          {req.city} — {req.neighborhood}
                        </div>
                        <span
                          className={`text-xs font-semibold ${
                            REQUEST_STATUS_META[req.status].tone
                          }`}
                        >
                          {REQUEST_STATUS_META[req.status].labelAr}
                        </span>
                      </div>

                      <p className="text-sm text-slate-700">
                        {req.problemDescription}
                      </p>

                      {req.disputeReason && (
                        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
                          سبب النزاع: {req.disputeReason}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span>
                          الموعد: {req.preferredTime}
                          {req.assignedProviderName
                            ? ` · الفني: ${req.assignedProviderName}`
                            : ''}
                          {req.agreedPrice
                            ? ` · السعر: ${formatIQD(req.agreedPrice)}`
                            : ''}
                        </span>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {req.status === 'Pending' && (
                            <button
                              type="button"
                              onClick={() =>
                                void adminUpdateRequestStatus(
                                  req.id,
                                  'Approved',
                                  req.customerId
                                ).then(() => notify('تم اعتماد الطلب.'))
                              }
                              className="px-3 py-1.5 rounded-lg bg-sky-600 text-white font-semibold"
                            >
                              اعتماد الطلب
                            </button>
                          )}

                          {(req.status === 'Pending' ||
                            req.status === 'Approved') && (
                            <button
                              type="button"
                              onClick={() => {
                                setAssigningRequest(req);
                                setSelectedProviderId(
                                  approvedProviders[0]?.id ?? ''
                                );
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[#0B172A] text-white font-semibold"
                            >
                              تعيين فني
                            </button>
                          )}

                          {req.status === 'Disputed' && (
                            <button
                              type="button"
                              onClick={() =>
                                void adminUpdateRequestStatus(
                                  req.id,
                                  'Completed',
                                  req.customerId
                                ).then(() =>
                                  notify('تم إغلاق النزاع واعتماد الإنجاز.')
                                )
                              }
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold"
                            >
                              حل النزاع (مكتمل)
                            </button>
                          )}

                          {req.status !== 'Completed' &&
                            req.status !== 'Cancelled' && (
                              <button
                                type="button"
                                onClick={() =>
                                  void adminUpdateRequestStatus(
                                    req.id,
                                    'Cancelled',
                                    req.customerId
                                  ).then(() => notify('تم إلغاء الطلب.'))
                                }
                                className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700"
                              >
                                إلغاء / رفض
                              </button>
                            )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* TAB 2B: ADMIN CUSTOMER MANAGEMENT */}
          {activeTab === 'customers' && (
            <AdminCustomerManagement
              adminUid={firebaseUser.uid}
              users={users}
              requests={requests}
              reviews={reviews}
              complaints={complaints}
              customerMeta={customerMeta}
              deletionRequests={deletionRequests}
              onNotify={notify}
              onFail={fail}
            />
          )}

          {/* TAB 3: PROVIDERS & VERIFICATION */}
          {activeTab === 'providers' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-lg font-bold text-[#0B172A]">
                  مقدمو الخدمات وتدقيق الهوية ({providers.length})
                </h2>
                <select
                  value={providerFilter}
                  onChange={(e) => setProviderFilter(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-slate-200 text-xs bg-white"
                >
                  <option value="all">الكل</option>
                  <option value="pending">بانتظار الموافقة</option>
                  <option value="approved">معتمد</option>
                  <option value="suspended">معلّق</option>
                  <option value="rejected">مرفوض</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs sm:text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-xs">
                      <th className="py-2.5 px-2">مقدم الخدمة</th>
                      <th className="py-2.5 px-2">الموقع والتخصص</th>
                      <th className="py-2.5 px-2">الاعتماد</th>
                      <th className="py-2.5 px-2">التوثيق</th>
                      <th className="py-2.5 px-2">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {providers
                      .filter((p) =>
                        providerFilter === 'all'
                          ? true
                          : p.approvalStatus === providerFilter
                      )
                      .map((prov) => {
                        const cat = categories.find(
                          (c) => c.id === prov.categoryId
                        );
                        return (
                          <tr key={prov.id}>
                            <td className="py-3 px-2">
                              <p className="font-semibold text-[#0B172A]">
                                {prov.fullName}
                              </p>
                              <p
                                dir="ltr"
                                className="font-mono-tabular text-xs text-slate-500 text-right"
                              >
                                {formatPhoneDisplay(prov.phone)}
                              </p>
                            </td>
                            <td className="py-3 px-2 text-xs text-slate-600">
                              <p>{cat?.nameAr ?? '—'}</p>
                              <p>
                                {prov.city} — {prov.neighborhood}
                              </p>
                            </td>
                            <td className="py-3 px-2 text-xs font-semibold">
                              {prov.approvalStatus === 'approved' ? (
                                <span className="text-emerald-700">معتمد</span>
                              ) : prov.approvalStatus === 'pending' ? (
                                <span className="text-amber-700">بانتظار الموافقة</span>
                              ) : prov.approvalStatus === 'suspended' ? (
                                <span className="text-rose-700">معلّق</span>
                              ) : (
                                <span className="text-slate-600">مرفوض</span>
                              )}
                            </td>
                            <td className="py-3 px-2 text-xs">
                              {prov.verificationStatus === 'verified' ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>موثّق</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-slate-500">
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  <span>غير موثّق</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-2">
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  title="مراجعة الوثائق"
                                  onClick={() =>
                                    void handleInspectProvider(prov)
                                  }
                                  className="p-1.5 rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
                                >
                                  <FileCheck2 className="w-3.5 h-3.5" />
                                </button>
                                {prov.approvalStatus !== 'approved' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void adminUpdateProviderStatus(prov.id, {
                                        approvalStatus: 'approved',
                                      })
                                        .then(() => notify('تم اعتماد الحساب.'))
                                        .catch(fail)
                                    }
                                    className="px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-medium"
                                  >
                                    اعتماد
                                  </button>
                                )}
                                {prov.approvalStatus === 'pending' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void adminUpdateProviderStatus(prov.id, {
                                        approvalStatus: 'rejected',
                                      })
                                        .then(() => notify('تم رفض الطلب.'))
                                        .catch(fail)
                                    }
                                    className="px-2.5 py-1 rounded border border-rose-200 text-rose-700 text-xs font-medium"
                                  >
                                    رفض
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next =
                                      prov.verificationStatus === 'verified'
                                        ? 'unverified'
                                        : 'verified';
                                    void adminUpdateProviderStatus(prov.id, {
                                      verificationStatus: next,
                                      ...(next === 'verified'
                                        ? {
                                            verifiedAt:
                                              new Date().toISOString(),
                                          }
                                        : {}),
                                    })
                                      .then(() =>
                                        notify('تم تحديث حالة توثيق الهوية.')
                                      )
                                      .catch(fail);
                                  }}
                                  className="px-2.5 py-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-medium"
                                >
                                  {prov.verificationStatus === 'verified'
                                    ? 'إلغاء التوثيق'
                                    : 'توثيق الهوية'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next =
                                      prov.approvalStatus === 'suspended'
                                        ? 'approved'
                                        : 'suspended';
                                    void adminUpdateProviderStatus(prov.id, {
                                      approvalStatus: next,
                                    }).catch(fail);
                                    if (prov.uid) {
                                      void adminUpdateUserSuspension(
                                        prov.uid,
                                        next === 'suspended'
                                      ).catch(() => {});
                                    }
                                    notify(
                                      next === 'suspended'
                                        ? 'تم تعليق الحساب.'
                                        : 'تم رفع التعليق.'
                                    );
                                  }}
                                  className="px-2.5 py-1 rounded border border-amber-200 text-amber-800 text-xs font-medium"
                                >
                                  {prov.approvalStatus === 'suspended'
                                    ? 'فك التعليق'
                                    : 'تعليق'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void adminDeleteProvider(prov.id)
                                      .then(() => notify('تم حذف الحساب.'))
                                      .catch(fail)
                                  }
                                  className="p-1.5 rounded border border-rose-200 text-rose-700 hover:bg-rose-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: COMMISSIONS, WEEKLY STATEMENTS & PAYMENT ARCHITECTURE */}
          {activeTab === 'commissions' && (
            <div className="space-y-6">
              {/* Commission Rate Config + Gateway Readiness */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <form
                  onSubmit={handleSaveCommissionRate}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
                >
                  <h2 className="font-display text-base font-bold text-[#0B172A]">
                    نسبة عمولة المنصة القابلة للتعديل
                  </h2>
                  <p className="text-xs text-slate-600">
                    تُحسب العمولات على الخادم (Node.js) باستخدام هذه النسبة
                    لكل طلب مكتمل.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="50"
                      step="0.5"
                      value={rateInput}
                      onChange={(e) => setRateInput(e.target.value)}
                      className="w-28 h-10 px-3 rounded-lg border border-slate-200 font-mono-tabular text-sm"
                    />
                    <span className="text-sm font-semibold text-slate-700">
                      %
                    </span>
                    <button
                      type="submit"
                      className="px-4 h-10 rounded-lg bg-[#0B172A] text-white text-xs font-semibold"
                    >
                      حفظ النسبة
                    </button>
                  </div>
                </form>

                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <CreditCard
                      className="w-4 h-4 text-emerald-700"
                      aria-hidden="true"
                    />
                    <h2 className="font-display text-base font-bold text-[#0B172A]">
                      جاهزية بوابات الدفع والإشعارات
                    </h2>
                  </div>
                  <ul className="text-xs text-slate-600 space-y-1.5">
                    <li>
                      • التأكيد اليدوي (نقدي / تحويل):{' '}
                      <strong className="text-emerald-700">مفعّل ويعمل</strong>
                    </li>
                    <li>
                      • بوابة زين كاش (ZainCash API & Webhook):{' '}
                      <strong>
                        {gatewayHealth.zainCashConfigured
                          ? 'مفعّلة'
                          : 'مهيأة على الخادم — بانتظار مفاتيح التاجر'}
                      </strong>
                    </li>
                    <li>
                      • البريد الإلكتروني للإشعارات (SMTP):{' '}
                      <strong>
                        {gatewayHealth.emailProviderConfigured
                          ? 'مفعّل'
                          : 'مهيأ — يعمل حالياً داخل التطبيق'}
                      </strong>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Weekly Statements Table */}
              <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-[#0B172A]">
                  الكشوفات الأسبوعية لمقدمي الخدمات ({statements.length})
                </h2>

                {statements.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">
                    تنشأ الكشوفات الأسبوعية تلقائياً عند إتمام مقدمي الخدمة
                    للأعمال.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs sm:text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 text-xs">
                          <th className="py-2.5 px-2">مقدم الخدمة</th>
                          <th className="py-2.5 px-2">الأسبوع</th>
                          <th className="py-2.5 px-2">الأعمال</th>
                          <th className="py-2.5 px-2">العمولة المستحقة</th>
                          <th className="py-2.5 px-2">الحالة</th>
                          <th className="py-2.5 px-2">الإجراء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {statements.map((st) => (
                          <tr key={st.id}>
                            <td className="py-3 px-2 font-semibold text-[#0B172A]">
                              {st.providerName}
                            </td>
                            <td className="py-3 px-2 font-mono-tabular">
                              {st.weekKey}
                            </td>
                            <td className="py-3 px-2 tabular-nums">
                              {st.totalJobs}
                            </td>
                            <td className="py-3 px-2 font-mono-tabular font-bold text-[#0B172A]">
                              {formatIQD(st.totalCommissionAmount)}
                            </td>
                            <td className="py-3 px-2 text-xs font-semibold">
                              {st.status === 'paid' ? (
                                <span className="text-emerald-700">
                                  مدفوع ({st.transactionReference})
                                </span>
                              ) : st.status === 'overdue' ? (
                                <span className="text-rose-700">
                                  متأخر السداد
                                </span>
                              ) : (
                                <span className="text-amber-700">
                                  مستحق للتسوية
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-2">
                              <div className="flex flex-wrap gap-1.5">
                                {st.status !== 'paid' && (
                                  <button
                                    type="button"
                                    onClick={() => setPayingStatement(st)}
                                    className="px-3 py-1 rounded bg-emerald-600 text-white text-xs font-semibold"
                                  >
                                    تأكيد السداد يدوياً
                                  </button>
                                )}
                                {st.status === 'open' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void adminMarkStatementOverdue(st).then(
                                        () => notify('تم تعليم الكشف كمتأخر.')
                                      )
                                    }
                                    className="px-2.5 py-1 rounded border border-rose-200 text-rose-700 text-xs"
                                  >
                                    تعليم كمتأخر
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Payments & Refund Tracking */}
              <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-[#0B172A]">
                  سجل المدفوعات والمرتجعات ({payments.length})
                </h2>
                {payments.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4 text-center">
                    لا توجد عمليات دفع مسجلة حتى الآن.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {payments.map((pay) => (
                      <div
                        key={pay.id}
                        className="py-3 flex flex-wrap items-center justify-between gap-3 text-sm"
                      >
                        <div>
                          <p className="font-semibold text-[#0B172A]">
                            {pay.providerName} · {formatIQD(pay.amount)}
                          </p>
                          <p className="text-xs text-slate-500">
                            المرجع: {pay.paymentReference} · الطريقة:{' '}
                            {pay.gateway} · الحالة: {pay.status}
                            {pay.refundReason
                              ? ` · سبب الاسترجاع: ${pay.refundReason}`
                              : ''}
                          </p>
                        </div>
                        {pay.status === 'confirmed' && (
                          <button
                            type="button"
                            onClick={() => setRefundingPayment(pay)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-xs"
                          >
                            <RefreshCcw className="w-3.5 h-3.5" />
                            <span>تسجيل استرجاع</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 5: CATEGORIES */}
          {activeTab === 'categories' && (
            <div className="space-y-6">
              <form
                onSubmit={handleCreateCategory}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
              >
                <h2 className="font-display text-lg font-bold text-[#0B172A]">
                  إضافة تصنيف خدمة جديد
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="اسم التصنيف بالعربية"
                    className="h-10 px-3 rounded-lg border border-slate-200 text-sm"
                  />
                  <select
                    value={newCatIcon}
                    onChange={(e) =>
                      setNewCatIcon(e.target.value as CategoryIconName)
                    }
                    className="h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
                  >
                    <option value="wrench">صيانة عامة</option>
                    <option value="zap">كهرباء</option>
                    <option value="droplets">سباكة</option>
                    <option value="wind">تكييف</option>
                    <option value="hammer">نجارة</option>
                    <option value="sparkles">تنظيف</option>
                    <option value="paintbrush">صبغ</option>
                    <option value="tv">أجهزة</option>
                  </select>
                  <button
                    type="submit"
                    className="h-10 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0B172A] text-white text-xs font-semibold"
                  >
                    <Plus className="w-4 h-4" />
                    <span>حفظ التصنيف</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  placeholder="وصف مختصر للتصنيف..."
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                />
              </form>

              <div className="bg-white border border-slate-200 rounded-xl p-6 divide-y divide-slate-100">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="py-3 flex items-center justify-between gap-4"
                  >
                    <div>
                      <p className="font-semibold text-sm text-[#0B172A]">
                        {cat.nameAr}
                      </p>
                      <p className="text-xs text-slate-500">
                        {cat.descriptionAr}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void adminAddOrToggleCategory({
                          ...cat,
                          isActive: !cat.isActive,
                        })
                      }
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${
                        cat.isActive
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-slate-100 text-slate-600'
                      }`}
                    >
                      {cat.isActive ? 'مفعّل' : 'معطّل'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: REVIEWS & COMPLAINTS */}
          {activeTab === 'moderation' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-[#0B172A]">
                  مراجعة التقييمات ({reviews.length})
                </h2>
                <div className="divide-y divide-slate-100">
                  {reviews.map((rev) => (
                    <div
                      key={rev.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#0B172A]">
                          {rev.customerName} · {rev.rating}/5 · ({rev.status})
                        </p>
                        <p className="text-xs text-slate-600">{rev.comment}</p>
                      </div>
                      <div className="flex gap-1.5">
                        {rev.status !== 'approved' && (
                          <button
                            type="button"
                            onClick={() =>
                              void adminUpdateReviewStatus(rev.id, 'approved')
                            }
                            className="px-3 py-1 rounded bg-emerald-600 text-white text-xs"
                          >
                            اعتماد
                          </button>
                        )}
                        {rev.status !== 'rejected' && (
                          <button
                            type="button"
                            onClick={() =>
                              void adminUpdateReviewStatus(rev.id, 'rejected')
                            }
                            className="px-3 py-1 rounded border border-rose-200 text-rose-700 text-xs"
                          >
                            رفض
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-[#0B172A]">
                  الشكاوى والبلاغات ({complaints.length})
                </h2>
                <div className="divide-y divide-slate-100">
                  {complaints.map((cmp) => (
                    <div
                      key={cmp.id}
                      className="py-3 flex flex-wrap items-start justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#0B172A]">
                          {cmp.reason} ({cmp.status})
                        </p>
                        <p className="text-xs text-slate-600">{cmp.details}</p>
                        <p className="text-xs text-slate-400">
                          {cmp.reporterName} · {cmp.reporterPhone}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        {cmp.status !== 'resolved' && (
                          <button
                            type="button"
                            onClick={() =>
                              void adminResolveComplaint(
                                cmp.id,
                                'resolved',
                                'تمت المعالجة من قِبل الإدارة'
                              )
                            }
                            className="px-3 py-1 rounded bg-[#0B172A] text-white text-xs"
                          >
                            إغلاق كمُعالج
                          </button>
                        )}
                        {cmp.providerId !== 'platform_support' && (
                          <button
                            type="button"
                            onClick={() => onViewPublicProfile(cmp.providerId)}
                            className="px-3 py-1 rounded border border-slate-200 text-xs"
                          >
                            معاينة الحساب
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: NOTIFICATIONS CENTER */}
          {activeTab === 'notifications' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="font-display text-lg font-bold text-[#0B172A]">
                مركز إشعارات الإدارة
              </h2>
              {notifications.filter((n) => n.recipientRole === 'admin')
                .length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">
                  لا توجد إشعارات حالياً.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {notifications
                    .filter((n) => n.recipientRole === 'admin')
                    .map((n) => (
                      <div
                        key={n.id}
                        className="py-3.5 flex items-start justify-between gap-4"
                      >
                        <div>
                          <p className="text-sm font-semibold text-[#0B172A]">
                            {n.titleAr}
                          </p>
                          <p className="text-xs text-slate-600 mt-0.5">
                            {n.messageAr}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            {formatArabicDate(n.createdAt)} · البريد الإلكتروني:{' '}
                            {n.emailQueued ? 'في قائمة الانتظار' : '—'}
                          </p>
                        </div>
                        {!n.isRead && (
                          <button
                            type="button"
                            onClick={() => void markNotificationRead(n.id)}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg border border-slate-200 text-xs"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>مقروء</span>
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Inspect Documents Modal */}
      {inspectProvider && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#0B172A]/60 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-display text-lg font-bold text-[#0B172A]">
                الوثائق الخاصة: {inspectProvider.fullName}
              </h3>
              <button
                type="button"
                onClick={() => setInspectProvider(null)}
                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              {inspectProvider.description}
            </p>
            {inspectedDocs.length === 0 ? (
              <p className="text-xs text-amber-700">
                لا توجد وثائق مرفقة لهذا الحساب.
              </p>
            ) : (
              <ul className="space-y-2 text-xs">
                {inspectedDocs.map((d) => (
                  <li
                    key={d.id}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex justify-between"
                  >
                    <span>
                      {d.label}: <strong>{d.fileName}</strong>
                    </span>
                    <span>{formatArabicDate(d.uploadedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Assign Provider Modal */}
      {assigningRequest && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#0B172A]/60 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleAssignSubmit}
            className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-display text-lg font-bold text-[#0B172A]">
                تعيين فني للطلب
              </h3>
              <button
                type="button"
                onClick={() => setAssigningRequest(null)}
                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              الطلب: {assigningRequest.categoryName} في{' '}
              {assigningRequest.neighborhood}
            </p>
            <select
              value={selectedProviderId}
              onChange={(e) => setSelectedProviderId(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm bg-white"
            >
              {approvedProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} — {p.neighborhood} (
                  {p.verificationStatus === 'verified' ? 'موثّق' : 'غير موثّق'})
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssigningRequest(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-[#0B172A] text-white text-xs font-semibold"
              >
                تأكيد التعيين
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Manual Payment Confirmation Modal */}
      {payingStatement && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#0B172A]/60 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleConfirmManualPayment}
            className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-display text-lg font-bold text-[#0B172A]">
                تأكيد استلام عمولة الأسبوع
              </h3>
              <button
                type="button"
                onClick={() => setPayingStatement(null)}
                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              الفني: <strong>{payingStatement.providerName}</strong> · المبلغ:{' '}
              <strong className="font-mono-tabular">
                {formatIQD(payingStatement.totalCommissionAmount)}
              </strong>
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                طريقة الدفع المؤكدة
              </label>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as PaymentGateway)
                }
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
              >
                <option value="manual_cash">استلام نقدي مباشر (مكتب أربيل)</option>
                <option value="manual_transfer">تحويل محفظة / مصرفي يدوي</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                رقم المرجع / وصل الاستلام
              </label>
              <input
                type="text"
                required
                value={txReference}
                onChange={(e) => setTxReference(e.target.value)}
                placeholder="مثال: REC-2026-4091"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono-tabular"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayingStatement(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
              >
                تأكيد السداد
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Refund Modal */}
      {refundingPayment && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#0B172A]/60 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleRefundSubmit}
            className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-bold text-[#0B172A]">
              تسجيل استرجاع دفعة
            </h3>
            <input
              type="text"
              required
              minLength={4}
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="سبب الاسترجاع..."
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRefundingPayment(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-rose-700 text-white text-xs font-semibold"
              >
                تأكيد الاسترجاع
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
