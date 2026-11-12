import idleBehavioursJson from '@/content/idle-behaviours.json'
import visualLanguageJson from '@/content/visual-language.json'
import {
  parseIdleBehaviours,
  parseVisualLanguage,
  type IdleBehaviours,
  type VisualLanguage,
} from '@/domain/visual'

/**
 * Presentation data (P05, R16): every threshold, colour key, size and idle
 * weight the 3D office uses. Parsed once with zod at import time, so a bad
 * edit fails loudly in dev, in tests and in `npm run content:validate`.
 *
 * Not part of `OrgConfig` on purpose (P05 D10): it is presentation, the feed
 * never sees it, and nothing writes it yet.
 */
export const visualLanguage: VisualLanguage = parseVisualLanguage(visualLanguageJson)
export const idleBehaviours: IdleBehaviours = parseIdleBehaviours(idleBehavioursJson)
