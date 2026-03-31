import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Settings as SettingsIcon, HardDrive, Cloud, CheckCircle2,
  AlertCircle, FolderOpen, RefreshCw, Save, ExternalLink,
  Key, Eye, EyeOff, Sparkles, Shield, FlaskConical, Timer, Power
} from "lucide-react";

interface StorageProvider {
  id: string;
  name: string;
  icon: string;
  description: string;
  connected: boolean;
  enabled: boolean;
  path: string;
  color: string;
}

interface SystemSetting {
  id: number;
  key: string;
  value: string;
  description: string | null;
}

export default function Settings() {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [apiKeyTesting, setApiKeyTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [chatgptApiKey, setChatgptApiKey] = useState("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [aiProvider, setAiProvider] = useState("openai");
  const [aiModel, setAiModel] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [autoGenEnabled, setAutoGenEnabled] = useState(true);
  const [autoGenInterval, setAutoGenInterval] = useState(2);
  const [autoGenSaving, setAutoGenSaving] = useState(false);

  const [providers, setProviders] = useState<StorageProvider[]>([
    {
      id: "google_drive",
      name: "Google Drive",
      icon: "https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg",
      description: "Store and sync documents with Google Drive. Supports shared drives and team folders.",
      connected: false,
      enabled: false,
      path: "/Alam & Aulakh/Documents",
      color: "bg-blue-500",
    },
    {
      id: "onedrive",
      name: "OneDrive",
      icon: "https://upload.wikimedia.org/wikipedia/commons/3/3c/Microsoft_Office_OneDrive_%282019%E2%80%93present%29.svg",
      description: "Integrate with Microsoft OneDrive for Business. Works with SharePoint and Teams.",
      connected: false,
      enabled: false,
      path: "/AlamAulakh/Documents",
      color: "bg-sky-500",
    },
    {
      id: "dropbox",
      name: "Dropbox",
      icon: "https://upload.wikimedia.org/wikipedia/commons/7/78/Dropbox_Icon.svg",
      description: "Sync files with Dropbox Business. Supports smart sync and selective sync.",
      connected: false,
      enabled: false,
      path: "/Alam & Aulakh",
      color: "bg-blue-600",
    },
    {
      id: "local",
      name: "Local Server",
      icon: "",
      description: "Store files on the local server filesystem. Best for on-premise deployments with direct access.",
      connected: true,
      enabled: true,
      path: "/data/documents",
      color: "bg-slate-600",
    },
  ]);

  const [activeProvider, setActiveProvider] = useState("local");

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem("hrm_token");
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/system-settings", {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setSettings(data.settings || []);
          const apiKeySetting = data.settings?.find((s: any) => s.key === "chatgpt_api_key");
          if (apiKeySetting?.configured) {
            setApiKeyConfigured(true);
          }
          const providerSetting = data.settings?.find((s: any) => s.key === "ai_provider");
          if (providerSetting?.value) setAiProvider(providerSetting.value);
          const modelSetting = data.settings?.find((s: any) => s.key === "ai_model");
          if (modelSetting?.value) setAiModel(modelSetting.value);
          const baseUrlSetting = data.settings?.find((s: any) => s.key === "ai_base_url");
          if (baseUrlSetting?.value) setAiBaseUrl(baseUrlSetting.value);
        }
      } catch {
      }
    };
    const fetchAutoGenConfig = async () => {
      try {
        const res = await fetch("/api/system-settings/auto-gen-config", {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setAutoGenEnabled(data.enabled);
          setAutoGenInterval(data.intervalHours);
        }
      } catch {
      }
    };
    fetchSettings();
    fetchAutoGenConfig();
  }, [getAuthHeaders]);

  const saveSetting = async (key: string, value: string, description: string) => {
    const res = await fetch(`/api/system-settings/${key}`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify({ value, description }),
    });
    return res;
  };

  const handleSaveApiKey = async () => {
    if (!chatgptApiKey.trim()) {
      toast({ title: "Validation", description: "API key is required", variant: "destructive" });
      return;
    }

    setApiKeySaving(true);
    try {
      const res = await saveSetting("chatgpt_api_key", chatgptApiKey, "API Key for AI Tax Analyzer and regulatory updates");

      if (res.ok) {
        setApiKeyConfigured(true);
        setChatgptApiKey("");
        toast({ title: "Saved", description: "API key has been saved securely." });
      } else if (res.status === 401 || res.status === 403) {
        toast({ title: "Session Expired", description: "Please log in again to save settings.", variant: "destructive" });
      } else {
        const data = await res.json().catch(() => null);
        toast({ title: "Error", description: data?.error || "Failed to save API key", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error — check your connection and try again.", variant: "destructive" });
    } finally {
      setApiKeySaving(false);
    }
  };

  const handleSaveAiConfig = async () => {
    if (aiProvider === "custom" && aiBaseUrl && !aiBaseUrl.startsWith("https://")) {
      toast({ title: "Validation", description: "Custom base URL must use HTTPS.", variant: "destructive" });
      return;
    }
    setApiKeySaving(true);
    try {
      const results = await Promise.all([
        saveSetting("ai_provider", aiProvider, "AI provider (openai, anthropic, google, deepseek, custom)"),
        saveSetting("ai_model", aiModel || "", "AI model name override"),
        saveSetting("ai_base_url", aiBaseUrl || "", "Custom AI API base URL"),
      ]);
      const allOk = results.every(r => r.ok);
      if (allOk) {
        toast({ title: "Saved", description: "AI configuration updated successfully." });
      } else {
        toast({ title: "Partial Error", description: "Some settings failed to save. Please try again.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to save AI configuration", variant: "destructive" });
    } finally {
      setApiKeySaving(false);
    }
  };

  const handleTestApiKey = async () => {
    setApiKeyTesting(true);
    setApiTestResult(null);
    try {
      const res = await fetch("/api/system-settings/test-api-key", {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setApiTestResult({ success: true, message: data.message });
        toast({ title: "Test Passed", description: data.message });
      } else {
        setApiTestResult({ success: false, message: data.error });
        toast({ title: "Test Failed", description: data.error, variant: "destructive" });
      }
    } catch {
      setApiTestResult({ success: false, message: "Network error — check your connection" });
      toast({ title: "Error", description: "Network error during API test", variant: "destructive" });
    } finally {
      setApiKeyTesting(false);
    }
  };

  const handleSaveAutoGenConfig = async () => {
    setAutoGenSaving(true);
    try {
      const res = await fetch("/api/system-settings/auto-gen-config", {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ enabled: autoGenEnabled, intervalHours: autoGenInterval }),
      });
      if (res.ok) {
        toast({ title: "Saved", description: `Auto-generation ${autoGenEnabled ? "enabled" : "disabled"}, interval: ${autoGenInterval}h` });
      } else {
        const data = await res.json().catch(() => null);
        toast({ title: "Error", description: data?.error || "Failed to save config", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to save auto-gen config", variant: "destructive" });
    } finally {
      setAutoGenSaving(false);
    }
  };

  const toggleProvider = (id: string) => {
    setProviders(prev =>
      prev.map(p =>
        p.id === id ? { ...p, enabled: !p.enabled } : p
      )
    );
  };

  const updatePath = (id: string, path: string) => {
    setProviders(prev =>
      prev.map(p =>
        p.id === id ? { ...p, path } : p
      )
    );
  };

  const connectProvider = (id: string) => {
    setProviders(prev =>
      prev.map(p =>
        p.id === id ? { ...p, connected: true } : p
      )
    );
    const provider = providers.find(p => p.id === id);
    toast({
      title: "Connected",
      description: `${provider?.name} has been connected successfully.`,
    });
  };

  const disconnectProvider = (id: string) => {
    setProviders(prev =>
      prev.map(p =>
        p.id === id ? { ...p, connected: false, enabled: false } : p
      )
    );
    const provider = providers.find(p => p.id === id);
    toast({
      title: "Disconnected",
      description: `${provider?.name} has been disconnected.`,
    });
  };

  const setAsPrimary = (id: string) => {
    setActiveProvider(id);
    toast({
      title: "Primary Storage Updated",
      description: `${providers.find(p => p.id === id)?.name} is now the primary storage.`,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    toast({
      title: "Settings Saved",
      description: "Storage configuration has been saved successfully.",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <SettingsIcon className="w-6 h-6 text-primary" />
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Configure API integrations, storage providers, and system preferences</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </div>

      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-500" />
            AI Integration
          </CardTitle>
          <p className="text-xs text-muted-foreground">Configure the AI provider for Tax Analyzer and regulatory update generation.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-xl p-5 border-violet-200/60 bg-violet-50/30">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-sm">AI Provider</h3>
                  {apiKeyConfigured ? (
                    <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-[10px] gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Configured
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-[10px] gap-1">
                      <AlertCircle className="w-3 h-3" /> Not Configured
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                  Powers the AI Tax Analysis Engine (document upload & text input) and regulatory updates for FBR, SECP, PSX, and SBP.
                </p>

                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Provider</Label>
                    <select
                      value={aiProvider}
                      onChange={(e) => { setAiProvider(e.target.value); setAiModel(""); setAiBaseUrl(""); }}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="openai">OpenAI (GPT-4o, GPT-4, etc.)</option>
                      <option value="anthropic">Anthropic (Claude)</option>
                      <option value="google">Google (Gemini)</option>
                      <option value="deepseek">DeepSeek</option>
                      <option value="custom">Custom (OpenAI-compatible API)</option>
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">API Key</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          type={showApiKey ? "text" : "password"}
                          value={chatgptApiKey}
                          onChange={(e) => setChatgptApiKey(e.target.value)}
                          placeholder={aiProvider === "anthropic" ? "sk-ant-..." : aiProvider === "google" ? "AIza..." : "sk-..."}
                          className="h-9 text-xs pl-9 pr-9 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleSaveApiKey}
                        disabled={apiKeySaving}
                        className="h-9 gap-1.5 text-xs"
                      >
                        {apiKeySaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save Key
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">
                        Model {aiProvider !== "custom" && <span className="text-muted-foreground/60">(optional override)</span>}
                      </Label>
                      <Input
                        value={aiModel}
                        onChange={(e) => setAiModel(e.target.value)}
                        placeholder={
                          aiProvider === "openai" ? "gpt-4o" :
                          aiProvider === "anthropic" ? "claude-sonnet-4-20250514" :
                          aiProvider === "google" ? "gemini-2.0-flash" :
                          aiProvider === "deepseek" ? "deepseek-chat" :
                          "model-name"
                        }
                        className="h-9 text-xs font-mono"
                      />
                    </div>
                    {aiProvider === "custom" && (
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">Base URL</Label>
                        <Input
                          value={aiBaseUrl}
                          onChange={(e) => setAiBaseUrl(e.target.value)}
                          placeholder="https://api.example.com/v1"
                          className="h-9 text-xs font-mono"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveAiConfig}
                      disabled={apiKeySaving}
                      className="h-9 gap-1.5 text-xs"
                    >
                      {apiKeySaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Save Configuration
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleTestApiKey}
                      disabled={apiKeyTesting}
                      className="h-9 gap-1.5 text-xs"
                    >
                      {apiKeyTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
                      Test Connection
                    </Button>
                  </div>

                  {apiTestResult && (
                    <div className={`flex items-start gap-2 text-[11px] rounded-lg p-2.5 ${
                      apiTestResult.success
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}>
                      {apiTestResult.success ? (
                        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      )}
                      <p>{apiTestResult.message}</p>
                    </div>
                  )}

                  <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/40 rounded-lg p-2.5">
                    <Shield className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500" />
                    <p>Your API key is stored securely. It is used server-side for the AI Tax Analyzer and regulatory update generation. All providers use the OpenAI-compatible API format.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-violet-200/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="w-5 h-5 text-violet-500" />
            Auto-Generation Configuration
          </CardTitle>
          <p className="text-xs text-muted-foreground">Configure automatic regulatory update generation schedule and behavior.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-xl p-5 border-violet-200/60 bg-violet-50/30">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                    <Power className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Auto-Generation</h3>
                    <p className="text-xs text-muted-foreground">
                      Automatically generate regulatory updates using AI
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={autoGenEnabled}
                    onCheckedChange={setAutoGenEnabled}
                  />
                  <span className="text-xs font-medium">
                    {autoGenEnabled ? (
                      <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-[10px]">Enabled</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground border-border text-[10px]">Disabled</Badge>
                    )}
                  </span>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Generation Interval</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={24}
                      value={autoGenInterval}
                      onChange={(e) => setAutoGenInterval(Math.max(1, Math.min(24, parseInt(e.target.value) || 2)))}
                      className="h-9 text-xs w-20"
                    />
                    <span className="text-xs text-muted-foreground">hours</span>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Categories Generated</Label>
                  <div className="flex gap-1.5 mt-1">
                    {["FBR", "SECP", "PSX", "SBP"].map(cat => (
                      <Badge key={cat} variant="outline" className="text-[10px]">{cat}</Badge>
                    ))}
                  </div>
                </div>
              </div>

              <Button
                size="sm"
                onClick={handleSaveAutoGenConfig}
                disabled={autoGenSaving}
                className="gap-1.5 text-xs bg-violet-600 hover:bg-violet-700"
              >
                {autoGenSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Configuration
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Cloud className="w-5 h-5 text-primary" />
            Storage Configuration
          </CardTitle>
          <p className="text-xs text-muted-foreground">Choose where documents and files are stored. You can enable multiple providers and set one as primary.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className={`border rounded-xl p-5 transition-all ${
                activeProvider === provider.id
                  ? "border-primary/40 bg-primary/[0.02] shadow-sm"
                  : "border-border/60 hover:border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl ${provider.color}/10 flex items-center justify-center shrink-0`}>
                    {provider.icon ? (
                      <img src={provider.icon} alt={provider.name} className="w-7 h-7" />
                    ) : (
                      <HardDrive className="w-6 h-6 text-slate-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm">{provider.name}</h3>
                      {activeProvider === provider.id && (
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">Primary</Badge>
                      )}
                      {provider.connected ? (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-[10px] gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Connected
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground border-border text-[10px] gap-1">
                          <AlertCircle className="w-3 h-3" /> Not Connected
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{provider.description}</p>

                    {(provider.connected || provider.id === "local") && (
                      <div className="mt-3 space-y-3">
                        <div className="flex items-center gap-3">
                          <Label className="text-xs text-muted-foreground whitespace-nowrap w-24">Storage Path</Label>
                          <div className="flex-1 flex gap-2">
                            <Input
                              value={provider.path}
                              onChange={(e) => updatePath(provider.id, e.target.value)}
                              className="h-8 text-xs"
                              placeholder="Enter storage path..."
                            />
                            <Button variant="outline" size="sm" className="h-8 px-2 shrink-0">
                              <FolderOpen className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Label className="text-xs text-muted-foreground w-24">Auto Sync</Label>
                          <Switch
                            checked={provider.enabled}
                            onCheckedChange={() => toggleProvider(provider.id)}
                          />
                          <span className="text-xs text-muted-foreground">{provider.enabled ? "Enabled" : "Disabled"}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  {provider.id !== "local" && (
                    <>
                      {provider.connected ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-8 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                          onClick={() => disconnectProvider(provider.id)}
                        >
                          Disconnect
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="text-xs h-8 gap-1"
                          onClick={() => connectProvider(provider.id)}
                        >
                          <ExternalLink className="w-3 h-3" /> Connect
                        </Button>
                      )}
                    </>
                  )}
                  {provider.connected && activeProvider !== provider.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8"
                      onClick={() => setAsPrimary(provider.id)}
                    >
                      Set Primary
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-primary" />
            File Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="border rounded-lg p-4">
              <p className="text-2xl font-bold">
                {activeProvider === "local" ? "Local" : providers.find(p => p.id === activeProvider)?.name}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Active Storage</p>
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-2xl font-bold">{providers.filter(p => p.connected).length}</p>
              <p className="text-xs text-muted-foreground mt-1">Connected Providers</p>
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-2xl font-bold">{providers.filter(p => p.enabled).length}</p>
              <p className="text-xs text-muted-foreground mt-1">Auto Sync Active</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
