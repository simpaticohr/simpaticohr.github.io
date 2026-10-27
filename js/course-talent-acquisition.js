/**
 * course-talent-acquisition.js — Simpatico HR Academy
 * Complete Professional Certificate Curriculum: HR-TA-601
 * Title: Talent Acquisition & Recruitment Mastery
 * 6-Week End-to-End Syllabus: Workforce Planning, Boolean Sourcing, Structured Interviewing & AI Analytics
 * Duration: 6 Weeks (36 Hours) — 3 Hours Live Seminar + 3 Hours Applied Lab per week
 */

const HR_TA_601_COURSE = {
  courseCode: "HR-TA-601",
  title: "Talent Acquisition & Recruitment Mastery",
  subtitle: "A 6-Week End-to-End Syllabus: Workforce Planning, Boolean Sourcing, Structured Interviewing & AI Analytics",
  institution: "Simpatico HR Academy",
  instructor: "Senior Talent Acquisition & Recruitment Leadership Faculty",
  duration: "6 Weeks (36 Hours)",
  format: "3 Hours Live Seminar Instruction + 3 Hours Applied Lab Workshops per week",
  targetAudience: "Recruiters, HR Generalists, Talent Partners, HR Executives, Agency Recruiters & HR Specialists",
  requiredToolkit: [
    "LinkedIn Recruiter & LinkedIn Talent Insights",
    "Google X-Ray Search Operators (Boolean Syntax)",
    "Modern ATS / CRM Sandboxes (Greenhouse / Lever / Simpatico ATS)",
    "Generative AI Recruiting Assistants (Gemini 3.8 / OpenAI)",
    "STAR Behavioral Rubrics & Competency Scorecards"
  ],
  coreObjectives: [
    {
      title: "Strategic Alignment",
      icon: "fa-chess",
      desc: "Partner with hiring managers to execute job analyses, headcount plans, skills gap assessments, and inclusive competency-based job descriptions."
    },
    {
      title: "Pipeline Engineering",
      icon: "fa-filter-circle-dollar",
      desc: "Build multi-channel inbound campaigns and outbound Boolean/X-Ray strings across LinkedIn, GitHub, and niche communities to engage passive talent pools."
    },
    {
      title: "Structured Evaluation",
      icon: "fa-clipboard-check",
      desc: "Design STAR behavioral rubrics, work sample assessments, structured debrief frameworks, and legally compliant bias-mitigated candidate evaluations."
    },
    {
      title: "Data-Driven Closing & Analytics",
      icon: "fa-chart-pie",
      desc: "Structure competitive total reward offers, prevent notice-period drop-off, diagnose pipeline bottlenecks using KPIs, and present executive recruiting reports."
    }
  ],
  architectureStages: [
    { week: 1, title: "Workforce Plan", focus: "Intake & Inclusive Job Descriptions", tag: "Strategy" },
    { week: 2, title: "Employer Brand", focus: "EVP, Personas & Inbound Channels", tag: "Attraction" },
    { week: 3, title: "Talent Sourcing", focus: "Boolean, X-Ray & DEI Outreach", tag: "Sourcing" },
    { week: 4, title: "Assessment", focus: "STAR Rubrics & Bias Mitigation", tag: "Evaluation" },
    { week: 5, title: "Offer & Close", focus: "Comp Structuring & Pre-boarding", tag: "Closing" },
    { week: 6, title: "AI & Analytics", focus: "ATS Stack, KPIs & Funnel ROI", tag: "Technology" }
  ],
  frameworks: [
    {
      id: "google-xray",
      name: "Google X-Ray Search",
      formula: 'site:linkedin.com/in/ ("Product Manager" OR "PM") AND "SaaS" -recruiter',
      purpose: "Uncovering passive candidate profiles outside standard recruiter platform limits."
    },
    {
      id: "github-xray",
      name: "GitHub / Tech X-Ray",
      formula: 'site:github.com "joined on" "Python" "Bangalore"',
      purpose: "Sourcing software engineers and open-source contributors via code repositories."
    },
    {
      id: "phone-screen",
      name: "20-Min Phone Screen Architecture",
      formula: "5m Rapport & Role Context → 10m Core Fit & Motivation → 5m Logistics/CTC",
      purpose: "Rapid qualification of candidate alignment and constraints before hiring manager review."
    },
    {
      id: "star-ratio",
      name: "STAR Competency Probing Ratio",
      formula: "Situation (20%) → Task (15%) → Action (45%) → Result (20%)",
      purpose: "Evidence-based behavioral probing separating personal accountability from team effort."
    }
  ],
  gradingBreakdown: [
    {
      component: "Weekly Practical Assignments",
      weight: "40%",
      desc: "Applied weekly lab deliverables across Weeks 1–5: intake briefs, inclusive JDs, candidate personas, Boolean/X-Ray banks, outreach cadences, and STAR scorecards."
    },
    {
      component: "Final Capstone Strategy Project",
      weight: "30%",
      desc: "End-to-end 50-hire scaling plan evaluated on workforce forecasting accuracy, channel mix, sourcing depth, interview architecture, budget ROI, and KPI dashboarding."
    },
    {
      component: "Live Simulation Role-Plays",
      weight: "20%",
      desc: "Graded practical simulations covering three core conversations: hiring manager intake call, 20-minute candidate screening call, and final salary/counteroffer negotiation."
    },
    {
      component: "Weekly Knowledge Quizzes",
      weight: "10%",
      desc: "Short weekly checks testing mastery of Boolean syntax operators, EEO compliance frameworks, compensation structures, and recruitment analytics formulas."
    }
  ],
  modules: [
    {
      week: 1,
      moduleNumber: 1,
      durationHours: 6,
      titleEn: "Foundations of Talent Acquisition & Workforce Planning",
      titleMl: "ടാലന്റ് അക്വിസിഷൻ അടിസ്ഥാനങ്ങളും മാൻപവർ പ്ലാനിംഗും",
      coreFocus: "TA vs. Recruitment, Job Analysis, Intake Meetings, Skills Gap Analysis, Headcount Forecasting",
      deliverable: "Hiring Manager Intake Brief & Inclusive Competency-Based Job Description",
      subtopics: [
        {
          code: "1.1",
          name: "Recruitment vs. Talent Acquisition",
          desc: "Tactical filling of open requisitions versus long-term strategic talent planning, talent pipelines, and organizational capability building. Transitioning recruiters from ticket-takers to trusted talent advisors."
        },
        {
          code: "1.2",
          name: "The Full Recruitment Lifecycle",
          desc: "Mapping the end-to-end operational journey: Requisition Approval (PR) → Job Analysis → Inbound/Outbound Sourcing → Screening & Assessment → Interviewing → Debrief & Selection → Offer & Negotiation → Pre-boarding & Day-1 Integration."
        },
        {
          code: "1.3",
          name: "Workforce Planning & Forecasting",
          desc: "Conducting organizational skills gap analysis, top-down vs bottom-up headcount planning, attrition forecasting models (voluntary vs involuntary turnover), and internal mobility versus external hiring evaluations."
        },
        {
          code: "1.4",
          name: "Job Analysis & Intake Meetings",
          desc: "Running structured 45-minute kick-off intake meetings with hiring managers. Aligning on non-negotiable must-haves, nice-to-haves, team cultural additions, assessment milestones, SLA timelines, and interview panel assignments."
        },
        {
          code: "1.5",
          name: "Writing Inclusive Job Descriptions",
          desc: "Structuring clear, bias-free internal competency blueprints versus high-converting, candidate-centric job postings. Stripping gendered language ('rockstar', 'aggressive'), defining clear 30-60-90 day performance goals, and including salary transparency."
        }
      ],
      en: `CONCEPT & STRATEGIC FOUNDATIONS:
Talent Acquisition (TA) is fundamentally distinct from reactive recruitment. Tactical recruitment focuses on transactional role-filling when a vacancy occurs. In contrast, Strategic Talent Acquisition aligns organizational hiring with business revenue goals, succession planning, and market talent intelligence.

STEP-BY-STEP WORKFORCE PLANNING WORKFLOW:
1. Business Alignment: Analyze business revenue targets, product roadmaps, and expansion plans for the coming 2-4 quarters.
2. Skills Gap Audit: Survey existing employee skills inventory against upcoming technological and capability needs.
3. Attrition Modeling: Calculate expected annual churn (Historic Churn % x Current Headcount) to plan replacement hiring versus net-new growth hiring.
4. Internal Mobility First: Screen internal talent pools, cross-departmental transfers, and succession benches before committing to external budget.
5. Headcount Budgeting: Factor Total Cost of Workforce (TCOW) — Base salary + Benefits (20-30%) + Sourcing & agency costs + Onboarding overhead.

THE 45-MINUTE HIRING MANAGER INTAKE SESSION:
A failed search almost always stems from a rushed intake meeting. Master the 5-part intake agenda:
- Part 1 (5 mins): Role Context & Strategic Impact (Why does this role exist now? What happens if it remains vacant?).
- Part 2 (15 mins): Competency Profiling (Differentiate 3 Non-Negotiable Hard Skills from 3 Learnable Competencies).
- Part 3 (10 mins): Ideal Candidate Calibration (Review 2-3 real LinkedIn profiles live with the manager to calibrate seniority and background).
- Part 4 (10 mins): Interview Architecture (Designate specific panel members to probe specific competencies — prevent redundant interviews).
- Part 5 (5 mins): SLA & Timeline Commitment (Agree on candidate review SLA: 48 hours for CV feedback, 5 business days for interview debrief).

INCLUSIVE JOB DESCRIPTION ENGINEERING:
Modern JDs must convert passive candidates rather than function as internal compliance laundry lists. Replace requirement checklists with "Performance Outcomes" (e.g., "In your first 90 days, you will architect our event-driven payment microservice"). Use neutral phrasing, eliminate pedigree bias (avoid "Tier-1 engineering college only"), and clearly state remote/hybrid flexibility and compensation brackets.`,
      ml: `ആശയം: താൽക്കാലികമായി ഒരു ജോലിയിലേക്ക് ആളെ എടുക്കുന്ന പരമ്പരാഗത റിക്രൂട്ട്മെന്റിൽ (Tactical Recruitment) നിന്ന് വ്യത്യസ്തമായി, കമ്പനിയുടെ വളർച്ചയ്ക്കും ഭാവി സാങ്കേതിക ലക്ഷ്യങ്ങൾക്കും അനുസൃതമായി മികച്ച പ്രതിഭകളെ മുൻകൂട്ടി കണ്ടെത്തി വളർത്തിയെടുക്കുന്ന തന്ത്രപ്രധാനമായ പ്രക്രിയയാണ് സ്ട്രാറ്റജിക് ടാലന്റ് അക്വിസിഷൻ (Strategic Talent Acquisition).

പ്രധാന ഘട്ടങ്ങൾ:
1. മാൻപവർ പ്ലാനിംഗ് (Workforce Planning): അടുത്ത 6-12 മാസത്തെ ബിസിനസ്സ് ലക്ഷ്യങ്ങൾക്ക് അനുസൃതമായി എത്ര പുതിയ ജീവനക്കാരെ ആവശ്യമുണ്ട്, നിലവിലുള്ള ജീവനക്കാരുടെ കഴിവുകൾ എന്തൊക്കെയാണെന്ന് വിലയിരുത്തുന്നു.
2. അട്രിഷൻ കണക്കുകൂട്ടൽ (Attrition Forecasting): മുൻ വർഷങ്ങളിലെ കണക്കുകൾ അടിസ്ഥാനമാക്കി എത്രപേർ രാജിവെക്കാൻ സാധ്യതയുണ്ടെന്ന് മുൻകൂട്ടി കണ്ട് ബാക്ക്ഫിൽ പ്ലാൻ ചെയ്യുന്നു.
3. ഹൈറിംഗ് മാനേജർ ഇൻടേക്ക് മീറ്റിംഗ് (Intake Meeting): ഒഴിവ് വന്ന തസ്തികയെക്കുറിച്ച് ഡിപ്പാർട്ട്മെന്റ് തലവനുമായി 45 മിനിറ്റ് സമഗ്ര ചർച്ച നടത്തി നിർബന്ധമായും ഉണ്ടായിരിക്കേണ്ട കഴിവുകൾ (Must-Haves) നിശ്ചയിക്കുന്നു.
4. ഇൻക്ലൂസീവ് ജോബ് ഡിസ്ക്രിപ്ഷൻ (Inclusive JD): എല്ലാവരെയും ആകർഷിക്കുന്നതും പക്ഷപാതരഹിതമായതുമായ (Bias-free) പരസ്യങ്ങൾ തയ്യാറാക്കുന്നു. 'റോക്ക്സ്റ്റാർ', 'നിഞ്ച' തുടങ്ങിയ വാക്കുകൾ ഒഴിവാക്കി യഥാർത്ഥ ഉത്തരവാദിത്തങ്ങൾ വ്യക്തമാക്കുന്നു.

ഓർക്കുക: വ്യക്തമായ ഇൻടേക്ക് ബ്രീഫും സന്തുലിതമായ ജെ.ഡിയും ഉണ്ടെങ്കിൽ മാത്രമേ റിക്രൂട്ട്മെന്റ് ചെലവും സമയവും 40% വരെ കുറയ്ക്കാൻ സാധിക്കൂ.`,
      terms: "Talent Acquisition = പ്രതിഭാ ശേഖരണം; Workforce Planning = മനുഷ്യവിഭവശേഷി ആസൂത്രണം; Requisition = റിക്വിസിഷൻ അഥവാ തൊഴിൽ ആവശ്യകത; Skills Gap = പ്രാവീണ്യ വിടവ്; Inclusive JD = പക്ഷപാതരഹിതമായ തൊഴിൽ വിവരണം",
      example: "Case Study: A FinTech startup scaling from 40 to 90 employees in Bangalore. The TA team conducts a skills gap analysis identifying 12 backend Go developers and 4 compliance officers. By running structured intake meetings and rewriting gender-neutral JDs, application-to-interview conversion rises from 8% to 22%, saving ₹14 Lakhs in agency commissions.",
      lab: "Week 1 Applied Lab Deliverable:\n1. Conduct a recorded/live 20-minute mock intake session with a peer acting as Engineering Director.\n2. Fill out the Standardized Hiring Manager Intake Brief Template.\n3. Author a complete 3-section inclusive job posting (Impact & Mission, 30-60-90 Day Deliverables, Non-Negotiable Competencies) for a Senior Full-Stack Engineer.",
      viva: "1. What are the 4 stages of the Talent Acquisition Maturity Model, and how does TA differ from tactical recruiting?\n2. What are the 5 mandatory sections of a hiring manager intake brief?\n3. How do you calculate annual headcount attrition to forecast backfill hiring?\n4. ജോബ് ഡിസ്ക്രിപ്ഷനുകളിൽ അൺകോൺഷ്യസ് ബയാസ് (Unconscious Bias) എങ്ങനെ തിരിച്ചറിഞ്ഞ് ഒഴിവാക്കാം?"
    },
    {
      week: 2,
      moduleNumber: 2,
      durationHours: 6,
      titleEn: "Employer Branding & Recruitment Marketing",
      titleMl: "എംപ്ലോയർ ബ്രാൻഡിംഗും റിക്രൂട്ട്മെന്റ് മാർക്കറ്റിംഗും",
      coreFocus: "EVP, Candidate Personas, Job Ad Optimization, Social Recruiting, Candidate Experience (CX)",
      deliverable: "Target Candidate Persona Profile & 3-Touchpoint Multi-Channel Ad Campaign",
      subtopics: [
        {
          code: "2.1",
          name: "Employee Value Proposition (EVP)",
          desc: "Defining the unique 'give and get' contract: why top-tier talent chooses, stays with, and advocates for your organization. Translating authentic culture into clear recruitment messaging."
        },
        {
          code: "2.2",
          name: "Candidate Personas",
          desc: "Developing detailed semi-fictional profiles of ideal target candidates: career motivators, psychological friction points, tech stack preferences, salary benchmarks, and online watering holes."
        },
        {
          code: "2.3",
          name: "Recruitment Channels & Inbound Funnels",
          desc: "Optimizing the talent channel portfolio: high-converting corporate career portals, major job aggregators (LinkedIn, Indeed, Naukri), specialized niche communities, and structured Employee Referral Programs (ERP)."
        },
        {
          code: "2.4",
          name: "Social Recruiting & Content Marketing",
          desc: "Building an inbound talent magnet through employee advocacy, Glassdoor review reputation management, short-form culture videos, and engineering/culture blogs on LinkedIn and Medium."
        },
        {
          code: "2.5",
          name: "Candidate Experience (CX) Architecture",
          desc: "Designing frictionless, mobile-first application funnels (under 3 minutes), automated transparent communication touchpoints, respectful rejection protocols, and Candidate Net Promoter Score (cNPS) measurement."
        }
      ],
      en: `EMPLOYEE VALUE PROPOSITION (EVP) FRAMEWORK:
An authentic EVP comprises 5 interconnected pillars:
1. Rewards: Base pay, incentives, health benefits, equity/ESOPs, and wealth creation opportunities.
2. Opportunity: Clear promotion pathways, mentorship, skill acquisition, and career mobility.
3. Organization: Market leadership, product impact, ethical mission, and social responsibility.
4. Work: Autonomous problem-solving, modern tech stack, work-life balance, and hybrid flexibility.
5. People: Psychological safety, inspiring leadership, inclusive culture, and transparent peers.

CANDIDATE PERSONA DEVELOPMENT:
Rather than recruiting blindly, top TA teams profile candidate personas before launching campaigns:
- Demographics & Seniority: Years of experience, title variations across competitors.
- Primary Motivators: What makes them consider moving? (e.g., escaping legacy architecture, higher impact, remote autonomy).
- Friction Points: Why would they decline? (e.g., commute, fear of micromanagement, lack of learning budget).
- Watering Holes: Where do they spend professional time? (e.g., GitHub, Reddit r/datascience, specific Discord servers, LinkedIn groups).

CANDIDATE EXPERIENCE (CX) AS A RECRUITING MOAT:
Poor candidate experience directly damages employer brand and consumer revenue. Implement the 4 Golden CX Rules:
- Rule 1: Sub-3 Minute Application (Resume upload + 3 key qualifying questions; eliminate lengthy account creation).
- Rule 2: Instant Status Transparency (Automated tracking portal so candidates see where their application sits).
- Rule 3: 48-Hour Feedback SLA (Never ghost an interviewed candidate; provide actionable competency-based feedback).
- Rule 4: cNPS Auditing (Survey all candidates — both rejected and hired — on a 1-to-10 scale).`,
      ml: `ആശയം: ഒരു കമ്പനിയിലേക്ക് ഏറ്റവും മികച്ച ഉദ്യോഗാർത്ഥികളെ ആകർഷിക്കുന്നതിനുള്ള കാന്തമാണ് എംപ്ലോയർ ബ്രാൻഡിംഗ് (Employer Branding). 'എന്തുകൊണ്ട് ഒരാൾ മറ്റെല്ലാ കമ്പനികളും ഉപേക്ഷിച്ച് നിങ്ങളുടെ സ്ഥാപനത്തിൽ ജോലി ചെയ്യണം?' എന്ന ചോദ്യത്തിനുള്ള ഉത്തരമാണ് എംപ്ലോയി വാല്യു പ്രൊപ്പോസിഷൻ (EVP).

പ്രധാന ആശയങ്ങൾ:
1. EVP-യുടെ 5 തൂണുകൾ: മാന്യമായ പ്രതിഫലം (Rewards), കരിയർ വളർച്ച (Opportunity), കമ്പനിയുടെ പ്രശസ്തിയും ദർശനവും (Organization), മികച്ച ജോലി അന്തരീക്ഷം (Work), സൗഹൃദപരമായ സഹപ്രവർത്തകർ (People).
2. കാൻഡിഡേറ്റ് പേഴ്സണ (Candidate Persona): നമ്മൾ അന്വേഷിക്കുന്ന അനുയോജ്യനായ ഉദ്യോഗാർത്ഥിയുടെ പ്രായം, വിദ്യാഭ്യാസം, താല്പര്യങ്ങൾ, അവർ സമയം ചെലവഴിക്കുന്ന ഓൺലൈൻ പ്ലാറ്റ്‌ഫോമുകൾ എന്നിവ മുൻകൂട്ടി രേഖപ്പെടുത്തുന്നു.
3. കാൻഡിഡേറ്റ് എക്സ്പീരിയൻസ് (CX): അപേക്ഷ സമർപ്പിക്കുന്നത് മുതൽ ഇന്റർവ്യൂ ഫലം അറിയിക്കുന്നത് വരെയുള്ള ഓരോ ഘട്ടത്തിലും ഉദ്യോഗാർത്ഥിയോട് ബഹുമാനത്തോടെയും സുതാര്യമായും പെരുമാറുക. നിരസിക്കപ്പെട്ട ഉദ്യോഗാർത്ഥികൾക്കും കൃത്യമായ ഫീഡ്ബാക്ക് നൽകുക.`,
      terms: "EVP = എംപ്ലോയി വാല്യു പ്രൊപ്പോസിഷൻ; Candidate Persona = ഉദ്യോഗാർത്ഥി വ്യക്തിത്വം; CX = ഉദ്യോഗാർത്ഥി അനുഭവം; cNPS = കാൻഡിഡേറ്റ് പ്രൊമോട്ടർ സ്കോർ; Inbound Recruiting = ഇൻബൗണ്ട് റിക്രൂട്ടിംഗ്",
      example: "Case Study: An enterprise logistics software company facing high engineer drop-off revamped their Glassdoor profile (improving from 3.2★ to 4.4★ through proactive employee spotlight stories). They introduced a 2-click mobile application, resulting in an 85% drop in application abandonment and a 42% surge in organic inbound candidate flow.",
      lab: "Week 2 Applied Lab Deliverable:\n1. Build an in-depth Candidate Persona Canvas for an 'Engineering Manager — Cloud Infrastructure'.\n2. Draft a 3-touchpoint recruitment marketing campaign:\n   - Touchpoint A: LinkedIn Carousel / Short-form story highlighting tech culture.\n   - Touchpoint B: Targeted outbound Inbound Ad Copy emphasizing learning & autonomy.\n   - Touchpoint C: Rejection email template optimized for high cNPS and future talent pool nurturing.",
      viva: "1. Detail the 5 core pillars of a sustainable Employee Value Proposition (EVP).\n2. How does a negative Glassdoor reputation impact cost-per-hire and offer acceptance rates?\n3. ഉദ്യോഗാർത്ഥി അപേക്ഷാ ഫോം പൂരിപ്പിക്കുമ്പോൾ കൊഴിഞ്ഞുപോക്ക് (Drop-off) കുറയ്ക്കാൻ എന്ത് മാറ്റങ്ങളാണ് വരുത്തേണ്ടത്?\n4. What is Candidate Net Promoter Score (cNPS) and what questions are used to calculate it?"
    },
    {
      week: 3,
      moduleNumber: 3,
      durationHours: 6,
      titleEn: "Advanced Sourcing Strategies & Talent Pipelining",
      titleMl: "അഡ്വാൻസ്ഡ് സോഴ്സിംഗ് സ്ട്രാറ്റജികളും ടാലന്റ് പൈപ്പ്‌ലൈനിംഗും",
      coreFocus: "Boolean Logic, Google X-Ray Search, Passive Outreach, LinkedIn Recruiter, DEI Sourcing",
      deliverable: "Boolean Search String Bank (5 Strings) & 3-Step Cold Outreach Sequence",
      subtopics: [
        {
          code: "3.1",
          name: "Active vs. Passive Talent Dynamics",
          desc: "Understanding the 70/30 talent split: engaging the 70% passive market who are not actively searching job boards. Psychology of career transitions and passive outreach timing."
        },
        {
          code: "3.2",
          name: "Boolean Logic & Google X-Ray Search",
          desc: "Mastering search syntax: AND, OR, NOT, parentheses (), quotation marks '', site:, inurl:, intitle:, filetype:. Bypassing commercial LinkedIn search limitations via Google X-Ray."
        },
        {
          code: "3.3",
          name: "LinkedIn Recruiter Platform Mastery",
          desc: "Advanced search spotlight filters (Open to Work, Rediscover candidates, Company alumni), boolean keyword clusters, exclusion strings, and building organized talent projects."
        },
        {
          code: "3.4",
          name: "High-Converting Cold Outreach Cadences",
          desc: "Writing personalized cold InMails/emails that achieve 40%+ response rates. Crafting subject lines (<7 words), compelling hooks, value propositions, and low-friction call-to-actions."
        },
        {
          code: "3.5",
          name: "Diversity, Equity, and Inclusion (DEI) Sourcing",
          desc: "Architecting diverse talent pipelines, sourcing from minority professional communities and women-in-tech organizations, and mitigating unconscious pedigree bias during top-of-funnel discovery."
        }
      ],
      en: `THE 70/30 TALENT PARADOX:
Only 30% of global professionals are actively looking at job boards at any time, yet 85% of recruiting budgets are spent posting job ads. The remaining 70% are passive candidates who require targeted headhunting and psychological trigger outreach.

BOOLEAN LOGIC & X-RAY MASTERY:
Boolean search is mathematical set theory applied to candidate databases and search engines:
- AND: Narrows search (requires all terms to be present).
- OR: Expands search (matches synonyms and variations).
- NOT / -: Excludes false positives (e.g., -recruiter -consultant).
- Quotations "": Locks exact phrases (e.g., "Product Manager").
- Parentheses (): Groups logic clauses: ("Node.js" OR "NodeJS") AND ("Microservices" OR "Kafka").

CORE X-RAY SYNTAX STRINGS:
1. LinkedIn Google X-Ray for SaaS Product Managers:
   site:linkedin.com/in/ ("Product Manager" OR "PM") AND ("SaaS" OR "B2B") AND ("Bangalore" OR "Bengaluru") -recruiter -hiring
2. Tech Repository GitHub X-Ray for Python Engineers:
   site:github.com "joined on" "Python" "Bangalore" "contributions"
3. Resume / CV Web Scraping Search:
   (intitle:resume OR intitle:cv) ("Talent Acquisition" OR "Technical Recruiter") ("Dubai" OR "UAE") -job -jobs -sample -template

HIGH-CONVERTING COLD OUTREACH ARCHITECTURE:
Cold emails fail when they read like generic spam. Structure every outreach using the 4-part formula:
- Subject Line: Curiosity or specific accomplishment (<7 words, e.g., "Your distributed systems talk at PyCon").
- Personalized Hook: Demonstrate you spent 2 minutes reading their profile/code (reference a recent project or blog).
- Value Proposition: Frame what's in it for THEM (e.g., owning the greenfield architecture, 40% equity upside), not what the company needs.
- Low-Friction Call-to-Action (CTA): Don't ask for a resume or 45-minute interview. Ask: "Open to an informal 10-minute coffee chat this Thursday?"`,
      ml: `ആശയം: ഏറ്റവും കഴിവുള്ള 70% ജീവനക്കാരും പുതിയ ജോലി അന്വേഷിക്കുന്നവരല്ല (Passive Candidates). അവരെ കണ്ടെത്താൻ പത്രപരസ്യങ്ങളോ ജോബ് പോർട്ടലുകളോ മതിയാകില്ല; പകരം ഗൂഗിൾ എക്സ്-റേ (Google X-Ray), ബൂളിയൻ സെർച്ച് (Boolean Search) എന്നീ ശാസ്ത്രീയ സാങ്കേതിക വിദ്യകൾ ഉപയോഗിച്ച് ഹെഡ്‌ഹണ്ടിംഗ് നടത്തണം.

പ്രധാന ബൂളിയൻ സൂത്രവാക്യങ്ങൾ:
1. AND: രണ്ട് കാര്യങ്ങളും ഒരേസമയം പ്രൊഫൈലിൽ വേണം (ഉദാ: "Python" AND "Django").
2. OR: ഇതിൽ ഏതെങ്കിലും ഒന്ന് ഉണ്ടെങ്കിൽ മതി (ഉദാ: "HR Manager" OR "Talent Acquisition Manager").
3. NOT / -: ആവശ്യമില്ലാത്തവരെ ഒഴിവാക്കാൻ (ഉദാ: -intern -trainee).
4. ബ്രാക്കറ്റ് (): ഒരേപോലെയുള്ള പദങ്ങളെ ഒന്നിച്ച് ചേർക്കാൻ: ("Kochi" OR "Ernakulam").

ഗൂഗിൾ എക്സ്-റേ മാതൃക:
site:linkedin.com/in/ ("HRBP" OR "Talent Acquisition") AND ("Kerala" OR "Cochin") -recruiter

കോൾഡ് മെസ്സേജിംഗ് (Cold Outreach):
ഉദ്യോഗാർത്ഥിക്ക് മെസ്സേജ് അയക്കുമ്പോൾ ആദ്യ വാചകത്തിൽ തന്നെ അവരുടെ നേട്ടങ്ങളെ അഭിനന്ദിക്കുകയും, കമ്പനി അവർക്ക് നൽകുന്ന മികച്ച അവസരത്തെക്കുറിച്ച് ചുരുക്കി പറയുകയും ചെയ്യുക. തുടക്കത്തിൽ തന്നെ സി.വി ആവശ്യപ്പെടാതെ 10 മിനിറ്റ് സൗഹൃദ സംഭാഷണത്തിന് ക്ഷണിക്കുക.`,
      terms: "Boolean Logic = ബൂളിയൻ ലോജിക്; Google X-Ray = ഗൂഗിൾ എക്സ്-റേ സെർച്ച്; Passive Talent = അൺ-ആക്റ്റീവ് ഉദ്യോഗാർത്ഥി; InMail = ലിങ്ക്ഡ്ഇൻ ഡയറക്ട് മെസ്സേജ്; DEI Sourcing = വൈവിധ്യപൂർണ്ണ റിക്രൂട്ട്മെന്റ്",
      example: "Case Study: Sourcing a Lead DevOps Engineer in the UAE. Standard LinkedIn job ads yielded 400 unqualified applicants. Using the Boolean X-Ray string: site:linkedin.com/in/ (\"DevOps\" OR \"SRE\") AND (\"Terraform\" OR \"Kubernetes\") AND (\"Dubai\" OR \"Abu Dhabi\") -recruiter, the recruiter mapped 45 qualified passive leads. A 3-step personalized outreach sequence achieved a 58% response rate, closing the hire in 18 days.",
      lab: "Week 3 Applied Lab Deliverable:\n1. Construct 5 complex, error-free Boolean/X-Ray strings:\n   - 2 Tech strings (GitHub & LinkedIn).\n   - 2 Business/Executive strings (Product & Finance).\n   - 1 Resume scraping string.\n2. Write a 3-touchpoint cold outreach cadence (Touch 1: Personalized Hook; Touch 2: Value Proof; Touch 3: Polite Break-up).",
      viva: "1. Explain the order of operations for Boolean logic (AND, OR, NOT, Parentheses).\n2. Write a Google X-Ray query to uncover LinkedIn profiles of Data Scientists in Dubai with AWS experience, excluding recruiters.\n3. ലിങ്ക്ഡ്ഇനിൽ ഇൻമെയിൽ അയക്കുമ്പോൾ ഉയർന്ന റെസ്പോൺസ് റേറ്റ് (Response Rate) ലഭിക്കാൻ പാലിക്കേണ്ട 3 നിയമങ്ങൾ ഏവ?\n4. What strategies would you use to proactively build a diverse candidate pipeline for engineering roles?"
    },
    {
      week: 4,
      moduleNumber: 4,
      durationHours: 6,
      titleEn: "Screening, Structured Interviewing & Candidate Assessment",
      titleMl: "സി.വി സ്ക്രീനിംഗും സ്ട്രക്ചേർഡ് ഇന്റർവ്യൂവും അസസ്സ്‌മെന്റും",
      coreFocus: "Resume Screening, 20-Min Phone Screen, STAR Behavioral Method, Psychometrics, Bias Mitigation",
      deliverable: "Standardized Structured Interview Guide & 1-to-5 Anchored Rubric",
      subtopics: [
        {
          code: "4.1",
          name: "Resume Screening & Red Flags",
          desc: "Rapid resume evaluation against role competencies and career trajectory. Eliminating pedigree and formatting bias while identifying quantifiable impact metrics, tenure stability, and relevant skill application."
        },
        {
          code: "4.2",
          name: "The Structured 20-Minute Phone Screen",
          desc: "Conducting high-impact initial screening calls: 5m Rapport & Role Context → 10m Core Competency & Motivation → 5m Logistics, Notice Period, Current vs Expected CTC."
        },
        {
          code: "4.3",
          name: "Behavioral & Competency-Based Interviewing",
          desc: "Mastering the STAR method: Situation (20%), Task (15%), Action (45%), Result (20%). Probing deep into personal contribution versus team involvement to verify authentic capability."
        },
        {
          code: "4.4",
          name: "Technical & Psychometric Assessments",
          desc: "Selecting valid, predictive work-sample tests, case study challenges, and psychometric profiles. Balancing predictive validity with candidate assessment drop-off."
        },
        {
          code: "4.5",
          name: "Unconscious Bias & Legal Compliance",
          desc: "Mitigating cognitive evaluation biases (Halo/Horn effect, Affinity bias, Confirmation bias). Enforcing objective 1-to-5 scoring rubrics and adhering to Equal Employment Opportunity (EEO) guidelines."
        }
      ],
      en: `THE SCIENCE OF STRUCTURED INTERVIEWS:
Unstructured, conversational interviews have a predictive validity of just 0.14 (barely better than a coin toss). In contrast, Structured Competency-Based Interviews reach a predictive validity of 0.58. Every candidate must be asked the same competency questions evaluated against the same rubric.

THE 20-MINUTE RECRUITER SCREENING CALL BLUEPRINT:
- Minute 0–5 (Rapport & Context): Set an upbeat, professional tone, outline call structure, and deliver a compelling 60-second role pitch.
- Minute 5–15 (Competency & Career Trajectory): Probe motivations for leaving, evaluate 2 core competencies, and verify hands-on execution.
- Minute 15–20 (Logistics & Constraints): Validate notice period (negotiable vs non-negotiable), buyout options, work authorization, location/commute, and compensation alignment (Current CTC, Fixed vs Variable split, Expected CTC).

THE STAR COMPETENCY PROBING RATIO:
When evaluating behavioral answers, apply the 20-15-45-20 percentage rule:
- Situation (20%): Context and background of the challenge.
- Task (15%): The specific challenge and candidate's required deliverable.
- Action (45%): THE MOST CRITICAL PART. What did the candidate specifically decide, code, build, or negotiate? Beware of "We did" statements — steer them back with: "What was YOUR direct individual role?"
- Result (20%): Quantifiable business metrics (e.g., reduced latency by 32%, generated AED 400,000 in savings, reduced attrition by 15%).

MITIGATING UNCONSCIOUS BIAS:
- Halo Effect: Letting one strong trait (e.g., prestigious university degree) artificially inflate the entire evaluation.
- Horn Effect: Allowing an irrelevant annoyance (e.g., minor typo or introversion) to discard a high-performing candidate.
- Anchored 1-to-5 Scoring Rubrics: 1 = Far Below Standard (Unqualified); 2 = Below Standard; 3 = Meets Competency Standard; 4 = Exceeds Standard; 5 = World-Class Subject Matter Expert.`,
      ml: `ആശയം: മനസ്സിന്റെ തോന്നലുകൾക്ക് (Gut Feeling) അനുസരിച്ച് ഇന്റർവ്യൂ നടത്തുന്നത് വലിയ പരാജയങ്ങൾക്ക് കാരണമാകും. അതിനാൽ എല്ലാ ഉദ്യോഗാർത്ഥികളോടും ഒരേ ചോദ്യങ്ങൾ ചോദിക്കുകയും, അവരുടെ പ്രകടനത്തെ നിശ്ചിത സ്കോർകാർഡ് അടിസ്ഥാനമാക്കി മാർക്കിടുകയും ചെയ്യുന്ന രീതിയാണ് സ്ട്രക്ചേർഡ് ഇന്റർവ്യൂ (Structured Interview).

20 മിനിറ്റ് സ്ക്രീനിംഗ് കോൾ ഘടന:
- 0-5 മിനിറ്റ്: ഉദ്യോഗാർത്ഥിയെ സ്വാഗതം ചെയ്യുക, ജോലിയുടെ പ്രാധാന്യം വിശദീകരിക്കുക.
- 5-15 മിനിറ്റ്: പ്രധാന കഴിവുകൾ, മുൻകാല പ്രൊജക്റ്റുകൾ, ജോലി മാറാനുള്ള കാരണം എന്നിവ ചോദിച്ചറിയുക.
- 15-20 മിനിറ്റ്: നോട്ടീസ് പിരീഡ്, നിലവിലെ ശമ്പളം (Current CTC), പ്രതീക്ഷിക്കുന്ന ശമ്പളം (Expected CTC), ലൊക്കേഷൻ താല്പര്യം എന്നിവ ഉറപ്പുവരുത്തുക.

സ്റ്റാർ (STAR) രീതി:
- Situation (20%): നേരിട്ട സാഹചര്യം.
- Task (15%): നിർവഹിക്കേണ്ടിയിരുന്ന ചുമതല.
- Action (45%): ഉദ്യോഗാർത്ഥി നേരിട്ട് ചെയ്ത പ്രവർത്തികൾ (ഇതാണ് ഏറ്റവും പ്രധാനം).
- Result (20%): ലഭിച്ച അളക്കാവുന്ന വിജയം (Numbers/Metrics).

ഓർക്കുക: 'ഞങ്ങൾ ചെയ്തു' എന്ന് പറയുമ്പോൾ 'നിങ്ങൾ വ്യക്തിപരമായി എന്താണ് ചെയ്തത്?' എന്ന് ചോദിക്കാൻ മടിക്കരുത്.`,
      terms: "STAR Method = സ്റ്റാർ ഇന്റർവ്യൂ രീതി; Structured Interview = സ്ട്രക്ചേർഡ് ഇന്റർവ്യൂ; Scorecard = സ്കോർകാർഡ്; Halo Effect = ഹാലോ ഇഫക്റ്റ്; Notice Period = നോട്ടീസ് കാലാവധി",
      example: "Case Study: An IT consultancy replaced casual hiring manager chats with standardized 5-question STAR scorecards with anchored rubrics. Panel disagreement decreased from 68% to 14%, new-hire 90-day regret rate fell from 24% to 4%, and offer-to-join ratio climbed by 19%.",
      lab: "Week 4 Applied Lab Deliverable:\n1. Create a Standardized Structured Interview Scorecard for a 'Senior Product Operations Manager'.\n2. Design 6 behavioral STAR questions targeting:\n   - 2 Strategic Problem Solving questions.\n   - 2 Stakeholder Conflict Resolution questions.\n   - 2 Data-Driven Decision Making questions.\n3. Build an anchored 1-to-5 scoring rubric with explicit behavioral indicators for each rating level.",
      viva: "1. Explain the difference in predictive validity between unstructured conversations and structured competency interviews.\n2. In the STAR method, why must the recruiter insist that the 'Action' component comprise 45% of the candidate's answer?\n3. ഇന്റർവ്യൂവിൽ നിയമപരമായി ചോദിക്കാൻ പാടില്ലാത്ത 4 ചോദ്യങ്ങൾ ഏവ (വിവാഹം, കുടുംബം, പ്രായം etc.)?\n4. How do you recognize and counter the Halo and Horn effects during interview debriefs?"
    },
    {
      week: 5,
      moduleNumber: 5,
      durationHours: 6,
      titleEn: "Offer Management, Negotiation & Onboarding",
      titleMl: "ഓഫർ മാനേജ്‌മെന്റ്, ശമ്പള ചർച്ചകളും പ്രീ-ബോർഡിംഗും",
      coreFocus: "Debrief Consensus, Background Verification, Compensation Benchmarking, Offer Negotiation, Pre-boarding",
      deliverable: "Mock Executive Offer Letter & 30-60-90 Day Pre-boarding Plan",
      subtopics: [
        {
          code: "5.1",
          name: "Debrief Sessions & Consensus Building",
          desc: "Facilitating structured, evidence-based post-interview debrief meetings with hiring managers and panels. Calibrating scorecards to eliminate biased hiring vetos and reach definitive consensus."
        },
        {
          code: "5.2",
          name: "Reference & Background Checks (BGV)",
          desc: "Conducting compliant, high-yield professional reference checks (former managers, peers, direct reports) and orchestrating third-party background verification (education, criminal, employment history)."
        },
        {
          code: "5.3",
          name: "Compensation Benchmarking & Offer Structuring",
          desc: "Balancing base fixed salary, variable performance incentives, equity/ESOP vesting, sign-on bonuses, relocation allowances, and internal salary band parity."
        },
        {
          code: "5.4",
          name: "Offer Negotiation & Closing Strategies",
          desc: "Navigating counteroffers from existing employers, discovering underlying candidate hesitations, conducting closing pre-closes, and achieving an 85%+ Offer Acceptance Rate (OAR)."
        },
        {
          code: "5.5",
          name: "Pre-boarding & 30-60-90 Day Retention",
          desc: "Preventing candidate ghosting during 30 to 90-day notice periods. Implementing weekly engagement touchpoints, team welcome rituals, day-1 preparedness, and 30-60-90 day performance integration roadmaps."
        }
      ],
      en: `OFFER NEGOTIATION & THE PRE-CLOSE TECHNIQUE:
Never extend a formal written offer letter without first executing a verbal "Pre-Close". Once an offer is printed, the recruiter loses leverage. Execute the Pre-Close Script:
"Faisal, the team was thoroughly impressed with your system design presentation. Before I submit the formal compensation proposal to our CFO, I want to confirm our alignment. If we present a base of ₹28 Lakhs with a ₹3 Lakh joining incentive and hybrid flexibility, are you in a position to sign and accept today?"
If the candidate hesitates, uncover the real objection before writing the document.

NEUTRALIZING THE COUNTEROFFER THREAT:
50-60% of candidates who resign receive a counteroffer from their current employer. In competitive tech markets, 80% of counteroffered candidates leave within 6 months anyway because the underlying cultural issues remain unresolved.
Prepare the candidate early:
1. Normalize: "When you resign, your manager will likely be surprised and offer you immediate promotions or money to stay."
2. Reality Check: "Why did it take your resignation for them to recognize your real market value?"
3. Relationship Preservation: Provide scripts on how to tender resignation professionally without burning bridges.

PRE-BOARDING: ELIMINATING THE NOTICE-PERIOD BLACK HOLE:
The period between offer acceptance and Day 1 is the highest-risk phase of recruitment. In regions with 60-90 day notice periods, drop-off rates can exceed 30%.
Implement the Pre-Boarding Cadence:
- Day 1-3: Formal Offer Signed + Welcome video from VP/Founders.
- Day 7: Tech hardware selection & welcome merchandise delivery to home.
- Day 14: Informal coffee chat or virtual lunch with the peer team.
- Day 30: Mid-notice check-in (Verify resignation acceptance letter has been received).
- Day 45: Invitation to company town hall or learning webinar.
- Day 7 Days before Join: Day-1 agenda, buddy assignment, and arrival logistics confirmed.`,
      ml: `ആശയം: ഓഫർ ലെറ്റർ അയച്ചതുകൊണ്ട് മാത്രം ഒരു റിക്രൂട്ട്മെന്റും പൂർത്തിയാകുന്നില്ല. ഉദ്യോഗാർത്ഥി ജോലിയിൽ പ്രവേശിക്കുന്നത് (Day 1 Joining) വരെ നടക്കുന്ന നിർണായക പ്രവർത്തനങ്ങളാണ് ഓഫർ മാനേജ്‌മെന്റും പ്രീ-ബോർഡിംഗും (Pre-boarding).

പ്രധാന ഘട്ടങ്ങൾ:
1. പ്രീ-ക്ലോസ് (Pre-Close): ഓഫർ ലെറ്റർ അയക്കുന്നതിന് മുൻപ് തന്നെ ഫോണിൽ വിളിച്ച് ശമ്പളവും ആനുകൂല്യങ്ങളും കൃത്യമായി പറഞ്ഞ് ഉദ്യോഗാർത്ഥിയുടെ പൂർണ്ണ സമ്മതം വാങ്ങിയിരിക്കണം.
2. കൗണ്ടർ ഓഫർ പ്രതിരോധം (Counteroffer Defense): നിലവിലെ കമ്പനി കൂടുതൽ ശമ്പളം വാഗ്ദാനം ചെയ്ത് പിടിച്ചുനിർത്താൻ ശ്രമിക്കുമെന്ന് മുൻകൂട്ടി കണ്ട് ഉദ്യോഗാർത്ഥിയെ മാനസികമായി തയ്യാറാക്കുക.
3. പ്രീ-ബോർഡിംഗ് (Pre-boarding): 1 മുതൽ 3 മാസം വരെയുള്ള നോട്ടീസ് പിരീഡിൽ ഉദ്യോഗാർത്ഥി ജോലിയിൽ ചേരാതിരിക്കുന്ന (Ghosting) സാഹചര്യം ഒഴിവാക്കാൻ ആഴ്ചതോറും അവരുമായി ബന്ധപ്പെടുക. കമ്പനി ലാപ്ടോപ്പ് സെലക്ഷൻ, ടീം മീറ്റിംഗുകൾ, വെൽകം കിറ്റ് എന്നിവ മുൻകൂട്ടി നൽകുക.
4. 30-60-90 ദിവസത്തെ പ്ലാൻ: ജോലിയിൽ പ്രവേശിച്ച ശേഷം ആദ്യ 30, 60, 90 ദിവസങ്ങളിൽ അവർ ചെയ്തു തീർക്കേണ്ട കാര്യങ്ങളെക്കുറിച്ച് കൃത്യമായ രൂപരേഖ നൽകുക.`,
      terms: "Pre-Close = ഓഫറിന് മുൻപുള്ള ധാരണ; Counteroffer = നിലവിലെ കമ്പനിയുടെ ഓഫർ; Pre-boarding = ജോലിയിൽ പ്രവേശിക്കുന്നതിന് മുൻപുള്ള ഘട്ടം; Ghosting = അറിയിപ്പില്ലാതെ പിന്മാറൽ; 30-60-90 Day Plan = മൂന്ന് മാസത്തെ കർമ്മപദ്ധതി",
      example: "Case Study: A healthcare enterprise in Kochi reduced notice-period ghosting from 34% to 6% by instituting a mandatory 'Buddy Program', dispatching welcome gift packages on Day 10 of notice period, and having the department director host a bi-weekly 15-minute catch-up call.",
      lab: "Week 5 Applied Lab Deliverable:\n1. Conduct a live role-play salary negotiation handling an assertive candidate seeking a 40% hike with a counteroffer in hand.\n2. Author a formal Executive Total Rewards Offer Breakdown Letter.\n3. Design an interactive 30-60-90 Day Pre-boarding & Integration Schedule for a Senior Engineering recruit.",
      viva: "1. Why is a verbal 'Pre-Close' critical before generating a formal offer letter?\n2. What strategic questions should you ask a candidate during notice period to detect counteroffer risks early?\n3. നോട്ടീസ് പിരീഡിൽ ഉദ്യോഗാർത്ഥികൾ മറ്റ് ഓഫറുകൾ സ്വീകരിച്ച് പിന്മാറുന്നത് തടയാൻ സ്വീകരിക്കാവുന്ന 4 മുൻകരുതലുകൾ ഏവ?\n4. What metrics define healthy Offer Acceptance Rate (OAR) and Joiner Ratio benchmarks?"
    },
    {
      week: 6,
      moduleNumber: 6,
      durationHours: 6,
      titleEn: "Recruitment Technology, AI & Talent Analytics",
      titleMl: "റിക്രൂട്ട്മെന്റ് ടെക്നോളജി, ആർട്ടിഫിഷ്യൽ ഇന്റലിജൻസും പീപ്പിൾ അനലിറ്റിക്സും",
      coreFocus: "ATS Stack, Generative AI Recruiting, Recruitment KPIs, Executive Funnel Dashboards, Capstone Project",
      deliverable: "Full-Cycle Recruitment Strategy Capstone (50-Hire Scaling Plan)",
      subtopics: [
        {
          code: "6.1",
          name: "The Modern Recruiter Tech Stack",
          desc: "Architecting and integrating Applicant Tracking Systems (ATS), Candidate Relationship Management (CRM) engines, automated scheduling tools, and asynchronous video assessment platforms."
        },
        {
          code: "6.2",
          name: "AI in Recruitment Operations",
          desc: "Deploying Generative AI for customized JD creation, boolean query synthesis, cold email hyper-personalization, interview transcription, and candidate scoring while enforcing ethical AI and privacy compliance."
        },
        {
          code: "6.3",
          name: "Core Recruitment Metrics & KPIs",
          desc: "Mastering recruitment mathematics: Time-to-Fill vs Time-to-Hire, Cost-per-Hire formulas, Source of Hire yield, stage Pass-Through Conversion Rates, Offer Acceptance Rate, and 90-Day Quality of Hire."
        },
        {
          code: "6.4",
          name: "Executive Reporting & Funnel Diagnostics",
          desc: "Building real-time talent acquisition dashboards for the C-Suite. Diagnosing pipeline bottlenecks, modeling headcount forecasts, and demonstrating the business ROI of strategic recruiting."
        }
      ],
      en: `THE RECRUITMENT TECH STACK ARCHITECTURE:
A high-velocity TA engine operates across 4 software tiers:
1. Discovery Tier: LinkedIn Recruiter, GitHub, Google X-Ray, aggregators.
2. Engagement / CRM Tier: Candidate email drip campaigns, talent pool rediscovery, campus nurture lists.
3. Workflow / ATS Tier: Requisition approvals, resume parsing, interview scheduling, scorecard collection, offer workflows.
4. Intelligence & Evaluation Tier: Generative AI co-pilots, voice screening, structured rubrics, and BI analytics dashboards.

CORE RECRUITMENT MATHEMATICS & FORMULAS:
1. Time-to-Fill:
   Total Days from Requisition Approval Date to Offer Acceptance Date. (Healthy benchmark: 30–45 days).
2. Time-to-Hire:
   Total Days from Candidate First Contact/Application to Offer Acceptance Date. (Measures candidate velocity; healthy benchmark: 18–25 days).
3. Cost-per-Hire (CPH):
   CPH = [Total Internal Recruiting Costs (TA team salaries, referral bonuses) + Total External Costs (Job boards, ATS software, agency fees, advertising)] ÷ Total Number of Hires.
4. Pass-Through Conversion Rate:
   Measures candidate survival through funnel stages (e.g., CV Screen to HM Interview: Target 30-40%; HM Interview to Final: Target 40-50%; Offer to Acceptance: Target 85%+).

CAPSTONE STRATEGY PROJECT SPECIFICATIONS:
Design a comprehensive 6-month talent acquisition blueprint for a fast-scaling tech enterprise growing from 50 to 100 employees (50 net-new hires across Engineering, Sales, Product, and Support). The capstone must deliver:
- Workforce & Headcount Forecasting Model.
- Recruitment Budget Allocation & Projected Cost-per-Hire.
- Sourcing & Channel Mix Architecture.
- Standardized 4-Stage Interview & Competency Rubrics.
- Executive Talent Dashboard featuring Speed, Cost, and Quality KPIs.`,
      ml: `ആശയം: ആധുനിക എച്ച്.ആർ പ്രൊഫഷണലുകൾ ഡാറ്റയും ആർട്ടിഫിഷ്യൽ ഇന്റലിജൻസും (AI) ഉപയോഗിച്ച് കൃത്യമായ തീരുമാനങ്ങൾ എടുക്കുന്നവരായിരിക്കണം. ആപ്ലിക്കന്റ് ട്രാക്കിംഗ് സിസ്റ്റം (ATS), ജനറേറ്റീവ് എ.ഐ, കെ.പി.ഐ ഡാഷ്‌ബോർഡുകൾ എന്നിവ പ്രയോജനപ്പെടുത്തി റിക്രൂട്ട്മെന്റ് പൂർണ്ണമായും ഡിജിറ്റലൈസ് ചെയ്യുന്നു.

പ്രധാന റിക്രൂട്ട്മെന്റ് ഫോർമുലകൾ:
1. ടൈം ടു ഫിൽ (Time-to-Fill): ഒരു ജോലിക്ക് അനുമതി ലഭിച്ചത് മുതൽ ഉദ്യോഗാർത്ഥി ഓഫർ സ്വീകരിക്കുന്നത് വരെയുള്ള ദിവസങ്ങൾ.
2. ടൈം ടു ഹയർ (Time-to-Hire): ഉദ്യോഗാർത്ഥി അപേക്ഷിച്ചത് മുതൽ ഓഫർ സ്വീകരിക്കുന്നത് വരെയുള്ള ദിവസങ്ങൾ.
3. കോസ്റ്റ് പെർ ഹയർ (Cost-per-Hire):
   ഒരു നിയമനത്തിനുള്ള ചെലവ് = (ആകെ ആഭ്യന്തര ചെലവുകൾ + ബാഹ്യ ചെലവുകൾ) ÷ ആകെ നടത്തിയ നിയമനങ്ങൾ.
4. ഓഫർ അക്സപ്റ്റൻസ് റേറ്റ് (OAR):
   (സ്വീകരിച്ച ഓഫറുകൾ ÷ നൽകിയ ആകെ ഓഫറുകൾ) x 100. (85%-ൽ കൂടുതൽ ഉണ്ടായിരിക്കണം).

ക്യാപ്സ്റ്റോൺ പ്രൊജക്റ്റ് (Capstone Project):
ഒരു സ്ഥാപനത്തിൽ അടുത്ത 6 മാസത്തിനുള്ളിൽ 50 പുതിയ ജീവനക്കാരെ നിയമിക്കുന്നതിനുള്ള സമ്പൂർണ്ണ ടാലന്റ് അക്വിസിഷൻ സ്ട്രാറ്റജി പ്ലാൻ തയ്യാറാക്കുക. ബഡ്ജറ്റ്, ചാനൽ മിക്സ്, ഇന്റർവ്യൂ സ്കോർകാർഡുകൾ, കെ.പി.ഐ ഡാഷ്‌ബോർഡ് എന്നിവ ഇതിൽ ഉൾപ്പെടുത്തണം.`,
      terms: "Time-to-Fill = നിയമന കാലാവധി; Cost-per-Hire = ഒരു നിയമനത്തിനുള്ള ചെലവ്; ATS = അപേക്ഷക ട്രാക്കിംഗ് സോഫ്റ്റ്‌വെയർ; Pass-Through Rate = ഘട്ടം തിരിച്ചുള്ള വിജയനിരക്ക്; Quality of Hire = നിയമന ഗുണനിലവാരം",
      example: "Case Study: By analyzing recruitment funnel metrics, a mid-size enterprise noticed a bottleneck where 82% of candidates were failing the second-round technical interview. By conducting a recalibration workshop with the engineering panel and introducing a standardized work-sample assessment, pass-through rate normalized to 45%, reducing overall time-to-fill by 14 days and saving $45,000 in agency spend.",
      lab: "Week 6 Capstone Project Deliverable:\n1. Construct the complete 50-Hire Scaling Blueprint in Excel/Document format.\n2. Detail the recruitment channel budget breakdown (LinkedIn, Referral bonuses, Job boards, AI tools).\n3. Map the end-to-end stage conversion funnel with target drop-off thresholds.\n4. Design the C-Suite executive reporting dashboard summarizing Time-to-Fill, Cost-per-Hire, and Quality-of-Hire metrics.",
      viva: "1. What is the fundamental difference between Time-to-Fill and Time-to-Hire, and what does a high discrepancy indicate?\n2. Calculate the Cost-per-Hire if internal recruiter costs are ₹12 Lakhs, external boards/tools are ₹8 Lakhs, and 40 hires were made.\n3. എ.ഐ ടൂളുകൾ ഉപയോഗിച്ച് റിക്രൂട്ട്മെന്റ് ചെയ്യുമ്പോൾ ശ്രദ്ധിക്കേണ്ട പ്രധാന നിയമപരമായ കാര്യങ്ങൾ എന്തൊക്കെയാണ്?\n4. What are the key metrics that indicate a healthy 90-day Quality-of-Hire (QoH)?"
    }
  ]
};

// Normalize module properties for seamless backwards and forwards cross-compatibility
HR_TA_601_COURSE.modules.forEach(function(mod) {
  if (!mod.title) mod.title = mod.titleEn;
  if (!mod.lectureNotesEn) mod.lectureNotesEn = mod.en;
  if (!mod.lectureNotesMl) mod.lectureNotesMl = mod.ml;
  if (!mod.labAssignment) mod.labAssignment = mod.lab;
  if (!mod.practicalLabGuide) mod.practicalLabGuide = mod.lab;
  if (!mod.hours) mod.hours = mod.durationHours || 6;
  if (!mod.moduleNum) mod.moduleNum = mod.moduleNumber || mod.week;
  
  if (!mod.keyTerms && mod.terms) {
    mod.keyTerms = String(mod.terms).split(';').map(function(t) {
      const parts = t.split('=');
      return { term: (parts[0] || '').trim(), def: (parts[1] || parts[0] || '').trim() };
    }).filter(function(x) { return Boolean(x.term); });
  }
  
  if (!mod.vivaQuestions && mod.viva) {
    mod.vivaQuestions = String(mod.viva).split('\n').map(function(q) {
      return q.replace(/^\d+[\.\)]\s*/, '').trim();
    }).filter(Boolean);
  }
  
  if (!mod.corporateCaseStudy && mod.example) {
    const raw = String(mod.example);
    const caseMatch = raw.match(/Case Study:\s*([^.]+)\./i);
    const company = caseMatch ? caseMatch[1].trim() : "Corporate Talent Transformation";
    mod.corporateCaseStudy = {
      company: company,
      challenge: raw,
      strategy: "Structured competency alignment, pipeline sourcing & bias mitigation",
      impact: "Measurable reduction in time-to-fill and significant boost in quality of hire"
    };
  }

  if (mod.subtopics) {
    mod.subtopics.forEach(function(st) {
      if (!st.title) st.title = st.name;
    });
  }
});

// Global accessor and helper utilities
window.HR_TA_601_COURSE = HR_TA_601_COURSE;

/**
 * Seed HR-TA-601 course into local storage and sync to backend API
 */
window.seedHrTa601Course = async function() {
  const store = JSON.parse(localStorage.getItem('simpatico_session_customizations') || '{}');
  const lessonsPayload = {};

  HR_TA_601_COURSE.modules.forEach(mod => {
    const sid = `ta_w${mod.week}`;
    const lessonData = {
      sessionId: sid,
      courseId: "HR-TA-601",
      week: mod.week,
      titleEn: `Week ${mod.week}: ${mod.titleEn}`,
      titleMl: `ആഴ്ച ${mod.week}: ${mod.titleMl}`,
      module: String(mod.moduleNumber),
      duration: `${mod.durationHours} Hours`,
      coreFocus: mod.coreFocus,
      deliverable: mod.deliverable,
      en: mod.en,
      ml: mod.ml,
      terms: mod.terms,
      example: mod.example,
      viva: mod.viva,
      lab: mod.lab,
      videoUrl: "https://www.youtube-nocookie.com/embed/5qap5aO4i9A?rel=0",
      publishedAt: new Date().toISOString()
    };
    
    // Save to local customizations map
    store[sid] = {
      videoUrl: lessonData.videoUrl,
      notes: `${mod.titleEn} — Core Focus: ${mod.coreFocus}. Deliverable: ${mod.deliverable}`,
      assignment: mod.lab,
      publishedAt: lessonData.publishedAt,
      hrmTitleEn: lessonData.titleEn,
      hrmTitleMl: lessonData.titleMl,
      hrmModule: String(mod.moduleNumber),
      hrmDuration: `${mod.durationHours} Hours`,
      hrmEn: lessonData.en,
      hrmMl: lessonData.ml,
      hrmTerms: lessonData.terms,
      hrmExample: lessonData.example,
      hrmViva: lessonData.viva,
      hrmVideo: lessonData.videoUrl,
      hrmCourseId: "HR-TA-601"
    };

    lessonsPayload[sid] = lessonData;
  });

  localStorage.setItem('simpatico_session_customizations', JSON.stringify(store));
  localStorage.setItem('simpatico_hr_ta_601_seeded', 'true');

  // Sync to backend academy API
  const apiBase = (typeof ACADEMY_API_BASE !== 'undefined') ? ACADEMY_API_BASE : 
                  (window.SIMPATICO_CONFIG?.workerUrl || 'https://simpatico-hr-ats.simpaticohrconsultancy.workers.dev');
  
  try {
    const res = await fetch(`${apiBase}/api/academy/hrm-course?course=HR-TA-601`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId: "HR-TA-601",
        courseTitle: HR_TA_601_COURSE.title,
        lessons: lessonsPayload
      })
    });
    if (res.ok) {
      console.log('✅ HR-TA-601 successfully synchronized to Cloudflare KV backend.');
    }
  } catch(e) {
    console.warn('⚠️ Server sync failed (offline or local dev); persisted in localStorage.', e.message);
  }

  return true;
};
