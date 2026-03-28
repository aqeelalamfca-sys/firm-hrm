import { useState, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Scale, ArrowLeft, ArrowRight, CheckCircle2, Upload, X, User, Phone, GraduationCap,
  MapPin, Briefcase, Wrench, FileText, AlertCircle, Loader2, Image as ImageIcon
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

const SECTIONS = [
  { id: "personal", label: "Personal Info", icon: User },
  { id: "contact", label: "Contact", icon: Phone },
  { id: "uploads", label: "Uploads", icon: Upload },
  { id: "academic", label: "Academic", icon: GraduationCap },
  { id: "training", label: "Training Preferences", icon: MapPin },
  { id: "availability", label: "Availability", icon: Briefcase },
  { id: "skills", label: "Skills", icon: Wrench },
  { id: "experience", label: "Experience", icon: FileText },
  { id: "declaration", label: "Declaration", icon: CheckCircle2 },
];

const BOARDS = [
  "Federal Board (FBISE)",
  "Punjab Board (BISE Lahore)",
  "BISE Rawalpindi",
  "BISE Faisalabad",
  "BISE Multan",
  "BISE Gujranwala",
  "BISE Sargodha",
  "BISE DG Khan",
  "BISE Sahiwal",
  "BISE Bahawalpur",
  "Sindh Board (BISE Karachi)",
  "BISE Hyderabad",
  "BISE Sukkur",
  "KPK Board (BISE Peshawar)",
  "BISE Mardan",
  "BISE Swat",
  "Balochistan Board (BISE Quetta)",
  "AJK Board",
  "Aga Khan Board",
  "Cambridge (O/A Level)",
  "Other",
];

export default function TrainingApplication() {
  const { toast } = useToast();
  const [currentSection, setCurrentSection] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [applicationId, setApplicationId] = useState<number | null>(null);
  const [applicationCrn, setApplicationCrn] = useState<string | null>(null);

  const [form, setForm] = useState({
    fullName: "",
    fatherName: "",
    cnic: "",
    dateOfBirth: "",
    gender: "",
    maritalStatus: "",
    mobile: "",
    alternateMobile: "",
    email: "",
    currentAddress: "",
    permanentAddress: "",
    matricBoard: "",
    matricYear: "",
    matricMarks: "",
    interBoard: "",
    interYear: "",
    interMarks: "",
    graduationDegree: "",
    graduationUni: "",
    graduationYear: "",
    graduationMarks: "",
    icapRegNo: "",
    icapLevel: "",
    preferredLocation: "",
    preferredDept: "",
    availableStart: "",
    isFullTime: "true",
    currentEngagement: "",
    accountingLevel: "",
    excelLevel: "",
    softwareSkills: "",
    communication: "",
    experienceDetails: "",
    declaration: false,
  });

  const [files, setFiles] = useState<{
    cnicFront: File | null;
    cnicBack: File | null;
    photo: File | null;
  }>({ cnicFront: null, cnicBack: null, photo: null });

  const [previews, setPreviews] = useState<{
    cnicFront: string | null;
    cnicBack: string | null;
    photo: string | null;
  }>({ cnicFront: null, cnicBack: null, photo: null });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (field: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleFile = (field: "cnicFront" | "cnicBack" | "photo", file: File | null) => {
    if (file) {
      const allowed = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
      if (!allowed.includes(file.type)) {
        toast({ title: "Invalid file", description: "Only JPG, PNG, and PDF files are allowed", variant: "destructive" });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "File too large", description: "Maximum file size is 5MB", variant: "destructive" });
        return;
      }
    }
    setFiles(prev => ({ ...prev, [field]: file }));
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreviews(prev => ({ ...prev, [field]: e.target?.result as string }));
      reader.readAsDataURL(file);
    } else {
      setPreviews(prev => ({ ...prev, [field]: null }));
    }
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const formatCNIC = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 13);
    if (digits.length <= 5) return digits;
    if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  };

  const validateSection = (sectionIndex: number): boolean => {
    const newErrors: Record<string, string> = {};

    switch (sectionIndex) {
      case 0:
        if (!form.fullName.trim()) newErrors.fullName = "Full name is required";
        if (!form.fatherName.trim()) newErrors.fatherName = "Father's name is required";
        if (!form.cnic.trim()) newErrors.cnic = "CNIC is required";
        else if (!/^\d{5}-\d{7}-\d$/.test(form.cnic)) newErrors.cnic = "Format: xxxxx-xxxxxxx-x";
        if (!form.dateOfBirth) newErrors.dateOfBirth = "Date of birth is required";
        if (!form.gender) newErrors.gender = "Gender is required";
        if (!form.maritalStatus) newErrors.maritalStatus = "Marital status is required";
        break;
      case 1:
        if (!form.mobile.trim()) newErrors.mobile = "Mobile number is required";
        if (!form.email.trim()) newErrors.email = "Email is required";
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) newErrors.email = "Invalid email";
        if (!form.currentAddress.trim()) newErrors.currentAddress = "Current address is required";
        if (!form.permanentAddress.trim()) newErrors.permanentAddress = "Permanent address is required";
        break;
      case 2:
        if (!files.cnicFront) newErrors.cnicFront = "CNIC front image is required";
        if (!files.cnicBack) newErrors.cnicBack = "CNIC back image is required";
        if (!files.photo) newErrors.photo = "Photo is required";
        break;
      case 3:
        if (!form.matricBoard) newErrors.matricBoard = "Board is required";
        if (!form.matricYear) newErrors.matricYear = "Year is required";
        if (!form.matricMarks.trim()) newErrors.matricMarks = "Marks/Grade is required";
        if (!form.interBoard) newErrors.interBoard = "Board is required";
        if (!form.interYear) newErrors.interYear = "Year is required";
        if (!form.interMarks.trim()) newErrors.interMarks = "Marks/Grade is required";
        break;
      case 4:
        if (!form.icapLevel) newErrors.icapLevel = "ICAP level is required";
        if (!form.preferredLocation) newErrors.preferredLocation = "Location is required";
        if (!form.preferredDept) newErrors.preferredDept = "Department is required";
        break;
      case 5:
        if (!form.availableStart) newErrors.availableStart = "Start date is required";
        break;
      case 6:
        if (!form.accountingLevel) newErrors.accountingLevel = "Accounting level is required";
        if (!form.excelLevel) newErrors.excelLevel = "Excel level is required";
        if (!form.communication) newErrors.communication = "Communication level is required";
        break;
      case 8:
        if (!form.declaration) newErrors.declaration = "You must accept the declaration";
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateSection(currentSection)) {
      setCurrentSection(prev => Math.min(prev + 1, SECTIONS.length - 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePrev = () => {
    setCurrentSection(prev => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async () => {
    if (!validateSection(currentSection)) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
      if (files.cnicFront) formData.append("cnicFront", files.cnicFront);
      if (files.cnicBack) formData.append("cnicBack", files.cnicBack);
      if (files.photo) formData.append("photo", files.photo);

      const res = await fetch(`${API_BASE}/applications/public/submit`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Submission failed");
      }

      setSubmitted(true);
      setApplicationId(data.id);
      setApplicationCrn(data.crn);
      toast({ title: "Application Submitted!", description: "Your training application has been received successfully." });
    } catch (error: any) {
      toast({ title: "Submission Failed", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const FileUploadBox = ({ field, label }: { field: "cnicFront" | "cnicBack" | "photo"; label: string }) => (
    <div>
      <Label className="text-sm font-medium mb-2 block">{label} *</Label>
      {previews[field] ? (
        <div className="relative border rounded-xl overflow-hidden bg-muted/30">
          <img src={previews[field]!} alt={label} className="w-full h-40 object-contain p-2" />
          <button
            onClick={() => { handleFile(field, null); }}
            className="absolute top-2 right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : files[field] && !files[field]!.type.startsWith("image/") ? (
        <div className="border rounded-xl p-4 bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4 text-primary" />
            <span className="truncate">{files[field]!.name}</span>
          </div>
          <button onClick={() => handleFile(field, null)} className="text-destructive"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <label className="border-2 border-dashed border-border/60 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            {field === "photo" ? <ImageIcon className="w-5 h-5 text-primary" /> : <Upload className="w-5 h-5 text-primary" />}
          </div>
          <span className="text-xs text-muted-foreground">Click to upload or drag & drop</span>
          <span className="text-[10px] text-muted-foreground/60">JPG, PNG or PDF (max 5MB)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/jpg,application/pdf"
            className="hidden"
            onChange={(e) => handleFile(field, e.target.files?.[0] || null)}
          />
        </label>
      )}
      {errors[field] && <p className="text-destructive text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors[field]}</p>}
    </div>
  );

  const FieldError = ({ field }: { field: string }) =>
    errors[field] ? <p className="text-destructive text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors[field]}</p> : null;

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50/80 via-background to-indigo-50/50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full shadow-lg border-border/40">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">Application Submitted!</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Your application has been received. Please proceed to the Assessment Test to complete your application process.
            </p>
            {applicationCrn && (
              <p className="text-xs text-muted-foreground bg-muted/60 rounded-lg p-3 mb-4">
                Your CRN: <span className="font-bold text-primary text-base">{applicationCrn}</span>
                <br /><span className="text-[10px]">Save this number for future reference</span>
              </p>
            )}
            <Link href={`/mcq-test/${applicationCrn}`}>
              <Button className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 mb-3">
                <GraduationCap className="w-4 h-4" /> Proceed to Assessment Test
              </Button>
            </Link>
            <Link href="/landing">
              <Button variant="outline" className="w-full gap-2"><ArrowLeft className="w-4 h-4" /> Back to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progress = ((currentSection + 1) / SECTIONS.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50/80 via-background to-indigo-50/50">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-border/40 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/landing" className="flex items-center gap-2 text-foreground hover:text-primary transition-colors">
            <Scale className="w-5 h-5 text-primary" />
            <span className="font-bold text-sm">Alam & Aulakh</span>
          </Link>
          <h1 className="text-sm font-semibold text-foreground hidden sm:block">CA Training Application</h1>
          <Link href="/landing">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Button>
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground">
              Step {currentSection + 1} of {SECTIONS.length}
            </span>
            <span className="text-xs font-semibold text-primary">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-muted/60 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex gap-1 mt-3 overflow-x-auto pb-1">
            {SECTIONS.map((s, i) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => { if (i < currentSection) setCurrentSection(i); }}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors ${
                    i === currentSection
                      ? "bg-primary text-primary-foreground"
                      : i < currentSection
                        ? "bg-emerald-100 text-emerald-700 cursor-pointer hover:bg-emerald-200"
                        : "bg-muted/60 text-muted-foreground"
                  }`}
                >
                  {i < currentSection ? <CheckCircle2 className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <Card className="shadow-lg border-border/40">
          <CardContent className="p-6 sm:p-8">
            <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
              {(() => { const Icon = SECTIONS[currentSection].icon; return <Icon className="w-5 h-5 text-primary" />; })()}
              {SECTIONS[currentSection].label}
            </h2>
            <p className="text-xs text-muted-foreground mb-6">
              {currentSection === 0 && "Please provide your personal information."}
              {currentSection === 1 && "How can we reach you?"}
              {currentSection === 2 && "Upload your CNIC (front & back) and a recent photograph."}
              {currentSection === 3 && "Enter your academic qualifications."}
              {currentSection === 4 && "Select your training preferences."}
              {currentSection === 5 && "When can you start and your availability."}
              {currentSection === 6 && "Rate your technical and soft skills."}
              {currentSection === 7 && "Share any relevant work experience (optional)."}
              {currentSection === 8 && "Review and submit your application."}
            </p>

            {currentSection === 0 && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm">Full Name *</Label>
                    <Input value={form.fullName} onChange={e => handleChange("fullName", e.target.value)} placeholder="e.g. Muhammad Ahmad" />
                    <FieldError field="fullName" />
                  </div>
                  <div>
                    <Label className="text-sm">Father's Name *</Label>
                    <Input value={form.fatherName} onChange={e => handleChange("fatherName", e.target.value)} placeholder="e.g. Muhammad Ali" />
                    <FieldError field="fatherName" />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm">CNIC Number *</Label>
                    <Input
                      value={form.cnic}
                      onChange={e => handleChange("cnic", formatCNIC(e.target.value))}
                      placeholder="xxxxx-xxxxxxx-x"
                      maxLength={15}
                    />
                    <FieldError field="cnic" />
                  </div>
                  <div>
                    <Label className="text-sm">Date of Birth *</Label>
                    <Input type="date" value={form.dateOfBirth} onChange={e => handleChange("dateOfBirth", e.target.value)} />
                    <FieldError field="dateOfBirth" />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm">Gender *</Label>
                    <Select value={form.gender} onValueChange={v => handleChange("gender", v)}>
                      <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldError field="gender" />
                  </div>
                  <div>
                    <Label className="text-sm">Marital Status *</Label>
                    <Select value={form.maritalStatus} onValueChange={v => handleChange("maritalStatus", v)}>
                      <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Single</SelectItem>
                        <SelectItem value="married">Married</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldError field="maritalStatus" />
                  </div>
                </div>
              </div>
            )}

            {currentSection === 1 && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm">Mobile Number *</Label>
                    <Input value={form.mobile} onChange={e => handleChange("mobile", e.target.value)} placeholder="03xx-xxxxxxx" />
                    <FieldError field="mobile" />
                  </div>
                  <div>
                    <Label className="text-sm">Alternate Mobile</Label>
                    <Input value={form.alternateMobile} onChange={e => handleChange("alternateMobile", e.target.value)} placeholder="Optional" />
                  </div>
                </div>
                <div>
                  <Label className="text-sm">Email Address *</Label>
                  <Input type="email" value={form.email} onChange={e => handleChange("email", e.target.value)} placeholder="you@example.com" />
                  <FieldError field="email" />
                </div>
                <div>
                  <Label className="text-sm">Current Address *</Label>
                  <Textarea value={form.currentAddress} onChange={e => handleChange("currentAddress", e.target.value)} placeholder="Full current address" rows={2} />
                  <FieldError field="currentAddress" />
                </div>
                <div>
                  <Label className="text-sm">Permanent Address *</Label>
                  <Textarea value={form.permanentAddress} onChange={e => handleChange("permanentAddress", e.target.value)} placeholder="Full permanent address" rows={2} />
                  <FieldError field="permanentAddress" />
                </div>
              </div>
            )}

            {currentSection === 2 && (
              <div className="grid sm:grid-cols-3 gap-5">
                <FileUploadBox field="cnicFront" label="CNIC Front" />
                <FileUploadBox field="cnicBack" label="CNIC Back" />
                <FileUploadBox field="photo" label="Recent Photograph" />
              </div>
            )}

            {currentSection === 3 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold mb-3 text-primary">Matriculation / O-Level</h3>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-sm">Board *</Label>
                      <Select value={form.matricBoard} onValueChange={v => handleChange("matricBoard", v)}>
                        <SelectTrigger><SelectValue placeholder="Select board" /></SelectTrigger>
                        <SelectContent>{BOARDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                      </Select>
                      <FieldError field="matricBoard" />
                    </div>
                    <div>
                      <Label className="text-sm">Year *</Label>
                      <Input type="number" value={form.matricYear} onChange={e => handleChange("matricYear", e.target.value)} placeholder="e.g. 2018" />
                      <FieldError field="matricYear" />
                    </div>
                    <div>
                      <Label className="text-sm">Marks/Grade *</Label>
                      <Input value={form.matricMarks} onChange={e => handleChange("matricMarks", e.target.value)} placeholder="e.g. 950/1100 or A+" />
                      <FieldError field="matricMarks" />
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-3 text-primary">Intermediate / A-Level</h3>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-sm">Board *</Label>
                      <Select value={form.interBoard} onValueChange={v => handleChange("interBoard", v)}>
                        <SelectTrigger><SelectValue placeholder="Select board" /></SelectTrigger>
                        <SelectContent>{BOARDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                      </Select>
                      <FieldError field="interBoard" />
                    </div>
                    <div>
                      <Label className="text-sm">Year *</Label>
                      <Input type="number" value={form.interYear} onChange={e => handleChange("interYear", e.target.value)} placeholder="e.g. 2020" />
                      <FieldError field="interYear" />
                    </div>
                    <div>
                      <Label className="text-sm">Marks/Grade *</Label>
                      <Input value={form.interMarks} onChange={e => handleChange("interMarks", e.target.value)} placeholder="e.g. 900/1100 or A" />
                      <FieldError field="interMarks" />
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-3 text-primary">Graduation (if applicable)</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm">Degree</Label>
                      <Input value={form.graduationDegree} onChange={e => handleChange("graduationDegree", e.target.value)} placeholder="e.g. B.Com, BBA, BS" />
                    </div>
                    <div>
                      <Label className="text-sm">University</Label>
                      <Input value={form.graduationUni} onChange={e => handleChange("graduationUni", e.target.value)} placeholder="e.g. Punjab University" />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4 mt-4">
                    <div>
                      <Label className="text-sm">Year</Label>
                      <Input type="number" value={form.graduationYear} onChange={e => handleChange("graduationYear", e.target.value)} placeholder="e.g. 2023" />
                    </div>
                    <div>
                      <Label className="text-sm">Marks/CGPA</Label>
                      <Input value={form.graduationMarks} onChange={e => handleChange("graduationMarks", e.target.value)} placeholder="e.g. 3.5/4.0 or 65%" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentSection === 4 && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm">ICAP Registration No.</Label>
                    <Input value={form.icapRegNo} onChange={e => handleChange("icapRegNo", e.target.value)} placeholder="If registered" />
                  </div>
                  <div>
                    <Label className="text-sm">ICAP Level *</Label>
                    <Select value={form.icapLevel} onValueChange={v => handleChange("icapLevel", v)}>
                      <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_registered">Not Yet Registered</SelectItem>
                        <SelectItem value="caf_1">CAF-1 (Foundation)</SelectItem>
                        <SelectItem value="caf_2">CAF-2</SelectItem>
                        <SelectItem value="caf_3">CAF-3</SelectItem>
                        <SelectItem value="caf_4">CAF-4</SelectItem>
                        <SelectItem value="caf_5">CAF-5</SelectItem>
                        <SelectItem value="caf_6">CAF-6</SelectItem>
                        <SelectItem value="caf_7">CAF-7</SelectItem>
                        <SelectItem value="caf_8">CAF-8</SelectItem>
                        <SelectItem value="cfap">CFAP Level</SelectItem>
                        <SelectItem value="msa">MSA Level</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldError field="icapLevel" />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm">Preferred Location *</Label>
                    <Select value={form.preferredLocation} onValueChange={v => handleChange("preferredLocation", v)}>
                      <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lahore">Lahore Office</SelectItem>
                        <SelectItem value="islamabad">Islamabad Office</SelectItem>
                        <SelectItem value="any">Either Location</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldError field="preferredLocation" />
                  </div>
                  <div>
                    <Label className="text-sm">Preferred Department *</Label>
                    <Select value={form.preferredDept} onValueChange={v => handleChange("preferredDept", v)}>
                      <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="audit">Audit & Assurance</SelectItem>
                        <SelectItem value="tax">Tax Advisory</SelectItem>
                        <SelectItem value="corporate">Corporate Services</SelectItem>
                        <SelectItem value="advisory">Advisory & Consulting</SelectItem>
                        <SelectItem value="any">No Preference</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldError field="preferredDept" />
                  </div>
                </div>
              </div>
            )}

            {currentSection === 5 && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm">Available Start Date *</Label>
                    <Input type="date" value={form.availableStart} onChange={e => handleChange("availableStart", e.target.value)} />
                    <FieldError field="availableStart" />
                  </div>
                  <div>
                    <Label className="text-sm">Availability *</Label>
                    <Select value={form.isFullTime} onValueChange={v => handleChange("isFullTime", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Full-Time</SelectItem>
                        <SelectItem value="false">Part-Time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-sm">Current Engagement (if any)</Label>
                  <Textarea value={form.currentEngagement} onChange={e => handleChange("currentEngagement", e.target.value)} placeholder="Describe any current work, studies, or commitments" rows={3} />
                </div>
              </div>
            )}

            {currentSection === 6 && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm">Accounting Knowledge *</Label>
                    <Select value={form.accountingLevel} onValueChange={v => handleChange("accountingLevel", v)}>
                      <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                        <SelectItem value="expert">Expert</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldError field="accountingLevel" />
                  </div>
                  <div>
                    <Label className="text-sm">Microsoft Excel *</Label>
                    <Select value={form.excelLevel} onValueChange={v => handleChange("excelLevel", v)}>
                      <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                        <SelectItem value="expert">Expert</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldError field="excelLevel" />
                  </div>
                </div>
                <div>
                  <Label className="text-sm">Communication Skills *</Label>
                  <Select value={form.communication} onValueChange={v => handleChange("communication", v)}>
                    <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic</SelectItem>
                      <SelectItem value="good">Good</SelectItem>
                      <SelectItem value="excellent">Excellent</SelectItem>
                      <SelectItem value="professional">Professional</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError field="communication" />
                </div>
                <div>
                  <Label className="text-sm">Other Software Skills</Label>
                  <Input value={form.softwareSkills} onChange={e => handleChange("softwareSkills", e.target.value)} placeholder="e.g. SAP, QuickBooks, Tally, Word, PowerPoint" />
                </div>
              </div>
            )}

            {currentSection === 7 && (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm">Work Experience Details</Label>
                  <Textarea
                    value={form.experienceDetails}
                    onChange={e => handleChange("experienceDetails", e.target.value)}
                    placeholder="Describe any relevant work experience, internships, or volunteer work. Include company name, role, duration, and key responsibilities. Leave blank if no experience."
                    rows={6}
                  />
                </div>
                <p className="text-xs text-muted-foreground bg-blue-50 text-blue-700 rounded-lg p-3">
                  This section is optional. Fresh graduates with no experience are welcome to apply.
                </p>
              </div>
            )}

            {currentSection === 8 && (
              <div className="space-y-4">
                <div className="bg-muted/30 rounded-xl p-5 border border-border/40 text-sm space-y-3">
                  <p className="font-semibold text-foreground">Declaration</p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    I hereby declare that all information provided in this application is true, complete, and correct to the best of my knowledge and belief. I understand that any false statement, omission, or misrepresentation may disqualify my application or result in termination of training.
                  </p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    I authorize Aqeel Alam & Company, Chartered Accountants, to verify any information provided herein and to contact the educational institutions and references listed.
                  </p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    I understand that submitting this application does not guarantee admission into the CA training program and that the firm reserves the right to accept or reject any application at its sole discretion.
                  </p>
                </div>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={form.declaration as boolean}
                    onChange={e => handleChange("declaration", e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-border accent-primary"
                  />
                  <span className="text-sm text-foreground/80 group-hover:text-foreground transition-colors">
                    I have read, understood, and agree to the above declaration. *
                  </span>
                </label>
                <FieldError field="declaration" />
              </div>
            )}

            <div className="flex items-center justify-between mt-8 pt-6 border-t border-border/40">
              <Button
                variant="outline"
                onClick={handlePrev}
                disabled={currentSection === 0}
                className="gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" /> Previous
              </Button>

              {currentSection < SECTIONS.length - 1 ? (
                <Button onClick={handleNext} className="gap-1.5">
                  Next <ArrowRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || !form.declaration}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4" /> Submit Application</>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
