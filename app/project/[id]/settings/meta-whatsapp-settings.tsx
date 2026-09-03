'use client';

import React, { useCallback, useEffect, useState } from 'react';

type MetaConnection = {
  id: string; name: string; status: string; isActive: boolean; wabaIdMasked: string | null; phoneNumberIdMasked: string | null;
  displayPhoneMasked: string | null; qualityRating: string | null; phoneStatus: string | null; lastHealthAt: string | null; lastErrorCode: string | null;
  templates: Array<{ id: string; name: string; language: string; category: string; status: string; lastSyncedAt: string }>;
};

type FBResponse = { authResponse?: { code?: string } };
type FBApi = { init(options: Record<string, unknown>): void; login(callback: (response: FBResponse) => void, options: Record<string, unknown>): void };
declare global { interface Window { FB?: FBApi; fbAsyncInit?: () => void } }

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Falha na operação');
  return body;
}

export function MetaWhatsAppSettings({ projectId, isAdmin, baseUrl }: { projectId: string; isAdmin: boolean; baseUrl: string }) {
  const [connections, setConnections] = useState<MetaConnection[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    try { setConnections(await jsonRequest(`/api/channels/meta-whatsapp/connections?projectId=${encodeURIComponent(projectId)}`)); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Falha ao carregar conexões'); }
  }, [isAdmin, projectId]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function ensureSdk(appId: string, version: string) {
    if (window.FB) return window.FB;
    return new Promise<FBApi>((resolve, reject) => {
      window.fbAsyncInit = () => { window.FB!.init({ appId, cookie: true, xfbml: false, version }); resolve(window.FB!); };
      const existing = document.getElementById('facebook-jssdk');
      if (!existing) { const script = document.createElement('script'); script.id = 'facebook-jssdk'; script.async = true; script.defer = true; script.crossOrigin = 'anonymous'; script.src = 'https://connect.facebook.net/pt_BR/sdk.js'; script.onerror = () => reject(new Error('Não foi possível carregar o SDK da Meta')); document.body.appendChild(script); }
      setTimeout(() => reject(new Error('Tempo excedido ao carregar o SDK da Meta')), 15_000);
    });
  }

  async function connect() {
    setBusy(true); setNotice(null);
    try {
      const session = await jsonRequest('/api/channels/meta-whatsapp/session', { method: 'POST', body: JSON.stringify({ projectId }) });
      const fb = await ensureSdk(session.appId, session.graphVersion);
      let resolveAssets!: (assets: { wabaId: string; phoneNumberId: string }) => void;
      const assetsPromise = new Promise<{ wabaId: string; phoneNumberId: string }>((resolve) => { resolveAssets = resolve; });
      const listener = (event: MessageEvent) => {
        if (!/^https:\/\/(www\.)?facebook\.com$/.test(event.origin)) return;
        const data = typeof event.data === 'string' ? (() => { try { return JSON.parse(event.data); } catch { return null; } })() : event.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP' && data.event === 'FINISH' && data.data?.waba_id && data.data?.phone_number_id) resolveAssets({ wabaId: data.data.waba_id, phoneNumberId: data.data.phone_number_id });
      };
      window.addEventListener('message', listener);
      try {
        const authPromise = new Promise<string>((resolve, reject) => fb.login((response) => response.authResponse?.code ? resolve(response.authResponse.code) : reject(new Error('Onboarding cancelado ou sem code')), { config_id: session.configId, response_type: 'code', override_default_response_type: true, extras: { setup: {}, sessionInfoVersion: '3' } }));
        const [code, assets] = await Promise.all([authPromise, Promise.race([assetsPromise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('A Meta não retornou WABA e número')), 120_000))])]);
        await jsonRequest('/api/channels/meta-whatsapp/complete', { method: 'POST', body: JSON.stringify({ projectId, sessionId: session.sessionId, state: session.state, nonce: session.nonce, code, ...assets }) });
        setNotice('WhatsApp oficial conectado com segurança.');
        await refresh();
      } finally { window.removeEventListener('message', listener); }
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Falha no onboarding'); }
    finally { setBusy(false); }
  }

  async function sync(connectionId: string) {
    setBusy(true); setNotice(null);
    try { const result = await jsonRequest('/api/channels/meta-whatsapp/templates/sync', { method: 'POST', body: JSON.stringify({ projectId, connectionId }) }); setNotice(`${result.count} template(s) sincronizado(s).`); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Falha ao sincronizar'); }
    finally { setBusy(false); }
  }

  async function disconnect(connectionId: string) {
    if (!window.confirm('Desconectar o canal? Conversas e mensagens serão preservadas.')) return;
    setBusy(true);
    try { await jsonRequest(`/api/channels/meta-whatsapp/connections/${connectionId}?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' }); setNotice('Canal arquivado; histórico preservado.'); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Falha ao desconectar'); }
    finally { setBusy(false); }
  }

  if (!isAdmin) return null;
  return <section className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-sm font-bold text-white">WhatsApp Business oficial — Meta</h3><p className="mt-1 text-[11px] text-text-secondary">Onboarding oficial, webhooks assinados, status de entrega e templates aprovados.</p></div>
      <button type="button" disabled={busy} onClick={connect} className="rounded-lg bg-emerald-400 px-4 py-2 text-xs font-bold text-black disabled:opacity-50">{busy ? 'Processando…' : 'Conectar com a Meta'}</button>
    </div>
    <div className="rounded-lg border border-border-subtle bg-bg-base p-3 text-[10px] text-text-secondary"><span className="font-bold text-white">Webhook:</span> {baseUrl}/api/webhooks/providers/meta <span className="mx-2">•</span> Tokens nunca são exibidos e ficam cifrados no servidor.</div>
    {notice && <p role="status" className="rounded-lg border border-border-subtle bg-bg-base p-3 text-xs text-white">{notice}</p>}
    {connections.map((connection) => <div key={connection.id} className="rounded-xl border border-border-subtle bg-glass-2 p-4 text-xs space-y-3">
      <div className="flex flex-wrap items-center gap-3"><strong className="text-white">{connection.name}</strong><span className={connection.isActive ? 'text-emerald-400' : 'text-text-tertiary'}>{connection.isActive ? 'CONECTADO' : 'ARQUIVADO'}</span><span className="ml-auto text-text-secondary">{connection.displayPhoneMasked || 'número mascarado'}</span></div>
      <div className="grid gap-2 text-[10px] text-text-secondary sm:grid-cols-3"><span>WABA {connection.wabaIdMasked}</span><span>Phone ID {connection.phoneNumberIdMasked}</span><span>Qualidade {connection.qualityRating || 'não informada'}</span></div>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !connection.isActive} onClick={() => sync(connection.id)} className="rounded-lg border border-border-subtle px-3 py-1.5 text-white disabled:opacity-50">Sincronizar templates</button><button type="button" disabled={busy || !connection.isActive} onClick={() => disconnect(connection.id)} className="rounded-lg border border-red-400/20 px-3 py-1.5 text-red-300 disabled:opacity-50">Desconectar</button></div>
      {connection.templates.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-[10px]"><thead className="text-text-tertiary"><tr><th className="py-2">Template</th><th>Idioma</th><th>Categoria</th><th>Status</th></tr></thead><tbody>{connection.templates.map((template) => <tr key={template.id} className="border-t border-border-subtle"><td className="py-2 text-white">{template.name}</td><td>{template.language}</td><td>{template.category}</td><td>{template.status}</td></tr>)}</tbody></table></div>}
    </div>)}
  </section>;
}
