import BoardAdminWorkspace from '../components/BoardAdminWorkspace';
import { requirePageRole } from '../../lib/page-auth';

export const instant = false;

export default async function BoardAdminPage() {
  await requirePageRole('board_admin');
  return <BoardAdminWorkspace />;
}
