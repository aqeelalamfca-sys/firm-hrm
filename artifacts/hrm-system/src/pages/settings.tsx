import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Settings as SettingsIcon, HardDrive, Cloud, CheckCircle2,
  AlertCircle, FolderOpen, RefreshCw, Save, ExternalLink
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

export default function Settings() {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
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
          <p className="text-sm text-muted-foreground mt-1">Configure storage providers and system preferences</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </div>

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
