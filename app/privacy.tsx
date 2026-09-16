import { LegalDocScreen } from '@/components/LegalDocScreen'
import { PRIVACY_POLICY } from '@/lib/legalContent'

export default function PrivacyScreen() {
  return <LegalDocScreen doc={PRIVACY_POLICY} />
}
