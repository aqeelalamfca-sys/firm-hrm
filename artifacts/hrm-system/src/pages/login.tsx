import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Loader2, ArrowLeft } from "lucide-react";

export default function Login() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      <div className="hidden lg:flex w-[45%] bg-sidebar relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
        <div className="relative z-10 p-16 max-w-lg">
          <div className="flex items-center gap-3 mb-10">
            <img src={`${import.meta.env.BASE_URL}images/logo-icon.png`} alt="Alam & Aulakh" className="h-12" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-sidebar-foreground">Alam & Aulakh</h1>
              <p className="text-xs text-sidebar-foreground/50 font-medium">Chartered Accountants</p>
            </div>
          </div>
          <p className="text-lg leading-relaxed text-sidebar-foreground/65 font-light">
            Enterprise HRM and invoicing platform designed specifically for Alam & Aulakh Chartered Accountants.
          </p>
        </div>
      </div>

      <div className="w-full lg:w-[55%] flex items-center justify-center p-6 bg-background relative">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/[0.04] rounded-full blur-3xl -z-10 transform translate-x-1/3 -translate-y-1/3" />

        <div className="w-full max-w-[460px] space-y-5">
          <Card className="border-border/40 bg-card shadow-lg">
            <CardHeader className="space-y-2 text-center pt-8 pb-2">
              <img src={`${import.meta.env.BASE_URL}images/logo-icon.png`} alt="Alam & Aulakh" className="h-14 mx-auto mb-1" />
              <CardTitle className="text-2xl font-bold tracking-tight">Welcome back</CardTitle>
              <CardDescription className="text-base text-muted-foreground">Sign in to your account to continue</CardDescription>
            </CardHeader>
            <CardContent className="pb-6 px-8 pt-4">
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
                    className="h-11 bg-background/60 border-border/60 focus:border-primary/40 focus:bg-background transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium text-foreground/70">Password</Label>
                    <a href="#" className="text-sm font-medium text-primary hover:text-primary/80 transition-colors">Forgot password?</a>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="h-11 bg-background/60 border-border/60 focus:border-primary/40 focus:bg-background transition-all"
                  />
                </div>
                {error && <p className="text-sm text-destructive font-medium">{error}</p>}
                <Button type="submit" className="w-full h-11 text-sm font-semibold mt-2 shadow-md transition-all" disabled={loading}>
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
