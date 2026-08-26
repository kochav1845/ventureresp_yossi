import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Settings, X, Save, Loader2, AlertTriangle, ExternalLink, Lock, Globe, RefreshCw } from 'lucide-react';

type OrgSettings = { domain: string; embed_url: string; auth_url: string; service_secret: string };
type Cred = { inbox_email: string; inbox_password: string };

// Embeds the external webmail app in an iframe, auto-authenticated with the user's
// stored inbox credentials. The email app must expose the auth endpoint + a
// chrome-less /embed page (see the API contract handed to the email side). Until
// those exist the page still iframes the configured URL and lets the email app
// handle its own login.
export default function Mailbox() {
  const { org } = useOrg();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<OrgSettings>({ domain: '', embed_url: '', auth_url: '', service_secret: '' });
  const [cred, setCred] = useState<Cred>({ inbox_email: '', inbox_password: '' });
  const [hasCred, setHasCred] = useState(false);
  const [token, setToken] = useState<{ access_token: string; refresh_token?: string } | null>(null);
  const [authState, setAuthState] = useState<'idle' | 'authing' | 'ok' | 'error'>('idle');
  const [authError, setAuthError] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);
  const [savingCred, setSavingCred] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: os }, { data: uc }] = await Promise.all([
        supabase.from('org_email_settings').select('*').maybeSingle(),
        supabase.from('user_inbox_credentials').select('*').maybeSingle(),
      ]);
      setSettings({ domain: os?.domain || '', embed_url: os?.embed_url || '', auth_url: os?.auth_url || '', service_secret: os?.service_secret || '' });
      if (uc) { setCred({ inbox_email: uc.inbox_email || '', inbox_password: uc.inbox_password || '' }); setHasCred(!!uc.inbox_password); }
    } catch (e) {
      console.error('Error loading mailbox settings:', e);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Exchange the stored inbox credentials for a session token via the email app's
  // auth endpoint (once it exists). Best-effort — the iframe still loads without it.
  const authenticate = useCallback(async () => {
    if (!settings.auth_url || !cred.inbox_password) return;
    setAuthState('authing'); setAuthError('');
    try {
      const resp = await fetch(settings.auth_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cred.inbox_email || user?.email, password: cred.inbox_password, domain: settings.domain }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.access_token) {
        setToken({ access_token: data.access_token, refresh_token: data.refresh_token });
        setAuthState('ok');
      } else {
        setAuthState('error'); setAuthError(data.error || `Auth failed (HTTP ${resp.status})`);
      }
    } catch (e: any) {
      setAuthState('error'); setAuthError(e?.message || 'Could not reach the email auth endpoint');
    }
  }, [settings.auth_url, settings.domain, cred.inbox_email, cred.inbox_password, user?.email]);

  useEffect(() => {
    if (settings.embed_url && settings.auth_url && cred.inbox_password) authenticate();
  }, [settings.embed_url, settings.auth_url, cred.inbox_password, authenticate]);

  // Hand the token to the embedded app once it loads (postMessage keeps it out of the URL/history).
  const postToken = useCallback(() => {
    if (!token || !iframeRef.current?.contentWindow || !settings.embed_url) return;
    try {
      const origin = new URL(settings.embed_url).origin;
      iframeRef.current.contentWindow.postMessage({ type: 'venture-inbox-auth', ...token, domain: settings.domain }, origin);
    } catch { /* invalid url */ }
  }, [token, settings.embed_url, settings.domain]);
  useEffect(() => { postToken(); }, [postToken]);

  const saveOrg = async () => {
    setSavingOrg(true);
    try {
      const { error } = await supabase.from('org_email_settings').upsert({
        organization_id: org?.id ?? null, domain: settings.domain || null, embed_url: settings.embed_url || null,
        auth_url: settings.auth_url || null, service_secret: settings.service_secret || null,
        updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
      }, { onConflict: 'organization_id' });
      if (error) throw error;
    } catch (e: any) { alert('Could not save mailbox settings:\n\n' + (e?.message || e)); }
    finally { setSavingOrg(false); }
  };

  const saveCred = async () => {
    setSavingCred(true);
    try {
      const { error } = await supabase.from('user_inbox_credentials').upsert({
        user_id: user?.id, inbox_email: cred.inbox_email || user?.email || null, inbox_password: cred.inbox_password || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;
      setHasCred(!!cred.inbox_password);
      setToken(null); setAuthState('idle');
      authenticate();
    } catch (e: any) { alert('Could not save your inbox password:\n\n' + (e?.message || e)); }
    finally { setSavingCred(false); }
  };

  const iframeSrc = settings.embed_url
    ? `${settings.embed_url}${settings.embed_url.includes('?') ? '&' : '?'}domain=${encodeURIComponent(settings.domain)}${token ? `&access_token=${encodeURIComponent(token.access_token)}` : ''}`
    : '';

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  const configured = !!settings.embed_url;
  const needsPassword = configured && !hasCred;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-white">
        <div className="p-1.5 rounded-lg bg-blue-50"><Mail className="w-5 h-5 text-blue-600" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-gray-900 leading-tight">Mailbox</h1>
          <p className="text-[11px] text-gray-500 leading-tight">
            {settings.domain ? settings.domain : 'No domain configured'}
            {authState === 'ok' && <span className="text-emerald-600"> · connected</span>}
            {authState === 'error' && <span className="text-amber-600" title={authError}> · sign-in pending</span>}
          </p>
        </div>
        {configured && (
          <button onClick={() => { setToken(null); setAuthState('idle'); authenticate(); if (iframeRef.current) iframeRef.current.src = iframeRef.current.src; }}
            title="Reload inbox" className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><RefreshCw className="w-4 h-4" /></button>
        )}
        <button onClick={() => setShowSettings(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
          <Settings className="w-4 h-4" /> Settings
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 bg-gray-50">
        {!configured ? (
          <SetupPrompt onOpen={() => setShowSettings(true)} kind="org" />
        ) : needsPassword ? (
          <SetupPrompt onOpen={() => setShowSettings(true)} kind="password" />
        ) : (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            title="Mailbox"
            onLoad={postToken}
            className="w-full h-full border-0"
            allow="clipboard-read; clipboard-write"
          />
        )}
      </div>

      {/* Settings drawer */}
      {showSettings && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2"><Settings size={18} className="text-blue-600" /><h2 className="text-base font-bold text-gray-900">Mailbox settings</h2></div>
              <button onClick={() => setShowSettings(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} className="text-gray-500" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {/* Org connection */}
              <div>
                <div className="flex items-center gap-1.5 mb-2"><Globe size={14} className="text-blue-600" /><span className="text-xs font-bold text-blue-700 uppercase tracking-wide">Email system (this org)</span></div>
                <div className="space-y-3">
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Domain
                    <input value={settings.domain} onChange={e => setSettings(s => ({ ...s, domain: e.target.value }))} placeholder="mail.yourcompany.com"
                      className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </label>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Embedded inbox URL
                    <input value={settings.embed_url} onChange={e => setSettings(s => ({ ...s, embed_url: e.target.value }))} placeholder="https://mail.yourcompany.com/embed"
                      className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </label>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Auth endpoint URL
                    <input value={settings.auth_url} onChange={e => setSettings(s => ({ ...s, auth_url: e.target.value }))} placeholder="https://mail.yourcompany.com/functions/v1/embed-auth"
                      className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </label>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Service secret (for automated sends, optional)
                    <input value={settings.service_secret} onChange={e => setSettings(s => ({ ...s, service_secret: e.target.value }))} placeholder="shared secret"
                      className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </label>
                  <button onClick={saveOrg} disabled={savingOrg}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                    {savingOrg ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save connection
                  </button>
                </div>
              </div>

              {/* Personal credentials */}
              <div className="pt-4 border-t border-gray-100">
                <div className="flex items-center gap-1.5 mb-1"><Lock size={14} className="text-emerald-600" /><span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Your inbox sign-in</span></div>
                <p className="text-[11px] text-gray-500 mb-3">Enter the <b>same password you use for your email inbox</b>. It's stored for your account only and used to sign you into the embedded inbox automatically.</p>
                <div className="space-y-3">
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Inbox email
                    <input value={cred.inbox_email} onChange={e => setCred(c => ({ ...c, inbox_email: e.target.value }))} placeholder={user?.email || 'you@yourcompany.com'}
                      className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </label>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Inbox password
                    <input type="password" value={cred.inbox_password} onChange={e => setCred(c => ({ ...c, inbox_password: e.target.value }))} placeholder="••••••••"
                      className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </label>
                  <button onClick={saveCred} disabled={savingCred}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                    {savingCred ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save &amp; connect
                  </button>
                  {authState === 'error' && <p className="text-[11px] text-amber-600 flex items-center gap-1"><AlertTriangle size={12} /> {authError}</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SetupPrompt({ onOpen, kind }: { onOpen: () => void; kind: 'org' | 'password' }) {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
          {kind === 'org' ? <Globe className="w-7 h-7 text-blue-600" /> : <Lock className="w-7 h-7 text-emerald-600" />}
        </div>
        <h3 className="text-lg font-semibold text-gray-800">
          {kind === 'org' ? 'Connect your email system' : 'Sign in to your inbox'}
        </h3>
        <p className="text-sm text-gray-500 mt-1.5">
          {kind === 'org'
            ? 'Point this mailbox at your email system: set the domain and the embedded inbox URL.'
            : 'Enter your inbox password once so we can sign you in automatically from now on.'}
        </p>
        <button onClick={onOpen} className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium">
          <Settings className="w-4 h-4" /> Open settings <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
