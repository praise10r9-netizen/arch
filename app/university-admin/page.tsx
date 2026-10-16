import UniversityAdminWorkspace from '../components/UniversityAdminWorkspace';
import { requirePageRole } from '../../lib/page-auth';

export const instant = false;

export default async function UniversityAdminPage() {
  await requirePageRole('university_admin');
  return <UniversityAdminWorkspace />;
}