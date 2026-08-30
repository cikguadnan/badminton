import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { auth, db, googleProvider } from './firebase.js';

export async function loginWithGoogle() {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error) {
    if (error?.code === 'auth/popup-blocked' || error?.code === 'auth/cancelled-popup-request') {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw error;
  }
}

export async function completeRedirectLogin() {
  return getRedirectResult(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function logout() {
  await signOut(auth);
}

export async function getUserRole(user) {
  if (!user?.email) return 'player';
  const teacherRef = doc(db, 'teachers', user.email.toLowerCase());
  const snapshot = await getDoc(teacherRef);
  if (snapshot.exists() && snapshot.data()?.active !== false) return 'coach';
  return 'player';
}
