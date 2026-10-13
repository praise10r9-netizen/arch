'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

interface Tenant {
  id: string;
  name: string;
  adminEmail: string;
  domain: string;
  rosterCount: number;
  availableCount: number;
  activatedCount: number;
}

export default function UniversityTenantManager() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [name, setName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [domain, setDomain] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | undefined>>({});
  const [fileVersions, setFileVersions] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refreshTenants = useCallback(async () => {
    const response = await fetch('/api/university/tenants', { cache: 'no-store' });
    const result = (await response.json()) as { tenants?: Tenant[]; message?: string };
    if (!response.ok || !result.tenants) throw new Error(result.message || 'Unable to load universities.');
    setTenants(result.tenants);
  }, []);

  useEffect(() => {
    refreshTenants()
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Unable to load universities.'))
      .finally(() => setLoading(false));
  }, [refreshTenants]);

  async function createTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('create');
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/university/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, adminEmail, domain }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || 'Unable to register university.');
      setName('');
      setAdminEmail('');
      setDomain('');
      setMessage('University domain added in simulation mode. DNS ownership is not checked.');
      await refreshTenants();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to register university.');
    } finally {
      setBusy('');
    }
  }

  async function importRoster(tenant: Tenant) {
    const file = selectedFiles[tenant.id];
    if (!file) return;
    setBusy(tenant.id);
    setError('');
    setMessage('');
    try {
      const formData = new FormData();
      formData.set('file', file);
      const response = await fetch(`/api/university/tenants/${tenant.id}/roster`, {
        method: 'POST',
        body: formData,
      });
      const result = (await response.json()) as { importedCount?: number; message?: string };
      if (!response.ok) throw new Error(result.message || 'Unable to import roster.');
      setMessage(`Imported ${result.importedCount ?? 0} students for ${tenant.name}.`);
      setSelectedFiles((current) => ({ ...current, [tenant.id]: undefined }));
      setFileVersions((current) => ({ ...current, [tenant.id]: (current[tenant.id] ?? 0) + 1 }));
      await refreshTenants();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Unable to import roster.');
    } finally {
      setBusy('');
    }
  }

  return <div className="tenant-manager">
    <section className="university-section tenant-create-section">
      <div className="university-section-heading"><div><span>SIMULATION ONBOARDING</span><h2>Register a university</h2></div></div>
      <p className="tenant-note">Domains are allowlisted for this local simulation; no DNS ownership or SSO verification occurs.</p>
      <form className="tenant-create-form" onSubmit={createTenant}>
        <label>University name<input autoComplete="organization" maxLength={160} onChange={(event) => setName(event.target.value)} required value={name} /></label>
        <label>University contact email<input autoComplete="email" onChange={(event) => setAdminEmail(event.target.value)} required type="email" value={adminEmail} /></label>
        <label>Academic email domain<input autoComplete="off" onChange={(event) => setDomain(event.target.value)} placeholder="example.ac.mw" required value={domain} /></label>
        <button disabled={busy === 'create'} type="submit">{busy === 'create' ? 'Registering…' : 'Register domain'}</button>
      </form>
    </section>

    <section className="tenant-list-section">
      <div className="university-section-heading"><div><span>DOMAIN ALLOWLIST</span><h2>Universities & student rosters</h2></div>
        <a href="/university-roster-template.csv" download>Download CSV template</a></div>
      {error && <div className="university-alert error" role="alert">{error}</div>}
      {message && <div className="university-alert success" role="status">{message}</div>}
      {loading ? <p className="university-loading">Loading university records…</p> : tenants.length === 0 ? (
        <p className="university-empty">No university domains registered.</p>
      ) : <div className="tenant-list">{tenants.map((tenant) => (
        <article className="tenant-row" key={tenant.id}>
          <div className="tenant-summary">
            <div><strong>{tenant.name}</strong><span>{tenant.domain} · Simulation verified</span><small>Contact: {tenant.adminEmail}</small></div>
            <div className="tenant-counts"><span>{tenant.rosterCount} rostered</span><span>{tenant.availableCount} available</span><span>{tenant.activatedCount} activated</span></div>
          </div>
          <div className="tenant-import-controls">
            <label className="tenant-file-label">Choose roster CSV
              <input accept=".csv,text/csv" key={`${tenant.id}-${fileVersions[tenant.id] ?? 0}`}
                onChange={(event) => setSelectedFiles((current) => ({ ...current, [tenant.id]: event.target.files?.[0] }))}
                type="file" />
            </label>
            <span className="tenant-file-name">{selectedFiles[tenant.id]?.name ?? 'No file selected'}</span>
            <button disabled={!selectedFiles[tenant.id] || Boolean(busy)} onClick={() => void importRoster(tenant)} type="button">
              {busy === tenant.id ? 'Importing…' : 'Import students'}
            </button>
          </div>
        </article>
      ))}</div>}
    </section>
  </div>;
}