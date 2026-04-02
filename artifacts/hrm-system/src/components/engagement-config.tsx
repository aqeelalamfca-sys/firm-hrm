import React, { useMemo } from "react";
import {
  Building2, FileText, BookOpen, Target, AlertTriangle, Settings,
  Layers, BarChart2, Hash, TrendingUp, Scale, Briefcase, Calendar,
  FileOutput, Shield, CheckCircle2,
  HelpCircle, Sparkles
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  SECTIONS, VARIABLE_DEFS, WP_CODE_MAP,
  getVariablesBySection, isVariableVisible, getSectionStatus,
  type VariableDef, type SectionDef, type SectionStatus
} from "@/lib/engagement-variable-defs";

const ICON_MAP: Record<string, React.ElementType> = {
  Building2, FileText, BookOpen, Target, AlertTriangle, Settings,
  Layers, BarChart2, Hash, TrendingUp, Scale, Briefcase, Calendar,
  FileOutput, Shield,
};

const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  blue: { bg: "bg-blue-100", text: "text-blue-600" },
  indigo: { bg: "bg-indigo-100", text: "text-indigo-600" },
  sky: { bg: "bg-sky-100", text: "text-sky-600" },
  emerald: { bg: "bg-emerald-100", text: "text-emerald-600" },
  red: { bg: "bg-red-100", text: "text-red-600" },
  slate: { bg: "bg-slate-100", text: "text-slate-600" },
  violet: { bg: "bg-violet-100", text: "text-violet-600" },
  teal: { bg: "bg-teal-100", text: "text-teal-600" },
  orange: { bg: "bg-orange-100", text: "text-orange-600" },
  cyan: { bg: "bg-cyan-100", text: "text-cyan-600" },
  purple: { bg: "bg-purple-100", text: "text-purple-600" },
  amber: { bg: "bg-amber-100", text: "text-amber-600" },
  rose: { bg: "bg-rose-100", text: "text-rose-600" },
  gray: { bg: "bg-gray-100", text: "text-gray-600" },
  green: { bg: "bg-green-100", text: "text-green-600" },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  not_started: { bg: "bg-slate-100", text: "text-slate-500", label: "Not Started" },
  in_progress: { bg: "bg-amber-100", text: "text-amber-700", label: "In Progress" },
  complete: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Complete" },
};

interface EngagementConfigProps {
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  users?: Array<{ id: number; name: string; role?: string }>;
}

const FieldRenderer = React.memo(function FieldRenderer({
  v, value, onChange, users
}: {
  v: VariableDef; value: any; onChange: (val: any) => void;
  users?: Array<{ id: number; name: string; role?: string }>;
}) {
  switch (v.fieldType) {
    case "toggle":
      return (
        <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors bg-white">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">{v.label}</span>
              {v.mandatory && <span className="text-red-500 text-[10px] font-bold">*</span>}
              <FieldTooltip v={v} />
            </div>
            {v.wpCodes.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {v.wpCodes.slice(0, 4).map(c => (
                  <span key={c} className="text-[9px] font-mono font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">{c}</span>
                ))}
                {v.wpCodes.length > 4 && <span className="text-[9px] text-slate-400 font-bold">+{v.wpCodes.length - 4}</span>}
              </div>
            )}
          </div>
          <Switch
            checked={!!value}
            onCheckedChange={onChange}
            className="data-[state=checked]:bg-blue-600"
          />
        </div>
      );

    case "dropdown":
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-bold text-slate-600 ml-1">{v.label}</Label>
            {v.mandatory && <span className="text-red-500 text-[10px] font-bold">*</span>}
            <FieldTooltip v={v} />
          </div>
          <Select value={value || ""} onValueChange={onChange}>
            <SelectTrigger className="h-10 rounded-xl font-medium text-sm">
              <SelectValue placeholder={`Select ${v.label.toLowerCase()}...`} />
            </SelectTrigger>
            <SelectContent>
              {(v.options || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          {v.wpCodes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {v.wpCodes.slice(0, 5).map(c => (
                <span key={c} className="text-[9px] font-mono font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">{c}</span>
              ))}
              {v.wpCodes.length > 5 && <span className="text-[9px] text-slate-400 font-bold">+{v.wpCodes.length - 5}</span>}
            </div>
          )}
        </div>
      );

    case "text":
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-bold text-slate-600 ml-1">{v.label}</Label>
            {v.mandatory && <span className="text-red-500 text-[10px] font-bold">*</span>}
            <FieldTooltip v={v} />
          </div>
          <Input
            value={value || ""}
            onChange={e => onChange(e.target.value)}
            placeholder={`Enter ${v.label.toLowerCase()}...`}
            className="h-10 rounded-xl font-medium text-sm"
          />
        </div>
      );

    case "number":
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-bold text-slate-600 ml-1">{v.label}</Label>
            {v.mandatory && <span className="text-red-500 text-[10px] font-bold">*</span>}
            <FieldTooltip v={v} />
          </div>
          <Input
            type="number"
            value={value ?? ""}
            onChange={e => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
            placeholder="0"
            className="h-10 rounded-xl font-mono text-sm"
          />
        </div>
      );

    case "date":
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-bold text-slate-600 ml-1">{v.label}</Label>
            {v.mandatory && <span className="text-red-500 text-[10px] font-bold">*</span>}
            <FieldTooltip v={v} />
          </div>
          <Input
            type="date"
            value={value || ""}
            onChange={e => onChange(e.target.value)}
            onClick={e => (e.target as HTMLInputElement).showPicker?.()}
            className="h-10 rounded-xl font-mono text-sm cursor-pointer"
          />
        </div>
      );

    case "multi-select": {
      const selected: string[] = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-bold text-slate-600 ml-1">{v.label}</Label>
            {v.mandatory && <span className="text-red-500 text-[10px] font-bold">*</span>}
            <FieldTooltip v={v} />
          </div>
          <div className="flex flex-wrap gap-2 p-3 rounded-xl border border-slate-200 bg-white min-h-[40px]">
            {(v.options || []).map(o => {
              const isSelected = selected.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => onChange(isSelected ? selected.filter(s => s !== o) : [...selected, o])}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    case "user-picker":
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-bold text-slate-600 ml-1">{v.label}</Label>
            {v.mandatory && <span className="text-red-500 text-[10px] font-bold">*</span>}
            <FieldTooltip v={v} />
          </div>
          <Select value={value || ""} onValueChange={onChange}>
            <SelectTrigger className="h-10 rounded-xl text-sm">
              <SelectValue placeholder={`Select ${v.label.toLowerCase()}...`} />
            </SelectTrigger>
            <SelectContent>
              {users && users.length > 0 ? (
                users.map(u => <SelectItem key={u.id} value={u.name}>{u.name}{u.role ? ` — ${u.role}` : ""}</SelectItem>)
              ) : (
                <>
                  <SelectItem value="Engagement Partner">Engagement Partner</SelectItem>
                  <SelectItem value="Audit Manager">Audit Manager</SelectItem>
                  <SelectItem value="Audit Senior">Audit Senior</SelectItem>
                  <SelectItem value="EQCR Partner">EQCR Partner</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>
      );

    default:
      return null;
  }
});

function FieldTooltip({ v }: { v: VariableDef }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="text-slate-400 hover:text-blue-500 transition-colors">
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs p-3 space-y-2">
          <p className="text-xs font-bold text-slate-900">{v.label}</p>
          <p className="text-[11px] text-slate-600 leading-relaxed">{v.helpText}</p>
          <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
            <span className="text-[9px] font-bold text-blue-600 uppercase">Ref:</span>
            <span className="text-[10px] font-mono text-slate-500">{v.standardRef}</span>
          </div>
          {v.wpCodes.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase mr-1">WPs:</span>
              {v.wpCodes.map(c => (
                <span key={c} className="text-[9px] font-mono font-bold text-blue-600 bg-blue-50 px-1 rounded" title={WP_CODE_MAP[c] || c}>{c}</span>
              ))}
            </div>
          )}
          {v.isHighImpact && (
            <div className="flex items-center gap-1 pt-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span className="text-[9px] font-bold text-amber-600 uppercase">High-Impact Variable</span>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const SectionBlock = React.memo(function SectionBlock({
  section, variables, values, onChange, status, users
}: {
  section: SectionDef;
  variables: VariableDef[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  status: SectionStatus;
  users?: Array<{ id: number; name: string; role?: string }>;
}) {
  const Icon = ICON_MAP[section.iconName] || Shield;
  const statusStyle = STATUS_STYLES[status.status];
  const colors = COLOR_MAP[section.color] || COLOR_MAP.slate;
  const visibleVars = variables.filter(v => isVariableVisible(v, values));
  const toggleVars = visibleVars.filter(v => v.fieldType === "toggle");
  const formVars = visibleVars.filter(v => v.fieldType !== "toggle");

  if (visibleVars.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 pt-2">
        <div className={`w-7 h-7 rounded-lg ${colors.bg} flex items-center justify-center shrink-0`}>
          <Icon className={`w-3.5 h-3.5 ${colors.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">{section.title}</h3>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
              {statusStyle.label}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-slate-400 font-medium">{visibleVars.length} fields</span>
            {status.mandatory > 0 && (
              <span className="text-[10px] text-slate-400 font-medium">· {status.mandatoryComplete}/{status.mandatory} mandatory</span>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100" />

      {formVars.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {formVars.map(v => (
            <FieldRenderer
              key={v.key}
              v={v}
              value={values[v.key]}
              onChange={val => onChange(v.key, val)}
              users={users}
            />
          ))}
        </div>
      )}

      {toggleVars.length > 0 && (
        <div className="space-y-2">
          {formVars.length > 0 && <div className="border-t border-slate-50 pt-2" />}
          {toggleVars.map(v => (
            <FieldRenderer
              key={v.key}
              v={v}
              value={values[v.key]}
              onChange={val => onChange(v.key, val)}
              users={users}
            />
          ))}
        </div>
      )}

      {status.triggeredWps.length > 0 && (
        <div className="bg-blue-50/50 rounded-xl p-3 border border-blue-100">
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">Triggered Working Papers</p>
          <div className="flex flex-wrap gap-1.5">
            {status.triggeredWps.map(c => (
              <span key={c} className="text-[10px] font-mono font-bold text-blue-700 bg-white px-2 py-1 rounded-lg border border-blue-200" title={WP_CODE_MAP[c] || c}>
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default function EngagementConfig({ values, onChange, users }: EngagementConfigProps) {
  const sectionData = useMemo(() => {
    return SECTIONS.map(sec => ({
      section: sec,
      variables: getVariablesBySection(sec.id),
      status: getSectionStatus(sec.id, values),
    }));
  }, [values]);

  const overallStats = useMemo(() => {
    let totalMandatory = 0, totalMandatoryComplete = 0, totalVars = 0, totalComplete = 0;
    const allWps = new Set<string>();
    sectionData.forEach(s => {
      totalMandatory += s.status.mandatory;
      totalMandatoryComplete += s.status.mandatoryComplete;
      totalVars += s.status.total;
      totalComplete += s.status.mandatoryComplete + s.status.optionalComplete;
      s.status.triggeredWps.forEach(w => allWps.add(w));
    });
    const completeSections = sectionData.filter(s => s.status.status === "complete").length;
    return { totalMandatory, totalMandatoryComplete, totalVars, totalComplete, allWps: allWps.size, completeSections };
  }, [sectionData]);

  return (
    <div className="space-y-8">
      {sectionData.map(({ section, variables, status }) => (
        <SectionBlock
          key={section.id}
          section={section}
          variables={variables}
          values={values}
          onChange={onChange}
          status={status}
          users={users}
        />
      ))}

      <div className="bg-gradient-to-r from-slate-900 to-blue-900 rounded-xl p-5 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl" />
        <div className="relative z-10">
          <h4 className="text-[10px] font-bold text-blue-300 uppercase tracking-widest mb-3">Engagement Configuration — 121 Variables</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Mandatory</p>
              <p className="text-lg font-black text-white">{overallStats.totalMandatoryComplete}<span className="text-sm text-white/50">/{overallStats.totalMandatory}</span></p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Sections</p>
              <p className="text-lg font-black text-white">{overallStats.completeSections}<span className="text-sm text-white/50">/{SECTIONS.length}</span></p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Triggered WPs</p>
              <p className="text-lg font-black text-blue-400">{overallStats.allWps}</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Completed</p>
              <p className="text-lg font-black text-emerald-400">{overallStats.totalComplete}<span className="text-sm text-white/50">/{overallStats.totalVars}</span></p>
            </div>
          </div>
          {overallStats.totalMandatoryComplete === overallStats.totalMandatory && overallStats.totalMandatory > 0 && (
            <div className="flex items-center gap-2 mt-3 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">All mandatory variables configured — Ready for analysis</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
