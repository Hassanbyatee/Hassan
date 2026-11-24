import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  getRedirectResult,
  indexedDBLocalPersistence,
  onAuthStateChanged,
  PhoneAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reauthenticateWithRedirect,
  RecaptchaVerifier,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updatePassword,
  updatePhoneNumber,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, BOOTSTRAP_ADMIN_EMAIL, db, googleProvider } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import {
  AppPage,
  AppUser,
  NotificationPreferences,
  SavedAddress,
} from '../types/marketplace';
import { normalizeIraqiPhone, toIraqiE164 } from '../utils/format';

export const PENDING_AUTH_PAGE_KEY = 'khidmati_pending_auth_page';
const REDIRECT_IN_PROGRESS_KEY = 'khidmati_auth_redirect_pending';

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  requestUpdates: true,
  providerMessages: true,
  promotions: false,
  emailNotifications: true,
};

export function isInIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIPadOS =
    navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod|CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) || isIPadOS;
}

export function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /Safari/i.test(ua) &&
    !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPR|Edg/i.test(ua)
  );
}

export function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android|Mobile|iPhone|iPad|iPod/i.test(ua) || isIOSDevice();
}

export function shouldPreferRedirectFlow(): boolean {
  return isIOSDevice() || isSafariBrowser() || isMobileBrowser();
}

async function ensureLocalPersistence(): Promise<void> {
  await setPersistence(auth, browserLocalPersistence).catch(() =>
    setPersistence(auth, indexedDBLocalPersistence).catch(() =>
      setPersistence(auth, browserSessionPersistence)
    )
  );
}

// Single-flight module promise guarantees getRedirectResult(auth) executes at most once per page load
let redirectResultOncePromise: Promise<{
  user: FirebaseUser | null;
  error: unknown | null;
}> | null = null;

function processRedirectResultOnce() {
  if (!redirectResultOncePromise) {
    redirectOncePromiseCleanupSafe();
  }
  return redirectResultOncePromise!;
}

function redirectOncePromiseCleanupSafe() {
  const timeoutPromise = new Promise<{
    user: FirebaseUser | null;
    error: unknown | null;
  }>((resolve) => {
    setTimeout(() => resolve({ user: null, error: null }), 10000);
  });

  const workPromise = (async () => {
    try {
      await ensureLocalPersistence();
      const result = await getRedirectResult(auth);
      return { user: result?.user ?? null, error: null };
    } catch (err) {
      return { user: null, error: err };
    } finally {
      try {
        sessionStorage.removeItem(REDIRECT_IN_PROGRESS_KEY);
      } catch {
        // Ignore storage restrictions
      }
    }
  })();

  redirectResultOncePromise = Promise.race([workPromise, timeoutPromise]);
}

export function translateFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

  switch (code) {
    case 'auth/popup-blocked':
      return 'تم حظر نافذة تسجيل الدخول المنبثقة. يرجى فتح الموقع مباشرة في متصفح Safari لإكمال الدخول.';
    case 'auth/popup-closed-by-user':
      return 'تم إغلاق نافذة تسجيل الدخول قبل إكمال اختيار حساب Google. إذا كنت تستخدم Safari على الآيفون، افتح الرابط مباشرة في Safari.';
    case 'auth/cancelled-popup-request':
      return 'تم إلغاء نافذة تسجيل الدخول السابقة، يرجى المحاولة مجدداً.';
    case 'auth/unauthorized-domain':
      return 'نطاق الموقع الحالي غير مضاف إلى النطاقات المصرح بها في إعدادات Firebase Authentication.';
    case 'auth/operation-not-allowed':
      return 'طريقة تسجيل الدخول أو التحقق هذه غير مفعّلة حالياً في إعدادات Firebase Authentication.';
    case 'auth/operation-not-supported-in-this-environment':
      return 'المتصفح المدمج لا يدعم هذا النوع من تسجيل الدخول. يرجى فتح رابط التطبيق مباشرة في Safari.';
    case 'auth/network-request-failed':
      return 'تعذّر الاتصال بخوادم Google. تحقق من اتصال الإنترنت وحاول مرة أخرى.';
    case 'auth/user-disabled':
      return 'تم تعطيل هذا الحساب من قِبل الإدارة.';
    case 'auth/web-storage-unsupported':
    case 'auth/missing-initial-state':
      return 'متصفح Safari يمنع حفظ بيانات الجلسة مؤقتاً (مثل التصفح الخاص أو حظر ملفات الارتباط). افتح الرابط في Safari العادي وتأكد من تفعيل حفظ البيانات ثم أعد المحاولة.';
    case 'auth/invalid-api-key':
      return 'مفتاح تهيئة Firebase غير صالح. يرجى مراجعة إعدادات المشروع.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
    case 'auth/user-not-found':
      return 'لا يوجد حساب مسجل بهذا البريد الإلكتروني.';
    case 'auth/email-already-in-use':
      return 'هذا البريد الإلكتروني مسجل مسبقاً. يرجى تسجيل الدخول به.';
    case 'auth/weak-password':
      return 'كلمة المرور ضعيفة؛ يرجى اختيار كلمة مرور من 6 أحرف على الأقل.';
    case 'auth/invalid-email':
      return 'صيغة البريد الإلكتروني غير صحيحة.';
    case 'auth/requires-recent-login':
      return 'لأسباب أمنية، يجب إعادة تأكيد هويتك حديثاً قبل تنفيذ هذا الإجراء.';
    case 'auth/invalid-verification-code':
      return 'رمز التحقق (OTP) غير صحيح، يرجى التأكد من الرمز المرسل إلى هاتفك.';
    case 'auth/code-expired':
      return 'انتهت صلاحية رمز التحقق (OTP). يرجى طلب رمز جديد.';
    case 'auth/too-many-requests':
      return 'تم إرسال محاولات كثيرة خلال وقت قصير. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.';
    case 'auth/captcha-check-failed':
      return 'تعذّر التحقق من اختبار الأمان (reCAPTCHA). حدّث الصفحة وحاول مرة أخرى.';
    case 'auth/credential-already-in-use':
      return 'رقم الهاتف هذا مرتبط مسبقاً بحساب آخر في خدمتي.';
    case 'auth/billing-not-enabled':
      return 'إرسال رسائل SMS يتطلب تفعيل خدمة الهاتف في مشروع Firebase.';
    default:
      if (error instanceof Error && error.message) {
        return code
          ? `تعذّر إتمام العملية (${code}). يرجى المحاولة مرة أخرى.`
          : error.message;
      }
      return 'تعذّر إتمام العملية الأمنية. يرجى المحاولة مرة أخرى.';
  }
}

export interface UpdateUserProfilePayload {
  displayName?: string;
  phone?: string;
  city?: string;
  neighborhood?: string;
  photoUrl?: string;
  savedAddresses?: SavedAddress[];
  notificationPreferences?: NotificationPreferences;
}

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  userProfile: AppUser | null;
  isAdmin: boolean;
  hasProviderProfile: boolean;
  markProviderProfileCreated: () => void;
  authLoading: boolean;
  signingIn: boolean;
  redirectInProgress: boolean;
  authError: string;
  clearAuthError: () => void;
  needsOnboarding: boolean;
  signInWithGoogle: (returnPage?: AppPage) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendEmailVerification: () => Promise<void>;
  reloadAuthUser: () => Promise<boolean>;
  signOutUser: () => Promise<void>;
  completeOnboarding: (payload: {
    role: 'customer' | 'provider';
    displayName: string;
    phone: string;
    city: string;
    neighborhood: string;
  }) => Promise<AppUser>;
  updateUserProfile: (payload: UpdateUserProfilePayload) => Promise<void>;
  verifyRecentAuthOnServer: () => Promise<{
    verified: boolean;
    requiresRecentAuth?: boolean;
    error?: string;
  }>;
  reauthenticateWithGoogle: (returnPage?: AppPage) => Promise<void>;
  reauthenticateWithPassword: (password: string) => Promise<void>;
  changeAccountPassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<void>;
  sendPhoneVerificationOtp: (
    iraqiPhone: string,
    recaptchaContainerId: string
  ) => Promise<string>;
  confirmPhoneVerificationOtp: (
    verificationId: string,
    otpCode: string,
    iraqiPhone: string
  ) => Promise<void>;
  deleteCustomerAccountSecurely: (reason: string) => Promise<void>;
  getIdToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<AppUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasProviderProfile, setHasProviderProfile] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [redirectInProgress, setRedirectInProgress] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(REDIRECT_IN_PROGRESS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [authError, setAuthError] = useState('');
  const loadingUidRef = useRef<string | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  const loadUserRecord = async (fbUser: FirebaseUser, forceReload = false) => {
    if (!forceReload && loadingUidRef.current === fbUser.uid) {
      return;
    }
    loadingUidRef.current = fbUser.uid;

    try {
      const isBootAdmin = Boolean(
        fbUser.emailVerified && fbUser.email === BOOTSTRAP_ADMIN_EMAIL
      );

      let hasAdminDoc = false;
      try {
        const adminSnap = await getDoc(doc(db, 'admins', fbUser.uid));
        hasAdminDoc = adminSnap.exists();
      } catch {
        hasAdminDoc = false;
      }

      const adminFlag = isBootAdmin || hasAdminDoc;
      setIsAdmin(adminFlag);

      const providerIds = fbUser.providerData
        .map((p) => p.providerId)
        .filter(Boolean);
      const now = new Date().toISOString();

      const userRef = doc(db, 'users', fbUser.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const existingData = userSnap.data() as AppUser;
        const mergedProfile: AppUser = {
          ...existingData,
          authProviders:
            providerIds.length > 0 ? providerIds : existingData.authProviders,
          lastLoginAt: now,
        };
        setUserProfile(mergedProfile);

        // Non-blocking audit update of lastLoginAt & authProviders when email is verified
        if (fbUser.emailVerified) {
          void updateDoc(userRef, {
            lastLoginAt: now,
            authProviders: providerIds,
            updatedAt: now,
          }).catch(() => {});
        }
      } else if (adminFlag) {
        const adminUser: AppUser = {
          uid: fbUser.uid,
          displayName: fbUser.displayName || 'مشرف المنصة',
          email: fbUser.email || '',
          role: 'admin',
          city: 'أربيل',
          neighborhood: 'عنكاوا',
          authProviders: providerIds,
          isSuspended: false,
          lastLoginAt: now,
          createdAt: now,
          updatedAt: now,
        };
        await setDoc(userRef, adminUser);
        setUserProfile(adminUser);
      } else {
        setUserProfile(null);
      }

      try {
        const provSnap = await getDoc(doc(db, 'providers', fbUser.uid));
        setHasProviderProfile(provSnap.exists());
      } catch {
        setHasProviderProfile(false);
      }
    } catch (err) {
      console.error('Auth state load warning:', err);
      setAuthError(
        'تم تسجيل الدخول لكن تعذّر تحميل بيانات الحساب من قاعدة البيانات. يرجى تحديث الصفحة.'
      );
    } finally {
      setAuthLoading(false);
      setSigningIn(false);
      setRedirectInProgress(false);
    }
  };

  useEffect(() => {
    let active = true;
    let redirectChecked = false;

    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      if (!active) return;
      setFirebaseUser(fbUser);

      if (!fbUser) {
        loadingUidRef.current = null;
        setUserProfile(null);
        setIsAdmin(false);
        setHasProviderProfile(false);
        if (redirectChecked) {
          setAuthLoading(false);
          setSigningIn(false);
          setRedirectInProgress(false);
        }
        return;
      }

      void loadUserRecord(fbUser);
    });

    const finalizeRedirectAndSession = async () => {
      const outcome = await processRedirectResultOnce();
      if (!active) return;

      if (outcome.user) {
        setAuthError('');
        setFirebaseUser(outcome.user);
        await loadUserRecord(outcome.user);
      } else if (outcome.error) {
        const code =
          typeof outcome.error === 'object' &&
          outcome.error !== null &&
          'code' in outcome.error
            ? String((outcome.error as { code?: unknown }).code ?? '')
            : '';

        if (
          code !== 'auth/popup-closed-by-user' &&
          code !== 'auth/cancelled-popup-request'
        ) {
          setAuthError(translateFirebaseAuthError(outcome.error));
        }
      }

      try {
        await auth.authStateReady();
      } catch {
        // Listener handles final state
      }

      redirectChecked = true;
      if (active) {
        setRedirectInProgress(false);
        if (!auth.currentUser && !outcome.user) {
          setAuthLoading(false);
          setSigningIn(false);
        }
      }
    };

    void finalizeRedirectAndSession();

    return () => {
      active = false;
      unsubscribe();
      if (recaptchaRef.current) {
        try {
          recaptchaRef.current.clear();
        } catch {
          // Ignore cleanup errors
        }
        recaptchaRef.current = null;
      }
    };
  }, []);

  const triggerRedirectFlow = async (returnPage?: AppPage): Promise<void> => {
    try {
      if (returnPage) {
        sessionStorage.setItem(PENDING_AUTH_PAGE_KEY, returnPage);
      }
      sessionStorage.setItem(REDIRECT_IN_PROGRESS_KEY, '1');
    } catch {
      // Ignore storage failures
    }
    setRedirectInProgress(true);
    await ensureLocalPersistence();
    await signInWithRedirect(auth, googleProvider);
  };

  const signInWithGoogle = async (returnPage?: AppPage): Promise<void> => {
    if (redirectInProgress) {
      return;
    }

    setAuthError('');
    setSigningIn(true);

    try {
      await ensureLocalPersistence();
      const inFrame = isInIframe();
      const preferRedirect = shouldPreferRedirectFlow();

      if (!inFrame && preferRedirect) {
        await triggerRedirectFlow(returnPage);
        return;
      }

      if (inFrame && isIOSDevice()) {
        throw new Error(
          'لإتمام تسجيل الدخول بحساب Google على الآيفون بنجاح، يرجى فتح التطبيق مباشرة في متصفح Safari عبر الزر أدناه.'
        );
      }

      try {
        await signInWithPopup(auth, googleProvider);
        setSigningIn(false);
      } catch (popupErr) {
        const code =
          typeof popupErr === 'object' && popupErr !== null && 'code' in popupErr
            ? String((popupErr as { code?: unknown }).code ?? '')
            : '';

        if (
          !inFrame &&
          (code === 'auth/popup-blocked' ||
            code === 'auth/operation-not-supported-in-this-environment' ||
            code === 'auth/popup-closed-by-user')
        ) {
          await triggerRedirectFlow(returnPage);
          return;
        }
        throw popupErr;
      }
    } catch (err) {
      try {
        sessionStorage.removeItem(REDIRECT_IN_PROGRESS_KEY);
      } catch {
        // Ignore
      }
      setRedirectInProgress(false);
      const msg = translateFirebaseAuthError(err);
      setAuthError(msg);
      setSigningIn(false);
      throw new Error(msg);
    }
  };

  const signInWithEmail = async (
    email: string,
    password: string
  ): Promise<void> => {
    setAuthError('');
    setSigningIn(true);
    try {
      await ensureLocalPersistence();
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      const msg = translateFirebaseAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      setSigningIn(false);
    }
  };

  const registerWithEmail = async (
    email: string,
    password: string,
    displayName: string
  ): Promise<void> => {
    setAuthError('');
    setSigningIn(true);
    try {
      await ensureLocalPersistence();
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      if (displayName.trim()) {
        await updateProfile(cred.user, { displayName: displayName.trim() });
      }
      await sendEmailVerification(cred.user).catch(() => {});
    } catch (err) {
      const msg = translateFirebaseAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      setSigningIn(false);
    }
  };

  const sendPasswordReset = async (email: string): Promise<void> => {
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err) {
      throw new Error(translateFirebaseAuthError(err));
    }
  };

  const resendEmailVerification = async (): Promise<void> => {
    if (!auth.currentUser) {
      throw new Error('يجب تسجيل الدخول أولاً.');
    }
    try {
      await sendEmailVerification(auth.currentUser);
    } catch (err) {
      throw new Error(translateFirebaseAuthError(err));
    }
  };

  const reloadAuthUser = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    setFirebaseUser(auth.currentUser);
    if (auth.currentUser.emailVerified) {
      await loadUserRecord(auth.currentUser, true);
    }
    return auth.currentUser.emailVerified;
  };

  const signOutUser = async (): Promise<void> => {
    try {
      sessionStorage.removeItem(REDIRECT_IN_PROGRESS_KEY);
      sessionStorage.removeItem(PENDING_AUTH_PAGE_KEY);
    } catch {
      // Ignore
    }
    loadingUidRef.current = null;
    await signOut(auth);
    setUserProfile(null);
    setIsAdmin(false);
    setHasProviderProfile(false);
    setAuthError('');
    setRedirectInProgress(false);
  };

  const completeOnboarding = async (payload: {
    role: 'customer' | 'provider';
    displayName: string;
    phone: string;
    city: string;
    neighborhood: string;
  }): Promise<AppUser> => {
    if (!firebaseUser) {
      throw new Error('يجب تسجيل الدخول أولاً.');
    }
    if (!firebaseUser.emailVerified) {
      throw new Error('يرجى تفعيل بريدك الإلكتروني أولاً عبر الرابط المرسل إليك.');
    }
    const now = new Date().toISOString();
    const safeRole: 'customer' | 'provider' =
      payload.role === 'provider' ? 'provider' : 'customer';

    const providerIds = firebaseUser.providerData
      .map((p) => p.providerId)
      .filter(Boolean);

    const normalizedPhone = normalizeIraqiPhone(payload.phone);
    const defaultAddress: SavedAddress = {
      id: `addr_${Date.now().toString(36)}`,
      label: 'العنوان الرئيسي',
      city: payload.city.trim(),
      neighborhood: payload.neighborhood.trim(),
      streetDetails: `${payload.city.trim()} — ${payload.neighborhood.trim()}`,
      isDefault: true,
    };

    const profile: AppUser = {
      uid: firebaseUser.uid,
      displayName: payload.displayName.trim().slice(0, 100),
      email: firebaseUser.email || '',
      phone: normalizedPhone,
      phoneVerified: Boolean(firebaseUser.phoneNumber),
      ...(firebaseUser.photoURL && !firebaseUser.photoURL.startsWith('data:')
        ? { photoUrl: firebaseUser.photoURL.slice(0, 2000) }
        : {}),
      authProviders: providerIds,
      role: safeRole,
      city: payload.city.trim(),
      neighborhood: payload.neighborhood.trim(),
      savedAddresses: [defaultAddress],
      notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
      isSuspended: false,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const path = `users/${firebaseUser.uid}`;
    try {
      await setDoc(doc(db, 'users', firebaseUser.uid), profile);
      setUserProfile(profile);
      return profile;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const updateUserProfile = async (
    payload: UpdateUserProfilePayload
  ): Promise<void> => {
    if (!firebaseUser || !userProfile) {
      throw new Error('يجب تسجيل الدخول أولاً.');
    }
    const updatedAt = new Date().toISOString();
    const nextDisplayName = (payload.displayName ?? userProfile.displayName)
      .trim()
      .slice(0, 100);
    const nextPhone = payload.phone !== undefined
      ? normalizeIraqiPhone(payload.phone)
      : userProfile.phone ?? '';
    const nextCity = (payload.city ?? userProfile.city ?? 'أربيل').trim();
    const nextNeighborhood = (
      payload.neighborhood ??
      userProfile.neighborhood ??
      'عنكاوا'
    ).trim();

    const phoneChanged =
      payload.phone !== undefined &&
      nextPhone !== normalizeIraqiPhone(userProfile.phone ?? '');

    const updates: Partial<AppUser> & { updatedAt: string } = {
      displayName: nextDisplayName,
      phone: nextPhone,
      city: nextCity,
      neighborhood: nextNeighborhood,
      updatedAt,
    };

    if (phoneChanged) {
      updates.phoneVerified = false;
    }
    if (payload.photoUrl !== undefined) {
      updates.photoUrl = payload.photoUrl.slice(0, 195000);
    }
    if (payload.savedAddresses !== undefined) {
      updates.savedAddresses = payload.savedAddresses.slice(0, 10);
    }
    if (payload.notificationPreferences !== undefined) {
      updates.notificationPreferences = payload.notificationPreferences;
    }

    const path = `users/${firebaseUser.uid}`;
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), updates);
      setUserProfile({ ...userProfile, ...updates });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const getIdToken = async (forceRefresh = false): Promise<string> => {
    if (!auth.currentUser) {
      throw new Error('جلسة تسجيل الدخول غير متوفرة.');
    }
    return auth.currentUser.getIdToken(forceRefresh);
  };

  const verifyRecentAuthOnServer = async (): Promise<{
    verified: boolean;
    requiresRecentAuth?: boolean;
    error?: string;
  }> => {
    const token = await getIdToken(true);
    const res = await fetch('/api/auth/verify-recent-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    const json = (await res.json()) as {
      verified?: boolean;
      requiresRecentAuth?: boolean;
      error?: string;
    };
    if (!res.ok) {
      return {
        verified: false,
        requiresRecentAuth: json.requiresRecentAuth ?? true,
        error: json.error,
      };
    }
    return { verified: Boolean(json.verified) };
  };

  const reauthenticateWithGoogle = async (returnPage?: AppPage): Promise<void> => {
    if (!auth.currentUser) {
      throw new Error('يجب تسجيل الدخول أولاً.');
    }
    try {
      await ensureLocalPersistence();
      const inFrame = isInIframe();
      if (!inFrame && shouldPreferRedirectFlow()) {
        if (returnPage) {
          sessionStorage.setItem(PENDING_AUTH_PAGE_KEY, returnPage);
        }
        sessionStorage.setItem(REDIRECT_IN_PROGRESS_KEY, '1');
        await reauthenticateWithRedirect(auth.currentUser, googleProvider);
        return;
      }
      await reauthenticateWithPopup(auth.currentUser, googleProvider);
      await auth.currentUser.getIdToken(true);
    } catch (err) {
      throw new Error(translateFirebaseAuthError(err));
    }
  };

  const reauthenticateWithPassword = async (password: string): Promise<void> => {
    if (!auth.currentUser || !auth.currentUser.email) {
      throw new Error('لا يتوفر حساب بريد إلكتروني وكلمة مرور لإعادة التحقق.');
    }
    try {
      const cred = EmailAuthProvider.credential(auth.currentUser.email, password);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await auth.currentUser.getIdToken(true);
    } catch (err) {
      throw new Error(translateFirebaseAuthError(err));
    }
  };

  const changeAccountPassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<void> => {
    if (!auth.currentUser || !auth.currentUser.email) {
      throw new Error('حسابك مسجل عبر Google ولا يستخدم كلمة مرور محلية.');
    }
    try {
      const cred = EmailAuthProvider.credential(
        auth.currentUser.email,
        currentPassword
      );
      await reauthenticateWithCredential(auth.currentUser, cred);
      await updatePassword(auth.currentUser, newPassword);
    } catch (err) {
      throw new Error(translateFirebaseAuthError(err));
    }
  };

  const sendPhoneVerificationOtp = async (
    iraqiPhone: string,
    recaptchaContainerId: string
  ): Promise<string> => {
    if (!auth.currentUser) {
      throw new Error('يجب تسجيل الدخول أولاً.');
    }
    const e164 = toIraqiE164(iraqiPhone);
    try {
      if (recaptchaRef.current) {
        try {
          recaptchaRef.current.clear();
        } catch {
          // Ignore old verifier cleanup
        }
        recaptchaRef.current = null;
      }

      const container = document.getElementById(recaptchaContainerId);
      if (container) {
        container.innerHTML = '';
      }

      const verifier = new RecaptchaVerifier(auth, recaptchaContainerId, {
        size: 'normal',
      });
      recaptchaRef.current = verifier;
      await verifier.render();

      const phoneProvider = new PhoneAuthProvider(auth);
      const verificationId = await phoneProvider.verifyPhoneNumber(
        e164,
        verifier
      );
      return verificationId;
    } catch (err) {
      throw new Error(translateFirebaseAuthError(err));
    }
  };

  const confirmPhoneVerificationOtp = async (
    verificationId: string,
    otpCode: string,
    iraqiPhone: string
  ): Promise<void> => {
    if (!auth.currentUser || !userProfile) {
      throw new Error('يجب تسجيل الدخول أولاً.');
    }
    const normalizedPhone = normalizeIraqiPhone(iraqiPhone);
    const e164 = toIraqiE164(normalizedPhone);

    try {
      const cred = PhoneAuthProvider.credential(verificationId, otpCode.trim());
      await updatePhoneNumber(auth.currentUser, cred);
      const freshToken = await auth.currentUser.getIdToken(true);

      // Verify server-side that phone_number claim exists in Firebase Auth token
      const verifyRes = await fetch('/api/customer/verify-phone-claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`,
        },
        body: JSON.stringify({ expectedE164: e164 }),
      });
      const verifyJson = (await verifyRes.json()) as {
        verified?: boolean;
        verifiedAt?: string;
        error?: string;
      };
      if (!verifyRes.ok || !verifyJson.verified) {
        throw new Error(
          verifyJson.error || 'تعذّر تأكيد رقم الهاتف على الخادم.'
        );
      }

      const now = verifyJson.verifiedAt || new Date().toISOString();
      const providerIds = auth.currentUser.providerData
        .map((p) => p.providerId)
        .filter(Boolean);

      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        phone: normalizedPhone,
        phoneVerified: true,
        phoneVerifiedAt: now,
        authProviders: providerIds,
        updatedAt: now,
      });

      setFirebaseUser(auth.currentUser);
      setUserProfile({
        ...userProfile,
        phone: normalizedPhone,
        phoneVerified: true,
        phoneVerifiedAt: now,
        authProviders: providerIds,
        updatedAt: now,
      });
    } catch (err) {
      throw new Error(translateFirebaseAuthError(err));
    } finally {
      if (recaptchaRef.current) {
        try {
          recaptchaRef.current.clear();
        } catch {
          // Ignore
        }
        recaptchaRef.current = null;
      }
    }
  };

  const deleteCustomerAccountSecurely = async (reason: string): Promise<void> => {
    if (!auth.currentUser || !userProfile) {
      throw new Error('يجب تسجيل الدخول أولاً.');
    }
    const current = auth.currentUser;
    const token = await current.getIdToken(true);

    const authRes = await fetch('/api/customer/authorize-deletion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    const authJson = (await authRes.json()) as {
      authorized?: boolean;
      error?: string;
    };
    if (!authRes.ok || !authJson.authorized) {
      throw new Error(
        authJson.error || 'يتطلب حذف الحساب إعادة تأكيد الهوية أولاً.'
      );
    }

    const now = new Date().toISOString();
    const reqId = `del_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    try {
      await setDoc(doc(db, 'accountDeletionRequests', reqId), {
        id: reqId,
        uid: current.uid,
        customerName: userProfile.displayName,
        customerEmail: userProfile.email,
        ...(userProfile.phone ? { customerPhone: userProfile.phone } : {}),
        ...(reason.trim() ? { reason: reason.trim().slice(0, 600) } : {}),
        status: 'completed',
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      await setDoc(
        doc(db, 'notifications', `notif_${Date.now().toString(36)}_del`),
        {
          id: `notif_${Date.now().toString(36)}_del`,
          recipientRole: 'admin',
          recipientUid: 'admin',
          type: 'account_deletion',
          titleAr: 'تم حذف حساب عميل',
          messageAr: `قام العميل ${userProfile.displayName} (${userProfile.email}) بحذف حسابه نهائياً بعد إعادة التحقق.`,
          relatedId: reqId,
          isRead: false,
          emailQueued: true,
          createdAt: now,
        }
      ).catch(() => {});

      await deleteDoc(doc(db, 'users', current.uid));
      await deleteUser(current);

      loadingUidRef.current = null;
      setUserProfile(null);
      setIsAdmin(false);
      setHasProviderProfile(false);
      setAuthError('');
    } catch (err) {
      throw new Error(translateFirebaseAuthError(err));
    }
  };

  const needsOnboarding = Boolean(
    firebaseUser &&
      firebaseUser.emailVerified &&
      !authLoading &&
      !userProfile &&
      !isAdmin
  );

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userProfile,
        isAdmin,
        hasProviderProfile,
        markProviderProfileCreated: () => setHasProviderProfile(true),
        authLoading,
        signingIn,
        redirectInProgress,
        authError,
        clearAuthError: () => setAuthError(''),
        needsOnboarding,
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        sendPasswordReset,
        resendEmailVerification,
        reloadAuthUser,
        signOutUser,
        completeOnboarding,
        updateUserProfile,
        verifyRecentAuthOnServer,
        reauthenticateWithGoogle,
        reauthenticateWithPassword,
        changeAccountPassword,
        sendPhoneVerificationOtp,
        confirmPhoneVerificationOtp,
        deleteCustomerAccountSecurely,
        getIdToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
