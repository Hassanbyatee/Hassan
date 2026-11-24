import { FormEvent, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  LogIn,
  Mail,
  RefreshCcw,
  ShieldCheck,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { isInIframe, isIOSDevice, useAuth } from '../context/AuthContext';
import { getNeighborhoodsByCity, IRAQ_LOCATIONS } from '../data/locations';
import { AppPage } from '../types/marketplace';
import { isValidIraqiPhone } from '../utils/format';

interface AuthPageProps {
  onNavigate: (page: AppPage) => void;
}

type EmailAuthMode = 'login' | 'register' | 'reset';

export function AuthPage({ onNavigate }: AuthPageProps) {
  const {
    firebaseUser,
    userProfile,
    isAdmin,
    authLoading,
    signingIn,
    redirectInProgress,
    authError,
    clearAuthError,
    needsOnboarding,
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    sendPasswordReset,
    resendEmailVerification,
    reloadAuthUser,
    signOutUser,
    completeOnboarding,
  } = useAuth();

  // Onboarding fields
  const [role, setRole] = useState<'customer' | 'provider'>('customer');
  const [displayName, setDisplayName] = useState(
    firebaseUser?.displayName ?? ''
  );
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('أربيل');
  const [neighborhood, setNeighborhood] = useState('عنكاوا');

  // Email/Password auth fields
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailMode, setEmailMode] = useState<EmailAuthMode>('login');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [emailNameInput, setEmailNameInput] = useState('');

  // Status & errors
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkingVerification, setCheckingVerification] = useState(false);

  useEffect(() => {
    if (firebaseUser?.displayName && !displayName) {
      setDisplayName(firebaseUser.displayName);
    }
  }, [firebaseUser?.displayName, displayName]);

  const neighborhoods = getNeighborhoodsByCity(city);
  const isProcessingAuth = authLoading || redirectInProgress;
  const visibleError = isProcessingAuth ? '' : error || authError;
  const embeddedIOS = isInIframe() && isIOSDevice();
  const standaloneAuthUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?page=auth`
      : '/?page=auth';

  const handleGoogleLogin = async () => {
    setError('');
    setInfoMessage('');
    clearAuthError();
    try {
      await signInWithGoogle('auth');
    } catch (err) {
      if (!redirectInProgress) {
        setError(
          err instanceof Error
            ? err.message
            : 'تعذّر تسجيل الدخول عبر Google. حاول مرة أخرى.'
        );
      }
    }
  };

  const handleEmailAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    clearAuthError();

    if (!emailInput.trim().includes('@')) {
      setError('يرجى إدخال بريد إلكتروني صحيح.');
      return;
    }

    if (emailMode === 'reset') {
      setSubmitting(true);
      try {
        await sendPasswordReset(emailInput);
        setInfoMessage(
          'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني بنجاح.'
        );
        setEmailMode('login');
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'تعذّر إرسال رابط استعادة كلمة المرور.'
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (passwordInput.length < 6) {
      setError('يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.');
      return;
    }

    if (emailMode === 'register') {
      if (emailNameInput.trim().length < 2) {
        setError('يرجى إدخال الاسم الكامل (حرفان على الأقل).');
        return;
      }
      if (passwordInput !== confirmPasswordInput) {
        setError('كلمتا المرور غير متطابقتين.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (emailMode === 'register') {
        await registerWithEmail(emailInput, passwordInput, emailNameInput);
        setInfoMessage(
          'تم إنشاء الحساب وإرسال رابط التفعيل إلى بريدك الإلكتروني. يرجى تأكيد البريد ثم الضغط على زر التحقق.'
        );
      } else {
        await signInWithEmail(emailInput, passwordInput);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'تعذّر إتمام المصادقة بالبريد الإلكتروني.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckVerification = async () => {
    setError('');
    setInfoMessage('');
    setCheckingVerification(true);
    try {
      const verified = await reloadAuthUser();
      if (verified) {
        setInfoMessage('تم تأكيد تفعيل بريدك الإلكتروني بنجاح.');
      } else {
        setError(
          'لم يتم تفعيل البريد بعد. افتح رسالة التفعيل في بريدك واضغط على الرابط ثم حاول مجدداً.'
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'تعذّر التحقق من حالة التفعيل.'
      );
    } finally {
      setCheckingVerification(false);
    }
  };

  const handleResendVerification = async () => {
    setError('');
    setInfoMessage('');
    try {
      await resendEmailVerification();
      setInfoMessage('تمت إعادة إرسال رابط التفعيل إلى بريدك الإلكتروني.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'تعذّر إعادة إرسال رابط التفعيل.'
      );
    }
  };

  const handleOnboardingSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    clearAuthError();

    const finalName = displayName.trim() || firebaseUser?.displayName || '';
    if (finalName.length < 2) {
      setError('يرجى إدخال الاسم الكامل (حرفان على الأقل).');
      return;
    }
    if (!isValidIraqiPhone(phone)) {
      setError('يرجى إدخال رقم هاتف عراقي صحيح يبدأ بـ 07 (11 رقماً).');
      return;
    }

    setSubmitting(true);
    try {
      const profile = await completeOnboarding({
        role,
        displayName: finalName,
        phone,
        city,
        neighborhood,
      });
      if (profile.role === 'provider') {
        onNavigate('register');
      } else {
        onNavigate('customer');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ بيانات الحساب.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (isProcessingAuth) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
          <Loader2
            className="w-8 h-8 text-emerald-700 animate-spin mx-auto"
            aria-hidden="true"
          />
          <p className="font-display text-lg font-bold text-[#0B172A]">
            {redirectInProgress
              ? 'جارٍ إكمال تسجيل الدخول بحساب Google...'
              : 'جارٍ التحقق من جلسة تسجيل الدخول...'}
          </p>
          <p className="text-xs text-slate-500">
            يرجى الانتظار لحظات، يتم تأكيد الجلسة بأمان عبر Firebase
          </p>
        </div>
      </div>
    );
  }

  // Email verification required gate (before Firestore rules allow profile creation)
  if (firebaseUser && !firebaseUser.emailVerified) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 space-y-5">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
            <Mail className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="text-center space-y-2">
            <h1 className="font-display text-2xl font-bold text-[#0B172A]">
              تفعيل البريد الإلكتروني مطلوب
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              أرسلنا رابط التفعيل إلى{' '}
              <strong dir="ltr" className="text-[#0B172A]">
                {firebaseUser.email}
              </strong>
              . يرجى فتح البريد والضغط على الرابط، ثم العودة للضغط على زر
              التحقق للمتابعة بأمان.
            </p>
          </div>

          {visibleError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs"
            >
              {visibleError}
            </div>
          )}
          {infoMessage && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{infoMessage}</span>
            </div>
          )}

          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              disabled={checkingVerification}
              onClick={() => void handleCheckVerification()}
              className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              <RefreshCcw
                className={`w-4 h-4 ${checkingVerification ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>
                {checkingVerification
                  ? 'جارٍ التحقق...'
                  : 'تم التفعيل — التحقق والمتابعة'}
              </span>
            </button>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => void handleResendVerification()}
                className="h-10 rounded-lg border border-slate-200 text-xs font-semibold text-[#0B172A] hover:bg-slate-50"
              >
                إعادة إرسال الرابط
              </button>
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="h-10 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                تغيير الحساب
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Suspended account notice
  if (firebaseUser && userProfile?.isSuspended && !isAdmin) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="bg-white border border-rose-200 rounded-2xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-bold text-[#0B172A]">
            هذا الحساب معلّق حالياً
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            تم تعليق حسابك مؤقتاً من قِبل إدارة منصة خدمتي. يمكنك مراجعة
            حالة الحساب في لوحة العميل أو التواصل مع فريق الدعم.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigate('customer')}
              className="px-5 py-2.5 rounded-lg bg-[#0B172A] text-white text-sm font-semibold"
            >
              الانتقال إلى حسابي
            </button>
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="px-5 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              تسجيل الخروج
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (firebaseUser && !needsOnboarding && (userProfile || isAdmin)) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-5">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
            <UserCheck className="w-6 h-6" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-bold text-[#0B172A]">
            مرحباً بك،{' '}
            {userProfile?.displayName ||
              firebaseUser.displayName ||
              'مستخدم خدمتي'}
          </h1>
          <p className="text-sm text-slate-600">
            أنت مسجّل الدخول حالياً بدور:{' '}
            <strong>
              {isAdmin
                ? 'مدير المنصة'
                : userProfile?.role === 'provider'
                ? 'مقدّم خدمة'
                : 'عميل'}
            </strong>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() =>
                onNavigate(
                  isAdmin
                    ? 'admin'
                    : userProfile?.role === 'provider'
                    ? 'provider-dashboard'
                    : 'customer'
                )
              }
              className="px-5 py-2.5 rounded-lg bg-[#0B172A] text-white text-sm font-semibold hover:bg-[#13233E]"
            >
              الانتقال إلى لوحة حسابي
            </button>
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="px-5 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              العودة للرئيسية
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-12 lg:py-16">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
        <div>
          <p className="text-xs font-medium text-emerald-700 mb-1.5">
            حسابات موثّقة وآمنة · Firebase Authentication
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#0B172A]">
            {needsOnboarding
              ? 'إكمال بيانات حسابك في خدمتي'
              : 'تسجيل الدخول أو إنشاء حساب'}
          </h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            {needsOnboarding
              ? 'اختر نوع حسابك وأدخل رقم هاتفك العراقي ومنطقتك في أربيل للمتابعة.'
              : 'سجّل الدخول بحساب Google الموثّق أو عبر البريد الإلكتروني لطلب الخدمات المنزلية أو للتسجيل كمقدّم خدمة.'}
          </p>
        </div>

        {visibleError && (
          <div
            role="alert"
            className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm leading-relaxed"
          >
            {visibleError}
          </div>
        )}

        {infoMessage && (
          <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{infoMessage}</span>
          </div>
        )}

        {!firebaseUser ? (
          <div className="space-y-5">
            {embeddedIOS ? (
              <div className="space-y-3">
                <a
                  href={standaloneAuthUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-12 inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#0B172A] hover:bg-[#13233E] text-white text-sm font-semibold transition-colors"
                >
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                  <span>فتح صفحة الدخول في Safari المباشر</span>
                </a>
                <p className="text-xs text-slate-600 leading-relaxed text-center">
                  أنت تتصفح التطبيق حالياً داخل نافذة معاينة مدمجة على الآيفون.
                  اضغط الزر أعلاه لفتح الصفحة مباشرة في Safari وإتمام الدخول
                  عبر Google بسلاسة.
                </p>
              </div>
            ) : (
              <button
                type="button"
                disabled={signingIn}
                onClick={() => void handleGoogleLogin()}
                className="w-full h-12 inline-flex items-center justify-center gap-3 rounded-xl bg-[#0B172A] hover:bg-[#13233E] disabled:opacity-65 text-white text-sm font-semibold transition-colors"
              >
                {signingIn && !showEmailForm ? (
                  <>
                    <Loader2
                      className="w-4 h-4 animate-spin"
                      aria-hidden="true"
                    />
                    <span>جارٍ التحويل إلى حساب Google...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" aria-hidden="true" />
                    <span>المتابعة بحساب Google</span>
                  </>
                )}
              </button>
            )}

            {/* Collapsible Email / Password Option */}
            <div className="border-t border-slate-200 pt-4 space-y-4">
              <button
                type="button"
                onClick={() => {
                  setShowEmailForm((prev) => !prev);
                  setError('');
                }}
                className="w-full h-11 rounded-xl border border-slate-200 hover:bg-slate-50 text-[#0B172A] text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <KeyRound className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                <span>
                  {showEmailForm
                    ? 'إخفاء خيار البريد الإلكتروني وكلمة المرور'
                    : 'الدخول أو التسجيل بالبريد الإلكتروني وكلمة المرور'}
                </span>
              </button>

              {showEmailForm && (
                <form
                  onSubmit={handleEmailAuthSubmit}
                  className="space-y-4 pt-1"
                >
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setEmailMode('login');
                        setError('');
                      }}
                      className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
                        emailMode === 'login'
                          ? 'bg-white text-[#0B172A] shadow-sm'
                          : 'text-slate-600 hover:text-[#0B172A]'
                      }`}
                    >
                      تسجيل الدخول
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmailMode('register');
                        setError('');
                      }}
                      className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
                        emailMode === 'register'
                          ? 'bg-white text-[#0B172A] shadow-sm'
                          : 'text-slate-600 hover:text-[#0B172A]'
                      }`}
                    >
                      حساب جديد
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmailMode('reset');
                        setError('');
                      }}
                      className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
                        emailMode === 'reset'
                          ? 'bg-white text-[#0B172A] shadow-sm'
                          : 'text-slate-600 hover:text-[#0B172A]'
                      }`}
                    >
                      نسيت كلمة المرور
                    </button>
                  </div>

                  {emailMode === 'register' && (
                    <div>
                      <label
                        htmlFor="auth-email-name"
                        className="block text-xs font-semibold text-[#0B172A] mb-1"
                      >
                        الاسم الكامل
                      </label>
                      <input
                        id="auth-email-name"
                        type="text"
                        required
                        value={emailNameInput}
                        onChange={(e) => setEmailNameInput(e.target.value)}
                        placeholder="مثال: سارة محمد"
                        className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="auth-email-addr"
                      className="block text-xs font-semibold text-[#0B172A] mb-1"
                    >
                      البريد الإلكتروني
                    </label>
                    <input
                      id="auth-email-addr"
                      type="email"
                      dir="ltr"
                      required
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm text-left focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>

                  {emailMode !== 'reset' && (
                    <div>
                      <label
                        htmlFor="auth-email-pass"
                        className="block text-xs font-semibold text-[#0B172A] mb-1"
                      >
                        كلمة المرور
                      </label>
                      <input
                        id="auth-email-pass"
                        type="password"
                        dir="ltr"
                        required
                        minLength={6}
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder="••••••••"
                        className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm text-left focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                  )}

                  {emailMode === 'register' && (
                    <div>
                      <label
                        htmlFor="auth-email-confirm"
                        className="block text-xs font-semibold text-[#0B172A] mb-1"
                      >
                        تأكيد كلمة المرور
                      </label>
                      <input
                        id="auth-email-confirm"
                        type="password"
                        dir="ltr"
                        required
                        minLength={6}
                        value={confirmPasswordInput}
                        onChange={(e) => setConfirmPasswordInput(e.target.value)}
                        placeholder="••••••••"
                        className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm text-left focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || signingIn}
                    className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
                  >
                    {submitting
                      ? 'جارٍ المعالجة...'
                      : emailMode === 'login'
                      ? 'تسجيل الدخول'
                      : emailMode === 'register'
                      ? 'إنشاء الحساب وإرسال رابط التفعيل'
                      : 'إرسال رابط استعادة كلمة المرور'}
                  </button>
                </form>
              )}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3 text-xs text-slate-600 leading-relaxed">
              <ShieldCheck
                className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>
                يُنشئ النظام حسابك كـ «عميل» أو «مقدّم خدمة» فقط. صلاحيات
                الإدارة محمية ومقصورة على المشرفين المخوّلين ولا يمكن اختيارها
                ذاتياً.
              </span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleOnboardingSubmit} className="space-y-5">
            <div>
              <span className="block text-sm font-semibold text-[#0B172A] mb-2">
                نوع الحساب
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('customer')}
                  className={`p-4 rounded-xl border text-right transition-colors ${
                    role === 'customer'
                      ? 'border-emerald-600 bg-emerald-50/60 text-[#0B172A]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold text-sm mb-1">
                    <UserCheck
                      className="w-4 h-4 text-emerald-700"
                      aria-hidden="true"
                    />
                    <span>عميل (صاحب منزل)</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    إرسال طلبات خدمة ومتابعة تنفيذها وتقييم الفنيين.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('provider')}
                  className={`p-4 rounded-xl border text-right transition-colors ${
                    role === 'provider'
                      ? 'border-emerald-600 bg-emerald-50/60 text-[#0B172A]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold text-sm mb-1">
                    <Wrench
                      className="w-4 h-4 text-emerald-700"
                      aria-hidden="true"
                    />
                    <span>مقدّم خدمة (فني)</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    استقبال الأعمال المسندة بعد مراجعة الإدارة واعتماد الحساب.
                  </p>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="onb-name"
                  className="block text-xs font-semibold text-[#0B172A] mb-1.5"
                >
                  الاسم الكامل
                </label>
                <input
                  id="onb-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={firebaseUser.displayName || 'مثال: أحمد علي'}
                  className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label
                  htmlFor="onb-phone"
                  className="block text-xs font-semibold text-[#0B172A] mb-1.5"
                >
                  رقم الهاتف العراقي
                </label>
                <input
                  id="onb-phone"
                  type="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0750 123 4567"
                  className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm text-left font-mono-tabular focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label
                  htmlFor="onb-city"
                  className="block text-xs font-semibold text-[#0B172A] mb-1.5"
                >
                  المدينة
                </label>
                <select
                  id="onb-city"
                  value={city}
                  onChange={(e) => {
                    const c = e.target.value;
                    setCity(c);
                    setNeighborhood(getNeighborhoodsByCity(c)[0] ?? '');
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
                  htmlFor="onb-hood"
                  className="block text-xs font-semibold text-[#0B172A] mb-1.5"
                >
                  الحي السكني
                </label>
                <select
                  id="onb-hood"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
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

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
            >
              {submitting ? 'جارٍ حفظ الحساب...' : 'حفظ ومتابعة'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
