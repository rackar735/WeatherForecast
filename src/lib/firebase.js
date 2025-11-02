import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAYpfzlPTSQ9wY3zco3pGSQRFMD1W0P2NM",
  authDomain: "weather-forecast-45196.firebaseapp.com",
  projectId: "weather-forecast-45196",
  storageBucket: "weather-forecast-45196.firebasestorage.app",
  messagingSenderId: "921161834821",
  appId: "1:921161834821:web:1d010ea3f72d3c7cc8de2c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
export default db;

export async function addSearchRecord({ city, country, temp, source }) {
  try {
    await addDoc(collection(db, "searches"), {
      city,
      country,
      temp,
      source,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn("addSearchRecord failed:", e);
  }
}

export async function getRecentSearches(max = 5) {
  const q = query(
    collection(db, "searches"),
    orderBy("createdAt", "desc"),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
