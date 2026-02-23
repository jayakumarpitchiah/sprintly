-- ─── SPRINTLY SCHEMA ──────────────────────────────────────────────────────────
-- Run this in Supabase Dashboard → SQL Editor → New query → Run

-- 1. ORGS
create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz default now()
);

-- 2. ORG MEMBERS  
create table if not exists org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null default 'member', -- 'admin' | 'member' | 'viewer'
  created_at timestamptz default now(),
  unique(org_id, user_id)
);

-- 3. PROJECTS (one per sprint/release plan)
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs(id) on delete cascade not null,
  name text not null,
  description text,
  config jsonb not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. TASKS
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  task_number int not null, -- the #1, #2 display id
  name text not null,
  priority text not null default 'P2',
  status text not null default 'To Do',
  effort jsonb not null default '{}',   -- {ios:2, and:2, be:3, wc:0, qa:2}
  owners jsonb not null default '{}',   -- {ios:"Hari", be:"Sam", qa:"Abhishek"}
  depends_on text,
  planned_start date,
  actual_start date,
  actual_end date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(project_id, task_number)
);

-- 5. CALENDAR EVENTS (L2, leave, delays)
create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  person text not null,
  date date not null,
  type text not null, -- 'l2' | 'planned' | 'unplanned' | 'delay'
  task_id int,        -- for delays, links to task_number
  extra_days int,     -- for delays
  reason text,        -- for delays
  created_at timestamptz default now()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

alter table orgs enable row level security;
alter table org_members enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table calendar_events enable row level security;

-- Orgs: visible to members
create policy "org members can view org" on orgs
  for select using (
    id in (select org_id from org_members where user_id = auth.uid())
  );

create policy "org members can update org" on orgs
  for update using (
    id in (select org_id from org_members where user_id = auth.uid() and role = 'admin')
  );

-- Org members: members can see who else is in the org
create policy "members can view org_members" on org_members
  for select using (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );

-- Projects: all org members can view, admins/members can edit
create policy "org members can view projects" on projects
  for select using (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );

create policy "org members can insert projects" on projects
  for insert with check (
    org_id in (select org_id from org_members where user_id = auth.uid() and role in ('admin','member'))
  );

create policy "org members can update projects" on projects
  for update using (
    org_id in (select org_id from org_members where user_id = auth.uid() and role in ('admin','member'))
  );

-- Tasks: follow project access
create policy "project members can view tasks" on tasks
  for select using (
    project_id in (
      select p.id from projects p
      join org_members om on om.org_id = p.org_id
      where om.user_id = auth.uid()
    )
  );

create policy "members can insert tasks" on tasks
  for insert with check (
    project_id in (
      select p.id from projects p
      join org_members om on om.org_id = p.org_id
      where om.user_id = auth.uid() and om.role in ('admin','member')
    )
  );

create policy "members can update tasks" on tasks
  for update using (
    project_id in (
      select p.id from projects p
      join org_members om on om.org_id = p.org_id
      where om.user_id = auth.uid() and om.role in ('admin','member')
    )
  );

create policy "members can delete tasks" on tasks
  for delete using (
    project_id in (
      select p.id from projects p
      join org_members om on om.org_id = p.org_id
      where om.user_id = auth.uid() and om.role in ('admin','member')
    )
  );

-- Calendar events: same as tasks
create policy "members can view calendar_events" on calendar_events
  for select using (
    project_id in (
      select p.id from projects p
      join org_members om on om.org_id = p.org_id
      where om.user_id = auth.uid()
    )
  );

create policy "members can manage calendar_events" on calendar_events
  for all using (
    project_id in (
      select p.id from projects p
      join org_members om on om.org_id = p.org_id
      where om.user_id = auth.uid() and om.role in ('admin','member')
    )
  );

-- ─── UPDATED_AT TRIGGER ───────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger projects_updated_at before update on projects
  for each row execute function update_updated_at();

create trigger tasks_updated_at before update on tasks
  for each row execute function update_updated_at();

-- ─── REALTIME ─────────────────────────────────────────────────────────────────
-- Enable realtime for collaborative sync
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table calendar_events;
