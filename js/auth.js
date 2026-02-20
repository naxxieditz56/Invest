// Authentication Module
const auth = {
  currentUser: null,
  
  init() {
    firebase.auth().onAuthStateChanged((user) => {
      this.currentUser = user;
      if (user) {
        this.updateUserLastLogin(user.uid);
      }
    });
  },
  
  // Register new user
  async register(email, password, userData) {
    try {
      const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;
      
      // Generate unique referral code
      const referralCode = 'CAD' + Math.random().toString(36).substring(2, 8).toUpperCase();
      
      // Save user data to Firestore
      await firebase.firestore().collection('users').doc(user.uid).set({
        ...userData,
        email: email,
        referralCode: referralCode,
        wallet: 0,
        totalInvestment: 0,
        totalEarnings: 0,
        referrals: [],
        checkInStreak: 0,
        status: 'active',
        role: 'user',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Handle referral if provided
      if (userData.referredBy) {
        await this.processReferral(userData.referredBy, user.uid);
      }
      
      return { success: true, user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  // Login user
  async login(email, password) {
    try {
      const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
      await this.updateUserLastLogin(userCredential.user.uid);
      
      // Log login activity
      await this.logLoginActivity(userCredential.user.uid);
      
      return { success: true, user: userCredential.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  // Logout user
  async logout() {
    try {
      await firebase.auth().signOut();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  // Update last login
  async updateUserLastLogin(userId) {
    try {
      await firebase.firestore().collection('users').doc(userId).update({
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating last login:', error);
    }
  },
  
  // Log login activity
  async logLoginActivity(userId) {
    try {
      // Get IP and location info (using ipapi.co or similar service)
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();
      
      await firebase.firestore().collection('loginHistory').add({
        userId: userId,
        ip: data.ip,
        city: data.city,
        region: data.region,
        country: data.country_name,
        device: navigator.userAgent,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error('Error logging login activity:', error);
    }
  },
  
  // Process referral
  async processReferral(referralCode, newUserId) {
    try {
      // Find referrer
      const usersRef = firebase.firestore().collection('users');
      const snapshot = await usersRef.where('referralCode', '==', referralCode).get();
      
      if (!snapshot.empty) {
        const referrerDoc = snapshot.docs[0];
        const referrerId = referrerDoc.id;
        
        // Add to referrer's referrals list
        await usersRef.doc(referrerId).update({
          referrals: firebase.firestore.FieldValue.arrayUnion(newUserId)
        });
        
        // Update new user with referrer info
        await usersRef.doc(newUserId).update({
          referredBy: referrerId
        });
        
        // Give referral bonus (will be processed when new user invests)
        await firebase.firestore().collection('pendingReferralBonuses').add({
          referrerId: referrerId,
          referredId: newUserId,
          status: 'pending',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error processing referral:', error);
    }
  },
  
  // Reset password
  async resetPassword(email) {
    try {
      await firebase.auth().sendPasswordResetEmail(email);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  // Change password
  async changePassword(currentPassword, newPassword) {
    try {
      const user = firebase.auth().currentUser;
      const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
      
      await user.reauthenticateWithCredential(credential);
      await user.updatePassword(newPassword);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  // Check if user is admin
  async isAdmin(userId) {
    try {
      const doc = await firebase.firestore().collection('users').doc(userId).get();
      return doc.exists && (doc.data().role === 'admin' || doc.data().role === 'super_admin');
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  },
  
  // Get user data
  async getUserData(userId) {
    try {
      const doc = await firebase.firestore().collection('users').doc(userId).get();
      return doc.exists ? doc.data() : null;
    } catch (error) {
      console.error('Error getting user data:', error);
      return null;
    }
  }
};

// Initialize auth on load
document.addEventListener('DOMContentLoaded', () => {
  auth.init();
});
