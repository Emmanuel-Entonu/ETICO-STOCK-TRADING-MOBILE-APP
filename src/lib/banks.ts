// Nigerian bank list for the settlement-account picker (KYC step 2).
//
// Mirrors the authoritative set used by Moneta's Tap-and-Pay backend
// (/api/customers/mandate/banks): each entry carries the display name, the
// 3-digit CBN sort/bank code, and the 6-digit NIBSS institution code used for
// NIP name-enquiry. Keeping it as static data means the picker needs no network
// round-trip; the codes are what a name-enquiry endpoint needs to resolve the
// account holder's name.

export interface NgBank {
  name: string
  bankCode: string        // 3-digit CBN code (used when creating a transfer/mandate)
  institutionCode: string // 6-digit NIBSS code (used for NIP name-enquiry)
}

export const NG_BANKS: readonly NgBank[] = [
  { name: 'Access Bank',              bankCode: '044', institutionCode: '000014' },
  { name: 'Citibank Nigeria',         bankCode: '023', institutionCode: '000009' },
  { name: 'Ecobank Nigeria',          bankCode: '050', institutionCode: '000010' },
  { name: 'Fidelity Bank',            bankCode: '070', institutionCode: '000007' },
  { name: 'First Bank of Nigeria',    bankCode: '011', institutionCode: '000016' },
  { name: 'First City Monument Bank', bankCode: '214', institutionCode: '000003' },
  { name: 'Globus Bank',              bankCode: '103', institutionCode: '000027' },
  { name: 'Guaranty Trust Bank',      bankCode: '058', institutionCode: '000013' },
  { name: 'Jaiz Bank',                bankCode: '301', institutionCode: '000006' },
  { name: 'Keystone Bank',            bankCode: '082', institutionCode: '000002' },
  { name: 'Lotus Bank',               bankCode: '302', institutionCode: '000029' },
  { name: 'Parallex Bank',            bankCode: '104', institutionCode: '000030' },
  { name: 'Polaris Bank',             bankCode: '076', institutionCode: '000008' },
  { name: 'Premium Trust Bank',       bankCode: '105', institutionCode: '000031' },
  { name: 'Providus Bank',            bankCode: '101', institutionCode: '000023' },
  { name: 'Stanbic IBTC Bank',        bankCode: '221', institutionCode: '000012' },
  { name: 'Standard Chartered Bank',  bankCode: '068', institutionCode: '000021' },
  { name: 'Sterling Bank',            bankCode: '232', institutionCode: '000001' },
  { name: 'SunTrust Bank',            bankCode: '100', institutionCode: '000022' },
  { name: 'TAJBank',                  bankCode: '304', institutionCode: '000026' },
  { name: 'Titan Trust Bank',         bankCode: '102', institutionCode: '000025' },
  { name: 'Union Bank of Nigeria',    bankCode: '032', institutionCode: '000018' },
  { name: 'United Bank for Africa',   bankCode: '033', institutionCode: '000004' },
  { name: 'Unity Bank',               bankCode: '215', institutionCode: '000011' },
  { name: 'Wema Bank',                bankCode: '035', institutionCode: '000017' },
  { name: 'Zenith Bank',              bankCode: '057', institutionCode: '000015' },
]
