-- HaBayit BMX — 7th grade boys Bar Mitzvah Experience program track
insert into programs (slug, name, description)
values (
  'bmx',
  'HaBayit BMX',
  '7th grade boys Bar Mitzvah Experience — every Thursday, September through May'
)
on conflict (slug) do nothing;
