import { LegalDocScreen } from '@/components/LegalDocScreen'
import { TERMS_OF_SERVICE } from '@/lib/legalContent'

export default function TermsScreen() {
  return <LegalDocScreen doc={TERMS_OF_SERVICE} />
}
