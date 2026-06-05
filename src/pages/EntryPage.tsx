import {
  addDoc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where
} from "firebase/firestore";
import { Eraser, Save, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Message } from "../components/Message";
import { useAuth } from "../hooks/useAuth";
import {
  itemsCollection,
  membershipsCollection,
  projectDoc,
  transactionsCollection
} from "../lib/collections";
import { todayInSydney } from "../lib/date";
import { ALLOWED_UNITS, FALLBACK_UNIT, safeUnit } from "../lib/units";
import type { Item, Project } from "../types";

type EntryPageProps = {
  onDone: () => void;
};

export function EntryPage({ onDone }: EntryPageProps): JSX.Element {
  const { user, profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [projectId, setProjectId] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayInSydney());
  const [itemSearch, setItemSearch] = useState("");
  const [itemId, setItemId] = useState("");
  const [amount, setAmount] = useState("");
  const [unitOfMeasure, setUnitOfMeasure] = useState(FALLBACK_UNIT);
  const [comments, setComments] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    async function loadProjects() {
      const membershipQuery = query(
        membershipsCollection,
        where("userId", "==", user!.uid),
        where("active", "==", true)
      );
      const memberships = await getDocs(membershipQuery);
      const loaded = await Promise.all(
        memberships.docs.map(async (membership) => {
          const projectIdFromMembership = String(membership.data().projectId);
          const snapshot = await getDoc(projectDoc(projectIdFromMembership));
          return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Project) : null;
        })
      );
      if (cancelled) return;
      const activeProjects = loaded.filter((project): project is Project => Boolean(project?.active));
      activeProjects.sort((a, b) => a.projectCode.localeCompare(b.projectCode));
      setProjects(activeProjects);
      setProjectId((current) => current || activeProjects[0]?.id || "");
    }
    void loadProjects().catch(() => setError("Could not load your project memberships."));
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    async function loadItems() {
      const itemQuery = query(itemsCollection, where("active", "==", true), orderBy("item"));
      const snapshot = await getDocs(itemQuery);
      if (!cancelled) {
        setItems(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Item)));
      }
    }
    void loadItems().catch(() => setError("Could not load active items."));
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === itemId) ?? null,
    [items, itemId]
  );

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId]
  );

  const filteredItems = useMemo(() => {
    const needle = itemSearch.trim().toLowerCase();
    if (!needle) return items.slice(0, 20);
    return items
      .filter((item) =>
        [item.item, item.itemType, item.itemCode].join(" ").toLowerCase().includes(needle)
      )
      .sort((a, b) => a.item.localeCompare(b.item))
      .slice(0, 20);
  }, [items, itemSearch]);

  const unitOptions = useMemo(() => {
    const defaultUnit = safeUnit(selectedItem?.unitOfMeasure);
    return [...new Set([defaultUnit, ...ALLOWED_UNITS])];
  }, [selectedItem?.unitOfMeasure]);

  useEffect(() => {
    if (!selectedItem) return;
    setUnitOfMeasure(safeUnit(selectedItem.unitOfMeasure));
  }, [selectedItem]);

  function clearForm(keepProject = true) {
    setTransactionDate(todayInSydney());
    setItemSearch("");
    setItemId("");
    setAmount("");
    setUnitOfMeasure(FALLBACK_UNIT);
    setComments("");
    if (!keepProject) setProjectId(projects[0]?.id || "");
  }

  function selectItem(item: Item) {
    const label = itemLabel(item);
    setItemId(item.id);
    setItemSearch(label);
    setUnitOfMeasure(safeUnit(item.unitOfMeasure));
  }

  async function submit(done: boolean) {
    setError(null);
    setMessage(null);
    if (!user || !profile || !selectedProject || !selectedItem) {
      setError("Project, item, date, amount, and unit are required.");
      return;
    }
    const numericAmount = Number(amount);
    if (!transactionDate || !Number.isFinite(numericAmount) || numericAmount <= 0 || !unitOfMeasure.trim()) {
      setError("Amount must be numeric and greater than zero, and a unit is required.");
      return;
    }

    setBusy(true);
    try {
      await addDoc(transactionsCollection, {
        transactionDate,
        submittedAt: serverTimestamp(),
        userId: user.uid,
        projectId: selectedProject.id,
        itemId: selectedItem.id,
        amount: numericAmount,
        unitOfMeasure: unitOfMeasure.trim(),
        comments: comments.trim(),
        status: "active",
        originalTransactionId: null,
        voidOrCorrectionReason: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        userDisplayName: profile.displayName,
        userEmail: profile.email,
        projectCode: selectedProject.projectCode,
        projectName: selectedProject.projectName,
        databaseCode: selectedItem.databaseCode,
        itemCode: selectedItem.itemCode,
        itemType: selectedItem.itemType,
        itemName: selectedItem.item
      });
      clearForm(true);
      if (done) onDone();
      else setMessage("Acquisition recorded.");
    } catch {
      setError("Could not save the acquisition. Check your project access and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="content-grid entry-grid">
      <form className="panel form-stack" onSubmit={(event) => event.preventDefault()}>
        <div className="form-header">
          <h2>New acquisition</h2>
        </div>

        <label htmlFor="transaction-date">Acquisition date</label>
        <input
          id="transaction-date"
          type="date"
          value={transactionDate}
          onChange={(event) => setTransactionDate(event.target.value)}
          required
        />

        <label htmlFor="project">Project</label>
        <select id="project" value={projectId} onChange={(event) => setProjectId(event.target.value)} required>
          <option value="">Select project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.projectCode} {project.projectName}
            </option>
          ))}
        </select>

        <label htmlFor="item-search">Item</label>
        <div className="combo">
          <input
            id="item-search"
            type="search"
            autoComplete="off"
            value={itemSearch}
            onChange={(event) => {
              setItemSearch(event.target.value);
              setItemId("");
            }}
            aria-controls="item-results"
            aria-expanded={filteredItems.length > 0}
            required
          />
          {itemSearch && !itemId ? (
            <div className="combo-list" id="item-results" role="listbox">
              {filteredItems.map((item) => (
                <button key={item.id} type="button" role="option" onClick={() => selectItem(item)}>
                  <span>{item.item}</span>
                  <small>{secondaryItemLabel(item)}</small>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {selectedItem && !selectedItem.unitOfMeasure?.trim() ? (
          <Message kind="info">This item has no default unit; using {FALLBACK_UNIT} until an admin updates it.</Message>
        ) : null}

        <div className="two-column">
          <div className="form-stack compact">
            <label htmlFor="amount">Amount</label>
            <input
              id="amount"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </div>
          <div className="form-stack compact">
            <label htmlFor="unit">Unit</label>
            <select id="unit" value={unitOfMeasure} onChange={(event) => setUnitOfMeasure(safeUnit(event.target.value))} required>
              {unitOptions.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label htmlFor="comments">Comments</label>
        <textarea
          id="comments"
          rows={3}
          value={comments}
          onChange={(event) => setComments(event.target.value)}
        />

        <div className="button-row">
          <button type="button" disabled={busy} onClick={() => void submit(false)}>
            <Save size={18} aria-hidden="true" />
            Add
          </button>
          <button type="button" disabled={busy} onClick={() => void submit(true)}>
            <Send size={18} aria-hidden="true" />
            Add & Done
          </button>
          <button className="secondary" type="button" disabled={busy} onClick={() => clearForm(false)}>
            <Eraser size={18} aria-hidden="true" />
            Clear
          </button>
        </div>

        {message ? <Message kind="success">{message}</Message> : null}
        {error ? <Message kind="error">{error}</Message> : null}
      </form>

      <aside className="side-panel">
        <h2>Current access</h2>
        <dl>
          <dt>Projects</dt>
          <dd>{projects.length}</dd>
          <dt>Active items</dt>
          <dd>{items.length}</dd>
        </dl>
      </aside>
    </section>
  );
}

function itemLabel(item: Item): string {
  return `${item.item} (${secondaryItemLabel(item)})`;
}

function secondaryItemLabel(item: Item): string {
  return [item.itemType, item.itemCode].filter(Boolean).join(" | ");
}
