import {
  getDoc,
  getDocs,
  orderBy,
  query,
  where
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Message } from "../components/Message";
import { Modal } from "../components/Modal";
import { useAuth } from "../hooks/useAuth";
import {
  membershipsCollection,
  profilesCollection,
  projectDoc,
  projectsCollection,
} from "../lib/collections";
import { functions } from "../lib/firebase";
import {
  dateRangeLabel,
  formatDate,
  formatDateTime,
  rangeForPreset
} from "../lib/date";
import {
  downloadCsv,
  downloadXlsx,
  toFriendlyRows,
  type ExportFormat
} from "../lib/export";
import type {
  AcquisitionTransaction,
  DatePreset,
  DateRange,
  Profile,
  Project
} from "../types";

const PAGE_SIZES = [10, 20, 50, 100];
const listTransactions = httpsCallable(functions, "listAccessibleTransactions");

export function SummaryPage(): JSX.Element {
  const { user, profile, isAdmin } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectFilter, setProjectFilter] = useState("all");
  const [preset, setPreset] = useState<DatePreset>("month");
  const [range, setRange] = useState<DateRange>(rangeForPreset("month"));
  const [transactions, setTransactions] = useState<AcquisitionTransaction[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(0);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<ExportFormat>("csv");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !profile) return undefined;
    let cancelled = false;
    async function loadProjects() {
      if (isAdmin) {
        const snapshot = await getDocs(query(projectsCollection, orderBy("projectCode")));
        if (!cancelled) setProjects(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Project)));
        return;
      }
      const membershipQuery = query(
        membershipsCollection,
        where("userId", "==", user!.uid),
        where("active", "==", true)
      );
      const memberships = await getDocs(membershipQuery);
      const loaded = await Promise.all(
        memberships.docs.map(async (membership) => {
          const snapshot = await getDocSafe(membership.data().projectId);
          return snapshot;
        })
      );
      if (!cancelled) {
        setProjects(loaded.filter((project): project is Project => Boolean(project)));
      }
    }
    void loadProjects().catch(() => setError("Could not load projects."));
    return () => {
      cancelled = true;
    };
  }, [isAdmin, profile, user]);

  useEffect(() => {
    setPage(0);
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFilter, range.start, range.end, projects.length]);

  useEffect(() => {
    if (!isAdmin) {
      setProfiles(profile ? new Map([[profile.id, profile]]) : new Map());
      return;
    }
    async function loadProfiles() {
      const snapshot = await getDocs(profilesCollection);
      setProfiles(new Map(snapshot.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() } as Profile])));
    }
    void loadProfiles().catch(() => undefined);
  }, [isAdmin, profile]);

  const totalPages = Math.max(1, Math.ceil(transactions.length / pageSize));
  const paged = useMemo(
    () => transactions.slice(page * pageSize, page * pageSize + pageSize),
    [transactions, page, pageSize]
  );

  function selectableProjectIds(selected: string): string[] {
    if (selected === "all") return projects.map((project) => project.id);
    return projects.some((project) => project.id === selected) ? [selected] : [];
  }

  async function fetchTransactions(selectedProject: string, selectedRange: DateRange): Promise<AcquisitionTransaction[]> {
    const projectIds = selectableProjectIds(selectedProject);
    if (projectIds.length === 0) return [];

    const result = await listTransactions({
      projectId: selectedProject,
      startDate: selectedRange.start,
      endDate: selectedRange.end
    });
    const transactions = ((result.data as { transactions?: unknown }).transactions ?? []) as AcquisitionTransaction[];

    return transactions.sort((a, b) => {
        if (a.transactionDate !== b.transactionDate) return b.transactionDate.localeCompare(a.transactionDate);
        return timestampMillis(b.submittedAt) - timestampMillis(a.submittedAt);
      });
  }

  async function refresh() {
    if (projects.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      setTransactions(await fetchTransactions(projectFilter, range));
    } catch {
      setError("Could not load transactions for this filter.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadFiltered() {
    setBusy(true);
    setError(null);
    try {
      const rows = toFriendlyRows(await fetchTransactions(projectFilter, range), profiles);
      const suffix = `${projectFilter === "all" ? "all-projects" : projectFilter}_${range.start}_${range.end}`;
      if (downloadFormat === "csv") downloadCsv(rows, `acquisitions_${suffix}.csv`);
      else downloadXlsx(rows, `acquisitions_${suffix}.xlsx`);
      setDownloadOpen(false);
    } catch {
      setError("Could not download this data set.");
    } finally {
      setBusy(false);
    }
  }

  function setPresetAndRange(nextPreset: DatePreset) {
    setPreset(nextPreset);
    if (nextPreset !== "custom") setRange(rangeForPreset(nextPreset));
  }

  return (
    <section className="summary-layout">
      <div className="toolbar">
        <div className="field-row wrap">
          <label htmlFor="summary-project">Project</label>
          <select id="summary-project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
            <option value="all">All accessible projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.projectCode} {project.projectName}{project.active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </div>

        <div className="segmented" aria-label="Date period">
          {(["today", "week", "month", "year", "custom"] as DatePreset[]).map((option) => (
            <button
              key={option}
              type="button"
              className={preset === option ? "active" : ""}
              onClick={() => setPresetAndRange(option)}
            >
              {option === "today"
                ? "Today"
                : option === "week"
                  ? "This week"
                  : option === "month"
                    ? "This month"
                    : option === "year"
                      ? "This year"
                      : "Custom"}
            </button>
          ))}
        </div>

        {preset === "custom" ? (
          <div className="field-row wrap">
            <input
              type="date"
              value={range.start}
              aria-label="Start date"
              onChange={(event) => setRange((current) => ({ ...current, start: event.target.value }))}
            />
            <input
              type="date"
              value={range.end}
              aria-label="End date"
              onChange={(event) => setRange((current) => ({ ...current, end: event.target.value }))}
            />
          </div>
        ) : null}

        <button className="secondary" type="button" disabled={busy} onClick={() => void refresh()}>
          <Search size={18} aria-hidden="true" />
          Refresh
        </button>
        <button type="button" disabled={busy} onClick={() => setDownloadOpen(true)}>
          <Download size={18} aria-hidden="true" />
          Download
        </button>
      </div>

      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th>Date and time</th>
              <th>User</th>
              <th>Project</th>
              <th>Item</th>
              <th>Amount</th>
              <th>Unit</th>
              <th>Comments</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((tx) => (
              <tr key={tx.id}>
                <td data-label="Date and time">
                  <span>{formatDate(tx.transactionDate)}</span>
                  <small>{formatDateTime(tx.submittedAt)}</small>
                </td>
                <td data-label="User">{tx.userDisplayName || tx.userEmail}</td>
                <td data-label="Project">
                  <span>{tx.projectCode}</span>
                  <small>{tx.projectName}</small>
                </td>
                <td data-label="Item">
                  <span>{tx.itemName}</span>
                  <small>{[tx.itemType, tx.databaseCode, tx.itemCode].filter(Boolean).join(" | ")}</small>
                </td>
                <td data-label="Amount">{tx.amount}</td>
                <td data-label="Unit">{tx.unitOfMeasure}</td>
                <td data-label="Comments">{tx.comments}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {paged.length === 0 ? <p className="empty-row">No transactions for {dateRangeLabel(range)}.</p> : null}
      </div>

      <footer className="pagination">
        <label htmlFor="page-size">Rows</label>
        <select
          id="page-size"
          value={pageSize}
          onChange={(event) => {
            setPageSize(Number(event.target.value));
            setPage(0);
          }}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
        <button className="icon-button" type="button" disabled={page === 0} onClick={() => setPage((current) => current - 1)} title="Previous page">
          <ChevronLeft size={20} aria-hidden="true" />
          <span className="sr-only">Previous page</span>
        </button>
        <span>Page {page + 1} of {totalPages}</span>
        <button className="icon-button" type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((current) => current + 1)} title="Next page">
          <ChevronRight size={20} aria-hidden="true" />
          <span className="sr-only">Next page</span>
        </button>
      </footer>

      {error ? <Message kind="error">{error}</Message> : null}

      <Modal title="Download acquisitions" open={downloadOpen} onClose={() => setDownloadOpen(false)}>
        <div className="form-stack">
          <label htmlFor="download-project">Project</label>
          <select id="download-project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
            <option value="all">All accessible projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.projectCode} {project.projectName}{project.active ? "" : " (inactive)"}
              </option>
            ))}
          </select>

          <label htmlFor="download-format">Format</label>
          <select id="download-format" value={downloadFormat} onChange={(event) => setDownloadFormat(event.target.value as ExportFormat)}>
            <option value="csv">CSV</option>
            <option value="xlsx">Excel</option>
          </select>

          <p className="helper-text">{dateRangeLabel(range)}</p>
          <button type="button" disabled={busy} onClick={() => void downloadFiltered()}>
            <FileSpreadsheet size={18} aria-hidden="true" />
            Download
          </button>
        </div>
      </Modal>
    </section>
  );
}

async function getDocSafe(projectId: string): Promise<Project | null> {
  const snapshot = await getDoc(projectDoc(projectId));
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Project) : null;
}

function timestampMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return Number(value.toMillis());
  }
  if (typeof value === "object" && "millis" in value) return Number(value.millis);
  if (typeof value === "object" && "seconds" in value) return Number(value.seconds) * 1000;
  return 0;
}
