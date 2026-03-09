/**
 * Document Classifier — Rules-based document type classification
 * Assigns type, setting, and clinical domain to uploaded documents
 */

import type { DocumentClassification, DocumentType } from '@/types/icd10';

interface ClassificationRule {
  type: DocumentType;
  patterns: RegExp[];
  headingPatterns: RegExp[];
  weight: number;
}

const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    type: 'discharge_summary',
    patterns: [
      /discharge\s+summar/i,
      /discharged?\s+(to|home|date)/i,
      /hospital\s+course/i,
      /admission\s+date/i,
      /discharge\s+diagnos[ei]s/i,
      /principal\s+diagnos[ei]s/i,
      /secondary\s+diagnos[ei]s/i,
      /condition\s+on\s+discharge/i,
    ],
    headingPatterns: [
      /^discharge\s+summary/i,
      /^hospital\s+course/i,
      /^discharge\s+diagnos/i,
    ],
    weight: 10,
  },
  {
    type: 'op_note',
    patterns: [
      /operat(ive|ion)\s+(note|report)/i,
      /preop(erative)?\s+diagnos/i,
      /postop(erative)?\s+diagnos/i,
      /procedure\s+performed/i,
      /anesthesia\s+(type|used)/i,
      /surgical\s+(approach|site|findings)/i,
      /specimens?\s+(sent|removed|obtained)/i,
      /estimated\s+blood\s+loss/i,
      /sponge\s+count/i,
    ],
    headingPatterns: [
      /^operat(ive|ion)\s+(note|report)/i,
      /^surgical\s+report/i,
      /^procedure\s+note/i,
    ],
    weight: 10,
  },
  {
    type: 'progress_note',
    patterns: [
      /progress\s+note/i,
      /daily\s+note/i,
      /subjective|objective|assessment|plan/i,
      /\bsoap\b/i,
      /interval\s+history/i,
      /chief\s+complaint/i,
      /review\s+of\s+systems/i,
    ],
    headingPatterns: [
      /^progress\s+note/i,
      /^daily\s+(progress|note)/i,
      /^soap\s+note/i,
    ],
    weight: 8,
  },
  {
    type: 'lab_report',
    patterns: [
      /lab(oratory)?\s+(report|results?|values?)/i,
      /\b(cbc|bmp|cmp|ua|urinalysis)\b/i,
      /\b(hemoglobin|hematocrit|wbc|platelets?|glucose|creatinine|bun)\b/i,
      /reference\s+range/i,
      /specimen\s+(type|collected)/i,
      /\b(normal|abnormal|critical)\s*(high|low|range|value)?\b/i,
    ],
    headingPatterns: [
      /^lab(oratory)?\s+(report|results)/i,
      /^pathology\s+report/i,
    ],
    weight: 7,
  },
  {
    type: 'radiology',
    patterns: [
      /radiology\s+(report|findings)/i,
      /imaging\s+(study|report|findings)/i,
      /\b(x-ray|xray|ct\s+scan|mri|ultrasound|echo(cardiogram)?)\b/i,
      /\b(impression|findings|technique|comparison|indication)\b/i,
      /radiolog(ist|ic)/i,
      /contrast\s+(enhanced|administered)/i,
    ],
    headingPatterns: [
      /^radiology\s+report/i,
      /^imaging\s+(report|study)/i,
      /^(ct|mri|xray|x-ray)\s+report/i,
    ],
    weight: 7,
  },
  {
    type: 'pathology',
    patterns: [
      /pathology\s+(report|findings)/i,
      /\b(biopsy|cytology|histology|microscopic|macroscopic)\b/i,
      /surgical\s+pathology/i,
      /\b(benign|malignant|neoplasm|carcinoma|adenoma)\b/i,
      /tissue\s+(sample|specimen)/i,
    ],
    headingPatterns: [
      /^pathology\s+report/i,
      /^surgical\s+pathology/i,
    ],
    weight: 7,
  },
  {
    type: 'consult',
    patterns: [
      /consult(ation)?\s+(note|report|request)/i,
      /reason\s+for\s+consult/i,
      /referring\s+physician/i,
      /thank\s+you\s+for\s+(this|the)\s+(kind\s+)?consult/i,
      /consulted\s+by/i,
    ],
    headingPatterns: [
      /^consult(ation)?\s+(note|report)/i,
    ],
    weight: 8,
  },
];

const SETTING_PATTERNS = {
  inpatient: [
    /\binpatient\b/i, /\bhospital\s*(course|stay|admission)\b/i,
    /\badmission\s+date\b/i, /\bdischarge\s+date\b/i,
    /\blength\s+of\s+stay\b/i, /\bfloor|ward|icu|nicu\b/i,
  ],
  outpatient: [
    /\boutpatient\b/i, /\bclinic\s+visit\b/i,
    /\boffice\s+visit\b/i, /\bambulatory\b/i,
    /\bfollow[- ]up\b/i,
  ],
  emergency: [
    /\bemergency\s*(department|room|visit)\b/i,
    /\b(ed|er)\s+visit\b/i, /\btriage\b/i,
    /\bchief\s+complaint\b/i,
  ],
};

const DOMAIN_PATTERNS: Record<string, RegExp[]> = {
  cardiology: [/\b(cardiac|heart|coronary|myocardial|atrial|ventricular|cardiomyopathy|arrhythmia|stemi|nstemi|chf)\b/i],
  pulmonology: [/\b(pulmonary|respiratory|lung|pneumonia|copd|asthma|bronch|ventilat)/i],
  orthopedics: [/\b(fracture|joint|bone|arthroplasty|orthoped|musculoskeletal|spine|lumbar|cervical)/i],
  neurology: [/\b(neurolog|stroke|seizure|epilepsy|brain|cerebr|dementia|parkinson)/i],
  oncology: [/\b(cancer|tumor|neoplasm|malignant|chemotherapy|radiation|oncolog|carcinoma)/i],
  nephrology: [/\b(renal|kidney|dialysis|ckd|esrd|nephro|creatinine)/i],
  gastroenterology: [/\b(gastro|gi\s+bleed|liver|hepat|cirrhosis|pancreat|colon|endoscopy)/i],
  endocrinology: [/\b(diabetes|thyroid|endocrin|insulin|a1c|glucose|adrenal)/i],
  infectious_disease: [/\b(sepsis|infection|bacteremia|antibiotic|mrsa|uti|pneumonia|abscess)/i],
  general_surgery: [/\b(surgery|surgical|appendectomy|cholecystectomy|hernia|laparoscop)/i],
};

/**
 * Classify a document based on its text content
 */
export function classifyDocument(text: string): DocumentClassification {
  const scores: Record<DocumentType, number> = {
    discharge_summary: 0,
    op_note: 0,
    progress_note: 0,
    lab_report: 0,
    radiology: 0,
    pathology: 0,
    consult: 0,
    other: 0,
  };

  // First 500 chars are most important (usually contains title/header)
  const header = text.substring(0, 500);

  for (const rule of CLASSIFICATION_RULES) {
    // Check heading patterns (stronger signal)
    for (const hp of rule.headingPatterns) {
      if (hp.test(header)) {
        scores[rule.type] += rule.weight * 3;
      }
    }
    // Check body patterns
    for (const p of rule.patterns) {
      const matches = text.match(new RegExp(p.source, 'gi'));
      if (matches) {
        scores[rule.type] += Math.min(matches.length, 5) * rule.weight;
      }
    }
  }

  // Find best match
  let bestType: DocumentType = 'other';
  let bestScore = 0;
  let totalScore = 0;
  for (const [type, score] of Object.entries(scores)) {
    totalScore += score;
    if (score > bestScore) {
      bestScore = score;
      bestType = type as DocumentType;
    }
  }

  const confidence = totalScore > 0 ? Math.min(bestScore / totalScore, 1) : 0;

  // Determine setting
  let setting: 'inpatient' | 'outpatient' | 'emergency' | 'unknown' = 'unknown';
  for (const [s, patterns] of Object.entries(SETTING_PATTERNS)) {
    for (const p of patterns) {
      if (p.test(text)) {
        setting = s as 'inpatient' | 'outpatient' | 'emergency';
        break;
      }
    }
    if (setting !== 'unknown') break;
  }

  // Determine clinical domain
  let domain = 'general';
  let domainScore = 0;
  for (const [d, patterns] of Object.entries(DOMAIN_PATTERNS)) {
    let score = 0;
    for (const p of patterns) {
      const matches = text.match(new RegExp(p.source, 'gi'));
      if (matches) score += matches.length;
    }
    if (score > domainScore) {
      domainScore = score;
      domain = d;
    }
  }

  return {
    documentType: bestType,
    confidence: Math.round(confidence * 100) / 100,
    setting,
    domain,
  };
}
