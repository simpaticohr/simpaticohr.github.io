// ── Country-Aware Tax Engine ──
const TAX_PROFILES = {
  IN: {
    name: 'India',
    slabs: [
      { min: 0, max: 300000, rate: 0 },
      { min: 300000, max: 700000, rate: 0.05 },
      { min: 700000, max: 1000000, rate: 0.10 },
      { min: 1000000, max: 1200000, rate: 0.15 },
      { min: 1200000, max: 1500000, rate: 0.20 },
      { min: 1500000, max: Infinity, rate: 0.30 }
    ],
    pf: { rate: 0.12, cap: 15000 },        // EPF: 12% of basic, capped at ₹15K
    esi: { rate: 0.0075, ceiling: 21000 },  // ESI: 0.75% if salary ≤ ₹21K
    professionalTax: 200,                   // Monthly PT (varies by state)
    cess: 0.04                              // 4% Health & Education Cess on tax
  },
  US: {
    name: 'United States',
    slabs: [
      { min: 0, max: 11600, rate: 0.10 },
      { min: 11600, max: 47150, rate: 0.12 },
      { min: 47150, max: 100525, rate: 0.22 },
      { min: 100525, max: 191950, rate: 0.24 },
      { min: 191950, max: 243725, rate: 0.32 },
      { min: 243725, max: 609350, rate: 0.35 },
      { min: 609350, max: Infinity, rate: 0.37 }
    ],
    fica: { ss: 0.062, ssWageCap: 168600, medicare: 0.0145 },
    state: 0.05  // Approximate state tax
  },
  UK: {
    name: 'United Kingdom',
    slabs: [
      { min: 0, max: 12570, rate: 0 },
      { min: 12570, max: 50270, rate: 0.20 },
      { min: 50270, max: 125140, rate: 0.40 },
      { min: 125140, max: Infinity, rate: 0.45 }
    ],
    ni: { rate: 0.08, threshold: 12570 }  // National Insurance
  },
  AE: {
    name: 'UAE',
    slabs: [{ min: 0, max: Infinity, rate: 0 }],  // No income tax
    gratuity: { rate: 0.0575 }  // EOSB provision ~21 days/year
  },
  CA: {
    name: 'Canada',
    slabs: [
      { min: 0, max: 55867, rate: 0.15 },
      { min: 55867, max: 111733, rate: 0.205 },
      { min: 111733, max: 173205, rate: 0.26 },
      { min: 173205, max: 246752, rate: 0.29 },
      { min: 246752, max: Infinity, rate: 0.33 }
    ],
    cpp: { rate: 0.0595, cap: 3867.50 }, // CPP contribution
    ei: { rate: 0.0166, cap: 1049.12 }   // EI contribution
  },
  AU: {
    name: 'Australia',
    slabs: [
      { min: 0, max: 18200, rate: 0 },
      { min: 18200, max: 45000, rate: 0.19 },
      { min: 45000, max: 120000, rate: 0.325 },
      { min: 120000, max: 180000, rate: 0.37 },
      { min: 180000, max: Infinity, rate: 0.45 }
    ],
    medicare: { rate: 0.02 } // Medicare levy
  },
  SG: {
    name: 'Singapore',
    slabs: [
      { min: 0, max: 20000, rate: 0 },
      { min: 20000, max: 30000, rate: 0.02 },
      { min: 30000, max: 40000, rate: 0.035 },
      { min: 40000, max: 80000, rate: 0.07 },
      { min: 80000, max: 120000, rate: 0.115 },
      { min: 120000, max: 160000, rate: 0.15 },
      { min: 160000, max: 200000, rate: 0.18 },
      { min: 200000, max: 240000, rate: 0.19 },
      { min: 240000, max: 280000, rate: 0.195 },
      { min: 280000, max: 320000, rate: 0.20 },
      { min: 320000, max: 500000, rate: 0.22 },
      { min: 500000, max: Infinity, rate: 0.24 }
    ],
    cpf: { rate: 0.20, cap: 1200 } // Typical employee CPF rate (varies by age)
  },
  EU: {
    name: 'Europe (Germany Avg)',
    slabs: [
      { min: 0, max: 11604, rate: 0 },
      { min: 11604, max: 66760, rate: 0.24 },  // Progressive simplification
      { min: 66760, max: 277825, rate: 0.42 },
      { min: 277825, max: Infinity, rate: 0.45 }
    ],
    social: { rate: 0.20 } // Approximate sum of health, pension, unemployment
  }
};

/**
 * Calculate slab-based annual tax, then return monthly equivalent.
 * @param {number} monthlyIncome - Monthly taxable income
 * @param {string} countryCode - Country mapping
 * @returns {{ incomeTax, socialTax, totalTax, breakdown, country }}
 */
function calculateTax(monthlyIncome, countryCode = 'IN') {
  const profile = TAX_PROFILES[countryCode] || TAX_PROFILES['IN'];
  const annual = monthlyIncome * 12;
  let remainingIncome = annual;
  let annualTax = 0;
  const breakdown = [];

  // Slab-based income tax
  for (const slab of profile.slabs) {
    if (remainingIncome <= 0) break;
    const taxableInSlab = Math.min(remainingIncome, slab.max - slab.min);
    const slabTax = taxableInSlab * slab.rate;
    if (slabTax > 0) breakdown.push({ slab: \${slab.rate * 100}%\, amount: slabTax / 12 });
    annualTax += slabTax;
    remainingIncome -= taxableInSlab;
  }

  let monthlyIncomeTax = annualTax / 12;
  let socialTax = 0;

  // Country-specific social contributions
  if (countryCode === 'IN') {
    socialTax += Math.min(monthlyIncome * profile.pf.rate, profile.pf.cap);
    if (monthlyIncome <= profile.esi.ceiling) socialTax += monthlyIncome * profile.esi.rate;
    socialTax += profile.professionalTax;
    monthlyIncomeTax *= (1 + profile.cess);
  } else if (countryCode === 'US') {
    const annualSoFar = monthlyIncome * 12;
    if (annualSoFar <= profile.fica.ssWageCap) socialTax += monthlyIncome * profile.fica.ss;
    socialTax += monthlyIncome * profile.fica.medicare;
    socialTax += monthlyIncome * profile.state;
  } else if (countryCode === 'UK') {
    const niable = Math.max(0, monthlyIncome - profile.ni.threshold / 12);
    socialTax += niable * profile.ni.rate;
  } else if (countryCode === 'AE') {
    socialTax += monthlyIncome * (profile.gratuity?.rate || 0);
  } else if (countryCode === 'CA') {
    socialTax += Math.min(monthlyIncome * profile.cpp.rate, profile.cpp.cap / 12);
    socialTax += Math.min(monthlyIncome * profile.ei.rate, profile.ei.cap / 12);
  } else if (countryCode === 'AU') {
    socialTax += monthlyIncome * profile.medicare.rate;
  } else if (countryCode === 'SG') {
    socialTax += Math.min(monthlyIncome * profile.cpf.rate, profile.cpf.cap);
  } else if (countryCode === 'EU') {
    socialTax += monthlyIncome * profile.social.rate;
  }

  return {
    incomeTax: Math.max(0, Math.round(monthlyIncomeTax * 100) / 100),
    socialTax: Math.max(0, Math.round(socialTax * 100) / 100),
    totalTax: Math.max(0, Math.round((monthlyIncomeTax + socialTax) * 100) / 100),
    breakdown,
    country: profile.name
  };
}

/** Map currency to likely country code for tax calculation */
function currencyToCountry(currency) {
  return { INR: 'IN', USD: 'US', GBP: 'UK', AED: 'AE', CAD: 'CA', AUD: 'AU', SGD: 'SG', EUR: 'EU' }[currency] || 'IN';
}
