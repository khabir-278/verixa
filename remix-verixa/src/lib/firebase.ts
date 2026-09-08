import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendEmailVerification as firebaseSendEmailVerification,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  User as FirebaseUser,
} from 'firebase/auth';
import { initializeFirestore, getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const config = firebaseConfig as typeof firebaseConfig & { firestoreDatabaseId?: string };
const app = getApps().length > 0 ? getApp() : initializeApp(config);

let firestoreInstance: any;
try {
  firestoreInstance = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
  }, config.firestoreDatabaseId);
} catch {
  firestoreInstance = config.firestoreDatabaseId
    ? getFirestore(app, config.firestoreDatabaseId)
    : getFirestore(app);
}

export const db = firestoreInstance;
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, '_connection_test_', 'ping'));
    console.log('Firestore connection verified successfully.');
  } catch (error) {
    if (error instanceof Error && error.message.includes('offline')) {
      console.warn('Firestore database is not yet provisioned or currently unreachable. Running in resilient local storage mode.');
    }
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCode = (error as any)?.code;

  // As specified in SKILL.md Section 3:
  // "When a Firestore operation fails due to 'Missing or insufficient permissions',
  // you MUST catch the error and throw a new error with a very specific JSON object..."
  const isPermissionError =
    errorCode === 'permission-denied' ||
    errorMessage.toLowerCase().includes('permission') ||
    errorMessage.toLowerCase().includes('insufficient permissions') ||
    errorMessage.toLowerCase().includes('missing or insufficient');

  if (!isPermissionError) {
    console.warn(`Firestore operation ${operationType} on "${path}" notice:`, errorMessage);
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  firebaseSignOut,
  onAuthStateChanged,
  firebaseSendEmailVerification,
  firebaseSendPasswordResetEmail,
};
export type { FirebaseUser };
