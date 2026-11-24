import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import {
  Bell,
  Briefcase,
  CheckCircle2,
  FileText,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getNeighborhoodsByCity, IRAQ_LOCATIONS } from '../data/locations';
import {
  markNotificationRead,
  providerCompleteJobAndRecordCommission,
  providerRespondToAssignment,
  registerOrUpdateProviderProfile,
  subscribeProviderWorkspace,
} from '../firebase/marketplaceApi';
import {
  AppPage,
  CommissionRecord,
  NotificationItem,
  PaymentRecord,
  PlatformSettings,
  ServiceCategory,
  ServiceProvider,
  ServiceRequest,
  VerificationDocument,
  WeeklyStatement,
} from '../types/marketplace';
import {
  formatArabicDate,
  formatIQD,
  isValidIraqiPhone,
  REQUEST_STATUS_META,
} from '../utils/format';

type ProviderTab = 'jobs' | 'financials' | 'profile' | 'notifications';

interface ProviderDashboardPageProps {
  categories: ServiceCategory[];
  settings: PlatformSettings;
  onNavigate: (page: AppPage) => void;
}

export function ProviderDashboardPage({
  categories,
  settings,
  onNavigate,
}: ProviderDashboardPageProps) {
  const { firebaseUser, userProfile, signOutUser } = useAuth();
  const [activeTab, setActiveTab] = useState<ProviderTab>('jobs');

  const [providerProfile, setProviderProfile] =
    useState<ServiceProvider | null>(null);
  const [jobs, setJobs] = useState<ServiceRequest[]>([]);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [statements, setStatements] = useState<WeeklyStatement[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Complete job modal/inline state
  const [completingJobId, setCompletingJobId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  // Profile edit state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [city, setCity] = useState('أربيل');
  const [neighborhood, setNeighborhood] = useState('عنكاوا');
  const [yearsExperience, setYearsExperience] = useState('1');
  const [description, setDescription] = useState('');
  const [documents, setDocuments] = useState<VerificationDocument[]>([]);

  useEffect(() => {
    if (!firebaseUser) return;
    return subscribeProviderWorkspace(firebaseUser.uid, {
      onProfile: (p) => {
        setProviderProfile(p);
        if (p) {
          setFullName(p.fullName);
          setPhone(p.phone);
          setCategoryId(p.categoryId);
          setCity(p.city);
          setNeighborhood(p.neighborhood);
          setYearsExperience(String(p.yearsExperience));
          setDescription(p.description);
          setDocuments(p.documents || []);
        }
      },
      onJobs: setJobs,
      onCommissions: setCommissions,
      onStatements: setStatements,
      onPayments: setPayments,
      onNotifications: setNotifications,
    });
  }, [firebaseUser]);

  if (!firebaseUser || !userProfile) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#0B172A]">
          يرجى تسجيل الدخول للوصول إلى لوحة مقدم الخدمة
        </h1>
        <button
          type="button"
          onClick={() => onNavigate('auth')}
          className="px-6 py-2.5 rounded-lg bg-[#0B172A] text-white text-sm font-semibold"
        >
          تسجيل الدخول
        </button>
      </div>
    );
  }

  if (!providerProfile) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#0B172A]">
          لم تكمل تسجيل ملفك المهني بعد
        </h1>
        <p className="text-sm text-slate-600">
          أنشئ ملفك كمقدّم خدمة وأرفق وثائق التحقق ليتمكن المشرفون من مراجعة
          حسابك واعتماده.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('register')}
          className="px-6 py-3 rounded-lg bg-emerald-600 text-white text-sm font-semibold"
        >
          إكمال التسجيل كمقدّم خدمة
        </button>
      </div>
    );
  }

  const outstandingBalance = commissions
    .filter((c) => c.status !== 'paid')
    .reduce((sum, c) => sum + c.commissionAmount, 0);

  const activeJobs = jobs.filter((j) =>
    ['Assigned', 'In Progress'].includes(j.status)
  );
  const completedJobs = jobs.filter((j) => j.status === 'Completed');
  const unreadNotifications = notifications.filter((n) => !n.isRead).length;

  const handleAcceptOrReject = async (
    jobId: string,
    decision: 'accepted' | 'rejected'
  ) => {
    setActionError('');
    setActionMessage('');
    try {
      await providerRespondToAssignment(jobId, decision);
      setActionMessage(
        decision === 'accepted'
          ? 'تم قبول المهمة وتحويلها إلى قيد التنفيذ.'
          : 'تم رفض الإسناد وإعادة الطلب للمشرف.'
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'تعذّر تحديث الحالة.');
    }
  };

  const handleCompleteJob = async (job: ServiceRequest) => {
    setActionError('');
    setActionMessage('');
    const agreedPrice = Number(priceInput);
    if (!Number.isFinite(agreedPrice) || agreedPrice <= 0) {
      setActionError('يرجى إدخال السعر المتفق عليه بالدينار العراقي.');
      return;
    }

    try {
      const result = await providerCompleteJobAndRecordCommission({
        request: job,
        providerName: providerProfile.fullName,
        agreedPrice,
        commissionRatePercent: settings.commissionRatePercent,
      });
      setCompletingJobId(null);
      setPriceInput('');
      setActionMessage(
        `تم إتمام العمل! عمولة المنصة (${result.commission.commissionRatePercent}%): ${formatIQD(result.commission.commissionAmount)} · الصافي لك: ${formatIQD(result.commission.providerNetAmount)}.`
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'تعذّر إتمام العمل واحتساب العمولة.'
      );
    }
  };

  const handleDocUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.slice(0, 3).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setDocuments((prev) => [
          ...prev,
          {
            id: `doc-${Date.now()}`,
            label: 'وثيقة تحقق محدثة',
            fileName: file.name,
            uploadedAt: new Date().toISOString(),
            previewDataUrl:
              file.type.startsWith('image/') && typeof reader.result === 'string'
                ? reader.result
                : undefined,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleProfileSave = async (e: FormEvent) => {
    e.preventDefault();
    setActionError('');
    setActionMessage('');

    if (fullName.trim().length < 3 || !isValidIraqiPhone(phone)) {
      setActionError('تأكد من صحة الاسم ورقم الهاتف العراقي.');
      return;
    }

    try {
      await registerOrUpdateProviderProfile({
        uid: firebaseUser.uid,
        fullName,
        phone,
        categoryId,
        city,
        neighborhood,
        serviceAreas: Array.from(
          new Set([neighborhood, ...(providerProfile.serviceAreas || [])])
        ),
        yearsExperience: Number(yearsExperience) || 0,
        description,
        profileImage: providerProfile.profileImage || '',
        documents,
        isNew: false,
      });
      setActionMessage('تم حفظ تعديلات ملفك المهني ووثائقك بنجاح.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'تعذّر الحفظ.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Status Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs mb-1.5">
            <span className="font-medium text-slate-500">لوحة مقدم الخدمة</span>
            <span aria-hidden="true">·</span>
            {providerProfile.approvalStatus === 'approved' ? (
              <span className="text-emerald-700 font-semibold">حساب معتمد</span>
            ) : providerProfile.approvalStatus === 'pending' ? (
              <span className="text-amber-700 font-semibold">
                طلبك بانتظار موافقة الإدارة
              </span>
            ) : (
              <span className="text-rose-700 font-semibold">
                الحساب معلّق أو مرفوض
              </span>
            )}
            <span aria-hidden="true">·</span>
            {providerProfile.verificationStatus === 'verified' ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                <span>موثّق يدوياً</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-slate-600">
                <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
                <span>غير موثّق بعد</span>
              </span>
            )}
          </div>
          <h1 className="font-display text-2xl font-extrabold text-[#0B172A]">
            {providerProfile.fullName}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="text-left">
            <p className="text-xs text-slate-500">الرصيد المستحق للمنصة</p>
            <p className="font-mono-tabular text-lg font-bold text-[#0B172A]">
              {formatIQD(outstandingBalance)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void signOutUser().then(() => onNavigate('home'))}
            className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{actionMessage}</span>
        </div>
      )}
      {actionError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          {actionError}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {(
          [
            { id: 'jobs', label: `الأعمال (${jobs.length})`, icon: Briefcase },
            {
              id: 'financials',
              label: 'العمولات والكشوفات الأسبوعية',
              icon: Receipt,
            },
            { id: 'profile', label: 'ملفي ووثائق التوثيق', icon: UserCog },
            {
              id: 'notifications',
              label: `الإشعارات (${unreadNotifications})`,
              icon: Bell,
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#0B172A] text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: JOBS */}
      {activeTab === 'jobs' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0B172A]">
              الأعمال المسندة والجارية ({activeJobs.length})
            </h2>
            {activeJobs.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                لا توجد مهام مسندة إليك حالياً.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {activeJobs.map((job) => (
                  <div key={job.id} className="py-4 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <strong className="text-sm text-[#0B172A]">
                        {job.categoryName}
                      </strong>
                      <span className={REQUEST_STATUS_META[job.status].tone}>
                        {REQUEST_STATUS_META[job.status].labelAr}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">
                      {job.problemDescription}
                    </p>
                    <p className="text-xs text-slate-500">
                      العميل: {job.customerName} · الهاتف: {job.customerPhone} ·{' '}
                      {job.city} — {job.neighborhood} · الموعد:{' '}
                      {job.preferredTime}
                    </p>

                    {job.status === 'Assigned' && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            void handleAcceptOrReject(job.id, 'accepted')
                          }
                          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                        >
                          قبول وبدء التنفيذ
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleAcceptOrReject(job.id, 'rejected')
                          }
                          className="px-4 py-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-medium"
                        >
                          رفض الإسناد
                        </button>
                      </div>
                    )}

                    {job.status === 'In Progress' && (
                      <div className="pt-2">
                        {completingJobId === job.id ? (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                            <label className="block text-xs font-semibold text-[#0B172A]">
                              المبلغ المتفق عليه مع العميل (بالدينار العراقي)
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="1000"
                                step="500"
                                value={priceInput}
                                onChange={(e) => setPriceInput(e.target.value)}
                                placeholder="مثال: 50000"
                                className="flex-1 h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono-tabular bg-white"
                              />
                              <button
                                type="button"
                                onClick={() => void handleCompleteJob(job)}
                                className="px-4 h-10 rounded-lg bg-[#0B172A] text-white text-xs font-semibold"
                              >
                                تأكيد الإتمام
                              </button>
                              <button
                                type="button"
                                onClick={() => setCompletingJobId(null)}
                                className="px-3 h-10 rounded-lg border border-slate-200 text-xs"
                              >
                                إلغاء
                              </button>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              يتم احتساب عمولة المنصة ({settings.commissionRatePercent}%)
                              على الخادم فور التأكيد وإضافتها لكشف الأسبوع.
                            </p>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setCompletingJobId(job.id);
                              setPriceInput(
                                job.agreedPrice ? String(job.agreedPrice) : ''
                              );
                            }}
                            className="px-4 py-2 rounded-lg bg-[#0B172A] hover:bg-[#13233E] text-white text-xs font-semibold"
                          >
                            إتمام العمل وتسجيل المبلغ
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0B172A]">
              الأعمال المكتملة ({completedJobs.length})
            </h2>
            {completedJobs.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                ستظهر الأعمال المنجزة هنا مع قيمتها المالية.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {completedJobs.map((job) => (
                  <div key={job.id} className="py-3.5 space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <strong className="text-[#0B172A]">
                        {job.categoryName} — {job.neighborhood}
                      </strong>
                      <span className="font-mono-tabular font-bold text-emerald-700">
                        {formatIQD(job.agreedPrice ?? 0)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      العميل: {job.customerName} · {formatArabicDate(job.updatedAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: COMMISSIONS & STATEMENTS */}
      {activeTab === 'financials' && (
        <div className="space-y-6">
          {/* Weekly Statements */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold text-[#0B172A]">
                كشوفات العمولات الأسبوعية
              </h2>
              <span className="text-xs text-slate-500">
                نسبة المنصة الحالية: {settings.commissionRatePercent}%
              </span>
            </div>

            {statements.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                لا توجد كشوفات أسبوعية بعد.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs sm:text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-xs">
                      <th className="py-2.5 px-2">الأسبوع</th>
                      <th className="py-2.5 px-2">الأعمال</th>
                      <th className="py-2.5 px-2">إجمالي الدخل</th>
                      <th className="py-2.5 px-2">عمولة خدمتي</th>
                      <th className="py-2.5 px-2">الصافي لك</th>
                      <th className="py-2.5 px-2">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {statements.map((st) => (
                      <tr key={st.id}>
                        <td className="py-3 px-2 font-mono-tabular">
                          {st.weekKey}
                        </td>
                        <td className="py-3 px-2 tabular-nums">
                          {st.totalJobs}
                        </td>
                        <td className="py-3 px-2 font-mono-tabular">
                          {formatIQD(st.totalGrossAmount)}
                        </td>
                        <td className="py-3 px-2 font-mono-tabular text-amber-800 font-semibold">
                          {formatIQD(st.totalCommissionAmount)}
                        </td>
                        <td className="py-3 px-2 font-mono-tabular text-emerald-700 font-semibold">
                          {formatIQD(st.totalNetAmount)}
                        </td>
                        <td className="py-3 px-2 text-xs font-semibold">
                          {st.status === 'paid'
                            ? `مدفوع (${st.transactionReference || 'مؤكد'})`
                            : st.status === 'overdue'
                            ? 'متأخر السداد'
                            : 'مستحق / مفتوح'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Payment History */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0B172A]">
              سجل المدفوعات المؤكدة
            </h2>
            {payments.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">
                لا توجد دفعات مسجلة حتى الآن. يتم تأكيد التسوية يدوياً من قِبل
                إدارة خدمتي.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {payments.map((pay) => (
                  <div
                    key={pay.id}
                    className="py-3 flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-[#0B172A]">
                        مرجع: {pay.paymentReference} ·{' '}
                        {pay.gateway === 'manual_transfer'
                          ? 'تحويل يدوي'
                          : 'دفع نقدي'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatArabicDate(pay.createdAt)} · الحالة: {pay.status}
                      </p>
                    </div>
                    <span className="font-mono-tabular font-bold text-emerald-700">
                      {formatIQD(pay.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: EDIT PROFILE & DOCUMENTS */}
      {activeTab === 'profile' && (
        <form
          onSubmit={handleProfileSave}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 max-w-3xl"
        >
          <h2 className="font-display text-lg font-bold text-[#0B172A]">
            تحديث الملف المهني ووثائق التوثيق
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                الاسم الكامل
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                رقم الهاتف
              </label>
              <input
                type="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-left font-mono-tabular"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                التخصص
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameAr}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                سنوات الخبرة
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={yearsExperience}
                onChange={(e) => setYearsExperience(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                المدينة
              </label>
              <select
                value={city}
                onChange={(e) => {
                  const next = e.target.value;
                  setCity(next);
                  setNeighborhood(getNeighborhoodsByCity(next)[0] ?? '');
                }}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white"
              >
                {IRAQ_LOCATIONS.map((loc) => (
                  <option key={loc.city} value={loc.city}>
                    {loc.city}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                الحي الرئيسي
              </label>
              <select
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white"
              >
                {getNeighborhoodsByCity(city).map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              وصف الخدمات
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>

          <div className="border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50">
            <p className="text-xs font-semibold text-[#0B172A] mb-2">
              وثائق التحقق الخاصة (لا تظهر للعملاء — للإدارة فقط)
            </p>
            <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold cursor-pointer">
              <FileText className="w-4 h-4" aria-hidden="true" />
              <span>رفع وثيقة جديدة</span>
              <input
                type="file"
                accept="image/*,.pdf"
                multiple
                onChange={handleDocUpload}
                className="sr-only"
              />
            </label>
            {documents.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-emerald-700">
                {documents.map((d) => (
                  <li key={d.id}>✓ {d.fileName}</li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="submit"
            className="px-6 py-2.5 rounded-lg bg-[#0B172A] hover:bg-[#13233E] text-white text-sm font-semibold"
          >
            حفظ التعديلات
          </button>
        </form>
      )}

      {/* TAB 4: NOTIFICATIONS */}
      {activeTab === 'notifications' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h2 className="font-display text-lg font-bold text-[#0B172A]">
            إشعاراتي
          </h2>
          {notifications.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              لا توجد إشعارات حالياً.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((n) => (
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
                      {formatArabicDate(n.createdAt)}
                    </p>
                  </div>
                  {!n.isRead && (
                    <button
                      type="button"
                      onClick={() => void markNotificationRead(n.id)}
                      className="px-3 py-1 rounded-lg border border-slate-200 text-xs font-medium hover:bg-slate-50 shrink-0"
                    >
                      تحديد كمقروء
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
