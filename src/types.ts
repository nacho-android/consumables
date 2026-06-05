import type { Timestamp } from "firebase/firestore";

export type Role = "admin" | "standard";
export type TransactionStatus = "active" | "voided" | "corrected";

export type Profile = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  updatedBy?: string;
};

export type Project = {
  id: string;
  projectCode: string;
  projectName: string;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  updatedBy?: string;
};

export type ProjectMembership = {
  id: string;
  userId: string;
  projectId: string;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  updatedBy?: string;
};

export type Item = {
  id: string;
  databaseCode: string;
  itemCode: string;
  itemType: string;
  item: string;
  unitOfMeasure: string;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  updatedBy?: string;
};

export type ItemCost = {
  id: string;
  itemId: string;
  databaseCode: string;
  itemCode: string;
  itemType: string;
  itemName: string;
  cost: number | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  updatedBy?: string;
};

export type AcquisitionTransaction = {
  id: string;
  transactionDate: string;
  submittedAt?: Timestamp;
  userId: string;
  projectId: string;
  itemId: string;
  amount: number;
  unitOfMeasure: string;
  comments?: string;
  status: TransactionStatus;
  originalTransactionId?: string | null;
  voidOrCorrectionReason?: string | null;
  correctedBy?: string | null;
  correctedByName?: string | null;
  correctedAt?: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  updatedBy?: string;
  userDisplayName: string;
  userEmail: string;
  projectCode: string;
  projectName: string;
  databaseCode: string;
  itemCode: string;
  itemType: string;
  itemName: string;
};

export type AuditLogEntry = {
  id: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  reason?: string | null;
  createdAt?: Timestamp;
};

export type DatePreset = "today" | "week" | "month" | "year" | "custom";

export type DateRange = {
  start: string;
  end: string;
};

export type ImportIssueSeverity = "warning" | "error";

export type ImportIssue = {
  severity: ImportIssueSeverity;
  row?: number;
  field?: string;
  message: string;
};

export type ParsedItemRow = {
  rowNumber: number;
  databaseCode: string;
  itemCode: string;
  itemType: string;
  item: string;
  unitOfMeasure: string;
  active: boolean;
  cost: number | null;
};

export type ParsedProjectUserRow = {
  rowNumber: number;
  projectCode: string;
  displayName: string;
};
