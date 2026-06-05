import { getDocs, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { FileSpreadsheet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Message } from "../components/Message";
import { itemCostsCollection, projectsCollection } from "../lib/collections";
import { functions } from "../lib/firebase";
import { downloadInvoiceXlsx, type InvoiceLine } from "../lib/invoice";
import type { AcquisitionTransaction, ItemCost, Project } from "../types";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
] as const;

const listTransactions = httpsCallable(functions, "listAccessibleTransactions");

export function InvoicePage(): JSX.Element {
  const defaults = useMemo(() => defaultInvoiceSelections(), []);
  const [projects, setProjects] = useState<Project[]>([]);
  const [itemCosts, setItemCosts] = useState<ItemCost[]>([]);
  const [projectId, setProjectId] = useState("");
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [invoiceMonth, setInvoiceMonth] = useState(defaults.month);
  const [invoiceYear, setInvoiceYear] = useState(defaults.year);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadAdminData() {
      const [projectSnap, costSnap] = await Promise.all([
        getDocs(query(projectsCollection, orderBy("projectCode"))),
        getDocs(query(itemCostsCollection, orderBy("itemName")))
      ]);
      if (cancelled) return;
      const loadedProjects = projectSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(loadedProjects);
      setItemCosts(costSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as ItemCost)));
      setProjectId((current) => current || loadedProjects[0]?.id || "");
    }
    void loadAdminData().catch(() => setError("Could not load invoice setup data."));
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProject = projects.find((project) => project.id === projectId) ?? null;
  const years = useMemo(() => {
    const currentYear = defaults.year;
    return Array.from({ length: 5 }, (_, index) => currentYear - 2 + index);
  }, [defaults.year]);

  async function generateInvoice() {
    setError(null);
    setMessage(null);
    if (!selectedProject) {
      setError("Select a project before generating an invoice.");
      return;
    }
    if (!startDate || !endDate || startDate > endDate) {
      setError("Choose a valid invoice date range.");
      return;
    }

    setBusy(true);
    try {
      const result = await listTransactions({
        projectId: selectedProject.id,
        startDate,
        endDate
      });
      const transactions = (((result.data as { transactions?: unknown }).transactions ?? []) as AcquisitionTransaction[])
        .filter((tx) => tx.status === "active")
        .sort((a, b) => {
          const typeCompare = a.itemType.localeCompare(b.itemType);
          if (typeCompare !== 0) return typeCompare;
          return a.itemName.localeCompare(b.itemName);
        });
      const costsByItem = new Map(itemCosts.map((itemCost) => [itemCost.itemId, itemCost.cost]));
      const missingCosts = new Set<string>();
      const lines: InvoiceLine[] = transactions.map((tx) => {
        const cost = costsByItem.get(tx.itemId);
        if (typeof cost !== "number" || !Number.isFinite(cost)) missingCosts.add(tx.itemName);
        return {
          projectCode: tx.projectCode,
          itemType: tx.itemType,
          itemName: tx.itemName,
          unitOfMeasure: tx.unitOfMeasure,
          amount: tx.amount,
          cost: typeof cost === "number" && Number.isFinite(cost) ? cost : 0
        };
      });
      await downloadInvoiceXlsx({
        projectCode: selectedProject.projectCode,
        projectName: selectedProject.projectName,
        invoiceMonth,
        invoiceYear,
        lines
      });
      const warning = missingCosts.size > 0 ? ` ${missingCosts.size} item cost${missingCosts.size === 1 ? "" : "s"} missing and exported as 0.` : "";
      setMessage(`Invoice generated for ${transactions.length} active transaction${transactions.length === 1 ? "" : "s"}.${warning}`);
    } catch {
      setError("Could not generate the invoice.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="content-grid">
      <form className="panel form-stack" onSubmit={(event) => event.preventDefault()}>
        <div className="form-header">
          <h2>Billing summary invoice</h2>
        </div>

        <label htmlFor="invoice-project">Project</label>
        <select id="invoice-project" value={projectId} onChange={(event) => setProjectId(event.target.value)} required>
          <option value="">Select project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.projectCode} {project.projectName}{project.active ? "" : " (inactive)"}
            </option>
          ))}
        </select>

        <div className="two-column">
          <div className="form-stack compact">
            <label htmlFor="invoice-start">Start date</label>
            <input id="invoice-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
          </div>
          <div className="form-stack compact">
            <label htmlFor="invoice-end">End date</label>
            <input id="invoice-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required />
          </div>
        </div>

        <div className="two-column">
          <div className="form-stack compact">
            <label htmlFor="invoice-month">Invoice month</label>
            <select id="invoice-month" value={invoiceMonth} onChange={(event) => setInvoiceMonth(event.target.value)}>
              {MONTHS.map((month) => <option key={month} value={month}>{month}</option>)}
            </select>
          </div>
          <div className="form-stack compact">
            <label htmlFor="invoice-year">Invoice year</label>
            <select id="invoice-year" value={invoiceYear} onChange={(event) => setInvoiceYear(Number(event.target.value))}>
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
        </div>

        <button type="button" disabled={busy} onClick={() => void generateInvoice()}>
          <FileSpreadsheet size={18} aria-hidden="true" />
          Generate invoice
        </button>

        {message ? <Message kind="success">{message}</Message> : null}
        {error ? <Message kind="error">{error}</Message> : null}
      </form>
    </section>
  );
}

function defaultInvoiceSelections(): {
  month: string;
  year: number;
  startDate: string;
  endDate: string;
} {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "numeric"
  }).formatToParts(new Date());
  const currentYear = Number(parts.find((part) => part.type === "year")?.value);
  const currentMonth = Number(parts.find((part) => part.type === "month")?.value);
  const previousMonthIndex = currentMonth === 1 ? 11 : currentMonth - 2;
  const invoiceYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  const monthNumber = previousMonthIndex + 1;
  const startDate = `${invoiceYear}-${String(monthNumber).padStart(2, "0")}-01`;
  const endDay = new Date(Date.UTC(invoiceYear, monthNumber, 0)).getUTCDate();
  const endDate = `${invoiceYear}-${String(monthNumber).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
  return {
    month: MONTHS[previousMonthIndex],
    year: invoiceYear,
    startDate,
    endDate
  };
}
