import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read Firebase public web config safely from firebase-applet-config.json
const firebaseConfigPath = path.resolve(__dirname, 'firebase-applet-config.json');
interface FirebasePublicConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
}
let firebasePublicConfig: FirebasePublicConfig = {
  projectId: '',
  appId: '',
  apiKey: '',
  authDomain: '',
};
if (fs.existsSync(firebaseConfigPath)) {
  firebasePublicConfig = JSON.parse(
    fs.readFileSync(firebaseConfigPath, 'utf8')
  ) as FirebasePublicConfig;
}
const firebaseProjectId = firebasePublicConfig.projectId ?? '';

const adminApp =
  getApps().length > 0
    ? getApp()
    : initializeApp(firebaseProjectId ? { projectId: firebaseProjectId } : undefined);
const adminAuth = getAuth(adminApp);

// Server-only signing secret with cryptographically random in-memory fallback
const SERVER_SIGNING_SECRET =
  process.env.KHIDMATI_SIGNING_SECRET || crypto.randomBytes(32).toString('hex');

const BOOTSTRAP_ADMIN_EMAIL = 'gggggdg072@gmail.com';

interface AuthenticatedRequest extends Request {
  authUser?: DecodedIdToken;
}

function getIsoWeekInfo(dateInput?: string): {
  weekKey: string;
  periodStart: string;
  periodEnd: string;
} {
  const date = dateInput ? new Date(dateInput) : new Date();
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const weekKey = `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;

  // Compute Monday..Sunday range for the ISO week
  const ref = dateInput ? new Date(dateInput) : new Date();
  const day = ref.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() + diffToMonday));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    weekKey,
    periodStart: monday.toISOString().slice(0, 10),
    periodEnd: sunday.toISOString().slice(0, 10),
  };
}

function signPayload(payload: string): string {
  return crypto
    .createHmac('sha256', SERVER_SIGNING_SECRET)
    .update(payload)
    .digest('hex');
}

function verifySignature(payload: string, signature: string): boolean {
  const expected = signPayload(payload);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function commissionCanonicalString(data: {
  requestId: string;
  providerId: string;
  agreedPrice: number;
  commissionRatePercent: number;
  commissionAmount: number;
  providerNetAmount: number;
  weekKey: string;
}): string {
  return [
    data.requestId,
    data.providerId,
    data.agreedPrice,
    data.commissionRatePercent,
    data.commissionAmount,
    data.providerNetAmount,
    data.weekKey,
  ].join('|');
}

async function requireFirebaseAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'مطلوب تسجيل الدخول لإتمام هذه العملية.' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'رمز التحقق غير صالح.' });
    return;
  }
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email_verified) {
      res.status(403).json({ error: 'يجب أن يكون البريد الإلكتروني موثقاً.' });
      return;
    }
    req.authUser = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'انتهت صلاحية الجلسة أو تعذّر التحقق من الهوية.' });
  }
}

function isServerAdmin(user?: DecodedIdToken): boolean {
  if (!user) return false;
  return Boolean(
    user.email_verified &&
      (user.email === BOOTSTRAP_ADMIN_EMAIL || user.role === 'admin')
  );
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);

  // Preserve popup window.opener communication across Google OAuth popups
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });

  // Same-origin Firebase Hosting init.json for proxied /__/auth/handler compatibility
  app.get('/__/firebase/init.json', (req: Request, res: Response) => {
    const reqHost = req.get('host') || '';
    const hostname = reqHost.split(':')[0] || '';
    const useReqHost =
      hostname.endsWith('.run.app') ||
      hostname.endsWith('.firebaseapp.com') ||
      hostname.endsWith('.web.app');

    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      apiKey: firebasePublicConfig.apiKey,
      appId: firebasePublicConfig.appId,
      authDomain: useReqHost ? reqHost : firebasePublicConfig.authDomain,
      projectId: firebasePublicConfig.projectId,
      storageBucket: firebasePublicConfig.storageBucket || '',
      messagingSenderId: firebasePublicConfig.messagingSenderId || '',
    });
  });

  // Same-origin reverse proxy for /__/auth/* (fixes iOS Safari / ITP third-party storage blocking)
  app.use(
    '/__/auth',
    express.raw({ type: '*/*', limit: '1mb' }),
    async (req: Request, res: Response) => {
      const targetDomain = firebasePublicConfig.authDomain;
      if (!targetDomain || !/^[a-zA-Z0-9.-]+$/.test(targetDomain)) {
        res.status(500).send('Firebase authDomain not configured.');
        return;
      }

      const targetUrl = `https://${targetDomain}${req.originalUrl}`;
      const forwardHeaders: Record<string, string> = {};
      for (const key of [
        'accept',
        'accept-language',
        'cookie',
        'content-type',
        'user-agent',
      ]) {
        const val = req.headers[key];
        if (typeof val === 'string') {
          forwardHeaders[key] = val;
        }
      }

      try {
        const hasBody =
          req.method !== 'GET' &&
          req.method !== 'HEAD' &&
          Buffer.isBuffer(req.body) &&
          req.body.length > 0;

        const upstream = await fetch(targetUrl, {
          method: req.method,
          headers: forwardHeaders,
          body: hasBody ? new Uint8Array(req.body) : undefined,
          redirect: 'manual',
        });

        res.status(upstream.status);
        for (const key of ['content-type', 'cache-control', 'location']) {
          const val = upstream.headers.get(key);
          if (val) {
            res.setHeader(key, val);
          }
        }
        const setCookies =
          typeof upstream.headers.getSetCookie === 'function'
            ? upstream.headers.getSetCookie()
            : [];
        if (setCookies.length > 0) {
          res.setHeader('set-cookie', setCookies);
        }

        const buffer = Buffer.from(await upstream.arrayBuffer());
        res.send(buffer);
      } catch (err) {
        console.error('Firebase Auth proxy error:', err);
        res.status(502).send('Unable to reach Firebase Auth handler.');
      }
    }
  );

  app.use(express.json({ limit: '1mb' }));

  // Health & Gateway Readiness (never exposes secrets)
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      zainCashConfigured: Boolean(
        process.env.ZAINCASH_MERCHANT_ID && process.env.ZAINCASH_MERCHANT_SECRET
      ),
      zainCashWebhookConfigured: Boolean(process.env.ZAINCASH_WEBHOOK_SECRET),
      emailProviderConfigured: Boolean(process.env.EMAIL_SMTP_URL),
    });
  });

  // Server-side authoritative commission calculation (never trust frontend math)
  app.post(
    '/api/commissions/compute',
    requireFirebaseAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const body = req.body as {
        requestId?: unknown;
        providerId?: unknown;
        providerName?: unknown;
        agreedPrice?: unknown;
        commissionRatePercent?: unknown;
      };

      if (
        typeof body.requestId !== 'string' ||
        !/^[a-zA-Z0-9_\-]+$/.test(body.requestId) ||
        typeof body.providerId !== 'string' ||
        !/^[a-zA-Z0-9_\-]+$/.test(body.providerId) ||
        typeof body.providerName !== 'string' ||
        body.providerName.trim().length < 2
      ) {
        res.status(400).json({ error: 'معرفات الطلب أو مقدم الخدمة غير صالحة.' });
        return;
      }

      const agreedPrice = Number(body.agreedPrice);
      if (!Number.isFinite(agreedPrice) || agreedPrice <= 0 || agreedPrice > 100000000) {
        res.status(400).json({ error: 'المبلغ المتفق عليه يجب أن يكون أكبر من صفر.' });
        return;
      }

      const rawRate = body.commissionRatePercent === undefined ? 10 : Number(body.commissionRatePercent);
      if (!Number.isFinite(rawRate) || rawRate < 0 || rawRate > 50) {
        res.status(400).json({ error: 'نسبة العمولة يجب أن تكون بين 0% و 50%.' });
        return;
      }

      const commissionRatePercent = Number(rawRate.toFixed(2));
      const commissionAmount = Math.round((agreedPrice * commissionRatePercent) / 100);
      const providerNetAmount = agreedPrice - commissionAmount;
      const { weekKey, periodStart, periodEnd } = getIsoWeekInfo();
      const statementId = `stmt_${body.providerId}_${weekKey}`;
      const createdAt = new Date().toISOString();

      const canonical = commissionCanonicalString({
        requestId: body.requestId,
        providerId: body.providerId,
        agreedPrice,
        commissionRatePercent,
        commissionAmount,
        providerNetAmount,
        weekKey,
      });
      const serverSignature = signPayload(canonical);

      res.json({
        commission: {
          id: `comm_${body.requestId}`,
          requestId: body.requestId,
          providerId: body.providerId,
          providerName: body.providerName.trim(),
          agreedPrice,
          commissionRatePercent,
          commissionAmount,
          providerNetAmount,
          statementId,
          weekKey,
          status: 'unpaid',
          serverSignature,
          createdAt,
        },
        weekMeta: {
          statementId,
          weekKey,
          periodStart,
          periodEnd,
        },
      });
    }
  );

  // Server-side weekly statement aggregation verifying every commission signature
  app.post(
    '/api/commissions/aggregate-statement',
    requireFirebaseAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const body = req.body as {
        providerId?: unknown;
        providerName?: unknown;
        weekKey?: unknown;
        items?: Array<{
          requestId: string;
          providerId: string;
          agreedPrice: number;
          commissionRatePercent: number;
          commissionAmount: number;
          providerNetAmount: number;
          weekKey: string;
          serverSignature: string;
        }>;
      };

      if (
        typeof body.providerId !== 'string' ||
        typeof body.providerName !== 'string' ||
        typeof body.weekKey !== 'string' ||
        !Array.isArray(body.items)
      ) {
        res.status(400).json({ error: 'بيانات الكشف الأسبوعي غير مكتملة.' });
        return;
      }

      let totalGrossAmount = 0;
      let totalCommissionAmount = 0;
      let totalNetAmount = 0;
      const seenRequests = new Set<string>();

      for (const item of body.items) {
        if (item.providerId !== body.providerId || item.weekKey !== body.weekKey) {
          res.status(400).json({ error: 'تعارض في بيانات الكشف الأسبوعي.' });
          return;
        }
        if (seenRequests.has(item.requestId)) {
          res.status(409).json({ error: 'تم اكتشاف عمولة مكررة لنفس الطلب.' });
          return;
        }
        seenRequests.add(item.requestId);

        const valid = verifySignature(commissionCanonicalString(item), item.serverSignature);
        if (!valid) {
          res.status(403).json({ error: 'تعذّر التحقق من توقيع الخادم لأحد السجلات المالية.' });
          return;
        }

        totalGrossAmount += item.agreedPrice;
        totalCommissionAmount += item.commissionAmount;
        totalNetAmount += item.providerNetAmount;
      }

      const { periodStart, periodEnd } = getIsoWeekInfo();
      const statementId = `stmt_${body.providerId}_${body.weekKey}`;
      const updatedAt = new Date().toISOString();
      const serverSignature = signPayload(
        `${statementId}|${seenRequests.size}|${totalGrossAmount}|${totalCommissionAmount}|${totalNetAmount}`
      );

      res.json({
        statement: {
          id: statementId,
          providerId: body.providerId,
          providerName: body.providerName,
          weekKey: body.weekKey,
          periodStart,
          periodEnd,
          totalJobs: seenRequests.size,
          totalGrossAmount,
          totalCommissionAmount,
          totalNetAmount,
          status: 'open',
          updatedAt,
          serverSignature,
        },
      });
    }
  );

  // Payment intent creation (manual v1 + ZainCash future readiness)
  app.post(
    '/api/payments/create-intent',
    requireFirebaseAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const body = req.body as {
        statementId?: unknown;
        providerId?: unknown;
        providerName?: unknown;
        amount?: unknown;
        gateway?: unknown;
        paymentReference?: unknown;
      };

      const amount = Number(body.amount);
      if (
        typeof body.statementId !== 'string' ||
        typeof body.providerId !== 'string' ||
        typeof body.providerName !== 'string' ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        res.status(400).json({ error: 'بيانات طلب الدفع غير مكتملة أو غير صالحة.' });
        return;
      }

      if (body.gateway === 'zaincash_future') {
        const hasCreds = Boolean(
          process.env.ZAINCASH_MERCHANT_ID && process.env.ZAINCASH_MERCHANT_SECRET
        );
        if (!hasCreds) {
          res.status(501).json({
            configured: false,
            error:
              'بوابة الدفع الإلكتروني (زين كاش) مهيأة معمارياً ولكنها غير مفعّلة بعد لعدم توفر بيانات التاجر الرسمية في متغيرات الخادم.',
          });
          return;
        }
      }

      const gateway =
        body.gateway === 'manual_transfer' || body.gateway === 'manual_cash'
          ? body.gateway
          : 'manual_cash';
      const now = new Date().toISOString();
      const paymentId = `pay_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
      const paymentReference =
        typeof body.paymentReference === 'string' && body.paymentReference.trim().length >= 2
          ? body.paymentReference.trim()
          : `KH-${Date.now().toString().slice(-6)}`;
      const serverVerificationHash = signPayload(`${paymentId}|${body.statementId}|${amount}|${gateway}`);

      res.json({
        payment: {
          id: paymentId,
          statementId: body.statementId,
          providerId: body.providerId,
          providerName: body.providerName.trim(),
          amount,
          currency: 'IQD',
          gateway,
          status: 'pending',
          paymentReference,
          serverVerificationHash,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  );

  // Admin-only manual payment confirmation
  app.post(
    '/api/payments/confirm-manual',
    requireFirebaseAuth,
    (req: AuthenticatedRequest, res: Response) => {
      if (!isServerAdmin(req.authUser)) {
        res.status(403).json({ error: 'هذا الإجراء متاح للمشرفين المخولين فقط.' });
        return;
      }

      const body = req.body as {
        statementId?: unknown;
        providerId?: unknown;
        providerName?: unknown;
        amount?: unknown;
        gateway?: unknown;
        paymentReference?: unknown;
      };

      const amount = Number(body.amount);
      if (
        typeof body.statementId !== 'string' ||
        typeof body.providerId !== 'string' ||
        typeof body.providerName !== 'string' ||
        !Number.isFinite(amount) ||
        amount < 0 ||
        typeof body.paymentReference !== 'string' ||
        body.paymentReference.trim().length < 2
      ) {
        res.status(400).json({ error: 'يرجى إدخال مرجع التحويل والمبلغ الصحيح.' });
        return;
      }

      const gateway =
        body.gateway === 'manual_transfer' ? 'manual_transfer' : 'manual_cash';
      const now = new Date().toISOString();
      const paymentId = `pay_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
      const serverVerificationHash = signPayload(
        `CONFIRMED|${paymentId}|${body.statementId}|${amount}|${req.authUser?.uid}`
      );

      res.json({
        payment: {
          id: paymentId,
          statementId: body.statementId,
          providerId: body.providerId,
          providerName: body.providerName.trim(),
          amount,
          currency: 'IQD',
          gateway,
          status: 'confirmed',
          paymentReference: body.paymentReference.trim(),
          confirmedByAdminUid: req.authUser?.uid,
          serverVerificationHash,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  );

  // Admin-only refund tracking preparation
  app.post(
    '/api/payments/refund',
    requireFirebaseAuth,
    (req: AuthenticatedRequest, res: Response) => {
      if (!isServerAdmin(req.authUser)) {
        res.status(403).json({ error: 'صلاحية الإشراف مطلوبة لتسجيل الاسترجاع.' });
        return;
      }
      const body = req.body as { paymentId?: unknown; refundReason?: unknown };
      if (
        typeof body.paymentId !== 'string' ||
        typeof body.refundReason !== 'string' ||
        body.refundReason.trim().length < 4
      ) {
        res.status(400).json({ error: 'يرجى تحديد معرف الدفعة وسبب الاسترجاع.' });
        return;
      }
      const updatedAt = new Date().toISOString();
      const serverVerificationHash = signPayload(
        `REFUNDED|${body.paymentId}|${req.authUser?.uid}|${updatedAt}`
      );
      res.json({
        status: 'refunded',
        refundReason: body.refundReason.trim(),
        serverVerificationHash,
        updatedAt,
      });
    }
  );

  // Future ZainCash Webhook endpoint (fails closed when webhook secret is absent)
  app.post('/api/webhooks/zaincash', (req: Request, res: Response) => {
    const webhookSecret = process.env.ZAINCASH_WEBHOOK_SECRET;
    if (!webhookSecret) {
      res.status(503).json({
        error: 'ZainCash webhook secret is not configured on the server.',
      });
      return;
    }

    const signature = String(req.headers['x-zaincash-signature'] || '');
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body ?? {}))
      .digest('hex');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      res.status(401).json({ error: 'Invalid webhook signature.' });
      return;
    }

    res.json({ received: true, verified: true });
  });

  // Email notification queue bridge (ready for SMTP/Resend integration)
  app.post(
    '/api/notifications/email-dispatch',
    requireFirebaseAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const body = req.body as { type?: unknown; titleAr?: unknown };
      if (typeof body.type !== 'string' || typeof body.titleAr !== 'string') {
        res.status(400).json({ error: 'بيانات الإشعار غير مكتملة.' });
        return;
      }
      const smtpConfigured = Boolean(process.env.EMAIL_SMTP_URL);
      res.json({
        queued: true,
        emailSent: false,
        mode: smtpConfigured ? 'smtp_ready' : 'in_app_only_smtp_not_configured',
      });
    }
  );

  // Verify recent Firebase Authentication (within 5 minutes) for sensitive customer operations
  app.post(
    '/api/auth/verify-recent-auth',
    requireFirebaseAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const authTime = req.authUser?.auth_time ?? 0;
      const nowSec = Math.floor(Date.now() / 1000);
      const ageSeconds = Math.max(0, nowSec - authTime);

      if (ageSeconds > 300) {
        res.status(403).json({
          requiresRecentAuth: true,
          ageSeconds,
          error:
            'لأسباب أمنية، مرّ وقت على تسجيل دخولك. يرجى إعادة تأكيد هويتك للمتابعة.',
        });
        return;
      }

      const verifiedAt = new Date().toISOString();
      const reauthSignature = signPayload(
        `REAUTH|${req.authUser?.uid}|${authTime}|${verifiedAt}`
      );
      res.json({
        verified: true,
        ageSeconds,
        verifiedAt,
        reauthSignature,
        phoneVerifiedOnAuth: Boolean(req.authUser?.phone_number),
        phoneNumber: req.authUser?.phone_number ?? null,
      });
    }
  );

  // Confirm server-side that Firebase Phone Auth OTP linked a real verified phone_number into the ID token
  app.post(
    '/api/customer/verify-phone-claim',
    requireFirebaseAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const tokenPhone = req.authUser?.phone_number;
      if (!tokenPhone) {
        res.status(403).json({
          error:
            'لم يتم العثور على رقم هاتف موثق برمز OTP في جلسة Firebase الحالية.',
        });
        return;
      }

      const body = req.body as { expectedE164?: unknown };
      if (
        typeof body.expectedE164 === 'string' &&
        body.expectedE164.trim() &&
        body.expectedE164.trim() !== tokenPhone
      ) {
        res.status(400).json({
          error: 'رقم الهاتف المدخل لا يطابق الرقم الموثق في Firebase Authentication.',
        });
        return;
      }

      const verifiedAt = new Date().toISOString();
      const serverSignature = signPayload(
        `PHONE_VERIFIED|${req.authUser?.uid}|${tokenPhone}|${verifiedAt}`
      );
      res.json({
        verified: true,
        phoneNumber: tokenPhone,
        verifiedAt,
        serverSignature,
      });
    }
  );

  // Authorize customer account deletion after fresh re-authentication
  app.post(
    '/api/customer/authorize-deletion',
    requireFirebaseAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const uid = req.authUser?.uid;
      if (!uid) {
        res.status(401).json({ error: 'تعذّر التحقق من هوية المستخدم.' });
        return;
      }
      if (req.authUser?.email === BOOTSTRAP_ADMIN_EMAIL) {
        res.status(403).json({
          error: 'لا يمكن حذف حساب المشرف الرئيسي للمنصة ذاتياً.',
        });
        return;
      }

      const authTime = req.authUser?.auth_time ?? 0;
      const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000) - authTime);
      if (ageSeconds > 300) {
        res.status(403).json({
          requiresRecentAuth: true,
          error:
            'يتطلب حذف الحساب إعادة تأكيد الهوية حديثاً خلال آخر 5 دقائق.',
        });
        return;
      }

      const authorizedAt = new Date().toISOString();
      const deletionReceipt = signPayload(`DELETE_ACC|${uid}|${authorizedAt}`);
      res.json({
        authorized: true,
        authorizedAt,
        deletionReceipt,
      });
    }
  );

  // Server-authorized audit endpoint for Admin Customer Management mutations
  app.post(
    '/api/admin/audit-customer-action',
    requireFirebaseAuth,
    (req: AuthenticatedRequest, res: Response) => {
      if (!isServerAdmin(req.authUser)) {
        res.status(403).json({
          error: 'صلاحية المشرف مطلوبة لإدارة حسابات العملاء.',
        });
        return;
      }

      const body = req.body as { targetUid?: unknown; action?: unknown };
      if (
        typeof body.targetUid !== 'string' ||
        !/^[a-zA-Z0-9_\-]+$/.test(body.targetUid) ||
        typeof body.action !== 'string' ||
        !['suspend', 'reactivate', 'note', 'flag', 'review_deletion'].includes(
          body.action
        )
      ) {
        res.status(400).json({ error: 'بيانات الإجراء الإداري غير صالحة.' });
        return;
      }

      const auditedAt = new Date().toISOString();
      const auditSignature = signPayload(
        `ADMIN_CUST|${req.authUser?.uid}|${body.targetUid}|${body.action}|${auditedAt}`
      );
      res.json({
        audited: true,
        adminUid: req.authUser?.uid,
        auditedAt,
        auditSignature,
      });
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Khidmati server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Khidmati server:', err);
  process.exit(1);
});
