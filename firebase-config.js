// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBab6ywdHWdBpxE15ZqYsqHqdWwPTpC-QE",
  authDomain: "dieta-estate-2026.firebaseapp.com",
  projectId: "dieta-estate-2026",
  storageBucket: "dieta-estate-2026.firebasestorage.app",
  messagingSenderId: "656853678719",
  appId: "1:656853678719:web:57a8fb9b2eeeb748c0dd4a"
};

// Initialize Firebase (compat mode)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();
