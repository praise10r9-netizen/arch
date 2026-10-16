'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import UniversityTenantManager from './UniversityTenantManager';
import '../styles/university-admin.css';

type View = 'overview' | 'approvals' | 'students' | 'graduates' | 'university';

interface Application {
  id: string;
  fullName: string;
  registrationNumber: string;
  email: string;
  programType: 'student_attachment' | 'graduate_training';
  status: 'pending' | 'approved';
  createdAt: string;
}

interface StudentRecord {
  id: string;
  name: string;
  email: string;
  registrationNumber: string | null;
  enrollmentStatus: 'ongoing' | 'graduated';
  registeredAt: string;
  attachmentCount: number;
}

interface GraduateRecord {
  id: string;
  name: string;
  email: string;
  registrationNumber: string | null;
  enrollmentStatus: 'ongoing' | 'graduated';
  registeredAt: string;
  entryCount: number;
}

interface DashboardData {
  applications: Application[];
  students: StudentRecord[];
  graduates: GraduateRecord[];
}

const emptyDashboard: DashboardData = { applications: [], students: [], graduates: [] };

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(date));
}

export default function UniversityAdminWorkspace() {
  const router = useRouter();
  const [view, setView] = useState<View>('overview');
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [hasUniversityWorkspace, setHasUniversityWorkspace] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refreshDashboard = useCallback(async () => {
    const response = await fetch('/api/university/applications', { cache: 'no-store' });
    const result = (await response.json()) as DashboardData & { message?: string };
    if (response.status === 401) {
      router.replace('/login');
      return;
    }
    if (!response.ok) throw new Error(result.message || 'Unable to load university records.');
    setDashboard(result);
  }, [router]);

  useEffect(() => {
    let mounted = true;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(async (response) => {
        const result = (await response.json()) as {
          user?: { universityAdmin?: boolean; universityTenantId?: string | null };
          message?: string;
        };
        if (!response.ok) {
          router.replace('/login');
          throw new Error(result.message || 'Sign in to continue.');
        }
        if (!result.user?.universityAdmin) throw new Error('University administrator access is required.');
        const hasWorkspace = Boolean(result.user.universityTenantId);
        setHasUniversityWorkspace(hasWorkspace);
        if (!hasWorkspace) setView('university');
        await refreshDashboard();
      })
      .catch((loadError: unknown) => {
        if (mounted) setError(loadError instanceof Error ? loadError.message : 'Unable to load dashboard.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [refreshDashboard, router]);

  async function reviewApplication(application: Application, action: 'approve' | 'reject') {
    setBusyId(application.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/university/applications/${application.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || 'Unable to update this request.');
      setMessage(result.message || 'Request updated.');
      await refreshDashboard();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Unable to update this request.');
    } finally {
      setBusyId('');
    }
  }

  async function signOut() {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (response.ok) router.replace('/login');
    else setError('Unable to sign out.');
  }

  const pendingCount = dashboard.applications.filter((application) => application.status === 'pending').length;
  const approvedCount = dashboard.applications.filter((application) => application.status === 'approved').length;
  const navigationItems: [View, string, string][] = hasUniversityWorkspace
    ? [
      ['overview', 'Overview', 'O'], ['approvals', 'Approvals', 'A'],
      ['students', 'Attachment students', 'S'], ['graduates', 'Graduate training', 'G'],
      ['university', 'My university', 'U'],
    ]
    : [['university', 'Set up university', 'U']];

  function renderApplications() {
    if (!dashboard.applications.length) return <p className="university-empty">No requests awaiting action.</p>;
    return <div className="university-table-wrap"><table className="university-table">
      <thead><tr><th>Applicant</th><th>Registration</th><th>Program</th><th>Received</th><th>Status</th><th>Review</th></tr></thead>
      <tbody>{dashboard.applications.map((application) => (
        <tr key={application.id}>
          <td><strong>{application.fullName}</strong><small>{application.email}</small></td>
          <td>{application.registrationNumber}</td>
          <td>{application.programType === 'student_attachment' ? 'Student attachment' : 'Graduate training'}</td>
          <td>{formatDate(application.createdAt)}</td>
          <td><span className={`university-status ${application.status}`}>{application.status === 'pending' ? 'Pending' : 'Approved'}</span></td>
          <td><div className="university-row-actions">
            <button disabled={Boolean(busyId)} onClick={() => void reviewApplication(application, 'approve')} type="button">
              {busyId === application.id ? 'Working…' : application.status === 'approved' ? 'Resend link' : 'Approve'}
            </button>
            {application.status === 'pending' && <button className="quiet" disabled={Boolean(busyId)}
              onClick={() => void reviewApplication(application, 'reject')} type="button">Reject</button>}
          </div></td>
        </tr>
      ))}</tbody>
    </table></div>;
  }

  function renderStudents() {
    if (!dashboard.students.length) return <p className="university-empty">No registered attachment students yet.</p>;
    return <div className="university-table-wrap"><table className="university-table">
      <thead><tr><th>Student</th><th>Registration</th><th>Enrollment</th><th>Registered</th><th>Attachments</th></tr></thead>
      <tbody>{dashboard.students.map((student) => <tr key={student.id}>
        <td><strong>{student.name}</strong><small>{student.email}</small></td>
        <td>{student.registrationNumber || '—'}</td>
        <td><span className={`university-status ${student.enrollmentStatus}`}>{student.enrollmentStatus}</span></td>
        <td>{formatDate(student.registeredAt)}</td>
        <td>{student.attachmentCount}</td>
      </tr>)}</tbody>
    </table></div>;
  }

  function renderGraduates() {
    if (!dashboard.graduates.length) return <p className="university-empty">No registered graduates in the training program yet.</p>;
    return <div className="university-table-wrap"><table className="university-table">
      <thead><tr><th>Graduate</th><th>Registration</th><th>Enrollment</th><th>Registered</th><th>Training entries</th></tr></thead>
      <tbody>{dashboard.graduates.map((graduate) => <tr key={graduate.id}>
        <td><strong>{graduate.name}</strong><small>{graduate.email}</small></td>
        <td>{graduate.registrationNumber || '—'}</td>
        <td><span className={`university-status ${graduate.enrollmentStatus}`}>{graduate.enrollmentStatus}</span></td>
        <td>{formatDate(graduate.registeredAt)}</td>
        <td>{graduate.entryCount}</td>
      </tr>)}</tbody>
    </table></div>;
  }

  return <div className="university-shell">
    <aside className="university-sidebar">
      <a className="university-brand" href="/university-admin"><span>A</span><strong>ARCH<small>UNIVERSITY ADMIN</small></strong></a>
      <p className="university-nav-label">WORKSPACE</p>
      <nav className="university-nav" aria-label="University administration">
        {navigationItems.map(([key, label, mark]) => (
          <button className={view === key ? 'active' : ''} key={key} onClick={() => setView(key)} type="button">
            <span className="university-nav-mark">{mark}</span>{label}
            {key === 'approvals' && pendingCount > 0 && <span className="university-nav-count">{pendingCount}</span>}
          </button>
        ))}
      </nav>
      <button className="university-signout" onClick={() => void signOut()} type="button">Sign out</button>
    </aside>

    <main className="university-main">
      <header className="university-topbar"><div><span>UNIVERSITY SERVICES</span><strong>Account administration</strong></div>
        <button className="university-admin-badge" onClick={() => void signOut()} type="button">Sign out</button></header>
      <div className="university-content">
        <div className="university-page-heading">
          <div><p>YOUR UNIVERSITY WORKSPACE</p><h1>{view === 'overview' ? 'University overview' : view === 'approvals' ? 'Access requests' : view === 'students' ? 'Attachment students' : view === 'graduates' ? 'Graduate training' : hasUniversityWorkspace ? 'My university' : 'Set up your university'}</h1></div>
          <button className="university-refresh" disabled={loading} onClick={() => void refreshDashboard()} type="button" aria-label="Refresh records" title="Refresh records">↻</button>
        </div>
        {error && <div className="university-alert error" role="alert">{error}</div>}
        {message && <div className="university-alert success" role="status">{message}</div>}
        {loading ? <p className="university-loading">Loading university records…</p> : (
          <>
            {view === 'overview' && <>
              <section className="university-metrics" aria-label="Account totals">
                <div><span>NEEDS REVIEW</span><strong>{pendingCount}</strong><small>Student and graduate requests</small></div>
                <div><span>INVITATIONS SENT</span><strong>{approvedCount}</strong><small>Awaiting account activation</small></div>
                <div><span>ATTACHMENT STUDENTS</span><strong>{dashboard.students.length}</strong><small>Registered in the app</small></div>
                <div><span>GRADUATE TRAINEES</span><strong>{dashboard.graduates.length}</strong><small>Two-year program</small></div>
              </section>
              <section className="university-section"><div className="university-section-heading"><div><span>REVIEW QUEUE</span><h2>Recent requests</h2></div><button onClick={() => setView('approvals')} type="button">All requests</button></div>{renderApplications()}</section>
              <div className="university-overview-lists">
                <section className="university-section"><div className="university-section-heading"><div><span>STUDENT ATTACHMENT</span><h2>Registered students</h2></div><button onClick={() => setView('students')} type="button">View all</button></div>{renderStudents()}</section>
                <section className="university-section"><div className="university-section-heading"><div><span>TWO-YEAR PROGRAM</span><h2>Graduate trainees</h2></div><button onClick={() => setView('graduates')} type="button">View all</button></div>{renderGraduates()}</section>
              </div>
            </>}
            {view === 'approvals' && <section className="university-section">{renderApplications()}</section>}
            {view === 'students' && <section className="university-section">{renderStudents()}</section>}
            {view === 'graduates' && <section className="university-section">{renderGraduates()}</section>}
            {view === 'university' && <UniversityTenantManager onUniversityReady={async () => {
              setHasUniversityWorkspace(true);
              setView('overview');
              await refreshDashboard();
            }} />}
          </>
        )}
      </div>
    </main>
  </div>;
}