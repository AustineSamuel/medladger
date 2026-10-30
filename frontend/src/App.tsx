import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, ArrowDownToLine, BadgeCheck, ClipboardCheck, FileCheck2, FileText,
  HeartPulse, KeyRound, LayoutDashboard, LogOut, Search, ShieldCheck, UserRoundCheck,
} from 'lucide-react';
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import {
  downloadRecord, fetchActivity, fetchConsentPermissions, fetchConsentRequests, fetchRecords, login, logout,
  registerPatient, respondToConsent, revokeConsentPermission, setTokens, verifyDocument,
  type RecordSummary, type Verification,
} from './services/api';

function Shell({ children, onLogout }: { children: React.ReactNode; onLogout: () => void }) {
  const navigate = useNavigate();
  const exit = async () => {
    try {
      await logout();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to confirm server logout.');
    } finally {
      onLogout();
      navigate('/login');
    }
  };
  return (
    <div className="min-h-screen md:flex">
      <aside className="flex w-full flex-col border-b border-slate-200 bg-white md:min-h-screen md:w-64 md:border-b-0 md:border-r">
        <Link to="/" className="flex items-center gap-3 px-6 py-6">
          <div className="rounded-xl bg-emerald-100 p-2 text-emerald-800"><HeartPulse size={22} /></div>
          <span className="text-lg font-semibold">MedLedger</span>
        </Link>
        <nav className="flex gap-2 overflow-auto px-3 pb-3 md:flex-col md:px-4">
          <NavItem to="/" icon={<LayoutDashboard size={18} />} label="Overview" />
          <NavItem to="/records" icon={<FileText size={18} />} label="Medical records" />
          <NavItem to="/consent" icon={<UserRoundCheck size={18} />} label="Access & consent" />
          <NavItem to="/verify" icon={<ClipboardCheck size={18} />} label="Verify a document" />
        </nav>
        <div className="mt-auto hidden border-t border-slate-100 p-4 md:block">
          <button onClick={exit} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 lg:px-10">
          <div>
            <div className="label">Patient portal</div>
            <div className="mt-1 text-sm text-slate-500">Your health information, under your control</div>
          </div>
          <button onClick={exit} aria-label="Sign out" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"><LogOut size={18} /></button>
          <span className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 sm:flex">
            <ShieldCheck size={15} /> Private patient account
          </span>
        </header>
        <div className="mx-auto max-w-6xl px-5 py-7 lg:px-10">{children}</div>
      </main>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) =>
      `flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${isActive ? 'bg-emerald-50 font-medium text-emerald-900' : 'text-slate-600 hover:bg-slate-50'}`
    }>{icon}<span>{label}</span></NavLink>
  );
}

function Dashboard() {
  const records = useQuery({ queryKey: ['records'], queryFn: fetchRecords });
  const requests = useQuery({ queryKey: ['consent'], queryFn: fetchConsentRequests });
  const permissions = useQuery({ queryKey: ['permissions'], queryFn: fetchConsentPermissions });
  const activity = useQuery({ queryKey: ['activity'], queryFn: fetchActivity });
  const recent = records.data?.slice(0, 4) ?? [];
  return (
    <div className="space-y-7">
      <section>
        <p className="label">Your health summary</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Good to see you</h1>
        <p className="mt-2 text-slate-600">Keep track of records and decide who can access them.</p>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        <Stat icon={<FileText size={19} />} label="Medical records" value={records.data?.length.toString() ?? '—'} />
        <Stat icon={<KeyRound size={19} />} label="Pending requests" value={requests.data?.filter((item) => item.status === 'pending').length.toString() ?? '—'} />
        <Stat icon={<Activity size={19} />} label="Active access grants" value={permissions.data?.filter((item) => !item.revokedAt && new Date(item.expiresAt) > new Date()).length.toString() ?? '—'} link="/consent" />
      </section>
      <section className="surface">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold text-slate-900">Recent records</h2><p className="mt-1 text-sm text-slate-500">Records shared with your account by healthcare providers.</p></div>
          <Link className="text-sm font-medium text-emerald-800 hover:underline" to="/records">View all</Link>
        </div>
        {records.isLoading && <p className="mt-6 text-sm text-slate-500">Loading records…</p>}
        {records.error && <p role="alert" className="mt-6 text-sm text-red-700">{records.error.message}</p>}
        {!records.isLoading && !records.error && recent.length === 0 && <p className="mt-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No records have been shared with you yet.</p>}
        <div className="mt-4 divide-y divide-slate-100">
          {recent.map((record) => <RecordRow key={record.id} record={record} />)}
        </div>
      </section>
      <section className="surface">
        <div className="flex items-center gap-2"><Activity size={18} className="text-slate-500" /><h2 className="text-lg font-semibold text-slate-900">Recent access activity</h2></div>
        {activity.isLoading && <p className="mt-4 text-sm text-slate-500">Loading activity…</p>}
        {activity.error && <p role="alert" className="mt-4 text-sm text-red-700">{activity.error.message}</p>}
        {!activity.isLoading && !activity.error && (activity.data ?? []).length === 0 && <p className="mt-4 text-sm text-slate-500">No record access activity yet.</p>}
        <ul className="mt-3 divide-y divide-slate-100">{(activity.data ?? []).slice(0, 5).map((event) => <li key={event.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="text-slate-700">{event.action.replaceAll('.', ' ')}{event.recordTitle ? ` · ${event.recordTitle}` : ''}</span><time className="text-slate-500">{new Date(event.createdAt).toLocaleString()}</time></li>)}</ul>
      </section>
      <section className="flex gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-950">
        <ShieldCheck className="mt-0.5 shrink-0" size={18} />
        <p><strong>You decide access.</strong> Approved access can be revoked at any time. Revocation prevents future access but cannot delete copies someone already downloaded.</p>
      </section>
    </div>
  );
}

function Stat({ icon, label, value, link }: { icon: React.ReactNode; label: string; value: string; link?: string }) {
  return <div className="surface flex items-start justify-between"><div><div className="label">{label}</div><div className="mt-3 text-2xl font-semibold text-slate-900">{link ? <Link to={link} className="text-base text-emerald-800 hover:underline">{value}</Link> : value}</div></div><div className="rounded-lg bg-slate-100 p-2 text-slate-600">{icon}</div></div>;
}

function RecordRow({ record }: { record: RecordSummary }) {
  const download = useMutation({ mutationFn: () => downloadRecord(record.id, record.title) });
  return <div className="flex flex-wrap items-center justify-between gap-4 py-4">
    <div className="flex min-w-0 items-center gap-3"><div className="rounded-lg bg-slate-100 p-2 text-slate-600"><FileText size={18} /></div><div className="min-w-0"><div className="truncate font-medium text-slate-900">{record.title}</div><div className="mt-1 text-sm text-slate-500">{record.institution} · {record.category}</div></div></div>
    <div className="flex items-center gap-3 text-sm text-slate-500"><span>{new Date(record.createdAt).toLocaleDateString()}</span><button disabled={download.isPending} className="rounded-md p-2 text-emerald-800 hover:bg-emerald-50 disabled:opacity-50" onClick={() => download.mutate()} aria-label="Download record"><ArrowDownToLine size={17} /></button></div>
    {download.error && <p role="alert" className="w-full text-right text-xs text-red-700">{download.error.message}</p>}
  </div>;
}

function RecordsPage() {
  const [query, setQuery] = useState('');
  const result = useQuery({ queryKey: ['records'], queryFn: fetchRecords });
  const records = (result.data ?? []).filter((record) => `${record.title} ${record.category} ${record.institution}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="space-y-5"><div><p className="label">Your health history</p><h1 className="mt-2 text-3xl font-semibold text-slate-900">Medical records</h1></div>
    <div className="relative max-w-lg"><Search className="absolute left-3 top-3 text-slate-400" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, provider, or category" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 outline-none focus:border-emerald-700" /></div>
    <div className="surface divide-y divide-slate-100">
      {result.isLoading && <p className="py-4 text-sm text-slate-500">Loading records…</p>}
      {result.error && <p role="alert" className="py-4 text-sm text-red-700">{result.error.message}</p>}
      {!result.isLoading && !result.error && records.length === 0 && <p className="py-4 text-sm text-slate-600">No matching records.</p>}
      {records.map((record) => <RecordRow key={record.id} record={record} />)}
    </div>
  </section>;
}

function ConsentPage() {
  const queryClient = useQueryClient();
  const requests = useQuery({ queryKey: ['consent'], queryFn: fetchConsentRequests });
  const permissions = useQuery({ queryKey: ['permissions'], queryFn: fetchConsentPermissions });
  const respond = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) => respondToConsent(id, decision),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consent'] }),
  });
  const revoke = useMutation({
    mutationFn: revokeConsentPermission,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['permissions'] }),
  });
  return <section className="space-y-5"><div><p className="label">Patient permissions</p><h1 className="mt-2 text-3xl font-semibold text-slate-900">Access & consent</h1><p className="mt-2 text-slate-600">Review requests before a provider can access selected records.</p></div>
    <div><h2 className="mb-3 text-lg font-semibold text-slate-900">Active and past access</h2>
      {permissions.isLoading && <div className="surface text-sm text-slate-500">Loading permissions…</div>}
      {permissions.error && <div role="alert" className="surface text-sm text-red-700">{permissions.error.message}</div>}
      {!permissions.isLoading && !permissions.error && (permissions.data ?? []).length === 0 && <div className="surface text-sm text-slate-600">No access grants yet.</div>}
      <div className="space-y-3">{(permissions.data ?? []).map((permission) => {
        const active = !permission.revokedAt && new Date(permission.expiresAt) > new Date();
        return <div key={permission.id} className="surface flex flex-wrap items-center justify-between gap-4">
          <div><div className="font-medium text-slate-900">{permission.institution}</div><div className="mt-1 text-sm text-slate-600">{permission.providerEmail}</div><div className="mt-2 text-xs text-slate-500">{permission.recordIds.length ? `${permission.recordIds.length} record(s)` : `${permission.categoryIds.length} category/categories`} · expires {new Date(permission.expiresAt).toLocaleString()}</div></div>
          <div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1 text-xs font-medium ${active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{active ? 'Active' : permission.revokedAt ? 'Revoked' : 'Expired'}</span>{active && <button disabled={revoke.isPending} onClick={() => revoke.mutate(permission.id)} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-800 hover:bg-red-50 disabled:opacity-50">Revoke</button>}</div>
        </div>;
      })}</div>
      {revoke.error && <p role="alert" className="mt-2 text-sm text-red-700">{revoke.error.message}</p>}
    </div>
    <div><h2 className="mb-3 text-lg font-semibold text-slate-900">New requests</h2>
    {requests.isLoading && <div className="surface text-sm text-slate-500">Loading access requests…</div>}
    {requests.error && <div role="alert" className="surface text-sm text-red-700">{requests.error.message}</div>}
    {!requests.isLoading && !requests.error && (requests.data ?? []).length === 0 && <div className="surface text-sm text-slate-600">No access requests.</div>}
    {(requests.data ?? []).map((request) => <div key={request.id} className="surface">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-semibold text-slate-900">{request.institution}</h2><p className="mt-1 text-sm text-slate-600">{request.providerEmail}</p><p className="mt-3 text-sm text-slate-600">Requests {request.recordIds.length ? `${request.recordIds.length} specific record(s)` : ''}{request.recordIds.length && request.categoryIds.length ? ' and ' : ''}{request.categoryIds.length ? `${request.categoryIds.length} category/categories` : ''} until {new Date(request.expiresAt).toLocaleString()}.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-700">{request.status}</span></div>
      {request.status === 'pending' && <div className="mt-4 flex gap-2"><button disabled={respond.isPending} onClick={() => respond.mutate({ id: request.id, decision: 'approve' })} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50">Approve access</button><button disabled={respond.isPending} onClick={() => respond.mutate({ id: request.id, decision: 'reject' })} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Decline</button></div>}
      {respond.error && <p role="alert" className="mt-3 text-sm text-red-700">{respond.error.message}</p>}
    </div>)}
    </div>
  </section>;
}

function VerifyPage() {
  const [recordId, setRecordId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Verification | null>(null);
  const [error, setError] = useState('');
  const mutation = useMutation({ mutationFn: () => {
    if (!file) throw new Error('Choose a document file first.');
    return verifyDocument(recordId, file);
  }, onSuccess: (value) => { setResult(value); setError(''); }, onError: (reason) => setError(reason instanceof Error ? reason.message : 'Verification failed.') });
  return <section className="max-w-3xl space-y-5"><div><p className="label">Document integrity</p><h1 className="mt-2 text-3xl font-semibold text-slate-900">Verify a document</h1><p className="mt-2 text-slate-600">Compare a document's bytes with its registered commitment. Public results do not expose patient details.</p></div>
    <form className="surface space-y-4" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <label className="block"><span className="label">Verification reference</span><input required value={recordId} onChange={(event) => setRecordId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-emerald-700" placeholder="Record UUID supplied by the issuer" /></label>
      <label className="block"><span className="label">Document file</span><input required type="file" accept=".pdf,image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
      <button disabled={mutation.isPending} className="rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50">{mutation.isPending ? 'Checking…' : 'Verify document'}</button>
    </form>
    {error && <div role="alert" className="surface border-red-200 text-sm text-red-800">{error}</div>}
    {result && <div className="surface" aria-live="polite"><div className="flex items-center gap-3">{result.matched && result.institutionVerified ? <BadgeCheck className="text-emerald-700" /> : <FileCheck2 className="text-amber-700" />}<h2 className="font-semibold text-slate-900">{result.matched ? 'Document commitment matched' : 'No valid match'}</h2></div><p className="mt-3 text-sm text-slate-700">{result.message}</p>{result.institution && <p className="mt-2 text-sm text-slate-600">Issuer: {result.institution} · {result.institutionVerified ? 'institution credential verified' : 'institution credential is not currently verified'}</p>}<p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-500">{result.limitation}</p></div>}
  </section>;
}

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: () => registering ? registerPatient(email, password, displayName) : login(email, password),
    onSuccess: (result) => {
      if (result.user.role !== 'patient') { setError('This portal is for patient accounts.'); return; }
      setTokens(result.accessToken, result.refreshToken);
      onLogin();
      navigate('/');
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : 'Sign in failed.'),
  });
  return <main className="grid min-h-screen place-items-center px-5 py-12"><div className="w-full max-w-md">
    <Link to="/" className="mb-8 flex items-center justify-center gap-3 text-xl font-semibold"><span className="rounded-xl bg-emerald-100 p-2 text-emerald-800"><HeartPulse /></span>MedLedger</Link>
    <form className="surface space-y-5 p-7" onSubmit={(event) => { event.preventDefault(); setError(''); mutation.mutate(); }}>
      <div><h1 className="text-2xl font-semibold text-slate-900">{registering ? 'Create your account' : 'Welcome back'}</h1><p className="mt-1 text-sm text-slate-600">{registering ? 'Create a patient account to manage your records.' : 'Sign in to manage your health records.'}</p></div>
      {registering && <label className="block text-sm font-medium text-slate-700">Name<input required maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>}
      <label className="block text-sm font-medium text-slate-700">Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
      <label className="block text-sm font-medium text-slate-700">Password<input required minLength={registering ? 12 : 1} type="password" autoComplete={registering ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5" />{registering && <span className="mt-1 block text-xs text-slate-500">Use at least 12 characters.</span>}</label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={mutation.isPending} className="w-full rounded-lg bg-emerald-800 px-4 py-2.5 font-medium text-white hover:bg-emerald-900 disabled:opacity-50">{mutation.isPending ? 'Please wait…' : registering ? 'Create patient account' : 'Sign in'}</button>
      <button type="button" className="w-full text-sm text-emerald-800 hover:underline" onClick={() => { setError(''); setRegistering(!registering); }}>{registering ? 'Already have an account? Sign in' : 'Create a patient account'}</button>
      <p className="text-xs leading-relaxed text-slate-500">Development prototype only. Do not enter real patient information.</p>
    </form>
  </div></main>;
}

function PublicVerifyPage() {
  return <div className="min-h-screen">
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
      <Link to="/" className="flex items-center gap-3 font-semibold"><span className="rounded-lg bg-emerald-100 p-2 text-emerald-800"><HeartPulse size={20} /></span>MedLedger</Link>
      <Link to="/login" className="text-sm font-medium text-emerald-800 hover:underline">Patient sign in</Link>
    </header>
    <main className="mx-auto max-w-6xl px-5 py-8"><VerifyPage /></main>
  </div>;
}

export default function App() {
  const [signedIn, setSignedIn] = useState(Boolean(sessionStorage.getItem('medledger_access')));
  const guarded = (element: React.ReactNode) => signedIn ? <Shell onLogout={() => setSignedIn(false)}>{element}</Shell> : <Navigate to="/login" replace />;
  return <Routes>
    <Route path="/login" element={signedIn ? <Navigate to="/" replace /> : <LoginPage onLogin={() => setSignedIn(true)} />} />
    <Route path="/" element={guarded(<Dashboard />)} />
    <Route path="/records" element={guarded(<RecordsPage />)} />
    <Route path="/consent" element={guarded(<ConsentPage />)} />
    <Route path="/verify" element={<PublicVerifyPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
