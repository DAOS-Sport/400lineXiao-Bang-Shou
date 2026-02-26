import { useEffect } from "react";
import { useLocation } from "wouter";

interface AdminGuardProps {
  children: React.ReactNode;
}

export default function AdminGuard({ children }: AdminGuardProps) {
  const [, navigate] = useLocation();

  useEffect(() => {
    // TODO: Replace localStorage Basic Auth check with JWT validation when ready
    const auth = localStorage.getItem("adminAuth");
    if (!auth) {
      navigate("/admin/login");
    }
  }, [navigate]);

  const auth = localStorage.getItem("adminAuth");
  if (!auth) return null;

  return <>{children}</>;
}
