-- Hebrew birthday computed from date_of_birth + sunset timing via Hebcal.

alter table children add column if not exists hebrew_birthday text;
alter table children add column if not exists hebrew_birthday_hebrew text;
alter table children add column if not exists hebrew_birthday_year text;

create index if not exists idx_children_hebrew_birthday on children(hebrew_birthday)
  where hebrew_birthday is not null;
