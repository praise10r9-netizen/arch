'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type {
  AttachmentKind,
  NewTrainingEntry,
  TraineeAttachment,
  TraineeWorkspaceData,
  TrainingEntry,
} from '../../lib/trainee-types';
import '../styles/workspace.css';

type WorkspaceSection = 'overview' | 'experience';
type ExperienceMode = 'view' | 'log';

const initialEntry: NewTrainingEntry = {
  date: '',
  category: 'Design & documentation',
  activity: '',
  hours: 1,
};

function todayDate() {
  const current = new Date();
  return [
    current.getFullYear(),
    String(current.getMonth() + 1).padStart(2, '0'),
    String(current.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-MW', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function fileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TraineeWorkspace() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [workspace, setWorkspace] = useState<TraineeWorkspaceData | null>(null);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('overview');
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>('view');
  const [entry, setEntry] = useState<NewTrainingEntry>(initialEntry);
  const [attachmentKind, setAttachmentKind] = useState<AttachmentKind>('evidence');
  const [evidenceEntryId, setEvidenceEntryId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    fetch('/api/trainee/workspace', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 401) router.replace('/login');
          if (response.status === 403) router.replace('/mentor');
          throw new Error(result.message || 'Unable to load your workspace.');
        }
        return result as TraineeWorkspaceData;
      })
      .then((data) => {
        if (!mounted) return;
        setWorkspace(data);
        setEvidenceEntryId(
          data.entries.find((item) =>
            item.status === 'pending' &&
            !data.attachments.some((attachment) =>
              attachment.kind === 'evidence' && attachment.entryId === item.id,
            ),
          )?.id ?? '',
        );
        setEntry((current) => ({
          ...current,
          date: todayDate(),
          category: data.categories[0] ?? '',
        }));
      })
      .catch((loadError: unknown) => {
        if (mounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load your workspace.',
          );
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [router]);

  const loggedHours = useMemo(
    () => workspace?.entries.reduce((total, item) => total + item.hours, 0) ?? 0,
    [workspace],
  );
  const evidence = workspace?.attachments.filter((item) => item.kind === 'evidence') ?? [];
  const certificates = workspace?.attachments.filter((item) => item.kind === 'certificate') ?? [];

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsSaving(true);
    try {
      const response = await fetch('/api/trainee/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      const result = (await response.json()) as
        | { entry: TrainingEntry; notificationCreated: boolean }
        | { message?: string };
      if (!response.ok || !('entry' in result)) {
        throw new Error(('message' in result && result.message) || 'Unable to save this entry.');
      }
      setWorkspace((current) =>
        current ? { ...current, entries: [result.entry, ...current.entries] } : current,
      );
      setEvidenceEntryId(result.entry.id);
      setEntry((current) => ({
        ...current,
        date: todayDate(),
        activity: '',
        hours: 1,
      }));
      setMessage(
        result.notificationCreated
          ? 'Experience saved and added to your mentor’s notification inbox.'
          : 'Experience saved. No mentor is assigned to your account yet, so it was not sent for review.',
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save this entry.');
    } finally {
      setIsSaving(false);
    }
  }

  async function submitAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setError('Choose a file before uploading.');
      return;
    }

    const formData = new FormData();
    formData.set('kind', attachmentKind);
    formData.set('file', file);
    if (attachmentKind === 'evidence') {
      if (!evidenceEntryId) {
        setError('Save a pending experience log before adding its evidence image.');
        return;
      }
      formData.set('entryId', evidenceEntryId);
    }
    setIsUploading(true);
    try {
      const response = await fetch('/api/trainee/attachments', {
        method: 'POST',
        body: formData,
      });
      const result = (await response.json()) as TraineeAttachment | { message?: string };
      if (!response.ok || !('id' in result)) {
        throw new Error(('message' in result && result.message) || 'Unable to upload this file.');
      }
      setWorkspace((current) =>
        current
          ? { ...current, attachments: [result, ...current.attachments] }
          : current,
      );
      if (attachmentKind === 'evidence' && workspace) {
        setEvidenceEntryId(
          workspace.entries.find((item) =>
            item.id !== evidenceEntryId &&
            item.status === 'pending' &&
            !workspace.attachments.some((attachment) =>
              attachment.kind === 'evidence' && attachment.entryId === item.id,
            ),
          )?.id ?? '',
        );
      }
      if (fileInput.current) fileInput.current.value = '';
      setMessage('File uploaded and saved securely.');
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : 'Unable to upload this file.',
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function removeAttachment(attachment: TraineeAttachment) {
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        `/api/trainee/attachments?id=${encodeURIComponent(attachment.id)}`,
        { method: 'DELETE' },
      );
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || 'Unable to remove this file.');
      setWorkspace((current) =>
        current
          ? {
              ...current,
              attachments: current.attachments.filter((item) => item.id !== attachment.id),
            }
          : current,
      );
      setMessage('File removed.');
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Unable to remove this file.');
    }
  }

  async function signOut() {
    setIsSigningOut(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || 'Unable to sign out.');
      router.replace('/login');
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : 'Unable to sign out.');
      setIsSigningOut(false);
    }
  }

  if (isLoading) {
    return (
      <main className="workspace-loading" aria-live="polite">
        <span className="loading-mark">A</span>
        <p>Loading your workspace…</p>
      </main>
    );
  }

  if (!workspace) {
    return (
      <main className="workspace-error">
        <div className="workspace-error-card">
          <span className="workspace-brand-mark" aria-hidden="true">A</span>
          <h1>Workspace unavailable</h1>
          <p role="alert">{error || 'Please sign in to continue.'}</p>
          <Link className="button button-primary" href="/login">Go to sign in</Link>
        </div>
      </main>
    );
  }

  const title = activeSection === 'overview' ? 'Overview' : 'Experience log';
  const pendingEntries = workspace.entries.filter((item) => item.status === 'pending').length;

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <Link className="workspace-brand" href="/trainee" aria-label="ArchPath home">
          <span className="workspace-brand-mark" aria-hidden="true">A</span>
          <span><strong>ArchPath</strong><small>TRAINING JOURNEY</small></span>
        </Link>
        <div className="sidebar-section-label">TRAINEE SPACE</div>
        <nav className="workspace-nav" aria-label="Trainee workspace">
          <button
            aria-current={activeSection === 'overview' ? 'page' : undefined}
            className={`workspace-nav-item${activeSection === 'overview' ? ' active' : ''}`}
            onClick={() => setActiveSection('overview')}
            type="button"
          >
            <span className="nav-mark" aria-hidden="true">O</span> Overview
          </button>
          <button
            aria-current={activeSection === 'experience' ? 'page' : undefined}
            className={`workspace-nav-item${activeSection === 'experience' ? ' active' : ''}`}
            onClick={() => setActiveSection('experience')}
            type="button"
          >
            <span className="nav-mark" aria-hidden="true">E</span> Experience log
            {pendingEntries > 0 && <span className="nav-count">{pendingEntries}</span>}
          </button>
        </nav>
        <div className="sidebar-help">
          <span className="help-spark" aria-hidden="true">i</span>
          <strong>Your records</strong>
          <p>Your entries and uploaded files are private to your account.</p>
        </div>
        <button
          className="sidebar-signout sidebar-signout-button"
          disabled={isSigningOut}
          onClick={signOut}
          type="button"
        >
          <span aria-hidden="true">↗</span> {isSigningOut ? 'Signing out…' : 'Sign out'}
        </button>
      </aside>

      <main className="workspace-main">
        <header className="workspace-topbar">
          <div className="breadcrumb">
            <span>My workspace</span><span aria-hidden="true">/</span><strong>{title}</strong>
          </div>
          <div className="topbar-profile">
            <div className="profile-copy">
              <strong>{workspace.trainee.name}</strong>
              <span>{workspace.trainee.stage}</span>
            </div>
            <span className="profile-avatar" aria-label={workspace.trainee.name}>
              {getInitials(workspace.trainee.name)}
            </span>
          </div>
        </header>

        <div className="workspace-content">
          {error && <p className="workspace-feedback error" role="alert">{error}</p>}
          {message && <p className="workspace-feedback success" role="status">{message}</p>}
          {activeSection === 'overview' && (
            <section aria-labelledby="overview-title">
              <div className="page-heading">
                <div>
                  <p className="page-eyebrow">YOUR TRAINING JOURNEY</p>
                  <h1 id="overview-title">Welcome, {workspace.trainee.name.split(' ')[0]}.</h1>
                  <p>Your real experience records, in one place.</p>
                </div>
                <button
                  className="button button-primary"
                  onClick={() => {
                    setActiveSection('experience');
                    setExperienceMode('log');
                  }}
                  type="button"
                >
                  <span aria-hidden="true">＋</span> Log experience
                </button>
              </div>
              <div className="stat-grid">
                <article className="stat-card">
                  <span className="stat-label">Hours logged</span>
                  <strong>{loggedHours}<small> hrs</small></strong>
                  <span className="stat-foot">From your submitted experience</span>
                </article>
                <article className="stat-card">
                  <span className="stat-label">Experience entries</span>
                  <strong>{workspace.entries.length}</strong>
                  <span className="stat-foot">Saved to your account</span>
                </article>
                <article className="stat-card">
                  <span className="stat-label">Awaiting review</span>
                  <strong>{pendingEntries}</strong>
                  <span className="stat-foot">Entries awaiting mentor review</span>
                </article>
              </div>
              <article className="panel recent-panel">
                <div className="panel-heading">
                  <div><p className="panel-kicker">LATEST ACTIVITY</p><h2>Recent experience</h2></div>
                  <button
                    className="text-button"
                    onClick={() => setActiveSection('experience')}
                    type="button"
                  >
                    View all <span aria-hidden="true">→</span>
                  </button>
                </div>
                <EntryTable entries={workspace.entries.slice(0, 5)} />
              </article>
            </section>
          )}

          {activeSection === 'experience' && (
            <section aria-labelledby="experience-title">
              <div className="page-heading experience-page-heading">
                <div>
                  <p className="page-eyebrow">YOUR PROFESSIONAL RECORD</p>
                  <h1 id="experience-title">Experience log</h1>
                  <p>Record professional activities and keep supporting evidence together.</p>
                </div>
                <div className="experience-toggle" aria-label="Experience log view">
                  <button
                    aria-pressed={experienceMode === 'view'}
                    className={experienceMode === 'view' ? 'selected' : ''}
                    onClick={() => setExperienceMode('view')}
                    type="button"
                  >
                    View experience
                  </button>
                  <button
                    aria-pressed={experienceMode === 'log'}
                    className={experienceMode === 'log' ? 'selected' : ''}
                    onClick={() => {
                      setError('');
                      setMessage('');
                      setExperienceMode('log');
                    }}
                    type="button"
                  >
                    Log experience
                  </button>
                </div>
              </div>

              {experienceMode === 'view' ? (
                <article className="panel recent-panel">
                  <div className="panel-heading">
                    <div><p className="panel-kicker">SUBMITTED ACTIVITIES</p><h2>All experience</h2></div>
                    <span className="section-count">{workspace.entries.length} entries</span>
                  </div>
                  <EntryTable entries={workspace.entries} />
                  <AttachmentList
                    attachments={workspace.attachments}
                    onRemove={removeAttachment}
                  />
                </article>
              ) : (
                <div className="experience-layout">
                  <article className="panel entry-form-panel">
                    <div className="panel-heading">
                      <div><p className="panel-kicker">NEW RECORD</p><h2>Log an activity</h2></div>
                    </div>
                    <form className="entry-form" onSubmit={submitEntry}>
                      <label>
                        Activity date
                        <input
                          max={todayDate()}
                          onChange={(event) => setEntry({ ...entry, date: event.target.value })}
                          required
                          type="date"
                          value={entry.date}
                        />
                      </label>
                      <label>
                        Training category
                        <select
                          onChange={(event) => {
                            const selected = workspace.categories.find(
                              (item) => item === event.target.value,
                            );
                            if (selected) setEntry((current) => ({ ...current, category: selected }));
                          }}
                          required
                          value={entry.category}
                        >
                          {workspace.categories.map((category) => (
                            <option key={category} value={category}>{category}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Hours
                        <input
                          max="24"
                          min="0.25"
                          onChange={(event) => setEntry({ ...entry, hours: Number(event.target.value) })}
                          required
                          step="0.25"
                          type="number"
                          value={entry.hours}
                        />
                      </label>
                      <label>
                        What did you work on?
                        <textarea
                          maxLength={500}
                          minLength={10}
                          onChange={(event) => setEntry({ ...entry, activity: event.target.value })}
                          placeholder="Describe the activity, project, and what you learned…"
                          required
                          rows={5}
                          value={entry.activity}
                        />
                        <span className="field-hint">{entry.activity.length}/500 characters</span>
                      </label>
                      <button className="button button-primary form-submit" disabled={isSaving}>
                        {isSaving ? 'Saving…' : 'Save experience'}
                        <span aria-hidden="true">→</span>
                      </button>
                    </form>
                  </article>

                  <section className="panel attachment-panel" aria-labelledby="attachments-title">
                    <p className="panel-kicker">SUPPORTING MATERIAL</p>
                    <h2 id="attachments-title">Evidence & certificates</h2>
                    <p className="attachment-description">
                      Add one image to each pending experience log and keep up to two certificates
                      on your trainee record. Files are private and limited to 5 MB each.
                    </p>
                    <form className="attachment-form" onSubmit={submitAttachment}>
                      <label>
                        File type
                        <select
                          onChange={(event) => setAttachmentKind(event.target.value as AttachmentKind)}
                          value={attachmentKind}
                        >
                          <option value="evidence">Evidence image (one per log)</option>
                          <option disabled={certificates.length >= 2} value="certificate">
                            Certificate {certificates.length >= 2 ? '(limit reached)' : `(${certificates.length}/2 added)`}
                          </option>
                        </select>
                      </label>
                      {attachmentKind === 'evidence' && (
                        <label>
                          Experience log
                          <select
                            onChange={(event) => setEvidenceEntryId(event.target.value)}
                            required
                            value={evidenceEntryId}
                          >
                            <option value="">
                              {workspace.entries.some((item) => item.status === 'pending')
                                ? 'Select a pending log'
                                : 'Save a log before adding evidence'}
                            </option>
                            {workspace.entries
                              .filter((item) => item.status === 'pending')
                              .map((item) => {
                                const hasEvidence = evidence.some(
                                  (attachment) => attachment.entryId === item.id,
                                );
                                return (
                                  <option disabled={hasEvidence} key={item.id} value={item.id}>
                                    {formatDate(item.date)} · {item.category}
                                    {hasEvidence ? ' · evidence added' : ''}
                                  </option>
                                );
                              })}
                          </select>
                        </label>
                      )}
                      <label>
                        Choose file
                        <input
                          accept={attachmentKind === 'evidence'
                            ? 'image/jpeg,image/png,image/webp'
                            : 'application/pdf,image/jpeg,image/png,image/webp'}
                          key={attachmentKind}
                          ref={fileInput}
                          required
                          type="file"
                        />
                      </label>
                      <p className="field-hint">
                        {attachmentKind === 'evidence'
                          ? 'JPEG, PNG, or WebP image'
                          : 'PDF, JPEG, PNG, or WebP'}
                      </p>
                      <button
                        className="button button-primary form-submit"
                        disabled={
                          isUploading ||
                          (attachmentKind === 'evidence' && !evidenceEntryId) ||
                          (attachmentKind === 'certificate' && certificates.length >= 2)
                        }
                      >
                        {isUploading ? 'Uploading…' : 'Add file'}
                      </button>
                    </form>
                    <AttachmentList
                      attachments={workspace.attachments}
                      onRemove={removeAttachment}
                    />
                  </section>
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function EntryTable({ entries }: { entries: TrainingEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="empty-state">
        <span aria-hidden="true">—</span>
        <p>No experience has been logged yet.</p>
      </div>
    );
  }
  return (
    <div className="entry-table-wrap">
      <table className="entry-table">
        <thead>
          <tr><th scope="col">Activity</th><th scope="col">Date</th><th scope="col">Hours</th><th scope="col">Status</th></tr>
        </thead>
        <tbody>
          {entries.map((item) => (
            <tr key={item.id}>
              <td><strong>{item.category}</strong><span>{item.activity}</span></td>
              <td className="entry-date">{formatDate(item.date)}</td>
              <td className="entry-hours">{item.hours}</td>
              <td><span className={`status-pill ${item.status}`}>{item.status === 'pending' ? 'Awaiting review' : item.status === 'approved' ? 'Approved' : 'Changes requested'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttachmentList({
  attachments,
  onRemove,
}: {
  attachments: TraineeAttachment[];
  onRemove: (attachment: TraineeAttachment) => void;
}) {
  if (!attachments.length) {
    return <p className="attachment-empty">No evidence or certificates added yet.</p>;
  }
  return (
    <div className="attachment-list">
      {attachments.map((attachment) => (
        <div className="attachment-row" key={attachment.id}>
          <span className="attachment-type-mark" aria-hidden="true">
            {attachment.kind === 'evidence' ? 'IMG' : 'CERT'}
          </span>
          <div className="attachment-file-copy">
            <a
              href={`/api/trainee/attachments?id=${encodeURIComponent(attachment.id)}`}
              rel="noreferrer"
              target="_blank"
            >
              {attachment.filename}
            </a>
            <small>
              {attachment.kind === 'evidence'
                ? `Evidence image${attachment.entryId ? ' · linked to log' : ' · not linked to a log'}`
                : 'Certificate'} · {fileSize(attachment.sizeBytes)}
            </small>
          </div>
          <button
            className="attachment-remove"
            onClick={() => onRemove(attachment)}
            type="button"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}
