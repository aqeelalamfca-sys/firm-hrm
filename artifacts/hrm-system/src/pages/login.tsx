import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Loader2, ArrowLeft, Shield, Award, Users, Eye, EyeOff } from "lucide-react";

export default function Login() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login({ email, password });
      setLocation("/");
    } catch (err) {
      setError("Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-background">
      <div className="hidden lg:flex w-[45%] relative overflow-hidden items-center justify-center" style={{ background: 'linear-gradient(135deg, hsl(224 40% 14%) 0%, hsl(217 78% 22%) 50%, hsl(224 40% 10%) 100%)' }}>
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-blue-500/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-[250px] h-[250px] bg-violet-500/10 rounded-full blur-[80px]" />
        <div className="relative z-10 p-16 max-w-lg">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10">
              <img src={`${import.meta.env.BASE_URL}images/logo-icon.png`} alt="Alam & Aulakh" className="h-9" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Alam & Aulakh</h1>
              <p className="text-xs text-white/40 font-medium">Chartered Accountants</p>
            </div>
          </div>
          <p className="text-lg leading-relaxed text-white/50 font-light mb-10">
            Enterprise HRM and invoicing platform designed specifically for Alam & Aulakh Chartered Accountants.
          </p>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Shield className="w-4 h-4 text-blue-400" />
              </div>
              <span className="text-sm text-white/60">Enterprise-grade security</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <Award className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="text-sm text-white/60">ICAP approved training organization</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                <Users className="w-4 h-4 text-violet-400" />
              </div>
              <span className="text-sm text-white/60">1295+ clients across 25+ sectors</span>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-[55%] flex items-center justify-center p-6 bg-background relative">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/[0.03] rounded-full blur-3xl -z-10 transform translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-violet-500/[0.02] rounded-full blur-3xl -z-10 transform -translate-x-1/3 translate-y-1/3" />

        <div className="w-full max-w-[440px] space-y-5">
          <Card className="border-border/30 bg-card shadow-xl shadow-black/[0.04]">
            <CardHeader className="space-y-2 text-center pt-10 pb-2">
              <div className="w-16 h-16 rounded-2xl bg-primary/[0.06] flex items-center justify-center mx-auto mb-2">
                <img src={`${import.meta.env.BASE_URL}images/logo-icon.png`} alt="Alam & Aulakh" className="h-10" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">Welcome back</CardTitle>
              <CardDescription className="text-base text-muted-foreground">Sign in to your account to continue</CardDescription>
            </CardHeader>
            <CardContent className="pb-8 px-8 pt-4">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium text-foreground/70">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@firm.com"
                    required
                    autoComplete="email"
                    className="h-12 bg-muted/30 border-border/50 focus:border-primary/40 focus:bg-background transition-all rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium text-foreground/70">Password</Label>
                    <span className="text-sm font-medium text-muted-foreground/50 cursor-default">Forgot password?</span>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                      className="h-12 bg-muted/30 border-border/50 focus:border-primary/40 focus:bg-background transition-all rounded-xl pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                    </button>
                  </div>
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-sm text-destructive font-medium bg-destructive/5 border border-destructive/10 rounded-xl px-4 py-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                    {error}
                  </div>
                )}
                <Button type="submit" className="w-full h-12 text-sm font-semibold mt-2 rounded-xl transition-all" style={{ background: 'linear-gradient(135deg, hsl(217 78% 51%) 0%, hsl(217 78% 42%) 100%)', boxShadow: '0 4px 14px rgba(59,130,246,0.3)' }} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign in"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="text-center mt-4">
            <Link href="/landing">
              <button className="text-xs text-muted-foreground hover:text-primary transition-colors font-medium inline-flex items-center gap-1.5">
                <ArrowLeft className="w-3 h-3" />
                Back to Home
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
