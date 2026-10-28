-- HaBayit Achim — 6th grade boys program track
insert into programs (slug, name, description)
values (
  'achim',
  'HaBayit Achim',
  '6th grade boys program — every Tuesday, September through May'
)
on conflict (slug) do nothing;
