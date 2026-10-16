import QualifiedArchitectWorkspace from '../components/QualifiedArchitectWorkspace';
import { requirePageRole } from '../../lib/page-auth';

export const instant = false;

export default async function MentorPage() {
  await requirePageRole('qualified_architect');
  return <QualifiedArchitectWorkspace />;
}
