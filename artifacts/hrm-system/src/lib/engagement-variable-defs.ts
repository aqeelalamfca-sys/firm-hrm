export interface VariableDef {
  key: string;
  label: string;
  fieldType: "dropdown" | "toggle" | "text" | "number" | "date" | "multi-select" | "user-picker";
  options?: string[];
  mandatory: boolean;
  section: string;
  helpText: string;
  standardRef: string;
  wpCodes: string[];
  parentKey?: string;
  showWhen?: { key: string; equals?: any; notEquals?: any };
  showWhenAny?: Array<{ key: string; equals?: any }>;
  isHighImpact: boolean;
  sortOrder: number;
  defaultValue?: any;
}

export interface SectionDef {
  id: string;
  title: string;
  iconName: string;
  color: string;
  sortOrder: number;
}

export const SECTIONS: SectionDef[] = [
  { id: "entity_legal", title: "Entity Legal & Classification", iconName: "Building2", color: "blue", sortOrder: 1 },
  { id: "financial_reporting", title: "Financial Reporting Basis", iconName: "FileText", color: "indigo", sortOrder: 2 },
  { id: "prior_year", title: "Prior Year / Opening Balance Context", iconName: "BookOpen", color: "sky", sortOrder: 3 },
  { id: "materiality", title: "Materiality", iconName: "Target", color: "emerald", sortOrder: 4 },
  { id: "risk_assessment", title: "Risk Assessment", iconName: "AlertTriangle", color: "red", sortOrder: 5 },
  { id: "it_controls", title: "IT / Controls / Service Organization", iconName: "Settings", color: "slate", sortOrder: 6 },
  { id: "experts_cycles", title: "Experts / Multi-location / Cycles", iconName: "Layers", color: "violet", sortOrder: 7 },
  { id: "sampling", title: "Sampling / Confirmations", iconName: "BarChart2", color: "teal", sortOrder: 8 },
  { id: "pakistan_tax", title: "Pakistan Tax & Regulatory", iconName: "Hash", color: "orange", sortOrder: 9 },
  { id: "significant_fs", title: "Significant FS Areas", iconName: "TrendingUp", color: "cyan", sortOrder: 10 },
  { id: "ethics", title: "Ethics / Independence / Quality", iconName: "Scale", color: "purple", sortOrder: 11 },
  { id: "team", title: "Team / Approvals / EQCR", iconName: "Briefcase", color: "blue", sortOrder: 12 },
  { id: "governance", title: "Governance / Deadlines / Subsequent Events", iconName: "Calendar", color: "amber", sortOrder: 13 },
  { id: "reporting", title: "Reporting Drivers", iconName: "FileOutput", color: "rose", sortOrder: 14 },
  { id: "system_controls", title: "System Controls / Regeneration / Archive", iconName: "Shield", color: "gray", sortOrder: 15 },
];

export const WP_CODE_MAP: Record<string, string> = {
  A1: "Client Acceptance Checklist", A2: "Continuance Evaluation", A3: "Engagement Letter",
  A4: "Independence Declaration", A5: "Conflict of Interest Assessment",
  B1: "Understanding the Entity & Environment", B2: "Risk Assessment Matrix",
  B3: "Materiality Computation", B4: "Audit Strategy & Plan",
  B6: "Going Concern Assessment", B7: "Financial Reporting Framework / Disclosure Review",
  C1: "Opening Balances / First-Year Audit",
  D1: "Walkthroughs", D2: "Internal Controls / ToC / ToD",
  E1: "Analytical Procedures", E2: "Cash and Bank", E3: "Receivables",
  E4: "Inventory", E5: "Fixed Assets / Intangibles", E6: "Liabilities / Borrowings / Leases",
  E7: "Revenue", E8: "Journal Entry Testing / Fraud", E9: "Related Parties / Provisions / Legal",
  F1: "Sampling Sheet", F2: "Expert Evaluation", F3: "Estimates Testing",
  G1: "Completion Memorandum", G2: "Summary of Unadjusted Misstatements",
  H1: "Audit Report / Reporting Completion", H2: "EQCR / Quality Review",
  H3: "Final Output / Archive",
  I1: "Tax & Regulatory Compliance (Pakistan)",
};

export const VARIABLE_DEFS: VariableDef[] = [
  { key: "entityLegalForm", label: "Entity Legal Form", fieldType: "dropdown", options: ["Company","Single Member Company","LLP","Partnership","AOP","Sole Proprietor","Trust","Society","NGO","NPO","Branch Office","Liaison Office","Other"], mandatory: true, section: "entity_legal", helpText: "Controls legal/compliance checklist, report format, and statutory documentation set", standardRef: "ISA 210, Companies Act 2017", wpCodes: ["A1","A2","A3","B1","H1","I1"], isHighImpact: true, sortOrder: 1 },
  { key: "companyCategory", label: "Company Category", fieldType: "dropdown", options: ["Listed","Public Unlisted","Private Limited","Section 42","Guarantee Limited","Government-Owned","Donor-Funded","Other"], mandatory: true, section: "entity_legal", helpText: "Drives governance, reporting template, SECP compliance, QC depth", standardRef: "ISA 210, ISA 220, Companies Act 2017", wpCodes: ["A1","A2","B1","G1","H1","I1"], isHighImpact: true, sortOrder: 2 },
  { key: "entitySizeClassification", label: "Entity Size Classification", fieldType: "dropdown", options: ["PIE","PIC","Large","Medium","Small","Micro"], mandatory: true, section: "entity_legal", helpText: "Determines documentation depth, reviewer level, EQCR, compliance scope", standardRef: "ISA 220, ISQM 1, ISQM 2", wpCodes: ["A2","B1","H1","I1"], isHighImpact: true, sortOrder: 3 },
  { key: "ownershipStructure", label: "Ownership Structure", fieldType: "dropdown", options: ["Local","Foreign-Owned","JV","Subsidiary","Holding Company","Government","Family-Owned","Donor-Controlled"], mandatory: false, section: "entity_legal", helpText: "Triggers related party, foreign, consolidation, governance procedures", standardRef: "ISA 315, ISA 550, IAS 24", wpCodes: ["B1","B2","E9","G1","H1"], isHighImpact: false, sortOrder: 4 },
  { key: "operationalStatus", label: "Operational Status", fieldType: "dropdown", options: ["Active","Dormant","Start-up","Ceased","Under Liquidation","Under Restructuring"], mandatory: true, section: "entity_legal", helpText: "Affects going concern, analytics, reporting emphasis", standardRef: "ISA 570, IAS 1", wpCodes: ["B1","B6","G1","H1"], isHighImpact: true, sortOrder: 5 },
  { key: "industrySectorDetailed", label: "Industry / Sector Detailed", fieldType: "dropdown", options: ["Manufacturing","Trading","Services","Construction","Education","Healthcare","NGO/NPO","Textile","Real Estate","Financial Services","IT","Other"], mandatory: true, section: "entity_legal", helpText: "Loads sector-specific risk templates, laws, analytics and disclosures", standardRef: "ISA 315, ISA 330", wpCodes: ["B1","B2","B4","E1","I1"], isHighImpact: true, sortOrder: 6 },
  { key: "regulatedIndustryFlag", label: "Regulated Industry Flag", fieldType: "toggle", mandatory: true, section: "entity_legal", helpText: "If Yes, enable sector-specific compliance papers", standardRef: "ISA 250, sector laws", wpCodes: ["A1","B1","B2","H1","I1"], isHighImpact: true, sortOrder: 7, defaultValue: false },
  { key: "regulatorType", label: "Regulator Type", fieldType: "multi-select", options: ["SECP","SBP","NEPRA","OGRA","PEMRA","FBR","PRA","SRB","KPRA","BRA","Other"], mandatory: false, section: "entity_legal", helpText: "Enables regulator-specific compliance checklist", standardRef: "ISA 250, local laws", wpCodes: ["B1","H1","I1"], isHighImpact: false, sortOrder: 8, showWhen: { key: "regulatedIndustryFlag", equals: true } },

  { key: "financialStatementsType", label: "Financial Statements Type", fieldType: "dropdown", options: ["Standalone","Consolidated","Combined","Carve-out","Special Purpose"], mandatory: true, section: "financial_reporting", helpText: "Determines group audit, consolidation, and reporting papers", standardRef: "ISA 600, IFRS 10, IAS 27", wpCodes: ["B1","B3","E1","H1"], isHighImpact: true, sortOrder: 9 },
  { key: "reportingFrameworkDetailed", label: "Reporting Framework Detailed", fieldType: "dropdown", options: ["Full IFRS","IFRS for SMEs","IPSAS","Special Purpose","Local Prescribed Framework"], mandatory: true, section: "financial_reporting", helpText: "Loads disclosure checklist and FS review framework", standardRef: "ISA 200, IFRS / IPSAS", wpCodes: ["B1","B7","H1"], isHighImpact: true, sortOrder: 10 },
  { key: "basisOfPreparation", label: "Basis of Preparation", fieldType: "dropdown", options: ["Historical Cost","Fair Value","Mixed Basis","Liquidation Basis"], mandatory: true, section: "financial_reporting", helpText: "Impacts valuation and estimate procedures", standardRef: "IAS 1, IFRS 13", wpCodes: ["B1","B7","E1","H1"], isHighImpact: true, sortOrder: 11 },
  { key: "comparativeInformationType", label: "Comparative Information Type", fieldType: "dropdown", options: ["Corresponding Figures","Full Comparative FS"], mandatory: false, section: "financial_reporting", helpText: "Controls comparative review and report wording", standardRef: "ISA 710", wpCodes: ["B7","H1"], isHighImpact: false, sortOrder: 12 },

  { key: "priorYearFsStatus", label: "Prior Year Financial Statements Status", fieldType: "dropdown", options: ["Audited","Unaudited","Reviewed","Compiled","Not Available"], mandatory: true, section: "prior_year", helpText: "Drives opening balance and comparative procedures", standardRef: "ISA 510, ISA 710", wpCodes: ["C1","B1","H1"], isHighImpact: true, sortOrder: 13 },
  { key: "predecessorAuditorInvolved", label: "Predecessor Auditor Involved", fieldType: "toggle", mandatory: true, section: "prior_year", helpText: "If Yes, require predecessor communication papers", standardRef: "ISA 510, IESBA Code", wpCodes: ["A1","A2","C1"], isHighImpact: true, sortOrder: 14, defaultValue: false },
  { key: "predecessorAuditorName", label: "Predecessor Auditor Name", fieldType: "text", mandatory: false, section: "prior_year", helpText: "Enabled only when predecessor exists", standardRef: "ISA 510", wpCodes: ["A1","A2","C1"], isHighImpact: false, sortOrder: 15, showWhen: { key: "predecessorAuditorInvolved", equals: true } },
  { key: "changeInAccountingPolicyFlag", label: "Change in Accounting Policy Flag", fieldType: "toggle", mandatory: true, section: "prior_year", helpText: "If Yes, generate IAS 8 review papers", standardRef: "IAS 8, ISA 710", wpCodes: ["B7","H1"], isHighImpact: true, sortOrder: 16, defaultValue: false },
  { key: "reclassificationRestatementFlag", label: "Reclassification / Restatement Flag", fieldType: "toggle", mandatory: true, section: "prior_year", helpText: "If Yes, trigger comparative recast and disclosure review", standardRef: "IAS 8, ISA 710", wpCodes: ["B7","H1"], isHighImpact: true, sortOrder: 17, defaultValue: false },

  { key: "materialityBenchmark", label: "Materiality Benchmark", fieldType: "dropdown", options: ["PBT","Revenue","Total Assets","Equity","Total Expenses","Gross Profit","Net Assets"], mandatory: true, section: "materiality", helpText: "Basis for planning materiality calculation", standardRef: "ISA 320", wpCodes: ["B3","B4","F1","G1"], isHighImpact: true, sortOrder: 18 },
  { key: "planningMateriality", label: "Planning Materiality", fieldType: "number", mandatory: true, section: "materiality", helpText: "Drives scope and thresholds across WPs", standardRef: "ISA 320", wpCodes: ["B3","F1","G1"], isHighImpact: true, sortOrder: 19 },
  { key: "performanceMateriality", label: "Performance Materiality", fieldType: "number", mandatory: true, section: "materiality", helpText: "Drives sample sizes and testing extent", standardRef: "ISA 320", wpCodes: ["B3","E1","F1","G1"], isHighImpact: true, sortOrder: 20 },
  { key: "clearlyTrivialThreshold", label: "Clearly Trivial Threshold", fieldType: "number", mandatory: true, section: "materiality", helpText: "Used in misstatement summary and completion memo", standardRef: "ISA 450", wpCodes: ["G1","G2"], isHighImpact: true, sortOrder: 21 },
  { key: "specificMaterialityRequired", label: "Specific Materiality Required", fieldType: "toggle", mandatory: false, section: "materiality", helpText: "If Yes, enable area-specific thresholds", standardRef: "ISA 320", wpCodes: ["B3","E1"], isHighImpact: false, sortOrder: 22, defaultValue: false },
  { key: "specificMaterialityAreas", label: "Specific Materiality Areas", fieldType: "multi-select", options: ["Related Parties","Directors' Remuneration","Compliance","Disclosures","Revenue","Other"], mandatory: false, section: "materiality", helpText: "Enabled only if specific materiality required", standardRef: "ISA 320", wpCodes: ["B3","E1","H1"], isHighImpact: false, sortOrder: 23, showWhen: { key: "specificMaterialityRequired", equals: true } },

  { key: "overallFsRiskLevel", label: "Overall FS Risk Level", fieldType: "dropdown", options: ["Low","Moderate","High"], mandatory: true, section: "risk_assessment", helpText: "Determines overall audit response intensity", standardRef: "ISA 315, ISA 330", wpCodes: ["B2","B4","E1"], isHighImpact: true, sortOrder: 24 },
  { key: "significantRisksIdentified", label: "Significant Risks Identified", fieldType: "toggle", mandatory: true, section: "risk_assessment", helpText: "If Yes, require risk-specific procedures", standardRef: "ISA 315, ISA 330", wpCodes: ["B2","B4","E1"], isHighImpact: true, sortOrder: 25, defaultValue: false },
  { key: "significantRiskAreas", label: "Significant Risk Areas", fieldType: "multi-select", options: ["Revenue","Management Override","Inventory","Estimates","Related Parties","Going Concern","Litigation","Tax","IT","Other"], mandatory: false, section: "risk_assessment", helpText: "Loads area-specific high-risk programs", standardRef: "ISA 240, ISA 315", wpCodes: ["B2","B4","E1","G1"], isHighImpact: true, sortOrder: 26, showWhen: { key: "significantRisksIdentified", equals: true } },
  { key: "fraudRiskFactorsPresent", label: "Fraud Risk Factors Present", fieldType: "toggle", mandatory: true, section: "risk_assessment", helpText: "If Yes, generate fraud memo and JE testing papers", standardRef: "ISA 240", wpCodes: ["B2","B4","E8","G1"], isHighImpact: true, sortOrder: 27, defaultValue: false },
  { key: "managementOverrideRisk", label: "Management Override Risk", fieldType: "toggle", mandatory: true, section: "risk_assessment", helpText: "If Yes, require mandatory journal testing set", standardRef: "ISA 240", wpCodes: ["E8","G1"], isHighImpact: true, sortOrder: 28, defaultValue: true },
  { key: "noclarIndicator", label: "NOCLAR / Legal Non-Compliance Indicator", fieldType: "toggle", mandatory: true, section: "risk_assessment", helpText: "If Yes, enable legal/compliance escalation papers", standardRef: "ISA 250, IESBA Code", wpCodes: ["B2","G1","H1"], isHighImpact: true, sortOrder: 29, defaultValue: false },
  { key: "managementIntegrityConcern", label: "Management Integrity Concern", fieldType: "toggle", mandatory: true, section: "risk_assessment", helpText: "If Yes, raise acceptance/continuance alerts and heightened review", standardRef: "ISA 220", wpCodes: ["A1","A2","B2","G1"], isHighImpact: true, sortOrder: 30, defaultValue: false },
  { key: "goingConcernRiskLevel", label: "Going Concern Risk Level", fieldType: "dropdown", options: ["Low","Moderate","High","Material Uncertainty Suspected"], mandatory: true, section: "risk_assessment", helpText: "Controls going concern procedures and report evaluation", standardRef: "ISA 570", wpCodes: ["B6","G1","H1"], isHighImpact: true, sortOrder: 31 },

  { key: "serviceOrganizationUsed", label: "Service Organization Used", fieldType: "toggle", mandatory: true, section: "it_controls", helpText: "If Yes, trigger ISA 402 papers", standardRef: "ISA 402", wpCodes: ["D1","D2","E1"], isHighImpact: true, sortOrder: 32, defaultValue: false },
  { key: "serviceOrganizationType", label: "Service Organization Type", fieldType: "multi-select", options: ["Payroll Processor","ERP Hosting","Inventory Custodian","Logistics","Claims Processor","Bank Platform","Other"], mandatory: false, section: "it_controls", helpText: "Enabled only if service organization used", standardRef: "ISA 402", wpCodes: ["D1","D2","E1"], isHighImpact: false, sortOrder: 33, showWhen: { key: "serviceOrganizationUsed", equals: true } },
  { key: "accountingSystemEnvironment", label: "Accounting System Environment", fieldType: "dropdown", options: ["Manual","Excel-Based","Desktop Accounting Software","ERP","Cloud ERP","Hybrid"], mandatory: true, section: "it_controls", helpText: "Determines controls and IPE testing depth", standardRef: "ISA 315", wpCodes: ["D1","D2","E1"], isHighImpact: true, sortOrder: 34 },
  { key: "erpSoftwareName", label: "ERP / Software Name", fieldType: "text", mandatory: false, section: "it_controls", helpText: "Adds contextual documentation to walkthroughs", standardRef: "ISA 315", wpCodes: ["D1","D2"], isHighImpact: false, sortOrder: 35 },
  { key: "itComplexity", label: "IT Complexity", fieldType: "dropdown", options: ["Low","Moderate","High"], mandatory: true, section: "it_controls", helpText: "Determines ITGC and application control testing depth", standardRef: "ISA 315", wpCodes: ["D1","D2","E1"], isHighImpact: true, sortOrder: 36 },
  { key: "ipeSystemReportsUsed", label: "IPE / System Reports Used in Audit", fieldType: "toggle", mandatory: true, section: "it_controls", helpText: "If Yes, generate completeness/accuracy testing papers", standardRef: "ISA 500, ISA 315", wpCodes: ["D2","E1"], isHighImpact: true, sortOrder: 37, defaultValue: false },
  { key: "itgcTestingPlanned", label: "ITGC Testing Planned", fieldType: "toggle", mandatory: true, section: "it_controls", helpText: "If Yes, load ITGC templates", standardRef: "ISA 315", wpCodes: ["D2","E1"], isHighImpact: true, sortOrder: 38, defaultValue: false },
  { key: "internalAuditFunctionExists", label: "Internal Audit Function Exists", fieldType: "toggle", mandatory: true, section: "it_controls", helpText: "If Yes, allow ISA 610 assessment papers", standardRef: "ISA 610", wpCodes: ["B1","D2"], isHighImpact: false, sortOrder: 39, defaultValue: false },
  { key: "internalAuditReliancePlanned", label: "Internal Audit Reliance Planned", fieldType: "toggle", mandatory: false, section: "it_controls", helpText: "If Yes, generate evaluation and reliance papers", standardRef: "ISA 610", wpCodes: ["D2","E1"], isHighImpact: false, sortOrder: 40, defaultValue: false, showWhen: { key: "internalAuditFunctionExists", equals: true } },

  { key: "auditorsExpertUsed", label: "Auditor's Expert Used", fieldType: "toggle", mandatory: true, section: "experts_cycles", helpText: "If Yes, generate expert competence/objectivity papers", standardRef: "ISA 620", wpCodes: ["F2","F3","E1"], isHighImpact: true, sortOrder: 41, defaultValue: false },
  { key: "managementExpertUsed", label: "Management Expert Used", fieldType: "toggle", mandatory: true, section: "experts_cycles", helpText: "If Yes, trigger estimate/expert evaluation papers", standardRef: "ISA 500, ISA 540", wpCodes: ["F2","F3","E1"], isHighImpact: true, sortOrder: 42, defaultValue: false },
  { key: "expertType", label: "Expert Type", fieldType: "multi-select", options: ["Valuer","Actuary","Legal Counsel","Tax Expert","IT Expert","Engineer","Other"], mandatory: false, section: "experts_cycles", helpText: "Enabled only if any expert used", standardRef: "ISA 620", wpCodes: ["F2","F3","E1"], isHighImpact: false, sortOrder: 43, showWhenAny: [{ key: "auditorsExpertUsed", equals: true }, { key: "managementExpertUsed", equals: true }] },
  { key: "multiLocationAudit", label: "Multi-location Audit", fieldType: "toggle", mandatory: true, section: "experts_cycles", helpText: "If Yes, enable branch/location procedures", standardRef: "ISA 600, ISA 501", wpCodes: ["B1","B4","E1"], isHighImpact: true, sortOrder: 44, defaultValue: false },
  { key: "numberOfLocations", label: "Number of Locations", fieldType: "number", mandatory: false, section: "experts_cycles", helpText: "Enabled only if multi-location = Yes", standardRef: "ISA 600", wpCodes: ["B1","B4","E1"], isHighImpact: false, sortOrder: 45, showWhen: { key: "multiLocationAudit", equals: true } },
  { key: "interimAuditPerformed", label: "Interim Audit Performed", fieldType: "toggle", mandatory: false, section: "experts_cycles", helpText: "If Yes, generate roll-forward procedures", standardRef: "ISA 330", wpCodes: ["B4","E1"], isHighImpact: false, sortOrder: 46, defaultValue: false },
  { key: "applicableBusinessCycles", label: "Applicable Business Cycles", fieldType: "multi-select", options: ["Revenue","Purchases","Inventory","Payroll","Treasury","Fixed Assets","Financial Close","Tax","Grants/Donors"], mandatory: true, section: "experts_cycles", helpText: "Auto-generates walkthrough, ToC, ToD per cycle", standardRef: "ISA 315", wpCodes: ["D1","D2","E1"], isHighImpact: true, sortOrder: 47 },
  { key: "controlRelianceByCycle", label: "Control Reliance by Cycle", fieldType: "multi-select", options: ["Revenue","Purchases","Inventory","Payroll","Treasury","Fixed Assets","Financial Close","None"], mandatory: true, section: "experts_cycles", helpText: "If selected, generate ToC and reliance procedures for chosen cycles", standardRef: "ISA 330", wpCodes: ["D2","E1"], isHighImpact: true, sortOrder: 48 },
  { key: "segregationOfDutiesConcern", label: "Segregation of Duties Concern", fieldType: "toggle", mandatory: false, section: "experts_cycles", helpText: "If Yes, generate control deficiency memo", standardRef: "ISA 265", wpCodes: ["D2","G1"], isHighImpact: false, sortOrder: 49, defaultValue: false },
  { key: "priorYearDeficienciesUnresolved", label: "Prior Year Deficiencies Unresolved", fieldType: "toggle", mandatory: false, section: "experts_cycles", helpText: "If Yes, create follow-up deficiency papers", standardRef: "ISA 265", wpCodes: ["D2","G1"], isHighImpact: false, sortOrder: 50, defaultValue: false },

  { key: "substantiveAnalyticalProceduresPlanned", label: "Substantive Analytical Procedures Planned", fieldType: "toggle", mandatory: false, section: "sampling", helpText: "If Yes, generate analytics-based programs", standardRef: "ISA 520", wpCodes: ["E1"], isHighImpact: false, sortOrder: 51, defaultValue: true },
  { key: "externalConfirmationsRequired", label: "External Confirmations Required", fieldType: "toggle", mandatory: true, section: "sampling", helpText: "If Yes, enable confirmation suite", standardRef: "ISA 505", wpCodes: ["E2","E3","E4","E5"], isHighImpact: true, sortOrder: 52, defaultValue: true },
  { key: "confirmationTypesRequired", label: "Confirmation Types Required", fieldType: "multi-select", options: ["Banks","Trade Debtors","Trade Creditors","Loan Lenders","Lawyers","Inventory Custodians","Related Parties"], mandatory: false, section: "sampling", helpText: "Enabled only if confirmations required", standardRef: "ISA 505, ISA 501", wpCodes: ["E2","E3","E4","E5"], isHighImpact: false, sortOrder: 53, showWhen: { key: "externalConfirmationsRequired", equals: true } },
  { key: "samplingApproach", label: "Sampling Approach", fieldType: "dropdown", options: ["Statistical","Non-Statistical","100% Testing","Key Item Testing","Analytical Only"], mandatory: true, section: "sampling", helpText: "Determines sample sheet design", standardRef: "ISA 530", wpCodes: ["F1","E1"], isHighImpact: true, sortOrder: 54 },
  { key: "tolerableMisstatement", label: "Tolerable Misstatement", fieldType: "number", mandatory: true, section: "sampling", helpText: "Sample size driver", standardRef: "ISA 530", wpCodes: ["F1","E1"], isHighImpact: true, sortOrder: 55 },
  { key: "expectedMisstatementDeviation", label: "Expected Misstatement / Deviation", fieldType: "number", mandatory: true, section: "sampling", helpText: "Sample size and evaluation driver", standardRef: "ISA 530", wpCodes: ["F1","E1"], isHighImpact: true, sortOrder: 56 },
  { key: "populationSize", label: "Population Size", fieldType: "number", mandatory: false, section: "sampling", helpText: "Used in sample size calculation", standardRef: "ISA 530", wpCodes: ["F1"], isHighImpact: false, sortOrder: 57 },
  { key: "stratificationRequired", label: "Stratification Required", fieldType: "toggle", mandatory: false, section: "sampling", helpText: "If Yes, create stratified sample sheets", standardRef: "ISA 530", wpCodes: ["F1"], isHighImpact: false, sortOrder: 58, defaultValue: false },
  { key: "samplingUnit", label: "Sampling Unit", fieldType: "dropdown", options: ["Invoice","Voucher","Customer Balance","Supplier Balance","GL Entry","Item Line","Contract","Payroll Record"], mandatory: false, section: "sampling", helpText: "Defines population unit", standardRef: "ISA 530", wpCodes: ["F1","E1"], isHighImpact: false, sortOrder: 59 },
  { key: "selectionTechnique", label: "Selection Technique", fieldType: "dropdown", options: ["Random","Systematic","Haphazard","Monetary Unit","Key Item","Block"], mandatory: false, section: "sampling", helpText: "Controls selection documentation", standardRef: "ISA 530", wpCodes: ["F1"], isHighImpact: false, sortOrder: 60 },

  { key: "incomeTaxRegistered", label: "Income Tax Registered", fieldType: "toggle", mandatory: true, section: "pakistan_tax", helpText: "Triggers income tax compliance papers", standardRef: "Income Tax Ordinance 2001", wpCodes: ["I1","H1"], isHighImpact: true, sortOrder: 61, defaultValue: true },
  { key: "salesTaxRegistered", label: "Sales Tax Registered", fieldType: "toggle", mandatory: true, section: "pakistan_tax", helpText: "Triggers sales tax compliance papers", standardRef: "Sales Tax Act / Provincial Laws", wpCodes: ["I1","H1"], isHighImpact: true, sortOrder: 62, defaultValue: false },
  { key: "salesTaxJurisdiction", label: "Sales Tax Jurisdiction", fieldType: "multi-select", options: ["FBR","PRA","SRB","KPRA","BRA"], mandatory: false, section: "pakistan_tax", helpText: "Enabled only if sales tax registered", standardRef: "Applicable tax laws", wpCodes: ["I1","H1"], isHighImpact: false, sortOrder: 63, showWhen: { key: "salesTaxRegistered", equals: true } },
  { key: "fedApplicable", label: "FED Applicable", fieldType: "toggle", mandatory: false, section: "pakistan_tax", helpText: "If Yes, generate FED compliance papers", standardRef: "Federal Excise Act", wpCodes: ["I1"], isHighImpact: false, sortOrder: 64, defaultValue: false },
  { key: "withholdingTaxAgentApplicable", label: "Withholding Tax Agent Applicable", fieldType: "toggle", mandatory: true, section: "pakistan_tax", helpText: "Enables withholding review program", standardRef: "Income Tax Ordinance 2001", wpCodes: ["I1"], isHighImpact: true, sortOrder: 65, defaultValue: true },
  { key: "salesTaxWithholdingApplicable", label: "Sales Tax Withholding Applicable", fieldType: "toggle", mandatory: false, section: "pakistan_tax", helpText: "Enables sales tax withholding papers", standardRef: "Applicable tax laws", wpCodes: ["I1"], isHighImpact: false, sortOrder: 66, defaultValue: false },
  { key: "deferredTaxApplicable", label: "Deferred Tax Applicable", fieldType: "toggle", mandatory: true, section: "pakistan_tax", helpText: "If Yes, create deferred tax review schedules", standardRef: "IAS 12", wpCodes: ["I1","H1"], isHighImpact: true, sortOrder: 67, defaultValue: true },
  { key: "pendingTaxAssessmentsAppeals", label: "Pending Tax Assessments / Appeals", fieldType: "toggle", mandatory: true, section: "pakistan_tax", helpText: "If Yes, trigger tax contingency and legal review papers", standardRef: "IAS 37, ISA 250", wpCodes: ["I1","G1","H1"], isHighImpact: true, sortOrder: 68, defaultValue: false },
  { key: "atlFilerStatus", label: "ATL / Filer Status", fieldType: "dropdown", options: ["Filer","Non-Filer","Not Confirmed"], mandatory: false, section: "pakistan_tax", helpText: "Impacts tax exposure review", standardRef: "Income Tax Ordinance 2001", wpCodes: ["I1"], isHighImpact: false, sortOrder: 69 },
  { key: "secpFilingApplicable", label: "SECP Filing Applicable", fieldType: "toggle", mandatory: true, section: "pakistan_tax", helpText: "If Yes, generate statutory filing checklist", standardRef: "Companies Act 2017", wpCodes: ["I1","H1"], isHighImpact: true, sortOrder: 70, defaultValue: true },
  { key: "otherStatutoryDuesApplicable", label: "Other Statutory Dues Applicable", fieldType: "multi-select", options: ["EOBI","ESSI","Social Security","WWF","WPPF","Gratuity","Pension","Leave Encashment"], mandatory: false, section: "pakistan_tax", helpText: "Triggers payroll/statutory review papers", standardRef: "Relevant Pakistan laws, IAS 19", wpCodes: ["I1","E1","H1"], isHighImpact: false, sortOrder: 71 },
  { key: "donorGrantRestrictionsApplicable", label: "Donor / Grant Restrictions Applicable", fieldType: "toggle", mandatory: false, section: "pakistan_tax", helpText: "If Yes, generate restricted funds/grant compliance papers", standardRef: "Donor terms, IAS 20", wpCodes: ["B1","E1","H1","I1"], isHighImpact: false, sortOrder: 72, defaultValue: false },
  { key: "section42NpoComplianceApplicable", label: "Section 42 / NPO Compliance Applicable", fieldType: "toggle", mandatory: false, section: "pakistan_tax", helpText: "If Yes, load NPO-specific governance and compliance papers", standardRef: "Companies Act 2017", wpCodes: ["A1","B1","H1","I1"], isHighImpact: true, sortOrder: 73, defaultValue: false },

  { key: "cashBankSignificant", label: "Cash / Bank Significant", fieldType: "toggle", mandatory: true, section: "significant_fs", helpText: "If Yes, generate bank program and confirmations", standardRef: "ISA 505", wpCodes: ["E2"], isHighImpact: true, sortOrder: 74, defaultValue: true },
  { key: "receivablesSignificant", label: "Receivables Significant", fieldType: "toggle", mandatory: true, section: "significant_fs", helpText: "If Yes, generate debtor confirmation and impairment papers", standardRef: "IFRS 9, ISA 505", wpCodes: ["E3"], isHighImpact: true, sortOrder: 75, defaultValue: true },
  { key: "inventorySignificant", label: "Inventory Significant", fieldType: "toggle", mandatory: true, section: "significant_fs", helpText: "If Yes, generate inventory program", standardRef: "ISA 501, IAS 2", wpCodes: ["E4"], isHighImpact: true, sortOrder: 76, defaultValue: true },
  { key: "inventoryCountAttendanceRequired", label: "Inventory Count Attendance Required", fieldType: "toggle", mandatory: true, section: "significant_fs", helpText: "If Yes, create count instructions and attendance sheets", standardRef: "ISA 501", wpCodes: ["E4"], isHighImpact: true, sortOrder: 77, defaultValue: false, showWhen: { key: "inventorySignificant", equals: true } },
  { key: "inventoryHeldByThirdParties", label: "Inventory Held by Third Parties", fieldType: "toggle", mandatory: false, section: "significant_fs", helpText: "If Yes, generate third-party confirmation papers", standardRef: "ISA 501", wpCodes: ["E4"], isHighImpact: false, sortOrder: 78, defaultValue: false, showWhen: { key: "inventorySignificant", equals: true } },
  { key: "slowMovingObsoleteInventoryRisk", label: "Slow-moving / Obsolete Inventory Risk", fieldType: "toggle", mandatory: false, section: "significant_fs", helpText: "If Yes, enable NRV and ageing review papers", standardRef: "IAS 2", wpCodes: ["E4"], isHighImpact: false, sortOrder: 79, defaultValue: false, showWhen: { key: "inventorySignificant", equals: true } },
  { key: "fixedAssetsSignificant", label: "Fixed Assets Significant", fieldType: "toggle", mandatory: true, section: "significant_fs", helpText: "If Yes, generate PPE program", standardRef: "IAS 16", wpCodes: ["E5"], isHighImpact: true, sortOrder: 80, defaultValue: true },
  { key: "cwipSignificant", label: "CWIP Significant", fieldType: "toggle", mandatory: false, section: "significant_fs", helpText: "If Yes, trigger capitalization review papers", standardRef: "IAS 16, IAS 36", wpCodes: ["E5"], isHighImpact: false, sortOrder: 81, defaultValue: false, showWhen: { key: "fixedAssetsSignificant", equals: true } },
  { key: "intangiblesSignificant", label: "Intangibles Significant", fieldType: "toggle", mandatory: false, section: "significant_fs", helpText: "If Yes, generate intangible asset program", standardRef: "IAS 38", wpCodes: ["E5"], isHighImpact: false, sortOrder: 82, defaultValue: false },
  { key: "borrowingsSignificant", label: "Borrowings Significant", fieldType: "toggle", mandatory: true, section: "significant_fs", helpText: "If Yes, trigger confirmations and covenant review", standardRef: "IAS 1, ISA 505", wpCodes: ["E6","G1"], isHighImpact: true, sortOrder: 83, defaultValue: false },
  { key: "covenantComplianceRisk", label: "Covenant Compliance Risk", fieldType: "toggle", mandatory: false, section: "significant_fs", helpText: "If Yes, generate covenant breach review", standardRef: "ISA 570, IAS 1", wpCodes: ["E6","G1"], isHighImpact: false, sortOrder: 84, defaultValue: false, showWhen: { key: "borrowingsSignificant", equals: true } },
  { key: "leaseAccountingApplicable", label: "Lease Accounting Applicable", fieldType: "toggle", mandatory: false, section: "significant_fs", helpText: "If Yes, generate IFRS 16 program", standardRef: "IFRS 16", wpCodes: ["E6","H1"], isHighImpact: false, sortOrder: 85, defaultValue: false },
  { key: "revenueComplexity", label: "Revenue Complexity", fieldType: "dropdown", options: ["Low","Moderate","High"], mandatory: true, section: "significant_fs", helpText: "Controls revenue testing depth and contract review", standardRef: "IFRS 15, ISA 240", wpCodes: ["E7","B2"], isHighImpact: true, sortOrder: 86 },
  { key: "longTermContractsExist", label: "Long-term Contracts Exist", fieldType: "toggle", mandatory: false, section: "significant_fs", helpText: "If Yes, load percentage-of-completion / contract testing papers", standardRef: "IFRS 15", wpCodes: ["E7"], isHighImpact: false, sortOrder: 87, defaultValue: false },
  { key: "provisionsContingenciesSignificant", label: "Provisions / Contingencies Significant", fieldType: "toggle", mandatory: true, section: "significant_fs", helpText: "If Yes, generate IAS 37 program and legal letter set", standardRef: "IAS 37, ISA 501", wpCodes: ["E9","H1"], isHighImpact: true, sortOrder: 88, defaultValue: false },
  { key: "relatedPartiesSignificant", label: "Related Parties Significant", fieldType: "toggle", mandatory: true, section: "significant_fs", helpText: "If Yes, generate related party checklist and procedures", standardRef: "ISA 550, IAS 24", wpCodes: ["E9","H1"], isHighImpact: true, sortOrder: 89, defaultValue: false },
  { key: "subsequentEventsSensitivity", label: "Subsequent Events Sensitivity", fieldType: "dropdown", options: ["Low","Moderate","High"], mandatory: true, section: "significant_fs", helpText: "Controls extent of post-year-end review", standardRef: "ISA 560", wpCodes: ["G1","H1"], isHighImpact: true, sortOrder: 90 },

  { key: "independenceThreatsIdentified", label: "Independence Threats Identified", fieldType: "toggle", mandatory: true, section: "ethics", helpText: "If Yes, require safeguards paper before continuation", standardRef: "IESBA Code", wpCodes: ["A4","A5"], isHighImpact: true, sortOrder: 91, defaultValue: false },
  { key: "nonAuditServicesProvided", label: "Non-audit Services Provided", fieldType: "toggle", mandatory: true, section: "ethics", helpText: "If Yes, generate independence safeguard review", standardRef: "IESBA Code", wpCodes: ["A4","A5"], isHighImpact: true, sortOrder: 92, defaultValue: false },
  { key: "partnerRotationIssue", label: "Partner Rotation Issue", fieldType: "toggle", mandatory: false, section: "ethics", helpText: "If Yes, raise QC alert", standardRef: "IESBA Code, ISQM 1", wpCodes: ["A4","A5","H2"], isHighImpact: false, sortOrder: 93, defaultValue: false },
  { key: "feeDependenceOverdueFees", label: "Fee Dependence / Overdue Fees", fieldType: "toggle", mandatory: false, section: "ethics", helpText: "If Yes, require continuance threat assessment", standardRef: "IESBA Code", wpCodes: ["A2","A4","A5"], isHighImpact: false, sortOrder: 94, defaultValue: false },

  { key: "engagementPartner", label: "Engagement Partner", fieldType: "user-picker", mandatory: true, section: "team", helpText: "Required for approval, report sign-off, workflow", standardRef: "ISA 220", wpCodes: ["H1","H2"], isHighImpact: true, sortOrder: 95 },
  { key: "eqcrRequired", label: "EQCR Required", fieldType: "toggle", mandatory: true, section: "team", helpText: "If Yes, EQCR assignment mandatory before finalization", standardRef: "ISQM 2, ISA 220", wpCodes: ["H2"], isHighImpact: true, sortOrder: 96, defaultValue: false },
  { key: "eqcrReviewer", label: "EQCR Reviewer", fieldType: "user-picker", mandatory: false, section: "team", helpText: "Mandatory when EQCR Required = Yes", standardRef: "ISQM 2", wpCodes: ["H2"], isHighImpact: false, sortOrder: 97, showWhen: { key: "eqcrRequired", equals: true } },
  { key: "sectionwisePreparerAssignment", label: "Section-wise Preparer Assignment", fieldType: "user-picker", mandatory: false, section: "team", helpText: "Enables section routing and sign-off ownership", standardRef: "ISA 230", wpCodes: [], isHighImpact: false, sortOrder: 98 },
  { key: "sectionwiseReviewerAssignment", label: "Section-wise Reviewer Assignment", fieldType: "user-picker", mandatory: false, section: "team", helpText: "Enables review routing by section", standardRef: "ISA 220", wpCodes: [], isHighImpact: false, sortOrder: 99 },

  { key: "engagementAcceptanceDate", label: "Engagement Acceptance Date", fieldType: "date", mandatory: true, section: "governance", helpText: "Chronology control for acceptance and planning", standardRef: "ISA 210", wpCodes: ["A1","A2","A3"], isHighImpact: true, sortOrder: 100 },
  { key: "managementFsApprovalDate", label: "Management FS Approval Date", fieldType: "date", mandatory: false, section: "governance", helpText: "Used in report completion sequence", standardRef: "ISA 700", wpCodes: ["G1","H1"], isHighImpact: false, sortOrder: 101 },
  { key: "boardAuditCommitteeApprovalDate", label: "Board / Audit Committee Approval Date", fieldType: "date", mandatory: false, section: "governance", helpText: "Used in governance and report dating logic", standardRef: "ISA 260", wpCodes: ["G1","H1"], isHighImpact: false, sortOrder: 102 },
  { key: "subsequentEventsReviewCutoffDate", label: "Subsequent Events Review Cutoff Date", fieldType: "date", mandatory: true, section: "governance", helpText: "Defines latest date covered by post-year-end review", standardRef: "ISA 560", wpCodes: ["G1","H1"], isHighImpact: true, sortOrder: 103 },
  { key: "tcwgBoardExists", label: "TCWG / Board Exists", fieldType: "toggle", mandatory: true, section: "governance", helpText: "If Yes, governance communication WPs required", standardRef: "ISA 260", wpCodes: ["G1","H1"], isHighImpact: true, sortOrder: 104, defaultValue: true },
  { key: "auditCommitteeExists", label: "Audit Committee Exists", fieldType: "toggle", mandatory: false, section: "governance", helpText: "If Yes, load committee communication templates", standardRef: "ISA 260", wpCodes: ["G1","H1"], isHighImpact: false, sortOrder: 105, defaultValue: false },
  { key: "authorizedSignatoriesAvailable", label: "Authorized Signatories Available", fieldType: "toggle", mandatory: true, section: "governance", helpText: "Controls MRL, engagement letter, confirmations execution", standardRef: "ISA 580", wpCodes: ["A3","G1","H1"], isHighImpact: true, sortOrder: 106, defaultValue: true },
  { key: "legalCounselExists", label: "Legal Counsel Exists", fieldType: "toggle", mandatory: false, section: "governance", helpText: "If Yes, enable legal confirmation paper", standardRef: "ISA 501", wpCodes: ["E9","G1"], isHighImpact: false, sortOrder: 107, defaultValue: false },
  { key: "boardMinutesAvailable", label: "Board Minutes Available", fieldType: "toggle", mandatory: true, section: "governance", helpText: "If No, trigger alternate governance procedures", standardRef: "ISA 250, ISA 550", wpCodes: ["B1","E9","G1"], isHighImpact: true, sortOrder: 108, defaultValue: true },

  { key: "expectedOpinionStatus", label: "Expected Opinion Status", fieldType: "dropdown", options: ["Unmodified Expected","Possible Qualified","Possible Adverse","Possible Disclaimer","Under Evaluation"], mandatory: true, section: "reporting", helpText: "Controls reporting memo path", standardRef: "ISA 705", wpCodes: ["H1"], isHighImpact: true, sortOrder: 109 },
  { key: "kamApplicable", label: "KAM Applicable", fieldType: "toggle", mandatory: true, section: "reporting", helpText: "If Yes, generate KAM documentation template", standardRef: "ISA 701", wpCodes: ["H1"], isHighImpact: true, sortOrder: 110, defaultValue: false },
  { key: "eomOmConsideration", label: "EOM / OM Consideration", fieldType: "toggle", mandatory: true, section: "reporting", helpText: "If Yes, generate EOM/OM evaluation memo", standardRef: "ISA 706", wpCodes: ["H1"], isHighImpact: true, sortOrder: 111, defaultValue: false },
  { key: "otherInformationApplicable", label: "Other Information Applicable", fieldType: "toggle", mandatory: true, section: "reporting", helpText: "If Yes, load ISA 720 checklist", standardRef: "ISA 720", wpCodes: ["H1"], isHighImpact: true, sortOrder: 112, defaultValue: false },
  { key: "otherInformationSources", label: "Other Information Sources", fieldType: "multi-select", options: ["Directors' Report","Chairman Review","Annual Report","Website","Sustainability Report","Donor Report"], mandatory: false, section: "reporting", helpText: "Enabled only if other information applicable", standardRef: "ISA 720", wpCodes: ["H1"], isHighImpact: false, sortOrder: 113, showWhen: { key: "otherInformationApplicable", equals: true } },
  { key: "goingConcernMaterialUncertaintyExpected", label: "Going Concern Material Uncertainty Expected", fieldType: "toggle", mandatory: true, section: "reporting", helpText: "If Yes, report wording and completion memo must change", standardRef: "ISA 570", wpCodes: ["B6","G1","H1"], isHighImpact: true, sortOrder: 114, defaultValue: false },
  { key: "referenceToExpertComponentAuditorInReport", label: "Reference to Expert / Component Auditor in Report", fieldType: "toggle", mandatory: false, section: "reporting", helpText: "If Yes, generate disclosure/evaluation memo", standardRef: "ISA 600, ISA 620", wpCodes: ["H1"], isHighImpact: false, sortOrder: 115, defaultValue: false },
  { key: "reportLanguage", label: "Report Language", fieldType: "dropdown", options: ["English","Urdu","Bilingual"], mandatory: false, section: "reporting", helpText: "Controls final deliverable template", standardRef: "Client requirement", wpCodes: ["H1","H3"], isHighImpact: false, sortOrder: 116 },

  { key: "versionControlOnRevisedUploads", label: "Version Control on Revised Uploads", fieldType: "toggle", mandatory: true, section: "system_controls", helpText: "If Yes, archive superseded files and regenerate linked WPs", standardRef: "ISA 230", wpCodes: ["C1","B7"], isHighImpact: true, sortOrder: 117, defaultValue: true },
  { key: "fsTbGlSourceForWpGeneration", label: "FS/TB/GL Source for WP Generation", fieldType: "dropdown", options: ["TB-Driven","FS-Driven","Both"], mandatory: true, section: "system_controls", helpText: "Controls lead schedules and mapping logic", standardRef: "Practical system rule", wpCodes: ["C1","E1","H1"], isHighImpact: true, sortOrder: 118 },
  { key: "autoRegenerateWpsOnVariableChange", label: "Auto-Regenerate WPs on Variable Change", fieldType: "toggle", mandatory: true, section: "system_controls", helpText: "If Yes, refresh linked WPs when driver variables change", standardRef: "Practical system rule", wpCodes: [], isHighImpact: true, sortOrder: 119, defaultValue: true },
  { key: "finalizationReviewGate", label: "Finalization Review Gate", fieldType: "toggle", mandatory: true, section: "system_controls", helpText: "If Yes, final report blocked until mandatory WPs complete", standardRef: "ISA 220, ISQM 1", wpCodes: ["H1","H2","H3"], isHighImpact: true, sortOrder: 120, defaultValue: true },
  { key: "archiveRetentionLogic", label: "Archive Retention Logic", fieldType: "dropdown", options: ["Standard Firm Policy","PIE Policy","Donor Policy","Custom"], mandatory: false, section: "system_controls", helpText: "Controls archive checklist and closure memo", standardRef: "ISQM 1 / Firm policy", wpCodes: ["H3"], isHighImpact: false, sortOrder: 121 },
];

export function isVariableVisible(v: VariableDef, values: Record<string, any>): boolean {
  if (v.showWhenAny) {
    return v.showWhenAny.some(cond => values[cond.key] === cond.equals);
  }
  if (!v.showWhen) return true;
  const parentVal = values[v.showWhen.key];
  if (v.showWhen.equals !== undefined) return parentVal === v.showWhen.equals;
  if (v.showWhen.notEquals !== undefined) return parentVal !== v.showWhen.notEquals;
  return true;
}

export function getVariablesBySection(sectionId: string): VariableDef[] {
  return VARIABLE_DEFS.filter(v => v.section === sectionId).sort((a, b) => a.sortOrder - b.sortOrder);
}

export interface SectionStatus {
  total: number;
  mandatory: number;
  mandatoryComplete: number;
  optional: number;
  optionalComplete: number;
  status: "not_started" | "in_progress" | "complete";
  triggeredWps: string[];
}

export function getSectionStatus(sectionId: string, values: Record<string, any>): SectionStatus {
  const vars = getVariablesBySection(sectionId);
  const visibleVars = vars.filter(v => isVariableVisible(v, values));
  const mandatoryVars = visibleVars.filter(v => v.mandatory);
  const optionalVars = visibleVars.filter(v => !v.mandatory);

  const mandatoryComplete = mandatoryVars.filter(v => isFieldComplete(v, values[v.key])).length;
  const optionalComplete = optionalVars.filter(v => isFieldComplete(v, values[v.key])).length;
  const totalComplete = mandatoryComplete + optionalComplete;

  const wpSet = new Set<string>();
  visibleVars.forEach(v => {
    const val = values[v.key];
    const active = v.fieldType === "toggle" ? val === true : isFieldComplete(v, val);
    if (active) v.wpCodes.forEach(c => wpSet.add(c));
  });

  let status: SectionStatus["status"] = "not_started";
  if (totalComplete > 0 && mandatoryComplete < mandatoryVars.length) status = "in_progress";
  else if (mandatoryComplete === mandatoryVars.length && mandatoryVars.length > 0) status = "complete";
  else if (totalComplete > 0) status = "in_progress";

  return {
    total: visibleVars.length,
    mandatory: mandatoryVars.length,
    mandatoryComplete,
    optional: optionalVars.length,
    optionalComplete,
    status,
    triggeredWps: Array.from(wpSet).sort(),
  };
}

export function isFieldComplete(v: VariableDef, val: any): boolean {
  if (v.fieldType === "toggle") return val !== undefined;
  if (v.fieldType === "multi-select") return Array.isArray(val) && val.length > 0;
  return val !== undefined && val !== null && val !== "";
}

export function validateAllMandatory(values: Record<string, any>): { valid: boolean; missing: VariableDef[] } {
  const missing: VariableDef[] = [];
  for (const v of VARIABLE_DEFS) {
    if (!v.mandatory) continue;
    if (!isVariableVisible(v, values)) continue;
    if (!isFieldComplete(v, values[v.key])) missing.push(v);
  }
  return { valid: missing.length === 0, missing };
}

export function getAllTriggeredWPs(values: Record<string, any>): string[] {
  const wpSet = new Set<string>();
  for (const v of VARIABLE_DEFS) {
    if (!isVariableVisible(v, values)) continue;
    const val = values[v.key];
    const active = v.fieldType === "toggle" ? val === true : isFieldComplete(v, val);
    if (active) v.wpCodes.forEach(c => wpSet.add(c));
  }
  return Array.from(wpSet).sort();
}

export function getDefaultValues(): Record<string, any> {
  const today = new Date();
  const curMonth = today.getMonth() + 1;
  const curYear = today.getFullYear();
  const fyEndYear = curMonth <= 6 ? curYear - 1 : curYear;
  const d2 = (n: number) => String(n).padStart(2, "0");
  const fmt = (y: number, m: number, day: number) => `${y}-${d2(m)}-${d2(day)}`;

  const defaults: Record<string, any> = {};

  // All toggle variables default to true (comprehensive audit approach — user turns off what doesn't apply)
  for (const v of VARIABLE_DEFS) {
    if (v.fieldType === "toggle") {
      defaults[v.key] = true;
    } else if (v.defaultValue !== undefined) {
      defaults[v.key] = v.defaultValue;
    }
  }

  // Dynamic governance date defaults — all relative to June 30 FY year-end
  defaults.engagementAcceptanceDate          = fmt(fyEndYear, 6, 30);   // FY year-end date
  defaults.managementFsApprovalDate          = fmt(fyEndYear, 9, 30);   // 3 months after year-end
  defaults.boardAuditCommitteeApprovalDate   = fmt(fyEndYear, 10, 31);  // 4 months after year-end
  defaults.subsequentEventsReviewCutoffDate  = fmt(fyEndYear, 9, 30);   // matches audit report date

  return defaults;
}
