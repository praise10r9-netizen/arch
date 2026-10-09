'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import '../styles/workspace.css';

interface MentorUser {
  id: string;
  name: string;
  email: string;
  role: 'trainee' | 'mentor';
}

interface MentorNotification {
  id: string;
  traineeName: string;
  category: string;
  activity: string;
  date: string;
  hours: number;
  createdAt: string;
  readAt: string | null;
}

interface PendingApproval {
  entryId: string;
  traineeId: string;
  traineeName: string;
  date: string;
  category: string;
  activity: string;
  hours: number;
  submittedAt: string;
}

interface ApprovalReview {
  entry: PendingApproval;
  attachments: {
    id: string;
    kind: 'evidence' | 'certificate';
    entryId: string | null;
    filename: string;
    mediaType: string;
    sizeBytes: number;
  }[];
}

interface ReviewState {
  entryId: string;
  loading: boolean;
  error: string;
  review: ApprovalReview | null;
}

function formatReviewDate(date: string) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export default function MentorWorkspace() {
  const router = useRouter();
  const [user, setUser] = useState<MentorUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notificationError, setNotificationError] = useState('');
  const [approvalError, setApprovalError] = useState('');
  const [approvalMessage, setApprovalMessage] = useState('');
  const [notifications, setNotifications] = useState<MentorNotification[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [reviewState, setReviewState] = useState<ReviewState | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [approvingEntryId, setApprovingEntryId] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [alertNotification, setAlertNotification] = useState<MentorNotification | null>(null);
  const dismissedAlerts = useRef(new Set<string>());

  useEffect(() => {
    let mounted = true;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) {
          router.replace('/login');
          throw new Error(result.message || 'Please sign in.');
        }
        const currentUser = result.user as MentorUser;
        if (currentUser.role !== 'mentor') {
          router.replace('/trainee');
          throw new Error('This space is for mentor accounts.');
        }
        if (mounted) setUser(currentUser);
      })
      .catch((loadError: unknown) => {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load mentor access.');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [router]);

  const refreshNotifications = useCallback(async () => {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    try {
      const response = await fetch('/api/mentor/notifications', { cache: 'no-store' });
      const result = (await response.json()) as {
        unreadCount?: number;
        notifications?: MentorNotification[];
        message?: string;
      };
      if (!response.ok || !result.notifications) {
        throw new Error(result.message || 'Unable to refresh notifications.');
      }
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount ?? 0);
      setNotificationError('');
      if (!isBusy) {
        const pendingAlert = result.notifications.find(
          (notification) =>
            !notification.readAt && !dismissedAlerts.current.has(notification.id),
        );
        setAlertNotification(pendingAlert ?? null);
      }
    } catch (refreshError) {
      setNotificationError(
        refreshError instanceof Error ? refreshError.message : 'Unable to refresh notifications.',
      );
    }
  }, [isBusy]);

  const refreshPendingApprovals = useCallback(async () => {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    try {
      const response = await fetch('/api/mentor/entries', { cache: 'no-store' });
      const result = (await response.json()) as {
        entries?: PendingApproval[];
        message?: string;
      };
      if (!response.ok || !result.entries) {
        throw new Error(result.message || 'Unable to refresh pending logs.');
      }
      setPendingApprovals(result.entries);
      setApprovalError('');
    } catch (refreshError) {
      setApprovalError(
        refreshError instanceof Error ? refreshError.message : 'Unable to refresh pending logs.',
      );
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const initialRefresh = window.setTimeout(() => void refreshNotifications(), 0);
    const timer = window.setInterval(() => void refreshNotifications(), 8000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshNotifications();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
    };
  }, [refreshNotifications, user]);

  useEffect(() => {
    if (!user) return;
    const initialRefresh = window.setTimeout(() => void refreshPendingApprovals(), 0);
    const timer = window.setInterval(() => void refreshPendingApprovals(), 8000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshPendingApprovals();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
    };
  }, [refreshPendingApprovals, user]);

  async function signOut() {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (response.ok) router.replace('/login');
    else {
      const result = await response.json();
      setError(result.message || 'Unable to sign out.');
    }
  }

  async function markNotificationRead(notificationId: string) {
    setNotificationError('');
    try {
      const response = await fetch('/api/mentor/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: notificationId }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || 'Unable to update notification.');
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId
            ? { ...notification, readAt: new Date().toISOString() }
            : notification,
        ),
      );
      setUnreadCount((current) => Math.max(0, current - 1));
      setAlertNotification((current) =>
        current?.id === notificationId ? null : current,
      );
    } catch (updateError) {
      setNotificationError(
        updateError instanceof Error ? updateError.message : 'Unable to update notification.',
      );
    }
  }

  async function approveEntry(entryId: string) {
    setApprovalError('');
    setApprovalMessage('');
    setApprovingEntryId(entryId);
    try {
      const response = await fetch('/api/mentor/entries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || 'Unable to approve this log.');
      setPendingApprovals((current) => current.filter((entry) => entry.entryId !== entryId));
      setReviewState(null);
      setApprovalMessage('Log approved. The signed audit record has been securely stored.');
      await Promise.all([refreshPendingApprovals(), refreshNotifications()]);
    } catch (approveError) {
      setApprovalError(
        approveError instanceof Error ? approveError.message : 'Unable to approve this log.',
      );
    } finally {
      setApprovingEntryId('');
    }
  }

  async function openReview(entryId: string) {
    setApprovalMessage('');
    setApprovalError('');
    setReviewState({ entryId, loading: true, error: '', review: null });
    try {
      const response = await fetch(`/api/mentor/entries/${encodeURIComponent(entryId)}`, {
        cache: 'no-store',
      });
      const result = (await response.json()) as ApprovalReview & { message?: string };
      if (!response.ok || !result.entry) {
        throw new Error(result.message || 'Unable to open this log for review.');
      }
      setReviewState((current) =>
        current?.entryId === entryId
          ? { entryId, loading: false, error: '', review: result }
          : current,
      );
    } catch (reviewError) {
      setReviewState((current) =>
        current?.entryId === entryId
          ? {
              entryId,
              loading: false,
              error: reviewError instanceof Error
                ? reviewError.message
                : 'Unable to open this log for review.',
              review: null,
            }
          : current,
      );
    }
  }

  if (loading) {
    return <main className="workspace-loading" aria-live="polite"><p>Loading mentor access…</p></main>;
  }
  if (!user) {
    return <main className="workspace-error"><p role="alert">{error || 'Sign in to continue.'}</p><Link href="/login">Sign in</Link></main>;
  }

  if (reviewState) {
    const review = reviewState.review;
    return (
      <main className="mentor-review-viewport">
        <header className="mentor-review-topbar">
          <button
            className="mentor-review-back"
            onClick={() => setReviewState(null)}
            type="button"
          >
            <span aria-hidden="true">←</span> Back to mentor workspace
          </button>
          <span className="mentor-review-secure-label">PRIVATE REVIEW</span>
        </header>
        {reviewState.loading ? (
          <div className="mentor-review-loading" aria-live="polite">
            <span className="loading-mark">A</span>
            <p>Preparing the log for review…</p>
          </div>
        ) : reviewState.error || !review ? (
          <div className="mentor-review-error">
            <h1>Review unavailable</h1>
            <p role="alert">{reviewState.error || 'This log can no longer be reviewed.'}</p>
            <button
              className="button button-primary"
              onClick={() => setReviewState(null)}
              type="button"
            >
              Return to mentor workspace
            </button>
          </div>
        ) : (
          <>
            <div className="mentor-review-scroll">
              <article className="mentor-review-document">
                <p className="page-eyebrow">TRAINEE EXPERIENCE LOG</p>
                <h1>{review.entry.traineeName}</h1>
                <p className="mentor-review-intro">
                  Read the complete activity record and inspect the trainee’s available
                  supporting materials before approving.
                </p>

                <dl className="mentor-review-metadata">
                  <div>
                    <dt>Activity date</dt>
                    <dd>{formatReviewDate(review.entry.date)}</dd>
                  </div>
                  <div>
                    <dt>Training category</dt>
                    <dd>{review.entry.category}</dd>
                  </div>
                  <div>
                    <dt>Time recorded</dt>
                    <dd>{review.entry.hours} hours</dd>
                  </div>
                  <div>
                    <dt>Submitted</dt>
                    <dd>{new Intl.DateTimeFormat('en', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(review.entry.submittedAt))}</dd>
                  </div>
                </dl>

                <section className="mentor-review-activity">
                  <h2>Activity description</h2>
                  <p>{review.entry.activity}</p>
                </section>

                <section className="mentor-review-evidence">
                  <div className="mentor-review-section-heading">
                    <div>
                      <p className="panel-kicker">LOG ATTACHMENTS</p>
                      <h2>Supporting evidence</h2>
                    </div>
                    <span>{review.attachments.length} files</span>
                  </div>
                  <p className="mentor-review-evidence-note">
                    Evidence images are linked to this log; certificates belong to the trainee
                    record. Open a file only when you need to inspect it.
                  </p>
                  {review.attachments.length === 0 ? (
                    <p className="attachment-empty">No evidence or certificates are available for this log.</p>
                  ) : (
                    <div className="mentor-review-evidence-list">
                      {review.attachments.map((attachment) => {
                        const source = `/api/trainee/attachments?id=${encodeURIComponent(attachment.id)}`;
                        return (
                          <figure className="mentor-review-evidence-item" key={attachment.id}>
                            <figcaption>
                              <span>{attachment.kind === 'evidence' ? 'Evidence image' : 'Certificate'}</span>
                              <a href={source} rel="noreferrer" target="_blank">
                                Open {attachment.filename}
                              </a>
                            </figcaption>
                          </figure>
                        );
                      })}
                    </div>
                  )}
                </section>
              </article>
            </div>
            <footer className="mentor-review-action-bar">
              <div>
                <strong>Ready to approve this experience?</strong>
                <span>Approval signs and preserves this reviewed log for audit.</span>
              </div>
              <button
                className="button button-primary mentor-review-approve"
                disabled={approvingEntryId !== ''}
                onClick={() => void approveEntry(review.entry.entryId)}
                type="button"
              >
                {approvingEntryId === review.entry.entryId
                  ? 'Signing approval…'
                  : 'Approve reviewed log'}
              </button>
            </footer>
          </>
        )}
      </main>
    );
  }

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <Link className="workspace-brand" href="/mentor" aria-label="ArchPath home">
          <span className="workspace-brand-mark" aria-hidden="true">A</span>
          <span><strong>ArchPath</strong><small>MENTOR SPACE</small></span>
        </Link>
        <div className="sidebar-section-label">MENTOR ACCESS</div>
        <div className="sidebar-help">
          <span className="help-spark" aria-hidden="true">i</span>
          <strong>Account role</strong>
          <p>Your mentor role is verified from your current database account.</p>
        </div>
        <button className="sidebar-signout sidebar-signout-button" onClick={signOut} type="button">
          <span aria-hidden="true">↗</span> Sign out
        </button>
      </aside>
      <main className="workspace-main">
        <header className="workspace-topbar">
          <div className="breadcrumb"><span>My workspace</span><span aria-hidden="true">/</span><strong>Mentor</strong></div>
          <div className="topbar-profile">
            <div className="profile-copy"><strong>{user.name}</strong><span>Mentor</span></div>
            <span className="profile-avatar" aria-label={user.name}>
              {user.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}
            </span>
          </div>
        </header>
        <div className="workspace-content">
          <section aria-labelledby="mentor-title">
            <div className="page-heading">
              <div>
                <p className="page-eyebrow">MENTOR ACCOUNT</p>
                <h1 id="mentor-title">Welcome, {user.name.split(' ')[0]}.</h1>

              </div>
            </div>
            <article className="panel attachment-panel">
              <h2>Mentor review</h2>
              <p className="attachment-description">
                Trainees assigned to you will appear in your notification inbox when
                they save an experience log.
              </p>
            </article>
            <article className="panel mentor-notifications-panel">
              <div className="mentor-notifications-header">
                <div>
                  <p className="panel-kicker">YOUR INBOX</p>
                  <h2>Experience notifications</h2>
                </div>
                <span className="section-count">{unreadCount} unread</span>
              </div>
              <label className="mentor-busy-toggle">
                <input
                  checked={isBusy}
                  onChange={(event) => {
                    setIsBusy(event.target.checked);
                    if (event.target.checked) setAlertNotification(null);
                  }}
                  type="checkbox"
                />
                <span>
                  <strong>Pause pop-up alerts while I’m busy</strong>
                  <small>New logs remain in your inbox until you are ready.</small>
                </span>
              </label>
              {alertNotification && !isBusy && (
                <div className="mentor-live-alert" role="status">
                  <span>
                    New experience log from <strong>{alertNotification.traineeName}</strong>
                  </span>
                  <button
                    onClick={() => {
                      dismissedAlerts.current.add(alertNotification.id);
                      setAlertNotification(null);
                    }}
                    type="button"
                  >
                    Dismiss
                  </button>
                </div>
              )}
              {notificationError && (
                <p className="workspace-feedback error" role="alert">{notificationError}</p>
              )}
              {notifications.length === 0 ? (
                <p className="attachment-empty">No experience notifications yet.</p>
              ) : (
                <div className="mentor-notifications-list">
                  {notifications.map((notification) => (
                    <article
                      className={`mentor-notification${notification.readAt ? ' read' : ' unread'}`}
                      key={notification.id}
                    >
                      <div className="mentor-notification-copy">
                        <strong>{notification.traineeName} · {notification.category}</strong>
                        <p>{notification.activity}</p>
                        <small>{notification.date} · {notification.hours} hours</small>
                      </div>
                      {!notification.readAt && (
                        <button
                          className="text-button"
                          onClick={() => void markNotificationRead(notification.id)}
                          type="button"
                        >
                          Mark read
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </article>
            <article className="panel mentor-approvals-panel">
              <div className="mentor-notifications-header">
                <div>
                  <p className="panel-kicker">ASSIGNED TRAINEES</p>
                  <h2>Logs awaiting your approval</h2>
                </div>
                <span className="section-count">{pendingApprovals.length} pending</span>
              </div>
              <p className="attachment-description">
                Approving a log signs its exact contents, trainee, your account, and approval
                time into an audit record. That signature is not shown to trainees.
              </p>
              {approvalError && (
                <p className="workspace-feedback error" role="alert">{approvalError}</p>
              )}
              {approvalMessage && (
                <p className="workspace-feedback success" role="status">{approvalMessage}</p>
              )}
              {pendingApprovals.length === 0 ? (
                <p className="attachment-empty">No assigned trainee logs are waiting for approval.</p>
              ) : (
                <div className="mentor-approvals-list">
                  {pendingApprovals.map((entry) => (
                    <article className="mentor-approval-card" key={entry.entryId}>
                      <div className="mentor-approval-copy">
                        <p className="panel-kicker">{entry.traineeName} · {entry.category}</p>
                        <h3>{entry.date} · {entry.hours} hours</h3>
                        <p>{entry.activity}</p>
                      </div>
                      <button
                        className="button button-secondary mentor-open-review"
                        onClick={() => void openReview(entry.entryId)}
                        type="button"
                      >
                        Open focused review
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </article>
          </section>
        </div>
      </main>
    </div>
  );
}
