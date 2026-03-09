/**
 * CMS 2-Step Clinical Coding Engine
 *
 * Implements the official CMS coding methodology:
 *   Phase A: Holistic Document Read — parse the ENTIRE document, extract structure
 *   Phase B: Condition-by-Condition Coding (CMS 2-Step for each):
 *     Step 1: Alphabetic Index Lookup — find code candidates via clinical patterns
 *     Step 2: Tabular List Verification — verify in the hierarchical code database
 *     Then: 8 CMS Completeness Checks on each code
 *   Phase C: Cross-Validation — check all codes against each other
 *
 * "Think and rethink" — the engine re-evaluates after all codes are assigned.
 */

import type {
  ICD10IndexEntry, ICD10CMDetail, CodingResult, ConfidenceTier, RedFlag,
  DocumentStructure, ExtractedCondition, ExtractedProcedure,
  CodingReasoning, IndexLookupStep, TabularVerificationStep,
  CrossValidationResult,
} from '@/types/icd10';

import { runCompletenessChecks, runCrossValidation } from './completeness-checker';

// ============================================================================
// Clinical Terminology Map — "Alphabetic Index" (CMS Step 1)
// Maps clinical terms to ICD-10 code prefixes with specificity context
// ============================================================================

interface ClinicalTermMapping {
  pattern: RegExp;
  mainTerm: string;
  codePrefixes: string[];
  subTermExtractors?: { pattern: RegExp; subTerm: string; codeRefine: string }[];
  taxonomy: 'CM' | 'PCS' | 'both';
}

const CLINICAL_TERM_INDEX: ClinicalTermMapping[] = [
  // ---- CARDIOVASCULAR ----
  {
    pattern: /\b(acute\s+)?(st[- ]elevation\s+)?myocardial\s+infarction|stemi|nstemi|heart\s+attack|acute\s+mi\b/gi,
    mainTerm: 'Myocardial infarction',
    codePrefixes: ['I21', 'I22'],
    subTermExtractors: [
      { pattern: /\bstemi|st[- ]elevation/i, subTerm: 'ST-elevation (STEMI)', codeRefine: 'I21.0' },
      { pattern: /\bnstemi|non[- ]st/i, subTerm: 'non-ST-elevation (NSTEMI)', codeRefine: 'I21.4' },
      { pattern: /\blad|left\s+anterior\s+descending/i, subTerm: 'LAD artery', codeRefine: 'I21.0' },
      { pattern: /\binferior/i, subTerm: 'inferior wall', codeRefine: 'I21.1' },
    ],
    taxonomy: 'CM',
  },
  {
    pattern: /\b(acute\s+)?(systolic\s+|diastolic\s+)?(congestive\s+)?heart\s+failure|chf\b/gi,
    mainTerm: 'Heart failure',
    codePrefixes: ['I50'],
    subTermExtractors: [
      { pattern: /\bacute\s+systolic/i, subTerm: 'acute systolic', codeRefine: 'I50.21' },
      { pattern: /\bchronic\s+systolic/i, subTerm: 'chronic systolic', codeRefine: 'I50.22' },
      { pattern: /\bacute\s+on\s+chronic\s+systolic/i, subTerm: 'acute on chronic systolic', codeRefine: 'I50.23' },
      { pattern: /\bacute\s+diastolic/i, subTerm: 'acute diastolic', codeRefine: 'I50.31' },
      { pattern: /\bchronic\s+diastolic/i, subTerm: 'chronic diastolic', codeRefine: 'I50.32' },
      { pattern: /\bcombined/i, subTerm: 'combined systolic and diastolic', codeRefine: 'I50.4' },
    ],
    taxonomy: 'CM',
  },
  {
    pattern: /\batrial\s+fibrillation|afib|a[- ]?fib\b/gi,
    mainTerm: 'Atrial fibrillation',
    codePrefixes: ['I48'],
    subTermExtractors: [
      { pattern: /\bparoxysmal/i, subTerm: 'paroxysmal', codeRefine: 'I48.0' },
      { pattern: /\bpersistent/i, subTerm: 'persistent', codeRefine: 'I48.1' },
      { pattern: /\bchronic|permanent/i, subTerm: 'chronic/permanent', codeRefine: 'I48.2' },
    ],
    taxonomy: 'CM',
  },
  {
    pattern: /\b(essential\s+)?hypertension|htn|high\s+blood\s+pressure\b/gi,
    mainTerm: 'Hypertension',
    codePrefixes: ['I10', 'I11', 'I12', 'I13'],
    subTermExtractors: [
      { pattern: /\bwith\s+(chronic\s+)?kidney|hypertensive\s+kidney/i, subTerm: 'with CKD', codeRefine: 'I12' },
      { pattern: /\bwith\s+heart|hypertensive\s+heart/i, subTerm: 'with heart disease', codeRefine: 'I11' },
      { pattern: /\bessential|primary/i, subTerm: 'essential', codeRefine: 'I10' },
    ],
    taxonomy: 'CM',
  },
  {
    pattern: /\bcoronary\s+artery\s+disease|cad|ischemic\s+heart/gi,
    mainTerm: 'Coronary artery disease',
    codePrefixes: ['I25'],
    taxonomy: 'CM',
  },
  {
    pattern: /\bdeep\s+vein\s+thrombosis|dvt\b/gi,
    mainTerm: 'Deep vein thrombosis',
    codePrefixes: ['I82'],
    taxonomy: 'CM',
  },
  {
    pattern: /\bpulmonary\s+embolism\b/gi,
    mainTerm: 'Pulmonary embolism',
    codePrefixes: ['I26'],
    taxonomy: 'CM',
  },
  {
    pattern: /\bstroke|cva|cerebrovascular\s+accident\b/gi,
    mainTerm: 'Stroke/CVA',
    codePrefixes: ['I63', 'I61'],
    subTermExtractors: [
      { pattern: /\bischemic/i, subTerm: 'ischemic', codeRefine: 'I63' },
      { pattern: /\bhemorrhagic/i, subTerm: 'hemorrhagic', codeRefine: 'I61' },
    ],
    taxonomy: 'CM',
  },

  // ---- RESPIRATORY ----
  {
    pattern: /\bpneumonia\b/gi,
    mainTerm: 'Pneumonia',
    codePrefixes: ['J18', 'J15', 'J13', 'J12'],
    subTermExtractors: [
      { pattern: /\bstreptococcus\s+pneumoniae|pneumococcal/i, subTerm: 'due to Streptococcus pneumoniae', codeRefine: 'J13' },
      { pattern: /\bstaph|staphylococcus/i, subTerm: 'due to Staphylococcus', codeRefine: 'J15.2' },
      { pattern: /\be\.?\s*coli/i, subTerm: 'due to E. coli', codeRefine: 'J15.5' },
      { pattern: /\baspiration/i, subTerm: 'aspiration', codeRefine: 'J69.0' },
      { pattern: /\bcommunity[- ]acquired/i, subTerm: 'community-acquired', codeRefine: 'J18.9' },
    ],
    taxonomy: 'CM',
  },
  {
    pattern: /\bcopd|chronic\s+obstructive\s+pulmonary\s+disease\b/gi,
    mainTerm: 'COPD',
    codePrefixes: ['J44'],
    subTermExtractors: [
      { pattern: /\bacute\s+exacerbation/i, subTerm: 'with acute exacerbation', codeRefine: 'J44.1' },
      { pattern: /\blower\s+respiratory\s+infection/i, subTerm: 'with lower respiratory infection', codeRefine: 'J44.0' },
    ],
    taxonomy: 'CM',
  },
  {
    pattern: /\basthma\b/gi,
    mainTerm: 'Asthma',
    codePrefixes: ['J45'],
    taxonomy: 'CM',
  },
  {
    pattern: /\b(acute\s+)?(hypoxic\s+|hypercapnic\s+)?respiratory\s+failure\b/gi,
    mainTerm: 'Respiratory failure',
    codePrefixes: ['J96'],
    subTermExtractors: [
      { pattern: /\bacute\s+hypoxic/i, subTerm: 'acute, hypoxic', codeRefine: 'J96.01' },
      { pattern: /\bacute\s+hypercapnic/i, subTerm: 'acute, hypercapnic', codeRefine: 'J96.02' },
      { pattern: /\bchronic/i, subTerm: 'chronic', codeRefine: 'J96.1' },
    ],
    taxonomy: 'CM',
  },
  {
    pattern: /\bpleural\s+effusion\b/gi,
    mainTerm: 'Pleural effusion',
    codePrefixes: ['J90', 'J91'],
    taxonomy: 'CM',
  },

  // ---- ENDOCRINE ----
  {
    pattern: /\btype\s*2\s+diabetes|type\s*ii\s+diabetes|t2dm|dm2|diabetes\s+mellitus\s+type\s*2\b/gi,
    mainTerm: 'Type 2 diabetes mellitus',
    codePrefixes: ['E11'],
    subTermExtractors: [
      { pattern: /\bwith\s+(diabetic\s+)?nephropathy|kidney/i, subTerm: 'with nephropathy', codeRefine: 'E11.2' },
      { pattern: /\bwith\s+(diabetic\s+)?retinopathy/i, subTerm: 'with retinopathy', codeRefine: 'E11.3' },
      { pattern: /\bwith\s+(diabetic\s+)?neuropathy/i, subTerm: 'with neuropathy', codeRefine: 'E11.4' },
      { pattern: /\bwith\s+(peripheral\s+)?circulatory/i, subTerm: 'with circulatory complications', codeRefine: 'E11.5' },
      { pattern: /\buncontrolled|poorly\s+controlled/i, subTerm: 'with hyperglycemia', codeRefine: 'E11.65' },
    ],
    taxonomy: 'CM',
  },
  {
    pattern: /\btype\s*1\s+diabetes|type\s*i\s+diabetes|t1dm|dm1\b/gi,
    mainTerm: 'Type 1 diabetes mellitus',
    codePrefixes: ['E10'],
    taxonomy: 'CM',
  },
  {
    pattern: /\bhypothyroidism\b/gi,
    mainTerm: 'Hypothyroidism',
    codePrefixes: ['E03'],
    taxonomy: 'CM',
  },
  {
    pattern: /\bhyperlipidemia|dyslipidemia|high\s+cholesterol\b/gi,
    mainTerm: 'Hyperlipidemia',
    codePrefixes: ['E78'],
    taxonomy: 'CM',
  },
  {
    pattern: /\b(morbid\s+)?obesity\b/gi,
    mainTerm: 'Obesity',
    codePrefixes: ['E66'],
    subTermExtractors: [
      { pattern: /\bmorbid|severe|bmi\s*(?:≥|>=?\s*)40/i, subTerm: 'morbid obesity', codeRefine: 'E66.01' },
      { pattern: /\bdue\s+to\s+excess\s+calories/i, subTerm: 'due to excess calories', codeRefine: 'E66.09' },
    ],
    taxonomy: 'CM',
  },
  {
    pattern: /\bbmi\s+(\d+\.?\d*)\b/gi,
    mainTerm: 'Body mass index',
    codePrefixes: ['Z68'],
    taxonomy: 'CM',
  },

  // ---- RENAL ----
  {
    pattern: /\bchronic\s+kidney\s+disease|ckd\b/gi,
    mainTerm: 'Chronic kidney disease',
    codePrefixes: ['N18'],
    subTermExtractors: [
      { pattern: /\bstage\s*1\b/i, subTerm: 'stage 1', codeRefine: 'N18.1' },
      { pattern: /\bstage\s*2\b/i, subTerm: 'stage 2', codeRefine: 'N18.2' },
      { pattern: /\bstage\s*3\b/i, subTerm: 'stage 3', codeRefine: 'N18.3' },
      { pattern: /\bstage\s*4\b/i, subTerm: 'stage 4', codeRefine: 'N18.4' },
      { pattern: /\bstage\s*5\b|end[- ]stage/i, subTerm: 'stage 5/ESRD', codeRefine: 'N18.5' },
    ],
    taxonomy: 'CM',
  },
  {
    pattern: /\bacute\s+kidney\s+injury|aki|acute\s+renal\s+failure\b/gi,
    mainTerm: 'Acute kidney injury',
    codePrefixes: ['N17'],
    taxonomy: 'CM',
  },
  {
    pattern: /\burinary\s+tract\s+infection|uti\b/gi,
    mainTerm: 'Urinary tract infection',
    codePrefixes: ['N39'],
    taxonomy: 'CM',
  },

  // ---- GI / INFECTIOUS ----
  {
    pattern: /\bsepsis|septic\s+shock\b/gi,
    mainTerm: 'Sepsis',
    codePrefixes: ['A41', 'R65'],
    taxonomy: 'CM',
  },
  {
    pattern: /\bcirrhosis\b/gi,
    mainTerm: 'Cirrhosis',
    codePrefixes: ['K74'],
    taxonomy: 'CM',
  },
  {
    pattern: /\bgerd|gastroesophageal\s+reflux\b/gi,
    mainTerm: 'GERD',
    codePrefixes: ['K21'],
    taxonomy: 'CM',
  },
  {
    pattern: /\bgi\s+bleed|gastrointestinal\s+hemorrhage|gi\s+hemorrhage\b/gi,
    mainTerm: 'GI hemorrhage',
    codePrefixes: ['K92'],
    taxonomy: 'CM',
  },

  // ---- NEURO ----
  {
    pattern: /\bdementia|alzheimer/gi,
    mainTerm: 'Dementia',
    codePrefixes: ['F03', 'G30'],
    subTermExtractors: [
      { pattern: /\balzheimer/i, subTerm: "Alzheimer's disease", codeRefine: 'G30' },
      { pattern: /\bvascular/i, subTerm: 'vascular', codeRefine: 'F01' },
      { pattern: /\bunspecified/i, subTerm: 'unspecified', codeRefine: 'F03' },
    ],
    taxonomy: 'CM',
  },
  {
    pattern: /\bepilepsy|seizure/gi,
    mainTerm: 'Epilepsy/seizure',
    codePrefixes: ['G40'],
    taxonomy: 'CM',
  },

  // ---- MUSCULOSKELETAL ----
  {
    pattern: /\bfracture\b/gi,
    mainTerm: 'Fracture',
    codePrefixes: ['S'],
    subTermExtractors: [
      { pattern: /\bfemur|femoral\s+neck|hip/i, subTerm: 'femur/hip', codeRefine: 'S72' },
      { pattern: /\btibia/i, subTerm: 'tibia', codeRefine: 'S82' },
      { pattern: /\bradius|wrist/i, subTerm: 'radius/wrist', codeRefine: 'S52' },
      { pattern: /\bhumerus/i, subTerm: 'humerus', codeRefine: 'S42' },
      { pattern: /\bdisplaced/i, subTerm: 'displaced', codeRefine: '' },
    ],
    taxonomy: 'CM',
  },
  {
    pattern: /\bosteoporosis\b/gi,
    mainTerm: 'Osteoporosis',
    codePrefixes: ['M80', 'M81'],
    subTermExtractors: [
      { pattern: /\bwith\s+(current\s+)?pathological\s+fracture/i, subTerm: 'with pathological fracture', codeRefine: 'M80' },
      { pattern: /\bwithout\s+fracture/i, subTerm: 'without fracture', codeRefine: 'M81' },
    ],
    taxonomy: 'CM',
  },
  {
    pattern: /\bosteoarthritis\b/gi,
    mainTerm: 'Osteoarthritis',
    codePrefixes: ['M15', 'M16', 'M17'],
    taxonomy: 'CM',
  },

  // ---- MENTAL / BEHAVIORAL ----
  {
    pattern: /\b(major\s+)?depression|major\s+depressive\s+disorder\b/gi,
    mainTerm: 'Depression',
    codePrefixes: ['F32', 'F33'],
    taxonomy: 'CM',
  },
  {
    pattern: /\banxiety(\s+disorder)?\b/gi,
    mainTerm: 'Anxiety',
    codePrefixes: ['F41'],
    taxonomy: 'CM',
  },
  {
    pattern: /\btobacco|smoker|smoking|nicotine\s+dependence\b/gi,
    mainTerm: 'Tobacco/nicotine dependence',
    codePrefixes: ['F17', 'Z87.891'],
    subTermExtractors: [
      { pattern: /\bcurrent|active|use\s+disorder/i, subTerm: 'current use', codeRefine: 'F17' },
      { pattern: /\bhistory|former|quit/i, subTerm: 'history of', codeRefine: 'Z87.891' },
    ],
    taxonomy: 'CM',
  },

  // ---- BLOOD ----
  {
    pattern: /\b(iron\s+deficiency\s+)?anemia\b/gi,
    mainTerm: 'Anemia',
    codePrefixes: ['D50', 'D64'],
    subTermExtractors: [
      { pattern: /\biron\s+deficiency/i, subTerm: 'iron deficiency', codeRefine: 'D50' },
    ],
    taxonomy: 'CM',
  },
  {
    pattern: /\bcoagulopathy\b/gi,
    mainTerm: 'Coagulopathy',
    codePrefixes: ['D68'],
    taxonomy: 'CM',
  },

  // ---- STATUS / Z-CODES ----
  {
    pattern: /\bvitamin\s+d\s+deficiency\b/gi,
    mainTerm: 'Vitamin D deficiency',
    codePrefixes: ['E55'],
    taxonomy: 'CM',
  },
  {
    pattern: /\bfall\b/gi,
    mainTerm: 'Fall',
    codePrefixes: ['W'],
    subTermExtractors: [
      { pattern: /\bfrom\s+standing/i, subTerm: 'from standing height', codeRefine: 'W18' },
      { pattern: /\bfrom\s+bed/i, subTerm: 'from bed', codeRefine: 'W06' },
      { pattern: /\bfrom\s+chair/i, subTerm: 'from chair', codeRefine: 'W07' },
      { pattern: /\bstairs/i, subTerm: 'on stairs', codeRefine: 'W10' },
    ],
    taxonomy: 'CM',
  },
];

// ============================================================================
// Phase A: Holistic Document Read
// "Read the ENTIRE document contextually before answering"
// ============================================================================

export function parseDocumentHolistically(text: string): DocumentStructure {
  const sections = extractSections(text);
  const textLower = text.toLowerCase();

  // Extract demographics
  const ageMatch = text.match(/(\d{1,3})[- ]year[- ]old/i);
  const genderMatch = text.match(/\b(male|female)\b/i);
  const admitMatch = text.match(/admission\s+date:?\s*(\d{4}[-/]\d{2}[-/]\d{2})/i);
  const dischMatch = text.match(/discharge\s+date:?\s*(\d{4}[-/]\d{2}[-/]\d{2})/i);

  // Determine encounter context
  let encounterContext: DocumentStructure['encounterContext'] = 'unknown';
  if (textLower.includes('discharge summary') || textLower.includes('inpatient')) encounterContext = 'inpatient';
  else if (textLower.includes('outpatient') || textLower.includes('office visit')) encounterContext = 'outpatient';
  else if (textLower.includes('emergency') || textLower.includes('ed visit')) encounterContext = 'emergency';

  // Extract principal diagnosis
  const principalDiagnosis = extractPrincipalDiagnosis(text, sections);

  // Extract secondary diagnoses
  const secondaryDiagnoses = extractSecondaryDiagnoses(text, sections);

  // Extract procedures
  const procedures = extractProcedures(text, sections);

  // Extract medications
  const medications = extractMedications(text, sections);

  // Extract lab results
  const labResults = extractLabResults(text);

  // Extract hospital course
  const hospitalCourseSection = sections.find(
    (s) => s.heading.toLowerCase().includes('hospital course') || s.heading.toLowerCase().includes('clinical course')
  );

  return {
    patientAge: ageMatch ? parseInt(ageMatch[1]) : undefined,
    patientGender: genderMatch ? (genderMatch[1].toLowerCase() === 'male' ? 'M' : 'F') : undefined,
    admissionDate: admitMatch ? admitMatch[1] : undefined,
    dischargeDate: dischMatch ? dischMatch[1] : undefined,
    encounterContext,
    principalDiagnosis,
    secondaryDiagnoses,
    procedures,
    medications,
    labResults,
    hospitalCourse: hospitalCourseSection?.content || '',
    sections,
  };
}

function extractSections(text: string): { heading: string; content: string }[] {
  const sectionPatterns = [
    /^(PRINCIPAL\s+DIAGNOSIS|PRIMARY\s+DIAGNOSIS):?\s*/im,
    /^(SECONDARY\s+DIAGNOS[EI]S|ADDITIONAL\s+DIAGNOS[EI]S|OTHER\s+DIAGNOS[EI]S):?\s*/im,
    /^(HOSPITAL\s+COURSE|CLINICAL\s+COURSE):?\s*/im,
    /^(PROCEDURES?|OPERATIONS?):?\s*/im,
    /^(DISCHARGE\s+MEDICATIONS?):?\s*/im,
    /^(DISCHARGE\s+DISPOSITION):?\s*/im,
    /^(FOLLOW[- ]UP):?\s*/im,
    /^(HISTORY\s+OF\s+PRESENT\s+ILLNESS|HPI):?\s*/im,
    /^(PHYSICAL\s+EXAM|EXAMINATION):?\s*/im,
    /^(LABORATORY|LAB\s+RESULTS?|LABS?):?\s*/im,
    /^(IMAGING|RADIOLOGY|X-RAY|CT|MRI):?\s*/im,
    /^(ASSESSMENT\s+AND\s+PLAN|A\s*\/\s*P|ASSESSMENT):?\s*/im,
  ];

  const sections: { heading: string; content: string; startIndex: number }[] = [];
  const lines = text.split('\n');
  let currentHeading = 'HEADER';
  let currentContent: string[] = [];
  let currentStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    let matched = false;

    for (const pattern of sectionPatterns) {
      if (pattern.test(line)) {
        // Save previous section
        if (currentContent.length > 0 || currentHeading !== 'HEADER') {
          sections.push({ heading: currentHeading, content: currentContent.join('\n').trim(), startIndex: currentStart });
        }

        // Extract the heading and any content on the SAME line after the colon
        const colonIdx = line.indexOf(':');
        if (colonIdx >= 0) {
          currentHeading = line.substring(0, colonIdx).trim();
          const afterColon = line.substring(colonIdx + 1).trim();
          currentContent = afterColon ? [afterColon] : [];
        } else {
          currentHeading = line.trim();
          currentContent = [];
        }
        currentStart = i;
        matched = true;
        break;
      }
    }

    if (!matched) {
      currentContent.push(line);
    }
  }

  // Push last section
  if (currentContent.length > 0) {
    sections.push({ heading: currentHeading, content: currentContent.join('\n').trim(), startIndex: currentStart });
  }

  return sections.map(({ heading, content }) => ({ heading, content }));
}

function extractPrincipalDiagnosis(text: string, sections: { heading: string; content: string }[]): ExtractedCondition | null {
  const pdxSection = sections.find(
    (s) => s.heading.toLowerCase().includes('principal') || s.heading.toLowerCase().includes('primary diagnosis')
  );

  if (pdxSection && pdxSection.content.trim()) {
    return parseCondition(pdxSection.content.trim(), pdxSection.heading, text);
  }

  // Fallback: regex directly on full text
  const pdxMatch = text.match(/(?:PRINCIPAL|PRIMARY)\s+DIAGNOSIS:?\s*(.+?)(?:\n|$)/i);
  if (pdxMatch && pdxMatch[1].trim().length > 3) {
    return parseCondition(pdxMatch[1].trim(), 'PRINCIPAL DIAGNOSIS', text);
  }

  return null;
}

function extractSecondaryDiagnoses(text: string, sections: { heading: string; content: string }[]): ExtractedCondition[] {
  const conditions: ExtractedCondition[] = [];
  const dxSection = sections.find(
    (s) => s.heading.toLowerCase().includes('secondary') || s.heading.toLowerCase().includes('additional') || s.heading.toLowerCase().includes('other diagnos')
  );

  if (dxSection) {
    // Parse numbered list items
    const items = dxSection.content.split(/\n/).filter((l) => l.trim());
    for (const item of items) {
      const cleaned = item.replace(/^\d+[\.\)]\s*/, '').trim();
      if (cleaned.length > 3) {
        conditions.push(parseCondition(cleaned, dxSection.heading, text));
      }
    }
  }

  return conditions;
}

function parseCondition(rawText: string, sectionFound: string, fullText: string): ExtractedCondition {
  const textLower = rawText.toLowerCase();

  // Detect laterality
  let laterality: ExtractedCondition['laterality'];
  if (/\bright\b/.test(textLower)) laterality = 'right';
  else if (/\bleft\b/.test(textLower)) laterality = 'left';
  else if (/\bbilateral\b/.test(textLower)) laterality = 'bilateral';

  // Detect acuity
  const isAcute = /\bacute\b/i.test(textLower);
  const isChronicExacerbation = /\b(acute\s+(exacerbation|on\s+chronic)|exacerbation)\b/i.test(textLower);

  // Detect encounter type from full document
  let encounterType: ExtractedCondition['encounterType'];
  if (/\binitial\s+encounter\b/i.test(fullText)) encounterType = 'initial';
  else if (/\bsubsequent\s+encounter\b/i.test(fullText)) encounterType = 'subsequent';
  else if (/\bsequela\b/i.test(fullText)) encounterType = 'sequela';
  else encounterType = 'initial'; // Default for discharge summaries

  // Detect body part
  let bodyPart: string | undefined;
  const bodyPartMatch = textLower.match(
    /\b(hip|knee|shoulder|wrist|ankle|femur|tibia|humerus|radius|spine|lung|kidney|heart|brain|liver)\b/
  );
  if (bodyPartMatch) bodyPart = bodyPartMatch[1];

  // Detect severity
  let severity: string | undefined;
  if (/\bsevere\b/i.test(textLower)) severity = 'severe';
  else if (/\bmoderate\b/i.test(textLower)) severity = 'moderate';
  else if (/\bmild\b/i.test(textLower)) severity = 'mild';

  // Normalize the term (remove common noise)
  const normalizedTerm = rawText
    .replace(/[,()]/g, '')
    .replace(/\b(new\s+onset|current|active)\b/gi, '')
    .trim();

  return {
    rawText,
    normalizedTerm,
    isAcute,
    isChronicExacerbation,
    bodyPart,
    laterality,
    severity,
    encounterType,
    sectionFound,
  };
}

function extractProcedures(text: string, sections: { heading: string; content: string }[]): ExtractedProcedure[] {
  const procedures: ExtractedProcedure[] = [];
  const procSection = sections.find(
    (s) => s.heading.toLowerCase().includes('procedure') || s.heading.toLowerCase().includes('operation')
  );

  if (procSection) {
    const items = procSection.content.split(/\n/).filter((l) => l.trim());
    for (const item of items) {
      const cleaned = item.replace(/^\d+[\.\)]\s*/, '').trim();
      if (cleaned.length > 3) {
        const textLower = cleaned.toLowerCase();
        let laterality: ExtractedProcedure['laterality'];
        if (/\bright\b/.test(textLower)) laterality = 'right';
        else if (/\bleft\b/.test(textLower)) laterality = 'left';
        else if (/\bbilateral\b/.test(textLower)) laterality = 'bilateral';

        let approach: string | undefined;
        if (/\bopen\b/i.test(textLower)) approach = 'open';
        else if (/\bpercutaneous|catheter/i.test(textLower)) approach = 'percutaneous';
        else if (/\blaparoscopic|endoscopic/i.test(textLower)) approach = 'endoscopic';

        let bodyPart: string | undefined;
        const bpMatch = textLower.match(/\b(hip|knee|heart|lung|brain|spine|femur|coronary|lad|rca)\b/);
        if (bpMatch) bodyPart = bpMatch[1];

        let device: string | undefined;
        if (/\bstent|des\b/i.test(textLower)) device = 'stent';
        else if (/\bscrew|plate|nail/i.test(textLower)) device = 'internal fixation';
        else if (/\bprosthesis|implant/i.test(textLower)) device = 'prosthesis';

        procedures.push({
          rawText: cleaned,
          normalizedTerm: cleaned,
          approach,
          device,
          bodyPart,
          laterality,
          sectionFound: procSection.heading,
        });
      }
    }
  }

  return procedures;
}

function extractMedications(text: string, sections: { heading: string; content: string }[]): string[] {
  const medSection = sections.find((s) => s.heading.toLowerCase().includes('medication'));
  if (!medSection) return [];
  return medSection.content.split(/[,\n]/).map((m) => m.trim()).filter((m) => m.length > 2);
}

function extractLabResults(text: string): string[] {
  const results: string[] = [];
  const labPatterns = [
    /\b(hba1c|a1c)\s*(?:was|of|:)?\s*([\d.]+)\s*%?/gi,
    /\b(creatinine)\s*(?:was|of|:)?\s*([\d.]+)/gi,
    /\b(hemoglobin|hgb|hb)\s*(?:was|of|:)?\s*([\d.]+)/gi,
    /\b(troponin\s*i?)\s*(?:was|of|:)?\s*([\d.]+)/gi,
    /\b(ldl)\s*(?:was|of|:)?\s*([\d.]+)/gi,
    /\b(spo2|oxygen\s+saturation)\s*(?:was|of|:)?\s*([\d.]+)\s*%?/gi,
    /\b(ejection\s+fraction|ef)\s*(?:was|of|:)?\s*([\d.]+)\s*%?/gi,
    /\b(bmi)\s*(?:was|of|:)?\s*([\d.]+)/gi,
    /\b(vitamin\s+d)\s*(?:level)?\s*(?:was|of|:)?\s*([\d.]+)/gi,
    /\b(t[- ]?score)\s*(?:was|of|:)?\s*(-?[\d.]+)/gi,
    /\b(mmse|mini[- ]mental)\s*(?:score)?\s*(?:was|of|:)?\s*([\d.]+\/?\d*)/gi,
  ];

  for (const pattern of labPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      results.push(`${match[1]}: ${match[2]}`);
    }
  }

  return results;
}

// ============================================================================
// Phase B: Condition-by-Condition Coding (CMS 2-Step)
// ============================================================================

interface PhaseB_CodeResult {
  result: CodingResult;
  reasoning: CodingReasoning;
}

function codeCondition(
  condition: ExtractedCondition,
  codeIndex: ICD10IndexEntry[],
  cmDetails: Record<string, ICD10CMDetail>,
  allAssignedCodes: string[],
  fullText: string,
  isPrincipal: boolean,
  sequenceOrder: number
): PhaseB_CodeResult | null {
  // ── Step 1: Alphabetic Index Lookup ──
  const indexLookup = lookupInAlphabeticIndex(condition, fullText);
  if (!indexLookup) return null;

  // ── Step 2: Tabular List Verification ──
  const tabularResult = verifyInTabularList(indexLookup, codeIndex, cmDetails, condition);
  if (!tabularResult) return null;

  const { bestMatch, verification } = tabularResult;

  // ── Step 3: Completeness Checks ──
  const detail = cmDetails[bestMatch.code];
  const completeness = runCompletenessChecks(
    bestMatch.code,
    detail,
    allAssignedCodes,
    cmDetails,
    fullText
  );

  // ── Build Score & Confidence ──
  let score = 0;
  const matchedTerms: string[] = [];

  // Clinical pattern match
  score += 35;
  matchedTerms.push(indexLookup.mainTerm);
  indexLookup.subTerms.forEach((st) => matchedTerms.push(st));

  // Description word matching
  const descLower = bestMatch.desc.toLowerCase();
  const condLower = condition.normalizedTerm.toLowerCase();
  const descWords = descLower.split(/[\s,()\/\-]+/).filter((w) => w.length > 2);
  const condWords = condLower.split(/[\s,()\/\-]+/).filter((w) => w.length > 2);

  let wordMatches = 0;
  for (const dw of descWords) {
    if (condWords.some((cw) => cw.includes(dw) || dw.includes(cw))) {
      wordMatches++;
      if (!matchedTerms.includes(dw)) matchedTerms.push(dw);
    }
  }

  if (descWords.length > 0 && wordMatches > 0) {
    const matchRatio = wordMatches / descWords.length;
    score += matchRatio * 45;
    if (matchRatio >= 0.8) score += 15;
    else if (matchRatio >= 0.5) score += 8;
  }

  // Billable bonus
  if (bestMatch.billable) score += 5;

  // Completeness penalty
  const failedChecks = completeness.checks.filter((c) => !c.passed && c.severity === 'error');
  score -= failedChecks.length * 10;

  const confidence = Math.max(0.15, Math.min(score / 100, 0.99));
  const tier = getTier(confidence);

  // ── Red Flags ──
  const redFlags = detectRedFlags(bestMatch, completeness, fullText);

  // ── Build Reasoning ──
  const codingPath = [
    indexLookup.mainTerm,
    ...indexLookup.subTerms,
    bestMatch.code,
  ].join(' → ');

  const whyThisCode = buildWhyExplanation(condition, indexLookup, verification, bestMatch, completeness);

  const reasoning: CodingReasoning = {
    documentContext: `Found "${condition.rawText}" in ${condition.sectionFound} section`,
    indexLookup,
    tabularVerification: verification,
    completeness,
    whyThisCode,
    codingPath,
    alternativesConsidered: [],
  };

  const result: CodingResult = {
    code: bestMatch.code,
    description: bestMatch.desc,
    taxonomy: bestMatch.taxonomy,
    confidence,
    tier,
    source: 'keyword',
    matchedTerms: [...new Set(matchedTerms)],
    reasoning: whyThisCode,
    redFlags,
    isPrincipalDx: isPrincipal,
    sequenceOrder,
    validationResults: [],
    codingReasoning: reasoning,
    completenessResult: completeness,
    extractedCondition: condition,
  };

  return { result, reasoning };
}

/**
 * Step 1: Look up the clinical term in our Alphabetic Index (pattern map)
 */
function lookupInAlphabeticIndex(condition: ExtractedCondition, fullText: string): IndexLookupStep | null {
  const searchText = condition.normalizedTerm + ' ' + (condition.rawText || '');
  const fullTextForContext = fullText; // Use full text for sub-term extraction

  for (const mapping of CLINICAL_TERM_INDEX) {
    mapping.pattern.lastIndex = 0;
    if (mapping.pattern.test(searchText)) {
      mapping.pattern.lastIndex = 0;

      const subTerms: string[] = [];
      let refinedCode = mapping.codePrefixes[0];

      // Extract sub-terms for more specific coding
      if (mapping.subTermExtractors) {
        for (const extractor of mapping.subTermExtractors) {
          // Check both the condition text AND the full document for context
          if (extractor.pattern.test(searchText) || extractor.pattern.test(fullTextForContext)) {
            subTerms.push(extractor.subTerm);
            if (extractor.codeRefine) {
              refinedCode = extractor.codeRefine;
            }
          }
        }
      }

      // Add laterality as sub-term
      if (condition.laterality) {
        subTerms.push(condition.laterality);
      }

      return {
        clinicalTerm: condition.rawText,
        mainTerm: mapping.mainTerm,
        subTerms,
        indexedCode: refinedCode,
        indexNote: `Mapped via CMS Step 1: "${condition.normalizedTerm}" → ${mapping.mainTerm}`,
      };
    }
  }

  return null;
}

/**
 * Step 2: Verify the indexed code in the Tabular List (our code database)
 * Find the best matching code, preferring billable codes with highest specificity
 */
function verifyInTabularList(
  indexLookup: IndexLookupStep,
  codeIndex: ICD10IndexEntry[],
  cmDetails: Record<string, ICD10CMDetail>,
  condition: ExtractedCondition
): { bestMatch: ICD10IndexEntry; verification: TabularVerificationStep } | null {
  const prefix = indexLookup.indexedCode;

  // Find all codes that match the prefix
  const candidates = codeIndex.filter((e) => e.code.startsWith(prefix));

  if (candidates.length === 0) {
    // Fallback: try broader prefix (first 3 chars)
    const broadPrefix = prefix.substring(0, 3);
    const broadCandidates = codeIndex.filter((e) => e.code.startsWith(broadPrefix));
    if (broadCandidates.length === 0) return null;
    candidates.push(...broadCandidates);
  }

  // Score candidates by specificity and relevance
  const condLower = (condition.normalizedTerm + ' ' + condition.rawText).toLowerCase();

  const scored = candidates.map((entry) => {
    let score = 0;
    const descLower = entry.desc.toLowerCase();

    // Billable gets priority (CMS requirement: must use most specific code)
    if (entry.billable) score += 20;

    // Description word match
    const descWords = descLower.split(/[\s,()\/\-]+/).filter((w) => w.length > 2);
    for (const dw of descWords) {
      if (condLower.includes(dw)) score += 5;
    }

    // Laterality match
    if (condition.laterality) {
      if (descLower.includes(condition.laterality)) score += 15;
      else if (descLower.includes('unspecified')) score -= 5; // Penalize unspecified when laterality known
    }

    // Severity match
    if (condition.severity && descLower.includes(condition.severity)) score += 10;

    // Acuity match
    if (condition.isAcute && descLower.includes('acute')) score += 10;
    if (condition.isChronicExacerbation && descLower.includes('exacerbation')) score += 10;

    // Body part match
    if (condition.bodyPart && descLower.includes(condition.bodyPart)) score += 10;

    // Prefer codes that start with the refined prefix over broader ones
    if (entry.code.startsWith(prefix)) score += 10;

    // Longer codes are more specific
    score += entry.code.replace('.', '').length * 2;

    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const bestMatch = scored[0]?.entry;
  if (!bestMatch) return null;

  // Build tabular verification
  const detail = cmDetails[bestMatch.code];
  const categoryCode = bestMatch.code.substring(0, 3);
  const chapter = detail?.chapter || bestMatch.chapter || 0;
  const instructionalNotes: string[] = [];

  if (detail) {
    if (detail.includes.length > 0) instructionalNotes.push(`Includes: ${detail.includes.join('; ')}`);
    if (detail.excludes1.length > 0) instructionalNotes.push(`Excludes1: ${detail.excludes1.join('; ')}`);
    if (detail.excludes2.length > 0) instructionalNotes.push(`Excludes2: ${detail.excludes2.join('; ')}`);
    if (detail.codeFirst) instructionalNotes.push(`Code First: ${detail.codeFirst}`);
    if (detail.useAdditionalCode) instructionalNotes.push(`Use Additional Code: ${detail.useAdditionalCode}`);
    if (detail.codeAlso) instructionalNotes.push(`Code Also: ${detail.codeAlso}`);
  }

  const moreSpecificExists = detail ? detail.children.length > 0 && !detail.billable : false;

  const verification: TabularVerificationStep = {
    verifiedCode: bestMatch.code,
    categoryCode,
    sectionRange: detail?.section || '',
    chapterNumber: chapter,
    instructionalNotes,
    moreSpecificExists,
  };

  // Note if we chose this over an alternative
  if (scored.length > 1 && scored[1].entry.code !== bestMatch.code) {
    const alt = scored[1].entry;
    verification.selectedOverAlternative = {
      alternativeCode: alt.code,
      reason: `${bestMatch.code} scored higher (${scored[0].score} vs ${scored[1].score}) due to better specificity match`,
    };
  }

  return { bestMatch, verification };
}

// ============================================================================
// Red Flag Detection (enhanced with completeness)
// ============================================================================

function detectRedFlags(
  entry: ICD10IndexEntry,
  completeness: { checks: { id: string; passed: boolean; severity: string; message: string }[] },
  _text: string
): RedFlag[] {
  const flags: RedFlag[] = [];

  // Convert completeness failures to red flags
  for (const check of completeness.checks) {
    if (!check.passed) {
      let type: RedFlag['type'] = 'not_billable';
      if (check.id === 'billable') type = 'not_billable';
      else if (check.id === 'laterality') type = 'missing_laterality';
      else if (check.id === 'seventh_char' || check.id === 'x_placeholder') type = 'missing_7th_char';
      else if (check.id === 'excludes1') type = 'excludes1_conflict';
      else if (check.id === 'excludes2') type = 'excludes2_warning';
      else if (check.id === 'code_first') type = 'code_first_needed';
      else if (check.id === 'combination') type = 'additional_code_needed';

      flags.push({
        type,
        message: check.message,
        severity: check.severity as RedFlag['severity'],
        suggestedAction: (check as { suggestedFix?: string }).suggestedFix,
      });
    }
  }

  return flags;
}

// ============================================================================
// Reasoning Builder
// ============================================================================

function buildWhyExplanation(
  condition: ExtractedCondition,
  indexLookup: IndexLookupStep,
  verification: TabularVerificationStep,
  bestMatch: ICD10IndexEntry,
  completeness: { checks: { id: string; passed: boolean; message: string }[]; allPassed: boolean }
): string {
  const parts: string[] = [];

  // Document context
  parts.push(`Step 1 (Index): Clinical term "${condition.rawText}" mapped to main term "${indexLookup.mainTerm}"`);

  if (indexLookup.subTerms.length > 0) {
    parts.push(`Sub-terms identified: ${indexLookup.subTerms.join(', ')}`);
  }

  parts.push(`Index points to code range: ${indexLookup.indexedCode}`);

  // Tabular verification
  parts.push(`Step 2 (Tabular): Verified ${bestMatch.code} — "${bestMatch.desc}" in Chapter ${verification.chapterNumber}`);

  if (verification.moreSpecificExists) {
    parts.push(`⚠ Note: More specific codes exist under this category`);
  }

  if (verification.selectedOverAlternative) {
    parts.push(`Selected over ${verification.selectedOverAlternative.alternativeCode}: ${verification.selectedOverAlternative.reason}`);
  }

  // Completeness summary
  const failedChecks = completeness.checks.filter((c) => !c.passed);
  if (completeness.allPassed) {
    parts.push(`Completeness: All 8 CMS checks passed ✓`);
  } else {
    parts.push(`Completeness: ${failedChecks.length} check(s) require attention: ${failedChecks.map(c => c.id).join(', ')}`);
  }

  return parts.join('. ');
}

// ============================================================================
// Confidence Tier
// ============================================================================

function getTier(confidence: number): ConfidenceTier {
  if (confidence >= 0.95) return 1;
  if (confidence >= 0.80) return 2;
  if (confidence >= 0.50) return 3;
  return 4;
}

// ============================================================================
// Main Entry Point — Full Analysis Pipeline
// ============================================================================

export interface MatchOptions {
  maxResults?: number;
  minConfidence?: number;
  billableOnly?: boolean;
}

export interface AnalysisResult {
  results: CodingResult[];
  documentStructure: DocumentStructure;
  crossValidation: CrossValidationResult | null;
}

/**
 * Main analysis function — implements the full CMS 2-step methodology
 * with holistic document analysis.
 */
export function analyzeWithCMS2Step(
  text: string,
  codeIndex: ICD10IndexEntry[],
  cmDetails: Record<string, ICD10CMDetail>,
  options: MatchOptions = {}
): AnalysisResult {
  const { maxResults = 50, billableOnly = true } = options;

  // ── Phase A: Holistic Document Read ──
  const docStructure = parseDocumentHolistically(text);

  // ── Phase B: Condition-by-Condition Coding ──
  const codedResults: CodingResult[] = [];
  const assignedCodes: string[] = [];
  let sequence = 1;

  // Filter index if billable only
  const searchableIndex = billableOnly ? codeIndex.filter((e) => e.billable) : codeIndex;

  // Code the principal diagnosis first
  if (docStructure.principalDiagnosis) {
    const result = codeCondition(
      docStructure.principalDiagnosis,
      searchableIndex,
      cmDetails,
      assignedCodes,
      text,
      true,
      sequence
    );
    if (result) {
      codedResults.push(result.result);
      assignedCodes.push(result.result.code);
      sequence++;
    }
  }

  // Code secondary diagnoses
  for (const condition of docStructure.secondaryDiagnoses) {
    if (codedResults.length >= maxResults) break;

    const result = codeCondition(
      condition,
      searchableIndex,
      cmDetails,
      assignedCodes,
      text,
      false,
      sequence
    );
    if (result && !assignedCodes.includes(result.result.code)) {
      codedResults.push(result.result);
      assignedCodes.push(result.result.code);
      sequence++;
    }
  }

  // ── "Think and Rethink" — re-run completeness with ALL codes assigned ──
  for (const result of codedResults) {
    const detail = cmDetails[result.code];
    const updatedCompleteness = runCompletenessChecks(
      result.code,
      detail,
      assignedCodes,
      cmDetails,
      text
    );
    result.completenessResult = updatedCompleteness;
    result.redFlags = detectRedFlags(
      { code: result.code, desc: result.description, billable: true, taxonomy: result.taxonomy },
      updatedCompleteness,
      text
    );

    // Update reasoning with cross-code context
    if (result.codingReasoning) {
      result.codingReasoning.completeness = updatedCompleteness;
    }
  }

  // ── Phase C: Cross-Validation ──
  const principalCode = codedResults.find((r) => r.isPrincipalDx)?.code || null;
  const crossValidation = assignedCodes.length > 0
    ? runCrossValidation(assignedCodes, cmDetails, text, principalCode)
    : null;

  // Add cross-validation warnings as red flags on affected codes
  if (crossValidation) {
    for (const conflict of crossValidation.excludes1Conflicts) {
      const affectedResult = codedResults.find((r) => r.code === conflict.code1);
      if (affectedResult) {
        affectedResult.redFlags.push({
          type: 'excludes1_conflict',
          message: conflict.message,
          severity: 'error',
          suggestedAction: `Remove either ${conflict.code1} or ${conflict.code2} — they are mutually exclusive`,
        });
      }
    }

    for (const seq of crossValidation.missingSequencing) {
      const affectedResult = codedResults.find((r) => r.code === seq.code);
      if (affectedResult) {
        affectedResult.redFlags.push({
          type: seq.type === 'code_first' ? 'code_first_needed' : 'additional_code_needed',
          message: `${seq.type === 'code_first' ? 'Code First' : 'Use Additional Code'}: requires ${seq.requiresCode}`,
          severity: 'warning',
          suggestedAction: `Add code ${seq.requiresCode} to the code set`,
        });
      }
    }
  }

  // Sort by sequence order
  codedResults.sort((a, b) => a.sequenceOrder - b.sequenceOrder);

  return {
    results: codedResults.slice(0, maxResults),
    documentStructure: docStructure,
    crossValidation,
  };
}

/**
 * Legacy wrapper for backward compatibility
 */
export function analyzeWithKeywords(
  text: string,
  codeIndex: ICD10IndexEntry[],
  options: MatchOptions = {}
): CodingResult[] {
  // For backward compat, return just the results array
  const { results } = analyzeWithCMS2Step(text, codeIndex, {}, options);
  return results;
}

// ============================================================================
// Sample Discharge Summaries for Demo
// ============================================================================

export const SAMPLE_SUMMARIES = [
  {
    title: 'Acute MI with Heart Failure',
    text: `DISCHARGE SUMMARY

Patient: 72-year-old male
Admission Date: 2026-02-15
Discharge Date: 2026-02-22

PRINCIPAL DIAGNOSIS: Acute ST-elevation myocardial infarction (STEMI) of the left anterior descending artery.

SECONDARY DIAGNOSES:
1. Acute systolic heart failure (new onset)
2. Type 2 diabetes mellitus with diabetic nephropathy
3. Essential hypertension
4. Hyperlipidemia
5. Chronic kidney disease, stage 3
6. Atrial fibrillation (new onset)
7. Tobacco use disorder, current smoker

HOSPITAL COURSE:
Patient presented to the ED with acute chest pain radiating to the left arm, diaphoresis, and shortness of breath. ECG showed ST-elevation in leads V1-V4. Troponin I was elevated at 12.5 ng/mL. Patient was taken emergently for cardiac catheterization which revealed 99% occlusion of the LAD. Percutaneous coronary intervention (PCI) with drug-eluting stent placement was performed successfully.

Post-procedure, the patient developed acute heart failure with an ejection fraction of 30%. Patient was started on IV diuretics, ACE inhibitor, beta-blocker, and anticoagulation for new-onset atrial fibrillation.

Renal function worsened with creatinine rising to 2.8 from baseline of 1.9, consistent with CKD stage 3 exacerbation.

HbA1c was 8.2%, diabetes medications were adjusted. Lipid panel showed LDL of 145. Statin therapy was intensified.

Patient was counseled on smoking cessation and provided with nicotine replacement therapy.

PROCEDURES:
1. Left heart catheterization
2. PCI with DES to LAD

DISCHARGE MEDICATIONS:
Aspirin, Clopidogrel, Metoprolol, Lisinopril, Atorvastatin, Furosemide, Apixaban, Metformin, Insulin glargine

FOLLOW-UP: Cardiology in 1 week, PCP in 2 weeks, Nephrology in 4 weeks.`,
  },
  {
    title: 'Pneumonia with COPD Exacerbation',
    text: `DISCHARGE SUMMARY

Patient: 68-year-old female
Admission Date: 2026-03-01
Discharge Date: 2026-03-07

PRINCIPAL DIAGNOSIS: Community-acquired pneumonia, right lower lobe

SECONDARY DIAGNOSES:
1. Acute exacerbation of COPD
2. Acute hypoxic respiratory failure
3. Type 2 diabetes mellitus, uncontrolled
4. Essential hypertension
5. Obesity, BMI 35.2
6. Pleural effusion, right
7. Urinary tract infection, E. coli
8. Iron deficiency anemia

HOSPITAL COURSE:
Patient presented with 5-day history of productive cough, fever to 102.4°F, and progressive dyspnea. Chest X-ray showed right lower lobe consolidation with small right pleural effusion. She was hypoxic on room air with SpO2 of 84%, requiring supplemental oxygen via high-flow nasal cannula.

Blood cultures and sputum cultures were obtained. Sputum culture grew Streptococcus pneumoniae. IV antibiotics (ceftriaxone and azithromycin) were initiated. Patient also met criteria for acute COPD exacerbation and was treated with systemic corticosteroids and nebulized bronchodilators.

Urine culture grew E. coli > 100,000 CFU/mL, treated with ciprofloxacin. Hemoglobin was 9.2 g/dL with iron studies consistent with iron deficiency anemia.

HbA1c was 9.8%, indicating poorly controlled diabetes. Blood glucose was managed with sliding scale insulin during admission. Home medications were adjusted at discharge.

Patient improved clinically and was weaned to 2L nasal cannula by discharge. Pleural effusion resolved without intervention.

DISCHARGE MEDICATIONS:
Amoxicillin-clavulanate, Prednisone taper, Albuterol inhaler, Tiotropium, Ciprofloxacin, Iron sulfate, Metformin, Glipizide, Lisinopril

FOLLOW-UP: Pulmonology in 2 weeks, PCP in 1 week, repeat chest X-ray in 6 weeks.`,
  },
  {
    title: 'Hip Fracture with Surgical Repair',
    text: `DISCHARGE SUMMARY

Patient: 85-year-old female
Admission Date: 2026-02-20
Discharge Date: 2026-02-27

PRINCIPAL DIAGNOSIS: Displaced fracture of neck of right femur (hip fracture) due to fall

SECONDARY DIAGNOSES:
1. Osteoporosis with current pathological fracture
2. Dementia, unspecified type
3. Atrial fibrillation, chronic
4. Essential hypertension
5. Hypothyroidism
6. Depression
7. Vitamin D deficiency
8. Fall from standing height at home

PROCEDURES:
1. Open reduction internal fixation (ORIF) of right hip fracture with compression hip screw

HOSPITAL COURSE:
Patient was brought to the ED by EMS after being found on the floor at home by her caregiver. She was unable to bear weight on the right leg. X-ray and CT confirmed displaced femoral neck fracture on the right side.

Patient underwent ORIF of right hip on hospital day 2 under general anesthesia. Surgery was uncomplicated. Post-operatively, patient was managed with IV antibiotics prophylaxis, VTE prophylaxis with enoxaparin, and pain management with multimodal analgesia.

Physical therapy was initiated on post-operative day 1. Patient was able to ambulate with a walker and partial weight bearing by discharge.

DEXA scan confirmed osteoporosis with T-score of -3.2 at the femoral neck. Vitamin D level was 12 ng/mL. Started on bisphosphonate therapy and vitamin D supplementation.

Mental status was at baseline per caregiver. MMSE score 18/30 consistent with moderate dementia.

DISCHARGE MEDICATIONS:
Acetaminophen, Enoxaparin, Alendronate, Calcium/Vitamin D, Levothyroxine, Sertraline, Metoprolol, Apixaban, Lisinopril

DISCHARGE DISPOSITION: Skilled nursing facility for rehabilitation

FOLLOW-UP: Orthopedics in 2 weeks, PCP in 4 weeks.`,
  },
];
