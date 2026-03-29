type PendingRecordingUpload = {
  id: string;
  roomId: string;
  fileName: string;
  mimeType: string;
  blob: Blob;
  createdAt: number;
  retryCount: number;
};

type FlushResult = {
  roomId: string;
  filePath: string;
};

const DB_NAME = "meetflow-offline-recordings";
const STORE_NAME = "pending-recording-uploads";
const DB_VERSION = 1;

function isClient(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const db = await openDb();

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);

    Promise.resolve(run(store))
      .then((value) => {
        transaction.oncomplete = () => {
          db.close();
          resolve(value);
        };
      })
      .catch((error) => {
        db.close();
        reject(error);
      });

    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error("IndexedDB transaction failed."));
    };
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
}

export function isOfflineRecordingSyncSupported(): boolean {
  return isClient();
}

export async function queueRecordingUpload(params: {
  roomId: string;
  blob: Blob;
  mimeType: string;
  fileName: string;
}): Promise<string> {
  if (!isClient()) {
    throw new Error("Offline recording sync is not supported in this browser.");
  }

  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const record: PendingRecordingUpload = {
    id,
    roomId: params.roomId,
    blob: params.blob,
    mimeType: params.mimeType,
    fileName: params.fileName,
    createdAt: Date.now(),
    retryCount: 0,
  };

  await withStore("readwrite", async (store) => {
    await requestToPromise(store.put(record));
  });

  return id;
}

export async function getPendingRecordingUploadCount(): Promise<number> {
  if (!isClient()) {
    return 0;
  }

  return withStore("readonly", async (store) => requestToPromise(store.count()));
}

async function listPendingRecordingUploads(): Promise<PendingRecordingUpload[]> {
  if (!isClient()) {
    return [];
  }

  return withStore("readonly", async (store) => {
    const items = await requestToPromise(store.getAll()) as PendingRecordingUpload[];
    return items.sort((left, right) => left.createdAt - right.createdAt);
  });
}

async function deletePendingRecordingUpload(id: string): Promise<void> {
  await withStore("readwrite", async (store) => {
    await requestToPromise(store.delete(id));
  });
}

async function bumpRetryCount(record: PendingRecordingUpload): Promise<void> {
  await withStore("readwrite", async (store) => {
    await requestToPromise(
      store.put({
        ...record,
        retryCount: record.retryCount + 1,
      }),
    );
  });
}

export async function flushPendingRecordingUploads(options?: {
  onUploaded?: (result: FlushResult) => void;
}): Promise<FlushResult[]> {
  if (!isClient() || !navigator.onLine) {
    return [];
  }

  const pending = await listPendingRecordingUploads();
  const flushed: FlushResult[] = [];

  for (const record of pending) {
    const form = new FormData();
    form.append("file", new File([record.blob], record.fileName, { type: record.mimeType }));

    try {
      const response = await fetch(`/api/meetings/${encodeURIComponent(record.roomId)}/recording`, {
        method: "POST",
        body: form,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        filePath?: string;
      };

      if (!response.ok || !payload.filePath) {
        await bumpRetryCount(record);
        continue;
      }

      await deletePendingRecordingUpload(record.id);

      const result = {
        roomId: record.roomId,
        filePath: payload.filePath,
      };
      flushed.push(result);
      options?.onUploaded?.(result);
    } catch {
      await bumpRetryCount(record);
    }
  }

  return flushed;
}