'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { BoardDashboard } from '../../lib/board-admin';
import '../styles/board-admin.css';

type Section = 'overview' | 'architects' | 'universities' | 'students' | 'graduates' | 'entries';

const navigation: [Section, string, string][] = [
  ['overview', 'Overview', 'O'],
  ['architects', 'Qualified architects', 'A'],
  ['universities', 'University admins', 'U'],
  ['students', 'Attachment students', 'S'],
  ['graduates', 'Graduate trainees', 'G'],
  ['entries', 'Training entries', 'V'],
];

const sectionTitles: Record<Section, string> = {
  overview: 'System oversight',
  architects: 'Qualified architects',
  universities: 'University administrators',
  students: 'Student attachments',
  graduates: 'Graduate training',
  entries: 'Training activity',
};

function formatDate(value: string | null) {
  if (!value) return 'No approvals yet';
  return new Intl.DateTimeFormat('en-MW', { dateStyle: 'medium' }).format(new Date(value));
}

function programLabel(programType: 'student_attachment' | 'graduate_training' | null) {
  if (programType === 'student_attachment') return 'Student attachment';
  if (programType === 'graduate_training') return 'Graduate training';
  return 'Unclassified profile';
}

export default function BoardAdminWorkspace() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<BoardDashboard | null>(null);
  const [section, setSection] = useState<Section>('overview');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterMessage, setRosterMessage] = useState('');
  const [architectName, setArchitectName] = useState('');
  const [architectEmail, setArchitectEmail] = useState('');
  const [architectRegistrationNumber, setArchitectRegistrationNumber] = useState('');
  const [architectQualificationDate, setArchitectQualificationDate] = useState('');
  const [traineeEmail, setTraineeEmail] = useState('');
  const [replacementEmail, setReplacementEmail] = useState('');
  const [promotionRegistrationNumber, setPromotionRegistrationNumber] = useState('');
  const [promotionQualificationDate, setPromotionQualificationDate] = useState('');

  const requestDashboard = useCallback(async (): Promise<BoardDashboard | null> => {
    const response = await fetch('/api/board-admin/dashboard', { cache: 'no-store' });
    const result = (await response.json()) as BoardDashboard & { message?: string };
    if (response.status === 401) {
      router.replace('/login');
      return null;
    }
    if (response.status === 403) {
      router.replace('/');
      return null;
    }
    if (!response.ok) throw new Error(result.message || 'Unable to load board records.');
    return result;
  }, [router]);

  useEffect(() => {
    let mounted = true;
    requestDashboard()
      .then((result) => {
        if (mounted && result) setDashboard(result);
      })
      .catch((loadError: unknown) => {
        if (mounted) setError(loadError instanceof Error ? loadError.message : 'Unable to load board records.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [requestDashboard]);

  const matches = useCallback((...values: (string | number | null | undefined)[]) => {
    const query = search.trim().toLowerCase();
    return !query || values.some((value) => String(value ?? '').toLowerCase().includes(query));
  }, [search]);

  const architects = useMemo(
    () => dashboard?.architects.filter((architect) => matches(architect.name, architect.email)) ?? [],
    [dashboard, matches],
  );
  const universities = useMemo(
    () => dashboard?.universities.filter((university) =>
      matches(university.adminName, university.adminEmail, university.universityName, university.domain),
    ) ?? [],
    [dashboard, matches],
  );
  const students = useMemo(
    () => dashboard?.trainees.filter((trainee) =>
      trainee.programType === 'student_attachment' &&
      matches(trainee.name, trainee.email, trainee.registrationNumber, trainee.universityName, trainee.mentorName),
    ) ?? [],
    [dashboard, matches],
  );
  const graduates = useMemo(
    () => dashboard?.trainees.filter((trainee) =>
      (trainee.programType === 'graduate_training' || trainee.programType === null) &&
      matches(trainee.name, trainee.email, trainee.registrationNumber, trainee.universityName, trainee.mentorName),
    ) ?? [],
    [dashboard, matches],
  );
  const activityEntries = useMemo(
    () => dashboard?.recentEntries.filter((entry) =>
      matches(entry.traineeName, entry.traineeEmail, entry.mentorName, entry.mentorEmail,
        entry.universityName, entry.category, entry.activity, entry.status),
    ) ?? [],
    [dashboard, matches],
  );

  async function signOut() {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (response.ok) router.replace('/login');
    else setError('Unable to sign out.');
  }

  async function importArchitectRoster(
    payload:
      | { csv: string }
      | { architect: Record<string, string> }
      | { promoteTrainee: Record<string, string> },
  ): Promise<boolean> {
    setError('');
    setRosterMessage('');
    setRosterBusy(true);
    try {
      const response = await fetch('/api/board-admin/qualified-architects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as {
        message?: string;
        imported?: number;
        promoted?: number;
        provisioned?: number;
        previousEmail?: string;
        email?: string;
        activationEmailsSent?: number;
        activationEmailsFailed?: string[];
      };
      if (!response.ok) throw new Error(result.message || 'Unable to update the qualified architect roster.');
      const mailFailures = result.activationEmailsFailed?.length
        ? ` Activation email failed for: ${result.activationEmailsFailed.join(', ')}. Re-import those rows after fixing email delivery to retry.`
        : '';
      setRosterMessage(result.previousEmail && result.email
        ? `Promoted ${result.previousEmail} to a qualified architect at ${result.email}. Existing training records were preserved. ${result.activationEmailsSent ? 'The activation email was sent.' : 'The activation email was not sent.'}${mailFailures}`
        : `Processed ${result.imported} architect record(s): ${result.promoted} trainee account(s) promoted, ${result.provisioned} new account(s) provisioned, ${result.activationEmailsSent} activation email(s) sent.${mailFailures}`);
      const updated = await requestDashboard();
      if (updated) setDashboard(updated);
      return true;
    } catch (rosterError) {
      setError(rosterError instanceof Error ? rosterError.message : 'Unable to update the qualified architect roster.');
      return false;
    } finally {
      setRosterBusy(false);
    }
  }

  async function submitManualArchitect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const succeeded = await importArchitectRoster({
      architect: {
        name: architectName,
        email: architectEmail,
        board_registration_number: architectRegistrationNumber,
        qualification_date: architectQualificationDate,
      },
    });
    if (!succeeded) return;
    setArchitectName('');
    setArchitectEmail('');
    setArchitectRegistrationNumber('');
    setArchitectQualificationDate('');
  }

  async function submitTraineePromotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentEmail = traineeEmail.trim().toLowerCase();
    const newEmail = replacementEmail.trim().toLowerCase();
    if (!window.confirm(
      `Change ${currentEmail} to ${newEmail}, promote the account, revoke its current sessions, and require activation at the new address?`,
    )) return;
    const succeeded = await importArchitectRoster({
      promoteTrainee: {
        current_email: currentEmail,
        new_email: newEmail,
        board_registration_number: promotionRegistrationNumber,
        qualification_date: promotionQualificationDate,
      },
    });
    if (!succeeded) return;
    setTraineeEmail('');
    setReplacementEmail('');
    setPromotionRegistrationNumber('');
    setPromotionQualificationDate('');
  }

  function renderArchitects() {
    if (!architects.length) return <p className="board-empty">No qualified architects match this view.</p>;
    return <div className="board-table-wrap"><table className="board-table">
      <thead><tr><th>Qualified architect</th><th>Board number</th><th>Qualification date</th><th>Active trainees</th><th>Verified entries</th><th>Last verification</th><th>Account created</th></tr></thead>
      <tbody>{architects.map((architect) => <tr key={architect.id}>
        <td><strong>{architect.name}</strong><small>{architect.email}</small></td>
        <td>{architect.boardRegistrationNumber || '—'}</td>
        <td>{architect.qualificationDate || '—'}</td>
        <td>{architect.activeTrainees}</td><td>{architect.verifiedEntries}</td>
        <td>{formatDate(architect.lastVerificationAt)}</td><td>{formatDate(architect.createdAt)}</td>
      </tr>)}</tbody>
    </table></div>;
  }

  function renderUniversities() {
    if (!universities.length) return <p className="board-empty">No university administrators match this view.</p>;
    return <div className="board-table-wrap"><table className="board-table">
      <thead><tr><th>University administrator</th><th>University</th><th>School domain</th><th>Trainees</th><th>Roster members</th></tr></thead>
      <tbody>{universities.map((university) => <tr key={university.adminId}>
        <td><strong>{university.adminName}</strong><small>{university.adminEmail}</small></td>
        <td>{university.universityName || 'Setup not completed'}</td>
        <td>{university.domain || '—'}</td><td>{university.traineeCount}</td><td>{university.rosterCount}</td>
      </tr>)}</tbody>
    </table></div>;
  }

  function renderTrainees(records: NonNullable<typeof dashboard>['trainees']) {
    if (!records.length) return <p className="board-empty">No trainees match this view.</p>;
    return <div className="board-table-wrap"><table className="board-table">
      <thead><tr><th>Trainee</th><th>University / program</th><th>Qualified architect</th><th>Training entries</th><th>Account created</th></tr></thead>
      <tbody>{records.map((trainee) => <tr key={trainee.id}>
        <td><strong>{trainee.name}</strong><small>{trainee.email}</small></td>
        <td><strong>{trainee.universityName || 'University not linked'}</strong><small>
          {programLabel(trainee.programType)}{trainee.registrationNumber ? ` · ${trainee.registrationNumber}` : ''}
        </small></td>
        <td>{trainee.mentorName ? <><strong>{trainee.mentorName}</strong><small>{trainee.mentorEmail}</small></> : 'No active qualified architect'}</td>
        <td><strong>{trainee.totalEntries} total</strong><small>{trainee.verifiedEntries} verified · {trainee.pendingEntries} pending</small></td>
        <td>{formatDate(trainee.createdAt)}</td>
      </tr>)}</tbody>
    </table></div>;
  }

  function renderActivityEntries(records: typeof activityEntries) {
    if (!records.length) return <p className="board-empty">No training entries match this view.</p>;
    return <div className="board-table-wrap"><table className="board-table board-entry-table">
      <thead><tr><th>Trainee / program</th><th>Entry</th><th>Qualified architect</th><th>Status</th><th>Verified / audit</th></tr></thead>
      <tbody>{records.map((entry) => <tr key={entry.id}>
        <td><strong>{entry.traineeName}</strong><small>{entry.traineeEmail} · {programLabel(entry.programType)}</small></td>
        <td><strong>{entry.category} · {entry.hours}h · {formatDate(entry.date)}</strong>
          <small>{entry.universityName || 'University not linked'}</small><p>{entry.activity}</p>
        </td>
        <td>{entry.mentorName ? <><strong>{entry.mentorName}</strong><small>{entry.mentorEmail}</small></> : 'No active qualified architect'}</td>
        <td><span className={`board-entry-status ${entry.status}`}>{entry.status === 'changes-requested' ? 'Changes requested' : entry.status}</span></td>
        <td>{entry.verifiedAt ? <><strong>{formatDate(entry.verifiedAt)}</strong>
          <small>{entry.auditDigest ? <code title={entry.auditDigest}>{entry.auditDigest.slice(0, 16)}…</code> : 'No signed audit record'}</small>
        </> : 'Not verified'}</td>
      </tr>)}</tbody>
    </table></div>;
  }

  return <div className="board-shell">
    <aside className="board-sidebar">
      <a className="board-brand" href="/board-admin"><span>A</span><strong>ARCH<small>BOARD OF ARCHITECTS</small></strong></a>
      <p className="board-nav-label">SYSTEM OVERSIGHT</p>
      <nav className="board-nav" aria-label="Board administration">
        {navigation.map(([key, label, mark]) => (
          <button className={section === key ? 'active' : ''} key={key} onClick={() => setSection(key)} type="button">
            <span className="board-nav-mark">{mark}</span>{label}
          </button>
        ))}
      </nav>
      <button className="board-signout" onClick={() => void signOut()} type="button">Sign out</button>
    </aside>

    <main className="board-main">
      <header className="board-topbar">
        <div><span>BOARD OF ARCHITECTS</span><strong>System oversight and architect register</strong></div>
        <span className="board-access-badge">Super administrator</span>
      </header>
      <div className="board-content">
        <div className="board-page-heading">
          <div><p>MONITORING &amp; AUDIT</p><h1>{sectionTitles[section]}</h1></div>
          <button className="board-refresh" disabled={loading} onClick={() => {
            setError('');
            setLoading(true);
            requestDashboard()
              .then((result) => {
                if (result) setDashboard(result);
              })
              .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Unable to load board records.'))
              .finally(() => setLoading(false));
          }} type="button" aria-label="Refresh records" title="Refresh records">↻</button>
        </div>
        <p className="board-readonly-note">This workspace is for monitoring and audit. Board administrators can maintain the qualified architect register; other user and training records remain read-only.</p>
        <label className="board-search">
          <span>Search visible records</span>
          <input onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, university, activity…" value={search} />
        </label>
        {error && <div className="board-alert" role="alert">{error}</div>}
        {loading ? <p className="board-loading">Loading system records…</p> : dashboard && <>
          {section === 'overview' && <>
            <section className="board-metrics" aria-label="System totals">
              <div><span>QUALIFIED ARCHITECTS</span><strong>{dashboard.metrics.qualifiedArchitects}</strong><small>Board-recognized accounts</small></div>
              <div><span>UNIVERSITY ADMINS</span><strong>{dashboard.metrics.universityAdmins}</strong><small>Across all universities</small></div>
              <div><span>UNIVERSITIES</span><strong>{dashboard.metrics.universities}</strong><small>Registered workspaces</small></div>
              <div><span>ATTACHMENT STUDENTS</span><strong>{dashboard.metrics.attachmentStudents}</strong><small>In university placements</small></div>
              <div><span>GRADUATE TRAINEES</span><strong>{dashboard.metrics.graduateTrainees}</strong><small>Two-year program</small></div>
              <div><span>PENDING ENTRIES</span><strong>{dashboard.metrics.pendingEntries}</strong><small>Awaiting architect review</small></div>
              <div><span>VERIFIED ENTRIES</span><strong>{dashboard.metrics.verifiedEntries}</strong><small>Signed architect approvals</small></div>
            </section>
            <section className="board-section">
              <div className="board-section-heading"><div><span>TRAINING ACTIVITY</span><h2>Latest entries and architect reviews</h2></div>
                <button onClick={() => setSection('entries')} type="button">View all recent</button>
              </div>
              <p className="board-section-note">Showing the latest {Math.min(8, activityEntries.length)} of up to 100 recent training entries.</p>
              {renderActivityEntries(activityEntries.slice(0, 8))}
            </section>
          </>}
          {section === 'architects' && <>
            <section className="board-section">
              <div className="board-section-heading"><div><span>BOARD REGISTER</span><h2>Qualified architect records</h2></div></div>
              <p className="board-section-note">Import CSV headers: name,email,board_registration_number,qualification_date. Name and email are required; the other columns are optional. Matching trainee emails are promoted without losing training history. New architect accounts receive a private, 48-hour password-setup link.</p>
              {rosterMessage && <p className="board-roster-success" role="status">{rosterMessage}</p>}
              <label className="board-roster-upload">
                <span>Import a CSV roster</span>
                <input
                  accept=".csv,text/csv"
                  disabled={rosterBusy}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void file.text().then((csv) => importArchitectRoster({ csv }));
                    event.currentTarget.value = '';
                  }}
                  type="file"
                />
              </label>
              <div className="board-section-heading"><div><span>EXISTING TRAINEE</span><h2>Change email and promote</h2></div></div>
              <p className="board-section-note">This keeps the trainee account and training history, changes its email, revokes existing sessions, and emails a one-time activation link to the new address.</p>
              <form className="board-manual-architect-form" onSubmit={submitTraineePromotion}>
                <label><span>Current trainee email</span><input autoComplete="off" maxLength={254} onChange={(event) => setTraineeEmail(event.target.value)} required type="email" value={traineeEmail} /></label>
                <label><span>New architect email</span><input autoComplete="off" maxLength={254} onChange={(event) => setReplacementEmail(event.target.value)} required type="email" value={replacementEmail} /></label>
                <label><span>Board registration number</span><input maxLength={80} onChange={(event) => setPromotionRegistrationNumber(event.target.value)} value={promotionRegistrationNumber} /></label>
                <label><span>Qualification date</span><input onChange={(event) => setPromotionQualificationDate(event.target.value)} type="date" value={promotionQualificationDate} /></label>
                <button className="board-roster-submit" disabled={rosterBusy} type="submit">{rosterBusy ? 'Saving…' : 'Change email and promote'}</button>
              </form>
              <div className="board-section-heading"><div><span>NEW ACCOUNT</span><h2>Add architect manually</h2></div></div>
              <form className="board-manual-architect-form" onSubmit={submitManualArchitect}>
                <label><span>Full name</span><input maxLength={120} onChange={(event) => setArchitectName(event.target.value)} required value={architectName} /></label>
                <label><span>Email</span><input maxLength={254} onChange={(event) => setArchitectEmail(event.target.value)} required type="email" value={architectEmail} /></label>
                <label><span>Board registration number</span><input maxLength={80} onChange={(event) => setArchitectRegistrationNumber(event.target.value)} value={architectRegistrationNumber} /></label>
                <label><span>Qualification date</span><input onChange={(event) => setArchitectQualificationDate(event.target.value)} type="date" value={architectQualificationDate} /></label>
                <button className="board-roster-submit" disabled={rosterBusy} type="submit">{rosterBusy ? 'Saving…' : 'Add architect manually'}</button>
              </form>
              {renderArchitects()}
            </section>
          </>}
          {section === 'universities' && <section className="board-section">
            <div className="board-section-heading"><div><span>UNIVERSITY WORKSPACES</span><h2>Administrators and university information</h2></div></div>
            {renderUniversities()}
          </section>}
          {section === 'students' && <section className="board-section">
            <div className="board-section-heading"><div><span>STUDENT ATTACHMENT</span><h2>Students in university placements</h2></div></div>
            {renderTrainees(students)}
          </section>}
          {section === 'graduates' && <section className="board-section">
            <div className="board-section-heading"><div><span>TWO-YEAR PROGRAM</span><h2>Graduate trainees</h2></div></div>
            {renderTrainees(graduates)}
          </section>}
          {section === 'entries' && <section className="board-section">
            <div className="board-section-heading"><div><span>TRAINING ACTIVITY</span><h2>Recent entries and architect reviews</h2></div></div>
            <p className="board-section-note">The activity list is limited to the 100 most recently submitted entries. A verified timestamp and digest are shown when a signed qualified architect approval exists.</p>
            {renderActivityEntries(activityEntries)}
          </section>}
        </>}
      </div>
    </main>
  </div>;
}
