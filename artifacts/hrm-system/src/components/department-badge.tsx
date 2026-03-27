import { useDepartments } from "@/hooks/use-departments";

export function DepartmentBadge({ departmentId }: { departmentId: number | null | undefined }) {
  const { getDepartmentBadge } = useDepartments();
  if (!departmentId) return null;
  const badge = getDepartmentBadge(departmentId);
  if (!badge.name) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.bgClass}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: badge.color }} />
      {badge.name}
    </span>
  );
}
