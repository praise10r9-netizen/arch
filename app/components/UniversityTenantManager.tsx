'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

interface University {
  id: string;
  name: string;
  adminEmail: string;
  domain: string;
  rosterCount: number;
  availableCount: number;
  activatedCount: number;
  ongoingCount: number;
  graduatedCount: number;
  roster: RosterStudent[];
}

interface RosterStudent {
  id: string;
  registrationNumber: string;
  fullName: string;
  schoolEmail: string;
  programType: 'student_attachment' | 'graduate_training';
  enrollmentStatus: 'ongoing' | 'graduated';
  accountStatus: 'available' | 'invited' | 'activated';
  cohort: string | null;
}

interface UniversityTenantManagerProps {
  onUniversityReady?: () => void | Promise<void>;
}

export default function UniversityTenantManager({ onUniversityReady }: UniversityTenantManagerProps) {
  const [university, setUniversity] = useState<University | null>(null);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | undefined>>({});
  const [fileVersions, setFileVersions] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refreshUniversity = useCallback(async () => {
    const response = await fetch('/api/university/tenants', { cache: 'no-store' });
    const result = (await response.json()) as { university?: University | null; message?: string };
    if (!response.ok || !('university' in result)) throw new Error(result.message || 'Unable to load your university workspace.');
    setUniversity(result.university ?? null);
  }, []);

  useEffect(() => {
    Promise.resolve().then(refreshUniversity)
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Unable to load your university workspace.'))
      .finally(() => setLoading(false));
  }, [refreshUniversity]);

  async function createTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('create');
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/university/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, domain }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || 'Unable to register university.');
      setName('');
      setDomain('');
      setMessage('Your university workspace is ready. The school email domain is verified in simulation; no DNS changes were made.');
      await refreshUniversity();
      await onUniversityReady?.();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to register university.');
    } finally {
      setBusy('');
    }
  }

  async function importRoster(record: University) {
    const file = selectedFiles[record.id];
    if (!file) return;
    setBusy(record.id);
    setError('');
    setMessage('');
    try {
      const formData = new FormData();
      formData.set('file', file);
      const response = await fetch(`/api/university/tenants/${record.id}/roster`, {
        method: 'POST',
        body: formData,
      });
      const result = (await response.json()) as { importedCount?: number; updatedCount?: number; message?: string };
      if (!response.ok) throw new Error(result.message || 'Unable to import roster.');
      setMessage(`Imported ${result.importedCount ?? 0} new students and updated ${result.updatedCount ?? 0} for ${record.name}.`);
      setSelectedFiles((current) => ({ ...current, [record.id]: undefined }));
      setFileVersions((current) => ({ ...current, [record.id]: (current[record.id] ?? 0) + 1 }));
      await refreshUniversity();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Unable to import roster.');
    } finally {
      setBusy('');
    }
  }

  return <div className="tenant-manager">
    {!university && <section className="university-section tenant-create-section">
      <div className="university-section-heading"><div><span>YOUR UNIVERSITY</span><h2>Set up your university workspace</h2></div></div>
      <p className="tenant-note">Register the university you administer and sign its school email domain to this account. Domain verification is simulated for the MVP; no real DNS is checked or changed.</p>
      <form className="tenant-create-form" onSubmit={createTenant}>
        <label>University name<input autoComplete="organization" maxLength={160} onChange={(event) => setName(event.target.value)} required value={name} /></label>
        <label>School email domain<input autoComplete="off" onChange={(event) => setDomain(event.target.value)} placeholder="example.ac.mw" required value={domain} /></label>
        <button disabled={busy === 'create'} type="submit">{busy === 'create' ? 'Setting up…' : 'Sign school email domain'}</button>
      </form>
    </section>}

    <section className="tenant-list-section">
      <div className="university-section-heading"><div><span>ONE UNIVERSITY WORKSPACE</span><h2>Your university & student roster</h2></div>
        <a href="/university-roster-template.csv" download>Download CSV template</a></div>
      {error && <div className="university-alert error" role="alert">{error}</div>}
      {message && <div className="university-alert success" role="status">{message}</div>}
      {loading ? <p className="university-loading">Loading your university workspace…</p> : !university ? (
        <p className="university-empty">Your university details will appear here after setup.</p>
      ) : <div className="tenant-list">
        <article className="tenant-row" key={university.id}>
          <div className="tenant-summary">
            <div><strong>{university.name}</strong><span>{university.domain} · Simulation verified</span><small>Administrator: {university.adminEmail}</small></div>
            <div className="tenant-counts"><span>{university.rosterCount} rostered</span><span>{university.ongoingCount} ongoing</span><span>{university.graduatedCount} graduated</span><span>{university.availableCount} available</span><span>{university.activatedCount} activated</span></div>
          </div>
          <div className="tenant-import-controls">
            <label className="tenant-file-label">Choose student roster CSV
              <input accept=".csv,text/csv" key={`${university.id}-${fileVersions[university.id] ?? 0}`}
                onChange={(event) => setSelectedFiles((current) => ({ ...current, [university.id]: event.target.files?.[0] }))}
                type="file" />
            </label>
            <span className="tenant-file-name">{selectedFiles[university.id]?.name ?? 'No file selected'}</span>
            <button disabled={!selectedFiles[university.id] || Boolean(busy)} onClick={() => void importRoster(university)} type="button">
              {busy === university.id ? 'Importing…' : 'Import students'}
            </button>
          </div>
        </article>
        {university.roster.length > 0 && <div className="university-table-wrap tenant-roster-table">
          <table className="university-table">
            <thead><tr><th>Student</th><th>Registration</th><th>Program</th><th>Enrollment</th><th>Account</th><th>Cohort</th></tr></thead>
            <tbody>{university.roster.map((student) => <tr key={student.id}>
              <td><strong>{student.fullName}</strong><small>{student.schoolEmail}</small></td>
              <td>{student.registrationNumber}</td>
              <td>{student.programType === 'student_attachment' ? 'Student attachment' : 'Graduate training'}</td>
              <td><span className={`university-status ${student.enrollmentStatus}`}>{student.enrollmentStatus}</span></td>
              <td>{student.accountStatus}</td>
              <td>{student.cohort || '—'}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </div>}
    </section>
  </div>;
}