create table if not exists public.manufacturing_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.manufacturing_organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'Operator' check (role in ('Owner', 'Admin', 'Operator', 'Viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.manufacturing_organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  code text not null unique,
  default_role text not null default 'Operator' check (default_role in ('Admin', 'Operator', 'Viewer')),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.manufacturing_organizations enable row level security;
alter table public.manufacturing_organization_members enable row level security;
alter table public.manufacturing_organization_invites enable row level security;

grant select, insert, update, delete on public.manufacturing_organizations to authenticated;
grant select, insert, update, delete on public.manufacturing_organization_members to authenticated;
grant select, insert, update, delete on public.manufacturing_organization_invites to authenticated;

create or replace function public.is_manufacturing_organization_member(p_organization_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.manufacturing_organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = p_user_id
  );
$$;

create or replace function public.is_manufacturing_organization_admin(p_organization_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.manufacturing_organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = p_user_id
      and member.role in ('Owner', 'Admin')
  );
$$;

create or replace function public.is_manufacturing_organization_owner(p_organization_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.manufacturing_organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = p_user_id
      and member.role = 'Owner'
  );
$$;

drop policy if exists "Members can read manufacturing organizations" on public.manufacturing_organizations;
create policy "Members can read manufacturing organizations"
  on public.manufacturing_organizations
  for select
  using (created_by = auth.uid() or public.is_manufacturing_organization_member(id));

drop policy if exists "Users can create manufacturing organizations" on public.manufacturing_organizations;
create policy "Users can create manufacturing organizations"
  on public.manufacturing_organizations
  for insert
  with check (auth.uid() = created_by);

drop policy if exists "Admins can update manufacturing organizations" on public.manufacturing_organizations;
create policy "Admins can update manufacturing organizations"
  on public.manufacturing_organizations
  for update
  using (public.is_manufacturing_organization_admin(id))
  with check (public.is_manufacturing_organization_admin(id));

drop policy if exists "Owners can delete manufacturing organizations" on public.manufacturing_organizations;
create policy "Owners can delete manufacturing organizations"
  on public.manufacturing_organizations
  for delete
  using (public.is_manufacturing_organization_owner(id));

drop policy if exists "Members can read organization members" on public.manufacturing_organization_members;
create policy "Members can read organization members"
  on public.manufacturing_organization_members
  for select
  using (
    user_id = auth.uid()
    or public.is_manufacturing_organization_member(organization_id)
  );

drop policy if exists "Users can join organizations" on public.manufacturing_organization_members;
create policy "Users can join organizations"
  on public.manufacturing_organization_members
  for insert
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1
        from public.manufacturing_organizations organization
        where organization.id = manufacturing_organization_members.organization_id
          and organization.created_by = auth.uid()
      )
      or exists (
        select 1
        from public.manufacturing_organization_invites invite
        where invite.organization_id = manufacturing_organization_members.organization_id
          and invite.active = true
      )
    )
  );

drop policy if exists "Admins can update organization members" on public.manufacturing_organization_members;
create policy "Admins can update organization members"
  on public.manufacturing_organization_members
  for update
  using (public.is_manufacturing_organization_admin(organization_id))
  with check (public.is_manufacturing_organization_admin(organization_id));

drop policy if exists "Users can leave organizations" on public.manufacturing_organization_members;
create policy "Users can leave organizations"
  on public.manufacturing_organization_members
  for delete
  using (
    user_id = auth.uid()
    or public.is_manufacturing_organization_admin(organization_id)
  );

drop policy if exists "Authenticated users can read active manufacturing invites" on public.manufacturing_organization_invites;
create policy "Authenticated users can read active manufacturing invites"
  on public.manufacturing_organization_invites
  for select
  using (
    active = true
    or public.is_manufacturing_organization_member(organization_id)
  );

drop policy if exists "Admins can create manufacturing invites" on public.manufacturing_organization_invites;
create policy "Admins can create manufacturing invites"
  on public.manufacturing_organization_invites
  for insert
  with check (
    created_by = auth.uid()
    and public.is_manufacturing_organization_admin(organization_id)
  );

drop policy if exists "Admins can update manufacturing invites" on public.manufacturing_organization_invites;
create policy "Admins can update manufacturing invites"
  on public.manufacturing_organization_invites
  for update
  using (public.is_manufacturing_organization_admin(organization_id))
  with check (public.is_manufacturing_organization_admin(organization_id));

create index if not exists manufacturing_organization_members_user_idx
  on public.manufacturing_organization_members (user_id, organization_id);

create index if not exists manufacturing_organization_invites_code_idx
  on public.manufacturing_organization_invites (code);

drop trigger if exists set_manufacturing_organizations_updated_at on public.manufacturing_organizations;
create trigger set_manufacturing_organizations_updated_at
before update on public.manufacturing_organizations
for each row
execute function public.set_updated_at();

drop trigger if exists set_manufacturing_organization_invites_updated_at on public.manufacturing_organization_invites;
create trigger set_manufacturing_organization_invites_updated_at
before update on public.manufacturing_organization_invites
for each row
execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'manufacturing-organization-logos',
  'manufacturing-organization-logos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Manufacturing organization logos are public" on storage.objects;
create policy "Manufacturing organization logos are public"
on storage.objects
for select
using (bucket_id = 'manufacturing-organization-logos');

drop policy if exists "Users can upload manufacturing organization logos" on storage.objects;
create policy "Users can upload manufacturing organization logos"
on storage.objects
for insert
with check (
  bucket_id = 'manufacturing-organization-logos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can update manufacturing organization logos" on storage.objects;
create policy "Users can update manufacturing organization logos"
on storage.objects
for update
using (
  bucket_id = 'manufacturing-organization-logos'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'manufacturing-organization-logos'
  and auth.uid()::text = (storage.foldername(name))[1]
);
