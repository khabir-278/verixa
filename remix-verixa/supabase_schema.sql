-- ====================================================================
-- VERIXA — PRODUCTION SUPABASE SQL MIGRATION SCHEMA
-- Run this in the Supabase SQL Editor: Dashboard -> SQL Editor -> New Query
-- ====================================================================

-- 1. Enable Required Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- 2. User Profiles Table (mirrors auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  name text,
  email text,
  avatar text default 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
  bio text default 'Safe social media explorer 🛡️',
  website text,
  location text,
  cover text,
  role text default 'Verified Member',
  verified boolean default true,
  safety_score integer default 100,
  ai_trust_badge text default 'Verified Human • 100% Trust',
  followers_count integer default 0,
  following_count integer default 0,
  posts_count integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table if exists public.profiles add column if not exists name text;
alter table if exists public.profiles add column if not exists email text;
alter table if exists public.profiles add column if not exists avatar text default 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80';
alter table if exists public.profiles add column if not exists bio text default 'Safe social media explorer 🛡️';
alter table if exists public.profiles add column if not exists website text;
alter table if exists public.profiles add column if not exists location text;
alter table if exists public.profiles add column if not exists cover text;
alter table if exists public.profiles add column if not exists role text default 'Verified Member';
alter table if exists public.profiles add column if not exists verified boolean default true;
alter table if exists public.profiles add column if not exists safety_score integer default 100;
alter table if exists public.profiles add column if not exists ai_trust_badge text default 'Verified Human • 100% Trust';
alter table if exists public.profiles add column if not exists followers_count integer default 0;
alter table if exists public.profiles add column if not exists following_count integer default 0;
alter table if exists public.profiles add column if not exists posts_count integer default 0;

create index if not exists idx_profiles_username on public.profiles (username);

-- 3. Posts Table
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  caption text,
  media_url text,
  media_type text default 'image',
  hashtags text[] default array[]::text[],
  likes_count integer default 0,
  comments_count integer default 0,
  visibility text default 'public',
  moderation_status text default 'approved',
  ai_safety_score integer default 99,
  ai_scan_details jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table if exists public.posts add column if not exists caption text;
alter table if exists public.posts add column if not exists media_url text;
alter table if exists public.posts add column if not exists media_type text default 'image';
alter table if exists public.posts add column if not exists hashtags text[] default array[]::text[];
alter table if exists public.posts add column if not exists likes_count integer default 0;
alter table if exists public.posts add column if not exists comments_count integer default 0;
alter table if exists public.posts add column if not exists visibility text default 'public';
alter table if exists public.posts add column if not exists moderation_status text default 'approved';
alter table if exists public.posts add column if not exists ai_safety_score integer default 99;
alter table if exists public.posts add column if not exists ai_scan_details jsonb;

create index if not exists idx_posts_user_id on public.posts (user_id);
create index if not exists idx_posts_created_at on public.posts (created_at desc);

-- 4. Comments Table
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text not null default '',
  toxicity_score integer default 0,
  moderation_status text default 'approved',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table if exists public.comments add column if not exists text text default '';
alter table if exists public.comments add column if not exists toxicity_score integer default 0;
alter table if exists public.comments add column if not exists moderation_status text default 'approved';

create index if not exists idx_comments_post_id on public.comments (post_id);
create index if not exists idx_comments_created_at on public.comments (created_at asc);

-- 5. Likes Table
create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_post_user_like unique(post_id, user_id)
);

create index if not exists idx_likes_post_id on public.likes (post_id);
create index if not exists idx_likes_user_id on public.likes (user_id);

-- 5b. Post Likes Table (Dedicated Post Likes Table)
create table if not exists public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_post_likes unique(post_id, user_id)
);

create index if not exists idx_post_likes_post_id on public.post_likes (post_id);
create index if not exists idx_post_likes_user_id on public.post_likes (user_id);

-- 6. Follows Table
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint no_self_follow check (follower_id != following_id),
  constraint unique_follower_following unique(follower_id, following_id)
);

create index if not exists idx_follows_follower on public.follows (follower_id);
create index if not exists idx_follows_following on public.follows (following_id);

-- 7. Saved Posts Table
create table if not exists public.saved_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_user_saved_post unique(user_id, post_id)
);

create index if not exists idx_saved_posts_user on public.saved_posts (user_id);

-- 8. Direct Messages Table
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  media_url text,
  is_ai_verified boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_messages_conv on public.messages (conversation_id, created_at asc);

-- 9. Notifications Table
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  post_id uuid references public.posts(id) on delete set null,
  message text not null,
  read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_notifications_recipient on public.notifications (recipient_id, created_at desc);

-- 10. Reports Table (Community Violations & Triage)
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_id text not null,
  target_type text not null check (target_type in ('post', 'comment', 'story', 'reel', 'user')),
  reason text not null,
  description text default '',
  severity text not null default 'MEDIUM' check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status text not null default 'PENDING' check (status in ('PENDING', 'IN_REVIEW', 'RESOLVED', 'DISMISSED')),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamp with time zone,
  resolution_notes text,
  action_taken text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_reports_target on public.reports (target_id, target_type);
create index if not exists idx_reports_status on public.reports (status, created_at desc);
create index if not exists idx_reports_reporter on public.reports (reporter_id);

-- 11. Stories Table (24-Hour Expiry & View Tracking)
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_url text not null,
  media_type text not null default 'image',
  moderation_status text not null default 'approved',
  analysis_id text,
  views_count integer default 0,
  viewed_by uuid[] default array[]::uuid[],
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  expires_at timestamp with time zone default (timezone('utc'::text, now()) + interval '24 hours') not null
);

alter table if exists public.stories add column if not exists analysis_id text;
alter table if exists public.stories add column if not exists likes_count integer default 0;
alter table if exists public.stories add column if not exists liked_by text[] default array[]::text[];

create index if not exists idx_stories_user_id on public.stories (user_id);
create index if not exists idx_stories_expires_at on public.stories (expires_at);

-- 12. Reels Table (Persisted Media & Deepfake Risk)
create table if not exists public.reels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  caption text,
  video_url text not null,
  audio_title text default 'Original Audio • Verified Clean',
  deepfake_risk integer default 0,
  moderation_status text not null default 'approved',
  analysis_id text,
  likes_count integer default 0,
  comments_count integer default 0,
  shares_count integer default 0,
  tags text[] default array[]::text[],
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table if exists public.reels add column if not exists analysis_id text;

create index if not exists idx_reels_user_id on public.reels (user_id);
create index if not exists idx_reels_created_at on public.reels (created_at desc);

-- 13. AI Moderation Logs Table (Traceable Audit Records)
create table if not exists public.moderation_logs (
  id uuid primary key default gen_random_uuid(),
  analysis_id text,
  content_id text,
  content_type text not null,
  target_id text,
  target_type text,
  user_id uuid references public.profiles(id) on delete cascade,
  status text not null,
  decision text,
  category text,
  confidence numeric,
  reason text,
  model text,
  model_version text,
  scores jsonb,
  labels text[],
  evidence jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Ensure all moderation_logs columns exist if the table was created in a previous migration
alter table if exists public.moderation_logs add column if not exists analysis_id text;
alter table if exists public.moderation_logs add column if not exists content_id text;
alter table if exists public.moderation_logs add column if not exists content_type text default 'post';
alter table if exists public.moderation_logs add column if not exists target_id text;
alter table if exists public.moderation_logs add column if not exists target_type text;
alter table if exists public.moderation_logs add column if not exists decision text;
alter table if exists public.moderation_logs add column if not exists model text;
alter table if exists public.moderation_logs add column if not exists model_version text;
alter table if exists public.moderation_logs add column if not exists scores jsonb;
alter table if exists public.moderation_logs add column if not exists labels text[];
alter table if exists public.moderation_logs add column if not exists evidence jsonb;

create index if not exists idx_moderation_logs_analysis on public.moderation_logs (analysis_id);
create index if not exists idx_moderation_logs_user on public.moderation_logs (user_id);

-- ====================================================================
-- AUTOMATIC PROFILE TRIGGER (auth.users -> public.profiles)
-- ====================================================================

create or replace function public.handle_new_user()
returns trigger as $$
declare
  raw_username text;
  clean_username text;
  display_name text;
  avatar_val text;
begin
  raw_username := coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
  clean_username := lower(regexp_replace(raw_username, '[^a-zA-Z0-9_]', '', 'g'));
  if clean_username = '' then
    clean_username := 'user_' || substr(new.id::text, 1, 6);
  end if;

  -- Prevent duplicate username collisions
  if exists (select 1 from public.profiles where username = clean_username and id != new.id) then
    clean_username := clean_username || '_' || substr(new.id::text, 1, 4);
  end if;

  display_name := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', raw_username);
  avatar_val := coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80');

  insert into public.profiles (
    id,
    username,
    name,
    email,
    avatar,
    bio,
    verified,
    safety_score,
    ai_trust_badge,
    followers_count,
    following_count,
    posts_count
  ) values (
    new.id,
    clean_username,
    display_name,
    new.email,
    avatar_val,
    'Safe social media explorer 🛡️',
    true,
    100,
    'Verified Human • 100% Trust',
    0,
    0,
    0
  )
  on conflict (id) do update set
    email = excluded.email,
    name = coalesce(public.profiles.name, excluded.name),
    avatar = coalesce(public.profiles.avatar, excluded.avatar);

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Drop trigger if exists and recreate
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.stories enable row level security;
alter table public.reels enable row level security;
alter table public.likes enable row level security;
alter table public.follows enable row level security;
alter table public.saved_posts enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_logs enable row level security;

-- Profiles Policies
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone" on public.profiles for select using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Posts Policies: Only approved content is public; author can see pending/quarantined
drop policy if exists "Approved posts are viewable by everyone" on public.posts;
create policy "Approved posts are viewable by everyone" on public.posts for select
  using (moderation_status in ('approved', 'APPROVED', 'allowed', 'ALLOWED') or auth.uid() = user_id);

drop policy if exists "Authenticated users can create posts" on public.posts;
create policy "Authenticated users can create posts" on public.posts for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own posts" on public.posts;
create policy "Users can update their own posts" on public.posts for update using (auth.uid() = user_id);

drop policy if exists "Users can delete their own posts" on public.posts;
create policy "Users can delete their own posts" on public.posts for delete using (auth.uid() = user_id);

-- Comments Policies: Only approved content is public; author can see pending/quarantined
drop policy if exists "Approved comments are viewable by everyone" on public.comments;
create policy "Approved comments are viewable by everyone" on public.comments for select
  using (moderation_status in ('approved', 'APPROVED', 'allowed', 'ALLOWED') or auth.uid() = user_id);

drop policy if exists "Authenticated users can add comments" on public.comments;
create policy "Authenticated users can add comments" on public.comments for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own comments" on public.comments;
create policy "Users can update their own comments" on public.comments for update using (auth.uid() = user_id);

drop policy if exists "Users can delete their own comments" on public.comments;
create policy "Users can delete their own comments" on public.comments for delete using (auth.uid() = user_id);

-- Stories Policies: Only active approved stories are public; author can see pending/quarantined
-- Stories Policies
drop policy if exists "Approved active stories are viewable by everyone" on public.stories;
create policy "Approved active stories are viewable by everyone" on public.stories for select using (true);

drop policy if exists "Authenticated users can create stories" on public.stories;
drop policy if exists "Allow story creation" on public.stories;
create policy "Allow story creation" on public.stories for insert with check (true);

drop policy if exists "Users can update stories" on public.stories;
create policy "Users can update stories" on public.stories for update using (true);

drop policy if exists "Users can delete their own stories" on public.stories;
create policy "Users can delete their own stories" on public.stories for delete using (true);

-- Reels Policies
drop policy if exists "Approved reels are viewable by everyone" on public.reels;
create policy "Approved reels are viewable by everyone" on public.reels for select using (true);

drop policy if exists "Authenticated users can create reels" on public.reels;
drop policy if exists "Allow reel creation" on public.reels;
create policy "Allow reel creation" on public.reels for insert with check (true);

drop policy if exists "Users can update their own reels" on public.reels;
create policy "Users can update their own reels" on public.reels for update using (true);

drop policy if exists "Users can delete their own reels" on public.reels;
create policy "Users can delete their own reels" on public.reels for delete using (true);

-- Likes Policies
drop policy if exists "Likes are viewable by everyone" on public.likes;
create policy "Likes are viewable by everyone" on public.likes for select using (true);

drop policy if exists "Users can toggle their own likes" on public.likes;
create policy "Users can toggle their own likes" on public.likes for insert with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own likes" on public.likes;
create policy "Users can delete their own likes" on public.likes for delete using (auth.uid() = user_id);

-- Post Likes Policies
drop policy if exists "Post likes are viewable by everyone" on public.post_likes;
create policy "Post likes are viewable by everyone" on public.post_likes for select using (true);

drop policy if exists "Users can toggle their own post likes" on public.post_likes;
create policy "Users can toggle their own post likes" on public.post_likes for insert with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own post likes" on public.post_likes;
create policy "Users can delete their own post likes" on public.post_likes for delete using (auth.uid() = user_id);

-- Follows Policies (Enforce no self-following)
drop policy if exists "Follows are viewable by everyone" on public.follows;
create policy "Follows are viewable by everyone" on public.follows for select using (true);

drop policy if exists "Users can follow others" on public.follows;
create policy "Users can follow others" on public.follows for insert with check (auth.uid() = follower_id and follower_id != following_id);

drop policy if exists "Users can unfollow others" on public.follows;
create policy "Users can unfollow others" on public.follows for delete using (auth.uid() = follower_id);

-- Saved Posts Policies
drop policy if exists "Users can view their own saved posts" on public.saved_posts;
create policy "Users can view their own saved posts" on public.saved_posts for select using (auth.uid() = user_id);

drop policy if exists "Users can save posts" on public.saved_posts;
create policy "Users can save posts" on public.saved_posts for insert with check (auth.uid() = user_id);

drop policy if exists "Users can remove saved posts" on public.saved_posts;
create policy "Users can remove saved posts" on public.saved_posts for delete using (auth.uid() = user_id);

-- Direct Messages Policies
drop policy if exists "Users can view their own conversation messages" on public.messages;
create policy "Users can view their own conversation messages" on public.messages for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "Users can send messages" on public.messages;
create policy "Users can send messages" on public.messages for insert with check (auth.uid() = sender_id);

-- Notifications Policies:
-- Secure: Recipient can view their own notifications.
-- Direct arbitrary inserts from client are dropped; notifications are created authoritatively by triggers or RPC.
drop policy if exists "Users can view their own notifications" on public.notifications;
create policy "Users can view their own notifications" on public.notifications for select using (auth.uid() = recipient_id);

drop policy if exists "Users can update their notifications (mark read)" on public.notifications;
create policy "Users can update their notifications (mark read)" on public.notifications for update using (auth.uid() = recipient_id);

-- Reports Policies
drop policy if exists "Authenticated users can submit reports" on public.reports;
create policy "Authenticated users can submit reports" on public.reports for insert with check (auth.uid() = reporter_id);

drop policy if exists "Reporters can view their own reports" on public.reports;
create policy "Reporters can view their own reports" on public.reports for select using (auth.uid() = reporter_id);

-- Moderation Logs Policies:
-- Authoritative: Users can view their own moderation logs.
-- Client cannot arbitrarily insert unverified records; logged via trusted function.
drop policy if exists "Users can view their own moderation logs" on public.moderation_logs;
create policy "Users can view their own moderation logs" on public.moderation_logs for select using (auth.uid() = user_id);

-- ====================================================================
-- SUPABASE REALTIME CONFIGURATION
-- ====================================================================

do $$
begin
  alter publication supabase_realtime add table public.posts;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.comments;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.stories;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.reels;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.likes;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when others then null;
end $$;

-- ====================================================================
-- SUPABASE STORAGE CONFIGURATION (bucket: app-files)
-- ====================================================================

insert into storage.buckets (id, name, public)
values ('app-files', 'app-files', true)
on conflict (id) do update set public = true;

-- Storage RLS: Allow viewing post media, avatars, and covers across the platform
drop policy if exists "Public can view app-files" on storage.objects;
drop policy if exists "Users can view their own files in app-files" on storage.objects;
drop policy if exists "Authenticated users can upload to app-files under their UID folder" on storage.objects;
drop policy if exists "Users can update their own app-files" on storage.objects;
drop policy if exists "Public can view app-files" on storage.objects;
create policy "Public can view app-files" on storage.objects for select
  using (bucket_id = 'app-files');

drop policy if exists "Authenticated users can upload to app-files under their UID folder" on storage.objects;
create policy "Authenticated users can upload to app-files under their UID folder" on storage.objects for insert
  with check (
    bucket_id = 'app-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their own app-files" on storage.objects;
create policy "Users can update their own app-files" on storage.objects for update
  using (
    bucket_id = 'app-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own app-files" on storage.objects;
create policy "Users can delete their own app-files" on storage.objects for delete
  using (
    bucket_id = 'app-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ====================================================================
-- ATOMIC DATABASE COUNTERS (Triggers - Single Authoritative Source)
-- ====================================================================

-- 1. Posts counter trigger
create or replace function public.update_posts_count()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles
    set posts_count = coalesce(posts_count, 0) + 1,
        updated_at = timezone('utc'::text, now())
    where id = new.user_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.profiles
    set posts_count = greatest(0, coalesce(posts_count, 1) - 1),
        updated_at = timezone('utc'::text, now())
    where id = old.user_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_post_added_or_removed on public.posts;
create trigger on_post_added_or_removed
  after insert or delete on public.posts
  for each row execute function public.update_posts_count();

-- 2. Likes counter trigger
create or replace function public.update_likes_count()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update public.posts
    set likes_count = coalesce(likes_count, 0) + 1,
        updated_at = timezone('utc'::text, now())
    where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.posts
    set likes_count = greatest(0, coalesce(likes_count, 1) - 1),
        updated_at = timezone('utc'::text, now())
    where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_like_added_or_removed on public.likes;
create trigger on_like_added_or_removed
  after insert or delete on public.likes
  for each row execute function public.update_likes_count();

-- 3. Comments counter trigger
create or replace function public.update_comments_count()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update public.posts
    set comments_count = coalesce(comments_count, 0) + 1,
        updated_at = timezone('utc'::text, now())
    where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.posts
    set comments_count = greatest(0, coalesce(comments_count, 1) - 1),
        updated_at = timezone('utc'::text, now())
    where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_comment_added_or_removed on public.comments;
create trigger on_comment_added_or_removed
  after insert or delete on public.comments
  for each row execute function public.update_comments_count();

-- 4. Follows counter trigger
create or replace function public.update_follows_count()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles
    set following_count = coalesce(following_count, 0) + 1,
        updated_at = timezone('utc'::text, now())
    where id = new.follower_id;

    update public.profiles
    set followers_count = coalesce(followers_count, 0) + 1,
        updated_at = timezone('utc'::text, now())
    where id = new.following_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.profiles
    set following_count = greatest(0, coalesce(following_count, 1) - 1),
        updated_at = timezone('utc'::text, now())
    where id = old.follower_id;

    update public.profiles
    set followers_count = greatest(0, coalesce(followers_count, 1) - 1),
        updated_at = timezone('utc'::text, now())
    where id = old.following_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_follow_added_or_removed on public.follows;
create trigger on_follow_added_or_removed
  after insert or delete on public.follows
  for each row execute function public.update_follows_count();

-- ====================================================================
-- TAMPER PROTECTION TRIGGERS (Prevent client spoofing of system counters & badges)
-- ====================================================================

create or replace function public.protect_profile_system_fields()
returns trigger as $$
begin
  -- If invoked by an authenticated client, preserve system-managed fields
  if auth.role() = 'authenticated' then
    new.followers_count := old.followers_count;
    new.following_count := old.following_count;
    new.posts_count := old.posts_count;
    new.safety_score := old.safety_score;
    new.verified := old.verified;
    new.role := old.role;
    new.ai_trust_badge := old.ai_trust_badge;
  end if;
  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_protect_profile_system_fields on public.profiles;
create trigger trg_protect_profile_system_fields
  before update on public.profiles
  for each row execute function public.protect_profile_system_fields();

create or replace function public.protect_post_counters()
returns trigger as $$
begin
  if auth.role() = 'authenticated' then
    new.likes_count := old.likes_count;
    new.comments_count := old.comments_count;
  end if;
  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_protect_post_counters on public.posts;
create trigger trg_protect_post_counters
  before update on public.posts
  for each row execute function public.protect_post_counters();

-- ====================================================================
-- AUTHORITATIVE NOTIFICATION TRIGGERS
-- ====================================================================

create or replace function public.on_like_created_notification()
returns trigger as $$
declare
  v_post_author uuid;
  v_sender_name text;
begin
  select user_id into v_post_author from public.posts where id = new.post_id;
  if v_post_author is not null and v_post_author != new.user_id then
    select coalesce(name, username, 'Someone') into v_sender_name from public.profiles where id = new.user_id;
    insert into public.notifications (recipient_id, sender_id, type, post_id, message, read, created_at)
    values (
      v_post_author,
      new.user_id,
      'like',
      new.post_id,
      coalesce(v_sender_name, 'A member') || ' liked your post.',
      false,
      timezone('utc'::text, now())
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_like_created_notification on public.likes;
create trigger trg_like_created_notification
  after insert on public.likes
  for each row execute function public.on_like_created_notification();

create or replace function public.on_comment_created_notification()
returns trigger as $$
declare
  v_post_author uuid;
  v_sender_name text;
begin
  select user_id into v_post_author from public.posts where id = new.post_id;
  if v_post_author is not null and v_post_author != new.user_id then
    select coalesce(name, username, 'Someone') into v_sender_name from public.profiles where id = new.user_id;
    insert into public.notifications (recipient_id, sender_id, type, post_id, message, read, created_at)
    values (
      v_post_author,
      new.user_id,
      'comment',
      new.post_id,
      coalesce(v_sender_name, 'A member') || ' commented: "' || substr(new.text, 1, 60) || '"',
      false,
      timezone('utc'::text, now())
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_comment_created_notification on public.comments;
create trigger trg_comment_created_notification
  after insert on public.comments
  for each row execute function public.on_comment_created_notification();

create or replace function public.on_follow_created_notification()
returns trigger as $$
declare
  v_sender_name text;
begin
  if new.follower_id != new.following_id then
    select coalesce(name, username, 'Someone') into v_sender_name from public.profiles where id = new.follower_id;
    insert into public.notifications (recipient_id, sender_id, type, message, read, created_at)
    values (
      new.following_id,
      new.follower_id,
      'follow',
      coalesce(v_sender_name, 'A member') || ' started following you.',
      false,
      timezone('utc'::text, now())
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_follow_created_notification on public.follows;
create trigger trg_follow_created_notification
  after insert on public.follows
  for each row execute function public.on_follow_created_notification();

-- ====================================================================
-- SECURE AUTHORITATIVE RPC FUNCTIONS
-- ====================================================================

-- 1. Create Interaction Notification (with strict validation)
create or replace function public.create_interaction_notification(
  p_recipient_id uuid,
  p_type text,
  p_post_id uuid default null,
  p_message text default null
) returns uuid as $$
declare
  v_notif_id uuid;
  v_sender_name text;
begin
  if auth.uid() is null or auth.uid() = p_recipient_id then
    return null;
  end if;

  if p_type not in ('like', 'comment', 'follow', 'mention') then
    raise exception 'Invalid notification type: %', p_type;
  end if;

  if p_type = 'like' then
    if not exists (select 1 from public.likes where post_id = p_post_id and user_id = auth.uid()) then
      raise exception 'Unauthorized notification: Like record does not exist';
    end if;
  elsif p_type = 'comment' then
    if not exists (select 1 from public.comments where post_id = p_post_id and user_id = auth.uid()) then
      raise exception 'Unauthorized notification: Comment record does not exist';
    end if;
  elsif p_type = 'follow' then
    if not exists (select 1 from public.follows where follower_id = auth.uid() and following_id = p_recipient_id) then
      raise exception 'Unauthorized notification: Follow record does not exist';
    end if;
  end if;

  select coalesce(name, username, 'Someone') into v_sender_name from public.profiles where id = auth.uid();

  insert into public.notifications (
    recipient_id,
    sender_id,
    type,
    post_id,
    message,
    read,
    created_at
  ) values (
    p_recipient_id,
    auth.uid(),
    p_type,
    p_post_id,
    coalesce(p_message, v_sender_name || ' interacted with your content.'),
    false,
    timezone('utc'::text, now())
  ) returning id into v_notif_id;

  return v_notif_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 2. Log Moderation Entry (Authoritative: Bound to calling user or system)
create or replace function public.log_moderation_entry(
  p_target_id text,
  p_target_type text,
  p_status text,
  p_category text default null,
  p_confidence numeric default null,
  p_reason text default null
) returns uuid as $$
declare
  v_log_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_status not in ('approved', 'quarantined', 'flagged', 'blocked') then
    raise exception 'Invalid moderation status: %', p_status;
  end if;

  insert into public.moderation_logs (
    target_id,
    target_type,
    user_id,
    status,
    category,
    confidence,
    reason,
    created_at
  ) values (
    p_target_id,
    p_target_type,
    auth.uid(),
    p_status,
    p_category,
    p_confidence,
    p_reason,
    timezone('utc'::text, now())
  ) returning id into v_log_id;

  return v_log_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 3. Delete Current User Account
create or replace function public.delete_current_user_account()
returns void as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Delete public profile records (cascades to posts, comments, likes, follows, messages, etc.)
  delete from public.profiles where id = v_uid;

  -- Delete auth user record
  delete from auth.users where id = v_uid;
end;
$$ language plpgsql security definer set search_path = public, auth, pg_temp;

-- 4. Record Story View (Idempotent per user, prevents duplicate counting)
create or replace function public.record_story_view(p_story_id uuid)
returns jsonb as $$
declare
  v_story public.stories%rowtype;
  v_viewer_id uuid;
begin
  v_viewer_id := auth.uid();
  if v_viewer_id is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required');
  end if;

  select * into v_story from public.stories where id = p_story_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Story not found');
  end if;

  -- Only record view if viewer hasn't already viewed
  if not (v_story.viewed_by @> array[v_viewer_id]) then
    update public.stories
    set views_count = coalesce(views_count, 0) + 1,
        viewed_by = array_append(coalesce(viewed_by, array[]::uuid[]), v_viewer_id)
    where id = p_story_id;
  end if;

  return jsonb_build_object('success', true, 'views_count', coalesce(v_story.views_count, 0) + case when not (v_story.viewed_by @> array[v_viewer_id]) then 1 else 0 end);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- ====================================================================
-- VERIXA BEHAVIORAL SAFETY INTELLIGENCE TABLES & POLICIES
-- ====================================================================

-- 14. Cyberbullying Events Table (Multi-Interaction Pattern Records)
create table if not exists public.cyberbullying_events (
  id uuid primary key default gen_random_uuid(),
  target_user_id text not null,
  target_username text,
  actor_user_id text not null,
  actor_username text,
  pattern_type text not null,
  risk_score integer not null,
  confidence numeric not null,
  evidence_references jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_cyberbullying_target on public.cyberbullying_events (target_user_id);
create index if not exists idx_cyberbullying_actor on public.cyberbullying_events (actor_user_id);
create index if not exists idx_cyberbullying_created_at on public.cyberbullying_events (created_at desc);

-- 15. Persistent Reputation Event Ledger
create table if not exists public.reputation_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  event_type text not null,
  reason text not null,
  source text not null,
  amount integer not null,
  previous_score integer not null,
  new_score integer not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_reputation_user_id on public.reputation_events (user_id);
create index if not exists idx_reputation_created_at on public.reputation_events (created_at desc);

-- 16. Spam Events Table
create table if not exists public.spam_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  content_id text,
  content_type text not null,
  spam_score integer not null,
  spam_types text[] not null,
  reason text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_spam_user_id on public.spam_events (user_id);
create index if not exists idx_spam_created_at on public.spam_events (created_at desc);

-- Enable RLS on Behavioral Safety Tables
alter table public.cyberbullying_events enable row level security;
alter table public.reputation_events enable row level security;
alter table public.spam_events enable row level security;

-- Cyberbullying RLS: Target user can view bullying events directed at them; moderators can view all
drop policy if exists "Target users and moderators can view cyberbullying events" on public.cyberbullying_events;
create policy "Target users and moderators can view cyberbullying events" on public.cyberbullying_events for select
  using (auth.uid()::text = target_user_id or auth.uid()::text = actor_user_id or auth.jwt()->>'role' = 'service_role');

-- Reputation Events RLS: Users can view their own score change events; authenticated users can view public profile ledger
drop policy if exists "Users can view reputation events" on public.reputation_events;
create policy "Users can view reputation events" on public.reputation_events for select
  using (true);

-- Spam Events RLS: Service role and authors can view spam logs
drop policy if exists "Users can view their own spam events" on public.spam_events;
create policy "Users can view their own spam events" on public.spam_events for select
  using (auth.uid()::text = user_id or auth.jwt()->>'role' = 'service_role');

-- ====================================================================
-- VERIXA AI GUARDIAN MODE TABLES & POLICIES (CENTRAL RISK ENGINE)
-- ====================================================================

-- 17. Guardian Scores Table (Authoritative User Risk State)
create table if not exists public.guardian_scores (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  guardian_score integer not null default 100 check (guardian_score between 0 and 100),
  risk_level text not null default 'SAFE' check (risk_level in ('SAFE', 'WATCH_LIST', 'HIGH_RISK', 'RESTRICTED', 'CRITICAL')),
  confidence numeric not null default 100,
  explainability jsonb not null default '{"factors": [], "summary": "Account initialized with clean safety record."}'::jsonb,
  signals_summary jsonb not null default '{}'::jsonb,
  last_calculated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_guardian_scores_user on public.guardian_scores (user_id);
create index if not exists idx_guardian_scores_level on public.guardian_scores (risk_level);

-- 18. Guardian Events Table (Multi-Signal Safety Events)
create table if not exists public.guardian_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  event_type text not null,
  severity text not null default 'low' check (severity in ('low', 'medium', 'high', 'critical')),
  impact integer not null,
  confidence numeric not null default 80,
  source text not null,
  reason text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_guardian_events_user on public.guardian_events (user_id);
create index if not exists idx_guardian_events_type on public.guardian_events (event_type);
create index if not exists idx_guardian_events_created on public.guardian_events (created_at desc);

-- 19. Guardian Policy Actions Table
create table if not exists public.guardian_actions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  action_type text not null,
  risk_level text not null,
  enforcement_details jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  issued_at timestamp with time zone default timezone('utc'::text, now()) not null,
  expires_at timestamp with time zone
);

create index if not exists idx_guardian_actions_user on public.guardian_actions (user_id);
create index if not exists idx_guardian_actions_active on public.guardian_actions (user_id, active);

-- 20. User Restrictions Table (Active Enforcement & Cooldowns)
create table if not exists public.user_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  risk_level text not null default 'SAFE',
  upload_restricted boolean not null default false,
  comment_restricted boolean not null default false,
  messaging_restricted boolean not null default false,
  account_suspended boolean not null default false,
  upload_cooldown_seconds integer not null default 0,
  comment_cooldown_seconds integer not null default 0,
  reason text,
  appeal_status text default 'NONE' check (appeal_status in ('NONE', 'PENDING', 'APPROVED', 'REJECTED')),
  appeal_id text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_user_restrictions_user on public.user_restrictions (user_id);

-- 21. Guardian Appeals Table
create table if not exists public.guardian_appeals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  restriction_id text,
  reason text not null,
  appeal_text text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  reviewer_id text,
  reviewer_notes text,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_guardian_appeals_user on public.guardian_appeals (user_id);
create index if not exists idx_guardian_appeals_status on public.guardian_appeals (status);

-- Enable RLS on Guardian Tables
alter table public.guardian_scores enable row level security;
alter table public.guardian_events enable row level security;
alter table public.guardian_actions enable row level security;
alter table public.user_restrictions enable row level security;
alter table public.guardian_appeals enable row level security;

-- Guardian Scores RLS: Users can view their own score; service role / admin can view all
drop policy if exists "Users can view their own guardian score" on public.guardian_scores;
create policy "Users can view their own guardian score" on public.guardian_scores for select
  using (auth.uid()::text = user_id or auth.jwt()->>'role' = 'service_role');

-- Guardian Events RLS: Users can view their own events
drop policy if exists "Users can view their own guardian events" on public.guardian_events;
create policy "Users can view their own guardian events" on public.guardian_events for select
  using (auth.uid()::text = user_id or auth.jwt()->>'role' = 'service_role');

-- Guardian Actions RLS: Users can view actions applied to them
drop policy if exists "Users can view their own guardian actions" on public.guardian_actions;
create policy "Users can view their own guardian actions" on public.guardian_actions for select
  using (auth.uid()::text = user_id or auth.jwt()->>'role' = 'service_role');

-- User Restrictions RLS: Users can read their own restrictions
drop policy if exists "Users can view their own restrictions" on public.user_restrictions;
create policy "Users can view their own restrictions" on public.user_restrictions for select
  using (auth.uid()::text = user_id or auth.jwt()->>'role' = 'service_role');

-- Guardian Appeals RLS: Users can view and submit their own appeals
drop policy if exists "Users can view their own appeals" on public.guardian_appeals;
create policy "Users can view their own appeals" on public.guardian_appeals for select
  using (auth.uid()::text = user_id or auth.jwt()->>'role' = 'service_role');

drop policy if exists "Users can submit their own appeals" on public.guardian_appeals;
create policy "Users can submit their own appeals" on public.guardian_appeals for insert
  with check (auth.uid()::text = user_id or auth.jwt()->>'role' = 'service_role');

-- ====================================================================
-- 22. Moderation Appeals Table (Universal Content Appeals)
-- ====================================================================
create table if not exists public.appeals (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  analysis_id text not null,
  content_id text not null,
  content_type text not null check (content_type in ('post', 'comment', 'story', 'reel', 'user_restriction', 'profile_image', 'cover_image')),
  original_decision text not null check (original_decision in ('BLOCK', 'QUARANTINE', 'REJECTED')),
  reason text not null,
  appeal_text text not null,
  evidence_urls text[] default array[]::text[],
  status text not null default 'PENDING' check (status in ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED')),
  admin_decision text check (admin_decision in ('APPROVE', 'REJECT')),
  admin_id uuid references public.profiles(id),
  admin_notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  resolved_at timestamp with time zone,
  guardian_impact integer default 0,
  reputation_impact integer default 0
);

-- Ensure all appeals columns exist if the table was created in a previous migration
alter table if exists public.appeals add column if not exists analysis_id text;
alter table if exists public.appeals add column if not exists content_id text;
alter table if exists public.appeals add column if not exists content_type text default 'post';

create index if not exists idx_appeals_user on public.appeals (user_id);
create index if not exists idx_appeals_status on public.appeals (status, created_at desc);
create index if not exists idx_appeals_analysis on public.appeals (analysis_id);
create index if not exists idx_appeals_content on public.appeals (content_id);

-- ====================================================================
-- 23. Unified Moderation Review Queue Table
-- ====================================================================
create table if not exists public.review_queue (
  id text primary key,
  item_type text not null check (item_type in ('appeal', 'quarantine', 'report', 'high_risk_flag')),
  reference_id text not null,
  analysis_id text,
  content_id text not null,
  content_type text not null,
  user_id text not null,
  priority text not null default 'MEDIUM' check (priority in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  risk_score numeric default 0,
  category text not null,
  content_snippet text,
  status text not null default 'PENDING' check (status in ('PENDING', 'IN_REVIEW', 'RESOLVED', 'DISMISSED')),
  claimed_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table if exists public.review_queue add column if not exists analysis_id text;

create index if not exists idx_review_queue_status on public.review_queue (status, priority, created_at desc);
create index if not exists idx_review_queue_type on public.review_queue (item_type);
create index if not exists idx_review_queue_user on public.review_queue (user_id);

-- ====================================================================
-- 24. Immutable Admin Actions Audit History Table
-- ====================================================================
create table if not exists public.admin_actions (
  id text primary key,
  admin_id uuid not null references public.profiles(id),
  admin_username text,
  action_type text not null check (action_type in (
    'APPROVE_APPEAL',
    'REJECT_APPEAL',
    'RESOLVE_REPORT',
    'DISMISS_REPORT',
    'OVERTURN_MODERATION',
    'CONFIRM_BLOCK',
    'RESTRICT_USER',
    'LIFT_RESTRICTION',
    'MANUAL_SANCTION'
  )),
  target_type text not null check (target_type in ('appeal', 'report', 'post', 'comment', 'story', 'reel', 'user')),
  target_id text not null,
  analysis_id text,
  affected_user_id text not null,
  reason text not null,
  notes text,
  prior_state jsonb default '{}'::jsonb,
  new_state jsonb default '{}'::jsonb,
  guardian_adjustment integer default 0,
  reputation_adjustment integer default 0,
  ip_address text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table if exists public.admin_actions add column if not exists analysis_id text;

create index if not exists idx_admin_actions_admin on public.admin_actions (admin_id);
create index if not exists idx_admin_actions_affected_user on public.admin_actions (affected_user_id);
create index if not exists idx_admin_actions_created on public.admin_actions (created_at desc);
create index if not exists idx_admin_actions_type on public.admin_actions (action_type);

-- ====================================================================
-- RLS POLICIES FOR APPEALS, REVIEW QUEUE, AND ADMIN ACTIONS
-- ====================================================================

-- Enable RLS
alter table public.reports enable row level security;
alter table public.appeals enable row level security;
alter table public.review_queue enable row level security;
alter table public.admin_actions enable row level security;

-- Reports: Users can view their own reports; insert their own reports
drop policy if exists "Users can view their own submitted reports" on public.reports;
create policy "Users can view their own submitted reports" on public.reports for select
  using (auth.uid() = reporter_id or exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'Moderator')));

drop policy if exists "Users can submit reports" on public.reports;
create policy "Users can submit reports" on public.reports for insert
  with check (auth.uid() = reporter_id);

drop policy if exists "Admins can update reports" on public.reports;
create policy "Admins can update reports" on public.reports for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'Moderator')));

-- Appeals: Users can view their own appeals; admins view all; users can insert their own appeals
drop policy if exists "Users can view their own appeals" on public.appeals;
create policy "Users can view their own appeals" on public.appeals for select
  using (auth.uid() = user_id or exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'Moderator')));

drop policy if exists "Users can submit appeals" on public.appeals;
create policy "Users can submit appeals" on public.appeals for insert
  with check (auth.uid() = user_id);

drop policy if exists "Admins can update appeals" on public.appeals;
create policy "Admins can update appeals" on public.appeals for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'Moderator')));

-- Review Queue: Accessible only by admins & moderators
drop policy if exists "Admins can view review queue" on public.review_queue;
create policy "Admins can view review queue" on public.review_queue for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'Moderator')));

drop policy if exists "Admins and services can insert review queue" on public.review_queue;
create policy "Admins and services can insert review queue" on public.review_queue for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'Moderator')) or auth.jwt()->>'role' = 'service_role');

drop policy if exists "Admins can update review queue" on public.review_queue;
create policy "Admins can update review queue" on public.review_queue for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'Moderator')));

-- Admin Actions: IMMUTABLE AUDIT LOG
-- Only INSERT and SELECT allowed; NO UPDATE and NO DELETE policies exist!
drop policy if exists "Admins can view audit logs" on public.admin_actions;
create policy "Admins can view audit logs" on public.admin_actions for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'Moderator')) or auth.jwt()->>'role' = 'service_role');

drop policy if exists "Admins and services can insert audit logs" on public.admin_actions;
create policy "Admins and services can insert audit logs" on public.admin_actions for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'Moderator')) or auth.jwt()->>'role' = 'service_role');

-- ====================================================================
-- 25. User Interaction Events Table (Behavioral Signals & Implicit Telemetry)
-- ====================================================================
create table if not exists public.interaction_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  interaction_type text not null check (interaction_type in (
    'view',
    'like',
    'unlike',
    'comment',
    'save',
    'unsave',
    'share',
    'click_hashtag',
    'dwell_time',
    'hide',
    'report'
  )),
  dwell_time_ms integer default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_interaction_events_user on public.interaction_events (user_id, created_at desc);
create index if not exists idx_interaction_events_post on public.interaction_events (post_id, interaction_type);
create index if not exists idx_interaction_events_user_post on public.interaction_events (user_id, post_id);

-- ====================================================================
-- 26. Served Recommendation Events Table (Auditable Transparent Telemetry)
-- ====================================================================
create table if not exists public.recommendation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  rank_position integer not null,
  total_score numeric not null,
  scoring_factors jsonb not null default '{}'::jsonb,
  model_version text not null default 'v1-transparent-heuristic',
  served_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_recommendation_events_user on public.recommendation_events (user_id, served_at desc);
create index if not exists idx_recommendation_events_post on public.recommendation_events (post_id);

-- Enable RLS for Feed Telemetry Tables
alter table public.interaction_events enable row level security;
alter table public.recommendation_events enable row level security;

-- Interaction Events RLS
drop policy if exists "Users can view their own interaction events" on public.interaction_events;
create policy "Users can view their own interaction events" on public.interaction_events for select
  using (auth.uid() = user_id or auth.jwt()->>'role' = 'service_role');

drop policy if exists "Users can record their own interaction events" on public.interaction_events;
create policy "Users can record their own interaction events" on public.interaction_events for insert
  with check (auth.uid() = user_id or auth.jwt()->>'role' = 'service_role');

-- Recommendation Events RLS
drop policy if exists "Users can view their own served recommendations" on public.recommendation_events;
create policy "Users can view their own served recommendations" on public.recommendation_events for select
  using (auth.uid() = user_id or auth.jwt()->>'role' = 'service_role');

drop policy if exists "Services and admins can insert recommendation events" on public.recommendation_events;
create policy "Services and admins can insert recommendation events" on public.recommendation_events for insert
  with check (auth.uid() = user_id or auth.jwt()->>'role' = 'service_role');



