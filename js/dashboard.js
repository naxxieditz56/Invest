// Dashboard Module
const dashboard = {
  // Load user dashboard data
  async loadUserDashboard(userId) {
    try {
      const userData = await auth.getUserData(userId);
      if (!userData) return null;
      
      // Get investments
      const investments = await this.getUserInvestments(userId);
      
      // Get recent transactions
      const transactions = await this.getRecentTransactions(userId);
      
      // Get check-in status
      const checkInStatus = await this.getCheckInStatus(userId);
      
      return {
        user: userData,
        investments: investments,
        transactions: transactions,
        checkIn: checkInStatus
      };
    } catch (error) {
      console.error('Error loading dashboard:', error);
      return null;
    }
  },
  
  // Get user investments
  async getUserInvestments(userId) {
    try {
      const snapshot = await firebase.firestore().collection('investments')
        .where('userId', '==', userId)
        .orderBy('startDate', 'desc')
        .get();
      
      const investments = [];
      snapshot.forEach(doc => {
        investments.push({ id: doc.id, ...doc.data() });
      });
      
      return investments;
    } catch (error) {
      console.error('Error getting investments:', error);
      return [];
    }
  },
  
  // Get recent transactions
  async getRecentTransactions(userId, limit = 10) {
    try {
      const snapshot = await firebase.firestore().collection('transactions')
        .where('userId', '==', userId)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();
      
      const transactions = [];
      snapshot.forEach(doc => {
        transactions.push({ id: doc.id, ...doc.data() });
      });
      
      return transactions;
    } catch (error) {
      console.error('Error getting transactions:', error);
      return [];
    }
  },
  
  // Get check-in status
  async getCheckInStatus(userId) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const snapshot = await firebase.firestore().collection('checkins')
        .where('userId', '==', userId)
        .where('date', '>=', today)
        .get();
      
      return {
        checkedInToday: !snapshot.empty,
        streak: 0 // Will be fetched from user data
      };
    } catch (error) {
      console.error('Error getting check-in status:', error);
      return { checkedInToday: false, streak: 0 };
    }
  },
  
  // Calculate total earnings
  calculateTotalEarnings(investments) {
    return investments.reduce((total, inv) => total + (inv.profitPaid || 0), 0);
  },
  
  // Calculate active investments
  getActiveInvestments(investments) {
    return investments.filter(inv => inv.status === 'active');
  },
  
  // Format currency
  formatCurrency(amount) {
    return '₹' + amount.toLocaleString('en-IN');
  },
  
  // Format date
  formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }
};

// Investment Module
const investment = {
  // Create new investment
  async createInvestment(userId, productId, quantity) {
    try {
      // Get product details
      const productDoc = await firebase.firestore().collection('products').doc(productId).get();
      if (!productDoc.exists) throw new Error('Product not found');
      
      const product = productDoc.data();
      const totalAmount = product.price * quantity;
      
      // Check user balance
      const userDoc = await firebase.firestore().collection('users').doc(userId).get();
      const userBalance = userDoc.data().wallet || 0;
      
      if (userBalance < totalAmount) {
        throw new Error('Insufficient balance');
      }
      
      // Calculate end date
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + product.days);
      
      // Create investment record
      const investmentData = {
        userId: userId,
        productId: productId,
        productName: product.name,
        quantity: quantity,
        amount: totalAmount,
        dailyProfit: product.dailyProfit * quantity,
        totalIncome: product.totalIncome * quantity,
        days: product.days,
        startDate: startDate,
        endDate: endDate,
        status: 'active',
        profitPaid: 0,
        lastProfitDate: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      const investmentRef = await firebase.firestore().collection('investments').add(investmentData);
      
      // Deduct from wallet
      await firebase.firestore().collection('users').doc(userId).update({
        wallet: firebase.firestore.FieldValue.increment(-totalAmount),
        totalInvestment: firebase.firestore.FieldValue.increment(totalAmount)
      });
      
      // Create transaction record
      await firebase.firestore().collection('transactions').add({
        userId: userId,
        type: 'investment',
        amount: totalAmount,
        status: 'completed',
        description: `Invested in ${product.name} (${quantity} unit${quantity > 1 ? 's' : ''})`,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Process referral bonus if applicable
      await this.processReferralBonus(userId, totalAmount);
      
      return { success: true, investmentId: investmentRef.id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  // Process referral bonus
  async processReferralBonus(userId, investmentAmount) {
    try {
      // Get user's referrer
      const userDoc = await firebase.firestore().collection('users').doc(userId).get();
      const referredBy = userDoc.data().referredBy;
      
      if (!referredBy) return;
      
      // Get referral settings
      const settingsDoc = await firebase.firestore().collection('settings').doc('referral').get();
      const settings = settingsDoc.exists ? settingsDoc.data() : { level1: 5, level2: 3, level3: 1 };
      
      // Calculate bonus
      const bonusAmount = (investmentAmount * settings.level1) / 100;
      
      // Add bonus to referrer
      await firebase.firestore().collection('users').doc(referredBy).update({
        wallet: firebase.firestore.FieldValue.increment(bonusAmount),
        totalEarnings: firebase.firestore.FieldValue.increment(bonusAmount)
      });
      
      // Create transaction record
      await firebase.firestore().collection('transactions').add({
        userId: referredBy,
        type: 'referral_bonus',
        amount: bonusAmount,
        status: 'completed',
        description: `Referral bonus from investment`,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Check for level 2 referral
      const referrerDoc = await firebase.firestore().collection('users').doc(referredBy).get();
      const level2Referrer = referrerDoc.data().referredBy;
      
      if (level2Referrer) {
        const level2Bonus = (investmentAmount * settings.level2) / 100;
        
        await firebase.firestore().collection('users').doc(level2Referrer).update({
          wallet: firebase.firestore.FieldValue.increment(level2Bonus),
          totalEarnings: firebase.firestore.FieldValue.increment(level2Bonus)
        });
        
        await firebase.firestore().collection('transactions').add({
          userId: level2Referrer,
          type: 'referral_bonus',
          amount: level2Bonus,
          status: 'completed',
          description: `Level 2 referral bonus`,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error processing referral bonus:', error);
    }
  },
  
  // Process daily profits
  async processDailyProfits() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Get all active investments
      const snapshot = await firebase.firestore().collection('investments')
        .where('status', '==', 'active')
        .get();
      
      const batch = firebase.firestore().batch();
      
      snapshot.forEach(doc => {
        const investment = doc.data();
        const lastProfit = investment.lastProfitDate ? investment.lastProfitDate.toDate() : null;
        
        // Check if profit already processed today
        if (!lastProfit || lastProfit < today) {
          // Add profit
          batch.update(doc.ref, {
            profitPaid: firebase.firestore.FieldValue.increment(investment.dailyProfit),
            lastProfitDate: today
          });
          
          // Add to user wallet
          const userRef = firebase.firestore().collection('users').doc(investment.userId);
          batch.update(userRef, {
            wallet: firebase.firestore.FieldValue.increment(investment.dailyProfit),
            totalEarnings: firebase.firestore.FieldValue.increment(investment.dailyProfit)
          });
          
          // Create transaction record
          const transRef = firebase.firestore().collection('transactions').doc();
          batch.set(transRef, {
            userId: investment.userId,
            type: 'profit',
            amount: investment.dailyProfit,
            status: 'completed',
            description: `Daily profit from ${investment.productName}`,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      });
      
      await batch.commit();
      return { success: true };
    } catch (error) {
      console.error('Error processing daily profits:', error);
      return { success: false, error: error.message };
    }
  }
};

// Wallet Module
const wallet = {
  // Get balance
  async getBalance(userId) {
    try {
      const doc = await firebase.firestore().collection('users').doc(userId).get();
      return doc.exists ? doc.data().wallet || 0 : 0;
    } catch (error) {
      console.error('Error getting balance:', error);
      return 0;
    }
  },
  
  // Add funds (recharge)
  async addFunds(userId, amount, paymentMethod) {
    try {
      const rechargeData = {
        userId: userId,
        amount: amount,
        paymentMethod: paymentMethod,
        status: 'pending',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await firebase.firestore().collection('recharges').add(rechargeData);
      
      // Create transaction record
      await firebase.firestore().collection('transactions').add({
        userId: userId,
        type: 'recharge',
        amount: amount,
        status: 'pending',
        description: `Recharge via ${paymentMethod}`,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  // Request withdrawal
  async requestWithdrawal(userId, amount, method, paymentDetails) {
    try {
      // Check balance
      const balance = await this.getBalance(userId);
      if (balance < amount) {
        throw new Error('Insufficient balance');
      }
      
      const withdrawalData = {
        userId: userId,
        amount: amount,
        method: method,
        paymentDetails: paymentDetails,
        status: 'pending',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await firebase.firestore().collection('withdrawals').add(withdrawalData);
      
      // Create transaction record
      await firebase.firestore().collection('transactions').add({
        userId: userId,
        type: 'withdrawal',
        amount: amount,
        status: 'pending',
        description: `Withdrawal via ${method}`,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Check-in Module
const checkin = {
  // Perform daily check-in
  async checkIn(userId) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Check if already checked in today
      const existing = await firebase.firestore().collection('checkins')
        .where('userId', '==', userId)
        .where('date', '>=', today)
        .get();
      
      if (!existing.empty) {
        throw new Error('Already checked in today');
      }
      
      // Get user's current streak
      const userDoc = await firebase.firestore().collection('users').doc(userId).get();
      const currentStreak = userDoc.data().checkInStreak || 0;
      
      // Calculate reward based on streak
      let reward = 10; // Base reward
      if (currentStreak >= 30) reward = 500;
      else if (currentStreak >= 15) reward = 100;
      else if (currentStreak >= 7) reward = 50;
      
      // Create check-in record
      await firebase.firestore().collection('checkins').add({
        userId: userId,
        date: today,
        reward: reward,
        streak: currentStreak + 1,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Update user streak and wallet
      await firebase.firestore().collection('users').doc(userId).update({
        checkInStreak: firebase.firestore.FieldValue.increment(1),
        wallet: firebase.firestore.FieldValue.increment(reward),
        lastCheckIn: today
      });
      
      // Create transaction record
      await firebase.firestore().collection('transactions').add({
        userId: userId,
        type: 'checkin_bonus',
        amount: reward,
        status: 'completed',
        description: `Day ${currentStreak + 1} check-in bonus`,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      return { success: true, reward: reward };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Export modules
window.dashboard = dashboard;
window.investment = investment;
window.wallet = wallet;
window.checkin = checkin;
