import type { ImageNoteEntry } from "../types";

/** A page as persisted in the browser archive. The image is stored as a
 * Blob (not an object URL, which dies on reload). */
export type ArchivedPage = {
  id: string;
  side: "manuscript" | "printed";
  label: string;
  orderKey: number;
  fileName: string | null;
  image: Blob | null;
  transcript: string;
  approved: boolean;
  notes: ImageNoteEntry[];
  updatedAt: number;
};

const DB_NAME = "masaed-archive";
const STORE = "pages";
const DB_VERSION = 1;

/** Keeps only well-formed pages so a corrupted store can never break
 * startup. Unknown fields are dropped; bad fields fall back to safe values. */
export function sanitizePage(raw: unknown): ArchivedPage | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== "string" || !p.id) return null;
  if (p.side !== "manuscript" && p.side !== "printed") return null;
  if (typeof p.orderKey !== "number" || !Number.isFinite(p.orderKey)) return null;
  const notes = Array.isArray(p.notes)
    ? (p.notes as unknown[]).filter(
        (n): n is ImageNoteEntry =>
          !!n && typeof n === "object" && typeof (n as ImageNoteEntry).id === "string"
      )
    : [];
  const transcript = typeof p.transcript === "string" ? p.transcript : "";
  return {
    id: p.id,
    side: p.side,
    label: typeof p.label === "string" ? p.label : "",
    orderKey: p.orderKey,
    fileName: typeof p.fileName === "string" ? p.fileName : null,
    image: p.image instanceof Blob ? p.image : null,
    transcript,
    // an approval is meaningless without text
    approved: p.approved === true && transcript.trim().length > 0,
    notes,
    updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : 0,
  };
}

function open(dbName = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("التخزين الدائم غير متاح في هذا المتصفح"));
      return;
    }
    const req = indexedDB.open(dbName, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("تعذّر فتح الأرشيف"));
  });
}

function run<T>(
  dbName: string | undefined,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  return open(dbName).then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req ? req.result : undefined);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("فشلت عملية الأرشيف"));
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error("أُلغيت عملية الأرشيف"));
        };
      })
  );
}

export const archive = {
  save(page: ArchivedPage, dbName?: string) {
    return run(dbName, "readwrite", (s) => s.put({ ...page, updatedAt: Date.now() })).then(
      () => undefined
    );
  },
  async loadAll(dbName?: string): Promise<ArchivedPage[]> {
    const all = (await run<unknown[]>(dbName, "readonly", (s) => s.getAll())) ?? [];
    return all
      .map(sanitizePage)
      .filter((p): p is ArchivedPage => p !== null)
      .sort((a, b) => a.orderKey - b.orderKey);
  },
  remove(id: string, dbName?: string) {
    return run(dbName, "readwrite", (s) => s.delete(id)).then(() => undefined);
  },
  clear(dbName?: string) {
    return run(dbName, "readwrite", (s) => s.clear()).then(() => undefined);
  },
};
