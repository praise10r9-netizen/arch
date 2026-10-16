import TraineeWorkspace from '../components/TraineeWorkspace';
import { requirePageRole } from '../../lib/page-auth';

export const instant = false;

export default async function TraineePage() {
  await requirePageRole('trainee');
  return <TraineeWorkspace />;
}
