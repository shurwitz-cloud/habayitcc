'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  filterPersonSuggestions,
  type CrmPersonSuggestion,
} from '@/lib/admin/crm/person-suggestions';

type Props = {
  people: CrmPersonSuggestion[];
  value: string;
  onChange: (value: string) => void;
  onSelect: (person: CrmPersonSuggestion) => void;
  label: string;
  required?: boolean;
  type?: string;
  className?: string;
  placeholder?: string;
  /** When true, match against full name + email + phone, not just this field. */
  matchAgainst?: 'field' | 'person';
  /** Extra text included in person matching (e.g. first+last while typing last). */
  matchContext?: string;
};

export function ContactSuggestInput({
  people,
  value,
  onChange,
  onSelect,
  label,
  required,
  type = 'text',
  className = '',
  placeholder,
  matchAgainst = 'person',
  matchContext = '',
}: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const query = matchAgainst === 'person' ? `${matchContext} ${value}`.trim() : value;

  const matches = useMemo(
    () => filterPersonSuggestions(people, query, 8),
    [people, query],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(person: CrmPersonSuggestion) {
    onSelect(person);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className={`relative block text-sm text-[#172643] ${className}`}>
      <span className="mb-1 block font-medium">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open && matches.length > 0}
        className="w-full rounded border border-[#d4cfc4] px-3 py-2 text-sm"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && matches[activeIndex]) {
            e.preventDefault();
            pick(matches[activeIndex]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && matches.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded border border-[#d4cfc4] bg-white shadow-md"
        >
          {matches.map((person, index) => {
            const active = index === activeIndex;
            return (
              <li key={person.id} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm ${
                    active ? 'bg-[#f5f0e6]' : 'hover:bg-[#faf8f4]'
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(person)}
                >
                  <span className="font-medium text-[#172643]">
                    {person.firstName} {person.lastName}
                  </span>
                  <span className="text-xs text-[#6f6a60]">
                    {person.email}
                    {person.phone ? ` · ${person.phone}` : ''}
                    {person.meta ? ` · ${person.meta}` : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
