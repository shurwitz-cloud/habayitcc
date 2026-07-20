'use client';

import type { CrmEventRecord } from '@/lib/admin/crm/types';
import { eventsOutsideTabs, pickEventTabList } from '@/lib/admin/crm/event-tabs';
import { formatDate } from '@/lib/admin/crm/utils';

export function EventTabsPanel({
  events,
  activeEventId,
  onSelect,
  mode,
}: {
  events: CrmEventRecord[];
  activeEventId: string;
  onSelect: (eventId: string) => void;
  mode: 'events' | 'rsvps';
}) {
  const tabs = pickEventTabList(events);
  const otherEvents = eventsOutsideTabs(events, tabs);
  const selectedIsOther =
    activeEventId !== 'all' && !tabs.some((t) => t.id === activeEventId);

  return (
    <div className="px-4 py-3 border-b border-line bg-gradient-to-b from-soft/60 to-white space-y-3">
      <p className="text-[0.62rem] uppercase tracking-wider text-muted font-bold">
        {mode === 'rsvps' ? 'Filter by event' : 'Upcoming events'}
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => onSelect('all')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            activeEventId === 'all'
              ? 'bg-gold text-white shadow-sm'
              : 'bg-white border border-line text-navy hover:border-gold/40'
          }`}
        >
          All events
          <span
            className={`inline-flex min-w-[1.25rem] justify-center px-1.5 py-0.5 rounded-full text-[0.62rem] font-bold ${
              activeEventId === 'all' ? 'bg-white/20 text-white' : 'bg-soft text-muted'
            }`}
          >
            {events.length}
          </span>
        </button>

        {tabs.map((event) => {
          const active = event.id === activeEventId;
          return (
            <button
              key={event.id}
              type="button"
              onClick={() => onSelect(event.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors max-w-[16rem] ${
                active
                  ? 'bg-gold text-white shadow-sm'
                  : 'bg-white border border-line text-navy hover:border-gold/40'
              }`}
              title={`${event.title} · ${event.dateLabel ?? formatDate(event.startsAt)}`}
            >
              <span className="truncate">{event.title}</span>
              <span
                className={`inline-flex min-w-[1.25rem] justify-center px-1.5 py-0.5 rounded-full text-[0.62rem] font-bold shrink-0 ${
                  active ? 'bg-white/20 text-white' : 'bg-soft text-muted'
                }`}
              >
                {mode === 'rsvps' ? event.guestTotal : event.rsvpCount}
              </span>
            </button>
          );
        })}

        {otherEvents.length > 0 && (
          <label className="inline-flex items-center gap-2 ml-1">
            <span className="text-[0.65rem] font-bold uppercase tracking-wide text-muted whitespace-nowrap">
              Past / other
            </span>
            <select
              value={selectedIsOther ? activeEventId : ''}
              onChange={(e) => {
                const v = e.target.value;
                onSelect(v || 'all');
              }}
              className={`min-w-[180px] max-w-[240px] text-sm ${
                selectedIsOther ? 'border-gold ring-1 ring-gold/30' : ''
              }`}
            >
              <option value="">Find a past event…</option>
              {otherEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                  {event.dateLabel ? ` · ${event.dateLabel}` : ` · ${formatDate(event.startsAt)}`}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {tabs.length === 0 && (
        <p className="text-xs text-muted">
          No upcoming events in the next window — use Past / other or search to find earlier ones.
        </p>
      )}
    </div>
  );
}

export function EventTabsSummary({
  event,
  mode,
}: {
  event: CrmEventRecord | undefined;
  mode: 'events' | 'rsvps';
}) {
  if (!event) return null;

  return (
    <div className="px-4 py-3 border-b border-line bg-soft/20 text-sm text-muted flex flex-wrap gap-x-6 gap-y-1">
      <span>
        <strong className="text-navy">{event.title}</strong>
        {(event.dateLabel || event.startsAt) && (
          <> · {event.dateLabel ?? formatDate(event.startsAt)}</>
        )}
      </span>
      <span>
        <strong className="text-navy">{event.rsvpCount}</strong> RSVP
        {event.rsvpCount === 1 ? '' : 's'}
      </span>
      <span>
        <strong className="text-navy">{event.guestTotal}</strong> guest
        {event.guestTotal === 1 ? '' : 's'}
      </span>
      {event.location && <span>{event.location}</span>}
      {mode === 'events' && event.time && <span>{event.time}</span>}
    </div>
  );
}
