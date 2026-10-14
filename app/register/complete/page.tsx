import { Suspense } from 'react';
import CompleteRegistration from '../../components/CompleteRegistration';

export default function CompleteRegistrationPage({ searchParams }: {
  searchParams: Promise<{ token?: string }>;
}) {
  return <Suspense fallback={<main className="auth-wrapper" aria-busy="true" />}>
    <RegistrationLink searchParams={searchParams} />
  </Suspense>;
}

async function RegistrationLink({ searchParams }: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <CompleteRegistration token={token ?? ''} />;
}