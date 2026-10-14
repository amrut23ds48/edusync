import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, firebaseConfig } from '../lib/firebase';

const SECONDARY_APP_NAME = 'SecondaryTeacherProvisioningApp';

export async function provisionTeacherAccount({
  email,
  initialPassword,
  displayName,
  departmentId,
  departmentName,
  superAdminUid,
}: {
  email: string;
  initialPassword: string;
  displayName: string;
  departmentId?: string;
  departmentName?: string;
  superAdminUid: string;
}): Promise<string> {
  // 1. Initialize or reuse the isolated secondary Firebase app
  const secondaryApp = getApps().some((app) => app.name === SECONDARY_APP_NAME)
    ? getApp(SECONDARY_APP_NAME)
    : initializeApp(firebaseConfig, SECONDARY_APP_NAME);

  const secondaryAuth = getAuth(secondaryApp);

  // 2. Create the teacher's Firebase Auth account on the secondary instance
  const userCredential = await createUserWithEmailAndPassword(
    secondaryAuth,
    email.trim().toLowerCase(),
    initialPassword
  );
  const newTeacherUid = userCredential.user.uid;

  // 3. Immediately sign out of the secondary auth instance
  await signOut(secondaryAuth);

  // 4. Using the primary db instance (authenticated as Super Admin), write the Firestore user doc
  await setDoc(doc(db, 'users', newTeacherUid), {
    uid: newTeacherUid,
    email: email.trim().toLowerCase(),
    displayName: displayName.trim(),
    role: 'teacher',
    departmentId: departmentId || '',
    departmentName: departmentName || '',
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: superAdminUid,
  });

  return newTeacherUid;
}
