'use client';

import { useEffect } from 'react';

/**
 * Sets the persistent reseller attribution cookie when the visitor lands on a
 * public page with ?ref=<slug> (e.g. anytimebot.app/pricing?ref=acme).
 * Mount it on public pages; it does nothing when there is no ref param.
 */
export function ResellerAttribution() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (!ref) return;

    fetch(`/api/reseller/ref?ref=${encodeURIComponent(ref)}`)
      .then((res) => {
        if (!res.ok) return;
        // Clean the URL so the ref stays a one-time signal per landing.
        params.delete('ref');
        const qs = params.toString();
        const next = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
        window.history.replaceState(null, '', next);
      })
      .catch(() => {
        // Attribution is best-effort; never block the page on it.
      });
  }, []);

  return null;
}