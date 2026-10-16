import { redirect } from 'next/navigation';
import { requirePageSession } from '../lib/page-auth';

export const instant = false;

export default async function Home() {
  const user = await requirePageSession();
  const destination = user.role === 'board_admin'
    ? '/board-admin'
    : user.role === 'university_admin' || user.universityAdmin
      ? '/university-admin'
      : user.role === 'qualified_architect'
        ? '/architect'
        : '/trainee';
  redirect(destination);
}
