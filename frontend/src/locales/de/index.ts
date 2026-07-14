// TEMPORARY — Phase 1 (infrastructure) only.
//
// This locale falls back to English until Phase 3 lands its translations. It exists now so the
// language switcher and the resolution chain can be built and tested against a real second
// locale, rather than being wired blind.
//
// DO NOT SHIP THIS STATE: a user picking "de" would see English and think the feature is
// broken. Phase 3 replaces this file with real catalogues.
import en from '../en'

export default en
