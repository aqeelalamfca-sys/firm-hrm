import { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle2, XCircle, ArrowLeft, Clock, FileText, Download,
  GraduationCap, MapPin, Calendar, Loader2, AlertTriangle
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

interface Question {
  id: number;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  category: string;
}

interface TestResult {
  testStatus: "Passed" | "Failed";
  score: number;
  total: number;
  message: string;
  interviewDate?: string;
  interviewTime?: string;
  interviewLocation?: string;
  pdfUrl?: string;
}

export default function MCQTest() {
  const params = useParams<{ crn: string }>();
  const crn = params.crn;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [timeLeft, setTimeLeft] = useState(15 * 60);
  const [testStarted, setTestStarted] = useState(false);

  useEffect(() => {
    loadTest();
  }, [crn]);

  const loadTest = async () => {
    try {
      const res = await fetch(`${API_BASE}/applications/public/test/${crn}`);
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          const lookup = await fetch(`${API_BASE}/applications/public/lookup/${crn}`);
          const lookupData = await lookup.json();
          if (lookup.ok && lookupData.testStatus) {
            setResult({
              testStatus: lookupData.testStatus,
              score: lookupData.testScore,
              total: lookupData.testTotal,
              message: lookupData.testStatus === "Passed"
                ? "Congratulations! You have passed the test."
                : "Thank you for appearing in the test. We appreciate your effort. Unfortunately, you did not meet the qualifying criteria this time. We encourage you to continue learning and wish you success ahead.",
              interviewDate: lookupData.interviewDate,
              interviewTime: "11:00 AM — 12:00 PM",
              interviewLocation: lookupData.preferredLocation === "Lahore"
                ? "Suite 5,6 Ross Residencia, Canal Road, Lahore"
                : "16th Floor, State Life Building, F-6, Islamabad",
              pdfUrl: lookupData.pdfUrl,
            });
            setCandidateName(lookupData.fullName);
            setLoading(false);
            return;
          }
        }
        throw new Error(data.error || "Failed to load test");
      }
      setCandidateName(data.candidateName);
      setQuestions(data.questions);
      setLoading(false);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleTimeUp = useCallback(async () => {
    if (result || submitting) return;
    await handleSubmit();
  }, [answers, result, submitting]);

  useEffect(() => {
    if (!testStarted || result) return;
    if (timeLeft <= 0) {
      handleTimeUp();
      return;
    }
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [testStarted, timeLeft, result, handleTimeUp]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleAnswer = (questionId: number, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/applications/public/test/${crn}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit test");
      setResult(data);

      if (data.testStatus === "Passed" && data.pdfUrl) {
        setTimeout(() => {
          const link = document.createElement("a");
          link.href = data.pdfUrl;
          link.download = `result-${crn}.pdf`;
          link.click();
        }, 2000);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50/80 via-background to-indigo-50/50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Loading Assessment Test...</p>
        </div>
      </div>
    );
  }

  if (error && !result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50/80 via-background to-indigo-50/50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full shadow-lg border-border/40">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold mb-2">Unable to Load Test</h2>
            <p className="text-sm text-muted-foreground mb-6">{error}</p>
            <Link href="/landing">
              <Button variant="outline" className="gap-2"><ArrowLeft className="w-4 h-4" /> Back to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (result) {
    const passed = result.testStatus === "Passed";
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50/80 via-background to-indigo-50/50 flex items-center justify-center p-6">
        <Card className="max-w-lg w-full shadow-xl border-border/40">
          <CardContent className="p-8">
            <div className="text-center mb-6">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${passed ? "bg-emerald-100" : "bg-red-100"}`}>
                {passed ? <CheckCircle2 className="w-10 h-10 text-emerald-600" /> : <XCircle className="w-10 h-10 text-red-500" />}
              </div>
              <h2 className="text-2xl font-bold mb-1">{passed ? "Congratulations!" : "Test Result"}</h2>
              <p className="text-sm text-muted-foreground">{candidateName}</p>
              <p className="text-xs text-muted-foreground">CRN: {crn}</p>
            </div>

            <div className={`rounded-xl p-4 mb-6 ${passed ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Score</span>
                <span className={`text-2xl font-bold ${passed ? "text-emerald-600" : "text-red-600"}`}>
                  {result.score} / {result.total}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${passed ? "bg-emerald-500" : "bg-red-500"}`}
                  style={{ width: `${(result.score / result.total) * 100}%` }}
                />
              </div>
              <p className={`text-xs mt-2 font-medium ${passed ? "text-emerald-700" : "text-red-700"}`}>
                Status: {result.testStatus} {passed ? "(Minimum 8/10 required)" : "(Minimum 8/10 required)"}
              </p>
            </div>

            <p className="text-sm text-muted-foreground mb-6 text-center leading-relaxed">{result.message}</p>

            {passed && result.interviewDate && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" /> Interview Schedule
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-medium">
                      {new Date(result.interviewDate).toLocaleDateString("en-PK", {
                        weekday: "long", year: "numeric", month: "long", day: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{result.interviewTime}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{result.interviewLocation}</span>
                  </div>
                </div>
              </div>
            )}

            {passed && result.pdfUrl && (
              <a href={result.pdfUrl} download={`result-${crn}.pdf`} className="block mb-4">
                <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700">
                  <Download className="w-4 h-4" /> Download Result PDF
                </Button>
              </a>
            )}

            <Link href="/landing">
              <Button variant="outline" className="w-full gap-2"><ArrowLeft className="w-4 h-4" /> Back to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!testStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50/80 via-background to-indigo-50/50 flex items-center justify-center p-6">
        <Card className="max-w-lg w-full shadow-xl border-border/40">
          <CardContent className="p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <GraduationCap className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold mb-1">CA Assessment Test</h2>
              <p className="text-sm text-muted-foreground">Alam & Aulakh (Chartered Accountants)</p>
            </div>

            <div className="bg-muted/40 rounded-xl p-4 mb-6 space-y-2">
              <p className="text-sm"><span className="font-medium">Candidate:</span> {candidateName}</p>
              <p className="text-sm"><span className="font-medium">CRN:</span> {crn}</p>
            </div>

            <div className="border border-border/60 rounded-xl p-4 mb-6 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> Test Instructions</h3>
              <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-4">
                <li>Total Questions: <strong>10</strong> (MCQ)</li>
                <li>Time Limit: <strong>15 minutes</strong></li>
                <li>Passing Score: <strong>8 out of 10</strong></li>
                <li>Categories: Accounting, Audit, Tax, Excel, General Knowledge</li>
                <li>Only <strong>one attempt</strong> is allowed</li>
                <li>All questions must be answered before submission</li>
                <li>Test will auto-submit when time runs out</li>
              </ul>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6">
              <p className="text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                Once you start the test, you cannot pause or retake it. Make sure you are ready before proceeding.
              </p>
            </div>

            <Button
              onClick={() => setTestStarted(true)}
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-base py-5"
            >
              <GraduationCap className="w-5 h-5" /> Start Assessment Test
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const q = questions[currentQ];
  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === questions.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50/80 via-background to-indigo-50/50">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-border/40 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-sm">CA Assessment Test</h1>
            <p className="text-xs text-muted-foreground">{candidateName} | {crn}</p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-mono font-bold ${timeLeft <= 120 ? "bg-red-100 text-red-700 animate-pulse" : timeLeft <= 300 ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
            <Clock className="w-4 h-4" /> {formatTime(timeLeft)}
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentQ(i)}
              className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                i === currentQ
                  ? "bg-primary text-primary-foreground shadow-md scale-110"
                  : answers[questions[i].id]
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {i + 1}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">{answeredCount}/{questions.length} answered</span>
        </div>

        {q && (
          <Card className="shadow-lg border-border/40">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">{q.category}</span>
                <span className="text-xs text-muted-foreground">Question {currentQ + 1} of {questions.length}</span>
              </div>

              <h3 className="text-lg font-semibold mb-6 leading-relaxed">{q.question}</h3>

              <div className="space-y-3">
                {(["A", "B", "C", "D"] as const).map((opt) => {
                  const optionKey = `option${opt}` as keyof Question;
                  const isSelected = answers[q.id] === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => handleAnswer(q.id, opt)}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-start gap-3 ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border/60 hover:border-primary/40 hover:bg-muted/30"
                      }`}
                    >
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                        isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}>
                        {opt}
                      </span>
                      <span className="text-sm">{q[optionKey]}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/40">
                <Button
                  variant="outline"
                  onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
                  disabled={currentQ === 0}
                  className="gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" /> Previous
                </Button>

                {currentQ < questions.length - 1 ? (
                  <Button onClick={() => setCurrentQ(currentQ + 1)} className="gap-1.5">
                    Next <ArrowLeft className="w-4 h-4 rotate-180" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={!allAnswered || submitting}
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                  >
                    {submitting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Evaluating...</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4" /> Submit Test</>
                    )}
                  </Button>
                )}
              </div>

              {currentQ === questions.length - 1 && !allAnswered && (
                <p className="text-xs text-amber-600 mt-3 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Please answer all questions before submitting ({questions.length - answeredCount} remaining)
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
