import { Suspense } from 'react';
import OneTimeAccessForm from '../../components/OneTimeAccessForm';

export default function QualifiedArchitectActivationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <Suspense fallback={<main className="auth-wrapper" aria-busy="true">
      <div className="form-container"><p role="status">Loading your secure activation link…</p></div>
    </main>}>
      <ActivationLink searchParams={searchParams} />
    </Suspense>
  );
}

async function ActivationLink({ searchParams }: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  return <OneTimeAccessForm mode="architect-activation" token={token} />;
}
