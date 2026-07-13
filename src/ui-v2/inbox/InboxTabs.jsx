// LifeMap UI V2 — InboxTabs (Stage 5B1).
// Horizontal scrollable tab strip for the morph Inbox window.
import { INBOX_TABS } from '../adapters/inboxUiAdapter.js';

export function InboxTabs({ tab, counts, onSelect, interactive }) {
  return (
    <div className="lifemapV2InboxTabStrip" role="tablist" aria-label="Разделы LM Inbox">
      {INBOX_TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={tab === item.id}
          className={tab === item.id ? 'lifemapV2InboxTabBtnActive' : 'lifemapV2InboxTabBtn'}
          tabIndex={interactive ? 0 : -1}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
          <span>{counts[item.id] || 0}</span>
        </button>
      ))}
    </div>
  );
}
