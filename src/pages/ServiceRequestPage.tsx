import { FormEvent, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  LogIn,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getNeighborhoodsByCity, IRAQ_LOCATIONS } from '../data/locations';
import { createServiceRequest } from '../firebase/marketplaceApi';
import {
  AppPage,
  SavedAddress,
  ServiceCategory,
  ServiceRequest,
} from '../types/marketplace';
import { isValidIraqiPhone } from '../utils/format';

interface ServiceRequestPageProps {
  categories: ServiceCategory[];
  initialCategoryId?: string;
  onNavigate: (page: AppPage) => void;
}

const PREFERRED_TIME_SLOTS = [
  'اليوم صباحاً (9:00 ص — 12:00 ظ)',
  'اليوم عصراً (1:00 م — 5:00 م)',
  'اليوم مساءً (5:00 م — 9:00 م)',
  'غداً صباحاً (9:00 ص — 12:00 ظ)',
  'غداً عصراً (1:00 م — 5:00 م)',
  'مرن — حسب تنسيق الإدارة والفني',
];

export function ServiceRequestPage({
  categories,
  initialCategoryId,
  onNavigate,
}: ServiceRequestPageProps) {
  const { firebaseUser, userProfile } = useAuth();
  const activeCategories = categories.filter((c) => c.isActive);
  const savedAddresses = userProfile?.savedAddresses ?? [];

  const defaultSaved =
    savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0];

  const [categoryId, setCategoryId] = useState(
    initialCategoryId || activeCategories[0]?.id || ''
  );
  const [selectedAddressId, setSelectedAddressId] = useState(
    defaultSaved?.id ?? ''
  );
  const [city, setCity] = useState(
    defaultSaved?.city || userProfile?.city || 'أربيل'
  );
  const [neighborhood, setNeighborhood] = useState(
    defaultSaved?.neighborhood || userProfile?.neighborhood || 'عنكاوا'
  );
  const [customerPhone, setCustomerPhone] = useState(userProfile?.phone || '');
  const [preferredTime, setPreferredTime] = useState(PREFERRED_TIME_SLOTS[0]);
  const [problemDescription, setProblemDescription] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdRequest, setCreatedRequest] = useState<ServiceRequest | null>(
    null
  );

  useEffect(() => {
    if (!userProfile) return;
    if (!customerPhone && userProfile.phone) {
      setCustomerPhone(userProfile.phone);
    }
    const def =
      userProfile.savedAddresses?.find((a) => a.isDefault) ??
      userProfile.savedAddresses?.[0];
    if (def && !selectedAddressId) {
      setSelectedAddressId(def.id);
      setCity(def.city);
      setNeighborhood(def.neighborhood);
    }
  }, [userProfile, customerPhone, selectedAddressId]);

  const neighborhoods = getNeighborhoodsByCity(city);

  const handleSelectSavedAddress = (addr: SavedAddress) => {
    setSelectedAddressId(addr.id);
    setCity(addr.city);
    setNeighborhood(addr.neighborhood);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!firebaseUser || !userProfile) {
      setError('يرجى تسجيل الدخول وإكمال بيانات حسابك لإرسال طلب الخدمة.');
      return;
    }
    if (userProfile.isSuspended) {
      setError('هذا الحساب معلّق حالياً من قِبل الإدارة.');
      return;
    }

    const selectedCategory = activeCategories.find((c) => c.id === categoryId);
    if (!selectedCategory) {
      setError('يرجى اختيار تصنيف الخدمة.');
      return;
    }
    if (!isValidIraqiPhone(customerPhone)) {
      setError('يرجى إدخال رقم هاتف عراقي صحيح يبدأ بـ 07 (11 رقماً).');
      return;
    }
    if (problemDescription.trim().length < 10) {
      setError(
        'يرجى وصف المشكلة بـ 10 أحرف على الأقل ليتمكن الفني من الاستعداد.'
      );
      return;
    }

    const chosenAddress = savedAddresses.find(
      (a) => a.id === selectedAddressId
    );
    const addressLine =
      chosenAddress &&
      chosenAddress.city === city &&
      chosenAddress.neighborhood === neighborhood &&
      chosenAddress.streetDetails
        ? `\n[العنوان التفصيلي (${chosenAddress.label}): ${chosenAddress.streetDetails}${
            chosenAddress.landmark ? ` — قرب ${chosenAddress.landmark}` : ''
          }]`
        : '';

    setSubmitting(true);
    try {
      const created = await createServiceRequest({
        customerId: firebaseUser.uid,
        customerName: userProfile.displayName,
        customerPhone,
        categoryId: selectedCategory.id,
        categoryName: selectedCategory.nameAr,
        problemDescription: `${problemDescription.trim()}${addressLine}`,
        city,
        neighborhood,
        preferredTime,
      });
      setCreatedRequest(created);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'تعذّر إرسال الطلب، حاول مجدداً.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (createdRequest) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-14">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-5">
          <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#0B172A]">
            تم استلام طلب الخدمة بنجاح
          </h1>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            تم حفظ طلبك في قاعدة البيانات وإرساله إلى فريق إدارة خدمتي في أربيل
            لاعتماده وإسناده إلى فني موثّق مناسب.
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 space-y-1.5 text-right">
            <p>
              رقم الطلب:{' '}
              <span dir="ltr" className="font-mono-tabular font-semibold">
                {createdRequest.id}
              </span>
            </p>
            <p>التخصص: {createdRequest.categoryName}</p>
            <p>
              الموقع: {createdRequest.city} — {createdRequest.neighborhood}
            </p>
            <p>الحالة الحالية: قيد الانتظار</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigate('customer')}
              className="px-5 py-2.5 rounded-lg bg-[#0B172A] hover:bg-[#13233E] text-white text-sm font-semibold"
            >
              متابعة طلباتي
            </button>
            <button
              type="button"
              onClick={() => {
                setCreatedRequest(null);
                setProblemDescription('');
              }}
              className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"
            >
              تقديم طلب جديد
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
      <div className="mb-8">
        <p className="text-xs font-medium text-emerald-700 mb-2">
          نظام طلبات الخدمة · أربيل والعراق
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-[#0B172A]">
          اطلب خدمة منزلية موثوقة
        </h1>
        <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed">
          حدّد التخصص المطلوب ومشكلتك وموقعك في أربيل والوقت المناسب، وسيتولى
          فريق خدمتي اعتماد الطلب وتعيين فني متاح.
        </p>
      </div>

      {!firebaseUser || !userProfile ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
          <h2 className="font-display text-xl font-bold text-[#0B172A]">
            سجّل الدخول أولاً لإرسال طلب خدمة
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            لضمان متابعة طلباتك وحفظ سجل الصيانة الخاص بك بأمان، يرجى تسجيل
            الدخول بحسابك أولاً.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('auth')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#0B172A] hover:bg-[#13233E] text-white text-sm font-semibold"
          >
            <LogIn className="w-4 h-4" aria-hidden="true" />
            <span>تسجيل الدخول / إنشاء حساب</span>
          </button>
        </div>
      ) : userProfile.isSuspended ? (
        <div className="bg-white border border-rose-200 rounded-2xl p-8 text-center space-y-4">
          <AlertTriangle
            className="w-8 h-8 text-rose-700 mx-auto"
            aria-hidden="true"
          />
          <h2 className="font-display text-xl font-bold text-[#0B172A]">
            الحساب معلّق مؤقتاً
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            لا يمكن إرسال طلبات خدمة جديدة أثناء تعليق الحساب. يمكنك مراجعة
            تفاصيل حسابك من لوحة العميل.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('customer')}
            className="px-6 py-2.5 rounded-lg bg-[#0B172A] text-white text-sm font-semibold"
          >
            الانتقال إلى حسابي
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-5"
        >
          {error && (
            <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm">
              {error}
            </div>
          )}

          {savedAddresses.length > 0 && (
            <div className="space-y-2 pb-2 border-b border-slate-100">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#0B172A] inline-flex items-center gap-1.5">
                  <MapPin
                    className="w-3.5 h-3.5 text-emerald-700"
                    aria-hidden="true"
                  />
                  <span>اختر من عناوينك المحفوظة</span>
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('customer')}
                  className="text-xs font-medium text-emerald-700 hover:underline"
                >
                  إدارة العناوين
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {savedAddresses.map((addr) => {
                  const active = selectedAddressId === addr.id;
                  return (
                    <button
                      key={addr.id}
                      type="button"
                      onClick={() => handleSelectSavedAddress(addr)}
                      className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors text-right ${
                        active
                          ? 'border-emerald-600 bg-emerald-50 text-[#0B172A] font-semibold'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {addr.label} · {addr.city} — {addr.neighborhood}
                      {addr.isDefault ? ' (الافتراضي)' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="req-cat"
                className="block text-sm font-semibold text-[#0B172A] mb-1.5"
              >
                تصنيف الخدمة المطلوبة
              </label>
              <select
                id="req-cat"
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
            </div>

            <div>
              <label
                htmlFor="req-phone"
                className="block text-sm font-semibold text-[#0B172A] mb-1.5"
              >
                رقم الهاتف للتواصل
              </label>
              <input
                id="req-phone"
                type="tel"
                dir="ltr"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="0750 123 4567"
                className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm text-left font-mono-tabular focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label
                htmlFor="req-city"
                className="block text-sm font-semibold text-[#0B172A] mb-1.5"
              >
                المدينة
              </label>
              <select
                id="req-city"
                value={city}
                onChange={(e) => {
                  const next = e.target.value;
                  setSelectedAddressId('');
                  setCity(next);
                  setNeighborhood(getNeighborhoodsByCity(next)[0] ?? '');
                }}
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
                htmlFor="req-hood"
                className="block text-sm font-semibold text-[#0B172A] mb-1.5"
              >
                الحي في {city}
              </label>
              <select
                id="req-hood"
                value={neighborhood}
                onChange={(e) => {
                  setSelectedAddressId('');
                  setNeighborhood(e.target.value);
                }}
                className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {neighborhoods.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="req-time"
              className="block text-sm font-semibold text-[#0B172A] mb-1.5"
            >
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock
                  className="w-4 h-4 text-emerald-700"
                  aria-hidden="true"
                />
                <span>الموعد المفضل للزيارة</span>
              </span>
            </label>
            <select
              id="req-time"
              value={preferredTime}
              onChange={(e) => setPreferredTime(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              {PREFERRED_TIME_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="req-desc"
              className="block text-sm font-semibold text-[#0B172A] mb-1.5"
            >
              وصف المشكلة أو العمل المطلوب
            </label>
            <textarea
              id="req-desc"
              rows={4}
              value={problemDescription}
              onChange={(e) => setProblemDescription(e.target.value)}
              placeholder="مثال: عطل في سبلت الغرفة الرئيسية ولا يبرّد منذ يومين، في الدور الثاني..."
              className="w-full p-3.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3 text-xs text-slate-600">
            <ShieldCheck
              className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <span>
              تُحفظ بيانات طلبك بأمان ولا يطّلع عليها سوى الإدارة والفني المعيّن
              لتنفيذ المهمة.
            </span>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors min-h-[44px]"
            >
              {submitting ? 'جارٍ إرسال الطلب...' : 'إرسال طلب الخدمة'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
