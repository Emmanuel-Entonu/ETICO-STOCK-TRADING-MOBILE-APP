# ETICO — Privacy Policy

**Data controller:** Moneta Capital Investment Limited (“Moneta Capital”, “ETICO”, “we”, “us”, “our”)
**Product:** ETICO — a mobile application for investing in Shariah-screened (ethical) equities listed on the Nigerian Exchange (NGX).
**Effective date:** 9 September 2026
**Last updated:** 9 September 2026

> **⚠️ DRAFT — REQUIRES LEGAL REVIEW.** This document was drafted from the app’s
> actual functionality as an internal working template. It is **not legal advice**
> and must be reviewed and finalised by a qualified Nigerian legal practitioner and
> Moneta Capital’s compliance/data-protection function before publication. Items in
> `{{curly braces}}` are placeholders to complete.

**Company details (to complete):**
- Registered name: Moneta Capital Investment Limited
- RC number: `{{RC-NUMBER}}`
- Registered address: `{{REGISTERED ADDRESS}}`
- Data Protection Officer: `{{dpo@etico.ng}}`
- Support: `{{support@etico.ng}}`

> Our **Terms of Service** are a separate document — see `TERMS_OF_SERVICE.md`.

---

Moneta Capital Investment Limited is the **data controller** for personal data
processed through ETICO. We are committed to protecting your privacy in accordance
with the **Nigeria Data Protection Act, 2023 (NDPA)** and the Nigeria Data
Protection Regulation (NDPR), and to meeting our KYC/AML obligations under SEC and
CBN rules.

## 1. Personal data we collect
**Identity & KYC data:** full name, date of birth, residential address, phone
number, email address, Bank Verification Number (BVN), National Identification
Number (NIN) or other government ID type and number, and verification results
(including data returned by BVN verification such as name and phone number).

**Financial & transactional data:** your brokerage account identifiers, virtual
account details, wallet/cash balances, holdings and positions, orders, trades,
transaction history and settlement records.

**Account & security data:** your password (stored in hashed form by our
authentication provider), your transaction PIN (stored in hashed/verified form,
never in plain text), and session tokens (stored in your device’s secure keychain).

**Technical & usage data:** device and app information, log data, and basic usage
needed to operate, secure and troubleshoot the Service.

## 2. How we collect it
- **Directly from you** when you register, complete KYC, set a PIN, fund your
  account, and place orders.
- **Automatically** from your use of the app (technical/usage data).
- **From third parties** — principally identity-verification providers (BVN/NIBSS)
  and our brokerage/custody and payment partners, who return verification results
  and account/transaction data.

## 3. Why we use it and our legal bases
| Purpose | Legal basis (NDPA) |
|---|---|
| Create and operate your account; execute and settle trades | Performance of a contract |
| Identity verification, KYC, AML/CFT screening, fraud prevention | Compliance with a legal obligation |
| Security, authentication, and protecting the Service and users | Legitimate interest |
| Customer support and service communications | Contract / legitimate interest |
| Product improvement and troubleshooting | Legitimate interest |
| Optional marketing (if any) | Consent (which you may withdraw) |

We do **not** sell your personal data.

## 4. Who we share it with
We share personal data only as needed to provide the Service and meet legal
obligations, with the following **categories of recipients**:

- **Brokerage & custody partner** — to open your investment account, execute orders,
  and hold securities and cash on your behalf.
- **Payment provider(s)** — to create your virtual account and process funding,
  settlement and withdrawals.
- **Identity-verification providers** — to verify your BVN/identity (via NIBSS).
- **Market infrastructure and regulators** — NGX, CSCS, the SEC, the CBN and other
  competent authorities, where required for trading, clearing, settlement,
  reporting, or compliance, or in response to lawful requests.
- **Technology & infrastructure providers** — cloud hosting, database and
  application-delivery providers that store and process data on our behalf under
  contract (see the Sub-processors appendix).
- **Professional advisers** — auditors, lawyers and compliance advisers, under
  duties of confidentiality.

All processors act on our instructions under data-processing agreements and are
required to protect your data.

## 5. International transfers
Some of our processors may store or process data **outside Nigeria**. Where that
happens, we take steps required by the NDPA to ensure an adequate level of
protection, such as contractual safeguards with the relevant provider. See the
Sub-processors appendix for indicative processing locations.

## 6. How we protect your data
- Session credentials are stored in your device’s **secure keychain/Keystore**, not
  in plain text.
- Passwords and PINs are stored in hashed form; PIN checks occur server-side.
- Access to your data is enforced per-user (row-level security) and every request to
  our backend carries an authenticated session token.
- Secrets for our brokerage and payment partners are held server-side only and are
  never embedded in the mobile app.
- Data is transmitted over encrypted connections (HTTPS/TLS).

No method of transmission or storage is 100% secure, but we work to protect your
data using appropriate technical and organisational measures.

## 7. Data retention
We keep personal data for as long as your account is active and thereafter for the
periods required by SEC, CBN and AML record-keeping laws (which may require
retention of KYC and transaction records for a number of years after the account
relationship ends), and as needed to resolve disputes and enforce our agreements.
When no longer required, data is deleted or anonymised.

## 8. Your rights
Subject to the NDPA and applicable law, you have the right to:
- **access** the personal data we hold about you;
- request **correction** of inaccurate or incomplete data;
- request **deletion** of your data (subject to our legal retention obligations —
  e.g. we cannot delete KYC/transaction records we are required to keep);
- **object to** or request **restriction of** certain processing;
- request **portability** of data you provided to us;
- **withdraw consent** where processing is based on consent; and
- **lodge a complaint** with the Nigeria Data Protection Commission (NDPC).

To exercise these rights, contact `{{dpo@etico.ng}}`. We may need to verify your
identity before acting on a request.

## 9. Children
The Service is not intended for anyone under 18, and we do not knowingly collect
data from minors.

## 10. Cookies / analytics
The mobile app does not use browser cookies. We use limited on-device storage for
app functionality (e.g. remembering preferences and your session) and may use
privacy-respecting diagnostics to keep the app reliable.

## 11. Changes to this Privacy Policy
We may update this Privacy Policy from time to time and will notify you of material
changes through the app or by email. The “Last updated” date reflects the latest
version.

## 12. Contact
- Privacy / data protection: `{{dpo@etico.ng}}`
- General support: `{{support@etico.ng}}`
- Postal: `{{REGISTERED ADDRESS}}`

---

## Appendix — Sub-processors (indicative; keep current)

> This appendix names the specific service providers that process personal data on
> our behalf. Keeping it as a separate list lets us update vendors without
> re-issuing the whole policy. **Verify and complete before publishing.**

| Provider | Role / category | Data processed | Indicative location |
|---|---|---|---|
| Supabase | Authentication & database (cloud hosting) | Account, KYC, wallet, transaction data | `{{region — confirm}}` |
| Vercel | Application delivery / secure backend proxy | Requests routed to partners; no long-term storage | `{{region — confirm}}` |
| PAC / MyWealthCare | Brokerage & securities custody | Account, order, holding, settlement data | Nigeria `{{confirm}}` |
| Moneta payments partner (Providus / virtual accounts) | Payments, funding, settlement | Name, virtual account, transaction data | Nigeria `{{confirm}}` |
| NIBSS | BVN / identity verification | BVN, name, phone, verification result | Nigeria |

*Company logos and market data displayed for informational purposes are sourced
from third-party providers and remain the property of their respective owners.*
