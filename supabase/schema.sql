-- Bid Buddy — Shared State Schema
-- Run this in Supabase SQL Editor after project is restored

-- Rooms: team sessions, 6-digit code, 24-hour expiry
create table if not exists rooms (
  id uuid default gen_random_uuid() primary key,
  room_code text unique not null,
  created_by text not null default 'anonymous',
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '24 hours')
);

create index idx_rooms_code on rooms(room_code);

-- Item overlays: shared status/notes/maxBid per item per room
create table if not exists item_overlays (
  id uuid default gen_random_uuid() primary key,
  room_code text not null references rooms(room_code) on delete cascade,
  item_number text not null,
  status text default 'unreviewed',
  max_bid numeric,
  note text default '',
  buddy_tag text,
  updated_by text not null default 'anonymous',
  updated_at timestamptz default now(),
  unique(room_code, item_number)
);

create index idx_overlays_room on item_overlays(room_code);
create index idx_overlays_updated on item_overlays(updated_at);

-- Shared comps cache: one search benefits all devices
create table if not exists shared_comps (
  id uuid default gen_random_uuid() primary key,
  room_code text not null references rooms(room_code) on delete cascade,
  query_hash text not null,
  query_text text not null,
  results_json jsonb not null default '[]',
  fetched_by text not null default 'anonymous',
  fetched_at timestamptz default now(),
  unique(room_code, query_hash)
);

create index idx_comps_room_hash on shared_comps(room_code, query_hash);

-- Activity feed: who changed what
create table if not exists activity (
  id uuid default gen_random_uuid() primary key,
  room_code text not null references rooms(room_code) on delete cascade,
  item_number text,
  field text not null,
  old_value text,
  new_value text,
  user_name text not null default 'anonymous',
  created_at timestamptz default now()
);

create index idx_activity_room on activity(room_code, created_at desc);

-- Enable realtime on the tables that need live sync
alter publication supabase_realtime add table item_overlays;
alter publication supabase_realtime add table activity;

-- Auto-cleanup: delete expired rooms (run via Supabase cron or manual)
-- delete from rooms where expires_at < now();
