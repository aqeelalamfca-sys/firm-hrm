import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import RegulatoryLivePanel from "@/components/regulatory-live-panel";
import {
  Shield, FileText, Banknote, Users, BarChart3, Building2, Globe, ChevronRight,
  CheckCircle2, ArrowRight, Star, Award, BookOpen, Calculator, Briefcase,
  Landmark, TrendingUp, Eye, Target, Heart, Zap, Phone, Mail, MapPin,
  GraduationCap, Clock, Layers, Lock, Search, PieChart, UserCheck, Cpu,
  Menu, X, Factory, Truck, Pickaxe, Clapperboard, Wallet, Utensils, Building,
  Hotel, Ship, Wrench, Newspaper, HandHeart, Fuel, Radio, Pill, BriefcaseBusiness,
  Home, ShoppingCart, Monitor, Plane, Video, Calendar
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Home", href: "#home" },
  { label: "About", href: "#about" },
  { label: "Services", href: "#services" },
  { label: "Industries", href: "#industries" },
  { label: "Team", href: "#team" },
  { label: "Contact", href: "#contact" },
];

const STATS = [
  { value: "1295+", label: "Total Clients", icon: Users },
  { value: "98%", label: "Client Retention", icon: Heart },
  { value: "25+", label: "Industry Sectors", icon: Layers },
  { value: "8+", label: "Years of Service", icon: Clock },
];

const SERVICES = [
  {
    title: "Audit & Assurance",
    desc: "High quality statutory audit, quarterly reviews, cost audits, due diligence, funds audit, government & PSU audits, and special purpose engagements. Internal quality standards and peer review approach ensure the highest auditing standards.",
    icon: Shield,
    color: "bg-blue-500/10 text-blue-600",
    items: ["Statutory Audit", "Due Diligence Reviews", "Cost Audits", "Fixed Asset Verification", "Corporate Governance Compliance", "Government & PSU Audits"],
  },
  {
    title: "Taxation Services",
    desc: "Comprehensive tax counselling — corporate tax compliance, strategic tax planning, FBR tax services, cross-border tax consulting, international tax, expatriate tax services, and VAT registration.",
    icon: Calculator,
    color: "bg-emerald-500/10 text-emerald-600",
    items: ["Income & Corporate Tax", "Sales Tax Registration", "Tax Due Diligence", "International Tax Consultancy", "Expatriate Tax Counselling", "Advance Rulings"],
  },
  {
    title: "Corporate & Secretarial",
    desc: "Complete corporate lifecycle services — from company incorporation to liquidation. SECP corporate services, international corporate structuring, offshore company formation, and regulatory compliance.",
    icon: Building2,
    color: "bg-violet-500/10 text-violet-600",
    items: ["Company Incorporation", "SECP Corporate Services", "Public Listing & Floatation", "Offshore Company Formation", "Drafting Agreements", "Liquidations"],
  },
  {
    title: "Business Advisory",
    desc: "Transaction advisory, business planning, financial modeling, management consulting, business valuation services, foreign investment advisory, and corporate strategy planning.",
    icon: TrendingUp,
    color: "bg-amber-500/10 text-amber-600",
    items: ["Transaction Advisory", "Business Valuation", "Financial Modeling", "Organizational Restructuring", "Mergers & Acquisitions", "Feasibility Studies"],
  },
  {
    title: "Accounting & IFRS",
    desc: "Full range of accounting and bookkeeping services — financial statement preparation, payroll management, global IFRS compliance, fund accounting, and project accounting for small to mid-sized companies.",
    icon: BookOpen,
    color: "bg-rose-500/10 text-rose-600",
    items: ["Financial Statements (IFRS)", "Payroll Management", "Fund Accounting", "Project Accounting", "Accounting Software Setup", "Filing & Archiving"],
  },
  {
    title: "Risk & HR Advisory",
    desc: "Internal audit services, risk consulting using COSO framework, forensic investigations, HR advisory including executive search, salary surveys, and training needs assessments.",
    icon: Lock,
    color: "bg-sky-500/10 text-sky-600",
    items: ["Internal Audit Services", "Forensic Investigations", "SOPs & ISO Certification", "Executive Search", "Salary Benchmarking", "Training Programs"],
  },
];

const INDUSTRIES: { name: string; icon: any; color: string; desc: string; services: string[]; clients: string }[] = [
  { name: "Automotive", icon: Truck, color: "bg-blue-500/10 text-blue-600 border-blue-200", desc: "Comprehensive audit, tax advisory, and compliance services for automotive manufacturers, dealers, and parts suppliers across Pakistan's growing automobile sector.", services: ["Statutory & cost audits", "Sales tax compliance for vehicle sales", "Transfer pricing advisory", "Import duty optimization", "FBR compliance for CKD/SKD units"], clients: "50+" },
  { name: "Chemical", icon: Factory, color: "bg-emerald-500/10 text-emerald-600 border-emerald-200", desc: "Specialized services for chemical and petrochemical companies including regulatory compliance, environmental reporting, and tax planning for complex manufacturing operations.", services: ["Environmental compliance audits", "Cost accounting & process costing", "R&D tax incentive advisory", "Customs & excise advisory", "SECP regulatory compliance"], clients: "35+" },
  { name: "Computer Software", icon: Monitor, color: "bg-violet-500/10 text-violet-600 border-violet-200", desc: "Tailored services for software development houses, IT services companies, and technology startups — from incorporation and tax-exempt registration to international expansion advisory.", services: ["IT/ITeS tax exemption advisory", "Software export documentation", "PSEB registration support", "International corporate structuring", "Revenue recognition under IFRS 15"], clients: "60+" },
  { name: "Construction", icon: Building, color: "bg-amber-500/10 text-amber-600 border-amber-200", desc: "Full-service financial advisory for construction and real estate development firms including project accounting, contract auditing, and builder/developer tax compliance.", services: ["Project-based accounting", "Construction contract audit (IFRS 15)", "WHT compliance for contractors", "FBR builder/developer schemes", "Joint venture structuring"], clients: "45+" },
  { name: "Development", icon: Globe, color: "bg-sky-500/10 text-sky-600 border-sky-200", desc: "Expert services for development sector organizations including donor-funded projects, USAID, DFID, ADB, and World Bank compliance audits and financial management.", services: ["Donor compliance audits", "PEFA assessments", "Grant management advisory", "Public expenditure tracking", "Fiduciary risk assessments"], clients: "40+" },
  { name: "Energy & Mining", icon: Pickaxe, color: "bg-orange-500/10 text-orange-600 border-orange-200", desc: "Specialized audit and tax advisory for energy generation, power distribution, mining, and mineral extraction companies operating under complex regulatory frameworks.", services: ["Power sector regulatory audit", "Mining royalty compliance", "NEPRA tariff advisory", "Capital expenditure audits", "Environmental liability reporting"], clients: "30+" },
  { name: "Entertainment", icon: Clapperboard, color: "bg-pink-500/10 text-pink-600 border-pink-200", desc: "Financial and tax advisory for entertainment companies, media houses, event management firms, and digital content creators navigating Pakistan's evolving media landscape.", services: ["Revenue recognition for media", "WHT on artist payments", "Intellectual property valuation", "Production cost auditing", "Digital content tax advisory"], clients: "20+" },
  { name: "Financial Services", icon: Wallet, color: "bg-indigo-500/10 text-indigo-600 border-indigo-200", desc: "Deep expertise in banking, insurance, microfinance, and fintech sectors with specialized knowledge of SBP regulations, SECP requirements, and IFRS 9 implementation.", services: ["SBP regulatory compliance", "IFRS 9 implementation", "Anti-money laundering audits", "Insurance regulatory audits", "Microfinance institution audits"], clients: "75+" },
  { name: "Food & Beverage", icon: Utensils, color: "bg-red-500/10 text-red-600 border-red-200", desc: "Complete financial services for food manufacturing, processing, restaurant chains, and FMCG companies including inventory management, costing, and regulatory compliance.", services: ["FMCG inventory audits", "Food safety compliance advisory", "Cost of goods sold optimization", "Sales tax on FMCGs", "Franchise structuring advisory"], clients: "55+" },
  { name: "Government", icon: Landmark, color: "bg-slate-500/10 text-slate-600 border-slate-200", desc: "Extensive experience with federal and provincial government agencies, public sector undertakings, and autonomous bodies requiring compliance with government financial rules.", services: ["Government audit (AGP standards)", "PSU financial management", "Public procurement audits", "PSDP project reviews", "Performance audits"], clients: "150+" },
  { name: "Hospitality", icon: Hotel, color: "bg-teal-500/10 text-teal-600 border-teal-200", desc: "Specialized advisory for hotels, resorts, restaurants, and tourism operators covering revenue management, tourism tax compliance, and international hospitality accounting standards.", services: ["Hotel revenue audits", "Tourism tax compliance", "USALI accounting standards", "F&B cost control audits", "Franchise fee structuring"], clients: "25+" },
  { name: "Import & Export", icon: Ship, color: "bg-cyan-500/10 text-cyan-600 border-cyan-200", desc: "End-to-end services for trading companies including customs advisory, WeBOC registration, Letters of Credit documentation, and trade compliance with SBP regulations.", services: ["WeBOC compliance", "Customs duty optimization", "LC documentation advisory", "SBP trade regulations", "Export rebate claims"], clients: "65+" },
  { name: "Manufacturing", icon: Wrench, color: "bg-gray-500/10 text-gray-600 border-gray-200", desc: "Comprehensive services for manufacturing enterprises including cost auditing, inventory management, capacity utilization studies, and industrial tax incentive advisory.", services: ["Cost & management audits", "Manufacturing process review", "Industrial tax incentives", "Fixed asset management", "Standard costing systems"], clients: "80+" },
  { name: "Media & Communication", icon: Newspaper, color: "bg-purple-500/10 text-purple-600 border-purple-200", desc: "Financial advisory and audit services for print media, broadcast companies, digital media platforms, advertising agencies, and telecommunications content providers.", services: ["Media revenue audits", "Advertisement tax compliance", "PEMRA regulatory advisory", "Digital media taxation", "Content licensing audits"], clients: "30+" },
  { name: "NGOs/NPOs/Trusts", icon: HandHeart, color: "bg-rose-500/10 text-rose-600 border-rose-200", desc: "Specialized audit and compliance services for non-profit organizations, charitable trusts, and societies including PCP certification support and donor compliance audits.", services: ["NPO/NGO statutory audits", "PCP certification support", "Donor fund compliance", "EAD reporting requirements", "Trust registration & advisory"], clients: "45+" },
  { name: "Oil & Gas", icon: Fuel, color: "bg-yellow-500/10 text-yellow-600 border-yellow-200", desc: "Expert advisory for upstream, midstream, and downstream oil & gas companies navigating complex regulatory frameworks, production sharing contracts, and OGRA compliance.", services: ["Production sharing audits", "OGRA compliance advisory", "Petroleum levy compliance", "Exploration cost accounting", "JV partner audits"], clients: "20+" },
  { name: "Telecommunications", icon: Radio, color: "bg-blue-500/10 text-blue-600 border-blue-200", desc: "Advisory services for telecom operators, tower companies, and internet service providers including PTA regulatory compliance, spectrum licensing, and IFRS 15 revenue recognition.", services: ["PTA regulatory compliance", "Spectrum fee advisory", "IFRS 15 for telecom", "Tower sharing arrangements", "USF fund compliance"], clients: "15+" },
  { name: "Pharmaceuticals", icon: Pill, color: "bg-green-500/10 text-green-600 border-green-200", desc: "Specialized services for pharmaceutical manufacturers, distributors, and healthcare companies including DRAP compliance, clinical trial accounting, and drug pricing advisory.", services: ["DRAP compliance audits", "Drug pricing compliance", "Clinical trial accounting", "Healthcare revenue audits", "Transfer pricing for pharma"], clients: "40+" },
  { name: "Professional Services", icon: BriefcaseBusiness, color: "bg-indigo-500/10 text-indigo-600 border-indigo-200", desc: "Advisory and audit services for law firms, consulting companies, architectural firms, and other professional services organizations with partnership and LLP structuring expertise.", services: ["Partnership accounting", "LLP structuring advisory", "Professional income taxation", "Revenue recognition advisory", "Partner compensation planning"], clients: "35+" },
  { name: "Real Estate", icon: Home, color: "bg-amber-500/10 text-amber-600 border-amber-200", desc: "Complete financial services for real estate developers, property management companies, and housing authorities including FBR builder schemes, capital gains tax, and REIT advisory.", services: ["FBR builder/developer schemes", "Capital gains tax advisory", "Property valuation", "REIT structuring advisory", "Rental income compliance"], clients: "70+" },
  { name: "Retail & Wholesale", icon: ShoppingCart, color: "bg-emerald-500/10 text-emerald-600 border-emerald-200", desc: "Financial advisory for retail chains, wholesale distributors, and e-commerce businesses covering POS integration, sales tax compliance, and inventory management systems.", services: ["POS/FBR integration", "Sales tax tier compliance", "Inventory management audits", "E-commerce taxation", "Franchise structuring"], clients: "55+" },
  { name: "Technology", icon: Cpu, color: "bg-violet-500/10 text-violet-600 border-violet-200", desc: "Cutting-edge services for technology companies, SaaS providers, and digital platforms including IT/ITeS tax exemptions, international structuring, and startup accounting.", services: ["IT/ITeS tax exemptions", "SaaS revenue recognition", "Startup valuation", "Tech company incorporation", "International expansion advisory"], clients: "50+" },
  { name: "Travel & Hajj Services", icon: Plane, color: "bg-sky-500/10 text-sky-600 border-sky-200", desc: "Specialized services for travel agencies, Hajj/Umrah operators, and tourism companies covering IATA compliance, advance tax on travel agents, and pilgrimage fund accounting.", services: ["IATA compliance advisory", "Hajj/Umrah fund audits", "Travel agent advance tax", "Tour operator licensing", "Foreign exchange compliance"], clients: "25+" },
];

const TEAM = [
  {
    name: "Mr. Aqeel Alam", title: "FCA", role: "Managing Partner", focus: "Audit, Tax & International Advisory", exp: "15 years", bg: "KPMG", initials: "AA",
    bio: "Mr. Aqeel Alam is the founding and Managing Partner of Aqeel Alam & Company, Chartered Accountants, and leads the firm's strategic vision. A Fellow Chartered Accountant (FCA) from ICAP, he brings over 15 years of hands-on experience in audit, taxation, and international financial advisory. Prior to establishing the firm, he served at KPMG where he led engagement teams for major listed companies and multinational corporations.",
    qualifications: ["Fellow Chartered Accountant (FCA) — ICAP", "Member, Institute of Chartered Accountants of Pakistan", "Registered with Audit Oversight Board (AOB)", "ICAP Approved Training Partner"],
    expertise: ["Statutory & Group Audits (ISA/IFRS)", "Corporate Tax Planning & FBR Compliance", "International Financial Advisory", "Business Valuation & Due Diligence", "Company Incorporation & Cross-Border Structuring", "Managing Partner responsibilities including firm strategy and governance"],
    industries: ["Financial Services", "Manufacturing", "Government", "Oil & Gas", "Technology"],
    email: "aqeel@aqeelalam.com",
    location: "Lahore",
  },
  {
    name: "Mr. Bilal Aulakh", title: "FCA", role: "Partner", focus: "Tax & Corporate Services", exp: "14 years", bg: "KPMG", initials: "BA",
    bio: "Mr. Bilal Aulakh is a Fellow Chartered Accountant (FCA) and Partner at Alam & Aulakh, heading the Tax & Corporate Services division. With 14 years of professional experience including significant tenure at KPMG, he specializes in corporate tax planning, FBR compliance, sales tax advisory, and corporate structuring for businesses of all sizes across Pakistan.",
    qualifications: ["Fellow Chartered Accountant (FCA) — ICAP", "Member, Institute of Chartered Accountants of Pakistan", "Certified Tax Practitioner"],
    expertise: ["Corporate Income Tax Planning", "Sales Tax & Federal Excise Advisory", "FBR Compliance & Tax Litigation", "Corporate Restructuring & Mergers", "Transfer Pricing Advisory", "Withholding Tax Compliance"],
    industries: ["Retail & Wholesale", "Import & Export", "Real Estate", "Construction", "Food & Beverage"],
    email: "bilal@aqeelalam.com",
    location: "Lahore",
  },
  {
    name: "Mr. M. Idrees Khattak", title: "FCA", role: "Partner", focus: "Audit & Advisory (ERP/SAP)", exp: "13 years", bg: "Baker Tilly", initials: "IK",
    bio: "Mr. M. Idrees Khattak is a Fellow Chartered Accountant (FCA) and Partner specializing in audit and advisory services with deep expertise in ERP/SAP implementations. With 13 years of experience, including tenure at Baker Tilly International, he brings a unique combination of technical audit skills and technology-driven advisory, helping clients optimize their financial systems and internal controls.",
    qualifications: ["Fellow Chartered Accountant (FCA) — ICAP", "SAP Certified Financial Consultant", "Member, Institute of Chartered Accountants of Pakistan"],
    expertise: ["Statutory & Internal Audits", "ERP/SAP Implementation Advisory", "Internal Controls & SOPs Development", "Risk-Based Audit Methodology", "IFRS Implementation & Transition", "IT Audit & System Reviews"],
    industries: ["Manufacturing", "Energy & Mining", "Telecommunications", "Pharmaceuticals", "Computer Software"],
    email: "idrees@aqeelalam.com",
    location: "Islamabad",
  },
  {
    name: "Ms. Manahil Ahmad", title: "ACA, FMVA", role: "Partner", focus: "International Advisory & Valuation", exp: "10+ years", bg: "Baker Tilly / KPMG", initials: "MA",
    bio: "Ms. Manahil Ahmad is an Associate Chartered Accountant (ACA) and Financial Modelling & Valuation Analyst (FMVA), serving as Partner heading the International Advisory & Valuation practice. With over 10 years of experience at both Baker Tilly and KPMG, she specializes in cross-border corporate structuring, business valuations, financial modelling, and international IFRS advisory for clients expanding globally.",
    qualifications: ["Associate Chartered Accountant (ACA) — ICAP", "Financial Modelling & Valuation Analyst (FMVA) — CFI", "Member, Institute of Chartered Accountants of Pakistan"],
    expertise: ["Business Valuation & Financial Modelling", "Cross-Border Corporate Structuring", "International IFRS Advisory", "Mergers, Acquisitions & Due Diligence", "Foreign Investment Advisory", "Transfer Pricing Documentation"],
    industries: ["Financial Services", "Technology", "Professional Services", "Development", "Hospitality"],
    email: "manahil@aqeelalam.com",
    location: "Lahore",
  },
  {
    name: "Mr. Shan Ibrahim", title: "FCA", role: "Partner", focus: "Audit, Tax & Corporate Planning", exp: "10 years", bg: "RSM International", initials: "SI",
    bio: "Mr. Shan Ibrahim is a Fellow Chartered Accountant (FCA) and Partner with 10 years of experience, including significant tenure at RSM International. He leads engagement teams for audit, tax advisory, and corporate planning assignments, with particular expertise in handling complex group audits, multi-jurisdictional tax planning, and corporate governance advisory for listed and private companies.",
    qualifications: ["Fellow Chartered Accountant (FCA) — ICAP", "Member, Institute of Chartered Accountants of Pakistan", "Corporate Governance Certified"],
    expertise: ["Group & Consolidated Audits", "Multi-Jurisdictional Tax Planning", "Corporate Governance Advisory", "Companies Act Compliance", "Board & Committee Advisory", "Regulatory & SECP Compliance"],
    industries: ["Government", "NGOs/NPOs/Trusts", "Chemical", "Automotive", "Media & Communication"],
    email: "shan@aqeelalam.com",
    location: "Islamabad",
  },
  {
    name: "Mr. Anwaar Haider", title: "ACA", role: "Partner", focus: "Audit, IFRS & Forensic Accounting", exp: "7 years", bg: "KPMG", initials: "AH",
    bio: "Mr. Anwaar Haider is an Associate Chartered Accountant (ACA) and Partner specializing in audit, IFRS advisory, and forensic accounting. With 7 years of experience including service at KPMG, he brings sharp analytical skills and deep knowledge of international financial reporting standards. He leads the firm's forensic accounting practice, conducting financial investigations and fraud risk assessments for corporate clients.",
    qualifications: ["Associate Chartered Accountant (ACA) — ICAP", "Member, Institute of Chartered Accountants of Pakistan", "Certified Forensic Accountant"],
    expertise: ["IFRS Implementation & Advisory", "Forensic Accounting & Investigations", "Fraud Risk Assessment", "Anti-Money Laundering Compliance", "Special Purpose Audits", "Revenue Recognition (IFRS 15/16)"],
    industries: ["Financial Services", "Oil & Gas", "Entertainment", "Travel & Hajj Services", "Real Estate"],
    email: "anwaar@aqeelalam.com",
    location: "Lahore",
  },
];

const PARTNERS = TEAM.filter(t => t.role.includes("Partner"));

const MILESTONES = [
  { year: "2016", title: "Foundation", desc: "Firm established as M/s. Aqeel Alam & Co. in Lahore" },
  { year: "2019", title: "AOB Registration", desc: "Registered with Audit Oversight Board (AOB)" },
  { year: "2020", title: "Rebranding", desc: "Renamed to Alam & Aulakh, expanding services" },
  { year: "2023", title: "Global Expansion", desc: "Enhanced focus on global IFRS and international structuring" },
];

export default function Landing() {
  const [activeTab, setActiveTab] = useState("about");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [selectedIndustry, setSelectedIndustry] = useState<typeof INDUSTRIES[0] | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<typeof TEAM[0] | null>(null);
  const [selectedBookingPartner, setSelectedBookingPartner] = useState<string | null>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? "bg-background/90 backdrop-blur-xl shadow-lg shadow-black/[0.03] border-b border-border/20" : "bg-transparent"}`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/[0.06] flex items-center justify-center">
              <img src={`${import.meta.env.BASE_URL}images/logo-icon.png`} alt="Alam & Aulakh" className="h-6 w-auto object-contain" />
            </div>
            <span className="text-lg font-bold tracking-tight">Alam & Aulakh</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(({ label, href }) => (
              <button key={label} onClick={() => scrollTo(href.slice(1))} className="px-3 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors">
                {label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/book-meeting">
              <Button size="sm" variant="outline" className="h-9 text-[13px] font-semibold gap-1.5 hidden sm:flex border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-400 transition-all duration-200">
                <Video className="w-3.5 h-3.5" /> Book Meeting
              </Button>
            </Link>
            <Link href="/apply-training">
              <Button size="sm" variant="outline" className="h-9 text-[13px] font-semibold gap-1.5 hidden sm:flex border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400 transition-all duration-200">
                <GraduationCap className="w-3.5 h-3.5" /> Apply for Training
              </Button>
            </Link>
            <Link href="/login">
              <Button size="sm" className="h-9 text-[13px] font-semibold shadow-sm gap-1.5">
                Staff Sign In <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
            <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}>
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden bg-background/95 backdrop-blur-md border-t border-border/30 px-6 py-3 space-y-1">
            {NAV_ITEMS.map(({ label, href }) => (
              <button key={label} onClick={() => scrollTo(href.slice(1))} className="block w-full text-left px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50">
                {label}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="fixed top-16 left-0 right-0 z-40">
        <RegulatoryLivePanel />
      </div>

      {/* Hero Section */}
      <section id="home" className="relative pt-28 pb-10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] via-primary/[0.01] to-transparent" />
        <div className="absolute top-10 right-0 w-[600px] h-[600px] bg-blue-500/[0.05] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-violet-500/[0.04] rounded-full blur-[100px]" />
        <div className="absolute top-40 left-1/4 w-[300px] h-[300px] bg-emerald-500/[0.03] rounded-full blur-[80px]" />
        <div className="relative max-w-7xl mx-auto px-6">

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-6 lg:gap-8 items-start">

            {/* LEFT COLUMN — Metrics & Expertise */}
            <div className="hidden lg:flex flex-col gap-4 pt-4">
              <div className="rounded-xl border border-border/40 bg-card/80 backdrop-blur-sm p-4 shadow-sm">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-3">Proven Track Record</h3>
                <div className="space-y-3">
                  {[
                    { val: "PKR 500B+", label: "Assets Audited", icon: BarChart3, color: "text-blue-600 bg-blue-50" },
                    { val: "PKR 200B+", label: "Revenue Managed", icon: TrendingUp, color: "text-emerald-600 bg-emerald-50" },
                    { val: "PKR 50B+", label: "Deal Value", icon: Briefcase, color: "text-violet-600 bg-violet-50" },
                  ].map(m => (
                    <div key={m.label} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${m.color}`}>
                        <m.icon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{m.val}</p>
                        <p className="text-[10px] text-slate-500">{m.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border/40 bg-card/80 backdrop-blur-sm p-4 shadow-sm">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-3">Core Expertise</h3>
                <div className="flex flex-wrap gap-1.5">
                  {["Audit & Assurance", "Tax Planning", "IFRS Compliance", "Corporate Advisory", "Forensic Accounting", "Business Valuation"].map(tag => (
                    <span key={tag} className="text-[10px] font-semibold px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border/40 bg-card/80 backdrop-blur-sm p-4 shadow-sm">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-3">Industries We Serve</h3>
                <div className="flex flex-wrap gap-1.5">
                  {["Financial Services", "Oil & Gas", "Manufacturing", "Technology", "Real Estate", "Government", "Pharmaceuticals", "Energy & Mining"].map(ind => (
                    <span key={ind} className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      {ind}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border/40 bg-card/80 backdrop-blur-sm p-4 shadow-sm">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-3">Trust Signals</h3>
                <div className="space-y-2.5">
                  {[
                    { icon: Shield, text: "Big Four Trained Partners" },
                    { icon: Users, text: "6 Expert Partners" },
                    { icon: Award, text: "Since 2016" },
                    { icon: Globe, text: "International Reach" },
                  ].map(t => (
                    <div key={t.text} className="flex items-center gap-2.5 text-[12px] text-slate-600">
                      <t.icon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>{t.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={() => scrollTo("about")} className="rounded-xl border border-emerald-200/50 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm text-left hover:shadow-md transition-all duration-200 group w-full">
                <div className="flex items-center gap-2 mb-1">
                  <GraduationCap className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-600">Training Program</h3>
                </div>
                <p className="text-[12px] text-slate-600 leading-relaxed">
                  ICAP &amp; ICAEW approved — launch your CA career with us.
                </p>
              </button>
            </div>

            {/* CENTER COLUMN — Logo, Tagline, Certifications, CTA */}
            <div className="text-center">
              <div className="flex justify-center mb-5">
                <div className="inline-flex items-center gap-4 sm:gap-5">
                  <img
                    src={`${import.meta.env.BASE_URL}images/hero-logo.png`}
                    alt="Alam & Aulakh Chartered Accountants"
                    className="h-14 sm:h-18 lg:h-20 w-auto object-contain"
                  />
                  <div className="text-left border-l-2 border-blue-500/30 pl-4 sm:pl-5">
                    <h2 className="text-lg sm:text-2xl lg:text-[26px] font-bold tracking-wide text-slate-800 leading-tight">
                      Alam <span className="text-blue-600">&amp;</span> Aulakh
                    </h2>
                    <p className="text-[9px] sm:text-[11px] font-semibold tracking-[0.25em] text-slate-500 uppercase mt-0.5">
                      Chartered Accountants
                    </p>
                  </div>
                </div>
              </div>

              <div className="max-w-xl mx-auto mb-4 px-4 py-2 rounded-xl border border-blue-200/40 bg-gradient-to-r from-blue-50/60 via-white/80 to-blue-50/60 tagline-glow">
                <p className="text-[10px] sm:text-[12px] text-slate-600 font-semibold leading-relaxed tracking-wide">
                  Statutory Audit &amp; Assurance for{" "}
                  <span className="text-blue-700">Listed Entities</span>,{" "}
                  <span className="text-blue-700">PIEs</span>,{" "}
                  <span className="text-blue-700">PICs</span>,{" "}
                  Corporates of All Sizes &amp;{" "}
                  <span className="text-blue-700">Not-for-Profit &amp; Trust Structures</span>
                </p>
              </div>

              <div className="flex flex-wrap gap-2 justify-center mb-6">
                {[
                  { label: "QCR Rated", color: "bg-slate-50 text-slate-700 border-slate-200" },
                  { label: "ICAEW Authorized Employer", color: "bg-slate-50 text-slate-700 border-slate-200" },
                  { label: "ICAP Approved Training Org", color: "bg-slate-50 text-slate-700 border-slate-200" },
                  { label: "AOB Registered", color: "bg-slate-50 text-slate-700 border-slate-200" },
                ].map((cred) => (
                  <span key={cred.label} className={`inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold px-3 py-1 rounded-full border ${cred.color}`}>
                    <CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0" />
                    {cred.label}
                  </span>
                ))}
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.08] mb-4">
                Leading Chartered
                <br />
                <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-violet-500 bg-clip-text text-transparent">Accountants Firm</span>
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-lg mx-auto mb-6">
                Expert audit, tax, and financial &amp; corporate advisory services with firm commitment — your trusted partner in Pakistan and beyond.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Link href="/login">
                  <Button size="lg" className="h-11 px-6 text-sm font-semibold gap-2 rounded-xl" style={{ background: 'linear-gradient(135deg, hsl(217 78% 51%) 0%, hsl(217 78% 42%) 100%)', boxShadow: '0 4px 16px rgba(59,130,246,0.3)' }}>
                    Get Started <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <button onClick={() => scrollTo("services")} className="h-11 px-6 text-sm font-semibold border border-border/50 rounded-xl bg-card hover:bg-muted/50 transition-all duration-200 inline-flex items-center gap-2 shadow-sm">
                  Our Services <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* RIGHT COLUMN — CTA Panel, Contact, Trust */}
            <div className="hidden lg:flex flex-col gap-4 pt-4">
              <div className="rounded-xl border border-blue-200/50 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-blue-600 mb-3">Book a Consultation</h3>
                <p className="text-[12px] text-slate-600 leading-relaxed mb-3">
                  Get expert advice from our partners with Big Four experience.
                </p>
                <button onClick={() => scrollTo("contact")} className="w-full h-9 text-xs font-semibold rounded-lg text-white flex items-center justify-center gap-1.5" style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' }}>
                  <Phone className="w-3.5 h-3.5" /> Schedule Meeting
                </button>
              </div>

              <a href="https://www.auditwise.tech" target="_blank" rel="noopener noreferrer" className="rounded-xl border border-violet-200/50 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm hover:shadow-md transition-all duration-200 group block">
                <div className="flex items-center gap-2 mb-2">
                  <Monitor className="w-4 h-4 text-violet-600" />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-violet-600">Audit Software</h3>
                </div>
                <p className="text-[12px] text-slate-600 leading-relaxed mb-3">
                  Our proprietary audit management platform for efficient engagements.
                </p>
                <span className="w-full h-8 text-[11px] font-semibold rounded-lg text-white flex items-center justify-center gap-1.5" style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' }}>
                  <Monitor className="w-3.5 h-3.5" /> Launch AuditWise
                </span>
              </a>

              <Link href="/tax-calculator" className="rounded-xl border border-blue-200/50 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm hover:shadow-md transition-all duration-200 group block">
                <div className="flex items-center gap-2 mb-2">
                  <Calculator className="w-4 h-4 text-blue-600" />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-blue-600">Tax Calculator</h3>
                </div>
                <p className="text-[12px] text-slate-600 leading-relaxed mb-3">
                  WHT &amp; Income Tax calculator — Finance Act 2025 rates.
                </p>
                <span className="w-full h-8 text-[11px] font-semibold rounded-lg text-white flex items-center justify-center gap-1.5 bg-gradient-to-r from-blue-600 to-blue-700">
                  <Calculator className="w-3.5 h-3.5" /> Calculate Now
                </span>
              </Link>
            </div>

          </div>

          <style>{`
            @keyframes tagline-shimmer {
              0%, 100% { box-shadow: 0 0 8px rgba(59,130,246,0.08), 0 0 0 1px rgba(59,130,246,0.06); }
              50% { box-shadow: 0 0 20px rgba(59,130,246,0.18), 0 0 0 1px rgba(59,130,246,0.15); }
            }
            .tagline-glow { animation: tagline-shimmer 2.5s ease-in-out infinite; }
            @media (prefers-reduced-motion: reduce) { .tagline-glow { animation: none; } }
          `}</style>

          {/* Stats Bar */}
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {STATS.map(({ value, label, icon: Icon }, idx) => (
              <div key={label} className="flex items-center gap-3.5 p-5 rounded-2xl bg-card border border-border/30 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${idx === 0 ? 'bg-blue-500/10' : idx === 1 ? 'bg-emerald-500/10' : idx === 2 ? 'bg-violet-500/10' : 'bg-amber-500/10'}`}>
                  <Icon className={`w-5 h-5 ${idx === 0 ? 'text-blue-600' : idx === 1 ? 'text-emerald-600' : idx === 2 ? 'text-violet-600' : 'text-amber-600'}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold tracking-tight">{value}</p>
                  <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Book a Partner Meeting — Compact */}
          <div className="mt-8 rounded-2xl bg-white border border-slate-200/80 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-5 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-700">
              <div className="flex items-center gap-2.5">
                <Video className="w-4 h-4 text-white/80" />
                <span className="text-white font-semibold text-[13px]">Book a Partner Meeting</span>
                {selectedBookingPartner ? (
                  <span className="text-emerald-300 text-[11px] font-semibold hidden sm:inline">— {selectedBookingPartner} selected</span>
                ) : (
                  <span className="text-blue-200/50 text-[11px] font-medium hidden sm:inline">— Select a partner below</span>
                )}
              </div>
              <Link href={`/book-meeting${selectedBookingPartner ? `?partner=${encodeURIComponent(selectedBookingPartner)}` : ''}`}>
                <Button size="sm" className={`h-7 px-4 text-[11px] font-semibold rounded-lg border-0 backdrop-blur-sm transition-all ${selectedBookingPartner ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30' : 'bg-white/15 hover:bg-white/25 text-white'}`}>
                  <Calendar className="w-3 h-3 mr-1.5" /> {selectedBookingPartner ? 'Book Now' : 'Schedule'}
                </Button>
              </Link>
            </div>
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-2 overflow-x-auto">
                {PARTNERS.map((p, idx) => {
                  const colors = [
                    "from-blue-500 to-blue-600",
                    "from-indigo-500 to-indigo-600",
                    "from-violet-500 to-violet-600",
                    "from-purple-500 to-purple-600",
                    "from-sky-500 to-sky-600",
                    "from-blue-600 to-indigo-600",
                  ];
                  const isSelected = selectedBookingPartner === p.name;
                  return (
                    <div
                      key={p.name}
                      onClick={() => setSelectedBookingPartner(isSelected ? null : p.name)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all cursor-pointer group min-w-0 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/30 shadow-md'
                          : 'border-slate-100 hover:border-blue-200/60 hover:bg-blue-50/30'
                      }`}
                    >
                      <div className="relative shrink-0">
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${colors[idx % colors.length]} flex items-center justify-center text-[10px] font-bold text-white transition-transform ${isSelected ? 'scale-110' : 'group-hover:scale-110'}`}>
                          {p.initials}
                        </div>
                        {isSelected && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center ring-2 ring-white">
                            <CheckCircle2 className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-[11px] font-semibold truncate ${isSelected ? 'text-blue-700' : 'text-slate-800 group-hover:text-blue-700'}`}>{p.name}</p>
                        <p className="text-[9px] text-slate-400 font-medium truncate">{p.focus}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Section with Tabs */}
      <section id="about" className="py-20 bg-muted/20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <Badge className="mb-3 bg-violet-500/[0.06] text-violet-600 border-violet-200/60 text-xs font-semibold px-4 py-1.5 rounded-full">About Us</Badge>
            <h2 className="text-3xl font-bold tracking-tight mb-3">Building Excellence in Chartered Accountancy</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-sm">
              From M/s. Aqeel Alam & Co. established in 2016 to Alam & Aulakh — our journey reflects
              continuous growth and commitment to professional excellence.
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="max-w-4xl mx-auto">
            <TabsList className="grid grid-cols-4 bg-card border border-border/40 p-1 rounded-xl h-auto mb-8">
              {[
                { key: "about", label: "Our Story", icon: BookOpen },
                { key: "vision", label: "Vision & Mission", icon: Eye },
                { key: "values", label: "Core Values", icon: Star },
                { key: "journey", label: "Journey", icon: TrendingUp },
              ].map(({ key, label, icon: Icon }) => (
                <TabsTrigger key={key} value={key} className="text-xs sm:text-sm px-2 py-2 rounded-lg data-[state=active]:shadow-sm gap-1.5 flex items-center">
                  <Icon className="w-3.5 h-3.5 hidden sm:block" /> {label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="about">
              <Card className="border-border/40 shadow-xs">
                <CardContent className="p-8">
                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <h3 className="text-xl font-bold mb-4">Who We Are</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                        Alam & Aulakh is a distinguished Chartered Accountant firm with principal offices
                        in Islamabad and Lahore. We established our firm with the aim to create value for
                        our clients by delivering quality, comprehensive, timely, practical and innovative
                        services at evenhanded rates.
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        We are a team of distinguished Chartered Accountants and Corporate Advisors adept
                        at providing an extensive range of professional services and a high degree of
                        specialization to both domestic and international clients.
                      </p>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
                        <Award className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-blue-800">ICAP Approved Training Organization</p>
                          <p className="text-xs text-blue-600">Authorized by the Institute of Chartered Accountants of Pakistan</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                        <Globe className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-emerald-800">ICAEW Authorized Training Employer</p>
                          <p className="text-xs text-emerald-600">Recognized internationally for professional development</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-4 rounded-xl bg-violet-50 border border-violet-100">
                        <Shield className="w-5 h-5 text-violet-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-violet-800">Big Four Experience</p>
                          <p className="text-xs text-violet-600">Team members with extensive KPMG, Baker Tilly & RSM backgrounds</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="vision">
              <Card className="border-border/40 shadow-xs">
                <CardContent className="p-8">
                  <div className="grid md:grid-cols-2 gap-8">
                    <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/5 to-primary/[0.02] border border-primary/10">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                        <Eye className="w-6 h-6 text-primary" />
                      </div>
                      <h3 className="text-lg font-bold mb-3">Our Vision</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        To be our clients' most trusted professional partner, providing comprehensive
                        multinational audit services, expert cross-border tax consulting, and strategic
                        international financial advisory. We uphold excellence and integrity in every
                        engagement, serving clients across Pakistan and globally.
                      </p>
                    </div>
                    <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-500/5 to-emerald-500/[0.02] border border-emerald-500/10">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4">
                        <Target className="w-6 h-6 text-emerald-600" />
                      </div>
                      <h3 className="text-lg font-bold mb-3">Our Mission</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        To create value for our clients, our people and the firm by providing international
                        professional services. We aim to be recognized as thought leaders, bringing global
                        perspectives to local markets and empowering Pakistani businesses to compete
                        internationally.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="values">
              <Card className="border-border/40 shadow-xs">
                <CardContent className="p-8">
                  <div className="grid sm:grid-cols-3 gap-6">
                    {[
                      { title: "Excellence", desc: "We deliver the highest quality audit and advisory services, ensuring international IFRS compliance through advanced training and technical expertise.", icon: Star, color: "text-amber-600 bg-amber-50 border-amber-100" },
                      { title: "Integrity", desc: "Serving clients earnestly with unwavering concern for their best interests and public responsibility in all tax consulting and financial advisory services.", icon: Heart, color: "text-rose-600 bg-rose-50 border-rose-100" },
                      { title: "Innovation", desc: "We continuously invest in technology, education, and business relationships to enhance our business advisory, FBR tax, SECP corporate, and international setup capabilities.", icon: Zap, color: "text-violet-600 bg-violet-50 border-violet-100" },
                    ].map(({ title, desc, icon: Icon, color }) => (
                      <div key={title} className={`p-5 rounded-2xl border ${color}`}>
                        <Icon className="w-8 h-8 mb-3" />
                        <h4 className="text-base font-bold mb-2">{title}</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 p-5 rounded-2xl bg-muted/40 border border-border/40">
                    <h4 className="text-sm font-bold mb-2">Our Commitment</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Our commitment is to deliver excellent service, on schedule, at a reasonable, affordable cost.
                      Our constant investment of time and resources in continued professional education, state-of-the-art
                      technology and extensive business relationships is indicative of our commitment to excellence.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="journey">
              <Card className="border-border/40 shadow-xs">
                <CardContent className="p-8">
                  <div className="space-y-0">
                    {MILESTONES.map((m, i) => (
                      <div key={m.year} className="flex gap-4 pb-6 last:pb-0">
                        <div className="flex flex-col items-center">
                          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                            {m.year.slice(2)}
                          </div>
                          {i < MILESTONES.length - 1 && <div className="w-px h-full bg-border mt-2" />}
                        </div>
                        <div className="pt-1.5">
                          <p className="text-xs text-muted-foreground font-medium">{m.year}</p>
                          <h4 className="text-sm font-bold mb-1">{m.title}</h4>
                          <p className="text-xs text-muted-foreground">{m.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <Badge className="mb-3 bg-emerald-500/[0.06] text-emerald-600 border-emerald-200/60 text-xs font-semibold px-4 py-1.5 rounded-full">Services</Badge>
            <h2 className="text-3xl font-bold tracking-tight mb-3">Comprehensive Service Portfolio</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-sm">
              Expert financial solutions for businesses operating locally and internationally — from
              traditional audit to cutting-edge corporate structuring.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SERVICES.map(({ title, desc, icon: Icon, color, items }) => (
              <Card key={title} className="border-border/30 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group rounded-2xl overflow-hidden">
                <CardContent className="p-6">
                  <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold mb-2 group-hover:text-primary transition-colors">{title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4">{desc}</p>
                  <div className="space-y-1.5">
                    {items.map(item => (
                      <div key={item} className="flex items-center gap-2 text-xs text-foreground/70">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Track Record */}
      <section className="py-20 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, hsl(224 40% 14%) 0%, hsl(217 78% 22%) 50%, hsl(224 40% 10%) 100%)' }}>
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-blue-500/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-violet-500/8 rounded-full blur-[80px]" />
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight mb-3">Proven Track Record</h2>
            <p className="text-white/60 max-w-2xl mx-auto text-sm">
              Delivering excellence across Pakistan and beyond since 2016.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { value: "PKR 500B+", label: "Assets Audited", desc: "Led audit & assurance for companies with combined assets exceeding PKR 500 billion" },
              { value: "PKR 200B+", label: "Revenue Managed", desc: "Managed FBR tax services and corporate tax compliance for businesses with aggregate annual revenues" },
              { value: "PKR 50B+", label: "Deal Value", desc: "Facilitated corporate transactions, company incorporation, and business valuations" },
            ].map(({ value, label, desc }) => (
              <div key={label} className="text-center p-7 rounded-2xl bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm hover:bg-white/[0.06] transition-all duration-300">
                <p className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-blue-300 bg-clip-text text-transparent mb-1">{value}</p>
                <p className="text-sm font-semibold text-white/90 mb-2">{label}</p>
                <p className="text-xs text-white/55 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            {[
              { value: "150+", label: "Government & Public Sector Projects" },
              { value: "85+", label: "International Clients" },
              { value: "12", label: "Provinces Covered" },
              { value: "500+", label: "Professionals Trained" },
            ].map(({ value, label }) => (
              <div key={label} className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <p className="text-xl font-bold text-blue-400">{value}</p>
                <p className="text-[11px] text-white/60 leading-tight">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Industries Section */}
      <section id="industries" className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <Badge className="mb-3 bg-amber-500/[0.06] text-amber-600 border-amber-200/60 text-xs font-semibold px-4 py-1.5 rounded-full">Industries</Badge>
            <h2 className="text-3xl font-bold tracking-tight mb-3">Industry Expertise</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-sm">
              Comprehensive coverage across diverse industries nationwide with deep domain expertise.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5 justify-center max-w-4xl mx-auto">
            {INDUSTRIES.map(ind => {
              const Icon = ind.icon;
              return (
                <button
                  key={ind.name}
                  onClick={() => setSelectedIndustry(ind)}
                  className="group flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-medium bg-card text-foreground/70 border border-border/30 shadow-sm hover:bg-primary/[0.04] hover:text-primary hover:border-primary/25 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                >
                  <Icon className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
                  {ind.name}
                </button>
              );
            })}
          </div>

          <Dialog open={!!selectedIndustry} onOpenChange={(open) => !open && setSelectedIndustry(null)}>
            <DialogContent className="max-w-lg">
              {selectedIndustry && (() => {
                const Icon = selectedIndustry.icon;
                return (
                  <>
                    <DialogHeader>
                      <div className="flex items-center gap-3 mb-1">
                        <div className={`w-11 h-11 rounded-xl ${selectedIndustry.color} flex items-center justify-center border`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <DialogTitle className="text-lg">{selectedIndustry.name}</DialogTitle>
                          <p className="text-xs text-muted-foreground font-medium">{selectedIndustry.clients} Clients Served</p>
                        </div>
                      </div>
                    </DialogHeader>
                    <DialogDescription className="text-sm text-foreground/70 leading-relaxed mt-1">
                      {selectedIndustry.desc}
                    </DialogDescription>
                    <div className="mt-4">
                      <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-3">Key Services</h4>
                      <div className="space-y-2">
                        {selectedIndustry.services.map(svc => (
                          <div key={svc} className="flex items-start gap-2.5 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            <span className="text-foreground/80">{svc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-5 pt-4 border-t border-border/40">
                      <Link href="/login">
                        <Button size="sm" className="w-full gap-2">
                          Get Expert Advisory <ArrowRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  </>
                );
              })()}
            </DialogContent>
          </Dialog>
        </div>
      </section>

      {/* Leadership Team */}
      <section id="team" className="py-20 bg-muted/20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <Badge className="mb-3 bg-rose-500/[0.06] text-rose-600 border-rose-200/60 text-xs font-semibold px-4 py-1.5 rounded-full">Leadership</Badge>
            <h2 className="text-3xl font-bold tracking-tight mb-3">Our Leadership Team</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-sm">
              Six partners bringing extensive Big Four experience — providing top-tier audit, tax,
              and strategic consulting from Lahore and Islamabad.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {TEAM.map((member, idx) => (
              <Card
                key={member.name}
                className="border-border/30 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer group rounded-2xl overflow-hidden"
                onClick={() => setSelectedPartner(member)}
              >
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 rounded-2xl text-white flex items-center justify-center text-lg font-bold shrink-0 group-hover:scale-105 transition-transform duration-300" style={{ background: `linear-gradient(135deg, ${['hsl(217 78% 54%)', 'hsl(160 60% 42%)', 'hsl(262 70% 55%)', 'hsl(38 92% 52%)', 'hsl(0 72% 55%)', 'hsl(200 70% 50%)'][idx]} 0%, ${['hsl(217 78% 42%)', 'hsl(160 60% 34%)', 'hsl(262 70% 42%)', 'hsl(38 92% 42%)', 'hsl(0 72% 42%)', 'hsl(200 70% 38%)'][idx]} 100%)` }}>
                      {member.initials}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold group-hover:text-primary transition-colors">{member.name}</h4>
                      <p className="text-[11px] text-primary font-semibold">{member.title}</p>
                      <p className="text-xs text-muted-foreground">{member.role}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{member.focus}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="px-2.5 py-1 rounded-full bg-muted/50 text-muted-foreground font-medium">{member.exp}</span>
                      <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">{member.bg}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/40 group-hover:text-primary transition-colors">View Profile →</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Dialog open={!!selectedPartner} onOpenChange={(open) => !open && setSelectedPartner(null)}>
            <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
              {selectedPartner && (
                <>
                  <DialogHeader>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-xl font-bold shrink-0">
                        {selectedPartner.initials}
                      </div>
                      <div>
                        <DialogTitle className="text-lg">{selectedPartner.name}</DialogTitle>
                        <p className="text-sm text-primary font-semibold">{selectedPartner.title}</p>
                        <p className="text-xs text-muted-foreground">{selectedPartner.role}</p>
                      </div>
                    </div>
                  </DialogHeader>

                  <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground font-medium">
                      <Clock className="w-3 h-3" /> {selectedPartner.exp}
                    </span>
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">
                      <Briefcase className="w-3 h-3" /> {selectedPartner.bg}
                    </span>
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                      <MapPin className="w-3 h-3" /> {selectedPartner.location}
                    </span>
                  </div>

                  <DialogDescription className="text-sm text-foreground/70 leading-relaxed mt-4">
                    {selectedPartner.bio}
                  </DialogDescription>

                  <div className="mt-5">
                    <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-3">Qualifications</h4>
                    <div className="space-y-2">
                      {selectedPartner.qualifications.map(q => (
                        <div key={q} className="flex items-start gap-2.5 text-sm">
                          <GraduationCap className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <span className="text-foreground/80">{q}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5">
                    <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-3">Areas of Expertise</h4>
                    <div className="space-y-2">
                      {selectedPartner.expertise.map(e => (
                        <div key={e} className="flex items-start gap-2.5 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span className="text-foreground/80">{e}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5">
                    <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-3">Industry Focus</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedPartner.industries.map(ind => (
                        <span key={ind} className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/5 text-primary border border-primary/10">
                          {ind}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-border/40 flex items-center gap-3">
                    <a href={`mailto:${selectedPartner.email}`} className="flex-1">
                      <Button size="sm" className="w-full gap-2">
                        <Mail className="w-4 h-4" /> Contact {selectedPartner.name.split(" ")[1]}
                      </Button>
                    </a>
                    <a href="tel:0321-111-2041">
                      <Button size="sm" variant="outline" className="gap-2">
                        <Phone className="w-4 h-4" /> Call
                      </Button>
                    </a>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>

          <div className="mt-8 grid sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
            <div className="text-center p-4 rounded-xl bg-card border border-border/40">
              <p className="text-2xl font-bold text-primary">6</p>
              <p className="text-[11px] text-muted-foreground font-medium">Expert Partners</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-card border border-border/40">
              <p className="text-2xl font-bold text-primary">10+</p>
              <p className="text-[11px] text-muted-foreground font-medium">Avg. Years Experience</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-card border border-border/40">
              <p className="text-2xl font-bold text-primary">2</p>
              <p className="text-[11px] text-muted-foreground font-medium">Strategic Locations</p>
            </div>
          </div>
        </div>
      </section>

      {/* Memberships */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-8">
            <h3 className="text-lg font-bold mb-2">Prestigious Professional Memberships</h3>
          </div>
          <div className="flex flex-wrap justify-center gap-4 max-w-3xl mx-auto">
            {[
              { abbr: "ICAP", name: "Institute of Chartered Accountants of Pakistan" },
              { abbr: "ACCA", name: "Association of Chartered Certified Accountants" },
              { abbr: "CPA", name: "Certified Public Accountants" },
              { abbr: "TBA", name: "Tax Bar Association" },
              { abbr: "HCBA", name: "High Court Bar Association" },
            ].map(({ abbr, name }) => (
              <div key={abbr} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border/40 shadow-xs">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                  {abbr.slice(0, 2)}
                </div>
                <div>
                  <p className="text-xs font-bold">{abbr}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20 bg-muted/20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <Badge className="mb-3 bg-primary/[0.06] text-primary border-primary/15 text-xs font-semibold px-4 py-1.5 rounded-full">Contact</Badge>
              <h2 className="text-3xl font-bold tracking-tight mb-3">Connect with Pakistan's Leading Chartered Accountants</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto text-sm">
                Contact us for expert audit, tax, corporate, and strategic business advisory services.
                Tailored financial solutions and robust accounting support for your business needs.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-5 mb-10">
              <Card className="border-border/30 shadow-sm text-center rounded-2xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                <CardContent className="p-7">
                  <div className="w-13 h-13 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4" style={{ width: 52, height: 52 }}>
                    <MapPin className="w-5 h-5 text-blue-600" />
                  </div>
                  <h4 className="text-sm font-bold mb-1">Head Office — Lahore</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Suite # 5 & 6, Ground Floor, New 1-Campus, Ross Residencia, Canal Road, Lahore, Punjab 54000
                  </p>
                  <p className="text-xs text-primary font-semibold mt-3">0423-7459-666</p>
                </CardContent>
              </Card>
              <Card className="border-border/30 shadow-sm text-center rounded-2xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                <CardContent className="p-7">
                  <div className="rounded-xl bg-violet-500/10 flex items-center justify-center mx-auto mb-4" style={{ width: 52, height: 52 }}>
                    <Building2 className="w-5 h-5 text-violet-600" />
                  </div>
                  <h4 className="text-sm font-bold mb-1">Islamabad Office</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    16th Floor, State Life Building No. 5, F-6, Jinnah Avenue, Islamabad
                  </p>
                  <p className="text-xs text-primary font-semibold mt-3">051-8357-873</p>
                </CardContent>
              </Card>
              <Card className="border-border/30 shadow-sm text-center rounded-2xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                <CardContent className="p-7">
                  <div className="rounded-xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4" style={{ width: 52, height: 52 }}>
                    <UserCheck className="w-5 h-5 text-emerald-600" />
                  </div>
                  <h4 className="text-sm font-bold mb-1">Focal Partner</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Mr. Aqeel Alam, FCA<br />Managing Partner
                  </p>
                  <p className="text-xs text-primary font-semibold mt-3">0321-111-2041</p>
                  <p className="text-xs text-muted-foreground">info@aqeelalam.com</p>
                </CardContent>
              </Card>
            </div>

            <div className="text-center">
              <Link href="/login">
                <Button size="lg" className="h-12 px-8 text-sm font-semibold gap-2 rounded-xl" style={{ background: 'linear-gradient(135deg, hsl(217 78% 51%) 0%, hsl(217 78% 42%) 100%)', boxShadow: '0 4px 16px rgba(59,130,246,0.3)' }}>
                  Access Portal <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/20" style={{ background: 'linear-gradient(180deg, hsl(220 20% 97%) 0%, hsl(220 20% 93%) 100%)' }}>
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <img src={`${import.meta.env.BASE_URL}images/logo-icon.png`} alt="Alam & Aulakh" className="h-7 w-auto object-contain" />
                <div>
                  <p className="text-sm font-bold text-slate-800">Alam &amp; Aulakh</p>
                  <p className="text-[10px] text-slate-500 font-medium tracking-wider uppercase">Chartered Accountants</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Premier CA firm providing audit, tax, and financial advisory services across Pakistan and internationally.
              </p>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">Head Office — Lahore</h4>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                  <span>Suite # 5 &amp; 6, Ground Floor, New 1-Campus, Ross Residencia, Canal Road, Lahore, Punjab 54000</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>0423-7459-666</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">Islamabad Office</h4>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                  <span>16th Floor, State Life Building No. 5, F-6, Jinnah Avenue, Islamabad</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>051-8357-873</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">Get in Touch</h4>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>info@aqeelalam.com</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>0321-111-2041</span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <a href="https://www.ana-ca.com" className="hover:text-blue-600 hover:underline transition-colors">www.ana-ca.com</a>
                </div>
                <div className="flex items-center gap-2">
                  <Monitor className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                  <a href="https://www.auditwise.tech" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline">www.auditwise.tech</a>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-border/30 pt-5 flex flex-col sm:flex-row justify-between items-center gap-3">
            <p className="text-[11px] text-muted-foreground">
              &copy; {new Date().getFullYear()} Alam &amp; Aulakh, Chartered Accountants. All rights reserved.
            </p>
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span>QCR Rated</span>
              <span>ICAEW Authorized Employer</span>
              <span>ICAP Approved</span>
              <span>AOB Registered</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
