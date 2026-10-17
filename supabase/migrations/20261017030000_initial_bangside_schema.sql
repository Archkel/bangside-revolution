begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique,
  display_name text not null default 'Member',
  bio text,
  avatar_url text,
  community_affiliation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_handle_format
    check (handle is null or handle ~ '^[A-Za-z0-9_]{3,30}$')
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  description text,
  room_type text not null default 'collaboration'
    check (room_type in ('conversation', 'voice', 'video', 'broadcast', 'collaboration')),
  visibility text not null default 'private'
    check (visibility in ('private', 'public')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'moderator', 'member')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  description text,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  assigned_to uuid references auth.users(id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 160),
  description text,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'blocked', 'done')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 10000),
  message_type text not null default 'text'
    check (message_type in ('text', 'system', 'project_update')),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index room_members_user_id_idx
  on public.room_members(user_id);
create index projects_room_id_idx
  on public.projects(room_id);
create index project_tasks_project_id_idx
  on public.project_tasks(project_id);
create index project_tasks_assigned_to_idx
  on public.project_tasks(assigned_to);
create index room_messages_room_created_idx
  on public.room_messages(room_id, created_at);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create function private.can_access_room(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rooms r
    where r.id = p_room_id
      and (
        r.visibility = 'public'
        or r.created_by = (select auth.uid())
        or exists (
          select 1
          from public.room_members rm
          where rm.room_id = r.id
            and rm.user_id = (select auth.uid())
        )
      )
  );
$$;

revoke all on function private.can_access_room(uuid) from public, anon;
grant execute on function private.can_access_room(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_tasks enable row level security;
alter table public.room_messages enable row level security;

revoke all on public.profiles, public.rooms, public.room_members,
  public.projects, public.project_tasks, public.room_messages
  from anon, authenticated;

grant select, insert on public.profiles to authenticated;
grant update (handle, display_name, bio, avatar_url, community_affiliation, updated_at)
  on public.profiles to authenticated;

grant select, insert, delete on public.rooms to authenticated;
grant update (name, description, room_type, visibility)
  on public.rooms to authenticated;

grant select, insert, delete on public.room_members to authenticated;

grant select, insert, delete on public.projects to authenticated;
grant update (title, description, status, updated_at)
  on public.projects to authenticated;

grant select, insert, delete on public.project_tasks to authenticated;
grant update (assigned_to, title, description, status, due_at, updated_at)
  on public.project_tasks to authenticated;

grant select, insert, delete on public.room_messages to authenticated;

create policy profiles_read_signed_in
  on public.profiles for select to authenticated
  using (true);

create policy profiles_insert_self
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy rooms_read_accessible
  on public.rooms for select to authenticated
  using ((select private.can_access_room(id)));

create policy rooms_create_self
  on public.rooms for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy rooms_update_owner
  on public.rooms for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy rooms_delete_owner
  on public.rooms for delete to authenticated
  using (created_by = (select auth.uid()));

create policy room_members_read_accessible
  on public.room_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.rooms r
      where r.id = room_id and r.created_by = (select auth.uid())
    )
    or (select private.can_access_room(room_id))
  );

create policy room_members_join_public
  on public.room_members for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.rooms r
      where r.id = room_id and r.visibility = 'public'
    )
  );

create policy room_members_leave_or_owner_remove
  on public.room_members for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.rooms r
      where r.id = room_id and r.created_by = (select auth.uid())
    )
  );

create policy projects_read_room
  on public.projects for select to authenticated
  using ((select private.can_access_room(room_id)));

create policy projects_create_room
  on public.projects for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.can_access_room(room_id))
  );

create policy projects_update_room
  on public.projects for update to authenticated
  using ((select private.can_access_room(room_id)))
  with check ((select private.can_access_room(room_id)));

create policy projects_delete_room
  on public.projects for delete to authenticated
  using ((select private.can_access_room(room_id)));

create policy tasks_read_project_room
  on public.project_tasks for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (select private.can_access_room(p.room_id))
    )
  );

create policy tasks_create_project_room
  on public.project_tasks for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.projects p
      where p.id = project_id
        and (select private.can_access_room(p.room_id))
    )
  );

create policy tasks_update_project_room
  on public.project_tasks for update to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (select private.can_access_room(p.room_id))
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (select private.can_access_room(p.room_id))
    )
  );

create policy tasks_delete_project_room
  on public.project_tasks for delete to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (select private.can_access_room(p.room_id))
    )
  );

create policy messages_read_room
  on public.room_messages for select to authenticated
  using ((select private.can_access_room(room_id)));

create policy messages_send_as_self
  on public.room_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select private.can_access_room(room_id))
  );

create policy messages_delete_self_or_room_owner
  on public.room_messages for delete to authenticated
  using (
    sender_id = (select auth.uid())
    or exists (
      select 1 from public.rooms r
      where r.id = room_id and r.created_by = (select auth.uid())
    )
  );

commit;
