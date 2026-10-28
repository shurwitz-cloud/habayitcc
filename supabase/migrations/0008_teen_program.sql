-- Teen program track for future registrations (CRM Applications tab)
insert into programs (slug, name, description)
values (
  'teen',
  'HaBayit Teen',
  'Teen programs and community for middle and high school students'
)
on conflict (slug) do nothing;
