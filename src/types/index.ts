import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'super_admin' | 'teacher';
export type AccountStatus = 'active' | 'disabled';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  department?: string;
  status: AccountStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy?: string;
}

export type OutcomeType = 'PO' | 'PEO' | 'PSO';

export interface GlobalOutcome {
  id: string;
  type: OutcomeType;
  code: string;
  shortLabel: string;
  sortOrder: number;
  description: string;
  status: 'active' | 'archived';
  updatedAt?: Timestamp;
  updatedBy?: string;
}
