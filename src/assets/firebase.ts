// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCK5fhexrrvBmiXFZN_i_ooXGVEVGWbvMY",
  authDomain: "bjj-inhouse.firebaseapp.com",
  projectId: "bjj-inhouse",
  storageBucket: "bjj-inhouse.firebasestorage.app",
  messagingSenderId: "940506254692",
  appId: "1:940506254692:web:9af419ae2837c7faec7e71"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
