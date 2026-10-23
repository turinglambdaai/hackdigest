# HackDigest product and pricing plan

**English** · [简体中文](PRICING.zh-CN.md)

## Launch status and implementation boundaries

- Policy version: `2026-10-v2`, 2026-10-23. The owner confirmed that every product is still in development and has no actual users. This document replaces conflicting previous pricing, early-bird and Pro proposals; there is no existing customer cohort to migrate. **Prices are launch targets, not live offers or claims that the listed features are implemented.**
- Entitlements cover delivered platforms only. New commercial plans do not change the LICENSE of released source. Source use, modification and redistribution rights are separate from official products, updates and services.
- Security fixes and reading, backing up or exporting your own data must not require another purchase. BYOK keys, payment-provider secrets and issuer private keys have different owners. Native hosts do not collect payment or issue credentials directly.

## Decision

**Free BYOK with a capped hosted subscription**

Launch target: **Hosted launch target: ¥19 / US$3 per month, or ¥190 / US$30 per year; no lifetime hosting**. CNY and USD are independently set regional targets, not a live exchange-rate conversion.

No-setup inference has an ongoing cost, making a subscription appropriate. Start with one understandable capped plan, not vague fair-use limits or a lifetime AI purchase with unlimited liabilities.

## Free and paid scope

Free / evaluation: The client, HN reading, all BYOK translation/digests and local caches are free. The application adds no paid BYOK quota; your provider charges and limits still apply.

Paid: The hosted launch plan contains translation and digests only, without unreleased sync or mobile. Per account per day: at most 20 title translations and 3 article/thread digests. Each title is capped at 300 Unicode code points, article input at 8,000 and total thread input at 16,000. Overlong input is explicitly truncated with a notice. Failures do not consume quota; rereading a successful cached result does not consume it again. Quota resets at 00:00 UTC daily and does not roll over.

## Subscription boundaries

Hosted usage is metered by account, not device. Service within the current monthly/annual period follows the published allowance. Cancellation stops renewal, while the paid period remains available. After expiry, hosted compute stops; local data remains readable and exportable. No lifetime hosting, automatic overage charge or hidden fair-use restriction. An annual prepayment does not reduce the obligation to provide the paid service. Cancellation/refund rules, retention/deletion periods, model lists and total price must be clear before real checkout and verified end to end.

## Authorization decision for implementation

Decision revision: `2026-10-auth-1` (2026-10-23). This is a service design, not evidence of a deployed subscription. Permit [owns credential semantics](https://github.com/turinglambdaai/permit/blob/main/docs/entitlement-v1.md); the product owns identity, quota and request admission.

- **Hosted right:** Commerce's explicit issuer path produces a Protocol v1 `entitlement` scoped only to this hosted service and its paid plan. Bind it to the authenticated account's opaque stable subject (`subject.type="account"`). Set `use_expires_at=paid_through`, `activation_required=false`, `installation_id=null`, `updates_through=null` and `features_through=null`; use explicit plan/service grants. No desktop activation lease or hardware/device limit is needed for an already online service.
- **Server enforcement:** the hosted service verifies the signed credential and product/subject scope against trusted server time, then checks the current authoritative entitlement revision, refund/suspension state and atomic account quota. Check before accepting a new billable request and before a queued job starts. An old signed snapshot, a client boolean, a checkout redirect or a copied API token is insufficient. A session authenticates the caller; it does not itself grant paid rights.
- **Metering:** keep consumption, remaining allowance, idempotency and quota reset in server-side durable state, outside the copyable Permit credential. Preserve the successful-work/failure/retry accounting defined above. Enforce the published exhaustion behavior without automatic overage bills.
- **Cancellation and outage:** cancellation stops renewal, not the already paid period. Expiry stops new hosted work and follows the stated export/retention rules. Refunds and suspensions affect future request admission through current server state; define treatment of in-flight work in the service contract. If authoritative admission state is unavailable, refuse new paid jobs safely; local, BYOK and self-hosted capabilities remain under their existing free terms.
- **Integration gate:** maintain stable `entitlement_id` with increasing `revision` and complete replacement snapshots for renewal/plan changes, without duplicate-event window extension. Separate account recovery, payment secrets, Permit signing keys and product/service credentials. Pin the exact Permit/Commerce versions and Offer policy; prove wrong-account rejection, stale-snapshot replay, renewal/cancellation/refund, quota races, expiry in a queue, outage and export. This does not require adding Permit to a free client or self-hosted deployment.

## Next gate before sales

Hosted service is not on sale. Complete native transport and secret storage in #2, fix the model/provider list and measure 30 days of request costs, including uncached p95 and abuse scenarios. The worst-case allowed quota must cost less than 25% of the target price, including provider-billing uncertainty. If it fails, retain free BYOK rather than shrinking already-sold allowances. Open a 7-day account trial only after rate limiting, budget circuit breakers, cancellation and deletion work; do not issue perpetual trials per device.

Execution entry: [issue #2](https://github.com/turinglambdaai/hackdigest/issues/2). Complete this bounded slice before expanding commercial features.

Portfolio role and shared boundaries: [PORTFOLIO](https://github.com/turinglambdaai/turinglambdaai.github.io/blob/master/PORTFOLIO.md).
