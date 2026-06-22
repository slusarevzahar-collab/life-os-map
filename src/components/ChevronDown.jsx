export function ChevronDown({ open = false }) {
  return <svg className="chevronIcon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d={open ? 'M5.5 12.25 10 7.75l4.5 4.5' : 'M5.5 7.75 10 12.25l4.5-4.5'} /></svg>;
}
