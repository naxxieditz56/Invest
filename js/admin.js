// Admin Module
const admin = {
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
  
  // Get all users
  async getAllUsers(limit = 50, lastVisible = null) {
    try {
      let query = firebase.firestore().collection('users')
        .orderBy('createdAt', 'desc')
        .limit(limit);
      
      if (lastVisible) {
        query = query.startAfter(lastVisible);
      }
      
      const snapshot = await query.get();
      const users = [];
      
      snapshot.forEach(doc => {
        users.push({ id: doc.id, ...doc.data() });
      });
      
      return {
        users: users,
        lastVisible: snapshot.docs[snapshot.docs.length - 1]
      };
    } catch (error) {
      console.error('Error getting users:', error);
      return { users: [], lastVisible: null };
    }
  },
  
  // Update user
  async updateUser(userId, userData) {
    try {
      await firebase.firestore().collection('users').doc(userId).update({
        ...userData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: firebase.auth().currentUser.uid
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  // Adjust user balance
  async adjustBalance(userId, amount, reason) {
    try {
      const userRef = firebase.firestore().collection('users').doc(userId);
      
      await firebase.firestore().runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        const currentBalance = userDoc.data().wallet || 0;
        const newBalance = currentBalance + amount;
        
        transaction.update(userRef, { wallet: newBalance });
        
        // Log transaction
        await firebase.firestore().collection('transactions').add({
          userId: userId,
          type: 'admin_adjustment',
          amount: amount,
          balance: newBalance,
          description: reason || 'Manual balance adjustment',
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          adjustedBy: firebase.auth().currentUser.uid
        });
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  // Block/unblock user
  async toggleUserStatus(userId, status) {
    try {
      await firebase.firestore().collection('users').doc(userId).update({
        status: status,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  // Get all investments
  async getAllInvestments(limit = 50, status = null) {
    try {
      let query = firebase.firestore().collection('investments')
        .orderBy('startDate', 'desc')
        .limit(limit);
      
      if (status && status !== 'all') {
        query = query.where('status', '==', status);
      }
      
      const snapshot = await query.get();
      const investments = [];
      
      for (const doc of snapshot.docs) {
        const investment = { id: doc.id, ...doc.data() };
        
        // Get user details
        const userDoc = await firebase.firestore().collection('users').doc(investment.userId).get();
        if (userDoc.exists) {
          investment.userName = userDoc.data().username || userDoc.data().email;
        }
        
        investments.push(investment);
      }
      
      return investments;
    } catch (error) {
      console.error('Error getting investments:', error);
      return [];
    }
  },
  
  // Approve withdrawal
  async approveWithdrawal(withdrawalId) {
    try {
      const withdrawalRef = firebase.firestore().collection('withdrawals').doc(withdrawalId);
      const withdrawalDoc = await withdrawalRef.get();
      
      if (!withdrawalDoc.exists) throw new Error('Withdrawal not found');
      
      const withdrawal = withdrawalDoc.data();
      
      await firebase.firestore().runTransaction(async (transaction) => {
        transaction.update(withdrawalRef, {
          status: 'completed',
          approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
          approvedBy: firebase.auth().currentUser.uid
        });
        
        // Deduct from user wallet
        const userRef = firebase.firestore().collection('users').doc(withdrawal.userId);
        transaction.update(userRef, {
          wallet: firebase.firestore.FieldValue.increment(-withdrawal.amount)
        });
        
        // Update transaction record
        const transSnapshot = await firebase.firestore().collection('transactions')
          .where('userId', '==', withdrawal.userId)
          .where('type', '==', 'withdrawal')
          .where('amount', '==', withdrawal.amount)
          .where('status', '==', 'pending')
          .limit(1)
          .get();
        
        if (!transSnapshot.empty) {
          transaction.update(transSnapshot.docs[0].ref, {
            status: 'completed'
          });
        }
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  // Reject withdrawal
  async rejectWithdrawal(withdrawalId, reason) {
    try {
      const withdrawalRef = firebase.firestore().collection('withdrawals').doc(withdrawalId);
      
      await withdrawalRef.update({
        status: 'rejected',
        rejectionReason: reason,
        rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
        rejectedBy: firebase.auth().currentUser.uid
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  // Approve recharge
  async approveRecharge(rechargeId) {
    try {
      const rechargeRef = firebase.firestore().collection('recharges').doc(rechargeId);
      const rechargeDoc = await rechargeRef.get();
      
      if (!rechargeDoc.exists) throw new Error('Recharge not found');
      
      const recharge = rechargeDoc.data();
      
      await firebase.firestore().runTransaction(async (transaction) => {
        transaction.update(rechargeRef, {
          status: 'completed',
          approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
          approvedBy: firebase.auth().currentUser.uid
        });
        
        // Add to user wallet
        const userRef = firebase.firestore().collection('users').doc(recharge.userId);
        transaction.update(userRef, {
          wallet: firebase.firestore.FieldValue.increment(recharge.amount)
        });
        
        // Update transaction record
        const transSnapshot = await firebase.firestore().collection('transactions')
          .where('userId', '==', recharge.userId)
          .where('type', '==', 'recharge')
          .where('amount', '==', recharge.amount)
          .where('status', '==', 'pending')
          .limit(1)
          .get();
        
        if (!transSnapshot.empty) {
          transaction.update(transSnapshot.docs[0].ref, {
            status: 'completed'
          });
        }
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  // Create product
  async createProduct(productData) {
    try {
      await firebase.firestore().collection('products').add({
        ...productData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: firebase.auth().currentUser.uid
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  // Update product
  async updateProduct(productId, productData) {
    try {
      await firebase.firestore().collection('products').doc(productId).update({
        ...productData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: firebase.auth().currentUser.uid
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  // Get dashboard stats
  async getDashboardStats() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const [
        usersSnapshot,
        investmentsSnapshot,
        withdrawalsSnapshot,
        rechargesSnapshot,
        todayUsersSnapshot,
        todayInvestmentsSnapshot
      ] = await Promise.all([
        firebase.firestore().collection('users').get(),
        firebase.firestore().collection('investments').get(),
        firebase.firestore().collection('withdrawals').where('status', '==', 'pending').get(),
        firebase.firestore().collection('recharges').where('status', '==', 'pending').get(),
        firebase.firestore().collection('users').where('createdAt', '>=', today).get(),
        firebase.firestore().collection('investments').where('startDate', '>=', today).get()
      ]);
      
      let totalInvestment = 0;
      investmentsSnapshot.forEach(doc => {
        totalInvestment += doc.data().amount || 0;
      });
      
      return {
        totalUsers: usersSnapshot.size,
        activeUsers: 0, // Calculate based on investments
        totalInvestment: totalInvestment,
        pendingWithdrawals: withdrawalsSnapshot.size,
        pendingRecharges: rechargesSnapshot.size,
        todayUsers: todayUsersSnapshot.size,
        todayInvestments: todayInvestmentsSnapshot.size
      };
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      return null;
    }
  },
  
  // Export data
  async exportData(collection, startDate, endDate) {
    try {
      let query = firebase.firestore().collection(collection);
      
      if (startDate && endDate) {
        query = query.where('timestamp', '>=', new Date(startDate))
                     .where('timestamp', '<=', new Date(endDate));
      }
      
      const snapshot = await query.get();
      const data = [];
      
      snapshot.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() });
      });
      
      return data;
    } catch (error) {
      console.error('Error exporting data:', error);
      return [];
    }
  }
};

// Export module
window.admin = admin;
