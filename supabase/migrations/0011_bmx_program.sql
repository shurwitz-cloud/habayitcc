-- HaBayit BMX — 7th grade boys Bar Mitzvah Experience program track
insert into programs (slug, name, description)
values (
  'bmx',
  'HaBayit BMX',
  '7th grade boys Bar Mitzvah Experience — every other Thursday, 7:00–8:30 PM, September through May'
)
on conflict (slug) do nothing;
