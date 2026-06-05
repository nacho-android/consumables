import { ClipboardList, FileSpreadsheet, KeyRound, LayoutDashboard, LogOut, Settings, ShieldCheck } from "lucide-react";
import { Suspense, lazy, useState } from "react";
import { LoginPage } from "./pages/LoginPage";
import { EntryPage } from "./pages/EntryPage";
import { useAuth } from "./hooks/useAuth";
import { PasswordChange } from "./components/PasswordChange";

type Page = "entry" | "summary" | "settings" | "invoice" | "admin";

const SummaryPage = lazy(() => import("./pages/SummaryPage").then((module) => ({ default: module.SummaryPage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then((module) => ({ default: module.AdminPage })));
const InvoicePage = lazy(() => import("./pages/InvoicePage").then((module) => ({ default: module.InvoicePage })));

export function App(): JSX.Element {
  const { user, profile, loading, isAdmin, logout } = useAuth();
  const [page, setPage] = useState<Page>("entry");

  if (loading) {
    return (
      <main className="center-screen">
        <div className="loading-mark" aria-label="Loading" />
      </main>
    );
  }

  if (!user || !profile) return <LoginPage />;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Consumable acquisitions</p>
          <h1>
            {page === "entry"
              ? "Record acquisition"
              : page === "summary"
                ? "Summary"
                : page === "settings"
                  ? "Settings"
                  : page === "invoice"
                    ? "Invoice"
                    : "Admin utilities"}
          </h1>
        </div>
        <div className="topbar-user">
          <span>{profile.displayName}</span>
          <button className="icon-button" onClick={() => void logout()} title="Log out" type="button">
            <LogOut size={20} aria-hidden="true" />
            <span className="sr-only">Log out</span>
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Primary">
        <button className={page === "entry" ? "active" : ""} onClick={() => setPage("entry")} type="button">
          <ClipboardList size={18} aria-hidden="true" />
          Entry
        </button>
        <button className={page === "summary" ? "active" : ""} onClick={() => setPage("summary")} type="button">
          <LayoutDashboard size={18} aria-hidden="true" />
          Summary
        </button>
        <button className={page === "settings" ? "active" : ""} onClick={() => setPage("settings")} type="button">
          <KeyRound size={18} aria-hidden="true" />
          Settings
        </button>
        {isAdmin ? (
          <button className={page === "invoice" ? "active" : ""} onClick={() => setPage("invoice")} type="button">
            <FileSpreadsheet size={18} aria-hidden="true" />
            Invoice
          </button>
        ) : null}
        {isAdmin ? (
          <button className={page === "admin" ? "active" : ""} onClick={() => setPage("admin")} type="button">
            <Settings size={18} aria-hidden="true" />
            Admin
          </button>
        ) : null}
      </nav>

      <main className="page">
        {page === "entry" ? <EntryPage onDone={() => setPage("summary")} /> : null}
        {page === "settings" ? (
          <section className="settings-layout">
            <div className="panel form-stack">
              <h2>Password</h2>
              <p className="helper-text">{profile.email}</p>
              <PasswordChange />
            </div>
          </section>
        ) : null}
        <Suspense fallback={<section className="empty-state">Loading...</section>}>
          {page === "summary" ? <SummaryPage /> : null}
          {page === "invoice" && isAdmin ? <InvoicePage /> : null}
          {page === "admin" && isAdmin ? <AdminPage /> : null}
        </Suspense>
        {(page === "admin" || page === "invoice") && !isAdmin ? (
          <section className="empty-state">
            <ShieldCheck size={32} aria-hidden="true" />
            <p>Admin access is required.</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
