import { useDepartments } from "@/hooks/use-departments";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DepartmentSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  showAll?: boolean;
  className?: string;
}

export function DepartmentSelect({ value, onValueChange, placeholder = "Department", showAll = false, className }: DepartmentSelectProps) {
  const { departments } = useDepartments();

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className || "w-[180px]"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {showAll && <SelectItem value="all">All Departments</SelectItem>}
        <SelectItem value="none">No Department</SelectItem>
        {departments.map((d) => (
          <SelectItem key={d.id} value={String(d.id)}>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
              {d.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
