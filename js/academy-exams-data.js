/**
 * academy-exams-data.js — Simpatico HR Academy
 * Comprehensive Examination Engine & Official Question Banks
 * 
 * Contains:
 * 1. HR_TA_601_EXAM: Professional Certification Examination in Talent Acquisition & Recruitment Mastery (30 Questions • 60 Mins)
 * 2. HRM_DIPLOMA_EXAM: Executive International Postgraduate Diploma Examination in Human Resource Management (50 Questions • 90 Mins)
 */

const HR_TA_601_EXAM = {
  examCode: "HR-TA-601-EXAM",
  courseCode: "HR-TA-601",
  title: "Professional Certification Examination in Talent Acquisition & Recruitment Mastery",
  subtitle: "Full-Cycle Requisition Engineering, Advanced Boolean Sourcing, STAR Behavioral Evaluation & AI Talent Analytics",
  totalQuestions: 30,
  durationMinutes: 60,
  passingScorePercent: 70,
  distinctionScorePercent: 85,
  instructions: [
    "This examination contains 30 professional scenario-based and technical questions across all 6 weeks of the curriculum.",
    "Calculations, Boolean syntax strings, and behavioral rubrics must adhere to international talent standards.",
    "Time allowed is 60 minutes. Once submitted, your score, competency breakdown, and answer key will be generated immediately.",
    "A minimum score of 70% is required to obtain the Verified Professional Certificate in Talent Acquisition & Recruitment Mastery."
  ],
  sections: [
    { id: 1, name: "Workforce Planning & Intake Architecture", weight: "16%" },
    { id: 2, name: "Employer Branding, EVP & Inbound Channels", weight: "16%" },
    { id: 3, name: "Boolean Logic & Deep Web Sourcing", weight: "17%" },
    { id: 4, name: "Structured Interviewing, STAR & Bias Mitigation", weight: "17%" },
    { id: 5, name: "Offer Structuring, Benchmarking & Pre-Boarding", weight: "17%" },
    { id: 6, name: "Recruitment Tech, AI Ethics & Talent KPIs", weight: "17%" }
  ],
  questions: [
    // ── SECTION 1: WORKFORCE PLANNING & INTAKE (Weeks 1) ──
    {
      id: "ta_q1",
      sectionId: 1,
      section: "Workforce Planning & Intake Architecture",
      q: "An organization employs 400 individuals with an annualized historical voluntary attrition rate of 15%. If business leadership projects 20% net-new growth for the upcoming fiscal year, how many total hires must the Talent Acquisition team budget to execute?",
      q_ml: "400 ജീവനക്കാരുള്ള ഒരു സ്ഥാപനത്തിൽ വാർഷിക അൺപ്ലാൻഡ് അട്രിഷൻ നിരക്ക് 15% ആണ്. അടുത്ത വർഷം 20% അധിക ബിസിനസ്സ് വളർച്ച ലക്ഷ്യമിടുന്നുവെങ്കിൽ, റിക്രൂട്ട്മെന്റ് ടീം ആകെ എത്ര നിയമനങ്ങൾ ആസൂത്രണം ചെയ്യണം?",
      options: [
        "60 hires (only net-new growth)",
        "80 hires (attrition only)",
        "140 hires (60 attrition backfills + 80 new headcount)",
        "120 hires (simple average)"
      ],
      correct: 2,
      exp: "Annual attrition backfills = 400 × 15% = 60. Net-new growth positions = 400 × 20% = 80. Total requisitions required = 60 + 80 = 140 hires.",
      exp_ml: "അട്രിഷൻ ബാക്ക്ഫിൽ = 400 × 15% = 60. പുതിയ തസ്തികകൾ = 400 × 20% = 80. ആകെ റിക്രൂട്ട്മെന്റ് ബഡ്ജറ്റ് = 60 + 80 = 140 നിയമനങ്ങൾ."
    },
    {
      id: "ta_q2",
      sectionId: 1,
      section: "Workforce Planning & Intake Architecture",
      q: "What is the primary operational distinction between tactical transactional recruitment and strategic talent acquisition?",
      q_ml: "ടാക്ടിക്കൽ റിക്രൂട്ട്മെന്റും സ്ട്രാറ്റജിക് ടാലന്റ് അക്വിസിഷനും തമ്മിലുള്ള അടിസ്ഥാന വ്യത്യാസം എന്താണ്?",
      options: [
        "Tactical recruitment is reactive role-filling, while talent acquisition aligns long-term organizational capability with strategic workforce pipelines.",
        "Tactical recruitment requires enterprise ATS software, whereas talent acquisition only relies on paper resumes.",
        "Talent acquisition is restricted to hiring C-suite executives only.",
        "There is no operational difference; the terms are synonymous marketing phrases."
      ],
      correct: 0,
      exp: "Tactical recruitment reacts to immediate vacancies. Strategic talent acquisition proactively forecasts skills gaps, builds passive candidate pipelines, and consults as a strategic partner to business leadership.",
      exp_ml: "ടാക്ടിക്കൽ റിക്രൂട്ട്മെന്റ് പെട്ടെന്ന് വരുന്ന ഒഴിവുകൾ നികത്തുമ്പോൾ, സ്ട്രാറ്റജിക് ടാലന്റ് അക്വിസിഷൻ കമ്പനിയുടെ ഭാവി വളർച്ചയ്ക്ക് ആവശ്യമായ പ്രതിഭകളെ മുൻകൂട്ടി കണ്ട് പൈപ്പ്‌ലൈൻ രൂപപ്പെടുത്തുന്നു."
    },
    {
      id: "ta_q3",
      sectionId: 1,
      section: "Workforce Planning & Intake Architecture",
      q: "During a 45-minute hiring manager intake meeting, which action best ensures alignment and eliminates future screening bottlenecks?",
      q_ml: "45 മിനിറ്റ് ഹൈറിംഗ് മാനേജർ ഇൻടേക്ക് മീറ്റിംഗിൽ സ്ക്രീനിംഗ് തടസ്സങ്ങൾ ഒഴിവാക്കാൻ ചെയ്യേണ്ട ഏറ്റവും മികച്ച നടപടി ഏതാണ്?",
      options: [
        "Asking the manager to send an email with 30 bullet-pointed requirements without meeting.",
        "Live-calibrating 2–3 active candidate profiles on LinkedIn with the manager to differentiate non-negotiable must-haves from learnable nice-to-haves.",
        "Agreeing to accept all hiring manager requests without challenging unfeasible compensation caps.",
        "Publishing the job description immediately and collecting feedback 3 weeks later."
      ],
      correct: 1,
      exp: "Live calibration of real candidate profiles in the intake session clarifies realistic expectations, tests market availability, and aligns must-haves versus learnable skills.",
      exp_ml: "ഇൻടേക്ക് സമയത്ത് ലിങ്ക്ഡ്ഇനിലെ യഥാർത്ഥ പ്രൊഫൈലുകൾ മാനേജറുമായി ഒത്തുനോക്കി പരിശോധിക്കുന്നത് നിർബന്ധിത യോഗ്യതകൾ കൃത്യമായി നിർണ്ണയിക്കാൻ സഹായിക്കുന്നു."
    },
    {
      id: "ta_q4",
      sectionId: 1,
      section: "Workforce Planning & Intake Architecture",
      q: "Which element in a job posting is most likely to discourage qualified female and diverse candidates from applying?",
      q_ml: "ഒരു തൊഴിൽ പരസ്യത്തിൽ സ്ത്രീകളെയും വൈവിധ്യമാർന്ന ഉദ്യോഗാർത്ഥികളെയും അപേക്ഷിക്കുന്നതിൽ നിന്ന് പിന്തിരിപ്പിക്കുന്ന ഘടകം ഏതാണ്?",
      options: [
        "Stating clear 30-60-90 day performance milestones.",
        "Transparently listing the salary range and remote work flexibility.",
        "Using hyper-masculine jargon such as 'rockstar', 'aggressive hunter', and requiring 100% adherence to 15+ rigid qualifications.",
        "Mentioning health insurance and parental leave policies."
      ],
      correct: 2,
      exp: "Research shows women and underrepresented groups hesitate to apply when postings use aggressive gendered buzzwords or list excessive non-essential requirements.",
      exp_ml: "'റോക്ക്സ്റ്റാർ', 'അഗ്രസീവ് ഹണ്ടർ' തുടങ്ങിയ അമിത വാക്കുകളും അനാവശ്യമായ നീണ്ട യോഗ്യതാ ലിസ്റ്റുകളും യോഗ്യരായ പല ഉദ്യോഗാർത്ഥികളെയും പിന്തിരിപ്പിക്കുന്നു."
    },
    {
      id: "ta_q5",
      sectionId: 1,
      section: "Workforce Planning & Intake Architecture",
      q: "In Total Cost of Workforce (TCOW) budgeting, what multiplier is typically added to base salary to account for statutory benefits, taxes, tools, and recruiter overhead?",
      q_ml: "ടോട്ടൽ കോസ്റ്റ് ഓഫ് വർക്ക്ഫോഴ്സ് (TCOW) കണക്കാക്കുമ്പോൾ അടിസ്ഥാന ശമ്പളത്തോടൊപ്പം ആനുകൂല്യങ്ങൾക്കും ടൂളുകൾക്കുമായി എത്ര ശതമാനം അധികം കണക്കാക്കുന്നു?",
      options: [
        "0% — base salary represents the complete financial commitment.",
        "20% to 35% on top of base salary.",
        "150% of the entire company's revenue.",
        "Exactly 5% regardless of geography."
      ],
      correct: 1,
      exp: "Fully burdened employee cost (TCOW) accounts for payroll taxes, health insurance, software licenses, visa fees, and workspace, typically adding 20%–35% above base salary.",
      exp_ml: "ഒരു ജീവനക്കാരന്റെ യഥാർത്ഥ ചെലവ് അടിസ്ഥാന ശമ്പളത്തേക്കാൾ 20% മുതൽ 35% വരെ കൂടുതലായിരിക്കും (ഇൻഷുറൻസ്, ടാക്സ്, സോഫ്റ്റ്‌വെയർ ചെലവുകൾ ഉൾപ്പെടെ)."
    },

    // ── SECTION 2: EMPLOYER BRANDING & RECRUITMENT MARKETING (Week 2) ──
    {
      id: "ta_q6",
      sectionId: 2,
      section: "Employer Branding, EVP & Inbound Channels",
      q: "What are the 5 core pillars of a comprehensive Employee Value Proposition (EVP) framework?",
      q_ml: "എംപ്ലോയർ വാല്യൂ പ്രൊപ്പോസിഷൻ (EVP) ചട്ടക്കൂടിലെ 5 പ്രധാന സ്തംഭങ്ങൾ ഏതെല്ലാമാണ്?",
      options: [
        "Salary, Bonus, Commission, Overtime, and Gratuity only.",
        "Rewards, Opportunity, Organization, Work, and People.",
        "Advertising, Public Relations, Sales Targets, Quotas, and Perks.",
        "Hardware, Office Chairs, Free Coffee, Company Cars, and Uniforms."
      ],
      correct: 1,
      exp: "Gartner's EVP architecture covers Rewards (financial/benefits), Opportunity (career path), Organization (mission/reputation), Work (autonomy/tech), and People (culture/peers).",
      exp_ml: "റിവാർഡുകൾ (Rewards), അവസരങ്ങൾ (Opportunity), സ്ഥാപനം (Organization), ജോലി (Work), സഹപ്രവർത്തകർ (People) എന്നിവയാണ് EVP-യുടെ 5 സ്തംഭങ്ങൾ."
    },
    {
      id: "ta_q7",
      sectionId: 2,
      section: "Employer Branding, EVP & Inbound Channels",
      q: "How does a 'Candidate Persona' differ from a standard Job Description?",
      q_ml: "കാൻഡിഡേറ്റ് പേഴ്സണയും സാധാരണ ജോബ് ഡിസ്ക്രിപ്ഷനും തമ്മിലുള്ള പ്രധാന വ്യത്യാസം എന്താണ്?",
      options: [
        "A job description details role requirements, while a candidate persona profiles the psychological motivations, career pain points, compensation drivers, and online behavioral habits of target talent.",
        "Candidate personas are legal documents submitted to the Ministry of Labor.",
        "Job descriptions are only for external recruitment agencies.",
        "There is no difference; they are duplicate terms."
      ],
      correct: 0,
      exp: "Job descriptions specify what the company needs. Candidate personas profile target candidates' motivations, friction points, where they hang out online, and what compels them to switch jobs.",
      exp_ml: "ജെ.ഡിയിൽ ജോലിയുടെ ആവശ്യങ്ങൾ പറയുമ്പോൾ, കാൻഡിഡേറ്റ് പേഴ്സണയിൽ അനുയോജ്യനായ ഉദ്യോഗാർത്ഥിയുടെ ചിന്താഗതിയും താൽപ്പര്യങ്ങളും മാപ്പ് ചെയ്യുന്നു."
    },
    {
      id: "ta_q8",
      sectionId: 2,
      section: "Employer Branding, EVP & Inbound Channels",
      q: "To maximize Candidate Experience (CX) and reduce mobile abandonment, research indicates an initial online application should require no longer than:",
      q_ml: "മൊബൈൽ അപേക്ഷകർ പാതിവഴിയിൽ ഉപേക്ഷിക്കാതിരിക്കാൻ (Drop-off) ഒരു അപേക്ഷാ ഫോം പൂർത്തിയാക്കാൻ പരമാവധി എത്ര സമയം എടുക്കണം?",
      options: [
        "3 to 5 minutes (frictionless, resume upload + core contact info).",
        "45 to 60 minutes with manual re-entry of entire employment history.",
        "3 hours including an unproctored 100-question personality test.",
        "Drop-off rates are unrelated to application duration."
      ],
      correct: 0,
      exp: "Over 60% of modern applicants abandon application flows that exceed 5 minutes or require manual parsing re-entry.",
      exp_ml: "5 മിനിറ്റിൽ കൂടുതൽ സമയമെടുക്കുന്ന സങ്കീർണ്ണമായ അപേക്ഷാ ഫോമുകൾ 60 ശതമാനത്തിലധികം ഉദ്യോഗാർത്ഥികളും പാതിവഴിയിൽ ഉപേക്ഷിക്കുന്നു."
    },
    {
      id: "ta_q9",
      sectionId: 2,
      section: "Employer Branding, EVP & Inbound Channels",
      q: "What is Candidate Net Promoter Score (cNPS) primarily used to evaluate?",
      q_ml: "കാൻഡിഡേറ്റ് നെറ്റ് പ്രൊമോട്ടർ സ്കോർ (cNPS) പ്രധാനമായും എന്തിനാണ് ഉപയോഗിക്കുന്നത്?",
      options: [
        "Candidate technical aptitude in coding interviews.",
        "Candidate perception of the company's hiring process and whether they would recommend applying to peers, regardless of offer outcome.",
        "The recruiter's annual base salary increment.",
        "The speed of payroll processing during onboarding."
      ],
      correct: 1,
      exp: "cNPS calculates applicant willingness to recommend the organization based on fairness, communication speed, and respect throughout the interview cycle.",
      exp_ml: "ഇന്റർവ്യൂ പ്രക്രിയയുടെ സുതാര്യതയും നിലവാരവും അളക്കാനും കമ്പനിയെ മറ്റുള്ളവർക്ക് ശുപാർശ ചെയ്യുമോ എന്ന് അറിയാനുമാണ് cNPS ഉപയോഗിക്കുന്നത്."
    },
    {
      id: "ta_q10",
      sectionId: 2,
      section: "Employer Branding, EVP & Inbound Channels",
      q: "Which inbound channel historically delivers the highest 90-day retention rate and fastest time-to-hire across technical roles?",
      q_ml: "സാങ്കേതിക തസ്തികകളിൽ ഏറ്റവും ഉയർന്ന 90-ദിവസ നിലനിൽപ്പും (Retention) കുറഞ്ഞ നിയമന സമയവും നൽകുന്ന റിക്രൂട്ട്മെന്റ് ചാനൽ ഏതാണ്?",
      options: [
        "Structured Employee Referral Programs (ERP).",
        "Generic newspaper classified advertisements.",
        "Cold spam emails sent from unverified email domains.",
        "Third-party contingency agencies with no sector focus."
      ],
      correct: 0,
      exp: "Employee referrals consistently achieve higher culture fit, 40% faster time-to-fill, and superior first-year retention compared to cold inbound boards.",
      exp_ml: "എംപ്ലോയി റഫറൽ പ്രോഗ്രാമുകൾ വഴിയുള്ള നിയമനങ്ങൾക്ക് കൂടുതൽ വിശ്വാസ്യതയും വേഗതയും ഉയർന്ന നിലനിൽപ്പും ഉണ്ടാകാറുണ്ട്."
    },

    // ── SECTION 3: BOOLEAN SOURCING & X-RAY LOGIC (Week 3) ──
    {
      id: "ta_q11",
      sectionId: 3,
      section: "Boolean Logic & Deep Web Sourcing",
      q: "Which Google X-Ray search query correctly extracts indexed public LinkedIn profiles for Product Managers in SaaS companies without recruiter profiles?",
      q_ml: "റിക്രൂട്ടർമാരെ ഒഴിവാക്കിക്കൊണ്ട് SaaS മേഖലയിലെ പ്രൊഡക്റ്റ് മാനേജർമാരുടെ ലിങ്ക്ഡ്ഇൻ പ്രൊഫൈലുകൾ ഗൂഗിൾ വഴി കണ്ടെത്താനുള്ള കൃത്യമായ X-Ray സ്ട്രിംഗ് ഏതാണ്?",
      options: [
        'site:linkedin.com/in/ ("Product Manager" OR "PM") AND "SaaS" -recruiter',
        'url:linkedin.com Product Manager AND SaaS',
        'google:search/in/ PM AND SaaS +recruiter',
        'filetype:linkedin.com "PM"'
      ],
      correct: 0,
      exp: "'site:linkedin.com/in/' restricts results to personal member profile pages; parentheses group synonyms; and '-recruiter' excludes recruiter profiles.",
      exp_ml: "'site:linkedin.com/in/' പ്രൊഫൈൽ പേജുകളെ മാത്രം തിരയുമ്പോൾ, '-recruiter' റിക്രൂട്ടർമാരെ ഒഴിവാക്കാൻ സഹായിക്കുന്നു."
    },
    {
      id: "ta_q12",
      sectionId: 3,
      section: "Boolean Logic & Deep Web Sourcing",
      q: "When sourcing software engineers on GitHub, which search string targets developers located in Bangalore with Python commits?",
      q_ml: "ഗിറ്റ്ഹബ്ബിൽ (GitHub) നിന്ന് ബാംഗ്ലൂരിലുള്ള പൈത്തൺ ഡെവലപ്പർമാരെ കണ്ടെത്താനുള്ള കൃത്യമായ തിരച്ചിൽ ഏതാണ്?",
      options: [
        'site:github.com "joined on" "Python" "Bangalore"',
        'github:python/bangalore',
        'find:github user python bangalore',
        'site:google.com python'
      ],
      correct: 0,
      exp: "GitHub profiles indexed by Google feature 'joined on' along with the specified language and user location string.",
      exp_ml: "'site:github.com \"joined on\" \"Python\" \"Bangalore\"' വഴി ഗിറ്റ്ഹബ്ബ് ഡെവലപ്പർമാരുടെ പ്രൊഫൈലുകൾ നേരിട്ട് ലഭിക്കുന്നു."
    },
    {
      id: "ta_q13",
      sectionId: 3,
      section: "Boolean Logic & Deep Web Sourcing",
      q: "In Boolean algebra, what effect does the NOT (or hyphen -) operator have on query results?",
      q_ml: "ബൂളിയൻ സെർച്ചിൽ NOT അഥവാ മൈനസ് (-) ഓപ്പറേറ്റർ എന്തിനാണ് ഉപയോഗിക്കുന്നത്?",
      options: [
        "It broadens search results to include antonyms.",
        "It excludes specific keywords or terms from the search output.",
        "It mandates that both surrounding keywords must appear together.",
        "It deletes indexed candidate profiles from search engines."
      ],
      correct: 1,
      exp: "NOT / hyphen eliminates noise by explicitly removing profiles containing excluded words (e.g. -intern -agency).",
      exp_ml: "സെർച്ച് റിസൾട്ടുകളിൽ നിന്ന് ആവശ്യമില്ലാത്ത വാക്കുകളെ ഒഴിവാക്കാനാണ് (Exclusion) NOT അല്ലെങ്കിൽ (-) ഉപയോഗിക്കുന്നത്."
    },
    {
      id: "ta_q14",
      sectionId: 3,
      section: "Boolean Logic & Deep Web Sourcing",
      q: "What is the primary psychological driver that increases reply rates in passive candidate cold outreach messages?",
      q_ml: "ജോലി നോക്കാത്ത മികച്ച പ്രതിഭകളിലേക്ക് (Passive Candidates) കോൾഡ് മെസ്സേജ് അയക്കുമ്പോൾ മറുപടി ലഭിക്കാനുള്ള പ്രധാന ഘടകം ഏതാണ്?",
      options: [
        "Sending generic templates stating 'Dear candidate, we have a job opening'.",
        "Hyper-personalizing the hook with specific reference to their open-source contribution, patent, or published article, followed by role impact.",
        "Demanding an immediate phone call within 1 hour.",
        "Attaching a 12-page company brochure as a ZIP file."
      ],
      correct: 1,
      exp: "Personalized recognition of past work combined with clear role autonomy and growth triggers achieves 3x higher passive reply rates than generic job postings.",
      exp_ml: "ഉദ്യോഗാർത്ഥിയുടെ നേട്ടങ്ങളെ പരാമർശിച്ചുകൊണ്ടുള്ള വ്യക്തിഗത സമീപനമാണ് (Personalization) മികച്ച പ്രതികരണ നിരക്ക് നൽകുന്നത്."
    },
    {
      id: "ta_q15",
      sectionId: 3,
      section: "Boolean Logic & Deep Web Sourcing",
      q: "When executing a Diversity, Equity, and Inclusion (DEI) sourcing pipeline, which technique expands talent pools without violating platform terms?",
      q_ml: "വൈവിധ്യമാർന്ന (DEI) ടാലന്റ് പൈപ്പ്‌ലൈൻ രൂപീകരിക്കുമ്പോൾ അനുയോജ്യമായ പ്രായോഗിക രീതി ഏതാണ്?",
      options: [
        "Filtering candidates strictly by profile photo and estimated age.",
        "Proactively sourcing through professional diversity associations (e.g. Women Who Code, Grace Hopper, National Society of Black Engineers) and affiliated hackathons.",
        "Excluding candidates graduated before a specific year.",
        "Ignoring specialized interest communities."
      ],
      correct: 1,
      exp: "Partnering with verified diverse professional groups and tech communities builds inclusive talent pipelines ethically and transparently.",
      exp_ml: "പ്രൊഫഷണൽ അസോസിയേഷനുകളുമായും എൻജിനീയറിങ് കമ്മ്യൂണിറ്റികളുമായും സഹകരിച്ച് പൈപ്പ്‌ലൈൻ വികസിപ്പിക്കുന്നതാണ് ഏറ്റവും സുരക്ഷിതമായ രീതി."
    },

    // ── SECTION 4: SCREENING, STAR & INTERVIEWING (Week 4) ──
    {
      id: "ta_q16",
      sectionId: 4,
      section: "Structured Interviewing, STAR & Bias Mitigation",
      q: "What is the recommended speaking-time distribution ratio across the STAR (Situation, Task, Action, Result) behavioral probing method?",
      q_ml: "STAR മെത്തേഡ് പ്രകാരം ഇന്റർവ്യൂവിൽ ഉദ്യോഗാർത്ഥി സംസാരിക്കേണ്ട സമയ അനുപാതം എങ്ങനെയായിരിക്കണം?",
      options: [
        "Situation (20%) → Task (15%) → Action (45%) → Result (20%)",
        "Situation (80%) → Task (10%) → Action (5%) → Result (5%)",
        "Result (90%) → Situation (10%) → No action needed",
        "Equal 25% across every section regardless of role"
      ],
      correct: 0,
      exp: "Action should comprise ~45% of speaking time so the interviewer can evaluate individual personal accountability and execution versus team contributions.",
      exp_ml: "ആക്ഷൻ (Action) ഘട്ടത്തിന് 45% പ്രാധാന്യം നൽകണം; എങ്കിൽ മാത്രമേ ഉദ്യോഗാർത്ഥിയുടെ വ്യക്തിഗത പങ്കാളിത്തം വ്യക്തമാകൂ."
    },
    {
      id: "ta_q17",
      sectionId: 4,
      section: "Structured Interviewing, STAR & Bias Mitigation",
      q: "During a structured 20-minute initial phone screen, how should recruiter time be strategically allocated?",
      q_ml: "20 മിനിറ്റ് നീളുന്ന പ്രാരംഭ ഫോൺ സ്ക്രീനിംഗിൽ സമയം എങ്ങനെ വിനിയോഗിക്കണം?",
      options: [
        "5m Rapport & Role Context → 10m Core Competency & Motivation → 5m Logistics, Notice Period & CTC Alignment",
        "20m discussing salary negotiation only",
        "18m recruiter explaining company history and 2m for candidate questions",
        "No structured agenda; free-flowing conversation"
      ],
      correct: 0,
      exp: "The 5-10-5 framework ensures sufficient probing of core competencies while locking down non-negotiables: notice period, location, and compensation fit.",
      exp_ml: "5 മിനിറ്റ് ആമുഖം, 10 മിനിറ്റ് പ്രധാന യോഗ്യതകൾ, 5 മിനിറ്റ് ശമ്പളവും നോട്ടീസ് പിരീഡും ഉറപ്പാക്കൽ — ഇതാണ് ശാസ്ത്രീയമായ രീതി."
    },
    {
      id: "ta_q18",
      sectionId: 4,
      section: "Structured Interviewing, STAR & Bias Mitigation",
      q: "What is the 'Halo Effect' in candidate interviewing and how is it mitigated?",
      q_ml: "ഇന്റർവ്യൂവിലെ 'ഹാലോ ഇഫക്റ്റ്' (Halo Effect) എന്നാൽ എന്താണ്, അത് എങ്ങനെ പരിഹരിക്കാം?",
      options: [
        "A cognitive bias where one positive trait (e.g., prestigious alma mater) causes an interviewer to rate all other competencies favorably; mitigated by using anchored rubric scorecards.",
        "When an interviewer speaks louder than the candidate.",
        "When technical tests are administered under fluorescent office lighting.",
        "A legal mandate requiring background checks."
      ],
      correct: 0,
      exp: "The halo effect inflates overall assessment based on single favorable impressions; structured scorecards with anchored 1-to-5 behavioral criteria enforce objective ratings.",
      exp_ml: "ഒരു നല്ല ഗുണം മാത്രം കണ്ട് ബാക്കി എല്ലാ കഴിവുകളെയും അമിതമായി വിലയിരുത്തുന്ന പക്ഷപാതമാണിത്; കൃത്യമായ റൂബ്രിക് സ്കോർകാർഡുകൾ ഉപയോഗിച്ച് ഇത് തടയാം."
    },
    {
      id: "ta_q19",
      sectionId: 4,
      section: "Structured Interviewing, STAR & Bias Mitigation",
      q: "Which assessment format has the highest predictive validity (0.54 correlation) for on-the-job employee performance according to organizational psychology research?",
      q_ml: "തൊഴിൽ പ്രകടനത്തെ ഏറ്റവും കൃത്യമായി പ്രവചിക്കാൻ കഴിയുന്ന (Predictive Validity) അസ്സസ്സ്മെന്റ് രീതി ഏതാണ്?",
      options: [
        "Standardized Work-Sample Tests / Practical Case Studies.",
        "Unstructured casual conversations over lunch.",
        "Graphology (handwriting analysis).",
        "Self-reported zodiac compatibility assessments."
      ],
      correct: 0,
      exp: "Schmidt & Hunter research demonstrates that work-sample tests (hands-on simulations of actual job tasks) have the highest predictive validity for job performance.",
      exp_ml: "യഥാർത്ഥ ജോലിക്ക് സമാനമായ വർക്ക് സാമ്പിളുകളും കേസ് സ്റ്റഡികളുമാണ് ഏറ്റവും കൃത്യമായ ഫലം നൽകുന്നത്."
    },
    {
      id: "ta_q20",
      sectionId: 4,
      section: "Structured Interviewing, STAR & Bias Mitigation",
      q: "In an evidence-based interview debrief, what should an interviewer do if a hiring manager rejects a candidate citing 'poor culture fit' without concrete evidence?",
      q_ml: "ഇന്റർവ്യൂ ഡിബ്രീഫിൽ തെളിവുകളില്ലാതെ മാനേജർ ഒരാളെ 'കൾച്ചർ ഫിറ്റ് അല്ല' എന്ന് പറഞ്ഞ് നിരസിച്ചാൽ റിക്രൂട്ടർ എന്ത് ചെയ്യണം?",
      options: [
        "Immediately accept the decision and reject the candidate.",
        "Probe constructively for behavioral evidence against defined scorecard rubrics to separate personal affinity bias from objective competency requirements.",
        "Cancel all future hiring for that department.",
        "Argue aggressively in front of senior executives."
      ],
      correct: 1,
      exp: "'Culture fit' is often a mask for affinity bias; talent partners must anchor feedback in specific behavioral evidence against defined competencies.",
      exp_ml: "വ്യക്തിപരമായ മുൻവിധിയാണോ എന്ന് തിരിച്ചറിയാൻ സ്കോർകാർഡിലെ യഥാർത്ഥ തെളിവുകൾ മാനേജരോട് ചോദിച്ചു മനസ്സിലാക്കണം."
    },

    // ── SECTION 5: OFFER STRUCTURING & NEGOTIATION (Week 5) ──
    {
      id: "ta_q21",
      sectionId: 5,
      section: "Offer Structuring, Benchmarking & Pre-Boarding",
      q: "When structuring an executive offer letter, what components constitute the 'Total Target Compensation' (TTC)?",
      q_ml: "ഒരു എക്സിക്യൂട്ടീവ് ഓഫർ ലെറ്ററിലെ 'ടോട്ടൽ ടാർഗെറ്റ് കോമ്പൻസേഷൻ' (TTC) എന്നത് എന്തൊക്കെ ചേർന്നതാണ്?",
      options: [
        "Base Annual Salary + Performance Bonus/Incentive + Long-Term Equity/ESOPs + Statutory Benefits",
        "Base salary only without any deductions",
        "The estimated reimbursement of petty tea expenses",
        "The company's gross profit margin"
      ],
      correct: 0,
      exp: "TTC balances guaranteed base salary with variable performance incentives, equity/ESOP value over vesting milestones, and comprehensive benefits.",
      exp_ml: "അടിസ്ഥാന ശമ്പളം, പെർഫോമൻസ് ബോണസ്, ഇക്വിറ്റി/ഇഎസ്ഒപി ഓഹരികൾ, മറ്റ് ആനുകൂല്യങ്ങൾ എന്നിവ ചേർന്നതാണ് TTC."
    },
    {
      id: "ta_q22",
      sectionId: 5,
      section: "Offer Structuring, Benchmarking & Pre-Boarding",
      q: "A shortlisted candidate receives a counteroffer from their current employer of 20% salary increase to stay. What is the most effective recruiter response strategy?",
      q_ml: "ഒരു ഉദ്യോഗാർത്ഥിക്ക് നിലവിലെ കമ്പനിയിൽ നിന്ന് കൗണ്ടർ ഓഫർ ലഭിച്ചാൽ റിക്രൂട്ടർ സ്വീകരിക്കേണ്ട ഏറ്റവും മികച്ച തന്ത്രം എന്താണ്?",
      options: [
        "Immediately offer double the salary without budget approval.",
        "Re-anchor the candidate back to their original core push-factors (e.g. lack of career progression, toxic management) and illustrate why a monetary counteroffer rarely resolves underlying dissatisfaction.",
        "Send an angry email threatening legal action.",
        "Tell the candidate they made a mistake and stop all communication."
      ],
      correct: 1,
      exp: "Studies show 80% of candidates who accept counteroffers leave within 6 months because underlying structural dissatisfaction cannot be cured with a salary increase.",
      exp_ml: "പഴയ കമ്പനി വിടാൻ പ്രേരിപ്പിച്ച യഥാർത്ഥ കാരണങ്ങളെ ഉദ്യോഗാർത്ഥിയെ ഓർമ്മിപ്പിക്കുകയും കൗണ്ടർ ഓഫറുകൾ ശാശ്വത പരിഹാരമല്ലെന്ന് ബോധ്യപ്പെടുത്തുകയും ചെയ്യുക."
    },
    {
      id: "ta_q23",
      sectionId: 5,
      section: "Offer Structuring, Benchmarking & Pre-Boarding",
      q: "What is the primary objective of a structured 'Pre-Boarding Engagement Cadence' during a candidate's 60-day notice period?",
      q_ml: "60 ദിവസത്തെ നോട്ടീസ് പിരീഡിൽ 'പ്രീ-ബോർഡിംഗ് എൻഗേജ്‌മെന്റ്' നൽകുന്നതിന്റെ പ്രധാന ലക്ഷ്യം എന്താണ്?",
      options: [
        "Assigning 40 hours of unpaid weekend labor before their official Day 1.",
        "Maintaining consistent high-touch communication, team welcome videos, and paperwork clearance to prevent offer drop-off and competitor counter-poaching.",
        "Forcing the candidate to surrender their passport early.",
        "Checking their GPS location daily."
      ],
      correct: 1,
      exp: "Notice periods are the highest-risk drop-off phase; regular touchpoints with future managers and team members reduce ghosting and protect offer acceptance.",
      exp_ml: "നോട്ടീസ് പിരീഡിൽ ഉദ്യോഗാർത്ഥി ഓഫർ ഉപേക്ഷിച്ചു പോകാതിരിക്കാൻ നിരന്തരമായ ആശയവിനിമയവും ടീം വെൽക്കവും നൽകി ആത്മവിശ്വാസം നിലനിർത്തുക."
    },
    {
      id: "ta_q24",
      sectionId: 5,
      section: "Offer Structuring, Benchmarking & Pre-Boarding",
      q: "In compensation benchmarking, what does the 50th percentile (P50) market rate indicate?",
      q_ml: "കോമ്പൻസേഷൻ ബെഞ്ച്മാർക്കിംഗിൽ 50th പെർസെന്റൈൽ (P50) സൂചിപ്പിക്കുന്നത് എന്താണ്?",
      options: [
        "The salary is 50% below minimum wage.",
        "The exact median compensation where 50% of surveyed peer companies pay below and 50% pay above for that specific role and geography.",
        "That only 50 employees exist in the company.",
        "The maximum statutory salary permitted by law."
      ],
      correct: 1,
      exp: "P50 represents the market median compensation benchmark for targeted skills and geography.",
      exp_ml: "വിപണിയിലെ ശരാശരി വേതന നിരക്കാണിത് (Median); 50% കമ്പനികൾ ഇതിലും താഴെയും 50% കമ്പനികൾ ഇതിലും മുകളിലും നൽകുന്നു."
    },
    {
      id: "ta_q25",
      sectionId: 5,
      section: "Offer Structuring, Benchmarking & Pre-Boarding",
      q: "What are the 3 critical phases of a structured 30-60-90 Day New Hire Onboarding Plan?",
      q_ml: "30-60-90 ഡേ ഓൺബോർഡിംഗ് പ്ലാനിന്റെ 3 പ്രധാന ഘട്ടങ്ങൾ ഏതെല്ലാമാണ്?",
      options: [
        "Days 1-30: Learn & Absorb → Days 31-60: Collaborate & Align → Days 61-90: Execute & Deliver Autonomous Value",
        "Days 1-30: Work Overtime → Days 31-60: Take Leave → Days 61-90: Get Promoted",
        "Days 1-30: Sign documents → Days 31-60: Sit in cafeteria → Days 61-90: Attend meetings",
        "All 90 days are purely observational without performance goals."
      ],
      correct: 0,
      exp: "Effective onboarding transitions from foundational learning (30d) to guided cross-functional collaboration (60d) to independent ownership and milestone delivery (90d).",
      exp_ml: "ആദ്യ 30 ദിവസം പഠനം (Learn), അടുത്ത 30 ദിവസം ടീം പ്രവർത്തനം (Collaborate), അവസാന 30 ദിവസം സ്വതന്ത്ര പ്രകടനം (Execute) ഇതാണ് ക്രമം."
    },

    // ── SECTION 6: RECRUITMENT TECH, AI & TALENT ANALYTICS (Week 6) ──
    {
      id: "ta_q26",
      sectionId: 6,
      section: "Recruitment Tech, AI Ethics & Talent KPIs",
      q: "What is the operational formula for calculating 'Time-to-Fill' in talent acquisition analytics?",
      q_ml: "റിക്രൂട്ട്മെന്റ് അനലിറ്റിക്സിൽ 'ടൈം-ടു-ഫിൽ' (Time-to-Fill) കണക്കാക്കുന്ന ഫോർമുല ഏതാണ്?",
      options: [
        "Total Calendar Days from Requisition Approval Date to Offer Acceptance Date.",
        "Total hours spent inside the interview room by the hiring manager.",
        "The number of days between candidate application and the first telephone screen.",
        "The candidate's notice period length in their previous employment."
      ],
      correct: 0,
      exp: "Time-to-Fill measures operational recruiting velocity from requisition approval until offer acceptance.",
      exp_ml: "തൊഴിൽ റിക്വിസിഷൻ അപ്രൂവ് ആയ തീയതി മുതൽ ഉദ്യോഗാർത്ഥി ഓഫർ സ്വീകരിക്കുന്ന തീയതി വരെയുള്ള ദിവസങ്ങളാണ് ടൈം-ടു-ഫിൽ."
    },
    {
      id: "ta_q27",
      sectionId: 6,
      section: "Recruitment Tech, AI Ethics & Talent KPIs",
      q: "If an internal TA team spends ₹15,00,000 in recruiter salaries, ₹6,00,000 on LinkedIn seats & job boards, and ₹3,00,000 on referral bonuses, making 60 successful hires, what is the Cost-per-Hire (CPH)?",
      q_ml: "ഒരു കമ്പനി റിക്രൂട്ട്മെന്റിനായി ശമ്പളം (15 ലക്ഷം), ജോബ് ബോർഡുകൾ (6 ലക്ഷം), റഫറൽ ബോണസ് (3 ലക്ഷം) എന്നിങ്ങനെ ആകെ 24 ലക്ഷം രൂപ ചെലവഴിച്ച് 60 പേരെ നിയമിച്ചാൽ, കോസ്റ്റ്-പെർ-ഹയർ എത്ര?",
      options: [
        "₹40,000 per hire",
        "₹60,000 per hire",
        "₹24,000 per hire",
        "₹1,20,000 per hire"
      ],
      correct: 0,
      exp: "Total Recruiting Costs = ₹15L + ₹6L + ₹3L = ₹24,00,000. Cost-per-Hire = ₹24,00,000 ÷ 60 hires = ₹40,000 per hire.",
      exp_ml: "ആകെ ചെലവ് = 24 ലക്ഷം. ആകെ നിയമനങ്ങൾ = 60. ഒരു നിയമനത്തിനുള്ള ചെലവ് (Cost per Hire) = 24,00,000 ÷ 60 = 40,000 രൂപ."
    },
    {
      id: "ta_q28",
      sectionId: 6,
      section: "Recruitment Tech, AI Ethics & Talent KPIs",
      q: "What does a funnel Pass-Through Conversion Rate bottleneck from Interview-to-Offer of less than 10% typically indicate?",
      q_ml: "ഇന്റർവ്യൂവിൽ നിന്ന് ഓഫറിലേക്കുള്ള കൺവേർഷൻ നിരക്ക് 10 ശതമാനത്തിൽ താഴെയായാൽ അത് എന്തിനെ സൂചിപ്പിക്കുന്നു?",
      options: [
        "Misalignment between the recruiting team and interview panel regarding role expectations or an overly subjective/unanchored interview rubric.",
        "That candidates are too qualified for the position.",
        "That the recruitment software server is offline.",
        "That salary offers are unnecessarily high."
      ],
      correct: 0,
      exp: "Extremely low interview-to-offer ratios point to poor top-of-funnel qualification, panel recalibration failures, or unrealistic hiring manager standards.",
      exp_ml: "ഇന്റർവ്യൂ മാനദണ്ഡങ്ങളിൽ വ്യക്തതയില്ലായ്മയോ റിക്രൂട്ടറും മാനേജരും തമ്മിലുള്ള ധാരണക്കുറവോ ആണ് ഇത് വ്യക്തമാക്കുന്നത്."
    },
    {
      id: "ta_q29",
      sectionId: 6,
      section: "Recruitment Tech, AI Ethics & Talent KPIs",
      q: "When utilizing Generative AI tools (e.g. Gemini, ChatGPT) for automated candidate evaluation, what ethical/legal boundary must be strictly enforced?",
      q_ml: "ഉദ്യോഗാർത്ഥികളെ വിലയിരുത്താൻ ജനറേറ്റീവ് എ.ഐ ഉപയോഗിക്കുമ്പോൾ നിർബന്ധമായും പാലിക്കേണ്ട ധാർമ്മികവും നിയമപരവുമായ കാര്യം എന്താണ്?",
      options: [
        "AI algorithms must never be allowed to make automated, unmonitored rejection decisions without human oversight, and must be audited for demographic bias (EU AI Act & NYC Local Law 144 compliance).",
        "AI should be allowed to reject candidates automatically based on age, gender, and postal code.",
        "AI recruiting tools are strictly illegal in private corporations.",
        "Candidates should never be informed that AI was utilized."
      ],
      correct: 0,
      exp: "International compliance laws (EU AI Act, NYC Local Law 144) mandate human oversight, bias audits, and transparency; algorithmic rejection without human review creates significant legal liability.",
      exp_ml: "മനുഷ്യന്റെ മേൽനോട്ടമില്ലാതെ എ.ഐയെക്കൊണ്ട് മാത്രം ഉദ്യോഗാർത്ഥികളെ നിരസിപ്പിക്കാൻ പാടില്ല; പക്ഷപാതരഹിതമാണെന്ന് ഉറപ്പാക്കേണ്ടതുണ്ട്."
    },
    {
      id: "ta_q30",
      sectionId: 6,
      section: "Recruitment Tech, AI Ethics & Talent KPIs",
      q: "Which metric provides the most accurate business indicator of 'Quality of Hire' (QoH) after 90 days?",
      q_ml: "90 ദിവസത്തിന് ശേഷം നിയമനത്തിന്റെ ഗുണനിലവാരം (Quality of Hire) അളക്കാൻ ഏറ്റവും അനുയോജ്യമായ അളവുകോൽ ഏതാണ്?",
      options: [
        "Composite metric of 90-day Manager Performance Rating, 90-day New Hire Retention, and New Hire ramp-up milestone completion.",
        "The total number of connections the employee has on LinkedIn.",
        "The speed at which the employee submits daily attendance.",
        "The number of job interviews the candidate originally attended."
      ],
      correct: 0,
      exp: "Quality of Hire (QoH) combines manager satisfaction, probation pass rate, 90-day voluntary retention, and speed to productivity.",
      exp_ml: "90 ദിവസത്തെ പെർഫോമൻസ് റേറ്റിംഗ്, ജീവനക്കാരന്റെ നിലനിൽപ്പ്, ജോലിയുടെ ലക്ഷ്യങ്ങൾ പൂർത്തിയാക്കൽ എന്നിവയാണ് ക്വാളിറ്റി ഓഫ് ഹയറിന്റെ മാനദണ്ഡങ്ങൾ."
    }
  ]
};


const HRM_DIPLOMA_EXAM = {
  examCode: "HRM-DIP-501-EXAM",
  courseCode: "HRM-DIP-501",
  title: "Executive International Postgraduate Diploma Examination in Human Resource Management",
  subtitle: "Comprehensive 6-Domain Evaluation: Strategic HRM, GCC Statutory Compliance, Total Rewards, Payroll, Performance & HRIS",
  totalQuestions: 50,
  durationMinutes: 90,
  passingScorePercent: 75,
  distinctionScorePercent: 85,
  instructions: [
    "This comprehensive examination covers all 6 Core International HRM Diploma modules (32 Live Sessions curriculum).",
    "Statutory GCC and UAE citations refer to Federal Decree Law No. 33 of 2021 and its Executive Regulations.",
    "Time allowed is 90 minutes for 50 questions (2 marks per question; Total: 100 Marks).",
    "Passing grade: 75% | Distinction with Academic Honors: 85% or higher.",
    "Official Transcript and Digital Verified Diploma are generated immediately upon verified submission."
  ],
  sections: [
    { id: 1, name: "Strategic HRM & Organizational Architecture", questionsCount: 8 },
    { id: 2, name: "International Talent Acquisition & Competency Modeling", questionsCount: 8 },
    { id: 3, name: "UAE & GCC Labor Law Compliance (Decree 33/2021)", questionsCount: 10 },
    { id: 4, name: "Compensation, Total Rewards & Payroll Administration", questionsCount: 8 },
    { id: 5, name: "Performance Management, OKRs, ER & POSH", questionsCount: 8 },
    { id: 6, name: "Enterprise HRIS, People Analytics & Statutory Auditing", questionsCount: 8 }
  ],
  questions: [
    // ── DOMAIN 1: STRATEGIC HRM & ORG DESIGN (Q1-Q8) ──
    {
      id: "dip_q1",
      domain: "Strategic HRM & Org Architecture",
      q: "According to the Dave Ulrich HR Business Partner model, which role primarily focuses on aligning human resource strategy with future corporate business objectives?",
      q_ml: "ഡേവ് ഉൾറിച്ച് എച്ച്.ആർ മോഡൽ പ്രകാരം ബിസിനസ്സ് ലക്ഷ്യങ്ങൾക്ക് അനുസൃതമായി തന്ത്രങ്ങൾ രൂപീകരിക്കുന്ന പങ്ക് ഏതാണ്?",
      options: ["Administrative Expert", "Strategic Partner", "Employee Champion", "Change Agent"],
      correct: 1,
      exp: "Ulrich's Strategic Partner role partners directly with C-suite executives to integrate talent strategies with commercial business objectives."
    },
    {
      id: "dip_q2",
      domain: "Strategic HRM & Org Architecture",
      q: "What is the primary operational consequence of an excessively wide 'span of control' in a knowledge-work enterprise?",
      q_ml: "ഒരു കമ്പനിയിൽ സ്പാൻ ഓഫ് കൺട്രോൾ (Span of Control) അമിതമായാൽ ഉണ്ടാകുന്ന പ്രധാന പ്രത്യാഘാതം എന്താണ്?",
      options: [
        "Managerial cognitive overload, delayed decision approvals, and reduced personalized feedback for subordinates.",
        "Immediate bankruptcy of the firm.",
        "Automatic reduction in statutory corporate taxes.",
        "Over-supervision and micro-management of employees."
      ],
      correct: 0,
      exp: "Excessive span of control overwhelms managers, creating bottlenecks in coaching and strategic decision-making."
    },
    {
      id: "dip_q3",
      domain: "Strategic HRM & Org Architecture",
      q: "In SHRM BoCK and CIPD frameworks, what defines a 'Core Competency'?",
      q_ml: "SHRM / CIPD മാനദണ്ഡങ്ങൾ പ്രകാരം 'കോർ കോംപറ്റൻസി' (Core Competency) എന്നാൽ എന്താണ്?",
      options: [
        "A measurable cluster of related knowledge, skills, behaviors, and abilities that affect a major part of one's job and correlate with performance on the job.",
        "A list of software packages installed on employee laptops.",
        "The number of hours worked per calendar year.",
        "The total compensation paid to an executive."
      ],
      correct: 0,
      exp: "Competencies are observable and measurable clusters of knowledge, skills, and behaviors that differentiate superior performance."
    },
    {
      id: "dip_q4",
      domain: "Strategic HRM & Org Architecture",
      q: "When designing an Organizational Restructuring Plan, which tool maps decision-making accountability across roles?",
      q_ml: "സ്ഥാപന പുനഃസംഘടനയിൽ ഉത്തരവാദിത്തങ്ങൾ വ്യക്തമായി നിർണ്ണയിക്കാൻ ഉപയോഗിക്കുന്ന ടൂൾ ഏതാണ്?",
      options: ["RACI Matrix (Responsible, Accountable, Consulted, Informed)", "Pareto Chart", "PERT Diagram", "Kanban Inventory Board"],
      correct: 0,
      exp: "RACI matrix clarifies single-point accountability (A) and operational responsibility (R) across cross-functional workflows."
    },
    {
      id: "dip_q5",
      domain: "Strategic HRM & Org Architecture",
      q: "What is Human Capital Return on Investment (HC-ROI) calculated as?",
      q_ml: "ഹ്യൂമൻ കാപിറ്റൽ ആർ.ഒ.ഐ (HC-ROI) കണക്കാക്കുന്ന സമവാക്യം ഏതാണ്?",
      options: [
        "[Revenue – (Operating Expenses – Total Workforce Costs)] ÷ Total Workforce Costs",
        "Total Revenue ÷ Total Headcount",
        "Gross Profit × Total Number of Resignations",
        "Base Salary ÷ 12 Months"
      ],
      correct: 0,
      exp: "HC-ROI = [Revenue – (Operating Expenses – Total Workforce Costs)] ÷ Total Workforce Costs, isolating productivity per dollar spent on talent."
    },
    {
      id: "dip_q6",
      domain: "Strategic HRM & Org Architecture",
      q: "Which document legally sets the terms of internal workplace discipline, attendance guidelines, POSH mechanisms, and statutory leaves?",
      q_ml: "കമ്പനിയിലെ പെരുമാറ്റച്ചട്ടങ്ങൾ, ലീവ് പോളിസികൾ, അച്ചടക്ക നടപടികൾ എന്നിവ രേഖപ്പെടുത്തുന്ന ഔദ്യോഗിക രേഖ ഏതാണ്?",
      options: ["The Employee Handbook & HR Policy Manual", "The Annual Financial Audit Report", "The Corporate Tax Return", "A Contingency Vendor Contract"],
      correct: 0,
      exp: "Employee Handbooks formalize employment regulations, grievance processes, attendance, and code of conduct."
    },
    {
      id: "dip_q7",
      domain: "Strategic HRM & Org Architecture",
      q: "In succession planning, the '9-Box Grid' evaluates talent along which two primary axes?",
      q_ml: "സക്സഷൻ പ്ലാനിംഗിൽ '9-ബോക്സ് ഗ്രിഡ്' ജീവനക്കാരെ വിലയിരുത്തുന്നത് ഏത് രണ്ട് ഘടകങ്ങൾ അടിസ്ഥാനമാക്കിയാണ്?",
      options: ["Current Performance (X-axis) and Future Potential (Y-axis)", "Age and Seniority", "Base Salary and Bonus", "Attendance and Overtime"],
      correct: 0,
      exp: "The 9-Box Grid cross-references verified performance against leadership growth potential to identify high-potentials (HiPos)."
    },
    {
      id: "dip_q8",
      domain: "Strategic HRM & Org Architecture",
      q: "What is the strategic objective of conducting a skills gap analysis before initiating external recruitment?",
      q_ml: "പുറത്തുനിന്ന് ആളെ എടുക്കുന്നതിന് മുൻപ് സ്കിൽസ് ഗ്യാപ് അനാലിസിസ് നടത്തുന്നതിന്റെ പ്രധാന ലക്ഷ്യം എന്താണ്?",
      options: [
        "To evaluate whether existing employees can be upskilled or internally promoted, minimizing external cost and protecting organizational knowledge.",
        "To justify firing the bottom 10% of the workforce.",
        "To delay company projects by 6 months.",
        "To satisfy corporate social media marketing quotas."
      ],
      correct: 0,
      exp: "Skills audits evaluate internal mobility and reskilling before incurring external recruitment agency or job board costs."
    },

    // ── DOMAIN 2: INTERNATIONAL TALENT ACQUISITION & SOURCING (Q9-Q16) ──
    {
      id: "dip_q9",
      domain: "International Talent Acquisition",
      q: "When sourcing passive talent on LinkedIn via Google X-Ray, what command restricts searches strictly to indexed individual profiles?",
      q_ml: "ലിങ്ക്ഡ്ഇൻ പ്രൊഫൈലുകൾ മാത്രം ലഭിക്കാൻ ഗൂഗിളിൽ ഉപയോഗിക്കുന്ന X-Ray കമാൻഡ് ഏതാണ്?",
      options: ["site:linkedin.com/in/", "url:linkedin.com/jobs/", "domain:linkedin.org", "source:linkedin"],
      correct: 0,
      exp: "The 'site:linkedin.com/in/' parameter isolates indexed personal candidate profile URLs."
    },
    {
      id: "dip_q10",
      domain: "International Talent Acquisition",
      q: "Which Boolean query will retrieve profiles containing either 'Talent Acquisition' or 'Recruiter' in Dubai or Abu Dhabi while excluding interns?",
      q_ml: "'Talent Acquisition' അല്ലെങ്കിൽ 'Recruiter' ദുബായിലോ അബുദാബിയിലോ ഉള്ളവരെ കണ്ടെത്താനും ഇന്റേണുകളെ ഒഴിവാക്കാനുമുള്ള ബൂളിയൻ സെർച്ച് ഏതാണ്?",
      options: [
        '("Talent Acquisition" OR Recruiter) AND ("Dubai" OR "Abu Dhabi") -intern',
        '"Talent Acquisition" AND Recruiter AND Dubai AND intern',
        'NOT intern OR Dubai',
        'find:recruiter in UAE'
      ],
      correct: 0,
      exp: "Parentheses group synonyms; AND links location; and hyphen (-intern) excludes irrelevant entries."
    },
    {
      id: "dip_q11",
      domain: "International Talent Acquisition",
      q: "In competency-based structured interviews, what is the core rationale for using the STAR method?",
      q_ml: "ഇന്റർവ്യൂവിൽ STAR മെത്തേഡ് ഉപയോഗിക്കുന്നതിന്റെ അടിസ്ഥാന തത്വം എന്താണ്?",
      options: [
        "Past behavioral performance in realistic situations is the single best predictor of future workplace execution.",
        "It forces candidates to memorize company financial reports.",
        "It allows interviewers to speak 90% of the total time.",
        "It eliminates the need for reference checks."
      ],
      correct: 0,
      exp: "STAR behavioral probing extracts past concrete evidence because historical action reliably predicts future competence."
    },
    {
      id: "dip_q12",
      domain: "International Talent Acquisition",
      q: "What is 'Affinity Bias' in candidate assessment?",
      q_ml: "ഇന്റർവ്യൂവിലെ 'അഫിനിറ്റി ബയാസ്' (Affinity Bias) എന്നാൽ എന്താണ്?",
      options: [
        "An unconscious tendency to favor candidates who share similar cultural, educational, regional, or recreational backgrounds with the interviewer.",
        "A legal requirement to hire university graduates.",
        "A technical failure in the video conferencing platform.",
        "Evaluating candidates based solely on test scores."
      ],
      correct: 0,
      exp: "Affinity bias occurs when interviewers unconsciously warm up to candidates with similar backgrounds, skewing objective scoring."
    },
    {
      id: "dip_q13",
      domain: "International Talent Acquisition",
      q: "Which recruitment funnel ratio measures the percentage of applicants who progress from the initial screening stage to a hiring manager interview?",
      q_ml: "പ്രാരംഭ സ്ക്രീനിംഗിൽ നിന്ന് മാനേജർ ഇന്റർവ്യൂവിലേക്ക് മുന്നേറുന്നവരുടെ ശതമാനം സൂചിപ്പിക്കുന്ന അനുപാതം ഏതാണ്?",
      options: ["Screen-to-Interview Pass-Through Rate", "Gross Margin Ratio", "Cost-of-Goods-Sold", "Attrition Velocity"],
      correct: 0,
      exp: "Pass-through conversion rates track funnel efficiency across consecutive hiring stages."
    },
    {
      id: "dip_q14",
      domain: "International Talent Acquisition",
      q: "What does blind resume screening systematically redact to prevent unconscious evaluation bias?",
      q_ml: "ബ്ലൈൻഡ് റെസ്യൂമെ സ്ക്രീനിംഗിൽ പക്ഷപാതം ഒഴിവാക്കാൻ ഒഴിവാക്കുന്ന വിവരങ്ങൾ ഏതെല്ലാമാണ്?",
      options: [
        "Candidate name, gender, photographs, age, address, and graduation dates.",
        "Technical skills and programming languages.",
        "Certifications and degrees earned.",
        "Employment job titles and company descriptions."
      ],
      correct: 0,
      exp: "Blind screening anonymizes identifying demographic characteristics, forcing reviewers to evaluate competency credentials only."
    },
    {
      id: "dip_q15",
      domain: "International Talent Acquisition",
      q: "How is 'Offer Acceptance Rate' (OAR) computed?",
      q_ml: "ഓഫർ അക്സെപ്റ്റൻസ് റേറ്റ് (OAR) കണക്കാക്കുന്ന ഫോർമുല ഏതാണ്?",
      options: [
        "(Total Offers Accepted ÷ Total Offers Extended) × 100",
        "(Total Candidates Screened ÷ Total Hires) × 100",
        "Total Salary Budget ÷ Number of Hires",
        "Total Requisitions ÷ Days Open"
      ],
      correct: 0,
      exp: "OAR = (Offers Accepted ÷ Offers Extended) × 100. A benchmark healthy rate in professional hiring is 85%+."
    },
    {
      id: "dip_q16",
      domain: "International Talent Acquisition",
      q: "What is an Applicant Tracking System (ATS) parsing engine designed to do?",
      q_ml: "ഒരു അപേക്ഷക ട്രാക്കിംഗ് സോഫ്റ്റ്‌വെയറിലെ (ATS) പാഴ്സിംഗ് എഞ്ചിൻ ചെയ്യുന്നത് എന്താണ്?",
      options: [
        "Convert unstructured resume documents (PDF/Word) into structured database fields for skills, experience, and contact data.",
        "Automatically reject all applicants who live in apartments.",
        "Print paper copies of applications.",
        "Calculate annual corporate tax liabilities."
      ],
      correct: 0,
      exp: "ATS parsers extract unstructured candidate data into searchable relational database fields."
    },

    // ── DOMAIN 3: UAE & GCC LABOR LAW COMPLIANCE (Q17-Q26) ──
    {
      id: "dip_q17",
      domain: "UAE & GCC Labor Law Compliance",
      q: "Under UAE Federal Decree Law No. 33 of 2021, what is the status of unlimited employment contracts in the private sector?",
      q_ml: "യു.എ.ഇ ലേബർ നിയമം (ഫെഡറൽ ഡിക്രി-ലോ 33/2021) പ്രകാരം അൺലിമിറ്റഡ് കോൺട്രാക്റ്റുകളുടെ നിലവിലെ അവസ്ഥ എന്താണ്?",
      options: [
        "Unlimited contracts have been abolished; all private sector employment contracts must be fixed-term (renewable by mutual agreement).",
        "Unlimited contracts are compulsory for all foreign workers.",
        "Fixed-term contracts are strictly illegal.",
        "Contracts are only verbal; written contracts are optional."
      ],
      correct: 0,
      exp: "Article 8 of Federal Decree Law No. 33 of 2021 abolished unlimited contracts, mandating fixed-term contracts renewable by mutual consent."
    },
    {
      id: "dip_q18",
      domain: "UAE & GCC Labor Law Compliance",
      q: "What is the statutory maximum permissible probation period under Article 9 of UAE Labor Law 33/2021?",
      q_ml: "യു.എ.ഇ ലേബർ നിയമം ആർട്ടിക്കിൾ 9 പ്രകാരം പരമാവധി അനുവദനീയമായ പ്രൊബേഷൻ കാലയളവ് എത്രയാണ്?",
      options: ["6 continuous months", "12 continuous months", "3 months only without exception", "2 years"],
      correct: 0,
      exp: "Article 9 establishes a strict statutory maximum of 6 continuous months for employee probation."
    },
    {
      id: "dip_q19",
      domain: "UAE & GCC Labor Law Compliance",
      q: "Under UAE Labor Law 33/2021, what notice must an employer provide to terminate an employee during their statutory probation period?",
      q_ml: "പ്രൊബേഷൻ കാലയളവിൽ ഒരു ജീവനക്കാരനെ പിരിച്ചുവിടാൻ തൊഴിലുടമ എത്ര ദിവസത്തെ രേഖാമൂലമുള്ള നോട്ടീസ് നൽകണം?",
      options: ["14 calendar days in writing", "30 days with MOHRE approval", "Zero days notice", "60 days notice"],
      correct: 0,
      exp: "Article 9 mandates a minimum 14-day written notice period for employer termination during probation."
    },
    {
      id: "dip_q20",
      domain: "UAE & GCC Labor Law Compliance",
      q: "If an employee on probation in the UAE resigns to join another employer within the UAE, what notice period is mandatory and what is the new employer's liability?",
      q_ml: "യു.എ.ഇയിൽ പ്രൊബേഷൻ സമയത്ത് മറ്റൊരു ജോലിയിലേക്ക് മാറാൻ രാജിവെക്കുമ്പോൾ എത്ര ദിവസത്തെ നോട്ടീസ് വേണം, പുതിയ കമ്പനിയുടെ ബാധ്യത എന്താണ്?",
      options: [
        "30 days written notice; the new employer must compensate the original employer for visa and recruitment onboarding expenses.",
        "Zero days notice; no compensation required.",
        "6 months notice; employee is banned from working in the UAE for 5 years.",
        "14 days notice with 50% salary fine."
      ],
      correct: 0,
      exp: "Article 9 Clause 3 mandates 30 days notice; the new UAE employer must legally reimburse recruitment costs to the prior employer."
    },
    {
      id: "dip_q21",
      domain: "UAE & GCC Labor Law Compliance",
      q: "Under Article 51 of UAE Labor Law 33/2021, what is the statutory End of Service Gratuity (EOSB) entitlement for the first 5 years of continuous service?",
      q_ml: "ആർട്ടിക്കിൾ 51 പ്രകാരം ആദ്യത്തെ 5 വർഷത്തെ സർവീസിന് ഓരോ വർഷത്തിനും എത്ര ദിവസത്തെ അടിസ്ഥാന ശമ്പളമാണ് ഗ്രാറ്റുവിറ്റിയായി ലഭിക്കുന്നത്?",
      options: [
        "21 days' basic salary for each year of service",
        "30 days' gross CTC for each year",
        "15 days' net salary",
        "Zero gratuity if service is under 5 years"
      ],
      correct: 0,
      exp: "Article 51 stipulates 21 days basic salary for each of the first 5 years of service, and 30 days for each year thereafter."
    },
    {
      id: "dip_q22",
      domain: "UAE & GCC Labor Law Compliance",
      q: "An employee completes 7 years of continuous service in Dubai with a last drawn basic salary of AED 12,000 per month. What is their statutory End of Service Gratuity?",
      q_ml: "ദുബായിൽ 7 വർഷം സർവീസും പ്രതിമാസം 12,000 ദിർഹം അടിസ്ഥാന ശമ്പളവുമുള്ള ഒരു ജീവനക്കാരന്റെ നിയമപരമായ ഗ്രാറ്റുവിറ്റി തുക എത്രയാണ്?",
      options: [
        "AED 66,000 (Tier 1: 5 yrs × 21d = 105d + Tier 2: 2 yrs × 30d = 60d = 165 days × AED 400/day)",
        "AED 84,000 (simple 7 × 12,000)",
        "AED 24,000 only",
        "AED 120,000"
      ],
      correct: 0,
      exp: "Daily basic = 12,000 ÷ 30 = AED 400. First 5 yrs = 5 × 21 = 105 days. Next 2 yrs = 2 × 30 = 60 days. Total days = 165. Gratuity = 165 × AED 400 = AED 66,000."
    },
    {
      id: "dip_q23",
      domain: "UAE & GCC Labor Law Compliance",
      q: "Under Article 51 of the UAE Labor Law 33/2021, what is the maximum statutory cap on total End of Service Gratuity payout?",
      q_ml: "യു.എ.ഇ നിയമപ്രകാരം പരമാവധി ലഭിക്കാവുന്ന ആകെ ഗ്രാറ്റുവിറ്റി തുകയുടെ പരിധി (Cap) എത്രയാണ്?",
      options: [
        "Total gratuity cannot exceed 2 years' total salary (gross basic).",
        "AED 50,000 regardless of tenure.",
        "There is no statutory cap.",
        "10 years of total salary."
      ],
      correct: 0,
      exp: "Article 51 explicitly mandates that total aggregate gratuity payout shall not exceed two years' basic salary."
    },
    {
      id: "dip_q24",
      domain: "UAE & GCC Labor Law Compliance",
      q: "Under Article 44 of UAE Labor Law 33/2021, under which condition may an employer dismiss an employee without notice?",
      q_ml: "ആർട്ടിക്കിൾ 44 പ്രകാരം നോട്ടീസ് ഇല്ലാതെ ഒരു ജീവനക്കാരനെ ഉടനടി പിരിച്ചുവിടാൻ തക്കതായ കാരണം ഏതാണ്?",
      options: [
        "Gross misconduct, such as document forgery, physical assault on premises, intoxication, or causing substantial material financial loss, following formal written investigation.",
        "Taking statutory annual leave during Ramadan.",
        "Politely requesting an annual salary increment.",
        "Refusing to work unpaid overtime past midnight."
      ],
      correct: 0,
      exp: "Article 44 lists 10 specific grounds including forged credentials, assault, alcohol/drugs, and gross material loss following written investigation."
    },
    {
      id: "dip_q25",
      domain: "UAE & GCC Labor Law Compliance",
      q: "What is the Wages Protection System (WPS) mandated by the UAE Ministry of Human Resources & Emiratisation (MOHRE)?",
      q_ml: "യു.എ.ഇയിലെ വേജസ് പ്രൊട്ടക്ഷൻ സിസ്റ്റം (WPS) എന്നാൽ എന്താണ്?",
      options: [
        "An electronic salary transfer system monitoring private sector wage payments through central bank approved financial institutions to guarantee timely payment.",
        "A private health insurance policy for expatriate managers.",
        "A government pension fund for foreign domestic workers.",
        "An income tax deduction calculator."
      ],
      correct: 0,
      exp: "WPS requires compliant electronic salary file (SIF) disbursement through authorized banks to guarantee statutory wage delivery."
    },
    {
      id: "dip_q26",
      domain: "UAE & GCC Labor Law Compliance",
      q: "Under UAE Labor Law 33/2021, what is the statutory annual leave entitlement for employees who have completed more than 1 year of continuous service?",
      q_ml: "ഒരു വർഷത്തിലധികം സർവീസ് പൂർത്തിയാക്കിയ ജീവനക്കാർക്ക് യു.എ.ഇ നിയമപ്രകാരം പ്രതിവർഷം എത്ര ദിവസത്തെ ശമ്പളത്തോടെയുള്ള വാർഷിക അവധിക്ക് (Annual Leave) അർഹതയുണ്ട്?",
      options: [
        "30 calendar days per year",
        "14 working days per year",
        "60 calendar days per year",
        "10 working days only"
      ],
      correct: 0,
      exp: "Article 29 mandates 30 calendar days of paid annual leave for each year of service past the first year."
    },

    // ── DOMAIN 4: COMPENSATION, REWARDS & PAYROLL (Q27-Q34) ──
    {
      id: "dip_q27",
      domain: "Compensation, Rewards & Payroll",
      q: "In GCC compensation structures, why is total salary typically split between Basic Salary (50%–60%) and Allowances (Housing/Transport 40%–50%)?",
      q_ml: "ഗൾഫ് രാജ്യങ്ങളിൽ ശമ്പളം ബേസിക് സാലറിയും അലവൻസുകളുമായി വിഭജിക്കുന്നതിന്റെ പ്രധാന കാരണം എന്താണ്?",
      options: [
        "Statutory End of Service Gratuity and overtime rates are calculated exclusively on Basic Salary, thereby managing long-term organizational terminal liability.",
        "To confuse employee tax returns.",
        "Government law mandates all basic salaries must be under AED 1,000.",
        "Allowances are legally tax-free while basic salary is taxed at 50%."
      ],
      correct: 0,
      exp: "Because statutory terminal benefits (gratuity) are calculated on Basic Salary alone, balancing components manages employer liabilities."
    },
    {
      id: "dip_q28",
      domain: "Compensation, Rewards & Payroll",
      q: "What is the standard formula for computing an employee's Daily Basic Wage rate under UAE labor practices?",
      q_ml: "യു.എ.ഇയിൽ ദിവസ അടിസ്ഥാന ശമ്പളം (Daily Basic Wage) കണക്കാക്കുന്ന ഫോർമുല ഏതാണ്?",
      options: [
        "Monthly Basic Salary ÷ 30 days",
        "Monthly Gross Salary ÷ 365 days",
        "Annual CTC ÷ 52 weeks",
        "Basic Salary ÷ 22 working days"
      ],
      correct: 0,
      exp: "Statutory labor interpretations standardize daily basic wage calculation as Monthly Basic ÷ 30 days."
    },
    {
      id: "dip_q29",
      domain: "Compensation, Rewards & Payroll",
      q: "Under UAE Labor Law, what is the statutory overtime pay rate for regular working hours performed beyond standard daily limits?",
      q_ml: "സാധാരണ പ്രവൃത്തി സമയത്തിന് ശേഷം അധികം ജോലി ചെയ്താൽ യു.എ.ഇ നിയമപ്രകാരം നൽകേണ്ട ഓവർടൈം നിരക്ക് എത്രയാണ്?",
      options: [
        "Basic hourly wage + minimum 25% of basic wage for that hour",
        "Same as regular rate without any supplement",
        "300% of gross salary",
        "Overtime is strictly prohibited by law"
      ],
      correct: 0,
      exp: "Article 19 mandates that regular overtime receives normal hourly pay plus a minimum 25% supplement (50% if performed between 10 PM and 4 AM)."
    },
    {
      id: "dip_q30",
      domain: "Compensation, Rewards & Payroll",
      q: "What is a 'Salary Information File' (SIF) in GCC payroll processing?",
      q_ml: "ജി.സി.സി ശമ്പള പ്രക്രിയയിലെ സാലറി ഇൻഫർമേഷൻ ഫയൽ (SIF) എന്നാൽ എന്താണ്?",
      options: [
        "The standardized electronic file uploaded to banks/MOHRE for automated Wages Protection System (WPS) processing.",
        "A confidential document containing executive bonuses only.",
        "A paper check mailed to employee home addresses.",
        "An insurance claim form."
      ],
      correct: 0,
      exp: "The SIF file is the encrypted standard format required by central banks to disburse compliant wages via WPS."
    },
    {
      id: "dip_q31",
      domain: "Compensation, Rewards & Payroll",
      q: "How is an unauthorized Loss of Pay (LOP) deduction calculated for an employee with Monthly Gross Salary of AED 9,000 who was absent for 3 days without approved leave?",
      q_ml: "9,000 ദിർഹം മൊത്തം ശമ്പളമുള്ള ഒരാൾ 3 ദിവസം അനുവാദമില്ലാതെ അവധിയെടുത്താൽ (LOP) എത്ര തുക കുറയ്ക്കണം?",
      options: [
        "AED 900 [(AED 9,000 ÷ 30 days) × 3 days]",
        "AED 3,000",
        "AED 450",
        "No deduction is allowed"
      ],
      correct: 0,
      exp: "Daily gross rate = 9,000 ÷ 30 = AED 300. Unpaid absence for 3 days = 300 × 3 = AED 900 deduction."
    },
    {
      id: "dip_q32",
      domain: "Compensation, Rewards & Payroll",
      q: "What is the 'Compa-Ratio' in compensation analytics and how is it used?",
      q_ml: "കോമ്പൻസേഷൻ അനലിറ്റിക്സിൽ 'കോമ്പ-റേഷ്യോ' (Compa-Ratio) എന്നാൽ എന്താണ്?",
      options: [
        "An employee's current salary divided by the midpoint of the salary range for their grade, measuring compensation competitiveness.",
        "Total company profits divided by the number of HR staff.",
        "The ratio of male to female employees in sales.",
        "The number of laptops distributed per department."
      ],
      correct: 0,
      exp: "Compa-Ratio = (Employee Base Salary ÷ Salary Grade Midpoint). A 1.0 ratio indicates pay precisely at market median."
    },
    {
      id: "dip_q33",
      domain: "Compensation, Rewards & Payroll",
      q: "What does 'Broadbanding' refer to in compensation grade architecture?",
      q_ml: "ശമ്പള ഘടനയിലെ 'ബ്രോഡ്ബാൻഡിംഗ്' (Broadbanding) എന്നാൽ എന്താണ്?",
      options: [
        "Consolidating numerous narrow salary grades into a smaller number of wider, flexible salary bands to encourage cross-functional career mobility.",
        "Providing high-speed fiber internet to remote employees.",
        "Paying identical salaries to all employees in the country.",
        "Eliminating performance bonuses."
      ],
      correct: 0,
      exp: "Broadbanding collapses 15–20 rigid salary grades into 4–5 broad pay bands, giving managers flexibility in rewarding lateral skill growth."
    },
    {
      id: "dip_q34",
      domain: "Compensation, Rewards & Payroll",
      q: "In payroll audit compliance, what is the statutory requirement regarding salary pay slip issuance?",
      q_ml: "ശമ്പള സ്ലിപ്പുകൾ നൽകുന്നതുമായി ബന്ധപ്പെട്ട നിയമപരമായ ബാധ്യത എന്താണ്?",
      options: [
        "Employers must issue detailed pay slips showing basic wage, allowances, overtime, deductions, and net disbursed earnings to every employee.",
        "Pay slips are optional and discouraged.",
        "Only employees earning above AED 50,000 receive pay slips.",
        "Pay slips must be handwritten on official parchment."
      ],
      correct: 0,
      exp: "Labor regulations require transparent, itemized statements detailing earnings, components, and deductions for every pay cycle."
    },

    // ── DOMAIN 5: PERFORMANCE MANAGEMENT, OKRS & ER (Q35-Q42) ──
    {
      id: "dip_q35",
      domain: "Performance Management, OKRs & ER",
      q: "What is the primary architectural difference between Key Performance Indicators (KPIs) and Objectives & Key Results (OKRs)?",
      q_ml: "കെ.പി.ഐകളും (KPIs) ഒ.കെ.ആറുകളും (OKRs) തമ്മിലുള്ള പ്രധാന വ്യത്യാസം എന്താണ്?",
      options: [
        "KPIs track business-as-usual operational metrics and steady-state health, while OKRs set ambitious, qualitative objectives paired with measurable stretch results for growth and innovation.",
        "KPIs are for sales teams, while OKRs are only for software developers.",
        "OKRs are permanent for 10 years, while KPIs change daily.",
        "There is no difference; they are interchangeable acronyms."
      ],
      correct: 0,
      exp: "KPIs measure steady-state operational efficiency (business-as-usual), whereas OKRs drive transformational strategic change and stretch targets."
    },
    {
      id: "dip_q36",
      domain: "Performance Management, OKRs & ER",
      q: "In a 360-Degree Feedback appraisal system, feedback is collected from which stakeholder groups?",
      q_ml: "360-ഡിഗ്രി ഫീഡ്‌ബാക്ക് സംവിധാനത്തിൽ ആരിൽ നിന്നൊക്കെയാണ് വിലയിരുത്തലുകൾ ശേഖരിക്കുന്നത്?",
      options: [
        "Supervisors, Direct Reports (Subordinates), Peers/Colleagues, and Self-Evaluation (and optionally external clients).",
        "Direct supervisor only.",
        "Human Resources department only.",
        "External government labor inspectors."
      ],
      correct: 0,
      exp: "360-degree feedback gathers holistic multi-rater input from managers, direct reports, peers, and self-assessment."
    },
    {
      id: "dip_q37",
      domain: "Performance Management, OKRs & ER",
      q: "What is the 'Recency Bias' in annual performance reviews and how is it mitigated?",
      q_ml: "പെർഫോമൻസ് റിവ്യൂവിലെ 'റീസെൻസി ബയാസ്' (Recency Bias) എന്നാൽ എന്താണ്?",
      options: [
        "The cognitive tendency of managers to over-weight employee events from the past 3–4 weeks while ignoring accomplishments from earlier months; mitigated by ongoing continuous 1-on-1 performance documentation.",
        "Evaluating candidates based on their university graduation year.",
        "Only reviewing recently promoted managers.",
        "Cancelling reviews for employees with 10 years of service."
      ],
      correct: 0,
      exp: "Recency bias skews annual evaluations based on immediate recent events; continuous quarterly check-ins and performance logs mitigate this error."
    },
    {
      id: "dip_q38",
      domain: "Performance Management, OKRs & ER",
      q: "What is the mandatory legal protocol when investigating an allegation under POSH (Prevention of Sexual Harassment) or workplace harassment policies?",
      q_ml: "ജോലിസ്ഥലത്തെ പീഡന പരാതികളിൽ (POSH) അന്വേഷണം നടത്തുമ്പോൾ നിർബന്ധമായും പാലിക്കേണ്ട നിയമപരമായ നടപടി എന്താണ്?",
      options: [
        "Convene a formal Internal Complaints Committee (ICC) with external representation, maintain absolute confidentiality, ensure principles of natural justice, and conclude investigation within statutory timelines.",
        "Post the allegation on the company's public LinkedIn page.",
        "Immediately terminate the accused employee without investigation.",
        "Force the victim to take unpaid leave and drop the complaint."
      ],
      correct: 0,
      exp: "POSH regulations require a formal, confidential Internal Complaints Committee investigation upholding natural justice and due process."
    },
    {
      id: "dip_q39",
      domain: "Performance Management, OKRs & ER",
      q: "What are the core components of a legally compliant Performance Improvement Plan (PIP)?",
      q_ml: "നിയമപരമായി സാധുതയുള്ള ഒരു പെർഫോമൻസ് ഇംപ്രൂവ്‌മെന്റ് പ്ലാനിൽ (PIP) എന്തൊക്കെ ഉണ്ടായിരിക്കണം?",
      options: [
        "Clear documentation of performance gaps, specific measurable targets, agreed duration (30–60 days), necessary training support, and explicit consequences of non-completion.",
        "A verbal threat to dismiss the employee by tomorrow morning.",
        "Increasing the employee's work quota by 500% with no training.",
        "A formal reduction of basic salary below minimum wage."
      ],
      correct: 0,
      exp: "A robust PIP provides measurable milestones, employer coaching support, reasonable evaluation timelines (30–90 days), and transparent outcomes."
    },
    {
      id: "dip_q40",
      domain: "Performance Management, OKRs & ER",
      q: "In industrial relations and employee grievance handling, what does the principle of 'Natural Justice' (Audi Alteram Partem) guarantee?",
      q_ml: "അച്ചടക്ക നടപടികളിൽ 'സ്വാഭാവിക നീതി' (Natural Justice) ഉറപ്പുനൽകുന്നത് എന്താണ്?",
      options: [
        "No person shall be condemned unheard; the employee has the right to receive written notice of charges and a fair opportunity to present their defense.",
        "The CEO always wins any dispute automatically.",
        "Disputes must be resolved in outdoor natural environments.",
        "All employee grievances must be dismissed without documentation."
      ],
      correct: 0,
      exp: "Audi Alteram Partem ('hear the other side') mandates that an accused employee receives formal notice of allegations and an impartial hearing before disciplinary action."
    },
    {
      id: "dip_q41",
      domain: "Performance Management, OKRs & ER",
      q: "What is an Employee Net Promoter Score (eNPS) and how is it scored?",
      q_ml: "എംപ്ലോയി നെറ്റ് പ്രൊമോട്ടർ സ്കോർ (eNPS) എങ്ങനെയാണ് കണക്കാക്കുന്നത്?",
      options: [
        "% Promoters (Score 9-10) minus % Detractors (Score 0-6) on the question: 'How likely are you to recommend our organization as a place to work?'",
        "Total number of sick days divided by annual revenue.",
        "Average manager performance rating multiplied by 10.",
        "The percentage of employees who sign their contracts on time."
      ],
      correct: 0,
      exp: "eNPS measures internal employee sentiment: % Promoters (9-10) minus % Detractors (0-6). Passives (7-8) are omitted from the net subtraction."
    },
    {
      id: "dip_q42",
      domain: "Performance Management, OKRs & ER",
      q: "When an employee submits a formal grievance regarding bullying or toxic management, what is the HR department's first procedural step?",
      q_ml: "മേലുദ്യോഗസ്ഥന്റെ മോശം പെരുമാറ്റത്തിനെതിരെ ഒരു ജീവനക്കാരൻ പരാതി നൽകുമ്പോൾ എച്ച്.ആറിന്റെ ആദ്യ നടപടി എന്തായിരിക്കണം?",
      options: [
        "Acknowledge receipt in writing, initiate preliminary confidential fact-finding, and protect the complainant against retaliation.",
        "Forward the complaint to the accused manager and ask them to deal with it directly.",
        "Advise the employee to ignore the behavior and smile more.",
        "Dismiss the employee immediately to avoid disruption."
      ],
      correct: 0,
      exp: "HR must immediately provide written acknowledgment, maintain confidentiality, establish anti-retaliation safeguards, and commence formal fact-finding."
    },

    // ── DOMAIN 6: ENTERPRISE HRIS, ANALYTICS & AUDIT (Q43-Q50) ──
    {
      id: "dip_q43",
      domain: "Enterprise HRIS & People Analytics",
      q: "What is the primary function of an enterprise HRIS (such as Workday, SAP SuccessFactors, or BambooHR)?",
      q_ml: "ഒരു എന്റർപ്രൈസ് HRIS സോഫ്റ്റ്‌വെയറിന്റെ (Workday, SAP, BambooHR) പ്രധാന ധർമ്മം എന്താണ്?",
      options: [
        "A centralized relational database managing the complete employee lifecycle: core master data, payroll, onboarding, leaves, compliance, and talent analytics.",
        "An email marketing engine for sending customer sales pitches.",
        "A video game emulator for staff recreation.",
        "A spreadsheet replacing the corporate general ledger."
      ],
      correct: 0,
      exp: "Enterprise HRIS systems serve as the single source of truth for all human capital records, payroll, benefits, lifecycle events, and compliance tracking."
    },
    {
      id: "dip_q44",
      domain: "Enterprise HRIS & People Analytics",
      q: "In predictive HR analytics, which statistical modeling technique is commonly used to forecast voluntary employee attrition risk?",
      q_ml: "ജീവനക്കാർ ജോലി ഉപേക്ഷിച്ചു പോകാനുള്ള സാധ്യത (Attrition Risk) പ്രവചിക്കാൻ ഉപയോഗിക്കുന്ന സ്റ്റാറ്റിസ്റ്റിക്കൽ മോഡൽ ഏതാണ്?",
      options: [
        "Logistic Regression / Survival Analysis modeling factors like commute distance, compa-ratio, tenure, and engagement scores.",
        "Simple coin tossing.",
        "Astrological chart mapping.",
        "Reverse chronological sorting."
      ],
      correct: 0,
      exp: "Logistic regression and survival analysis evaluate historical employee patterns (tenure, compensation ratio, manager changes) to predict flight risk probability."
    },
    {
      id: "dip_q45",
      domain: "Enterprise HRIS & People Analytics",
      q: "What is the statutory compliance purpose of conducting a regular Corporate HR Audit?",
      q_ml: "സ്ഥാപനങ്ങളിൽ ചിട്ടയായ എച്ച്.ആർ ഓഡിറ്റ് (HR Audit) നടത്തുന്നതിന്റെ പ്രധാന ഉദ്ദേശ്യം എന്താണ്?",
      options: [
        "To identify gaps in legal compliance (labor contracts, visa records, wages, safety, leaves), mitigate statutory financial penalties, and optimize operational workflow efficiency.",
        "To reduce employee salaries across the board.",
        "To eliminate all written documentation in the office.",
        "To prepare marketing advertisements for television."
      ],
      correct: 0,
      exp: "HR audits evaluate compliance against labor laws, statutory filings, employee records, and payroll integrity to eliminate legal liabilities."
    },
    {
      id: "dip_q46",
      domain: "Enterprise HRIS & People Analytics",
      q: "Under modern data privacy regulations (e.g., GDPR, UAE Personal Data Protection Law Decree No. 45 of 2021), what rule governs employee personal records?",
      q_ml: "ഡാറ്റാ പ്രൊട്ടക്ഷൻ നിയമങ്ങൾ പ്രകാരം ജീവനക്കാരുടെ വ്യക്തിഗത വിവരങ്ങൾ കൈകാര്യം ചെയ്യുമ്പോൾ പാലിക്കേണ്ട പ്രധാന നിയമം എന്താണ്?",
      options: [
        "Employee personal and biometric data must be securely stored, accessed on a need-to-know basis, processed for legitimate employment purposes only, and protected against unauthorized disclosure.",
        "HR managers may freely share employee medical histories on social media.",
        "Employee records must be published publicly on the company website.",
        "Companies have unlimited right to sell employee personal data to third-party telemarketers."
      ],
      correct: 0,
      exp: "Data privacy regulations mandate strict purpose limitation, role-based access, and data security protocols for all employee personal and biometric information."
    },
    {
      id: "dip_q47",
      domain: "Enterprise HRIS & People Analytics",
      q: "What is the formula for calculating the Annual Employee Turnover Rate?",
      q_ml: "വാർഷിക ജീവനക്കാരുടെ കൊഴിഞ്ഞുപോക്ക് നിരക്ക് (Annual Turnover Rate) കണക്കാക്കുന്ന ഫോർമുല ഏതാണ്?",
      options: [
        "(Number of Separations during Year ÷ Average Number of Employees during Year) × 100",
        "(Number of Hires ÷ Total Resignations) × 100",
        "Total Overtime Hours ÷ Total Headcount",
        "Total Payroll Cost ÷ Number of Active Employees"
      ],
      correct: 0,
      exp: "Turnover Rate = (Total Separations [Voluntary + Involuntary] ÷ Average Headcount during the measurement period) × 100."
    },
    {
      id: "dip_q48",
      domain: "Enterprise HRIS & People Analytics",
      q: "In an executive HR Dashboard, which metric provides immediate insight into corporate workforce aging and retirement risk?",
      q_ml: "എക്സിക്യൂട്ടീവ് എച്ച്.ആർ ഡാഷ്‌ബോർഡിൽ ജീവനക്കാരുടെ പ്രായവും വിരമിക്കൽ സാധ്യതയും വ്യക്തമാക്കുന്ന അനലിറ്റിക് ഏതാണ്?",
      options: [
        "Tenure & Age Demographics Distribution by Job Family",
        "Total Website Impressions",
        "Number of Outgoing Invoices",
        "Office Electricity Consumption"
      ],
      correct: 0,
      exp: "Age and tenure distribution matrices pinpoint departments with impending retirement cliffs and critical succession vulnerabilities."
    },
    {
      id: "dip_q49",
      domain: "Enterprise HRIS & People Analytics",
      q: "What is an HR Service Delivery Tiered Architecture (Tier 0 to Tier 3)?",
      q_ml: "എച്ച്.ആർ സർവീസ് ഡെലിവറി ടിയേർഡ് മോഡൽ (Tier 0 to Tier 3) എന്നാൽ എന്താണ്?",
      options: [
        "Tier 0: Employee Self-Service (ESS/MSS) → Tier 1: HR Shared Services (Inquiries) → Tier 2: HR Centers of Excellence (COEs) → Tier 3: Strategic HRBPs & Legal Escalations",
        "A hierarchy of office furniture quality across executive levels.",
        "Four levels of cafeteria meal plans.",
        "A disciplinary ladder leading to termination."
      ],
      correct: 0,
      exp: "Tiered delivery channels standard queries to digital self-service (Tier 0), shared services (Tier 1), specialist COEs (Tier 2), and strategic HRBPs (Tier 3)."
    },
    {
      id: "dip_q50",
      domain: "Enterprise HRIS & People Analytics",
      q: "In an official HR compliance audit, what is the statutory retention requirement for terminated employee personnel and payroll records in GCC/UAE jurisdictions?",
      q_ml: "എച്ച്.ആർ ഓഡിറ്റ് പ്രകാരം ജോലി ഉപേക്ഷിച്ച ജീവനക്കാരുടെ ഫയലുകളും ശമ്പള രേഖകളും നിയമപരമായി എത്ര വർഷം സൂക്ഷിക്കണം?",
      options: [
        "A minimum of 5 years following the date of employment termination",
        "Records must be shredded on the employee's last working day",
        "30 days only",
        "Records are optional and need not be retained"
      ],
      correct: 0,
      exp: "Statutory labor and commercial regulations require retention of employment contracts, wage records, and dispute settlements for at least 5 years post-termination."
    }
  ]
};

// Export to window global scope
window.HR_TA_601_EXAM = HR_TA_601_EXAM;
window.HRM_DIPLOMA_EXAM = HRM_DIPLOMA_EXAM;
