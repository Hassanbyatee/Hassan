import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { INITIAL_CATEGORIES } from '../data/seedData';
import {
  AccountDeletionRequest,
  AppUser,
  CommissionRecord,
  CustomerAdminMeta,
  CustomerReview,
  NotificationItem,
  NotificationType,
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
import { normalizeIraqiPhone } from '../utils/format';
import { auth, db } from './config';
import { handleFirestoreError, OperationType } from './errors';

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

async function getBearerHeader(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('يجب تسجيل الدخول لتنفيذ هذه العملية.');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// --- Seed Initial Categories & Platform Settings when Admin signs in ---
export async function ensureAdminSeedData(adminUid: string): Promise<void> {
  try {
    const settingsRef = doc(db, 'platformSettings', 'config');
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
      const defaults: PlatformSettings = {
        commissionRatePercent: 10,
        weeklyCycleDays: 7,
        updatedAt: new Date().toISOString(),
        updatedBy: adminUid,
      };
      await setDoc(settingsRef, defaults);
    }

    const catsSnap = await getDocs(collection(db, 'serviceCategories'));
    if (catsSnap.empty) {
      await Promise.all(
        INITIAL_CATEGORIES.map((cat) =>
          setDoc(doc(db, 'serviceCategories', cat.id), cat)
        )
      );
    }
  } catch (err) {
    console.error('Seed initialization warning:', err);
  }
}

// --- Public Listeners ---
export function subscribeCategories(
  onData: (items: ServiceCategory[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'serviceCategories'),
    (snap) => {
      const items = snap.docs.map((d) => d.data() as ServiceCategory);
      onData(items.length > 0 ? items : INITIAL_CATEGORIES);
    },
    (error) => {
      console.warn('Categories listener fallback:', error.message);
      onData(INITIAL_CATEGORIES);
    }
  );
}

export function subscribeApprovedProviders(
  onData: (items: ServiceProvider[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'providers'),
    where('approvalStatus', '==', 'approved')
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        ...(d.data() as ServiceProvider),
        documents: [],
      }));
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'providers')
  );
}

export function subscribeApprovedReviews(
  onData: (items: CustomerReview[]) => void
): Unsubscribe {
  const q = query(collection(db, 'reviews'), where('status', '==', 'approved'));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as CustomerReview));
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'reviews')
  );
}

export function subscribePlatformSettings(
  onData: (settings: PlatformSettings) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'platformSettings', 'config'),
    (snap) => {
      if (snap.exists()) {
        onData(snap.data() as PlatformSettings);
      } else {
        onData({
          commissionRatePercent: 10,
          weeklyCycleDays: 7,
          updatedAt: new Date().toISOString(),
          updatedBy: 'system',
        });
      }
    },
    (error) => {
      console.warn('Settings fallback:', error.message);
      onData({
        commissionRatePercent: 10,
        weeklyCycleDays: 7,
        updatedAt: new Date().toISOString(),
        updatedBy: 'system',
      });
    }
  );
}

// --- Notifications Helper ---
export async function createNotification(payload: {
  recipientRole: 'admin' | 'provider' | 'customer';
  recipientUid: string;
  type: NotificationType;
  titleAr: string;
  messageAr: string;
  relatedId?: string;
}): Promise<void> {
  const id = makeId('notif');
  const item: NotificationItem = {
    id,
    recipientRole: payload.recipientRole,
    recipientUid: payload.recipientUid,
    type: payload.type,
    titleAr: payload.titleAr.slice(0, 140),
    messageAr: payload.messageAr.slice(0, 500),
    ...(payload.relatedId ? { relatedId: payload.relatedId } : {}),
    isRead: false,
    emailQueued: true,
    createdAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'notifications', id), item);
    // Notify server email dispatch bridge (non-blocking)
    const headers = await getBearerHeader();
    void fetch('/api/notifications/email-dispatch', {
      method: 'POST',
      headers,
      body: JSON.stringify({ type: payload.type, titleAr: payload.titleAr }),
    }).catch(() => {});
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `notifications/${id}`);
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', id), { isRead: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${id}`);
  }
}

// --- Provider Registration & Management ---
export async function registerOrUpdateProviderProfile(payload: {
  uid: string;
  fullName: string;
  phone: string;
  categoryId: string;
  city: string;
  neighborhood: string;
  serviceAreas: string[];
  yearsExperience: number;
  description: string;
  profileImage: string;
  documents: VerificationDocument[];
  isNew: boolean;
}): Promise<ServiceProvider> {
  const now = new Date().toISOString();
  const providerId = payload.uid;
  const normalizedPhone = normalizeIraqiPhone(payload.phone);

  if (payload.isNew) {
    const providerDoc: Omit<ServiceProvider, 'documents'> & { updatedAt: string } = {
      id: providerId,
      uid: payload.uid,
      fullName: payload.fullName.trim().slice(0, 100),
      phone: normalizedPhone,
      whatsapp: normalizedPhone,
      categoryId: payload.categoryId,
      city: payload.city,
      neighborhood: payload.neighborhood,
      serviceAreas: payload.serviceAreas.slice(0, 20),
      yearsExperience: payload.yearsExperience,
      description: payload.description.trim().slice(0, 1500),
      profileImage: payload.profileImage.slice(0, 190000),
      approvalStatus: 'pending',
      verificationStatus: 'unverified',
      createdAt: now,
      updatedAt: now,
      isDemo: false,
    };

    try {
      await setDoc(doc(db, 'providers', providerId), providerDoc);
      await setDoc(doc(db, 'providerDocuments', providerId), {
        providerId,
        uid: payload.uid,
        documents: payload.documents.slice(0, 5),
        updatedAt: now,
      });

      await createNotification({
        recipientRole: 'admin',
        recipientUid: 'admin',
        type: 'new_provider',
        titleAr: 'طلب تسجيل مقدم خدمة جديد',
        messageAr: `تقدّم ${providerDoc.fullName} بطلب انضمام في ${providerDoc.city} — ${providerDoc.neighborhood} وبانتظار المراجعة.`,
        relatedId: providerId,
      });

      return { ...providerDoc, documents: payload.documents };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `providers/${providerId}`);
    }
  } else {
    const updates = {
      fullName: payload.fullName.trim().slice(0, 100),
      phone: normalizedPhone,
      whatsapp: normalizedPhone,
      categoryId: payload.categoryId,
      city: payload.city,
      neighborhood: payload.neighborhood,
      serviceAreas: payload.serviceAreas.slice(0, 20),
      yearsExperience: payload.yearsExperience,
      description: payload.description.trim().slice(0, 1500),
      profileImage: payload.profileImage.slice(0, 190000),
      updatedAt: now,
    };

    try {
      await updateDoc(doc(db, 'providers', providerId), updates);
      if (payload.documents.length > 0) {
        await setDoc(doc(db, 'providerDocuments', providerId), {
          providerId,
          uid: payload.uid,
          documents: payload.documents.slice(0, 5),
          updatedAt: now,
        });
      }
      const snap = await getDoc(doc(db, 'providers', providerId));
      return {
        ...(snap.data() as ServiceProvider),
        documents: payload.documents,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `providers/${providerId}`);
    }
  }
}

export async function fetchProviderPrivateDocs(
  providerId: string
): Promise<VerificationDocument[]> {
  try {
    const snap = await getDoc(doc(db, 'providerDocuments', providerId));
    if (!snap.exists()) return [];
    const data = snap.data() as { documents?: VerificationDocument[] };
    return data.documents ?? [];
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.GET,
      `providerDocuments/${providerId}`
    );
  }
}

// --- Service Requests Lifecycle ---
export async function createServiceRequest(payload: {
  customerId: string;
  customerName: string;
  customerPhone: string;
  categoryId: string;
  categoryName: string;
  problemDescription: string;
  city: string;
  neighborhood: string;
  preferredTime: string;
}): Promise<ServiceRequest> {
  const id = makeId('req');
  const now = new Date().toISOString();
  const reqDoc: ServiceRequest = {
    id,
    customerId: payload.customerId,
    customerName: payload.customerName.trim().slice(0, 100),
    customerPhone: normalizeIraqiPhone(payload.customerPhone),
    categoryId: payload.categoryId,
    categoryName: payload.categoryName,
    problemDescription: payload.problemDescription.trim().slice(0, 1500),
    city: payload.city,
    neighborhood: payload.neighborhood,
    preferredTime: payload.preferredTime.trim().slice(0, 120),
    status: 'Pending',
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'serviceRequests', id), reqDoc);
    await createNotification({
      recipientRole: 'admin',
      recipientUid: 'admin',
      type: 'new_request',
      titleAr: 'طلب خدمة جديد من عميل',
      messageAr: `طلب جديد في تخصص (${reqDoc.categoryName}) بحي ${reqDoc.neighborhood} — ${reqDoc.city}.`,
      relatedId: id,
    });
    return reqDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `serviceRequests/${id}`);
  }
}

export async function customerCancelRequest(requestId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'serviceRequests', requestId), {
      status: 'Cancelled',
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `serviceRequests/${requestId}`
    );
  }
}

export async function customerDisputeRequest(
  requestId: string,
  disputeReason: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'serviceRequests', requestId), {
      status: 'Disputed',
      disputeReason: disputeReason.trim().slice(0, 600),
      updatedAt: new Date().toISOString(),
    });
    await createNotification({
      recipientRole: 'admin',
      recipientUid: 'admin',
      type: 'new_complaint',
      titleAr: 'نزاع مفتوح على طلب منجز',
      messageAr: `قام العميل برفع نزاع على الطلب ${requestId}: ${disputeReason.slice(0, 120)}`,
      relatedId: requestId,
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `serviceRequests/${requestId}`
    );
  }
}

// Provider actions on assigned jobs
export async function providerRespondToAssignment(
  requestId: string,
  decision: 'accepted' | 'rejected',
  agreedPrice?: number
): Promise<void> {
  try {
    const updates: Record<string, unknown> = {
      providerDecision: decision,
      status: decision === 'accepted' ? 'In Progress' : 'Approved',
      updatedAt: new Date().toISOString(),
    };
    if (decision === 'accepted' && agreedPrice && agreedPrice > 0) {
      updates.agreedPrice = agreedPrice;
    }
    await updateDoc(doc(db, 'serviceRequests', requestId), updates);
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `serviceRequests/${requestId}`
    );
  }
}

export async function providerCompleteJobAndRecordCommission(payload: {
  request: ServiceRequest;
  providerName: string;
  agreedPrice: number;
  commissionRatePercent: number;
}): Promise<{ commission: CommissionRecord; statement: WeeklyStatement }> {
  const { request, providerName, agreedPrice, commissionRatePercent } = payload;

  // 1. Compute authoritative commission on Node.js server (never client-calculated)
  const headers = await getBearerHeader();
  const computeRes = await fetch('/api/commissions/compute', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      requestId: request.id,
      providerId: request.assignedProviderId,
      providerName,
      agreedPrice,
      commissionRatePercent,
    }),
  });
  const computeJson = (await computeRes.json()) as {
    commission?: CommissionRecord;
    error?: string;
  };
  if (!computeRes.ok || !computeJson.commission) {
    throw new Error(computeJson.error || 'تعذّر احتساب العمولة على الخادم.');
  }

  const commission = computeJson.commission;

  // 2. Guard against duplicate commission transactions deterministically
  const existingComm = await getDoc(doc(db, 'commissions', commission.id));
  if (existingComm.exists()) {
    throw new Error('تم تسجيل العمولة لهذا الطلب مسبقاً.');
  }

  // 3. Update request status -> Completed
  try {
    await updateDoc(doc(db, 'serviceRequests', request.id), {
      status: 'Completed',
      agreedPrice,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `serviceRequests/${request.id}`
    );
  }

  // 4. Write deterministic commission document
  try {
    await setDoc(doc(db, 'commissions', commission.id), commission);
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `commissions/${commission.id}`
    );
  }

  // 5. Aggregate weekly statement on server from all verified commissions in this week
  const weekCommsSnap = await getDocs(
    query(
      collection(db, 'commissions'),
      where('providerId', '==', commission.providerId),
      where('weekKey', '==', commission.weekKey)
    )
  );
  const weekComms = weekCommsSnap.docs.map((d) => d.data() as CommissionRecord);

  const aggRes = await fetch('/api/commissions/aggregate-statement', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      providerId: commission.providerId,
      providerName,
      weekKey: commission.weekKey,
      items: weekComms,
    }),
  });
  const aggJson = (await aggRes.json()) as {
    statement?: WeeklyStatement;
    error?: string;
  };
  if (!aggRes.ok || !aggJson.statement) {
    throw new Error(aggJson.error || 'تعذّر تحديث الكشف الأسبوعي.');
  }

  const statement = aggJson.statement;
  const stmtRef = doc(db, 'weeklyStatements', statement.id);
  try {
    const existingStmt = await getDoc(stmtRef);
    if (existingStmt.exists()) {
      await updateDoc(stmtRef, {
        totalJobs: statement.totalJobs,
        totalGrossAmount: statement.totalGrossAmount,
        totalCommissionAmount: statement.totalCommissionAmount,
        totalNetAmount: statement.totalNetAmount,
        serverSignature: statement.serverSignature,
        updatedAt: statement.updatedAt,
      });
    } else {
      await setDoc(stmtRef, statement);
    }
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `weeklyStatements/${statement.id}`
    );
  }

  // 6. Notify Admin of completed job
  await createNotification({
    recipientRole: 'admin',
    recipientUid: 'admin',
    type: 'job_completed',
    titleAr: 'تم إتمام عمل واحتساب العمولة',
    messageAr: `أتمّ ${providerName} الطلب (${request.categoryName}) بقيمة ${agreedPrice} د.ع وبعمولة ${commission.commissionAmount} د.ع.`,
    relatedId: request.id,
  });

  return { commission, statement };
}

// --- Reviews & Complaints ---
export async function submitCustomerReview(payload: {
  providerId: string;
  customerId: string;
  customerName: string;
  neighborhood: string;
  rating: number;
  comment: string;
}): Promise<void> {
  const id = makeId('rev');
  const review: CustomerReview = {
    id,
    providerId: payload.providerId,
    customerId: payload.customerId,
    customerName: payload.customerName.trim().slice(0, 100),
    neighborhood: payload.neighborhood.trim().slice(0, 80),
    rating: payload.rating,
    comment: payload.comment.trim().slice(0, 1000),
    status: 'pending',
    createdAt: new Date().toISOString(),
    isDemo: false,
  };
  try {
    await setDoc(doc(db, 'reviews', id), review);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reviews/${id}`);
  }
}

export async function submitComplaint(payload: {
  requestId?: string;
  providerId: string;
  reporterUid: string;
  reporterName: string;
  reporterPhone: string;
  reason: string;
  details: string;
}): Promise<void> {
  const id = makeId('cmp');
  const now = new Date().toISOString();
  const complaint: ProviderReport = {
    id,
    ...(payload.requestId ? { requestId: payload.requestId } : {}),
    providerId: payload.providerId,
    reporterUid: payload.reporterUid,
    reporterName: payload.reporterName.trim().slice(0, 100),
    reporterPhone: normalizeIraqiPhone(payload.reporterPhone),
    reason: payload.reason.trim().slice(0, 200),
    details: payload.details.trim().slice(0, 1200),
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, 'complaints', id), complaint);
    await createNotification({
      recipientRole: 'admin',
      recipientUid: 'admin',
      type: 'new_complaint',
      titleAr: 'شكوى أو بلاغ جديد من عميل',
      messageAr: `بلاغ جديد حول (${complaint.reason}) بواسطة ${complaint.reporterName}.`,
      relatedId: id,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `complaints/${id}`);
  }
}

// --- Admin Management Functions ---
export async function adminUpdatePlatformCommissionRate(
  commissionRatePercent: number,
  adminUid: string
): Promise<void> {
  const settings: PlatformSettings = {
    commissionRatePercent,
    weeklyCycleDays: 7,
    updatedAt: new Date().toISOString(),
    updatedBy: adminUid,
  };
  try {
    await setDoc(doc(db, 'platformSettings', 'config'), settings);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'platformSettings/config');
  }
}

export async function adminUpdateProviderStatus(
  providerId: string,
  updates: Partial<Pick<ServiceProvider, 'approvalStatus' | 'verificationStatus' | 'verifiedAt' | 'adminNote'>>
): Promise<void> {
  try {
    await updateDoc(doc(db, 'providers', providerId), {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `providers/${providerId}`);
  }
}

export async function adminDeleteProvider(providerId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'providers', providerId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `providers/${providerId}`);
  }
}

export async function adminUpdateUserSuspension(
  uid: string,
  isSuspended: boolean
): Promise<void> {
  try {
    const headers = await getBearerHeader();
    const res = await fetch('/api/admin/audit-customer-action', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        targetUid: uid,
        action: isSuspended ? 'suspend' : 'reactivate',
      }),
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      throw new Error(json.error || 'تعذّر تفويض الإجراء الإداري على الخادم.');
    }
    await updateDoc(doc(db, 'users', uid), {
      isSuspended,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function adminSaveCustomerMeta(payload: {
  uid: string;
  adminNotes: string;
  flaggedSuspicious: boolean;
  flagReason: string;
  adminUid: string;
}): Promise<void> {
  const headers = await getBearerHeader();
  const res = await fetch('/api/admin/audit-customer-action', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      targetUid: payload.uid,
      action: payload.flaggedSuspicious ? 'flag' : 'note',
    }),
  });
  if (!res.ok) {
    const json = (await res.json()) as { error?: string };
    throw new Error(json.error || 'تعذّر التحقق من صلاحية المشرف على الخادم.');
  }

  const record: CustomerAdminMeta = {
    uid: payload.uid,
    adminNotes: payload.adminNotes.trim().slice(0, 2000),
    flaggedSuspicious: payload.flaggedSuspicious,
    flagReason: payload.flagReason.trim().slice(0, 400),
    updatedAt: new Date().toISOString(),
    updatedBy: payload.adminUid,
  };
  try {
    await setDoc(doc(db, 'customerAdminMeta', payload.uid), record);
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `customerAdminMeta/${payload.uid}`
    );
  }
}

export async function adminReviewDeletionRequest(payload: {
  request: AccountDeletionRequest;
  decision: 'approved' | 'rejected';
  adminNote: string;
  adminUid: string;
  suspendUser?: boolean;
}): Promise<void> {
  const headers = await getBearerHeader();
  const res = await fetch('/api/admin/audit-customer-action', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      targetUid: payload.request.uid,
      action: 'review_deletion',
    }),
  });
  if (!res.ok) {
    const json = (await res.json()) as { error?: string };
    throw new Error(json.error || 'تعذّر التحقق من صلاحية المشرف على الخادم.');
  }

  const now = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'accountDeletionRequests', payload.request.id), {
      status: payload.decision,
      adminNote: payload.adminNote.trim().slice(0, 600),
      reviewedBy: payload.adminUid,
      updatedAt: now,
      ...(payload.decision === 'approved' ? { completedAt: now } : {}),
    });

    if (payload.decision === 'approved' && payload.suspendUser) {
      await updateDoc(doc(db, 'users', payload.request.uid), {
        isSuspended: true,
        updatedAt: now,
      }).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `accountDeletionRequests/${payload.request.id}`
    );
  }
}

export async function adminAssignServiceRequest(payload: {
  requestId: string;
  providerId: string;
  providerName: string;
  customerId?: string;
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'serviceRequests', payload.requestId), {
      status: 'Assigned',
      assignedProviderId: payload.providerId,
      assignedProviderName: payload.providerName,
      providerDecision: 'pending',
      updatedAt: new Date().toISOString(),
    });
    await createNotification({
      recipientRole: 'provider',
      recipientUid: payload.providerId,
      type: 'assignment',
      titleAr: 'تم إسناد طلب خدمة جديد إليك',
      messageAr: `أسندت الإدارة الطلب ${payload.requestId} إليك للمراجعة والقبول.`,
      relatedId: payload.requestId,
    });
    if (payload.customerId) {
      await createNotification({
        recipientRole: 'customer',
        recipientUid: payload.customerId,
        type: 'request_status',
        titleAr: 'تم تعيين فني لطلبك',
        messageAr: `تم تعيين الفني ${payload.providerName} للطلب رقم ${payload.requestId}.`,
        relatedId: payload.requestId,
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `serviceRequests/${payload.requestId}`
    );
  }
}

export async function adminUpdateRequestStatus(
  requestId: string,
  status: ServiceRequestStatus,
  customerId?: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'serviceRequests', requestId), {
      status,
      updatedAt: new Date().toISOString(),
    });
    if (customerId) {
      await createNotification({
        recipientRole: 'customer',
        recipientUid: customerId,
        type: 'request_status',
        titleAr: 'تحديث على حالة طلب الخدمة',
        messageAr: `أصبحت حالة طلبك رقم ${requestId}: ${status}.`,
        relatedId: requestId,
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `serviceRequests/${requestId}`
    );
  }
}

export async function adminAddOrToggleCategory(
  category: ServiceCategory
): Promise<void> {
  try {
    await setDoc(doc(db, 'serviceCategories', category.id), category);
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `serviceCategories/${category.id}`
    );
  }
}

export async function adminUpdateReviewStatus(
  reviewId: string,
  status: CustomerReview['status']
): Promise<void> {
  try {
    await updateDoc(doc(db, 'reviews', reviewId), { status });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reviews/${reviewId}`);
  }
}

export async function adminResolveComplaint(
  complaintId: string,
  status: ProviderReport['status'],
  adminResolutionNote?: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'complaints', complaintId), {
      status,
      ...(adminResolutionNote ? { adminResolutionNote } : {}),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `complaints/${complaintId}`
    );
  }
}

export async function adminMarkStatementPaid(payload: {
  statement: WeeklyStatement;
  paymentMethod: PaymentGateway;
  transactionReference: string;
}): Promise<PaymentRecord> {
  const headers = await getBearerHeader();
  const res = await fetch('/api/payments/confirm-manual', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      statementId: payload.statement.id,
      providerId: payload.statement.providerId,
      providerName: payload.statement.providerName,
      amount: payload.statement.totalCommissionAmount,
      gateway: payload.paymentMethod,
      paymentReference: payload.transactionReference,
    }),
  });
  const json = (await res.json()) as { payment?: PaymentRecord; error?: string };
  if (!res.ok || !json.payment) {
    throw new Error(json.error || 'تعذّر تأكيد الدفعة على الخادم.');
  }

  const payment = json.payment;

  try {
    await setDoc(doc(db, 'payments', payment.id), payment);
    await updateDoc(doc(db, 'weeklyStatements', payload.statement.id), {
      status: 'paid',
      paymentMethod: payload.paymentMethod,
      transactionReference: payload.transactionReference.trim(),
      paidAt: payment.updatedAt,
      updatedAt: payment.updatedAt,
    });

    // Update all commissions in this statement to paid
    const commsSnap = await getDocs(
      query(
        collection(db, 'commissions'),
        where('statementId', '==', payload.statement.id)
      )
    );
    await Promise.all(
      commsSnap.docs.map((d) =>
        updateDoc(d.ref, {
          status: 'paid',
          paidAt: payment.updatedAt,
          paymentId: payment.id,
        })
      )
    );

    await createNotification({
      recipientRole: 'provider',
      recipientUid: payload.statement.providerId,
      type: 'payment_confirmed',
      titleAr: 'تم تأكيد سداد عمولة الأسبوع',
      messageAr: `تم اعتماد سداد كشف الأسبوع ${payload.statement.weekKey} بمرجع (${payment.paymentReference}).`,
      relatedId: payment.id,
    });

    return payment;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `payments/${payment.id}`
    );
  }
}

export async function adminMarkStatementOverdue(
  statement: WeeklyStatement
): Promise<void> {
  try {
    await updateDoc(doc(db, 'weeklyStatements', statement.id), {
      status: 'overdue',
      updatedAt: new Date().toISOString(),
    });
    const commsSnap = await getDocs(
      query(
        collection(db, 'commissions'),
        where('statementId', '==', statement.id)
      )
    );
    await Promise.all(
      commsSnap.docs.map((d) => updateDoc(d.ref, { status: 'overdue' }))
    );

    await createNotification({
      recipientRole: 'admin',
      recipientUid: 'admin',
      type: 'commission_overdue',
      titleAr: 'عمولة أسبوعية متأخرة السداد',
      messageAr: `تجاوز كشف ${statement.providerName} (${statement.weekKey}) موعد التسوية بمبلغ ${statement.totalCommissionAmount} د.ع.`,
      relatedId: statement.id,
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `weeklyStatements/${statement.id}`
    );
  }
}

export async function adminRefundPayment(
  paymentId: string,
  refundReason: string
): Promise<void> {
  const headers = await getBearerHeader();
  const res = await fetch('/api/payments/refund', {
    method: 'POST',
    headers,
    body: JSON.stringify({ paymentId, refundReason }),
  });
  const json = (await res.json()) as {
    status?: string;
    refundReason?: string;
    serverVerificationHash?: string;
    updatedAt?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error || 'تعذّر تسجيل الاسترجاع.');
  }
  try {
    await updateDoc(doc(db, 'payments', paymentId), {
      status: 'refunded',
      refundReason: json.refundReason,
      serverVerificationHash: json.serverVerificationHash,
      updatedAt: json.updatedAt || new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `payments/${paymentId}`);
  }
}

// --- Role-scoped Realtime Subscriptions ---
export function subscribeCustomerRequests(
  customerId: string,
  onData: (items: ServiceRequest[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'serviceRequests'),
    where('customerId', '==', customerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as ServiceRequest)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(items);
    },
    (error) =>
      handleFirestoreError(error, OperationType.LIST, 'serviceRequests')
  );
}

export function subscribeCustomerReviews(
  customerId: string,
  onData: (items: CustomerReview[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'reviews'),
    where('customerId', '==', customerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as CustomerReview)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'reviews')
  );
}

export function subscribeCustomerComplaints(
  customerId: string,
  onData: (items: ProviderReport[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'complaints'),
    where('reporterUid', '==', customerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as ProviderReport)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'complaints')
  );
}

export function subscribeCustomerNotifications(
  customerId: string,
  onData: (items: NotificationItem[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'notifications'),
    where('recipientUid', '==', customerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as NotificationItem)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'notifications')
  );
}

export function subscribeCustomerDeletionRequests(
  customerId: string,
  onData: (items: AccountDeletionRequest[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'accountDeletionRequests'),
    where('uid', '==', customerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as AccountDeletionRequest)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(items);
    },
    (error) =>
      handleFirestoreError(error, OperationType.LIST, 'accountDeletionRequests')
  );
}

export async function submitAccountDeletionRequest(payload: {
  uid: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  reason: string;
}): Promise<AccountDeletionRequest> {
  const id = makeId('del');
  const now = new Date().toISOString();
  const reqDoc: AccountDeletionRequest = {
    id,
    uid: payload.uid,
    customerName: payload.customerName.trim().slice(0, 100),
    customerEmail: payload.customerEmail.trim().slice(0, 160),
    ...(payload.customerPhone
      ? { customerPhone: normalizeIraqiPhone(payload.customerPhone) }
      : {}),
    ...(payload.reason.trim()
      ? { reason: payload.reason.trim().slice(0, 600) }
      : {}),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'accountDeletionRequests', id), reqDoc);
    await createNotification({
      recipientRole: 'admin',
      recipientUid: 'admin',
      type: 'account_deletion',
      titleAr: 'طلب حذف حساب عميل قيد المراجعة',
      messageAr: `طلب العميل ${reqDoc.customerName} (${reqDoc.customerEmail}) مراجعة حذف حسابه.`,
      relatedId: id,
    });
    return reqDoc;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `accountDeletionRequests/${id}`
    );
  }
}

export async function fetchApprovedProviderContact(providerId: string): Promise<{
  id: string;
  fullName: string;
  phone: string;
  whatsapp?: string;
} | null> {
  try {
    const snap = await getDoc(doc(db, 'providers', providerId));
    if (!snap.exists()) return null;
    const data = snap.data() as ServiceProvider;
    return {
      id: data.id,
      fullName: data.fullName,
      phone: data.phone,
      whatsapp: data.whatsapp,
    };
  } catch {
    return null;
  }
}

export function subscribeProviderWorkspace(
  providerUid: string,
  handlers: {
    onProfile: (p: ServiceProvider | null) => void;
    onJobs: (jobs: ServiceRequest[]) => void;
    onCommissions: (items: CommissionRecord[]) => void;
    onStatements: (items: WeeklyStatement[]) => void;
    onPayments: (items: PaymentRecord[]) => void;
    onNotifications: (items: NotificationItem[]) => void;
  }
): () => void {
  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      doc(db, 'providers', providerUid),
      async (snap) => {
        if (!snap.exists()) {
          handlers.onProfile(null);
          return;
        }
        const docs = await fetchProviderPrivateDocs(providerUid);
        handlers.onProfile({
          ...(snap.data() as ServiceProvider),
          documents: docs,
        });
      },
      (error) =>
        handleFirestoreError(
          error,
          OperationType.GET,
          `providers/${providerUid}`
        )
    )
  );

  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'serviceRequests'),
        where('assignedProviderId', '==', providerUid)
      ),
      (snap) => {
        handlers.onJobs(
          snap.docs
            .map((d) => d.data() as ServiceRequest)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        );
      },
      (error) =>
        handleFirestoreError(error, OperationType.LIST, 'serviceRequests')
    )
  );

  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'commissions'),
        where('providerId', '==', providerUid)
      ),
      (snap) => {
        handlers.onCommissions(
          snap.docs
            .map((d) => d.data() as CommissionRecord)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'commissions')
    )
  );

  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'weeklyStatements'),
        where('providerId', '==', providerUid)
      ),
      (snap) => {
        handlers.onStatements(
          snap.docs
            .map((d) => d.data() as WeeklyStatement)
            .sort((a, b) => b.weekKey.localeCompare(a.weekKey))
        );
      },
      (error) =>
        handleFirestoreError(error, OperationType.LIST, 'weeklyStatements')
    )
  );

  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'payments'),
        where('providerId', '==', providerUid)
      ),
      (snap) => {
        handlers.onPayments(
          snap.docs
            .map((d) => d.data() as PaymentRecord)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'payments')
    )
  );

  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'notifications'),
        where('recipientUid', '==', providerUid)
      ),
      (snap) => {
        handlers.onNotifications(
          snap.docs
            .map((d) => d.data() as NotificationItem)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        );
      },
      (error) =>
        handleFirestoreError(error, OperationType.LIST, 'notifications')
    )
  );

  return () => unsubs.forEach((u) => u());
}

export function subscribeAdminWorkspace(handlers: {
  onUsers: (users: AppUser[]) => void;
  onProviders: (providers: ServiceProvider[]) => void;
  onRequests: (requests: ServiceRequest[]) => void;
  onReviews: (reviews: CustomerReview[]) => void;
  onCommissions: (commissions: CommissionRecord[]) => void;
  onStatements: (statements: WeeklyStatement[]) => void;
  onPayments: (payments: PaymentRecord[]) => void;
  onNotifications: (notifications: NotificationItem[]) => void;
  onComplaints: (complaints: ProviderReport[]) => void;
  onCustomerMeta?: (meta: CustomerAdminMeta[]) => void;
  onDeletionRequests?: (requests: AccountDeletionRequest[]) => void;
}): () => void {
  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      collection(db, 'users'),
      (snap) => handlers.onUsers(snap.docs.map((d) => d.data() as AppUser)),
      (error) => handleFirestoreError(error, OperationType.LIST, 'users')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'providers'),
      (snap) =>
        handlers.onProviders(
          snap.docs.map((d) => ({
            ...(d.data() as ServiceProvider),
            documents: [],
          }))
        ),
      (error) => handleFirestoreError(error, OperationType.LIST, 'providers')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'serviceRequests'),
      (snap) =>
        handlers.onRequests(
          snap.docs
            .map((d) => d.data() as ServiceRequest)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        ),
      (error) =>
        handleFirestoreError(error, OperationType.LIST, 'serviceRequests')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'reviews'),
      (snap) =>
        handlers.onReviews(
          snap.docs
            .map((d) => d.data() as CustomerReview)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        ),
      (error) => handleFirestoreError(error, OperationType.LIST, 'reviews')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'commissions'),
      (snap) =>
        handlers.onCommissions(
          snap.docs
            .map((d) => d.data() as CommissionRecord)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        ),
      (error) => handleFirestoreError(error, OperationType.LIST, 'commissions')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'weeklyStatements'),
      (snap) =>
        handlers.onStatements(
          snap.docs
            .map((d) => d.data() as WeeklyStatement)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        ),
      (error) =>
        handleFirestoreError(error, OperationType.LIST, 'weeklyStatements')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'payments'),
      (snap) =>
        handlers.onPayments(
          snap.docs
            .map((d) => d.data() as PaymentRecord)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        ),
      (error) => handleFirestoreError(error, OperationType.LIST, 'payments')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'notifications'),
      (snap) =>
        handlers.onNotifications(
          snap.docs
            .map((d) => d.data() as NotificationItem)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        ),
      (error) =>
        handleFirestoreError(error, OperationType.LIST, 'notifications')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'complaints'),
      (snap) =>
        handlers.onComplaints(
          snap.docs
            .map((d) => d.data() as ProviderReport)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        ),
      (error) => handleFirestoreError(error, OperationType.LIST, 'complaints')
    )
  );

  if (handlers.onCustomerMeta) {
    unsubs.push(
      onSnapshot(
        collection(db, 'customerAdminMeta'),
        (snap) =>
          handlers.onCustomerMeta?.(
            snap.docs.map((d) => d.data() as CustomerAdminMeta)
          ),
        (error) =>
          handleFirestoreError(error, OperationType.LIST, 'customerAdminMeta')
      )
    );
  }

  if (handlers.onDeletionRequests) {
    unsubs.push(
      onSnapshot(
        collection(db, 'accountDeletionRequests'),
        (snap) =>
          handlers.onDeletionRequests?.(
            snap.docs
              .map((d) => d.data() as AccountDeletionRequest)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          ),
        (error) =>
          handleFirestoreError(
            error,
            OperationType.LIST,
            'accountDeletionRequests'
          )
      )
    );
  }

  return () => unsubs.forEach((u) => u());
}
