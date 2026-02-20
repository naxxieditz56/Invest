// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC4nik_P57h9Ks8ryj0pG2xYNX-ePXKXtY",
  authDomain: "shoes-shopping-app-6a1d3.firebaseapp.com",
  databaseURL: "https://shoes-shopping-app-6a1d3-default-rtdb.firebaseio.com",
  projectId: "shoes-shopping-app-6a1d3",
  storageBucket: "shoes-shopping-app-6a1d3.appspot.com",
  messagingSenderId: "816065792865",
  appId: "1:816065792865:web:b1d58fab547f98e4961320",
  measurementId: "G-7BVQVYSMDF"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const rtdb = firebase.database();

// Enable persistence
db.enablePersistence()
  .catch((err) => {
    if (err.code == 'failed-precondition') {
      console.log('Persistence failed');
    } else if (err.code == 'unimplemented') {
      console.log('Persistence not available');
    }
  });
