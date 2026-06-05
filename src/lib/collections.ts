import {
  collection,
  doc,
  type CollectionReference,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  AcquisitionTransaction,
  AuditLogEntry,
  Item,
  ItemCost,
  Profile,
  Project,
  ProjectMembership
} from "../types";

type Stored<T extends { id: string }> = Omit<T, "id">;

function typedCollection<T extends { id: string }>(name: string): CollectionReference<Stored<T>> {
  return collection(db, name) as CollectionReference<Stored<T>>;
}

export const profilesCollection = typedCollection<Profile>("profiles");
export const projectsCollection = typedCollection<Project>("projects");
export const membershipsCollection = typedCollection<ProjectMembership>("projectMemberships");
export const itemsCollection = typedCollection<Item>("items");
export const itemCostsCollection = typedCollection<ItemCost>("itemCosts");
export const transactionsCollection = typedCollection<AcquisitionTransaction>("transactions");
export const auditLogCollection = typedCollection<AuditLogEntry>("auditLog");

export const projectDoc = (id: string) => doc(projectsCollection, id);
export const itemDoc = (id: string) => doc(itemsCollection, id);
export const itemCostDoc = (id: string) => doc(itemCostsCollection, id);
export const profileDoc = (id: string) => doc(profilesCollection, id);
export const membershipDoc = (userId: string, projectId: string) =>
  doc(membershipsCollection, `${userId}_${projectId}`);
