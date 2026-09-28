// In-app legal content — mirrors the published web versions at
// etico.ng/privacy and etico.ng/terms (and docs/PRIVACY_POLICY.md /
// docs/TERMS_OF_SERVICE.md). Keep all three in sync when the legal copy changes.

export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'kv'; rows: [string, string][] }
  | { type: 'table'; head: [string, string]; rows: [string, string][] }

export interface LegalSection {
  n: number
  title: string
  blocks: LegalBlock[]
}

export interface LegalDoc {
  title: string
  effective: string
  updated: string
  intro: string
  sections: LegalSection[]
}

export const PRIVACY_POLICY: LegalDoc = {
  title: 'Privacy Policy',
  effective: '9 September 2026',
  updated: '9 September 2026',
  intro:
    'This Privacy Policy explains how Moneta Capital Investment Limited ("Moneta", "we", "us") — operating the ETICO web and mobile trading service — collects, uses, shares, and protects your personal data. We act as a data controller under the Nigeria Data Protection Act (NDPA) 2023. Please read it alongside our Terms of Service.',
  sections: [
    {
      n: 1,
      title: 'Data controller',
      blocks: [
        {
          type: 'kv',
          rows: [
            ['Controller', 'Moneta Capital Investment Limited'],
            ['RC number', '{{RC-NUMBER}}'],
            ['Registered address', '{{REGISTERED-ADDRESS}}'],
            ['Data Protection Officer', 'dpo@etico.ng'],
          ],
        },
      ],
    },
    {
      n: 2,
      title: 'Data we collect',
      blocks: [
        { type: 'p', text: 'We collect the following categories of personal data:' },
        {
          type: 'bullets',
          items: [
            'Identity data — full name, date of birth, BVN, and identity details verified during KYC.',
            'Contact data — email address, phone number, and residential address.',
            'Financial data — settlement bank account details, virtual account, wallet balance, holdings, orders, and transaction history.',
            'Account data — login credentials (stored hashed), KYC status, and account preferences.',
            'Technical data — device identifiers, IP address, app version, and usage/diagnostic logs.',
          ],
        },
      ],
    },
    {
      n: 3,
      title: 'How and why we use your data',
      blocks: [
        { type: 'p', text: 'We process your data on the legal bases set out below under the NDPA:' },
        {
          type: 'table',
          head: ['Purpose', 'Legal basis'],
          rows: [
            ['Verify your identity (KYC) and open your account', 'Legal obligation; performance of a contract'],
            ['Execute and settle your trades, and operate your wallet', 'Performance of a contract'],
            ['Prevent fraud, money laundering, and market abuse', 'Legal obligation; legitimate interest'],
            ['Provide support and service notifications', 'Performance of a contract; legitimate interest'],
            ['Improve, secure, and maintain the service', 'Legitimate interest'],
            ['Send marketing you have opted into', 'Consent (withdrawable at any time)'],
          ],
        },
      ],
    },
    {
      n: 4,
      title: 'Who we share it with',
      blocks: [
        { type: 'p', text: 'We share personal data only as needed to run the service, and we do not sell it. Recipients include:' },
        {
          type: 'table',
          head: ['Recipient', 'Purpose'],
          rows: [
            ['PAC (brokerage partner)', 'KYC review, order execution, custody, and settlement'],
            ['CSCS & NGX', 'Clearing, settlement, and holding of your securities'],
            ['Payment / virtual-account provider (Providus)', 'Funding deposits and processing withdrawals'],
            ['Supabase (infrastructure)', 'Secure hosting of account and application data'],
            ['Regulators & law enforcement', 'Where required by law or lawful request'],
          ],
        },
        { type: 'p', text: 'We require our processors to protect your data and to use it only for the purposes we specify.' },
      ],
    },
    {
      n: 5,
      title: 'Data security',
      blocks: [
        { type: 'p', text: 'We apply technical and organisational measures to protect your data, including encryption in transit, hashed credentials, access controls, and row-level security so that you can only access your own records. Sensitive secrets are held server-side and are never exposed to the browser or app client. No system is perfectly secure, but we work to reduce risk and to respond promptly to any incident.' },
      ],
    },
    {
      n: 6,
      title: 'Data retention',
      blocks: [
        { type: 'p', text: 'We keep your personal data for as long as your account is active and thereafter for the period required to meet our legal, regulatory, and record-keeping obligations — including anti-money-laundering and securities record rules — after which it is deleted or anonymised.' },
      ],
    },
    {
      n: 7,
      title: 'Your rights',
      blocks: [
        { type: 'p', text: 'Under the NDPA you have the right to:' },
        {
          type: 'bullets',
          items: [
            'Access the personal data we hold about you;',
            'Request correction of inaccurate or incomplete data;',
            'Request deletion where we are not legally required to retain it;',
            'Object to or restrict certain processing;',
            'Withdraw consent for marketing at any time; and',
            'Lodge a complaint with the Nigeria Data Protection Commission.',
          ],
        },
        { type: 'p', text: 'To exercise any of these rights, contact our Data Protection Officer at dpo@etico.ng. We will respond within the timeframe required by law.' },
      ],
    },
    {
      n: 8,
      title: 'Cookies and analytics',
      blocks: [
        { type: 'p', text: 'Our website uses strictly necessary cookies to keep you signed in and to secure your session, and limited analytics to understand usage and improve the service. You can control non-essential cookies through your browser settings.' },
      ],
    },
    {
      n: 9,
      title: 'Children',
      blocks: [
        { type: 'p', text: 'ETICO is not intended for anyone under 18, and we do not knowingly collect data from children. If you believe a minor has provided us data, contact us and we will delete it.' },
      ],
    },
    {
      n: 10,
      title: 'International transfers',
      blocks: [
        { type: 'p', text: 'Some of our processors may store or process data outside Nigeria. Where that happens, we take steps to ensure your data receives a level of protection consistent with the NDPA.' },
      ],
    },
    {
      n: 11,
      title: 'Changes to this policy',
      blocks: [
        { type: 'p', text: 'We may update this Privacy Policy from time to time. Where changes are material, we will give you reasonable notice. The "Last updated" date above reflects the current version.' },
      ],
    },
    {
      n: 12,
      title: 'Contact us',
      blocks: [
        { type: 'p', text: 'For any privacy question or request, email dpo@etico.ng or our support team at support@etico.ng.' },
      ],
    },
  ],
}

export const TERMS_OF_SERVICE: LegalDoc = {
  title: 'Terms of Service',
  effective: '9 September 2026',
  updated: '9 September 2026',
  intro:
    'These Terms of Service (the "Terms") form a binding agreement between you and Moneta Capital Investment Limited ("Moneta", "we", "us") governing your access to and use of ETICO — our web and mobile trading service for the Nigerian Exchange ("NGX"). By creating an account, you accept these Terms. If you do not agree, do not use ETICO.',
  sections: [
    {
      n: 1,
      title: 'Who we are',
      blocks: [
        { type: 'p', text: 'ETICO is operated by Moneta Capital Investment Limited, a subsidiary of Moneta Technology. Dealing, settlement, and custody services are provided by our licensed brokerage partner ("PAC"). We are incorporated in Nigeria.' },
        {
          type: 'kv',
          rows: [
            ['Legal entity', 'Moneta Capital Investment Limited'],
            ['RC number', '{{RC-NUMBER}}'],
            ['Registered address', '{{REGISTERED-ADDRESS}}'],
            ['SEC licence', '{{SEC-LICENCE}}'],
            ['Support', 'support@etico.ng'],
          ],
        },
      ],
    },
    {
      n: 2,
      title: 'Eligibility',
      blocks: [
        { type: 'p', text: 'To open and hold an ETICO account you must:' },
        {
          type: 'bullets',
          items: [
            'Be at least 18 years old and have full legal capacity to enter a contract;',
            'Be a resident of Nigeria with a valid Bank Verification Number (BVN) and a Nigerian bank account in your own name;',
            'Provide accurate, current, and complete information during KYC (Know Your Customer) verification; and',
            'Not be a person barred from using the service under any applicable law, sanctions regime, or a prior ETICO enforcement action.',
          ],
        },
        { type: 'p', text: 'We may refuse, suspend, or close an account where eligibility cannot be verified or is later found not to be met.' },
      ],
    },
    {
      n: 3,
      title: 'Account registration and KYC',
      blocks: [
        { type: 'p', text: 'Access to trading requires identity verification. You authorise us and our partners to verify your identity using your BVN and the supporting details you supply, and to hold your settlement bank account information for the purpose of funding and withdrawals. Your KYC submission is reviewed by our brokerage partner before your account is approved to trade; you will be notified of the outcome, and where a submission is rejected you will be told why and may resubmit.' },
        { type: 'p', text: 'You are responsible for keeping your login credentials confidential and for all activity under your account. Notify us immediately at support@etico.ng if you suspect unauthorised access.' },
      ],
    },
    {
      n: 4,
      title: 'What ETICO offers',
      blocks: [
        { type: 'p', text: 'ETICO lets you buy and sell securities listed on the NGX that pass our ethical screen. We apply an ethical-only investment screen: the universe of tradable securities is filtered to exclude businesses and instruments that do not meet our published ethical criteria. The list of eligible securities may change as companies enter or leave the screen, and we may add or remove instruments at our discretion.' },
        { type: 'p', text: 'ETICO is an execution service. We do not provide investment, financial, tax, or legal advice, and nothing in the app is a recommendation to buy or sell any security. You are solely responsible for your investment decisions.' },
      ],
    },
    {
      n: 5,
      title: 'Orders, execution, and settlement',
      blocks: [
        {
          type: 'bullets',
          items: [
            'Orders you place are routed to our brokerage partner for execution on the NGX. Execution is not guaranteed and depends on market availability, price, and trading hours.',
            'Trades settle on a T+1 basis in line with NGX and CSCS rules. Securities and cash are held with our licensed partner and the Central Securities Clearing System.',
            'Prices shown in the app may be delayed and are indicative until an order is executed. The executed price is the price that binds.',
            'Once submitted, an order may not be cancellable if it has already been matched or executed.',
          ],
        },
      ],
    },
    {
      n: 6,
      title: 'Wallet, funding, and withdrawals',
      blocks: [
        { type: 'p', text: 'Your ETICO wallet holds the spendable cash you fund into the service. Deposits are made to the virtual account assigned to you; withdrawals are paid to the settlement bank account you registered during KYC. We may apply limits, holds, or additional checks on funding and withdrawals to meet legal, fraud-prevention, and settlement requirements.' },
        { type: 'p', text: 'Your wallet balance reflects your deposits, less the cost of purchases and fees, plus the proceeds of sales. Buying power is limited to your available wallet balance inclusive of applicable fees.' },
      ],
    },
    {
      n: 7,
      title: 'Fees and charges',
      blocks: [
        { type: 'p', text: 'Trading is subject to fees, commissions, and statutory levies, including those imposed by the NGX, CSCS, and the Securities and Exchange Commission. Applicable charges are disclosed to you before you confirm a trade and may change from time to time. You are responsible for any taxes arising from your trading.' },
      ],
    },
    {
      n: 8,
      title: 'Risk disclosure',
      blocks: [
        { type: 'p', text: 'Investing in listed securities carries a risk of loss, including the possible loss of the full amount invested. Prices can fall as well as rise, and past performance is not indicative of future results. Our ethical screen restricts the securities available to you but is not a guarantee of performance, suitability, or capital protection. Read our full risk disclosure at etico.ng/risk-disclosure before trading.' },
      ],
    },
    {
      n: 9,
      title: 'Acceptable use',
      blocks: [
        { type: 'p', text: 'You agree not to:' },
        {
          type: 'bullets',
          items: [
            'Use ETICO for any unlawful purpose, including market manipulation, insider dealing, or money laundering;',
            'Provide false information, impersonate another person, or open an account on behalf of someone else without authority;',
            "Interfere with, probe, or attempt to gain unauthorised access to the service, its infrastructure, or other users' accounts; or",
            'Use automated means to access the service in a way that burdens or disrupts it.',
          ],
        },
      ],
    },
    {
      n: 10,
      title: 'Suspension and termination',
      blocks: [
        { type: 'p', text: 'We may suspend or terminate your access, or reverse or refuse a transaction, where we reasonably believe it is necessary to comply with the law, protect you or the service, or address a breach of these Terms. You may close your account at any time, subject to settling open positions and obligations. On closure we will return any remaining eligible balance to your registered settlement account, subject to applicable checks.' },
      ],
    },
    {
      n: 11,
      title: 'Intellectual property',
      blocks: [
        { type: 'p', text: 'The ETICO name, logo, software, and content are owned by Moneta or its licensors and are protected by law. We grant you a limited, non-exclusive, non-transferable licence to use the app for your own personal, non-commercial use. You may not copy, modify, distribute, or reverse-engineer any part of the service except as permitted by law.' },
      ],
    },
    {
      n: 12,
      title: 'Availability and changes',
      blocks: [
        { type: 'p', text: 'We aim to keep ETICO available but do not guarantee uninterrupted access. We may modify, suspend, or discontinue features, and we may update these Terms. Where changes are material, we will give you reasonable notice. Continued use after changes take effect means you accept the updated Terms.' },
      ],
    },
    {
      n: 13,
      title: 'Liability',
      blocks: [
        { type: 'p', text: 'To the maximum extent permitted by law, we are not liable for losses arising from market movements, the acts of the NGX, CSCS, our brokerage partner, or payment providers, or from events beyond our reasonable control. Nothing in these Terms excludes liability that cannot lawfully be excluded, including for fraud. We provide the service on an "as is" and "as available" basis.' },
      ],
    },
    {
      n: 14,
      title: 'Governing law and disputes',
      blocks: [
        { type: 'p', text: 'These Terms are governed by the laws of the Federal Republic of Nigeria, and you submit to the jurisdiction of its courts. Where a matter falls within the remit of the Securities and Exchange Commission or another regulator, the applicable dispute-resolution process of that body applies.' },
      ],
    },
    {
      n: 15,
      title: 'Contact us',
      blocks: [
        { type: 'p', text: 'Questions about these Terms? Email support@etico.ng. For privacy matters, see our Privacy Policy.' },
      ],
    },
  ],
}
