/**
 * Assertion Detector — Detects negation, uncertainty, history, and temporality
 * for extracted clinical entities. Prevents false-positive code suggestions.
 */

import type { EntityAssertion, POAIndicator } from '@/types/icd10';

// ---- Negation cues ----
const NEGATION_PRE_CUES = [
  /\bno\s+(?:evidence\s+of|signs?\s+of|history\s+of|known|acute|further)\b/i,
  /\brule[ds]?\s+out\b/i,
  /\bnegative\s+for\b/i,
  /\bwithout\b/i,
  /\bdenies\b/i,
  /\bno\b/i,
  /\bnot\s+(?:found|seen|present|identified|noted|observed)\b/i,
  /\babsence\s+of\b/i,
  /\bfree\s+of\b/i,
  /\bfailed\s+to\s+(?:reveal|show|demonstrate)\b/i,
  /\bunremarkable\b/i,
  /\bexcluded\b/i,
];

const NEGATION_POST_CUES = [
  /\bruled\s+out\b/i,
  /\bnot\s+(?:found|seen|present|identified|noted)\b/i,
  /\bunlikely\b/i,
  /\bwas\s+negative\b/i,
  /\bnot\s+demonstrated\b/i,
];

// ---- Uncertainty cues ----
const UNCERTAINTY_CUES = [
  /\bpossible\b/i,
  /\bprobable\b/i,
  /\blikely\b/i,
  /\bsuspect(?:ed)?\b/i,
  /\bcannot\s+rule\s+out\b/i,
  /\bquestionable\b/i,
  /\bpresumpt(?:ive|ed)\b/i,
  /\bapparent(?:ly)?\b/i,
  /\bconsistent\s+with\b/i,
  /\bsuggestive\s+of\b/i,
  /\bconcerning\s+for\b/i,
  /\bdifferential\s+(?:includes?|diagnosis)\b/i,
  /\br\/o\b/i,
];

// ---- History cues ----
const HISTORY_CUES = [
  /\bhistory\s+of\b/i,
  /\bh\/o\b/i,
  /\bpmh\b/i,
  /\bpast\s+(?:medical\s+)?history\b/i,
  /\bprevious(?:ly)?\b/i,
  /\bprior\b/i,
  /\bremote\s+history\b/i,
  /\bchronic\b/i,
  /\blongstanding\b/i,
  /\bknown\b/i,
  /\bestablished\b/i,
];

// ---- Family history cues ----
const FAMILY_HISTORY_CUES = [
  /\bfamily\s+history\s+of\b/i,
  /\bfh\b/i,
  /\bfamilial\b/i,
  /\bmother|father|brother|sister|parent|sibling|grandmother|grandfather\b/i,
];

// ---- Temporal cues ----
const TEMPORAL_CURRENT = [
  /\bacute\b/i,
  /\bnew\s+onset\b/i,
  /\bcurrent(?:ly)?\b/i,
  /\bactive\b/i,
  /\bpresent(?:ing)?\b/i,
  /\bongoing\b/i,
  /\btoday\b/i,
  /\brecent(?:ly)?\b/i,
];

const TEMPORAL_CHRONIC = [
  /\bchronic\b/i,
  /\blongstanding\b/i,
  /\blong[- ]term\b/i,
  /\bstable\b/i,
  /\bwell[- ]controlled\b/i,
  /\bbaseline\b/i,
];

const TEMPORAL_ACUTE_ON_CHRONIC = [
  /\bacute\s+on\s+chronic\b/i,
  /\bexacerbation\b/i,
  /\bflare\b/i,
  /\bdecompensat/i,
  /\bworsening\b/i,
  /\bacutely\s+worse/i,
];

/**
 * Analyze assertion context for a clinical entity
 * @param entityText The entity text (e.g., "diabetes mellitus")
 * @param contextBefore Text before the entity (~100 chars)
 * @param contextAfter Text after the entity (~100 chars)
 * @param sectionHeading The heading of the section where entity was found
 */
export function detectAssertions(
  entityText: string,
  contextBefore: string,
  contextAfter: string,
  sectionHeading: string = ''
): EntityAssertion {
  const fullContext = `${contextBefore} ${entityText} ${contextAfter}`;

  // Check negation
  let negated = false;
  for (const cue of NEGATION_PRE_CUES) {
    if (cue.test(contextBefore)) {
      negated = true;
      break;
    }
  }
  if (!negated) {
    for (const cue of NEGATION_POST_CUES) {
      if (cue.test(contextAfter)) {
        negated = true;
        break;
      }
    }
  }

  // Check uncertainty
  let uncertain = false;
  for (const cue of UNCERTAINTY_CUES) {
    if (cue.test(contextBefore) || cue.test(fullContext)) {
      uncertain = true;
      break;
    }
  }

  // Check family history (must check before personal history)
  let familyHistory = false;
  for (const cue of FAMILY_HISTORY_CUES) {
    if (cue.test(contextBefore) || cue.test(fullContext) ||
        /family\s+history/i.test(sectionHeading)) {
      familyHistory = true;
      break;
    }
  }

  // Check personal history
  let historical = false;
  if (!familyHistory) {
    for (const cue of HISTORY_CUES) {
      if (cue.test(contextBefore) || cue.test(fullContext) ||
          /past\s+(?:medical\s+)?history|pmh/i.test(sectionHeading)) {
        historical = true;
        break;
      }
    }
  }

  // Determine temporality
  let temporality: 'current' | 'past' | 'chronic' | 'acute_on_chronic' = 'current';

  // Check acute on chronic first (most specific)
  for (const cue of TEMPORAL_ACUTE_ON_CHRONIC) {
    if (cue.test(fullContext)) {
      temporality = 'acute_on_chronic';
      break;
    }
  }

  if (temporality === 'current') {
    for (const cue of TEMPORAL_CHRONIC) {
      if (cue.test(fullContext)) {
        temporality = 'chronic';
        break;
      }
    }
  }

  if (temporality === 'current') {
    for (const cue of TEMPORAL_CURRENT) {
      if (cue.test(fullContext)) {
        temporality = 'current';
        break;
      }
    }
  }

  if (historical || negated) {
    temporality = 'past';
  }

  // POA estimation (based on temporal and section context)
  let poaCandidate: POAIndicator = 'U'; // Unknown by default
  if (/admission|present(?:ing)|chief\s+complaint|hpi/i.test(sectionHeading)) {
    poaCandidate = 'Y'; // Present on admission
  } else if (/hospital\s+course|complication/i.test(sectionHeading) && temporality === 'current') {
    poaCandidate = 'N'; // Not present on admission (developed during stay)
  }

  return {
    negated,
    uncertain,
    historical,
    familyHistory,
    poaCandidate,
    temporality,
    experiencer: familyHistory ? 'family' : 'patient',
  };
}

/**
 * Check if an entity should be excluded from code suggestions
 * Returns true if the entity is negated and should NOT generate a code
 */
export function shouldExcludeEntity(assertion: EntityAssertion): boolean {
  // Negated entities should not be coded
  if (assertion.negated) return true;
  // Family history uses different codes (Z80-Z84) — don't exclude but flag
  // Historical conditions may still need Z-codes
  return false;
}

/**
 * Get a human-readable assertion summary
 */
export function getAssertionSummary(assertion: EntityAssertion): string {
  const parts: string[] = [];
  if (assertion.negated) parts.push('NEGATED');
  if (assertion.uncertain) parts.push('UNCERTAIN');
  if (assertion.historical) parts.push('HISTORICAL');
  if (assertion.familyHistory) parts.push('FAMILY HISTORY');
  if (assertion.temporality === 'acute_on_chronic') parts.push('Acute on Chronic');
  else if (assertion.temporality === 'chronic') parts.push('Chronic');
  else if (assertion.temporality === 'past') parts.push('Past');
  if (assertion.poaCandidate === 'Y') parts.push('POA: Yes');
  else if (assertion.poaCandidate === 'N') parts.push('POA: No');
  return parts.length > 0 ? parts.join(' | ') : 'Current, Affirmed';
}
