import { lazy, Suspense, useState } from "react";
import { useSettings } from "./context/SettingsContext";

import {
  BarChart3,
  ClipboardPlus,
  FileText,
  Gauge,
  LayoutDashboard,
  Settings as SettingsIcon,
  Users,
} from "lucide-react";

import Dashboard from "./pages/ProductionDashboard";
import Department from "./pages/Department";
import WorkEntry from "./pages/WorkEntry";
import Production from "./pages/Production";
import Workers from "./pages/Workers";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Login from "./pages/Login";

import "./App.css";

const IntelligenceDashboard = lazy(() => import("./pages/Dashboard"));

function App() {
  // =====================================================
  // LOGIN / AUTHENTICATION
  // =====================================================

  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");

    if (!savedUser || !token) {
      return null;
    }

    try {
      return JSON.parse(savedUser);
    } catch {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      return null;
    }
  });

  // =====================================================
  // SETTINGS
  // =====================================================

  const { settings, loading, error, refreshSettings } = useSettings();

  // =====================================================
  // PAGE STATE
  // =====================================================

  const [currentPage, setCurrentPage] = useState("overview");
  const [selectedDepartment, setSelectedDepartment] = useState(null);

  // =====================================================
  // LOGIN
  // =====================================================

  const handleLogin = (loggedInUser) => {
    setUser(loggedInUser);
    setSelectedDepartment(null);
    setCurrentPage("overview");
  };

  // =====================================================
  // LOGOUT
  // =====================================================

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    setUser(null);
    setSelectedDepartment(null);
    setCurrentPage("overview");
  };

  // =====================================================
  // DEPARTMENT
  // =====================================================

  const handleDepartmentClick = (department) => {
    setSelectedDepartment(department);
    setCurrentPage("department");
  };

  // =====================================================
  // OVERVIEW
  // =====================================================

  const goToOverview = () => {
    setSelectedDepartment(null);
    setCurrentPage("overview");
  };

  // =====================================================
  // WORK ENTRY
  // =====================================================

  const openWorkEntry = () => {
    setSelectedDepartment(null);
    setCurrentPage("workEntry");
  };

  // =====================================================
  // PAGE NAVIGATION
  // =====================================================

  const navigateTo = (page) => {
    setSelectedDepartment(null);
    setCurrentPage(page);
  };

  // =====================================================
  // LOGIN SCREEN
  // =====================================================

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  // =====================================================
  // MAIN APPLICATION
  // =====================================================

  return (
    <div className="appShell">
      {/* =================================================
          SIDEBAR
          ================================================= */}

      <aside className="sidebar">
        {/* BRAND */}

        <div className="brand">
          <div className="brandMark">S</div>

          <div>
            <strong>ST★RLIT</strong>
            <span>STEEL SYSTEMS</span>
          </div>
        </div>

        {/* =================================================
            NAVIGATION
            ================================================= */}

        <nav>
          {/* OVERVIEW */}

          <button
            type="button"
            className={`navItem ${
              currentPage === "overview" ||
              currentPage === "department"
                ? "active"
                : ""
            }`}
            onClick={goToOverview}
          >
            <LayoutDashboard size={18} />
            <span>Overview</span>
          </button>

          {/* DASHBOARD */}

          <button
            type="button"
            className={`navItem ${
              currentPage === "dashboard" ? "active" : ""
            }`}
            onClick={() => navigateTo("dashboard")}
          >
            <Gauge size={18} />
            <span>Dashboard</span>
          </button>

          {/* WORK ENTRY */}

          <button
            type="button"
            className={`navItem ${
              currentPage === "workEntry" ? "active" : ""
            }`}
            onClick={openWorkEntry}
          >
            <ClipboardPlus size={18} />
            <span>Work Entry</span>
          </button>

          {/* PRODUCTION */}

          <button
            type="button"
            className={`navItem ${
              currentPage === "production" ? "active" : ""
            }`}
            onClick={() => navigateTo("production")}
          >
            <BarChart3 size={18} />
            <span>Production</span>
          </button>

          {/* WORKERS */}

          <button
            type="button"
            className={`navItem ${
              currentPage === "workers" ? "active" : ""
            }`}
            onClick={() => navigateTo("workers")}
          >
            <Users size={18} />
            <span>Workers</span>
          </button>

          {/* REPORTS */}

          <button
            type="button"
            className={`navItem ${
              currentPage === "reports" ? "active" : ""
            }`}
            onClick={() => navigateTo("reports")}
          >
            <FileText size={18} />
            <span>Reports</span>
          </button>
        </nav>

        {/* =================================================
            SIDEBAR BOTTOM
            ================================================= */}

        <div className="sidebarBottom">
          {/* SETTINGS */}

          {user.role === "superadmin" && (
  <button
    type="button"
    className={`navItem ${
      currentPage === "settings" ? "active" : ""
    }`}
    onClick={() => navigateTo("settings")}
  >
    <SettingsIcon size={18} />
    <span>Settings</span>
  </button>
)}

          {/* LOGGED IN USER */}

          <div className="systemStatus">
            <span></span>

            <div>
              <strong>{user.name}</strong>
              <small>
                {user.role === "superadmin"
                  ? "Super Admin"
                  : "Admin"}
              </small>
            </div>
          </div>

          {/* LOGOUT */}

          <button
            type="button"
            className="navItem"
            onClick={handleLogout}
          >
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* =================================================
          MAIN AREA
          ================================================= */}

      <div className="mainArea">
        {/* =================================================
            TOP BAR
            ================================================= */}

        <header className="topbar">
          <div>
            <span>
              {settings?.companyName?.toUpperCase() ||
                "PRODUCTION AUTOMATION"}
            </span>
          </div>

          <div className="topbarRight">
            <span>
              {new Date()
                .toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
                })
                .toUpperCase()}
            </span>

            <div className="topDivider"></div>

            <strong>
              {currentPage === "dashboard"
                ? "DASHBOARD"
                : currentPage === "workEntry"
                ? "WORK ENTRY"
                : currentPage === "production"
                ? "PRODUCTION CONTROL"
                : currentPage === "workers"
                ? "WORKFORCE"
                : currentPage === "reports"
                ? "DAILY REPORT"
                : currentPage === "settings"
                ? "SETTINGS"
                : selectedDepartment
                ? `${selectedDepartment} DEPARTMENT`
                : "PRODUCTION"}
            </strong>
          </div>
        </header>

        {/* =================================================
            SETTINGS STATUS
            ================================================= */}

        {error && (
          <div
            role="alert"
            className="settingsMessage settingsMessageError"
          >
            Settings unavailable.{" "}
            {settings
              ? "Showing last loaded configuration."
              : "Units and report preferences are unavailable."}

            <button type="button" onClick={refreshSettings}>
              Retry
            </button>
          </div>
        )}

        {loading && !settings && (
          <div role="status">Loading settings...</div>
        )}

        {/* =================================================
            OVERVIEW
            ================================================= */}

        {currentPage === "overview" && (
          <Dashboard
            onDepartmentClick={handleDepartmentClick}
            onWorkEntryClick={openWorkEntry}
            onProductionClick={() => navigateTo("production")}
          />
        )}

        {/* =================================================
            DASHBOARD
            ================================================= */}

        {currentPage === "dashboard" && (
          <Suspense
            fallback={
              <main className="dashboardPage">
                <div className="dashboardLoadingState">
                  Loading dashboard...
                </div>
              </main>
            }
          >
            <IntelligenceDashboard />
          </Suspense>
        )}

        {/* =================================================
            DEPARTMENT
            ================================================= */}

        {currentPage === "department" &&
          selectedDepartment && (
            <Department
              department={selectedDepartment}
              onBack={goToOverview}
            />
          )}

        {/* =================================================
            WORK ENTRY
            ================================================= */}

       {currentPage === "workEntry" && (
  <WorkEntry user={user} />
)}

        {/* =================================================
            PRODUCTION
            ================================================= */}

        {currentPage === "production" && <Production user={user} />}

        {/* =================================================
            WORKERS
            ================================================= */}

        {currentPage === "workers" && <Workers user={user} />}

        {/* =================================================
            REPORTS
            ================================================= */}

        {currentPage === "reports" && <Reports />}

        {/* =================================================
            SETTINGS
            ================================================= */}

        {currentPage === "settings" &&
  user.role === "superadmin" && <Settings user={user} />}
      </div>
    </div>
  );
}

export default App;
