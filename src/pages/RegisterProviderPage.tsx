import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { CheckCircle2, Clock, ExternalLink, FileText, LogIn, ShieldCheck, Upload } from 'lucide-react';
import { isInIframe, isIOSDevice, useAuth } from '../context/AuthContext';
import { getNeighborhoodsByCity, IRAQ_LOCATIONS } from '../data/locations';
import { db } from '../firebase/config';
import {
  fetchProviderPrivateDocs,
  registerOrUpdateProviderProfile,
} from '../firebase/marketplaceApi';
import {
  AppPage,
  ServiceCategory,
  ServiceProvider,
  VerificationDocument,
} from '../types/marketplace';
import { isValidIraqiPhone } from '../utils/format';

function formatSubmitErrorArabic(err: unknown): string {
  if (!(err instanceof Error)) {
    return 'تعذّر إرسال طلب التسجيل، يرجى المحاولة مجدداً.';
  }
  const msg = err.message;
  try {
    const parsed = JSON.parse(msg) as { error?: string };
    if (parsed?.error) {
      if (parsed.error.includes('permission-denied') || parsed.error.includes('Missing or insufficient permissions')) {
        return 'تعذّر حفظ ملف مقدم الخدمة بسبب رفض صلاحيات قاعدة البيانات أو عدم اكتمال أحد الحقول المطلوبة (مثل طول الوصف 20 حرفاً على الأقل أو رقم هاتف عراقي صحيح).';
      }
      return `تعذّر حفظ البيانات: ${parsed.error}`;
    }
  } catch {
    // Not a JSON FirestoreErrorInfo payload
  }
  return msg || 'تعذّر إرسال طلب التسجيل، يرجى المحاولة مجدداً.';
}

interface RegisterProviderPageProps {
  categories: ServiceCategory[];
  onNavigate: (page: AppPage) => void;
}

export function RegisterProviderPage({
  categories,
  onNavigate,
}: RegisterProviderPageProps) {
  const {
    firebaseUser,
    userProfile,
    authLoading,
    signingIn,
    redirectInProgress,
    authError,
    clearAuthError,
    signInWithGoogle,
    completeOnboarding,
    markProviderProfileCreated,
  } = useAuth();
  const activeCategories = categories.filter((c) => c.isActive);

  const [existingProvider, setExistingProvider] =
    useState<ServiceProvider | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(false);

  const [fullName, setFullName] = useState(userProfile?.displayName ?? '');
  const [phone, setPhone] = useState(userProfile?.phone ?? '');
  const [categoryId, setCategoryId] = useState(activeCategories[0]?.id ?? '');
  const [city, setCity] = useState(userProfile?.city ?? 'أربيل');
  const [neighborhood, setNeighborhood] = useState(
    userProfile?.neighborhood ?? 'عنكاوا'
  );
  const [extraAreas, setExtraAreas] = useState<string[]>([]);
  const [yearsExperience, setYearsExperience] = useState('3');
  const [description, setDescription] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [profileFileName, setProfileFileName] = useState('');
  const [documents, setDocuments] = useState<VerificationDocument[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submittedProvider, setSubmittedProvider] =
    useState<ServiceProvider | null>(null);

  useEffect(() => {
    if (!userProfile || existingProvider) return;
    setFullName((prev) => prev || userProfile.displayName || '');
    setPhone((prev) => prev || userProfile.phone || '');
    if (userProfile.city) {
      setCity(userProfile.city);
    }
    if (userProfile.neighborhood) {
      setNeighborhood(userProfile.neighborhood);
    }
  }, [userProfile, existingProvider]);

  useEffect(() => {
    if (!firebaseUser) {
      setExistingProvider(null);
      return;
    }
    let active = true;
    setCheckingExisting(true);
    void (async () => {
      try {
        const snap = await getDoc(doc(db, 'providers', firebaseUser.uid));
        if (!active) return;
        if (snap.exists()) {
          const prov = snap.data() as ServiceProvider;
          const docs = await fetchProviderPrivateDocs(firebaseUser.uid).catch(
            () => []
          );
          if (!active) return;
          setExistingProvider({ ...prov, documents: docs });
          setFullName(prov.fullName);
          setPhone(prov.phone);
          setCategoryId(prov.categoryId);
          setCity(prov.city);
          setNeighborhood(prov.neighborhood);
          setExtraAreas(
            (prov.serviceAreas || []).filter((a) => a !== prov.neighborhood)
          );
          setYearsExperience(String(prov.yearsExperience));
          setDescription(prov.description);
          setProfileImage(prov.profileImage || '');
          setDocuments(docs);
        } else {
          setExistingProvider(null);
        }
      } catch {
        // Ignore transient read issues; form still usable
      } finally {
        if (active) setCheckingExisting(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [firebaseUser]);

  const availableNeighborhoods = getNeighborhoodsByCity(city);

  const handleCityChange = (nextCity: string) => {
    setCity(nextCity);
    const list = getNeighborhoodsByCity(nextCity);
    setNeighborhood(list[0] ?? '');
    setExtraAreas([]);
  };

  const toggleExtraArea = (area: string) => {
    setExtraAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  const handleProfileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 180 * 1024) {
      setErrors((prev) => ({
        ...prev,
        profileImage: 'حجم الصورة يجب أن لا يتجاوز 180 كيلوبايت للحفظ السريع.',
      }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfileImage(reader.result);
        setProfileFileName(file.name);
        setErrors((prev) => {
          const copy = { ...prev };
          delete copy.profileImage;
          return copy;
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDocumentUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    files.slice(0, 3).forEach((file) => {
      setDocuments((prev) => [
        ...prev,
        {
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          label: 'وثيقة تحقق مرفقة',
          fileName: file.name,
          uploadedAt: new Date().toISOString(),
        },
      ]);
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) {
      setErrors({ form: 'يرجى تسجيل الدخول بحساب Google أولاً.' });
      return;
    }

    const nextErrors: Record<string, string> = {};
    if (fullName.trim().length < 3) {
      nextErrors.fullName = 'يرجى إدخال الاسم الكامل (3 أحرف على الأقل).';
    }
    if (!isValidIraqiPhone(phone)) {
      nextErrors.phone =
        'يرجى إدخال رقم هاتف عراقي صحيح يبدأ بـ 07 (11 رقماً).';
    }
    if (!categoryId) {
      nextErrors.categoryId = 'يرجى اختيار التخصص المهني.';
    }
    if (!city || !neighborhood) {
      nextErrors.location = 'يرجى تحديد المدينة والحي السكني.';
    }
    const expNum = Number(yearsExperience);
    if (Number.isNaN(expNum) || expNum < 0 || expNum > 50) {
      nextErrors.yearsExperience = 'يرجى إدخال عدد سنوات خبرة منطقي (0–50).';
    }
    if (description.trim().length < 20) {
      nextErrors.description =
        'يرجى كتابة وصف مهني للخدمات المقدّمة (20 حرفاً على الأقل).';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      if (!userProfile) {
        await completeOnboarding({
          role: 'provider',
          displayName: fullName.trim(),
          phone,
          city,
          neighborhood,
        });
      }

      const serviceAreas = Array.from(new Set([neighborhood, ...extraAreas]));
      const created = await registerOrUpdateProviderProfile({
        uid: firebaseUser.uid,
        fullName,
        phone,
        categoryId,
        city,
        neighborhood,
        serviceAreas,
        yearsExperience: expNum,
        description,
        profileImage,
        documents,
        isNew: !existingProvider,
      });

      markProviderProfileCreated();
      setExistingProvider(created);
      setSubmittedProvider(created);
      setErrors({});
    } catch (err) {
      setErrors({
        form: formatSubmitErrorArabic(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedProvider) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-14">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-5">
          <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7" aria-hidden="true" />
          </div>

          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#0B172A]">
            تم حفظ طلب تسجيلك في قاعدة البيانات
          </h1>

          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            شكراً لك <strong>{submittedProvider.fullName}</strong>. حسابك الآن{' '}
            <strong>قيد المراجعة اليدوية</strong> ولن يظهر للعملاء أو يحصل على
            شارة التوثيق إلا بعد تدقيق الإدارة للمعلومات والوثائق المرفقة.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1.5 text-right">
            <p>
              رقم الطلب المرجعي:{' '}
              <span dir="ltr" className="font-mono-tabular font-semibold text-[#0B172A]">
                {submittedProvider.id}
              </span>
            </p>
            <p>الحالة الحالية: بانتظار الموافقة · غير موثّق بعد</p>
            <p>الوثائق المرفقة: {submittedProvider.documents.length} ملف (محفوظة بأمان للإدارة فقط)</p>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('provider-dashboard')}
              className="px-5 py-2.5 rounded-lg bg-[#0B172A] hover:bg-[#13233E] text-white text-sm font-semibold transition-colors"
            >
              الانتقال إلى لوحة مقدم الخدمة
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
      <div className="mb-8">
        <p className="text-xs font-medium text-emerald-700 mb-2">
          انضمام المهنيين والحرفيين · أربيل والعراق
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-[#0B172A]">
          سجّل كمقدّم خدمة في منصة خدمتي
        </h1>
        <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl">
          املأ بياناتك المهنية بدقة. تبقى جميع الطلبات الجديدة قيد المراجعة
          اليدوية ولا تُمنح شارة «موثّق يدوياً» إلا بعد التحقق من الهوية
          ومستندات الخبرة.
        </p>
      </div>

      {authLoading || redirectInProgress || checkingExisting ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-[#0B172A]">
            {redirectInProgress
              ? 'جارٍ إكمال تسجيل الدخول بحساب Google...'
              : 'جارٍ التحقق من جلسة حسابك وملفك المهني...'}
          </p>
        </div>
      ) : !firebaseUser ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
          <h2 className="font-display text-xl font-bold text-[#0B172A]">
            سجّل الدخول أولاً لربط ملفك المهني بحسابك
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            لتمكينك من إدارة طلبات العملاء وكشوفات العمولات لاحقاً بأمان، يرجى
            تسجيل الدخول بحساب Google أولاً.
          </p>
          {authError && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm max-w-md mx-auto"
            >
              {authError}
            </div>
          )}
          {isInIframe() && isIOSDevice() ? (
            <div className="space-y-2.5 max-w-md mx-auto">
              <a
                href={
                  typeof window !== 'undefined'
                    ? `${window.location.origin}/?page=register`
                    : '/?page=register'
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#0B172A] hover:bg-[#13233E] text-white text-sm font-semibold"
              >
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
                <span>فتح التسجيل في Safari المباشر</span>
              </a>
              <p className="text-xs text-slate-500">
                يُفتح الرابط مباشرة في Safari لإتمام تسجيل الدخول بحساب Google بدون حظر النوافذ.
              </p>
            </div>
          ) : (
            <button
              type="button"
              disabled={signingIn}
              onClick={() => {
                clearAuthError();
                void signInWithGoogle('register').catch(() => {});
              }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#0B172A] hover:bg-[#13233E] disabled:opacity-65 text-white text-sm font-semibold"
            >
              <LogIn className="w-4 h-4" aria-hidden="true" />
              <span>
                {signingIn
                  ? 'جارٍ التحويل إلى حساب Google...'
                  : 'تسجيل الدخول بحساب Google'}
              </span>
            </button>
          )}
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6"
        >
          {existingProvider && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 text-xs sm:text-sm text-amber-900">
                <Clock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-bold">
                    لديك ملف مقدم خدمة مسجل مسبقاً — الحالة:{' '}
                    {existingProvider.approvalStatus === 'approved'
                      ? 'معتمد'
                      : existingProvider.approvalStatus === 'pending'
                      ? 'بانتظار موافقة الإدارة'
                      : existingProvider.approvalStatus === 'suspended'
                      ? 'معلّق'
                      : 'مرفوض'}
                  </p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    يمكنك تعديل بياناتك أدناه وحفظ التحديثات، أو الانتقال مباشرة إلى لوحة مقدم الخدمة.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('provider-dashboard')}
                className="px-4 py-2 rounded-lg bg-[#0B172A] text-white text-xs font-semibold shrink-0"
              >
                فتح لوحة مقدم الخدمة
              </button>
            </div>
          )}

          {errors.form && (
            <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm">
              {errors.form}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label
                htmlFor="reg-name"
                className="block text-sm font-semibold text-[#0B172A] mb-1.5"
              >
                الاسم الكامل <span className="text-rose-600">*</span>
              </label>
              <input
                id="reg-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="مثال: دلشاد كريم رشيد"
                className="w-full h-11 px-3.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              {errors.fullName && (
                <p className="mt-1 text-xs text-rose-700">{errors.fullName}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="reg-phone"
                className="block text-sm font-semibold text-[#0B172A] mb-1.5"
              >
                رقم الهاتف / الواتساب <span className="text-rose-600">*</span>
              </label>
              <input
                id="reg-phone"
                type="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0750 123 4567"
                className="w-full h-11 px-3.5 rounded-lg border border-slate-200 text-sm text-left font-mono-tabular focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              {errors.phone && (
                <p className="mt-1 text-xs text-rose-700">{errors.phone}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="reg-category"
                className="block text-sm font-semibold text-[#0B172A] mb-1.5"
              >
                التخصص المهني <span className="text-rose-600">*</span>
              </label>
              <select
                id="reg-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {activeCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nameAr}
                  </option>
                ))}
              </select>
              {errors.categoryId && (
                <p className="mt-1 text-xs text-rose-700">{errors.categoryId}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="reg-exp"
                className="block text-sm font-semibold text-[#0B172A] mb-1.5"
              >
                سنوات الخبرة العملية <span className="text-rose-600">*</span>
              </label>
              <input
                id="reg-exp"
                type="number"
                min="0"
                max="50"
                value={yearsExperience}
                onChange={(e) => setYearsExperience(e.target.value)}
                className="w-full h-11 px-3.5 rounded-lg border border-slate-200 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              {errors.yearsExperience && (
                <p className="mt-1 text-xs text-rose-700">
                  {errors.yearsExperience}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="reg-city"
                className="block text-sm font-semibold text-[#0B172A] mb-1.5"
              >
                المدينة <span className="text-rose-600">*</span>
              </label>
              <select
                id="reg-city"
                value={city}
                onChange={(e) => handleCityChange(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {IRAQ_LOCATIONS.map((loc) => (
                  <option key={loc.city} value={loc.city}>
                    {loc.city}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="reg-neighborhood"
                className="block text-sm font-semibold text-[#0B172A] mb-1.5"
              >
                الحي الرئيسي <span className="text-rose-600">*</span>
              </label>
              <select
                id="reg-neighborhood"
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {availableNeighborhoods.map((hood) => (
                  <option key={hood} value={hood}>
                    {hood}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <span className="block text-sm font-semibold text-[#0B172A] mb-2">
              أحياء إضافية تغطيها خدمتك في {city} (اختياري)
            </span>
            <div className="flex flex-wrap gap-2">
              {availableNeighborhoods
                .filter((hood) => hood !== neighborhood)
                .map((hood) => {
                  const selected = extraAreas.includes(hood);
                  return (
                    <button
                      key={hood}
                      type="button"
                      onClick={() => toggleExtraArea(hood)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        selected
                          ? 'bg-[#0B172A] border-[#0B172A] text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {hood}
                    </button>
                  );
                })}
            </div>
          </div>

          <div>
            <label
              htmlFor="reg-desc"
              className="block text-sm font-semibold text-[#0B172A] mb-1.5"
            >
              وصف الخدمات التي تقدمها <span className="text-rose-600">*</span>
            </label>
            <textarea
              id="reg-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اشرح تفاصيل عملك، المعدات التي تستخدمها، وأنواع الأعطال أو المشاريع التي تتخصص فيها..."
              className="w-full p-3.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            {errors.description && (
              <p className="mt-1 text-xs text-rose-700">{errors.description}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
            <div className="border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50/70">
              <label
                htmlFor="reg-photo"
                className="block text-sm font-semibold text-[#0B172A] mb-1"
              >
                الصورة الشخصية (اختياري)
              </label>
              <p className="text-xs text-slate-500 mb-3">
                صورة واضحة ومهنية تظهر في ملفك العام.
              </p>
              <label
                htmlFor="reg-photo"
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-[#0B172A] hover:bg-slate-50 cursor-pointer"
              >
                <Upload className="w-4 h-4" aria-hidden="true" />
                <span>{profileFileName ? 'تغيير الصورة' : 'رفع صورة شخصية'}</span>
              </label>
              <input
                id="reg-photo"
                type="file"
                accept="image/*"
                onChange={handleProfileUpload}
                className="sr-only"
              />
              {profileFileName && (
                <p className="mt-2 text-xs text-emerald-700 truncate">
                  تم اختيار: {profileFileName}
                </p>
              )}
              {errors.profileImage && (
                <p className="mt-2 text-xs text-rose-700">
                  {errors.profileImage}
                </p>
              )}
            </div>

            <div className="border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50/70">
              <label
                htmlFor="reg-docs"
                className="block text-sm font-semibold text-[#0B172A] mb-1"
              >
                وثائق التحقق والهوية (للمراجعة الإدارية فقط)
              </label>
              <p className="text-xs text-slate-500 mb-3">
                البطاقة الوطنية الموحدة أو شهادة الخبرة — محمية ولا تظهر للعامة.
              </p>
              <label
                htmlFor="reg-docs"
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-[#0B172A] hover:bg-slate-50 cursor-pointer"
              >
                <FileText className="w-4 h-4" aria-hidden="true" />
                <span>إرفاق وثيقة (صورة أو PDF)</span>
              </label>
              <input
                id="reg-docs"
                type="file"
                accept="image/*,.pdf"
                multiple
                onChange={handleDocumentUpload}
                className="sr-only"
              />
              {documents.length > 0 && (
                <ul className="mt-2.5 space-y-1 text-xs text-emerald-700">
                  {documents.map((doc) => (
                    <li key={doc.id} className="truncate">
                      ✓ {doc.fileName}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
            <ShieldCheck
              className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              بإرسال هذا الطلب، تقرّ بصحة معلوماتك وتفهم أن حسابك سيبقى{' '}
              <strong>قيد المراجعة اليدوية</strong> ولن تُمنح شارة التوثيق إلا
              بعد التدقيق من قِبل فريق خدمتي.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors min-h-[44px]"
            >
              {submitting
                ? 'جارٍ حفظ الطلب...'
                : existingProvider
                ? 'حفظ تحديثات الملف المهني'
                : 'إرسال طلب التسجيل للمراجعة'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
