import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  getAuth,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

function resolveRuntimeAuthDomain(): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    const host = window.location.hostname;
    if (
      host.endsWith('.run.app') ||
      host.endsWith('.firebaseapp.com') ||
      host.endsWith('.web.app')
    ) {
      return window.location.host;
    }
  }
  return firebaseConfig.authDomain;
}

const resolvedFirebaseConfig = {
  ...firebaseConfig,
  authDomain: resolveRuntimeAuthDomain(),
};

const app = initializeApp(resolvedFirebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

let authInstance: Auth;
try {
  // Prioritize browserLocalPersistence so auth state survives iOS Safari full-page redirects reliably
  authInstance = initializeAuth(app, {
    persistence: [
      browserLocalPersistence,
      indexedDBLocalPersistence,
      browserSessionPersistence,
    ],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
} catch {
  authInstance = getAuth(app);
}

export const auth = authInstance;
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const BOOTSTRAP_ADMIN_EMAIL = 'gggggdg072@gmail.com';

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('يرجى التحقق من إعدادات الاتصال بـ Firebase Firestore.');
    }
  }
}

void testConnection();
