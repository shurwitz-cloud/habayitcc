-- Align program slug with HaBayit Hebrew Adventure branding
update programs
set slug = 'hebrew-adventure',
    name = 'HaBayit Hebrew Adventure'
where slug = 'hebrew-school';
