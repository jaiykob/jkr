/**
 * Haulmighty — shared lead capture client.
 * Lazy-loads Supabase JS from CDN, inserts into public.leads.
 * Always writes a localStorage failsafe copy so leads are never lost.
 *
 * Usage:
 *   <script src="../js/leads.js"></script>
 *   const result = await SiteLeads.capture({
 *     service: 'dog-walking',
 *     first_name: 'Jane',
 *     phone: '...',
 *     ...
 *   });
 *   if (result.ok) { ... } else { ... }
 */
(function () {
  const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
  const SUPABASE_ANON_KEY = 'REPLACE_WITH_SUPABASE_ANON_KEY';
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  const BUFFER_KEY = 'lead_buffer';

  let clientPromise = null;

  function loadClient() {
    if (clientPromise) return clientPromise;
    clientPromise = new Promise((resolve, reject) => {
      if (window.supabase && window.supabase.createClient) {
        return resolve(window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
      }
      const s = document.createElement('script');
      s.src = SDK_URL;
      s.async = true;
      s.onload = () => {
        try {
          resolve(window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
        } catch (e) { reject(e); }
      };
      s.onerror = () => reject(new Error('Supabase SDK failed to load'));
      document.head.appendChild(s);
    });
    return clientPromise;
  }

  let bufferSeq = 0;

  function bufferLead(payload) {
    const id = `${Date.now()}-${++bufferSeq}`;
    try {
      const existing = JSON.parse(localStorage.getItem(BUFFER_KEY) || '[]');
      existing.push({ ...payload, _buffer_id: id, _buffered_at: new Date().toISOString() });
      localStorage.setItem(BUFFER_KEY, JSON.stringify(existing.slice(-50)));
    } catch (e) { /* ignore quota / disabled storage */ }
    return id;
  }

  /**
   * Drop the buffered copy once the row is safely in the database.
   *
   * The buffer exists so a failed insert doesn't lose a lead — it is not a
   * record to keep. Without this it held name, phone, email and address in
   * localStorage indefinitely, on whatever machine the visitor happened to
   * book from, long after the row was already in Supabase. Now a successful
   * insert takes its own copy back out, and only genuinely unsent leads
   * survive on the device.
   */
  function unbufferLead(id) {
    try {
      const kept = JSON.parse(localStorage.getItem(BUFFER_KEY) || '[]')
        .filter((e) => e._buffer_id !== id);
      if (kept.length) localStorage.setItem(BUFFER_KEY, JSON.stringify(kept));
      else localStorage.removeItem(BUFFER_KEY);
    } catch (e) { /* ignore quota / disabled storage */ }
  }

  function utmFromUrl() {
    try {
      const p = new URLSearchParams(location.search);
      const utm = {};
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'].forEach(k => {
        const v = p.get(k);
        if (v) utm[k] = v;
      });
      return Object.keys(utm).length ? utm : null;
    } catch (e) { return null; }
  }

  /**
   * Insert a lead row. Returns { ok: boolean, error? }.
   * Never throws — caller can always proceed to success state.
   */
  async function capture(payload) {
    if (!payload || typeof payload !== 'object') return { ok: false, error: new Error('Invalid payload') };

    const bufferId = bufferLead(payload);

    const row = Object.assign({}, payload, {
      source_url: location.href.slice(0, 500),
      user_agent: (navigator.userAgent || '').slice(0, 500),
      utm: utmFromUrl()
    });

    try {
      const client = await loadClient();
      const { error } = await client.from('leads').insert(row);
      if (error) {
        console.error('[SiteLeads] insert error:', error);
        return { ok: false, error };
      }
      unbufferLead(bufferId);
      return { ok: true };
    } catch (e) {
      console.error('[SiteLeads] capture failed:', e);
      return { ok: false, error: e };
    }
  }

  window.SiteLeads = { capture };
})();
