import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../state/AuthContext";

export default function NavBar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const links = [
    { to: "/dashboard", label: "Dashboard", roles: ["engineer", "admin"] },
    { to: "/admin/users", label: "ผู้ใช้งาน", roles: ["admin"] },
    { to: "/admin/geofences", label: "พิกัด/Geofence", roles: ["admin"] },
    { to: "/admin/audit", label: "Audit Log", roles: ["admin"] },
  ];

  return (
    <nav className="border-b border-slate-800 bg-slate-950 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-4 flex-wrap">
        <span className="font-bold">Belt Check — หงสา</span>
        {links
          .filter((l) => user && l.roles.includes(user.role))
          .map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`text-sm ${location.pathname === l.to ? "text-teal-400 font-semibold" : "text-slate-400"}`}
            >
              {l.label}
            </Link>
          ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-400">{user?.fullName}</span>
        <button onClick={() => logout()} className="text-sm text-slate-400 underline">
          ออกจากระบบ
        </button>
      </div>
    </nav>
  );
}
