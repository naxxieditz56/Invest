// Firebase Setup and Initialization Script

// Initialize Firestore with proper rules
const firestoreRules = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read: if request.auth != null;
    }
    
    // Products collection - public read, admin only write
    match /products/{product} {
      allow read: if true;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Investments collection
    match /investments/{investment} {
      allow read, write: if request.auth != null && 
        (request.auth.uid == resource.data.userId || 
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
    }
    
    // Transactions collection
    match /transactions/{transaction} {
      allow read: if request.auth != null && 
        (request.auth.uid == resource.data.userId ||
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
      allow write: if request.auth != null;
    }
    
    // Referrals collection
    match /referrals/{referral} {
      allow read, write: if request.auth != null;
    }
  }
}
`;

// Storage Rules
const storageRules = `
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
`;

// Database Rules for Realtime Database
const rtdbRules = {
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null",
    "investments": {
      ".indexOn": ["userId", "status"]
    },
    "transactions": {
      ".indexOn": ["userId", "timestamp"]
    },
    "users": {
      ".indexOn": ["email", "referralCode"]
    }
  }
};

// Sample initial products
const initialProducts = [
  {
    name: "Dairy Milk 1",
    price: 800,
    dailyProfit: 3250,
    totalIncome: 6500,
    days: 2,
    image: "https://via.placeholder.com/300x150/ff6b6b/ffffff?text=Dairy+Milk+1",
    active: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  },
  {
    name: "Dairy Milk 2",
    price: 1600,
    dailyProfit: 6500,
    totalIncome: 13000,
    days: 2,
    image: "https://via.placeholder.com/300x150/4facfe/ffffff?text=Dairy+Milk+2",
    active: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  },
  {
    name: "Dairy Milk 3",
    price: 3200,
    dailyProfit: 13000,
    totalIncome: 26000,
    days: 2,
    image: "https://via.placeholder.com/300x150/00f2fe/ffffff?text=Dairy+Milk+3",
    active: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }
];

// Function to initialize admin user
async function initializeAdmin() {
  const auth = firebase.auth();
  const db = firebase.firestore();
  
  try {
    // Create admin user
    const adminCredential = await auth.createUserWithEmailAndPassword(
      'admin@cadbury.com',
      'Admin@123456'
    );
    
    // Create admin document
    await db.collection('users').doc(adminCredential.user.uid).set({
      username: 'Super Admin',
      email: 'admin@cadbury.com',
      wallet: 0,
      role: 'admin',
      status: 'active',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('Admin user created successfully!');
    console.log('Email: admin@cadbury.com');
    console.log('Password: Admin@123456');
    
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      console.log('Admin user already exists');
    } else {
      console.error('Error creating admin:', error);
    }
  }
}

// Function to initialize products
async function initializeProducts() {
  const db = firebase.firestore();
  
  const snapshot = await db.collection('products').get();
  
  if (snapshot.empty) {
    for (const product of initialProducts) {
      await db.collection('products').add(product);
    }
    console.log('Initial products created!');
  }
}

// Call this function when setting up the app
async function setupFirebase() {
  await initializeAdmin();
  await initializeProducts();
  console.log('Firebase setup complete!');
  }
