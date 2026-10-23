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

## Next gate before sales

Hosted service is not on sale. Complete native transport and secret storage in #2, fix the model/provider list and measure 30 days of request costs, including uncached p95 and abuse scenarios. The worst-case allowed quota must cost less than 25% of the target price, including provider-billing uncertainty. If it fails, retain free BYOK rather than shrinking already-sold allowances. Open a 7-day account trial only after rate limiting, budget circuit breakers, cancellation and deletion work; do not issue perpetual trials per device.

Execution entry: [issue #2](https://github.com/turinglambdaai/hackdigest/issues/2). Complete this bounded slice before expanding commercial features.

Portfolio role and shared boundaries: [PORTFOLIO](https://github.com/turinglambdaai/turinglambdaai.github.io/blob/master/PORTFOLIO.md).
