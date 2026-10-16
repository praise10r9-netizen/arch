import { Suspense } from 'react';
import OneTimeAccessForm from '../components/OneTimeAccessForm';

export default function TrainingInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <Suspense fallback={<main className="auth-wrapper" aria-busy="true">
      <div className="form-container"><p role="status">Loading your secure invitation link…</p></div>
    </main>}>
      <InvitationLink searchParams={searchParams} />
    </Suspense>
  );
}

async function InvitationLink({ searchParams }: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  return <OneTimeAccessForm mode="training-invitation" token={token} />;
}
