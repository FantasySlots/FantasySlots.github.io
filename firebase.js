// For Firebase JS SDK v9.15.0 and later
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCJAJKkiwfDoGfI8CzWK2kkJRwo55yDvOc",
  authDomain: "nfl-fantasy-slots.firebaseapp.com",
  databaseURL: "https://nfl-fantasy-slots-default-rtdb.firebaseio.com",
  projectId: "nfl-fantasy-slots",
  storageBucket: "nfl-fantasy-slots.appspot.com",
  messagingSenderId: "516330061675",
  appId: "1:516330061675:web:829f14031afef0bccc962e",
  measurementId: "G-RH80H7FNQ4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);