import { FormEvent, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileWarning,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import {
  adminReviewDeletionRequest,
  adminSaveCustomerMeta,
  adminUpdateUserSuspension,
} from '../firebase/marketplaceApi';
import {
  AccountDeletionRequest,
  AppUser,
  CustomerAdminMeta,
  CustomerReview,
  ProviderReport,
  ServiceRequest,
} from '../types/marketplace';
import {
  formatArabicDate,
  formatIQD,
  formatPhoneDisplay,
  normalizeIraqiPhone,
  REQUEST_STATUS_META,
} from '../utils/format';

interface AdminCustomerManagementProps {
  adminUid: string;
  users: AppUser[];
  requests: ServiceRequest[];
  reviews: CustomerReview[];
  complaints: ProviderReport[];
  customerMeta: CustomerAdminMeta[];
  deletionRequests: AccountDeletionRequest[];
  onNotify: (msg: string) => void;
  onFail: (err: unknown) => void;
}

interface CustomerRiskSummary {
  isSuspicious: boolean;
  reasons: string[];
}

export function AdminCustomerManagement({
  adminUid,
  users,
  requests,
  reviews,
  complaints,
  customerMeta,
  deletionRequests,
  onNotify,
  onFail,
}: AdminCustomerManagementProps) {
  const [subTab, setSubTab] = useState<'directory' | 'deletions'>('directory');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'suspended' | 'suspicious' | 'phone_verified'
  >('all');
  const [dateFilter, setDateFilter] = useState<'all' | '7d' | '30d' | 'older'>(
    'all'
  );

  // Full customer profile modal state
  const [selectedCustomer, setSelectedCustomer] = useState<AppUser | null>(
    null
  );
  const [noteInput, setNoteInput] = useState('');
  const [flagInput, setFlagInput] = useState(false);
  const [flagReasonInput, setFlagReasonInput] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [togglingSuspend, setTogglingSuspend] = useState<string | null>(null);

  // Deletion request review modal state
  const [reviewingDeletion, setReviewingDeletion] =
    useState<AccountDeletionRequest | null>(null);
  const [deletionAdminNote, setDeletionAdminNote] = useState('');
  const [suspendOnApprove, setSuspendOnApprove] = useState(true);
  const [savingDeletionDecision, setSavingDeletionDecision] = useState(false);

  const customers = useMemo(
    () =>
      users
        .filter((u) => u.role === 'customer')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [users]
  );

  const metaByUid = useMemo(() => {
    const map = new Map<string, CustomerAdminMeta>();
    customerMeta.forEach((m) => map.set(m.uid, m));
    return map;
  }, [customerMeta]);

  const phoneCounts = useMemo(() => {
    const map = new Map<string, number>();
    customers.forEach((c) => {
      if (!c.phone) return;
      const norm = normalizeIraqiPhone(c.phone);
      if (norm.length >= 10) {
        map.set(norm, (map.get(norm) || 0) + 1);
      }
    });
    return map;
  }, [customers]);

  const nameNeighborhoodCounts = useMemo(() => {
    const map = new Map<string, number>();
    customers.forEach((c) => {
      const key = `${c.displayName.trim().toLowerCase()}|${(
        c.neighborhood || ''
      ).trim()}`;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [customers]);

  const riskByUid = useMemo(() => {
    const map = new Map<string, CustomerRiskSummary>();
    customers.forEach((c) => {
      const reasons: string[] = [];
      const meta = metaByUid.get(c.uid);

      if (c.phone) {
        const norm = normalizeIraqiPhone(c.phone);
        if ((phoneCounts.get(norm) || 0) > 1) {
          reasons.push('رقم هاتف مكرر في أكثر من حساب عميل');
        }
      }

      const nameKey = `${c.displayName.trim().toLowerCase()}|${(
        c.neighborhood || ''
      ).trim()}`;
      if ((nameNeighborhoodCounts.get(nameKey) || 0) > 1) {
        reasons.push('تشابه الاسم والحي السكني مع حساب آخر');
      }

      const custReqs = requests.filter((r) => r.customerId === c.uid);
      const problemOrders = custReqs.filter(
        (r) => r.status === 'Cancelled' || r.status === 'Disputed'
      ).length;
      if (problemOrders >= 2) {
        reasons.push(`كثرة الإلغاءات أو النزاعات (${problemOrders})`);
      }

      if (meta?.flaggedSuspicious) {
        reasons.push(
          meta.flagReason
            ? `تنبيه إداري: ${meta.flagReason}`
            : 'موسوم يدوياً كمشتبه به من الإدارة'
        );
      }

      map.set(c.uid, {
        isSuspicious: reasons.length > 0,
        reasons,
      });
    });
    return map;
  }, [customers, metaByUid, phoneCounts, nameNeighborhoodCounts, requests]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const nowMs = Date.now();
    const dayMs = 86400000;

    return customers.filter((c) => {
      const risk = riskByUid.get(c.uid);

      if (statusFilter === 'active' && c.isSuspended) return false;
      if (statusFilter === 'suspended' && !c.isSuspended) return false;
      if (statusFilter === 'suspicious' && !risk?.isSuspicious) return false;
      if (statusFilter === 'phone_verified' && !c.phoneVerified) return false;

      if (dateFilter !== 'all') {
        const createdMs = new Date(c.createdAt).getTime();
        const ageDays = (nowMs - createdMs) / dayMs;
        if (dateFilter === '7d' && ageDays > 7) return false;
        if (dateFilter === '30d' && ageDays > 30) return false;
        if (dateFilter === 'older' && ageDays <= 30) return false;
      }

      if (!q) return true;
      return (
        c.displayName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        normalizeIraqiPhone(c.phone || '').includes(q) ||
        c.uid.toLowerCase().includes(q)
      );
    });
  }, [customers, riskByUid, statusFilter, dateFilter, searchQuery]);

  const suspendedCount = customers.filter((c) => c.isSuspended).length;
  const phoneVerifiedCount = customers.filter((c) => c.phoneVerified).length;
  const suspiciousCount = customers.filter(
    (c) => riskByUid.get(c.uid)?.isSuspicious
  ).length;
  const pendingDeletions = deletionRequests.filter(
    (d) => d.status === 'pending'
  );

  const openCustomerInspector = (cust: AppUser) => {
    const meta = metaByUid.get(cust.uid);
    setSelectedCustomer(cust);
    setNoteInput(meta?.adminNotes ?? '');
    setFlagInput(Boolean(meta?.flaggedSuspicious));
    setFlagReasonInput(meta?.flagReason ?? '');
  };

  const handleToggleSuspend = async (cust: AppUser) => {
    setTogglingSuspend(cust.uid);
    try {
      const next = !cust.isSuspended;
      await adminUpdateUserSuspension(cust.uid, next);
      if (selectedCustomer?.uid === cust.uid) {
        setSelectedCustomer({ ...cust, isSuspended: next });
      }
      onNotify(
        next
          ? `تم تعليق حساب العميل ${cust.displayName}.`
          : `تم إعادة تفعيل حساب العميل ${cust.displayName}.`
      );
    } catch (err) {
      onFail(err);
    } finally {
      setTogglingSuspend(null);
    }
  };

  const handleSaveMeta = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    setSavingMeta(true);
    try {
      await adminSaveCustomerMeta({
        uid: selectedCustomer.uid,
        adminNotes: noteInput,
        flaggedSuspicious: flagInput,
        flagReason: flagReasonInput,
        adminUid,
      });
      onNotify(
        `تم حفظ الملاحظات الإدارية الداخلية لحساب ${selectedCustomer.displayName}.`
      );
    } catch (err) {
      onFail(err);
    } finally {
      setSavingMeta(false);
    }
  };

  const handleDeletionDecision = async (decision: 'approved' | 'rejected') => {
    if (!reviewingDeletion) return;
    setSavingDeletionDecision(true);
    try {
      await adminReviewDeletionRequest({
        request: reviewingDeletion,
        decision,
        adminNote:
          deletionAdminNote ||
          (decision === 'approved'
            ? 'تمت مراجعة الطلب والموافقة عليه.'
            : 'تم رفض طلب الحذف بناءً على مراجعة الحساب.'),
        adminUid,
        suspendUser: decision === 'approved' ? suspendOnApprove : false,
      });
      setReviewingDeletion(null);
      setDeletionAdminNote('');
      onNotify(
        decision === 'approved'
          ? 'تم اعتماد طلب حذف الحساب وتحديث الحالة.'
          : 'تم رفض طلب حذف الحساب وتسجيل الملاحظة.'
      );
    } catch (err) {
      onFail(err);
    } finally {
      setSavingDeletionDecision(false);
    }
  };

  const inspectedRequests = selectedCustomer
    ? requests.filter((r) => r.customerId === selectedCustomer.uid)
    : [];
  const inspectedComplaints = selectedCustomer
    ? complaints.filter((c) => c.reporterUid === selectedCustomer.uid)
    : [];
  const inspectedReviews = selectedCustomer
    ? reviews.filter((r) => r.customerId === selectedCustomer.uid)
    : [];

  return (
    <div className="space-y-6">
      {/* KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">إجمالي العملاء</p>
          <p className="font-mono-tabular text-2xl font-bold text-[#0B172A]">
            {customers.length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">هواتف موثّقة (SMS)</p>
          <p className="font-mono-tabular text-2xl font-bold text-emerald-700">
            {phoneVerifiedCount}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">حسابات معلّقة</p>
          <p className="font-mono-tabular text-2xl font-bold text-rose-700">
            {suspendedCount}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">
            تنبيهات اشتباه / طلبات حذف
          </p>
          <p className="font-mono-tabular text-2xl font-bold text-amber-700">
            {suspiciousCount} / {pendingDeletions.length}
          </p>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setSubTab('directory')}
          className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            subTab === 'directory'
              ? 'bg-white text-[#0B172A] shadow-sm'
              : 'text-slate-600 hover:text-[#0B172A]'
          }`}
        >
          دليل العملاء والفحص ({customers.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('deletions')}
          className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            subTab === 'deletions'
              ? 'bg-white text-[#0B172A] shadow-sm'
              : 'text-slate-600 hover:text-[#0B172A]'
          }`}
        >
          طلبات حذف الحسابات ({pendingDeletions.length} معلّق)
        </button>
      </div>

      {/* DIRECTORY SUB-TAB */}
      {subTab === 'directory' && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-display text-lg font-bold text-[#0B172A]">
                إدارة حسابات العملاء
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                البحث والتصفية، كشف الحسابات المكررة والمشبوهة، وتدوين ملاحظات
                الإدارة السرية.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search
                  className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث بالاسم أو البريد أو الهاتف..."
                  className="h-9 pr-9 pl-3 rounded-lg border border-slate-200 text-xs w-60 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as typeof statusFilter)
                }
                aria-label="تصفية حسب الحالة"
                className="h-9 px-3 rounded-lg border border-slate-200 text-xs bg-white"
              >
                <option value="all">كل الحالات</option>
                <option value="active">نشط</option>
                <option value="suspended">معلّق</option>
                <option value="suspicious">مشبوه / مكرر</option>
                <option value="phone_verified">هاتف موثّق عبر SMS</option>
              </select>

              <select
                value={dateFilter}
                onChange={(e) =>
                  setDateFilter(e.target.value as typeof dateFilter)
                }
                aria-label="تصفية حسب تاريخ التسجيل"
                className="h-9 px-3 rounded-lg border border-slate-200 text-xs bg-white"
              >
                <option value="all">كل التواريخ</option>
                <option value="7d">آخر 7 أيام</option>
                <option value="30d">آخر 30 يوماً</option>
                <option value="older">أقدم من 30 يوماً</option>
              </select>
            </div>
          </div>

          {filteredCustomers.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              لا توجد حسابات عملاء تطابق معايير البحث الحالية.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs">
                    <th className="py-2.5 px-2 whitespace-nowrap">العميل</th>
                    <th className="py-2.5 px-2 whitespace-nowrap">الهاتف والتوثيق</th>
                    <th className="py-2.5 px-2 whitespace-nowrap">التسجيل وآخر دخول</th>
                    <th className="py-2.5 px-2 whitespace-nowrap">النشاط</th>
                    <th className="py-2.5 px-2 whitespace-nowrap">الحالة والتنبيهات</th>
                    <th className="py-2.5 px-2 whitespace-nowrap">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustomers.map((cust) => {
                    const custReqs = requests.filter(
                      (r) => r.customerId === cust.uid
                    );
                    const risk = riskByUid.get(cust.uid);
                    const meta = metaByUid.get(cust.uid);

                    return (
                      <tr
                        key={cust.uid}
                        className="hover:bg-slate-50/70 transition-colors align-top"
                      >
                        <td className="py-3 px-2">
                          <p className="font-semibold text-[#0B172A]">
                            {cust.displayName}
                          </p>
                          <p
                            dir="ltr"
                            className="font-mono-tabular text-xs text-slate-500 text-right"
                          >
                            {cust.email}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {cust.city || 'أربيل'} —{' '}
                            {cust.neighborhood || 'غير محدد'}
                          </p>
                        </td>

                        <td className="py-3 px-2 text-xs">
                          <p
                            dir="ltr"
                            className="font-mono-tabular text-[#0B172A] text-right"
                          >
                            {cust.phone
                              ? formatPhoneDisplay(cust.phone)
                              : '—'}
                          </p>
                          <p
                            className={`mt-0.5 font-semibold inline-flex items-center gap-1 ${
                              cust.phoneVerified
                                ? 'text-emerald-700'
                                : 'text-slate-500'
                            }`}
                          >
                            {cust.phoneVerified ? (
                              <>
                                <ShieldCheck className="w-3 h-3" />
                                <span>موثّق SMS</span>
                              </>
                            ) : (
                              <span>غير موثّق SMS</span>
                            )}
                          </p>
                        </td>

                        <td className="py-3 px-2 text-xs text-slate-600 font-mono-tabular whitespace-nowrap">
                          <p>تسجيل: {formatArabicDate(cust.createdAt)}</p>
                          <p className="text-slate-400 mt-0.5">
                            آخر دخول:{' '}
                            {cust.lastLoginAt
                              ? formatArabicDate(cust.lastLoginAt)
                              : 'غير مسجل'}
                          </p>
                        </td>

                        <td className="py-3 px-2 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                          <p>{custReqs.length} طلبات</p>
                          {meta?.adminNotes && (
                            <p className="text-[11px] text-sky-700 font-medium mt-0.5">
                              توجد ملاحظات إدارية
                            </p>
                          )}
                        </td>

                        <td className="py-3 px-2 text-xs space-y-1">
                          <p
                            className={`font-bold ${
                              cust.isSuspended
                                ? 'text-rose-700'
                                : 'text-emerald-700'
                            }`}
                          >
                            {cust.isSuspended ? 'حساب معلّق' : 'حساب نشط'}
                          </p>
                          {risk?.isSuspicious && (
                            <p className="text-amber-800 font-semibold inline-flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>{risk.reasons[0]}</span>
                            </p>
                          )}
                        </td>

                        <td className="py-3 px-2 whitespace-nowrap">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openCustomerInspector(cust)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0B172A] text-white text-xs font-semibold"
                            >
                              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>فحص الملف</span>
                            </button>
                            <button
                              type="button"
                              disabled={togglingSuspend === cust.uid}
                              onClick={() => void handleToggleSuspend(cust)}
                              className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
                                cust.isSuspended
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                  : 'border-rose-200 text-rose-700 hover:bg-rose-50'
                              }`}
                            >
                              {cust.isSuspended ? 'إعادة تفعيل' : 'تعليق'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ACCOUNT DELETION REQUESTS SUB-TAB */}
      {subTab === 'deletions' && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="font-display text-lg font-bold text-[#0B172A]">
              مراجعة طلبات حذف الحسابات ({deletionRequests.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              سجل طلبات حذف الحسابات المرسلة للمراجعة أو المنفذة ذاتياً بعد
              إعادة التحقق.
            </p>
          </div>

          {deletionRequests.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              لا توجد طلبات حذف حسابات مسجلة حتى الآن.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {deletionRequests.map((dr) => (
                <div
                  key={dr.id}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm text-[#0B172A]">
                        {dr.customerName}
                      </strong>
                      <span className="text-xs text-slate-500" dir="ltr">
                        ({dr.customerEmail})
                      </span>
                      <span
                        className={`text-xs font-bold ${
                          dr.status === 'pending'
                            ? 'text-amber-700'
                            : dr.status === 'rejected'
                            ? 'text-rose-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        ·{' '}
                        {dr.status === 'pending'
                          ? 'بانتظار المراجعة'
                          : dr.status === 'approved'
                          ? 'تمت الموافقة'
                          : dr.status === 'rejected'
                          ? 'مرفوض'
                          : 'تم الحذف نهائياً'}
                      </span>
                    </div>
                    {dr.reason && (
                      <p className="text-xs text-slate-600">
                        السبب: {dr.reason}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400 font-mono-tabular">
                      تاريخ الطلب: {formatArabicDate(dr.createdAt)}
                      {dr.adminNote ? ` · ملاحظة الإدارة: ${dr.adminNote}` : ''}
                    </p>
                  </div>

                  {dr.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => {
                        setReviewingDeletion(dr);
                        setDeletionAdminNote('');
                        setSuspendOnApprove(true);
                      }}
                      className="px-4 py-2 rounded-lg bg-[#0B172A] text-white text-xs font-semibold whitespace-nowrap shrink-0"
                    >
                      مراجعة الطلب
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* CUSTOMER FULL PROFILE INSPECTION MODAL */}
      {selectedCustomer && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#0B172A]/60 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <p className="text-xs text-emerald-700 font-semibold">
                  ملف العميل الكامل · UID:{' '}
                  <span dir="ltr" className="font-mono-tabular">
                    {selectedCustomer.uid}
                  </span>
                </p>
                <h3 className="font-display text-xl font-extrabold text-[#0B172A]">
                  {selectedCustomer.displayName}
                </h3>
                <p className="text-xs text-slate-500">
                  <span dir="ltr" className="font-mono-tabular">
                    {selectedCustomer.email}
                  </span>{' '}
                  ·{' '}
                  <span dir="ltr" className="font-mono-tabular">
                    {selectedCustomer.phone
                      ? formatPhoneDisplay(selectedCustomer.phone)
                      : 'بدون هاتف'}
                  </span>{' '}
                  · {selectedCustomer.city || 'أربيل'} —{' '}
                  {selectedCustomer.neighborhood || 'عنكاوا'}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={togglingSuspend === selectedCustomer.uid}
                  onClick={() => void handleToggleSuspend(selectedCustomer)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold ${
                    selectedCustomer.isSuspended
                      ? 'bg-emerald-600 text-white'
                      : 'bg-rose-700 text-white'
                  }`}
                >
                  {selectedCustomer.isSuspended ? (
                    <>
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>إعادة تفعيل الحساب</span>
                    </>
                  ) : (
                    <>
                      <UserX className="w-3.5 h-3.5" />
                      <span>تعليق الحساب</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  aria-label="إغلاق نافذة فحص العميل"
                  className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Risk & Account Timestamps Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div>
                <p className="text-slate-500">حالة الحساب</p>
                <p
                  className={`font-bold mt-0.5 ${
                    selectedCustomer.isSuspended
                      ? 'text-rose-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {selectedCustomer.isSuspended ? 'معلّق' : 'نشط'}
                </p>
              </div>
              <div>
                <p className="text-slate-500">توثيق الهاتف (SMS)</p>
                <p className="font-bold mt-0.5 text-[#0B172A]">
                  {selectedCustomer.phoneVerified ? 'موثّق' : 'غير موثّق'}
                </p>
              </div>
              <div>
                <p className="text-slate-500">تاريخ الإنشاء</p>
                <p className="font-mono-tabular font-semibold mt-0.5 text-[#0B172A]">
                  {formatArabicDate(selectedCustomer.createdAt)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">آخر تسجيل دخول</p>
                <p className="font-mono-tabular font-semibold mt-0.5 text-[#0B172A]">
                  {selectedCustomer.lastLoginAt
                    ? formatArabicDate(selectedCustomer.lastLoginAt)
                    : 'غير مسجل'}
                </p>
              </div>
            </div>

            {/* Automated Risk Alerts */}
            {riskByUid.get(selectedCustomer.uid)?.isSuspicious && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" />
                  <span>مؤشرات تكرار أو نشاط مشبوه مرصودة:</span>
                </p>
                <ul className="list-disc pr-5 space-y-0.5">
                  {riskByUid
                    .get(selectedCustomer.uid)
                    ?.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}

            {/* Internal Admin Notes & Suspicious Flag (Strictly Isolated from Customer) */}
            <form
              onSubmit={handleSaveMeta}
              className="border border-slate-200 rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h4 className="font-display text-sm font-bold text-[#0B172A] flex items-center gap-1.5">
                  <FileWarning className="w-4 h-4 text-emerald-700" />
                  <span>ملاحظات الإدارة الداخلية (محمية ولا يراها العميل)</span>
                </h4>
              </div>

              <textarea
                rows={3}
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="أضف ملاحظات إدارية داخلية حول هذا العميل، سلوكه، أو نتائج التحقق..."
                className="w-full p-3 rounded-lg border border-slate-200 text-xs sm:text-sm"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <label className="flex items-center gap-2 text-xs font-semibold text-[#0B172A] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={flagInput}
                    onChange={(e) => setFlagInput(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-amber-600"
                  />
                  <span>تمييز الحساب كحساب مشبوه أو مكرر</span>
                </label>

                {flagInput && (
                  <input
                    type="text"
                    value={flagReasonInput}
                    onChange={(e) => setFlagReasonInput(e.target.value)}
                    placeholder="سبب التمييز (مثال: طلبات وهمية متكررة)..."
                    className="h-9 px-3 rounded-lg border border-slate-200 text-xs"
                  />
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingMeta}
                  className="px-4 py-2 rounded-lg bg-[#0B172A] text-white text-xs font-semibold"
                >
                  {savingMeta ? 'جارٍ الحفظ...' : 'حفظ الملاحظات الداخلية'}
                </button>
              </div>
            </form>

            {/* Saved Addresses */}
            {selectedCustomer.savedAddresses &&
              selectedCustomer.savedAddresses.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-display text-sm font-bold text-[#0B172A]">
                    العناوين المحفوظة ({selectedCustomer.savedAddresses.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    {selectedCustomer.savedAddresses.map((a) => (
                      <div
                        key={a.id}
                        className="p-3 rounded-lg border border-slate-200 bg-slate-50/70"
                      >
                        <p className="font-bold text-[#0B172A]">
                          {a.label} {a.isDefault ? '(افتراضي)' : ''}
                        </p>
                        <p className="text-slate-600 mt-0.5">
                          {a.city} — {a.neighborhood} · {a.streetDetails}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Service Request History */}
            <div className="space-y-2">
              <h4 className="font-display text-sm font-bold text-[#0B172A]">
                سجل طلبات الخدمة ({inspectedRequests.length})
              </h4>
              {inspectedRequests.length === 0 ? (
                <p className="text-xs text-slate-500">
                  لم يقدّم هذا العميل طلبات خدمة بعد.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl px-4">
                  {inspectedRequests.map((r) => (
                    <div
                      key={r.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-[#0B172A]">
                          {r.categoryName}{' '}
                          <span className="font-mono-tabular text-slate-400" dir="ltr">
                            ({r.id})
                          </span>
                        </p>
                        <p className="text-slate-600 mt-0.5">
                          {r.problemDescription}
                        </p>
                        <p className="text-slate-400 mt-0.5">
                          {formatArabicDate(r.createdAt)} ·{' '}
                          {r.assignedProviderName || 'بدون فني'}
                          {r.agreedPrice ? ` · ${formatIQD(r.agreedPrice)}` : ''}
                        </p>
                      </div>
                      <span
                        className={`font-bold ${
                          REQUEST_STATUS_META[r.status].tone
                        }`}
                      >
                        {REQUEST_STATUS_META[r.status].labelAr}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Complaints & Reviews Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                <h4 className="font-display text-sm font-bold text-[#0B172A]">
                  الشكاوى والبلاغات ({inspectedComplaints.length})
                </h4>
                {inspectedComplaints.length === 0 ? (
                  <p className="text-xs text-slate-500">لا توجد شكاوى.</p>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {inspectedComplaints.map((c) => (
                      <li key={c.id} className="border-t border-slate-100 pt-2">
                        <p className="font-semibold text-[#0B172A]">
                          {c.reason} ({c.status})
                        </p>
                        <p className="text-slate-600">{c.details}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                <h4 className="font-display text-sm font-bold text-[#0B172A]">
                  التقييمات المرسلة ({inspectedReviews.length})
                </h4>
                {inspectedReviews.length === 0 ? (
                  <p className="text-xs text-slate-500">لا توجد تقييمات.</p>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {inspectedReviews.map((rev) => (
                      <li
                        key={rev.id}
                        className="border-t border-slate-100 pt-2"
                      >
                        <p className="font-semibold text-[#0B172A]">
                          التقييم: {rev.rating}/5 ({rev.status})
                        </p>
                        <p className="text-slate-600">{rev.comment}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REVIEW DELETION REQUEST MODAL */}
      {reviewingDeletion && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#0B172A]/60 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display text-lg font-bold text-[#0B172A]">
                مراجعة طلب حذف الحساب
              </h3>
              <button
                type="button"
                onClick={() => setReviewingDeletion(null)}
                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-1 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p>
                العميل: <strong>{reviewingDeletion.customerName}</strong>
              </p>
              <p dir="ltr" className="text-right font-mono-tabular">
                {reviewingDeletion.customerEmail}
              </p>
              {reviewingDeletion.reason && (
                <p>السبب: {reviewingDeletion.reason}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B172A] mb-1">
                ملاحظة الإدارة على القرار
              </label>
              <textarea
                rows={3}
                value={deletionAdminNote}
                onChange={(e) => setDeletionAdminNote(e.target.value)}
                placeholder="مثال: تم إغلاق الحساب بعد تسوية الطلبات المفتوحة..."
                className="w-full p-3 rounded-lg border border-slate-200 text-xs sm:text-sm"
              />
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={suspendOnApprove}
                onChange={(e) => setSuspendOnApprove(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600"
              />
              <span>تعليق دخول العميل عند الموافقة على الطلب</span>
            </label>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={savingDeletionDecision}
                onClick={() => void handleDeletionDecision('rejected')}
                className="px-4 py-2 rounded-lg border border-rose-200 text-rose-700 text-xs font-semibold"
              >
                رفض الطلب
              </button>
              <button
                type="button"
                disabled={savingDeletionDecision}
                onClick={() => void handleDeletionDecision('approved')}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>موافقة واعتماد</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
