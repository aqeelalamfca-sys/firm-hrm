import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Shield, FileText, Banknote, Users, BarChart3, Building2, Globe, ChevronRight,
  CheckCircle2, ArrowRight, Star, Award, BookOpen, Calculator, Briefcase, Scale,
  Landmark, TrendingUp, Eye, Target, Heart, Zap, Phone, Mail, MapPin,
  GraduationCap, Clock, Layers, Lock, Search, PieChart, UserCheck, Cpu,
  Menu, X, Factory, Truck, Pickaxe, Clapperboard, Wallet, Utensils, Building,
  Hotel, Ship, Wrench, Newspaper, HandHeart, Fuel, Radio, Pill, BriefcaseBusiness,
  Home, ShoppingCart, Monitor, Plane
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
  { name: "Mr. Aqeel Alam", title: "FCA", role: "Managing Partner", focus: "Audit, Tax & International Advisory", exp: "15 years", bg: "KPMG", initials: "AA" },
  { name: "Mr. Bilal Aulakh", title: "FCA", role: "Partner", focus: "Tax & Corporate Services", exp: "14 years", bg: "KPMG", initials: "BA" },
  { name: "Mr. M. Idrees Khattak", title: "FCA", role: "Partner", focus: "Audit & Advisory (ERP/SAP)", exp: "13 years", bg: "Baker Tilly", initials: "IK" },
  { name: "Ms. Manahil Ahmad", title: "ACA, FMVA", role: "Partner", focus: "International Advisory & Valuation", exp: "10+ years", bg: "Baker Tilly / KPMG", initials: "MA" },
  { name: "Mr. Shan Ibrahim", title: "FCA", role: "Partner", focus: "Audit, Tax & Corporate Planning", exp: "10 years", bg: "RSM International", initials: "SI" },
  { name: "Mr. Anwaar Haider", title: "ACA", role: "Partner", focus: "Audit, IFRS & Forensic Accounting", exp: "7 years", bg: "KPMG", initials: "AH" },
];

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
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-background/95 backdrop-blur-md shadow-sm border-b border-border/30" : "bg-transparent"}`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Scale className="w-4.5 h-4.5 text-primary" />
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
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button size="sm" className="h-9 text-[13px] font-semibold shadow-sm gap-1.5">
                Sign In <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
            <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
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

      {/* Hero Section */}
      <section id="home" className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-transparent to-transparent" />
        <div className="absolute top-20 right-0 w-[500px] h-[500px] bg-primary/[0.04] rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-violet-500/[0.03] rounded-full blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="max-w-3xl">
            <Badge className="mb-6 bg-primary/5 text-primary border-primary/20 text-xs font-semibold px-3 py-1">
              ICAP Approved Training Organization
            </Badge>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
              Leading Chartered
              <br />
              <span className="text-primary">Accountants Firm</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mb-8">
              Providing audit, tax, and financial & corporate advisory services with firm commitment.
              Expert chartered accounting and international corporate services — your trusted partner
              in Pakistan and beyond.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/login">
                <Button size="lg" className="h-12 px-6 text-sm font-semibold shadow-md gap-2">
                  Get Started <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <button onClick={() => scrollTo("services")} className="h-12 px-6 text-sm font-semibold border border-border/60 rounded-lg bg-background hover:bg-muted/50 transition-colors inline-flex items-center gap-2">
                Our Services <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {STATS.map(({ value, label, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/40 shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center shrink-0">
                  <Icon className="w-[18px] h-[18px] text-primary" />
                </div>
                <div>
                  <p className="text-xl font-bold">{value}</p>
                  <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About Section with Tabs */}
      <section id="about" className="py-20 bg-muted/20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <Badge className="mb-3 bg-violet-500/5 text-violet-600 border-violet-200 text-xs font-semibold px-3 py-1">About Us</Badge>
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
          <div className="text-center mb-12">
            <Badge className="mb-3 bg-emerald-500/5 text-emerald-600 border-emerald-200 text-xs font-semibold px-3 py-1">Services</Badge>
            <h2 className="text-3xl font-bold tracking-tight mb-3">Comprehensive Service Portfolio</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-sm">
              Expert financial solutions for businesses operating locally and internationally — from
              traditional audit to cutting-edge corporate structuring.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SERVICES.map(({ title, desc, icon: Icon, color, items }) => (
              <Card key={title} className="border-border/40 shadow-xs hover:shadow-md transition-shadow group">
                <CardContent className="p-6">
                  <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center mb-4`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold mb-2">{title}</h3>
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
      <section className="py-16 bg-sidebar text-sidebar-foreground">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold tracking-tight mb-3">Proven Track Record</h2>
            <p className="text-sidebar-foreground/60 max-w-2xl mx-auto text-sm">
              Delivering excellence across Pakistan and beyond since 2016.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { value: "PKR 500B+", label: "Assets Audited", desc: "Led audit & assurance for companies with combined assets exceeding PKR 500 billion" },
              { value: "PKR 200B+", label: "Revenue Managed", desc: "Managed FBR tax services and corporate tax compliance for businesses with aggregate annual revenues" },
              { value: "PKR 50B+", label: "Deal Value", desc: "Facilitated corporate transactions, company incorporation, and business valuations" },
            ].map(({ value, label, desc }) => (
              <div key={label} className="text-center p-6 rounded-2xl bg-sidebar-accent/30 border border-sidebar-border/20">
                <p className="text-3xl font-bold text-primary mb-1">{value}</p>
                <p className="text-sm font-semibold mb-2">{label}</p>
                <p className="text-xs text-sidebar-foreground/50 leading-relaxed">{desc}</p>
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
              <div key={label} className="flex items-center gap-3 p-4 rounded-xl bg-sidebar-accent/20 border border-sidebar-border/10">
                <p className="text-xl font-bold text-primary">{value}</p>
                <p className="text-[11px] text-sidebar-foreground/60 leading-tight">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Industries Section */}
      <section id="industries" className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <Badge className="mb-3 bg-amber-500/5 text-amber-600 border-amber-200 text-xs font-semibold px-3 py-1">Industries</Badge>
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
                  className="group flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-medium bg-muted/60 text-foreground/70 border border-border/40 hover:bg-primary/5 hover:text-primary hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer"
                >
                  <Icon className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
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
          <div className="text-center mb-10">
            <Badge className="mb-3 bg-rose-500/5 text-rose-600 border-rose-200 text-xs font-semibold px-3 py-1">Leadership</Badge>
            <h2 className="text-3xl font-bold tracking-tight mb-3">Our Leadership Team</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-sm">
              Six partners bringing extensive Big Four experience — providing top-tier audit, tax,
              and strategic consulting from Lahore and Islamabad.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {TEAM.map((member) => (
              <Card key={member.name} className="border-border/40 shadow-xs hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-lg font-bold shrink-0">
                      {member.initials}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold">{member.name}</h4>
                      <p className="text-[11px] text-primary font-semibold">{member.title}</p>
                      <p className="text-xs text-muted-foreground">{member.role}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{member.focus}</p>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="px-2 py-1 rounded-md bg-muted/60 text-muted-foreground font-medium">{member.exp}</span>
                    <span className="px-2 py-1 rounded-md bg-blue-50 text-blue-700 font-medium">{member.bg}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

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
            <div className="text-center mb-10">
              <Badge className="mb-3 bg-primary/5 text-primary border-primary/20 text-xs font-semibold px-3 py-1">Contact</Badge>
              <h2 className="text-3xl font-bold tracking-tight mb-3">Connect with Pakistan's Leading Chartered Accountants</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto text-sm">
                Contact us for expert audit, tax, corporate, and strategic business advisory services.
                Tailored financial solutions and robust accounting support for your business needs.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-5 mb-8">
              <Card className="border-border/40 shadow-xs text-center">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center mx-auto mb-3">
                    <MapPin className="w-5 h-5 text-primary" />
                  </div>
                  <h4 className="text-sm font-bold mb-1">Head Office — Lahore</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Suite # 5 & 6, Ground Floor, New 1-Campus, Ross Residencia, Canal Road, Lahore, Punjab 54000
                  </p>
                  <p className="text-xs text-primary font-medium mt-2">0423-7459-666</p>
                </CardContent>
              </Card>
              <Card className="border-border/40 shadow-xs text-center">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-xl bg-violet-500/5 flex items-center justify-center mx-auto mb-3">
                    <Building2 className="w-5 h-5 text-violet-600" />
                  </div>
                  <h4 className="text-sm font-bold mb-1">Islamabad Office</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    16th Floor, State Life Building No. 5, F-6, Jinnah Avenue, Islamabad
                  </p>
                  <p className="text-xs text-primary font-medium mt-2">051-8357-873</p>
                </CardContent>
              </Card>
              <Card className="border-border/40 shadow-xs text-center">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/5 flex items-center justify-center mx-auto mb-3">
                    <UserCheck className="w-5 h-5 text-emerald-600" />
                  </div>
                  <h4 className="text-sm font-bold mb-1">Focal Partner</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Mr. Aqeel Alam, FCA<br />Managing Partner
                  </p>
                  <p className="text-xs text-primary font-medium mt-2">0321-111-2041</p>
                  <p className="text-xs text-muted-foreground">info@aqeelalam.com</p>
                </CardContent>
              </Card>
            </div>

            <div className="text-center">
              <Link href="/login">
                <Button size="lg" className="h-12 px-8 text-sm font-semibold shadow-md gap-2">
                  Access Portal <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border/30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Scale className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-sm font-bold">Alam & Aulakh</span>
              <span className="text-xs text-muted-foreground">Chartered Accountants</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Vertex HR — Enterprise resource planning for CA & professional services firms.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
