-- Optional reciprocal "spouse" link between two existing contacts.
-- Purely additive: one nullable self-referencing column, no backfill,
-- no behavior change to any existing flow. Link/unlink goes through the
-- two service-role-only functions below so both directions are always
-- written (or refused) atomically.

alter table public.contacts
  add column if not exists spouse_contact_id uuid references public.contacts(id) on delete set null;

create index if not exists contacts_spouse_contact_id_idx
  on public.contacts (spouse_contact_id);

-- Link two contacts as spouses. Refuses (raising a clear error) when the
-- ids match, either contact is missing, or either side is already linked
-- to someone else - the admin must unlink first, so no link is ever
-- silently replaced. Row locks are taken in id order to avoid deadlocks.
create or replace function public.set_contact_spouse(p_contact uuid, p_spouse uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a_id uuid;
  b_id uuid;
  a_existing uuid;
  b_existing uuid;
begin
  if p_contact is null or p_spouse is null then
    raise exception 'both contacts are required';
  end if;
  if p_contact = p_spouse then
    raise exception 'cannot link a contact to itself';
  end if;

  a_id := least(p_contact, p_spouse);
  b_id := greatest(p_contact, p_spouse);

  select spouse_contact_id into a_existing from contacts where id = a_id for update;
  if not found then
    raise exception 'contact not found';
  end if;
  select spouse_contact_id into b_existing from contacts where id = b_id for update;
  if not found then
    raise exception 'contact not found';
  end if;

  if a_existing is not null and a_existing <> b_id then
    raise exception 'one contact is already linked; unlink it first';
  end if;
  if b_existing is not null and b_existing <> a_id then
    raise exception 'one contact is already linked; unlink it first';
  end if;

  update contacts set spouse_contact_id = p_spouse where id = p_contact;
  update contacts set spouse_contact_id = p_contact where id = p_spouse;
end;
$$;

-- Clear a contact's spouse link in both directions. No-op when not linked.
create or replace function public.clear_contact_spouse(p_contact uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_spouse uuid;
begin
  if p_contact is null then
    raise exception 'contact is required';
  end if;

  select spouse_contact_id into current_spouse from contacts where id = p_contact for update;
  if not found then
    raise exception 'contact not found';
  end if;

  if current_spouse is not null then
    update contacts set spouse_contact_id = null where id = current_spouse;
  end if;
  update contacts set spouse_contact_id = null where id = p_contact;
end;
$$;

revoke all on function public.set_contact_spouse(uuid, uuid) from public, anon, authenticated;
revoke all on function public.clear_contact_spouse(uuid) from public, anon, authenticated;
grant execute on function public.set_contact_spouse(uuid, uuid) to service_role;
grant execute on function public.clear_contact_spouse(uuid) to service_role;
