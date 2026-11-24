export type AppPage =
  | 'home'
  | 'categories'
  | 'directory'
  | 'profile'
  | 'register'
  | 'auth'
  | 'request-service'
  | 'customer'
  | 'provider-dashboard'
  | 'admin';

export type UserRole = 'customer' | 'provider' | 'admin';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type VerificationStatus = 'verified' | 'unverified';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export type ServiceRequestStatus =
  | 'Pending'
  | 'Approved'
  | 'Assigned'
  | 'In Progress'
  | 'Completed'
  | 'Cancelled'
  | 'Disputed';

export type CommissionStatus = 'unpaid' | 'paid' | 'overdue';
export type StatementStatus = 'open' | 'due' | 'paid' | 'overdue';
export type PaymentGateway = 'manual_cash' | 'manual_transfer' | 'zaincash_future';
export type PaymentStatus = 'pending' | 'initiated' | 'confirmed' | 'failed' | 'refunded';
export type ComplaintStatus = 'open' | 'investigating' | 'resolved';

export type NotificationType =
  | 'new_provider'
  | 'new_request'
  | 'job_completed'
  | 'commission_overdue'
  | 'new_complaint'
  | 'assignment'
  | 'payment_confirmed'
  | 'request_status'
  | 'account_deletion';

export type CategoryIconName =
  | 'zap'
  | 'droplets'
  | 'hammer'
  | 'wind'
  | 'sparkles'
  | 'paintbrush'
  | 'wrench'
  | 'tv';

export interface SavedAddress {
  id: string;
  label: string;
  city: string;
  neighborhood: string;
  streetDetails: string;
  landmark?: string;
  isDefault: boolean;
}

export interface NotificationPreferences {
  requestUpdates: boolean;
  providerMessages: boolean;
  promotions: boolean;
  emailNotifications: boolean;
}

export interface AppUser {
  uid: string;
  displayName: string;
  email: string;
  phone?: string;
  phoneVerified?: boolean;
  phoneVerifiedAt?: string;
  photoUrl?: string;
  authProviders?: string[];
  role: UserRole;
  city?: string;
  neighborhood?: string;
  savedAddresses?: SavedAddress[];
  notificationPreferences?: NotificationPreferences;
  isSuspended: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerAdminMeta {
  uid: string;
  adminNotes?: string;
  flaggedSuspicious: boolean;
  flagReason?: string;
  updatedAt: string;
  updatedBy: string;
}

export type DeletionRequestStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface AccountDeletionRequest {
  id: string;
  uid: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  reason?: string;
  status: DeletionRequestStatus;
  adminNote?: string;
  reviewedBy?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformSettings {
  commissionRatePercent: number;
  weeklyCycleDays: number;
  updatedAt: string;
  updatedBy: string;
}

export interface ServiceCategory {
  id: string;
  slug: string;
  nameAr: string;
  descriptionAr: string;
  examplesAr: string[];
  icon: CategoryIconName;
  isActive: boolean;
}

export interface VerificationDocument {
  id: string;
  label: string;
  fileName: string;
  uploadedAt: string;
  previewDataUrl?: string;
}

export interface ServiceProvider {
  id: string;
  uid?: string;
  fullName: string;
  phone: string;
  whatsapp?: string;
  categoryId: string;
  city: string;
  neighborhood: string;
  serviceAreas: string[];
  yearsExperience: number;
  description: string;
  profileImage: string;
  approvalStatus: ApprovalStatus;
  verificationStatus: VerificationStatus;
  verifiedAt?: string;
  createdAt: string;
  updatedAt?: string;
  isDemo: boolean;
  documents: VerificationDocument[];
  adminNote?: string;
}

export interface ServiceRequest {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  categoryId: string;
  categoryName: string;
  problemDescription: string;
  city: string;
  neighborhood: string;
  preferredTime: string;
  status: ServiceRequestStatus;
  assignedProviderId?: string;
  assignedProviderName?: string;
  providerDecision?: 'pending' | 'accepted' | 'rejected';
  agreedPrice?: number;
  disputeReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerReview {
  id: string;
  providerId: string;
  customerId?: string;
  customerName: string;
  neighborhood: string;
  rating: number;
  comment: string;
  createdAt: string;
  status: ReviewStatus;
  isDemo: boolean;
}

export interface CommissionRecord {
  id: string;
  requestId: string;
  providerId: string;
  providerName: string;
  agreedPrice: number;
  commissionRatePercent: number;
  commissionAmount: number;
  providerNetAmount: number;
  statementId: string;
  weekKey: string;
  status: CommissionStatus;
  serverSignature: string;
  createdAt: string;
  paidAt?: string;
  paymentId?: string;
}

export interface WeeklyStatement {
  id: string;
  providerId: string;
  providerName: string;
  weekKey: string;
  periodStart: string;
  periodEnd: string;
  totalJobs: number;
  totalGrossAmount: number;
  totalCommissionAmount: number;
  totalNetAmount: number;
  status: StatementStatus;
  paymentMethod?: string;
  transactionReference?: string;
  paidAt?: string;
  updatedAt: string;
  serverSignature?: string;
}

export interface PaymentRecord {
  id: string;
  statementId: string;
  providerId: string;
  providerName: string;
  amount: number;
  currency: 'IQD';
  gateway: PaymentGateway;
  status: PaymentStatus;
  paymentReference: string;
  gatewayTransactionId?: string;
  confirmedByAdminUid?: string;
  refundReason?: string;
  serverVerificationHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  recipientRole: UserRole;
  recipientUid: string;
  type: NotificationType;
  titleAr: string;
  messageAr: string;
  relatedId?: string;
  isRead: boolean;
  emailQueued: boolean;
  createdAt: string;
}

export interface ProviderReport {
  id: string;
  requestId?: string;
  providerId: string;
  reporterUid?: string;
  reporterName: string;
  reporterPhone: string;
  reason: string;
  details: string;
  createdAt: string;
  status: ComplaintStatus;
  adminResolutionNote?: string;
  updatedAt?: string;
}

export type SortOption =
  | 'verified_first'
  | 'highest_rated'
  | 'most_experienced'
  | 'newest';

export interface DirectoryFilters {
  query: string;
  categoryId: string;
  city: string;
  neighborhood: string;
  minRating: number;
  verification: 'all' | 'verified' | 'unverified';
  sort: SortOption;
}
