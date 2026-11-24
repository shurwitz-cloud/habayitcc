-- Store the mother/father Jewish background answers from program registration
-- on the family itself, independent of whether a second parent's contact
-- details were provided. The per-parent jewish_status columns on `parents`
-- remain for rows that exist; these family-level columns capture the answers
-- even when Parent/Guardian 2 was left blank.
alter table families
  add column if not exists mother_jewish_status text,
  add column if not exists mother_conversion_org text,
  add column if not exists mother_conversion_rabbi text,
  add column if not exists father_jewish_status text,
  add column if not exists father_conversion_org text,
  add column if not exists father_conversion_rabbi text;
