import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./use-auth";

interface Department {
  id: number;
  name: string;
  code: string;
  color: string;
  description: string | null;
}

interface DepartmentContextType {
  departments: Department[];
  selectedDepartmentId: number | null;
  setSelectedDepartmentId: (id: number | null) => void;
  getDepartmentName: (id: number | null | undefined) => string;
  getDepartmentColor: (id: number | null | undefined) => string;
  getDepartmentBadge: (id: number | null | undefined) => { name: string; color: string; bgClass: string };
  loading: boolean;
}

const DEPT_STYLES: Record<string, { bgClass: string }> = {
  AUD: { bgClass: "bg-blue-100 text-blue-700" },
  TAX: { bgClass: "bg-green-100 text-green-700" },
  COR: { bgClass: "bg-purple-100 text-purple-700" },
  ADV: { bgClass: "bg-orange-100 text-orange-700" },
  OTH: { bgClass: "bg-gray-100 text-gray-700" },
};

const DepartmentContext = createContext<DepartmentContextType | null>(null);

export function DepartmentProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch("/api/departments", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setDepartments(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);

  const getDepartmentName = useCallback(
    (id: number | null | undefined) => {
      if (!id) return "";
      return departments.find((d) => d.id === id)?.name || "";
    },
    [departments]
  );

  const getDepartmentColor = useCallback(
    (id: number | null | undefined) => {
      if (!id) return "#6b7280";
      return departments.find((d) => d.id === id)?.color || "#6b7280";
    },
    [departments]
  );

  const getDepartmentBadge = useCallback(
    (id: number | null | undefined) => {
      if (!id) return { name: "", color: "#6b7280", bgClass: "bg-gray-100 text-gray-500" };
      const dept = departments.find((d) => d.id === id);
      if (!dept) return { name: "", color: "#6b7280", bgClass: "bg-gray-100 text-gray-500" };
      const style = DEPT_STYLES[dept.code] || DEPT_STYLES.OTH;
      return { name: dept.name, color: dept.color, bgClass: style.bgClass };
    },
    [departments]
  );

  return (
    <DepartmentContext.Provider
      value={{ departments, selectedDepartmentId, setSelectedDepartmentId, getDepartmentName, getDepartmentColor, getDepartmentBadge, loading }}
    >
      {children}
    </DepartmentContext.Provider>
  );
}

export function useDepartments() {
  const ctx = useContext(DepartmentContext);
  if (!ctx) throw new Error("useDepartments must be used within DepartmentProvider");
  return ctx;
}
