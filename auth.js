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

function normalizeRole(value) {
  const role = String(value || '').toLowerCase();
  if (role === 'teacher') return 'teacher';
  if (role === 'coach') return 'coach';
  if (role === 'captain') return 'captain';
  return 'player';
}

export async function getUserRole(user) {
  if (!user?.email || !user?.uid) return 'player';

  // V3.8: users/{uid}.role is the live role source once a profile exists.
  const userProfile = await getDoc(doc(db, 'users', user.uid));
  if (userProfile.exists()) return normalizeRole(userProfile.data()?.role);

  // Backward compatibility for staff who have not yet created a V3 user profile.
  const staffRef = doc(db, 'teachers', user.email.toLowerCase());
  const snapshot = await getDoc(staffRef);
  if (!snapshot.exists() || snapshot.data()?.active === false) return 'player';
  const staffRole = String(snapshot.data()?.role || '').toLowerCase();
  return staffRole === 'coach' ? 'coach' : 'teacher';
}
