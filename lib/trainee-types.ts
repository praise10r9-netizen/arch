export const TRAINING_CATEGORIES = [
  'Design & documentation',
  'Site supervision',
  'Project coordination',
  'Professional practice',
] as const;

export type TrainingCategory = (typeof TRAINING_CATEGORIES)[number];
export type EntryStatus = 'pending' | 'approved' | 'changes-requested';
export type AttachmentKind = 'evidence' | 'certificate';

export interface TraineeProfile {
  id: string;
  name: string;
  email: string;
  stage: string;
}

export interface TrainingEntry {
  id: string;
  date: string;
  category: TrainingCategory;
  activity: string;
  hours: number;
  status: EntryStatus;
  createdAt: string;
}

export interface TraineeAttachment {
  id: string;
  kind: AttachmentKind;
  entryId: string | null;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface TraineeWorkspaceData {
  trainee: TraineeProfile;
  categories: TrainingCategory[];
  entries: TrainingEntry[];
  attachments: TraineeAttachment[];
}

export interface NewTrainingEntry {
  date: string;
  category: TrainingCategory;
  activity: string;
  hours: number;
}
