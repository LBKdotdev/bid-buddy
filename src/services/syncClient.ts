/**
 * Sync Client — Room-based real-time sync via Supabase.
 *
 * Rooms are 6-digit codes. Join a room, get live updates
 * when anyone in the room changes item status/notes/maxBid.
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

const SYNC_KEY = 'bid-buddy-sync';

export interface SyncState {
  roomCode: string | null;
  nickname: string;
  connected: boolean;
  users: string[]; // who's in the room (via presence)
}

export interface ItemOverlay {
  item_number: string;
  status: string;
  max_bid: number | null;
  note: string;
  buddy_tag: string | null;
  updated_by: string;
  updated_at: string;
}

type OverlayChangeCallback = (overlay: ItemOverlay) => void;
type ActivityCallback = (entry: { item_number: string; field: string; old_value: string; new_value: string; user_name: string }) => void;
type PresenceCallback = (users: string[]) => void;
type StatusCallback = (connected: boolean) => void;

// Persisted state
function loadSyncState(): { roomCode: string | null; nickname: string } {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { roomCode: null, nickname: '' };
}

function saveSyncState(roomCode: string | null, nickname: string) {
  localStorage.setItem(SYNC_KEY, JSON.stringify({ roomCode, nickname }));
}

// --- Singleton sync manager ---

let channel: RealtimeChannel | null = null;
let currentRoom: string | null = null;
let currentNickname: string = '';
let onOverlayChange: OverlayChangeCallback | null = null;
let onActivity: ActivityCallback | null = null;
let onPresence: PresenceCallback | null = null;
let onStatus: StatusCallback | null = null;

function generateRoomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Create a new room. Returns the 6-digit code. */
export async function createRoom(nickname: string): Promise<string> {
  if (!supabase) throw new Error('Supabase not configured');

  const code = generateRoomCode();
  const { error } = await supabase.from('rooms').insert({
    room_code: code,
    created_by: nickname || 'anonymous',
  });

  if (error) throw new Error(`Failed to create room: ${error.message}`);

  await joinRoom(code, nickname);
  return code;
}

/** Join an existing room by code. */
export async function joinRoom(code: string, nickname: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');

  // Verify room exists and isn't expired
  const { data: room, error } = await supabase
    .from('rooms')
    .select('room_code, expires_at')
    .eq('room_code', code)
    .single();

  if (error || !room) throw new Error('Room not found');
  if (new Date(room.expires_at) < new Date()) throw new Error('Room expired');

  // Clean up previous subscription
  if (channel) {
    await leaveRoom();
  }

  currentRoom = code;
  currentNickname = nickname || 'anonymous';
  saveSyncState(code, currentNickname);

  // Subscribe to real-time changes on item_overlays for this room
  channel = supabase
    .channel(`room:${code}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'item_overlays',
        filter: `room_code=eq.${code}`,
      },
      (payload) => {
        const row = (payload.new || payload.old) as any;
        if (row && onOverlayChange) {
          onOverlayChange({
            item_number: row.item_number,
            status: row.status,
            max_bid: row.max_bid,
            note: row.note,
            buddy_tag: row.buddy_tag,
            updated_by: row.updated_by,
            updated_at: row.updated_at,
          });
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'activity',
        filter: `room_code=eq.${code}`,
      },
      (payload) => {
        const row = payload.new as any;
        if (row && onActivity) {
          onActivity({
            item_number: row.item_number,
            field: row.field,
            old_value: row.old_value,
            new_value: row.new_value,
            user_name: row.user_name,
          });
        }
      }
    )
    .on('presence', { event: 'sync' }, () => {
      if (!channel) return;
      const state = channel.presenceState();
      const users = Object.values(state)
        .flat()
        .map((p: any) => p.nickname)
        .filter(Boolean);
      const unique = [...new Set(users)];
      if (onPresence) onPresence(unique);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Track presence
        await channel?.track({ nickname: currentNickname });
        if (onStatus) onStatus(true);
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        if (onStatus) onStatus(false);
      }
    });
}

/** Leave the current room. */
export async function leaveRoom(): Promise<void> {
  if (channel) {
    await channel.unsubscribe();
    channel = null;
  }
  currentRoom = null;
  saveSyncState(null, currentNickname);
  if (onStatus) onStatus(false);
  if (onPresence) onPresence([]);
}

/** Push an item overlay change to Supabase. */
export async function pushOverlay(
  itemNumber: string,
  fields: { status?: string; max_bid?: number | null; note?: string; buddy_tag?: string | null },
  oldValues?: { status?: string; max_bid?: number | null; note?: string }
): Promise<void> {
  if (!supabase || !currentRoom) return;

  const { error } = await supabase.from('item_overlays').upsert(
    {
      room_code: currentRoom,
      item_number: itemNumber,
      ...fields,
      updated_by: currentNickname,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'room_code,item_number' }
  );

  if (error) {
    console.error('Push overlay failed:', error.message);
    // Queue for offline retry
    queueOfflineEdit(itemNumber, fields, oldValues);
    return;
  }

  // Log activity for each changed field
  const activityEntries: any[] = [];
  if (fields.status !== undefined && fields.status !== oldValues?.status) {
    activityEntries.push({ room_code: currentRoom, item_number: itemNumber, field: 'status', old_value: oldValues?.status || '', new_value: fields.status, user_name: currentNickname });
  }
  if (fields.max_bid !== undefined && fields.max_bid !== oldValues?.max_bid) {
    activityEntries.push({ room_code: currentRoom, item_number: itemNumber, field: 'max_bid', old_value: String(oldValues?.max_bid || ''), new_value: String(fields.max_bid || ''), user_name: currentNickname });
  }
  if (fields.note !== undefined && fields.note !== oldValues?.note) {
    activityEntries.push({ room_code: currentRoom, item_number: itemNumber, field: 'note', old_value: oldValues?.note || '', new_value: fields.note, user_name: currentNickname });
  }

  if (activityEntries.length > 0) {
    await supabase.from('activity').insert(activityEntries);
  }
}

/** Pull all overlays for the current room (full sync on connect). */
export async function pullAllOverlays(): Promise<ItemOverlay[]> {
  if (!supabase || !currentRoom) return [];

  const { data, error } = await supabase
    .from('item_overlays')
    .select('item_number, status, max_bid, note, buddy_tag, updated_by, updated_at')
    .eq('room_code', currentRoom);

  if (error) {
    console.error('Pull overlays failed:', error.message);
    return [];
  }

  return (data || []) as ItemOverlay[];
}

/** Get recent activity for the room. */
export async function getRecentActivity(limit: number = 20): Promise<any[]> {
  if (!supabase || !currentRoom) return [];

  const { data } = await supabase
    .from('activity')
    .select('item_number, field, old_value, new_value, user_name, created_at')
    .eq('room_code', currentRoom)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data || [];
}

// --- Offline queue ---

const OFFLINE_QUEUE_KEY = 'bid-buddy-offline-queue';

interface QueuedEdit {
  itemNumber: string;
  fields: any;
  oldValues?: any;
  timestamp: number;
}

function queueOfflineEdit(itemNumber: string, fields: any, oldValues?: any) {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue: QueuedEdit[] = raw ? JSON.parse(raw) : [];
    queue.push({ itemNumber, fields, oldValues, timestamp: Date.now() });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    console.log('Queued offline edit for:', itemNumber);
  } catch { /* ignore */ }
}

/** Flush offline queue — call when back online. */
export async function flushOfflineQueue(): Promise<number> {
  if (!supabase || !currentRoom) return 0;

  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return 0;
    const queue: QueuedEdit[] = JSON.parse(raw);
    if (queue.length === 0) return 0;

    let flushed = 0;
    for (const edit of queue) {
      await pushOverlay(edit.itemNumber, edit.fields, edit.oldValues);
      flushed++;
    }

    localStorage.removeItem(OFFLINE_QUEUE_KEY);
    console.log(`Flushed ${flushed} offline edits`);
    return flushed;
  } catch (e) {
    console.error('Flush offline queue failed:', e);
    return 0;
  }
}

// --- Event handlers ---

export function onOverlayChanged(cb: OverlayChangeCallback) { onOverlayChange = cb; }
export function onActivityReceived(cb: ActivityCallback) { onActivity = cb; }
export function onPresenceChanged(cb: PresenceCallback) { onPresence = cb; }
export function onConnectionStatus(cb: StatusCallback) { onStatus = cb; }

// --- State accessors ---

export function getCurrentRoom(): string | null { return currentRoom; }
export function getCurrentNickname(): string { return currentNickname; }
export function getSavedSync(): { roomCode: string | null; nickname: string } { return loadSyncState(); }
export function isInRoom(): boolean { return !!currentRoom && !!channel; }

/** Auto-rejoin room on app start if previously connected. */
export async function autoRejoin(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const saved = loadSyncState();
  if (!saved.roomCode || !saved.nickname) return false;

  try {
    await joinRoom(saved.roomCode, saved.nickname);
    await flushOfflineQueue();
    return true;
  } catch {
    // Room expired or gone — clear saved state
    saveSyncState(null, saved.nickname);
    return false;
  }
}
