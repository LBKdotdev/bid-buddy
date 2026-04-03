import type { InventoryItem, Category } from '../types/inventory';
import { isInRoom, pushOverlay, type ItemOverlay } from '../services/syncClient';

const DB_NAME = 'lbk-bid-buddy';
const DB_VERSION = 1;
const STORE_NAME = 'inventory';

let db: IDBDatabase | null = null;

export async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('itemNumber', 'itemNumber', { unique: false });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
  });
}

export async function saveItem(item: InventoryItem, oldItem?: InventoryItem | null): Promise<void> {
  const database = await initDB();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(item);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  // Push overlay to Supabase if in a room and syncable fields changed
  if (isInRoom() && item.itemNumber) {
    const fields: any = {};
    let changed = false;

    if (!oldItem || item.status !== oldItem.status) { fields.status = item.status; changed = true; }
    if (!oldItem || item.maxBid !== oldItem.maxBid) { fields.max_bid = item.maxBid; changed = true; }
    if (!oldItem || item.note !== oldItem.note) { fields.note = item.note; changed = true; }
    if (!oldItem || item.buddyTag !== oldItem.buddyTag) { fields.buddy_tag = item.buddyTag; changed = true; }

    if (changed) {
      pushOverlay(item.itemNumber, fields, oldItem ? {
        status: oldItem.status,
        max_bid: oldItem.maxBid,
        note: oldItem.note,
      } : undefined).catch(e => console.error('Sync push failed:', e));
    }
  }
}

/** Apply a remote overlay to a local item. Returns true if item was updated. */
export async function applyOverlay(overlay: ItemOverlay): Promise<boolean> {
  // Find item by itemNumber
  const items = await getAllItems();
  const item = items.find(i => i.itemNumber === overlay.item_number);
  if (!item) return false;

  let changed = false;
  if (overlay.status && overlay.status !== item.status) { item.status = overlay.status as any; changed = true; }
  if (overlay.max_bid !== undefined && overlay.max_bid !== item.maxBid) { item.maxBid = overlay.max_bid; changed = true; }
  if (overlay.note !== undefined && overlay.note !== item.note) { item.note = overlay.note; changed = true; }
  if (overlay.buddy_tag !== undefined && overlay.buddy_tag !== item.buddyTag) { item.buddyTag = overlay.buddy_tag; changed = true; }

  if (changed) {
    item.updatedAt = Date.now();
    const database = await initDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  return changed;
}

export async function saveItems(items: InventoryItem[]): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    let completed = 0;
    const total = items.length;

    items.forEach(item => {
      const request = store.put(item);
      request.onsuccess = () => {
        completed++;
        if (completed === total) resolve();
      };
      request.onerror = () => reject(request.error);
    });

    if (total === 0) resolve();
  });
}

export async function getItem(id: string): Promise<InventoryItem | null> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllItems(): Promise<InventoryItem[]> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getItemsByCategory(category: Category): Promise<InventoryItem[]> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('category');
    const request = index.getAll(category);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteItem(id: string): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteAllItems(): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteItemsByCategory(category: Category): Promise<void> {
  const items = await getItemsByCategory(category);
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    let completed = 0;
    const total = items.length;

    items.forEach(item => {
      const request = store.delete(item.id);
      request.onsuccess = () => {
        completed++;
        if (completed === total) resolve();
      };
      request.onerror = () => reject(request.error);
    });

    if (total === 0) resolve();
  });
}
