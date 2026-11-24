# Khidmati Firestore Security Specification

## 1. Data Invariants
1. **No Self-Assigned Admin**: No user may create or update their `/users/{uid}` document with `role == 'admin'`, nor create a document in `/admins/{uid}` unless already an admin.
2. **Pending Provider Gate**: New `/providers/{providerId}` documents created by a non-admin MUST have `approvalStatus == 'pending'` and `verificationStatus == 'unverified'`. Public queries can only read `approvalStatus == 'approved'`.
3. **Private Document Isolation**: Verification documents in `/providerDocuments/{providerId}` are NEVER publicly readable; access is restricted strictly to `request.auth.uid == providerId` or `isAdmin()`.
4. **PII Isolation on Users**: `/users/{userId}` contains `email` and `phone` and is readable strictly by `isOwner(userId)` or `isAdmin()`.
5. **Request Ownership & State Machine**: A `serviceRequest` created by a customer MUST start with `status == 'Pending'`, `customerId == request.auth.uid`, and no `assignedProviderId`. Terminal states (`Completed`, `Cancelled`) cannot be reverted by non-admins except a customer raising `Completed -> Disputed`.
6. **Duplicate Commission Prevention**: `/commissions/comm_{requestId}` uses a deterministic ID tied to `requestId`, preventing duplicate commission transactions. Only `isAdmin()` or the assigned provider completing a job with a valid server-signed `serverSignature` may create a commission record, and ONLY `isAdmin()` may mark commissions or weekly statements as `paid`.
7. **Server-Calculated Financials**: All financial calculations (`commissionAmount`, `providerNetAmount`, `commissionRatePercent`) are computed on the Node.js server and validated via `serverSignature`.

## 2. Adversarial Payloads ("Dirty Dozen")
1. **Role Escalation on Signup**: `PUT /users/attacker` with `{ role: "admin" }` -> `PERMISSION_DENIED`.
2. **Self-Verification on Registration**: `PUT /providers/attacker` with `{ approvalStatus: "approved", verificationStatus: "verified" }` -> `PERMISSION_DENIED`.
3. **Shadow Field Injection**: `PATCH /providers/uid1` with `{ fullName: "Valid", isVerified: true }` -> `PERMISSION_DENIED`.
4. **ID Poisoning**: `PUT /serviceRequests/${"a".repeat(200)}` -> `PERMISSION_DENIED` (fails `isValidId`).
5. **PII Scraping**: `GET /users/otherUid` by signed-in non-admin customer -> `PERMISSION_DENIED`.
6. **Private ID Document Exposure**: `GET /providerDocuments/prov1` by unauthenticated or non-owner customer -> `PERMISSION_DENIED`.
7. **Unverified Email Write**: `POST /serviceRequests` where `request.auth.token.email_verified == false` -> `PERMISSION_DENIED`.
8. **Fake Review Auto-Approve**: `POST /reviews/rev1` by customer with `{ status: "approved" }` -> `PERMISSION_DENIED`.
9. **Provider Marking Own Statement Paid**: `PATCH /weeklyStatements/stmt_p1_2026W48` by provider with `{ status: "paid" }` -> `PERMISSION_DENIED`.
10. **Negative Price / Negative Commission Tampering**: `POST /commissions/comm_req1` with `{ agreedPrice: -5000, commissionAmount: 0 }` -> `PERMISSION_DENIED`.
11. **Request Hijacking**: `PATCH /serviceRequests/req1` by unrelated user trying to assign themselves -> `PERMISSION_DENIED`.
12. **Blanket List Scraping of Pending Providers / Complaints**: `LIST /complaints` or `LIST /serviceRequests` without matching owner/admin filter -> `PERMISSION_DENIED`.
