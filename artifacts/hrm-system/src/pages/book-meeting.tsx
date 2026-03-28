import { useState, useMemo } from "react";
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
  Scale, ArrowLeft, CheckCircle2, Calendar, Clock, User, Building2,
  Mail, Phone, ChevronLeft, ChevronRight, Loader2, Video, AlertCircle
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

const PARTNERS = [
  { name: "Mr. Aqeel Alam", title: "FCA", role: "Managing Partner", focus: "Audit, Tax & International Advisory" },
  { name: "Mr. Bilal Aulakh", title: "FCA", role: "Partner", focus: "Tax & Corporate Services" },
  { name: "Mr. M. Idrees Khattak", title: "FCA", role: "Partner", focus: "Audit & Advisory (ERP/SAP)" },
  { name: "Ms. Manahil Ahmad", title: "ACA, FMVA", role: "Partner", focus: "International Advisory & Valuation" },
  { name: "Mr. Shan Ibrahim", title: "FCA", role: "Partner", focus: "Audit, Tax & Corporate Planning" },
  { name: "Mr. Anwaar Haider", title: "ACA", role: "Partner", focus: "Audit, IFRS & Forensic Accounting" },
];

const TIME_SLOTS = [
  "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM", "02:00 PM", "02:30 PM",
  "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM",
];

const PURPOSES = [
  "Statutory Audit",
  "Tax Advisory & Compliance",
  "Business Advisory",
  "Company Incorporation",
  "Financial Due Diligence",
  "Forensic Accounting",
  "IFRS Implementation",
  "General Consultation",
  "Other",
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function BookMeeting() {
  const { toast } = useToast();
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<string>("");
  const [bookedTimes, setBookedTimes] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState({
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    companyName: "",
    purpose: "",
    notes: "",
    duration: "30",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }, [daysInMonth, firstDay]);

  const isDateDisabled = (day: number) => {
    const date = new Date(currentYear, currentMonth, day);
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0) return true;
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (date < todayDate) return true;
    return false;
  };

  const formatDate = (day: number) => {
    const m = String(currentMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${currentYear}-${m}-${d}`;
  };

  const fetchSlots = async (date: string, partner: string) => {
    if (!date || !partner) return;
    setLoadingSlots(true);
    try {
      const res = await fetch(`${API_BASE}/meetings/public/slots?date=${date}&partner=${encodeURIComponent(partner)}`);
      if (res.ok) {
        const data = await res.json();
        setBookedTimes(data.bookedTimes || []);
      }
    } catch {} finally {
      setLoadingSlots(false);
    }
  };

  const handleDateSelect = (day: number) => {
    if (isDateDisabled(day)) return;
    const dateStr = formatDate(day);
    setSelectedDate(dateStr);
    setSelectedTime(null);
    if (selectedPartner) fetchSlots(dateStr, selectedPartner);
  };

  const handlePartnerChange = (partner: string) => {
    setSelectedPartner(partner);
    setSelectedTime(null);
    if (selectedDate) fetchSlots(selectedDate, partner);
  };

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };

  const isPrevDisabled = currentYear === today.getFullYear() && currentMonth === today.getMonth();

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};
    if (!form.clientName.trim()) newErrors.clientName = "Name is required";
    if (!form.clientEmail.trim()) newErrors.clientEmail = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.clientEmail)) newErrors.clientEmail = "Invalid email";
    if (!form.clientPhone.trim()) newErrors.clientPhone = "Phone is required";
    if (!selectedPartner) newErrors.partner = "Please select a partner";
    if (!selectedDate) newErrors.date = "Please select a date";
    if (!selectedTime) newErrors.time = "Please select a time slot";
    if (!form.purpose) newErrors.purpose = "Purpose is required";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/meetings/public/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          partnerName: selectedPartner,
          meetingDate: selectedDate,
          meetingTime: selectedTime,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Booking failed");

      setSubmitted(true);
      toast({ title: "Meeting booked successfully!" });
    } catch (error: any) {
      toast({ title: "Booking Failed", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50/80 via-background to-indigo-50/50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full shadow-lg border-border/40">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">Meeting Booked!</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Your meeting request has been submitted successfully. You will receive a confirmation email shortly.
            </p>
            <div className="bg-muted/40 rounded-xl p-4 text-sm space-y-2 mb-6 text-left">
              <div className="flex justify-between"><span className="text-muted-foreground">Partner:</span><span className="font-medium">{selectedPartner}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Date:</span><span className="font-medium">{selectedDate && new Date(selectedDate + "T00:00:00").toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Time:</span><span className="font-medium">{selectedTime}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Duration:</span><span className="font-medium">{form.duration} minutes</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Purpose:</span><span className="font-medium">{form.purpose}</span></div>
            </div>
            <Link href="/landing">
              <Button variant="outline" className="w-full gap-2"><ArrowLeft className="w-4 h-4" /> Back to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedDateObj = selectedDate ? new Date(selectedDate + "T00:00:00") : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50/80 via-background to-indigo-50/50">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-border/40 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/landing" className="flex items-center gap-2 text-foreground hover:text-primary transition-colors">
            <Scale className="w-5 h-5 text-primary" />
            <span className="font-bold text-sm">Alam & Aulakh</span>
          </Link>
          <h1 className="text-sm font-semibold text-foreground hidden sm:block">Book an Online Meeting</h1>
          <Link href="/landing">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Button>
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-xs font-semibold mb-3">
            <Video className="w-3.5 h-3.5" /> Online Meeting
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Book a Meeting with Our Partners</h1>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Schedule a consultation with one of our experienced partners. Select your preferred partner, date, and time below.
          </p>
        </div>

        <div className="grid lg:grid-cols-[1fr_380px] gap-6">
          <div className="space-y-6">
            <Card className="shadow-md border-border/40">
              <CardContent className="p-6">
                <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><User className="w-4 h-4 text-primary" /> Select Partner</h3>
                {errors.partner && <p className="text-destructive text-xs mb-3 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.partner}</p>}
                <div className="grid sm:grid-cols-2 gap-3">
                  {PARTNERS.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => handlePartnerChange(p.name)}
                      className={`text-left p-3 rounded-xl border-2 transition-all ${
                        selectedPartner === p.name
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border/50 hover:border-primary/30 hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                          selectedPartner === p.name ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                        }`}>
                          {p.name.split(" ").slice(-1)[0][0]}{p.name.split(" ").slice(-2, -1)[0]?.[0] || ""}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{p.name}</p>
                          <p className="text-[10px] text-muted-foreground">{p.title} — {p.role}</p>
                          <p className="text-[10px] text-primary/70 truncate">{p.focus}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-md border-border/40">
              <CardContent className="p-6">
                <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Select Date & Time</h3>
                {errors.date && <p className="text-destructive text-xs mb-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.date}</p>}

                <div className="flex items-center justify-between mb-4">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth} disabled={isPrevDisabled}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="font-semibold text-sm">{MONTH_NAMES[currentMonth]} {currentYear}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-2">
                  {DAY_NAMES.map(d => (
                    <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day, i) => {
                    if (day === null) return <div key={`e-${i}`} />;
                    const disabled = isDateDisabled(day);
                    const dateStr = formatDate(day);
                    const isSelected = selectedDate === dateStr;
                    const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();

                    return (
                      <button
                        key={day}
                        disabled={disabled}
                        onClick={() => handleDateSelect(day)}
                        className={`h-10 rounded-lg text-sm font-medium transition-all ${
                          isSelected
                            ? "bg-primary text-white shadow-md"
                            : isToday
                              ? "bg-primary/10 text-primary font-bold"
                              : disabled
                                ? "text-muted-foreground/30 cursor-not-allowed"
                                : "hover:bg-muted/60 text-foreground"
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>

                {selectedDate && selectedPartner && (
                  <div className="mt-5 pt-5 border-t border-border/40">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Clock className="w-4 h-4 text-primary" />
                        Available Slots — {selectedDateObj?.toLocaleDateString("en-PK", { weekday: "short", day: "numeric", month: "short" })}
                      </h4>
                      {loadingSlots && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                    </div>
                    {errors.time && <p className="text-destructive text-xs mb-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.time}</p>}
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {TIME_SLOTS.map(slot => {
                        const booked = bookedTimes.includes(slot);
                        const isSelected = selectedTime === slot;
                        return (
                          <button
                            key={slot}
                            disabled={booked}
                            onClick={() => setSelectedTime(slot)}
                            className={`py-2 px-3 rounded-lg text-xs font-medium transition-all border ${
                              isSelected
                                ? "bg-primary text-white border-primary shadow-md"
                                : booked
                                  ? "bg-muted/40 text-muted-foreground/40 border-border/30 cursor-not-allowed line-through"
                                  : "border-border/50 hover:border-primary/40 hover:bg-primary/5"
                            }`}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedDate && !selectedPartner && (
                  <p className="mt-4 text-xs text-muted-foreground bg-amber-50 text-amber-700 rounded-lg p-3">
                    Please select a partner first to see available time slots.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="shadow-md border-border/40 sticky top-20">
              <CardContent className="p-6">
                <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /> Your Details</h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Full Name *</Label>
                    <Input
                      value={form.clientName}
                      onChange={e => { setForm({ ...form, clientName: e.target.value }); if (errors.clientName) setErrors(p => { const n = { ...p }; delete n.clientName; return n; }); }}
                      placeholder="Your full name"
                      className="h-9 text-sm"
                    />
                    {errors.clientName && <p className="text-destructive text-[10px] mt-0.5">{errors.clientName}</p>}
                  </div>
                  <div>
                    <Label className="text-xs">Email *</Label>
                    <Input
                      type="email"
                      value={form.clientEmail}
                      onChange={e => { setForm({ ...form, clientEmail: e.target.value }); if (errors.clientEmail) setErrors(p => { const n = { ...p }; delete n.clientEmail; return n; }); }}
                      placeholder="you@example.com"
                      className="h-9 text-sm"
                    />
                    {errors.clientEmail && <p className="text-destructive text-[10px] mt-0.5">{errors.clientEmail}</p>}
                  </div>
                  <div>
                    <Label className="text-xs">Phone *</Label>
                    <Input
                      value={form.clientPhone}
                      onChange={e => { setForm({ ...form, clientPhone: e.target.value }); if (errors.clientPhone) setErrors(p => { const n = { ...p }; delete n.clientPhone; return n; }); }}
                      placeholder="03xx-xxxxxxx"
                      className="h-9 text-sm"
                    />
                    {errors.clientPhone && <p className="text-destructive text-[10px] mt-0.5">{errors.clientPhone}</p>}
                  </div>
                  <div>
                    <Label className="text-xs">Company Name</Label>
                    <Input
                      value={form.companyName}
                      onChange={e => setForm({ ...form, companyName: e.target.value })}
                      placeholder="Optional"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Meeting Purpose *</Label>
                    <Select value={form.purpose} onValueChange={v => { setForm({ ...form, purpose: v }); if (errors.purpose) setErrors(p => { const n = { ...p }; delete n.purpose; return n; }); }}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select purpose" /></SelectTrigger>
                      <SelectContent>
                        {PURPOSES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {errors.purpose && <p className="text-destructive text-[10px] mt-0.5">{errors.purpose}</p>}
                  </div>
                  <div>
                    <Label className="text-xs">Duration</Label>
                    <Select value={form.duration} onValueChange={v => setForm({ ...form, duration: v })}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="45">45 minutes</SelectItem>
                        <SelectItem value="60">60 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Additional Notes</Label>
                    <Textarea
                      value={form.notes}
                      onChange={e => setForm({ ...form, notes: e.target.value })}
                      placeholder="Any specific topics or questions"
                      rows={2}
                      className="text-sm"
                    />
                  </div>

                  {(selectedPartner || selectedDate || selectedTime) && (
                    <div className="bg-muted/30 rounded-xl p-3 text-xs space-y-1.5 border border-border/30">
                      <p className="font-semibold text-foreground text-xs mb-1">Booking Summary</p>
                      {selectedPartner && <div className="flex justify-between"><span className="text-muted-foreground">Partner:</span><span className="font-medium">{selectedPartner.split(" ").slice(0, 2).join(" ")}...</span></div>}
                      {selectedDate && <div className="flex justify-between"><span className="text-muted-foreground">Date:</span><span className="font-medium">{selectedDateObj?.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}</span></div>}
                      {selectedTime && <div className="flex justify-between"><span className="text-muted-foreground">Time:</span><span className="font-medium">{selectedTime}</span></div>}
                      <div className="flex justify-between"><span className="text-muted-foreground">Duration:</span><span className="font-medium">{form.duration} min</span></div>
                    </div>
                  )}

                  <Button
                    className="w-full gap-2 h-10 mt-2"
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Booking...</>
                    ) : (
                      <><Calendar className="w-4 h-4" /> Book Meeting</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
