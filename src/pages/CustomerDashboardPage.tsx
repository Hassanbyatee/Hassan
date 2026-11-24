import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  Eye,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  PhoneCall,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  useAuth,
} from '../context/AuthContext';
import { getNeighborhoodsByCity, IRAQ_LOCATIONS } from '../data/locations';
import {
  customerCancelRequest,
  customerDisputeRequest,
  fetchApprovedProviderContact,
  markNotificationRead,
  submitAccountDeletionRequest,
  submitComplaint,
  submitCustomerReview,
  subscribeCustomerComplaints,
  subscribeCustomerDeletionRequests,
  subscribeCustomerNotifications,
  subscribeCustomerRequests,
  subscribeCustomerReviews,
} from '../firebase/marketplaceApi';
import {
  AccountDeletionRequest,
  AppPage,
  CustomerReview,
  NotificationItem,
  NotificationPreferences,
  ProviderReport,
  SavedAddress,
  ServiceRequest,
} from '../types/marketplace';
import {
  buildWhatsAppLink,
  formatArabicDate,
  formatIQD,
  formatPhoneDisplay,
  isValidIraqiPhone,
  normalizeIraqiPhone,
  REQUEST_STATUS_META,
} from '../utils/format';

interface CustomerDashboardPageProps {
  onNavigate: (page: AppPage) => void;
}

type CustomerTab =
  | 'active'
  | 'history'
  | 'profile'
  | 'addresses'
  | 'support'
  | 'security';

async function compressAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذّر قراءة ملف الصورة.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('تنسيق الصورة غير مدعوم.'));
      img.onload = () => {
        const maxDim = 256;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('تعذّر معالجة الصورة في المتصفح.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        if (dataUrl.length > 180000) {
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        } else {
          resolve(dataUrl);
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function getCustomerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'ع';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[1][0]}`;
}

export function CustomerDashboardPage({
  onNavigate,
}: CustomerDashboardPageProps) {
  const {
    firebaseUser,
    userProfile,
    signOutUser,
    updateUserProfile,
    verifyRecentAuthOnServer,
    reauthenticateWithGoogle,
    reauthenticateWithPassword,
    changeAccountPassword,
    sendPhoneVerificationOtp,
    confirmPhoneVerificationOtp,
    deleteCustomerAccountSecurely,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<CustomerTab>('active');
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [complaints, setComplaints] = useState<ProviderReport[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<
    AccountDeletionRequest[]
  >([]);

  const [actionMsg, setActionMsg] = useState('');
  const [actionErr, setActionErr] = useState('');

  // History filters & details modal
  const [historyFilter, setHistoryFilter] = useState<
    'all' | 'Completed' | 'Cancelled' | 'Disputed' | 'active'
  >('all');
  const [historySearch, setHistorySearch] = useState('');
  const [detailRequest, setDetailRequest] = useState<ServiceRequest | null>(
    null
  );
  const [providerContact, setProviderContact] = useState<{
    id: string;
    fullName: string;
    phone: string;
    whatsapp?: string;
  } | null>(null);
  const [loadingContact, setLoadingContact] = useState(false);

  // Review & Dispute modals
  const [reviewTarget, setReviewTarget] = useState<ServiceRequest | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const [disputeTarget, setDisputeTarget] = useState<ServiceRequest | null>(
    null
  );
  const [disputeReason, setDisputeReason] = useState('');
  const [submittingDispute, setSubmittingDispute] = useState(false);

  // Profile form state
  const [displayName, setDisplayName] = useState(
    userProfile?.displayName ?? ''
  );
  const [city, setCity] = useState(userProfile?.city ?? 'أربيل');
  const [neighborhood, setNeighborhood] = useState(
    userProfile?.neighborhood ?? 'عنكاوا'
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Phone SMS OTP verification state
  const [phoneInput, setPhoneInput] = useState(userProfile?.phone ?? '');
  const [phoneStep, setPhoneStep] = useState<'idle' | 'ready' | 'otp_sent'>(
    'idle'
  );
  const [verificationId, setVerificationId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);

  // Saved addresses state
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addrLabel, setAddrLabel] = useState('المنزل');
  const [addrCity, setAddrCity] = useState('أربيل');
  const [addrNeighborhood, setAddrNeighborhood] = useState('عنكاوا');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrLandmark, setAddrLandmark] = useState('');
  const [addrIsDefault, setAddrIsDefault] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  // Support / Complaints state
  const [supportRequestId, setSupportRequestId] = useState('');
  const [supportReason, setSupportReason] = useState('');
  const [supportDetails, setSupportDetails] = useState('');
  const [supportPhone, setSupportPhone] = useState(userProfile?.phone ?? '');
  const [submittingSupport, setSubmittingSupport] = useState(false);

  // Security: Notification preferences, password change, deletion, re-auth modal
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(
    userProfile?.notificationPreferences ?? DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [savingNotifPrefs, setSavingNotifPrefs] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [deletionReason, setDeletionReason] = useState('');
  const [deletionConfirmText, setDeletionConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Re-authentication modal state
  const [reauthModalOpen, setReauthModalOpen] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthBusy, setReauthBusy] = useState(false);
  const [reauthPendingAction, setReauthPendingAction] = useState<
    'phone' | 'delete' | null
  >(null);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsubs = [
      subscribeCustomerRequests(firebaseUser.uid, setRequests),
      subscribeCustomerReviews(firebaseUser.uid, setReviews),
      subscribeCustomerComplaints(firebaseUser.uid, setComplaints),
      subscribeCustomerNotifications(firebaseUser.uid, setNotifications),
      subscribeCustomerDeletionRequests(
        firebaseUser.uid,
        setDeletionRequests
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [firebaseUser]);

  useEffect(() => {
    if (!userProfile) return;
    setDisplayName(userProfile.displayName);
    setCity(userProfile.city ?? 'أربيل');
    setNeighborhood(userProfile.neighborhood ?? 'عنكاوا');
    setPhoneInput(userProfile.phone ?? '');
    setSupportPhone((prev) => prev || userProfile.phone || '');
    setNotifPrefs(
      userProfile.notificationPreferences ?? DEFAULT_NOTIFICATION_PREFERENCES
    );
  }, [userProfile]);

  const hasPasswordProvider = Boolean(
    firebaseUser?.providerData.some((p) => p.providerId === 'password')
  );
  const hasGoogleProvider = Boolean(
    firebaseUser?.providerData.some((p) => p.providerId === 'google.com')
  );
  const isPhoneVerified = Boolean(
    userProfile?.phoneVerified || firebaseUser?.phoneNumber
  );

  const savedAddresses = userProfile?.savedAddresses ?? [];
  const activeRequests = useMemo(
    () =>
      requests.filter((r) =>
        ['Pending', 'Approved', 'Assigned', 'In Progress'].includes(r.status)
      ),
    [requests]
  );
  const completedRequests = useMemo(
    () => requests.filter((r) => r.status === 'Completed'),
    [requests]
  );
  const inProgressOrAssignedCount = useMemo(
    () =>
      requests.filter(
        (r) => r.status === 'Assigned' || r.status === 'In Progress'
      ).length,
    [requests]
  );
  const unreadNotifsCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return requests.filter((r) => {
      if (historyFilter === 'active') {
        if (
          !['Pending', 'Approved', 'Assigned', 'In Progress'].includes(r.status)
        ) {
          return false;
        }
      } else if (historyFilter !== 'all' && r.status !== historyFilter) {
        return false;
      }
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        r.categoryName.toLowerCase().includes(q) ||
        (r.assignedProviderName || '').toLowerCase().includes(q) ||
        r.neighborhood.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q) ||
        r.problemDescription.toLowerCase().includes(q)
      );
    });
  }, [requests, historyFilter, historySearch]);

  if (!firebaseUser || !userProfile) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#0B172A]">
          يرجى تسجيل الدخول لعرض لوحة حساب العميل
        </h1>
        <p className="text-sm text-slate-600">
          سجّل الدخول لإدارة بياناتك، عناوينك، وطلبات الخدمة الخاصة بك في
          أربيل.
        </p>
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

  const notifyOk = (msg: string) => {
    setActionErr('');
    setActionMsg(msg);
  };

  const notifyFail = (err: unknown, fallback: string) => {
    setActionMsg('');
    setActionErr(err instanceof Error ? err.message : fallback);
  };

  const openRequestDetails = async (req: ServiceRequest) => {
    setDetailRequest(req);
    setProviderContact(null);
    if (req.assignedProviderId) {
      setLoadingContact(true);
      const contact = await fetchApprovedProviderContact(
        req.assignedProviderId
      );
      setProviderContact(contact);
      setLoadingContact(false);
    }
  };

  const handleSaveBasicProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (userProfile.isSuspended) {
      notifyFail(
        new Error('لا يمكن تعديل البيانات أثناء تعليق الحساب.'),
        'تعذّر الحفظ.'
      );
      return;
    }
    if (displayName.trim().length < 2) {
      notifyFail(
        new Error('يرجى إدخال الاسم الكامل (حرفان على الأقل).'),
        'بيانات غير مكتملة.'
      );
      return;
    }
    setSavingProfile(true);
    try {
      await updateUserProfile({
        displayName,
        city,
        neighborhood,
      });
      notifyOk('تم تحديث بيانات ملفك الشخصي بنجاح.');
    } catch (err) {
      notifyFail(err, 'تعذّر حفظ بيانات الملف الشخصي.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (userProfile.isSuspended) {
      notifyFail(
        new Error('لا يمكن تحديث الصورة أثناء تعليق الحساب.'),
        'تعذّر التحديث.'
      );
      return;
    }
    setUploadingAvatar(true);
    try {
      const compressed = await compressAvatarFile(file);
      await updateUserProfile({ photoUrl: compressed });
      notifyOk('تم تحديث صورة حسابك بنجاح.');
    } catch (err) {
      notifyFail(err, 'تعذّر رفع وتحديث الصورة الشخصية.');
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleBeginPhoneVerification = async () => {
    setActionErr('');
    setActionMsg('');
    if (!isValidIraqiPhone(phoneInput)) {
      notifyFail(
        new Error('يرجى إدخال رقم هاتف عراقي صحيح يبدأ بـ 07 (11 رقماً).'),
        'رقم غير صحيح.'
      );
      return;
    }
    setPhoneBusy(true);
    try {
      const check = await verifyRecentAuthOnServer();
      if (!check.verified && check.requiresRecentAuth) {
        setReauthPendingAction('phone');
        setReauthModalOpen(true);
        return;
      }
      setPhoneStep('ready');
      setTimeout(async () => {
        try {
          const vId = await sendPhoneVerificationOtp(
            phoneInput,
            'khidmati-phone-recaptcha'
          );
          setVerificationId(vId);
          setPhoneStep('otp_sent');
          notifyOk(
            `تم إرسال رمز التحقق (SMS) إلى الرقم ${formatPhoneDisplay(
              phoneInput
            )}.`
          );
        } catch (err) {
          setPhoneStep('idle');
          notifyFail(err, 'تعذّر إرسال رمز التحقق عبر الرسائل القصيرة.');
        } finally {
          setPhoneBusy(false);
        }
      }, 60);
      return;
    } catch (err) {
      notifyFail(err, 'تعذّر التحقق من الجلسة الأمنية.');
    }
    setPhoneBusy(false);
  };

  const handleConfirmOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (otpCode.trim().length < 4) {
      notifyFail(
        new Error('يرجى إدخال رمز التحقق المكوّن من 6 أرقام.'),
        'رمز ناقص.'
      );
      return;
    }
    setPhoneBusy(true);
    try {
      await confirmPhoneVerificationOtp(verificationId, otpCode, phoneInput);
      setPhoneStep('idle');
      setVerificationId('');
      setOtpCode('');
      notifyOk('تم التحقق من رقم هاتفك وتوثيقه بنجاح عبر Firebase Phone Auth.');
    } catch (err) {
      notifyFail(err, 'تعذّر التحقق من رمز SMS.');
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleSaveAddress = async (e: FormEvent) => {
    e.preventDefault();
    if (userProfile.isSuspended) return;
    if (addrLabel.trim().length < 2 || addrStreet.trim().length < 4) {
      notifyFail(
        new Error('يرجى إدخال تسمية العنوان وتفاصيل الشارع أو الحي.'),
        'بيانات ناقصة.'
      );
      return;
    }

    setSavingAddress(true);
    try {
      let nextList: SavedAddress[] = [...savedAddresses];
      const makeDefault = addrIsDefault || nextList.length === 0;
      if (makeDefault) {
        nextList = nextList.map((a) => ({ ...a, isDefault: false }));
      }

      if (editingAddressId) {
        nextList = nextList.map((a) =>
          a.id === editingAddressId
            ? {
                ...a,
                label: addrLabel.trim().slice(0, 40),
                city: addrCity,
                neighborhood: addrNeighborhood,
                streetDetails: addrStreet.trim().slice(0, 160),
                ...(addrLandmark.trim()
                  ? { landmark: addrLandmark.trim().slice(0, 120) }
                  : {}),
                isDefault: makeDefault || a.isDefault,
              }
            : a
        );
      } else {
        if (nextList.length >= 10) {
          throw new Error('الحد الأقصى هو 10 عناوين محفوظة.');
        }
        nextList.push({
          id: `addr_${Date.now().toString(36)}`,
          label: addrLabel.trim().slice(0, 40),
          city: addrCity,
          neighborhood: addrNeighborhood,
          streetDetails: addrStreet.trim().slice(0, 160),
          ...(addrLandmark.trim()
            ? { landmark: addrLandmark.trim().slice(0, 120) }
            : {}),
          isDefault: makeDefault,
        });
      }

      const defaultEntry = nextList.find((a) => a.isDefault) ?? nextList[0];
      await updateUserProfile({
        savedAddresses: nextList,
        ...(defaultEntry
          ? { city: defaultEntry.city, neighborhood: defaultEntry.neighborhood }
          : {}),
      });

      setEditingAddressId(null);
      setAddrLabel('المنزل');
      setAddrStreet('');
      setAddrLandmark('');
      setAddrIsDefault(false);
      notifyOk('تم حفظ العنوان في دفتر عناوينك بنجاح.');
    } catch (err) {
      notifyFail(err, 'تعذّر حفظ العنوان.');
    } finally {
      setSavingAddress(false);
    }
  };

  const handleSetDefaultAddress = async (addrId: string) => {
    const nextList = savedAddresses.map((a) => ({
      ...a,
      isDefault: a.id === addrId,
    }));
    const target = nextList.find((a) => a.id === addrId);
    try {
      await updateUserProfile({
        savedAddresses: nextList,
        ...(target ? { city: target.city, neighborhood: target.neighborhood } : {}),
      });
      notifyOk('تم تعيين العنوان الافتراضي بنجاح.');
    } catch (err) {
      notifyFail(err, 'تعذّر تعيين العنوان الافتراضي.');
    }
  };

  const handleDeleteAddress = async (addrId: string) => {
    const remaining = savedAddresses.filter((a) => a.id !== addrId);
    if (remaining.length > 0 && !remaining.some((a) => a.isDefault)) {
      remaining[0] = { ...remaining[0], isDefault: true };
    }
    try {
      await updateUserProfile({ savedAddresses: remaining });
      notifyOk('تم حذف العنوان المحفوظ.');
    } catch (err) {
      notifyFail(err, 'تعذّر حذف العنوان.');
    }
  };

  const handleCancelRequest = async (id: string) => {
    try {
      await customerCancelRequest(id);
      notifyOk('تم إلغاء الطلب بنجاح.');
    } catch (err) {
      notifyFail(err, 'تعذّر إلغاء الطلب.');
    }
  };

  const handleSubmitReview = async (e: FormEvent) => {
    e.preventDefault();
    if (!reviewTarget?.assignedProviderId) return;
    if (reviewComment.trim().length < 10) {
      notifyFail(
        new Error('يرجى كتابة تعليق من 10 أحرف على الأقل.'),
        'تعليق قصير.'
      );
      return;
    }
    setSubmittingReview(true);
    try {
      await submitCustomerReview({
        providerId: reviewTarget.assignedProviderId,
        customerId: firebaseUser.uid,
        customerName: userProfile.displayName,
        neighborhood: reviewTarget.neighborhood || userProfile.neighborhood || 'أربيل',
        rating: reviewRating,
        comment: reviewComment,
      });
      setReviewTarget(null);
      setReviewComment('');
      setReviewRating(5);
      notifyOk('تم إرسال تقييمك بنجاح وسينشر بعد مراجعة الإدارة.');
    } catch (err) {
      notifyFail(err, 'تعذّر إرسال التقييم.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleSubmitDispute = async (e: FormEvent) => {
    e.preventDefault();
    if (!disputeTarget || disputeReason.trim().length < 8) return;
    setSubmittingDispute(true);
    try {
      await customerDisputeRequest(disputeTarget.id, disputeReason);
      setDisputeTarget(null);
      setDisputeReason('');
      notifyOk('تم فتح نزاع وإرسال إشعار فوري للإدارة للمراجعة.');
    } catch (err) {
      notifyFail(err, 'تعذّر إرسال النزاع.');
    } finally {
      setSubmittingDispute(false);
    }
  };

  const handleSubmitSupportTicket = async (e: FormEvent) => {
    e.preventDefault();
    if (supportReason.trim().length < 3 || supportDetails.trim().length < 10) {
      notifyFail(
        new Error('يرجى كتابة عنوان الشكوى وتفاصيلها (10 أحرف على الأقل).'),
        'بيانات ناقصة.'
      );
      return;
    }
    const phoneToSend = normalizeIraqiPhone(
      supportPhone || userProfile.phone || '07500000000'
    );
    if (!isValidIraqiPhone(phoneToSend)) {
      notifyFail(
        new Error('يرجى إدخال رقم هاتف عراقي صحيح للتواصل معك.'),
        'رقم غير صحيح.'
      );
      return;
    }

    const linkedReq = requests.find((r) => r.id === supportRequestId);
    const providerId = linkedReq?.assignedProviderId || 'platform_support';

    setSubmittingSupport(true);
    try {
      await submitComplaint({
        ...(linkedReq ? { requestId: linkedReq.id } : {}),
        providerId,
        reporterUid: firebaseUser.uid,
        reporterName: userProfile.displayName,
        reporterPhone: phoneToSend,
        reason: supportReason,
        details: supportDetails,
      });
      setSupportRequestId('');
      setSupportReason('');
      setSupportDetails('');
      notifyOk('تم إرسال طلب الدعم / الشكوى إلى فريق إدارة خدمتي بنجاح.');
    } catch (err) {
      notifyFail(err, 'تعذّر إرسال الشكوى.');
    } finally {
      setSubmittingSupport(false);
    }
  };

  const handleSaveNotifPrefs = async () => {
    setSavingNotifPrefs(true);
    try {
      await updateUserProfile({ notificationPreferences: notifPrefs });
      notifyOk('تم حفظ تفضيلات الإشعارات بنجاح.');
    } catch (err) {
      notifyFail(err, 'تعذّر حفظ تفضيلات الإشعارات.');
    } finally {
      setSavingNotifPrefs(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      notifyFail(
        new Error('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.'),
        'كلمة مرور ضعيفة.'
      );
      return;
    }
    if (newPassword !== confirmNewPassword) {
      notifyFail(
        new Error('كلمتا المرور الجديدتان غير متطابقتين.'),
        'عدم تطابق.'
      );
      return;
    }
    setChangingPassword(true);
    try {
      await changeAccountPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      notifyOk('تم تغيير كلمة المرور بنجاح بعد التحقق من كلمة المرور الحالية.');
    } catch (err) {
      notifyFail(err, 'تعذّر تغيير كلمة المرور.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleStartImmediateDeletion = async (e: FormEvent) => {
    e.preventDefault();
    if (deletionConfirmText.trim() !== 'حذف حسابي') {
      notifyFail(
        new Error('يرجى كتابة عبارة «حذف حسابي» حرفياً لتأكيد الحذف النهائي.'),
        'تأكيد مطلوب.'
      );
      return;
    }
    if (inProgressOrAssignedCount > 0) {
      notifyFail(
        new Error(
          'لديك طلبات خدمة مسندة أو قيد التنفيذ حالياً. يرجى تقديم طلب مراجعة حذف للإدارة أدناه.'
        ),
        'طلبات نشطة.'
      );
      return;
    }

    setDeletingAccount(true);
    try {
      const check = await verifyRecentAuthOnServer();
      if (!check.verified && check.requiresRecentAuth) {
        setReauthPendingAction('delete');
        setReauthModalOpen(true);
        setDeletingAccount(false);
        return;
      }
      await deleteCustomerAccountSecurely(deletionReason);
      onNavigate('home');
    } catch (err) {
      notifyFail(err, 'تعذّر إتمام حذف الحساب.');
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleSubmitDeletionReviewRequest = async () => {
    setDeletingAccount(true);
    try {
      await submitAccountDeletionRequest({
        uid: firebaseUser.uid,
        customerName: userProfile.displayName,
        customerEmail: userProfile.email,
        customerPhone: userProfile.phone,
        reason: deletionReason || 'طلب مراجعة إغلاق الحساب من لوحة العميل',
      });
      setDeletionReason('');
      setDeletionConfirmText('');
      notifyOk('تم إرسال طلب مراجعة حذف الحساب إلى الإدارة بنجاح.');
    } catch (err) {
      notifyFail(err, 'تعذّر إرسال طلب حذف الحساب.');
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleReauthenticateGoogle = async () => {
    setReauthBusy(true);
    try {
      await reauthenticateWithGoogle('customer');
      setReauthModalOpen(false);
      notifyOk('تم تأكيد هويتك حديثاً بنجاح. يمكنك متابعة العملية الآن.');
      if (reauthPendingAction === 'phone') {
        setPhoneStep('ready');
      }
      setReauthPendingAction(null);
    } catch (err) {
      notifyFail(err, 'تعذّر إعادة المصادقة عبر Google.');
    } finally {
      setReauthBusy(false);
    }
  };

  const handleReauthenticatePassword = async (e: FormEvent) => {
    e.preventDefault();
    setReauthBusy(true);
    try {
      await reauthenticateWithPassword(reauthPassword);
      setReauthPassword('');
      setReauthModalOpen(false);
      notifyOk('تم تأكيد هويتك حديثاً بنجاح. يمكنك متابعة العملية الآن.');
      if (reauthPendingAction === 'phone') {
        setPhoneStep('ready');
      }
      setReauthPendingAction(null);
    } catch (err) {
      notifyFail(err, 'كلمة المرور غير صحيحة أو تعذّر التحقق.');
    } finally {
      setReauthBusy(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10 space-y-6">
      {/* Customer Account Header */}
      <header className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          {userProfile.photoUrl ? (
            <img
              src={userProfile.photoUrl}
              alt={userProfile.displayName}
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-full object-cover border border-slate-200 shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#0B172A] text-white font-display font-bold text-xl flex items-center justify-center shrink-0">
              {getCustomerInitials(userProfile.displayName)}
            </div>
          )}

          <div className="space-y-1 min-w-0">
            <h1 className="font-display text-2xl font-extrabold text-[#0B172A] truncate">
              {userProfile.displayName}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              <span dir="ltr" className="font-mono-tabular">
                {userProfile.email}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                {isPhoneVerified ? (
                  <ShieldCheck
                    className="w-3.5 h-3.5 text-emerald-700"
                    aria-hidden="true"
                  />
                ) : (
                  <ShieldAlert
                    className="w-3.5 h-3.5 text-amber-600"
                    aria-hidden="true"
                  />
                )}
                <span dir="ltr" className="font-mono-tabular">
                  {userProfile.phone
                    ? formatPhoneDisplay(userProfile.phone)
                    : 'لم يُضف هاتف'}
                </span>
                <span>
                  ({isPhoneVerified ? 'موثّق عبر SMS' : 'غير موثّق عبر SMS'})
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {userProfile.city || 'أربيل'} —{' '}
                {userProfile.neighborhood || 'عنكاوا'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {!userProfile.isSuspended && (
            <button
              type="button"
              onClick={() => onNavigate('request-service')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold whitespace-nowrap shrink-0 min-h-[42px]"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>طلب خدمة جديدة</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void signOutUser().then(() => onNavigate('home'))}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 min-h-[42px]"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </header>

      {/* Suspended Banner */}
      {userProfile.isSuspended && (
        <div
          role="alert"
          className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 text-sm text-rose-900"
        >
          <AlertTriangle
            className="w-5 h-5 text-rose-700 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div>
            <p className="font-bold">تم تعليق هذا الحساب مؤقتاً من قِبل الإدارة</p>
            <p className="text-xs mt-1 text-rose-800">
              لا يمكنك تقديم طلبات جديدة أو تعديل البيانات الشخصية أثناء التعليق.
              يمكنك مراجعة سجل خدماتك أو مراسلة فريق الدعم من تبويب «التقييمات
              والشكاوى والدعم».
            </p>
          </div>
        </div>
      )}

      {/* 4-column Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">الطلبات النشطة</p>
          <p className="font-mono-tabular text-2xl font-bold text-[#0B172A]">
            {activeRequests.length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">الخدمات المكتملة</p>
          <p className="font-mono-tabular text-2xl font-bold text-emerald-700">
            {completedRequests.length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">العناوين المحفوظة</p>
          <p className="font-mono-tabular text-2xl font-bold text-[#0B172A]">
            {savedAddresses.length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">إشعارات غير مقروءة</p>
          <p className="font-mono-tabular text-2xl font-bold text-sky-700">
            {unreadNotifsCount}
          </p>
        </div>
      </div>

      {actionMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{actionMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionMsg('')}
            aria-label="إغلاق الرسالة"
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionErr && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between gap-2"
        >
          <span>{actionErr}</span>
          <button
            type="button"
            onClick={() => setActionErr('')}
            aria-label="إغلاق التنبيه"
            className="text-rose-700 hover:text-rose-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Segmented Navigation Tabs */}
      <nav
        aria-label="أقسام لوحة العميل"
        className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200"
      >
        {(
          [
            { id: 'active', label: `الطلبات النشطة (${activeRequests.length})` },
            { id: 'history', label: `سجل الخدمات (${requests.length})` },
            { id: 'profile', label: 'الملف الشخصي والهاتف' },
            { id: 'addresses', label: `العناوين المحفوظة (${savedAddresses.length})` },
            { id: 'support', label: 'التقييمات والشكاوى والدعم' },
            {
              id: 'security',
              label:
                unreadNotifsCount > 0
                  ? `الأمان والإشعارات (${unreadNotifsCount})`
                  : 'الأمان والإشعارات وحذف الحساب',
            },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-lg border-b-2 transition-colors whitespace-nowrap shrink-0 min-h-[42px] ${
              activeTab === tab.id
                ? 'border-emerald-600 text-[#0B172A] bg-white'
                : 'border-transparent text-slate-600 hover:text-[#0B172A]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* TAB 1: ACTIVE REQUESTS & LIVE TRACKING */}
      {activeTab === 'active' && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-display text-lg font-bold text-[#0B172A]">
                متابعة الطلبات النشطة في الوقت الفعلي
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                تتحدّث مراحل الطلب تلقائياً فور اعتماد الإدارة أو قبول الفني.
              </p>
            </div>
            {!userProfile.isSuspended && (
              <button
                type="button"
                onClick={() => onNavigate('request-service')}
                className="px-4 py-2 rounded-lg bg-[#0B172A] text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                طلب خدمة جديدة
              </button>
            )}
          </div>

          {activeRequests.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm text-slate-600">
                لا توجد طلبات قيد المعالجة أو التنفيذ حالياً.
              </p>
              {requests.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-[#0B172A] hover:bg-slate-50"
                >
                  عرض سجل الخدمات السابقة ({requests.length})
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {activeRequests.map((req) => {
                const statusMeta = REQUEST_STATUS_META[req.status];
                const stepIndex =
                  req.status === 'Pending'
                    ? 1
                    : req.status === 'Approved'
                    ? 2
                    : req.status === 'Assigned'
                    ? 3
                    : 4;
                return (
                  <div key={req.id} className="py-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <strong className="text-sm text-[#0B172A]">
                            {req.categoryName}
                          </strong>
                          <span aria-hidden="true">·</span>
                          <span dir="ltr" className="font-mono-tabular">
                            {req.id}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {req.city} — {req.neighborhood}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatArabicDate(req.createdAt)}</span>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed pt-1">
                          {req.problemDescription}
                        </p>
                      </div>
                      <span className={`text-xs font-bold ${statusMeta.tone}`}>
                        {statusMeta.labelAr}
                      </span>
                    </div>

                    {/* Progress Tracker */}
                    <div className="grid grid-cols-4 gap-2 text-[11px] font-medium">
                      {[
                        { step: 1, label: 'استلام الطلب' },
                        { step: 2, label: 'مراجعة واعتماد' },
                        { step: 3, label: 'تعيين الفني' },
                        { step: 4, label: 'قيد التنفيذ' },
                      ].map((item) => {
                        const done = stepIndex >= item.step;
                        return (
                          <div key={item.step} className="space-y-1">
                            <div
                              className={`h-1.5 rounded-full ${
                                done ? 'bg-emerald-600' : 'bg-slate-200'
                              }`}
                            />
                            <span
                              className={
                                done ? 'text-[#0B172A] font-semibold' : 'text-slate-400'
                              }
                            >
                              {item.step}. {item.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                      <div className="flex flex-wrap items-center gap-3">
                        <span>الموعد المفضل: {req.preferredTime}</span>
                        {req.assignedProviderName && (
                          <span>
                            الفني المعيّن:{' '}
                            <strong className="text-[#0B172A]">
                              {req.assignedProviderName}
                            </strong>
                          </span>
                        )}
                        {typeof req.agreedPrice === 'number' &&
                          req.agreedPrice > 0 && (
                            <span className="font-mono-tabular font-bold text-[#0B172A]">
                              السعر المتفق عليه: {formatIQD(req.agreedPrice)}
                            </span>
                          )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void openRequestDetails(req)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[#0B172A] hover:bg-slate-50 font-semibold"
                        >
                          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>
                            {req.assignedProviderId
                              ? 'التفاصيل والتواصل مع الفني'
                              : 'تفاصيل الطلب'}
                          </span>
                        </button>
                        {(req.status === 'Pending' ||
                          req.status === 'Approved') && (
                          <button
                            type="button"
                            onClick={() => void handleCancelRequest(req.id)}
                            className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 font-semibold"
                          >
                            إلغاء الطلب
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: CUSTOMER SERVICE HISTORY */}
      {activeTab === 'history' && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-display text-lg font-bold text-[#0B172A]">
                سجل الخدمات الكامل
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                جميع طلباتك السابقة والحالية مع تفاصيل الفني والسعر والملاحظات.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="بحث برقم الطلب أو الفني أو الحي..."
                  className="h-9 pr-9 pl-3 rounded-lg border border-slate-200 text-xs w-60 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
            {(
              [
                { id: 'all', label: 'الكل' },
                { id: 'Completed', label: 'مكتملة' },
                { id: 'active', label: 'نشطة' },
                { id: 'Cancelled', label: 'ملغاة' },
                { id: 'Disputed', label: 'محل نزاع' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setHistoryFilter(f.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  historyFilter === f.id
                    ? 'bg-white text-[#0B172A] shadow-sm'
                    : 'text-slate-600 hover:text-[#0B172A]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredHistory.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              لا توجد طلبات تطابق معايير البحث أو التصفية الحالية.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs">
                    <th className="py-3 px-2 whitespace-nowrap">رقم الطلب</th>
                    <th className="py-3 px-2 whitespace-nowrap">التصنيف</th>
                    <th className="py-3 px-2 whitespace-nowrap">مقدم الخدمة</th>
                    <th className="py-3 px-2 whitespace-nowrap">تاريخ الطلب</th>
                    <th className="py-3 px-2 whitespace-nowrap">السعر المتفق عليه</th>
                    <th className="py-3 px-2 whitespace-nowrap">الحالة</th>
                    <th className="py-3 px-2 whitespace-nowrap">الموقع</th>
                    <th className="py-3 px-2">ملاحظات العميل</th>
                    <th className="py-3 px-2 whitespace-nowrap">التفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredHistory.map((req) => {
                    const statusMeta = REQUEST_STATUS_META[req.status];
                    return (
                      <tr
                        key={req.id}
                        className="hover:bg-slate-50/70 transition-colors align-top"
                      >
                        <td className="py-3.5 px-2 font-mono-tabular text-xs text-slate-600 whitespace-nowrap">
                          <span dir="ltr">{req.id}</span>
                        </td>
                        <td className="py-3.5 px-2 font-semibold text-[#0B172A] whitespace-nowrap">
                          {req.categoryName}
                        </td>
                        <td className="py-3.5 px-2 text-xs text-slate-700 whitespace-nowrap">
                          {req.assignedProviderName || 'بانتظار التعيين'}
                        </td>
                        <td className="py-3.5 px-2 font-mono-tabular text-xs text-slate-600 whitespace-nowrap">
                          {formatArabicDate(req.createdAt)}
                        </td>
                        <td className="py-3.5 px-2 font-mono-tabular text-xs font-semibold text-[#0B172A] whitespace-nowrap">
                          {typeof req.agreedPrice === 'number' &&
                          req.agreedPrice > 0
                            ? formatIQD(req.agreedPrice)
                            : '—'}
                        </td>
                        <td className="py-3.5 px-2 text-xs font-bold whitespace-nowrap">
                          <span className={statusMeta.tone}>
                            {statusMeta.labelAr}
                          </span>
                        </td>
                        <td className="py-3.5 px-2 text-xs text-slate-600 whitespace-nowrap">
                          {req.city} — {req.neighborhood}
                        </td>
                        <td className="py-3.5 px-2 text-xs text-slate-600 max-w-xs">
                          <p className="line-clamp-2">{req.problemDescription}</p>
                        </td>
                        <td className="py-3.5 px-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => void openRequestDetails(req)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-[#0B172A] hover:bg-white"
                          >
                            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>فتح</span>
                          </button>
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

      {/* TAB 3: PROFILE, AVATAR & PHONE SMS OTP VERIFICATION */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Basic Info & Profile Picture */}
          <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <User className="w-4 h-4 text-emerald-700" aria-hidden="true" />
              <h2 className="font-display text-lg font-bold text-[#0B172A]">
                البيانات الشخصية والصورة
              </h2>
            </div>

            {/* Avatar Upload */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-4 border-b border-slate-100">
              {userProfile.photoUrl ? (
                <img
                  src={userProfile.photoUrl}
                  alt={userProfile.displayName}
                  referrerPolicy="no-referrer"
                  className="w-20 h-20 rounded-full object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-[#0B172A] text-white font-display font-bold text-2xl flex items-center justify-center shrink-0">
                  {getCustomerInitials(userProfile.displayName)}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-semibold text-[#0B172A]">
                  الصورة الشخصية للحساب
                </p>
                <p className="text-xs text-slate-500">
                  تُضغط الصورة تلقائياً في متصفحك وتُحفظ بشكل آمن في ملفك الخاص.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0B172A] hover:bg-[#13233E] text-white text-xs font-semibold">
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {uploadingAvatar ? 'جارٍ الرفع...' : 'تغيير الصورة'}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={uploadingAvatar || userProfile.isSuspended}
                      onChange={(e) => void handleAvatarUpload(e)}
                      className="sr-only"
                    />
                  </label>
                  {userProfile.photoUrl && (
                    <button
                      type="button"
                      disabled={uploadingAvatar || userProfile.isSuspended}
                      onClick={() =>
                        void updateUserProfile({ photoUrl: '' }).then(() =>
                          notifyOk('تمت إزالة الصورة الشخصية.')
                        )
                      }
                      className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      حذف الصورة
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Name & Email Form */}
            <form onSubmit={handleSaveBasicProfile} className="space-y-4">
              <div>
                <label
                  htmlFor="cust-name"
                  className="block text-xs font-semibold text-[#0B172A] mb-1.5"
                >
                  الاسم الكامل
                </label>
                <input
                  id="cust-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={userProfile.isSuspended}
                  className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label
                  htmlFor="cust-email"
                  className="block text-xs font-semibold text-[#0B172A] mb-1.5"
                >
                  البريد الإلكتروني المسجل (للقراءة فقط)
                </label>
                <div className="flex items-center gap-2 h-11 px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600">
                  <Mail className="w-4 h-4 text-slate-400" aria-hidden="true" />
                  <span id="cust-email" dir="ltr" className="font-mono-tabular">
                    {userProfile.email}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="cust-city"
                    className="block text-xs font-semibold text-[#0B172A] mb-1.5"
                  >
                    المدينة الافتراضية
                  </label>
                  <select
                    id="cust-city"
                    value={city}
                    disabled={userProfile.isSuspended}
                    onChange={(e) => {
                      const next = e.target.value;
                      setCity(next);
                      setNeighborhood(getNeighborhoodsByCity(next)[0] ?? '');
                    }}
                    className="w-full h-11 px-3 rounded-lg border border-slate-200 bg-white text-sm"
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
                    htmlFor="cust-hood"
                    className="block text-xs font-semibold text-[#0B172A] mb-1.5"
                  >
                    الحي السكني
                  </label>
                  <select
                    id="cust-hood"
                    value={neighborhood}
                    disabled={userProfile.isSuspended}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-slate-200 bg-white text-sm"
                  >
                    {getNeighborhoodsByCity(city).map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
                <span>
                  تاريخ إنشاء الحساب: {formatArabicDate(userProfile.createdAt)}
                </span>
                <button
                  type="submit"
                  disabled={savingProfile || userProfile.isSuspended}
                  className="px-5 py-2.5 rounded-lg bg-[#0B172A] hover:bg-[#13233E] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold"
                >
                  {savingProfile ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
                </button>
              </div>
            </form>
          </section>

          {/* Phone & Firebase SMS OTP Verification */}
          <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                <h2 className="font-display text-lg font-bold text-[#0B172A]">
                  توثيق رقم الهاتف (SMS OTP)
                </h2>
              </div>
              <span
                className={`text-xs font-bold ${
                  isPhoneVerified ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {isPhoneVerified ? 'موثّق' : 'بانتظار التوثيق'}
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1.5 text-xs text-slate-600">
              <p>
                الرقم المسجل حالياً:{' '}
                <strong dir="ltr" className="font-mono-tabular text-[#0B172A]">
                  {userProfile.phone
                    ? formatPhoneDisplay(userProfile.phone)
                    : 'غير مسجل'}
                </strong>
              </p>
              {userProfile.phoneVerifiedAt && (
                <p>
                  تاريخ التوثيق:{' '}
                  {formatArabicDate(userProfile.phoneVerifiedAt)}
                </p>
              )}
              <p className="pt-1 leading-relaxed">
                لإضافة رقم هاتف جديد أو تغييره، يتطلب النظام إعادة التحقق
                الأمني من هويتك ثم إرسال رمز تحقق حقيقي عبر SMS من Firebase.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="otp-phone-input"
                  className="block text-xs font-semibold text-[#0B172A] mb-1.5"
                >
                  رقم الهاتف العراقي الجديد أو الحالي
                </label>
                <input
                  id="otp-phone-input"
                  type="tel"
                  dir="ltr"
                  value={phoneInput}
                  disabled={phoneStep === 'otp_sent' || userProfile.isSuspended}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="0750 123 4567"
                  className="w-full h-11 px-3 rounded-lg border border-slate-200 text-sm text-left font-mono-tabular focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              {phoneStep !== 'idle' && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">
                    التحقق الأمني (reCAPTCHA):
                  </p>
                  <div id="khidmati-phone-recaptcha" />
                </div>
              )}

              {phoneStep !== 'otp_sent' ? (
                <button
                  type="button"
                  disabled={phoneBusy || userProfile.isSuspended}
                  onClick={() => void handleBeginPhoneVerification()}
                  className="w-full h-11 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs sm:text-sm font-semibold"
                >
                  {phoneBusy
                    ? 'جارٍ التحضير وإرسال الرمز...'
                    : 'تغيير / توثيق رقم الهاتف عبر SMS'}
                </button>
              ) : (
                <form onSubmit={handleConfirmOtp} className="space-y-3">
                  <div>
                    <label
                      htmlFor="otp-code-input"
                      className="block text-xs font-semibold text-[#0B172A] mb-1.5"
                    >
                      رمز التحقق المرسل عبر SMS
                    </label>
                    <input
                      id="otp-code-input"
                      type="text"
                      dir="ltr"
                      inputMode="numeric"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="123456"
                      className="w-full h-11 px-3 rounded-lg border border-slate-200 text-center text-base tracking-widest font-mono-tabular focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={phoneBusy}
                      className="flex-1 h-11 rounded-lg bg-[#0B172A] hover:bg-[#13233E] text-white text-xs sm:text-sm font-semibold"
                    >
                      {phoneBusy ? 'جارٍ التأكيد...' : 'تأكيد الرمز وتوثيق الرقم'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPhoneStep('idle');
                        setOtpCode('');
                        setVerificationId('');
                      }}
                      className="px-4 h-11 rounded-lg border border-slate-200 text-xs font-medium text-slate-600"
                    >
                      إلغاء
                    </button>
                  </div>
                </form>
              )}
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: SAVED ADDRESSES */}
      {activeTab === 'addresses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <MapPin
                  className="w-4 h-4 text-emerald-700"
                  aria-hidden="true"
                />
                <h2 className="font-display text-lg font-bold text-[#0B172A]">
                  عناويني المحفوظة ({savedAddresses.length})
                </h2>
              </div>
            </div>

            {savedAddresses.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">
                لم تقم بإضافة عناوين محفوظة بعد. أضف عنوان منزلك أو عملك لتسهيل
                تعبئة طلبات الخدمة القادمة.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {savedAddresses.map((addr) => (
                  <div
                    key={addr.id}
                    className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <strong className="text-sm text-[#0B172A]">
                          {addr.label}
                        </strong>
                        {addr.isDefault && (
                          <span className="text-xs font-bold text-emerald-700">
                            · العنوان الافتراضي
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600">
                        {addr.city} — {addr.neighborhood} · {addr.streetDetails}
                      </p>
                      {addr.landmark && (
                        <p className="text-xs text-slate-500">
                          أقرب نقطة دالة: {addr.landmark}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {!addr.isDefault && (
                        <button
                          type="button"
                          onClick={() => void handleSetDefaultAddress(addr.id)}
                          className="px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold"
                        >
                          تعيين كافتراضي
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAddressId(addr.id);
                          setAddrLabel(addr.label);
                          setAddrCity(addr.city);
                          setAddrNeighborhood(addr.neighborhood);
                          setAddrStreet(addr.streetDetails);
                          setAddrLandmark(addr.landmark ?? '');
                          setAddrIsDefault(addr.isDefault);
                        }}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        تعديل
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteAddress(addr.id)}
                        aria-label={`حذف عنوان ${addr.label}`}
                        className="p-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Add / Edit Address Form */}
          <form
            onSubmit={handleSaveAddress}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display text-base font-bold text-[#0B172A]">
                {editingAddressId ? 'تعديل العنوان' : 'إضافة عنوان جديد'}
              </h3>
              {editingAddressId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingAddressId(null);
                    setAddrLabel('المنزل');
                    setAddrStreet('');
                    setAddrLandmark('');
                    setAddrIsDefault(false);
                  }}
                  className="text-xs text-slate-500 hover:text-[#0B172A]"
                >
                  إلغاء التعديل
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B172A] mb-1">
                تسمية العنوان
              </label>
              <input
                type="text"
                required
                value={addrLabel}
                onChange={(e) => setAddrLabel(e.target.value)}
                placeholder="مثال: المنزل، العمل، منزل العائلة"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#0B172A] mb-1">
                  المدينة
                </label>
                <select
                  value={addrCity}
                  onChange={(e) => {
                    const next = e.target.value;
                    setAddrCity(next);
                    setAddrNeighborhood(getNeighborhoodsByCity(next)[0] ?? '');
                  }}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
                >
                  {IRAQ_LOCATIONS.map((loc) => (
                    <option key={loc.city} value={loc.city}>
                      {loc.city}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0B172A] mb-1">
                  الحي
                </label>
                <select
                  value={addrNeighborhood}
                  onChange={(e) => setAddrNeighborhood(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
                >
                  {getNeighborhoodsByCity(addrCity).map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B172A] mb-1">
                تفاصيل الشارع ورقم الدار
              </label>
              <input
                type="text"
                required
                value={addrStreet}
                onChange={(e) => setAddrStreet(e.target.value)}
                placeholder="مثال: شارع 100، زقاق 12، دار 45"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B172A] mb-1">
                أقرب نقطة دالة (اختياري)
              </label>
              <input
                type="text"
                value={addrLandmark}
                onChange={(e) => setAddrLandmark(e.target.value)}
                placeholder="مثال: قرب جامع أو مدرسة..."
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={addrIsDefault}
                onChange={(e) => setAddrIsDefault(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
              />
              <span>تعيين هذا العنوان كعنوان افتراضي</span>
            </label>

            <button
              type="submit"
              disabled={savingAddress || userProfile.isSuspended}
              className="w-full h-11 rounded-lg bg-[#0B172A] hover:bg-[#13233E] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold"
            >
              {savingAddress
                ? 'جارٍ الحفظ...'
                : editingAddressId
                ? 'حفظ تعديلات العنوان'
                : 'إضافة العنوان'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 5: REVIEWS, COMPLAINTS & SUPPORT */}
      {activeTab === 'support' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Submit Complaint / Support Form */}
          <form
            onSubmit={handleSubmitSupportTicket}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <MessageSquare
                className="w-4 h-4 text-emerald-700"
                aria-hidden="true"
              />
              <h2 className="font-display text-lg font-bold text-[#0B172A]">
                تقديم شكوى أو طلب دعم
              </h2>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B172A] mb-1">
                ارتباط الطلب (اختياري)
              </label>
              <select
                value={supportRequestId}
                onChange={(e) => setSupportRequestId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs sm:text-sm bg-white"
              >
                <option value="">طلب دعم عام لإدارة المنصة</option>
                {requests.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.categoryName} ({r.id}) —{' '}
                    {r.assignedProviderName || 'بدون فني'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B172A] mb-1">
                موضوع الشكوى أو الاستفسار
              </label>
              <input
                type="text"
                required
                minLength={3}
                value={supportReason}
                onChange={(e) => setSupportReason(e.target.value)}
                placeholder="مثال: استفسار عن تسعيرة، تأخر وصول الفني، دعم الحساب"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B172A] mb-1">
                رقم الهاتف للتواصل
              </label>
              <input
                type="tel"
                dir="ltr"
                required
                value={supportPhone}
                onChange={(e) => setSupportPhone(e.target.value)}
                placeholder="0750 123 4567"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-left font-mono-tabular"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B172A] mb-1">
                التفاصيل الكاملة
              </label>
              <textarea
                rows={4}
                required
                minLength={10}
                value={supportDetails}
                onChange={(e) => setSupportDetails(e.target.value)}
                placeholder="اشرح مشكلتك أو طلب الدعم بوضوح ليتمكن فريق الإدارة من معالجته..."
                className="w-full p-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={submittingSupport}
              className="w-full h-11 rounded-lg bg-[#0B172A] hover:bg-[#13233E] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold"
            >
              {submittingSupport ? 'جارٍ الإرسال...' : 'إرسال طلب الدعم / الشكوى'}
            </button>
          </form>

          {/* Lists of Customer Complaints & Reviews */}
          <div className="lg:col-span-7 space-y-6">
            <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="font-display text-base font-bold text-[#0B172A] border-b border-slate-100 pb-3">
                شكاوى وطلبات الدعم المرسلة ({complaints.length})
              </h3>
              {complaints.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">
                  لم ترسل أي شكاوى أو طلبات دعم حتى الآن.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {complaints.map((cmp) => (
                    <div key={cmp.id} className="py-3.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-sm text-[#0B172A]">
                          {cmp.reason}
                        </strong>
                        <span
                          className={`text-xs font-bold ${
                            cmp.status === 'resolved'
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {cmp.status === 'resolved'
                            ? 'تمت المعالجة'
                            : cmp.status === 'investigating'
                            ? 'قيد التحقيق'
                            : 'مفتوح'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {cmp.details}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {formatArabicDate(cmp.createdAt)}
                        {cmp.requestId ? ` · رقم الطلب: ${cmp.requestId}` : ''}
                      </p>
                      {cmp.adminResolutionNote && (
                        <p className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-2.5 mt-1">
                          رد الإدارة: {cmp.adminResolutionNote}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="font-display text-base font-bold text-[#0B172A] border-b border-slate-100 pb-3">
                تقييماتي للخدمات المكتملة ({reviews.length})
              </h3>
              {reviews.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">
                  يمكنك تقييم الفني بعد اكتمال أي خدمة من قسم «سجل الخدمات».
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {reviews.map((rev) => (
                    <div key={rev.id} className="py-3.5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 text-amber-500">
                          {Array.from({ length: rev.rating }).map((_, idx) => (
                            <Star
                              key={idx}
                              className="w-3.5 h-3.5 fill-amber-500"
                              aria-hidden="true"
                            />
                          ))}
                          <span className="text-xs font-bold text-[#0B172A] mr-1.5">
                            ({rev.rating}/5)
                          </span>
                        </div>
                        <span
                          className={`text-xs font-semibold ${
                            rev.status === 'approved'
                              ? 'text-emerald-700'
                              : rev.status === 'rejected'
                              ? 'text-rose-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {rev.status === 'approved'
                            ? 'منشور'
                            : rev.status === 'rejected'
                            ? 'مرفوض'
                            : 'بانتظار مراجعة الإدارة'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        {rev.comment}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {formatArabicDate(rev.createdAt)} · {rev.neighborhood}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* TAB 6: SECURITY, NOTIFICATIONS, PASSWORD & ACCOUNT DELETION */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Notifications Inbox & Preferences */}
            <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Bell className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                  <h2 className="font-display text-lg font-bold text-[#0B172A]">
                    الإشعارات الواردة ({notifications.length})
                  </h2>
                </div>
                {notifications.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4 text-center">
                    لا توجد إشعارات واردة حالياً.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className="py-3 flex items-start justify-between gap-3"
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
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium shrink-0"
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

              {/* Notification Preferences */}
              <div className="border-t border-slate-200 pt-5 space-y-4">
                <h3 className="font-display text-base font-bold text-[#0B172A]">
                  تفضيلات الإشعارات
                </h3>
                <div className="space-y-3 text-sm">
                  {(
                    [
                      {
                        key: 'requestUpdates',
                        title: 'تحديثات حالة طلبات الخدمة',
                        desc: 'تنبيهات عند اعتماد الطلب أو تعيين الفني أو اكتمال العمل.',
                      },
                      {
                        key: 'providerMessages',
                        title: 'تنبيهات التواصل مع الفنيين',
                        desc: 'إشعارات متعلقة بردود وقرارات مقدمي الخدمة.',
                      },
                      {
                        key: 'emailNotifications',
                        title: 'الإشعارات عبر البريد الإلكتروني',
                        desc: 'ملخصات الحالة المهمة على بريدك المسجل.',
                      },
                      {
                        key: 'promotions',
                        title: 'العروض الموسمية وتحديثات أربيل',
                        desc: 'تخفيضات الصيانة الموسمية والتصنيفات الجديدة.',
                      },
                    ] as const
                  ).map((item) => (
                    <label
                      key={item.key}
                      className="flex items-start justify-between gap-4 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50/70"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#0B172A]">
                          {item.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {item.desc}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifPrefs[item.key]}
                        onChange={(e) =>
                          setNotifPrefs((prev) => ({
                            ...prev,
                            [item.key]: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 mt-1 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={savingNotifPrefs || userProfile.isSuspended}
                  onClick={() => void handleSaveNotifPrefs()}
                  className="px-5 py-2.5 rounded-lg bg-[#0B172A] hover:bg-[#13233E] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold"
                >
                  {savingNotifPrefs ? 'جارٍ الحفظ...' : 'حفظ تفضيلات الإشعارات'}
                </button>
              </div>
            </section>

            {/* Password & Account Deletion */}
            <div className="lg:col-span-5 space-y-6">
              {/* Password Change Card */}
              <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <KeyRound
                    className="w-4 h-4 text-emerald-700"
                    aria-hidden="true"
                  />
                  <h2 className="font-display text-base font-bold text-[#0B172A]">
                    كلمة المرور وأمان الدخول
                  </h2>
                </div>

                {hasPasswordProvider ? (
                  <form onSubmit={handleChangePassword} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#0B172A] mb-1">
                        كلمة المرور الحالية
                      </label>
                      <input
                        type="password"
                        dir="ltr"
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-left"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#0B172A] mb-1">
                        كلمة المرور الجديدة
                      </label>
                      <input
                        type="password"
                        dir="ltr"
                        required
                        minLength={6}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-left"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#0B172A] mb-1">
                        تأكيد كلمة المرور الجديدة
                      </label>
                      <input
                        type="password"
                        dir="ltr"
                        required
                        minLength={6}
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-left"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={changingPassword}
                      className="w-full h-10 rounded-lg bg-[#0B172A] hover:bg-[#13233E] text-white text-xs sm:text-sm font-semibold"
                    >
                      {changingPassword
                        ? 'جارٍ التحديث...'
                        : 'تحديث كلمة المرور'}
                    </button>
                  </form>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs text-slate-600 leading-relaxed space-y-1">
                    <p className="font-semibold text-[#0B172A]">
                      مسجّل الدخول عبر حساب Google
                    </p>
                    <p>
                      حسابك محمي بمصادقة Google المباشرة ولا يستخدم كلمة مرور
                      محلية في خدمتي. لإدارة كلمة المرور أو التحقق بخطوتين،
                      استخدم إعدادات أمان حسابك في Google.
                    </p>
                  </div>
                )}
              </section>

              {/* Secure Account Deletion Card */}
              <section className="bg-white border border-rose-200 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-2 border-b border-rose-100 pb-3">
                  <Lock className="w-4 h-4 text-rose-700" aria-hidden="true" />
                  <h2 className="font-display text-base font-bold text-rose-900">
                    حذف الحساب وإغلاقه نهائياً
                  </h2>
                </div>

                {deletionRequests.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5 text-xs">
                    <p className="font-semibold text-[#0B172A]">
                      حالة طلبات حذف الحساب السابقة:
                    </p>
                    {deletionRequests.map((dr) => (
                      <div
                        key={dr.id}
                        className="flex items-center justify-between text-slate-600"
                      >
                        <span>{formatArabicDate(dr.createdAt)}</span>
                        <span className="font-bold">
                          {dr.status === 'pending'
                            ? 'قيد مراجعة الإدارة'
                            : dr.status === 'approved'
                            ? 'تمت الموافقة'
                            : dr.status === 'rejected'
                            ? 'مرفوض'
                            : 'مكتمل'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-slate-600 leading-relaxed">
                  حذف الحساب إجراء أمني حساس يتطلب إعادة التحقق الحديث من هويتك.
                  سيتم إزالة ملفك الشخصي من قاعدة البيانات وحذف حساب المصادقة
                  نهائياً.
                </p>

                {inProgressOrAssignedCount > 0 && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    لديك حالياً ({inProgressOrAssignedCount}) طلب خدمة مسند أو قيد
                    التنفيذ. يمكنك إرسال طلب مراجعة للإدارة لإغلاق الحساب بأمان.
                  </p>
                )}

                <form
                  onSubmit={handleStartImmediateDeletion}
                  className="space-y-3"
                >
                  <div>
                    <label className="block text-xs font-semibold text-[#0B172A] mb-1">
                      سبب الحذف (اختياري)
                    </label>
                    <input
                      type="text"
                      value={deletionReason}
                      onChange={(e) => setDeletionReason(e.target.value)}
                      placeholder="سبب رغبتك في حذف الحساب..."
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-rose-900 mb-1">
                      اكتب عبارة «حذف حسابي» للتأكيد
                    </label>
                    <input
                      type="text"
                      value={deletionConfirmText}
                      onChange={(e) => setDeletionConfirmText(e.target.value)}
                      placeholder="حذف حسابي"
                      className="w-full h-10 px-3 rounded-lg border border-rose-200 text-xs"
                    />
                  </div>

                  <div className="space-y-2 pt-1">
                    <button
                      type="submit"
                      disabled={
                        deletingAccount || inProgressOrAssignedCount > 0
                      }
                      className="w-full h-10 rounded-lg bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white text-xs font-semibold"
                    >
                      {deletingAccount
                        ? 'جارٍ التحقق وتنفيذ الحذف...'
                        : 'حذف الحساب نهائياً الآن'}
                    </button>
                    <button
                      type="button"
                      disabled={deletingAccount}
                      onClick={() => void handleSubmitDeletionReviewRequest()}
                      className="w-full h-10 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
                    >
                      أو إرسال طلب مراجعة حذف الحساب للإدارة
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* FULL REQUEST DETAILS MODAL */}
      {detailRequest && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#0B172A]/60 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="text-xs text-slate-500 font-mono-tabular" dir="ltr">
                  {detailRequest.id}
                </p>
                <h3 className="font-display text-lg font-bold text-[#0B172A]">
                  تفاصيل طلب {detailRequest.categoryName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailRequest(null)}
                aria-label="إغلاق نافذة التفاصيل"
                className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div>
                <p className="text-slate-500">الحالة الحالية</p>
                <p
                  className={`font-bold mt-0.5 ${
                    REQUEST_STATUS_META[detailRequest.status].tone
                  }`}
                >
                  {REQUEST_STATUS_META[detailRequest.status].labelAr}
                </p>
              </div>
              <div>
                <p className="text-slate-500">تاريخ الطلب</p>
                <p className="font-mono-tabular font-semibold text-[#0B172A] mt-0.5">
                  {formatArabicDate(detailRequest.createdAt)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">موقع الخدمة</p>
                <p className="font-semibold text-[#0B172A] mt-0.5">
                  {detailRequest.city} — {detailRequest.neighborhood}
                </p>
              </div>
              <div>
                <p className="text-slate-500">السعر المتفق عليه</p>
                <p className="font-mono-tabular font-semibold text-[#0B172A] mt-0.5">
                  {typeof detailRequest.agreedPrice === 'number' &&
                  detailRequest.agreedPrice > 0
                    ? formatIQD(detailRequest.agreedPrice)
                    : 'يُحدّد عند المعاينة'}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-slate-500">الموعد المفضل</p>
                <p className="font-semibold text-[#0B172A] mt-0.5">
                  {detailRequest.preferredTime}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-500">
                ملاحظات العميل ووصف المشكلة
              </p>
              <p className="text-sm text-[#0B172A] leading-relaxed whitespace-pre-line">
                {detailRequest.problemDescription}
              </p>
            </div>

            {detailRequest.disputeReason && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                <strong>سبب النزاع المسجل:</strong> {detailRequest.disputeReason}
              </div>
            )}

            {/* Assigned Provider Contact Box */}
            {detailRequest.assignedProviderId && (
              <div className="border border-emerald-200 bg-emerald-50/50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-emerald-800 font-semibold">
                      مقدّم الخدمة المعيّن
                    </p>
                    <p className="text-sm font-bold text-[#0B172A]">
                      {detailRequest.assignedProviderName}
                    </p>
                  </div>
                  {loadingContact && (
                    <span className="text-xs text-slate-500">جارٍ التحميل...</span>
                  )}
                </div>

                {providerContact && (
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`tel:${normalizeIraqiPhone(providerContact.phone)}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0B172A] text-white text-xs font-semibold"
                    >
                      <PhoneCall className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        اتصال هاتفي (
                        <span dir="ltr" className="font-mono-tabular">
                          {formatPhoneDisplay(providerContact.phone)}
                        </span>
                        )
                      </span>
                    </a>
                    <a
                      href={buildWhatsAppLink(
                        providerContact.whatsapp || providerContact.phone,
                        providerContact.fullName,
                        detailRequest.categoryName
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                    >
                      <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>مراسلة واتساب</span>
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Modal Footer Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
              {detailRequest.status === 'Completed' &&
                detailRequest.assignedProviderId && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = detailRequest;
                      setDetailRequest(null);
                      setReviewTarget(target);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                  >
                    <Star className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>تقييم الفني</span>
                  </button>
                )}

              {detailRequest.status === 'Completed' && (
                <button
                  type="button"
                  onClick={() => {
                    const target = detailRequest;
                    setDetailRequest(null);
                    setDisputeTarget(target);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-200 text-amber-800 text-xs font-semibold"
                >
                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>فتح نزاع</span>
                </button>
              )}

              {(detailRequest.status === 'Pending' ||
                detailRequest.status === 'Approved') && (
                <button
                  type="button"
                  onClick={() => {
                    const id = detailRequest.id;
                    setDetailRequest(null);
                    void handleCancelRequest(id);
                  }}
                  className="px-4 py-2 rounded-lg border border-rose-200 text-rose-700 text-xs font-semibold"
                >
                  إلغاء الطلب
                </button>
              )}

              <button
                type="button"
                onClick={() => setDetailRequest(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RATING & REVIEW MODAL */}
      {reviewTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#0B172A]/60 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleSubmitReview}
            className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-display text-lg font-bold text-[#0B172A]">
                تقييم خدمة {reviewTarget.assignedProviderName}
              </h3>
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2">
                التقييم العام بالنجوم
              </p>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewRating(star)}
                    aria-label={`${star} نجوم`}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
                  >
                    <Star
                      className={`w-5 h-5 ${
                        star <= reviewRating
                          ? 'text-amber-500 fill-amber-500'
                          : 'text-slate-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B172A] mb-1">
                تعليقك على جودة العمل والالتزام
              </label>
              <textarea
                rows={3}
                required
                minLength={10}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="اكتب رأيك بتجربتك مع الفني (10 أحرف على الأقل)..."
                className="w-full p-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submittingReview}
                className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
              >
                {submittingReview ? 'جارٍ الإرسال...' : 'إرسال التقييم'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DISPUTE MODAL */}
      {disputeTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#0B172A]/60 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleSubmitDispute}
            className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-display text-lg font-bold text-[#0B172A]">
                رفع نزاع على الطلب
              </h3>
              <button
                type="button"
                onClick={() => setDisputeTarget(null)}
                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <textarea
              rows={3}
              required
              minLength={8}
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="اشرح سبب النزاع أو المشكلة بعد إتمام الخدمة..."
              className="w-full p-3 rounded-lg border border-slate-200 text-sm"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDisputeTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submittingDispute}
                className="px-4 py-2 rounded-lg bg-rose-700 text-white text-xs font-semibold"
              >
                {submittingDispute ? 'جارٍ الإرسال...' : 'تأكيد رفع النزاع'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* RE-AUTHENTICATION SECURITY MODAL */}
      {reauthModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#0B172A]/60 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-display text-lg font-bold text-[#0B172A]">
                إعادة تأكيد الهوية الأمني
              </h3>
              <button
                type="button"
                onClick={() => {
                  setReauthModalOpen(false);
                  setReauthPendingAction(null);
                }}
                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              لأن هذه العملية حساسة ({reauthPendingAction === 'delete' ? 'حذف الحساب' : 'تغيير وتوثيق رقم الهاتف'})، يجب إعادة تسجيل الدخول حديثاً لحماية حسابك.
            </p>

            {hasGoogleProvider && (
              <button
                type="button"
                disabled={reauthBusy}
                onClick={() => void handleReauthenticateGoogle()}
                className="w-full h-11 rounded-xl bg-[#0B172A] hover:bg-[#13233E] text-white text-xs sm:text-sm font-semibold"
              >
                {reauthBusy
                  ? 'جارٍ التحقق...'
                  : 'إعادة التحقق بحساب Google'}
              </button>
            )}

            {hasPasswordProvider && (
              <form
                onSubmit={handleReauthenticatePassword}
                className="space-y-3 border-t border-slate-100 pt-3"
              >
                <label className="block text-xs font-semibold text-[#0B172A]">
                  أو أدخل كلمة المرور الحالية
                </label>
                <input
                  type="password"
                  dir="ltr"
                  required
                  value={reauthPassword}
                  onChange={(e) => setReauthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-left"
                />
                <button
                  type="submit"
                  disabled={reauthBusy}
                  className="w-full h-10 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  تأكيد كلمة المرور
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
