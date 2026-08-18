import { useEffect, useState } from 'react';
import { EXPLORER_TX_URL, STROOPS_PER_XLM } from '../config';
import { getPaymentEvents, type FeedEvent } from '../lib/contract';

interface Props {
  refreshKey: number;
}

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatTime(timestamp: bigint): string {
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleString();
}

function formatXlm(stroops: bigint): string {
  return (Number(stroops) / STROOPS_PER_XLM).toLocaleString(undefined, {
    maximumFractionDigits: 7,
  });
}

export function ActivityFeed({ refreshKey }: Props) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const next = await getPaymentEvents();
        if (!cancelled) {
          setEvents(next);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = window.setInterval(load, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshKey]);

  return (
    <section className="activity-feed">
      <header className="feed-header">
        <h2>Live activity feed</h2>
        <span className="feed-live">● live</span>
      </header>

      {loading && <p className="muted">Loading events…</p>}
      {error && <p className="feed-error">Could not load events: {error}</p>}

      {!loading && !error && events.length === 0 && (
        <p className="muted">No payments recorded yet.</p>
      )}

      <ul className="feed-list">
        {events.map((event) => (
          <li key={event.txHash} className="feed-item">
            <div className="feed-row">
              <span className="feed-addresses">
                {shorten(event.from)} → {shorten(event.to)}
              </span>
              <span className="feed-amount">{formatXlm(event.amount)} XLM</span>
            </div>
            <div className="feed-meta">
              {event.memo ? <span className="feed-memo">“{event.memo}”</span> : null}
              <span className="muted">{formatTime(event.timestamp)}</span>
              <a
                className="explorer-link"
                href={`${EXPLORER_TX_URL}${event.txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                tx ↗
              </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
