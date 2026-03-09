/**
 * Synthetic Claims Data Generator
 * Generates 50 providers with ~5,000 claims for fraud detection demo.
 * Includes 4 injected outlier providers with known fraud patterns.
 */

import type { ClaimRecord } from '@/types/icd10';

// Seeded random for reproducibility
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const SPECIALTIES = [
  'Internal Medicine', 'Cardiology', 'Orthopedics', 'Pulmonology',
  'Gastroenterology', 'Neurology', 'General Surgery', 'Emergency Medicine',
  'Nephrology', 'Oncology',
];

const COMMON_CODES = {
  'Internal Medicine': ['I10', 'E11.9', 'J44.1', 'E78.5', 'Z87.891', 'K21.0', 'M54.5', 'G47.33', 'F17.210', 'N18.3'],
  'Cardiology': ['I25.10', 'I48.91', 'I50.9', 'I10', 'I21.3', 'I35.0', 'I42.9', 'R00.0', 'I73.9', 'Z95.1'],
  'Orthopedics': ['M17.11', 'M16.11', 'M54.5', 'S72.001A', 'M79.3', 'S82.001A', 'M75.11', 'M23.611', 'S42.001A', 'M48.06'],
  'Pulmonology': ['J44.1', 'J18.9', 'J96.01', 'J45.20', 'J84.10', 'R06.02', 'J80', 'J43.9', 'J69.0', 'J47.1'],
  'Gastroenterology': ['K21.0', 'K57.30', 'K80.20', 'K74.60', 'K85.9', 'K50.90', 'K51.90', 'K72.90', 'K92.2', 'K22.10'],
  'Neurology': ['G20', 'G40.309', 'G43.909', 'I63.9', 'G35', 'G30.9', 'G47.33', 'R51.9', 'G62.9', 'G89.29'],
  'General Surgery': ['K80.20', 'K35.80', 'K40.90', 'K43.0', 'Z48.1', 'K56.69', 'L02.212', 'K57.32', 'T81.4XXA', 'Z87.19'],
  'Emergency Medicine': ['R10.9', 'R07.9', 'S06.0X0A', 'R55', 'J18.9', 'T78.2XXA', 'S52.501A', 'S61.019A', 'R11.10', 'I10'],
  'Nephrology': ['N18.4', 'N18.5', 'N18.6', 'Z99.2', 'N17.9', 'E11.22', 'I12.9', 'N25.1', 'N04.9', 'N39.0'],
  'Oncology': ['C34.90', 'C18.9', 'C50.919', 'C61', 'C78.7', 'C79.51', 'Z51.11', 'Z51.12', 'D64.9', 'R18.8'],
};

const PLACES_OF_SERVICE = ['11', '21', '22', '23', '31', '41', '49', '81'];
const REGIONS = ['Northeast', 'Southeast', 'Midwest', 'Southwest', 'West'];

/**
 * Generate synthetic claims dataset
 */
export function generateSyntheticClaims(): ClaimRecord[] {
  const rand = seededRandom(42);
  const claims: ClaimRecord[] = [];

  // Generate 46 normal providers
  const providers: { id: string; specialty: string; isOutlier: boolean; outlierType?: string }[] = [];

  for (let i = 1; i <= 46; i++) {
    providers.push({
      id: `PRV-${String(i).padStart(4, '0')}`,
      specialty: SPECIALTIES[Math.floor(rand() * SPECIALTIES.length)],
      isOutlier: false,
    });
  }

  // Inject 4 outlier providers
  providers.push({
    id: 'PRV-0047',
    specialty: 'Cardiology',
    isOutlier: true,
    outlierType: 'high_utilization', // 3x normal volume
  });
  providers.push({
    id: 'PRV-0048',
    specialty: 'Orthopedics',
    isOutlier: true,
    outlierType: 'upcoding', // Systematically uses higher-paying codes
  });
  providers.push({
    id: 'PRV-0049',
    specialty: 'Internal Medicine',
    isOutlier: true,
    outlierType: 'temporal_spike', // Sudden volume increase in last month
  });
  providers.push({
    id: 'PRV-0050',
    specialty: 'General Surgery',
    isOutlier: true,
    outlierType: 'complexity_gaming', // Unusually high MCC ratio
  });

  // Generate claims for each provider over 6 months
  const startDate = new Date('2025-07-01');
  const months = 6;

  for (const provider of providers) {
    const codes = COMMON_CODES[provider.specialty as keyof typeof COMMON_CODES] || COMMON_CODES['Internal Medicine'];
    const region = REGIONS[Math.floor(rand() * REGIONS.length)];

    // Base claims per month varies by specialty
    let baseClaimsPerMonth = 15 + Math.floor(rand() * 25);

    for (let m = 0; m < months; m++) {
      const monthDate = new Date(startDate);
      monthDate.setMonth(monthDate.getMonth() + m);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();

      let monthClaims = baseClaimsPerMonth + Math.floor((rand() - 0.5) * 10);

      // Apply outlier patterns
      if (provider.isOutlier) {
        switch (provider.outlierType) {
          case 'high_utilization':
            monthClaims = baseClaimsPerMonth * 3 + Math.floor(rand() * 20);
            break;
          case 'temporal_spike':
            if (m === months - 1) {
              monthClaims = baseClaimsPerMonth * 4; // 4x spike in last month
            }
            break;
          case 'upcoding':
          case 'complexity_gaming':
            // Normal volume, different code patterns
            break;
        }
      }

      const patients = new Set<string>();
      for (let c = 0; c < monthClaims; c++) {
        const day = 1 + Math.floor(rand() * 28);
        const serviceDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        // Generate patient ID (some repeat patients)
        const patientPool = 50 + Math.floor(rand() * 150);
        const patientNum = Math.floor(rand() * patientPool);
        const memberIdHash = `MBR-${provider.id}-${String(patientNum).padStart(4, '0')}`;
        patients.add(memberIdHash);

        // Select codes
        let numCodes = 1 + Math.floor(rand() * 3);
        let selectedCodes: string[] = [];
        let paidAmount = 50 + rand() * 300;

        if (provider.isOutlier) {
          switch (provider.outlierType) {
            case 'upcoding':
              // Use higher-complexity codes more frequently
              numCodes = 3 + Math.floor(rand() * 3);
              paidAmount = 300 + rand() * 500; // Higher payments
              // Include MCC codes more often
              if (rand() > 0.3) {
                selectedCodes.push('A41.9'); // Sepsis (MCC)
                selectedCodes.push('J96.01'); // Respiratory failure (MCC)
              }
              break;
            case 'complexity_gaming':
              // High ratio of MCC codes
              if (rand() > 0.4) {
                selectedCodes.push('I21.3'); // STEMI (MCC)
              }
              if (rand() > 0.5) {
                selectedCodes.push('N17.9'); // AKI (MCC)
              }
              paidAmount = 200 + rand() * 600;
              break;
          }
        }

        // Fill remaining codes from specialty pool
        while (selectedCodes.length < numCodes) {
          const code = codes[Math.floor(rand() * codes.length)];
          if (!selectedCodes.includes(code)) {
            selectedCodes.push(code);
          }
        }

        claims.push({
          claimId: `CLM-${claims.length + 1}`,
          providerId: provider.id,
          providerSpecialty: provider.specialty,
          memberIdHash,
          serviceDate,
          codes: selectedCodes,
          paidAmount: Math.round(paidAmount * 100) / 100,
          units: 1 + Math.floor(rand() * 3),
          placeOfService: PLACES_OF_SERVICE[Math.floor(rand() * PLACES_OF_SERVICE.length)],
          region,
        });
      }
    }
  }

  return claims;
}

/** Pre-generated claims for immediate use */
let _cachedClaims: ClaimRecord[] | null = null;

export function getSyntheticClaims(): ClaimRecord[] {
  if (!_cachedClaims) {
    _cachedClaims = generateSyntheticClaims();
  }
  return _cachedClaims;
}
