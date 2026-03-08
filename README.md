# ⚽ NOLA DFC Team Manager

A comprehensive, real-time web application designed to manage the finances, rosters, and schedules for the NOLA DFC youth soccer team. Built with React, Vite, and Firebase, this app eliminates spreadsheets and provides a unified dashboard for both Team Managers and Parents.

## 🎯 Key Features

### 💰 Dynamic Budgeting & Fee Calculation
* **Seasonal Budgeting:** Create new seasons, clone past budgets, and itemize projected expenses.
* **Auto-Calculated Fees:** Import a roster and let the app automatically divide projected costs + contingency buffers into a rounded per-player fee.
* **Waiver Management:** Exempt specific players from team fees. The system instantly recalculates the financial burden for the rest of the team.
* **Finalization Lock:** Once a budget is finalized, fees are permanently applied to player profiles and the budget is locked from accidental edits.

### 🌊 Automated "Waterfall" Distributions
* **Sponsorships & Fundraising:** Log bulk deposits into the team ledger.
* **Smart Distribution:** The custom Waterfall Engine applies credits to a specific player up to their *exact remaining balance*. Any leftover funds automatically cascade into the Team Pool to benefit the rest of the active roster.
* **Receipt Grouping:** View clear, batch-grouped receipts of exactly how a specific fundraiser was divided among the team.

### 📅 Smart Scheduling
* **iCal Integration:** Automatically fetches and parses live schedule data directly from the Ollie Sports iCal feed.
* **Blackout Dates:** Managers can mark specific days as "Blackout Dates" which sync to Firestore and visually update the calendar for all parents.
* **Public/Private Views:** Parents can view the schedule securely without logging in, with fallback logic to hide restricted internal data.

### 👥 Roster & Compliance Management
* **Player Profiles:** Track jersey numbers, active/archived status, and multiple guardians per player.
* **Compliance Tracking:** One-click toggles for Medical Releases and ReePlayer Waivers.
* **Parent Portal:** Parents only see the financials and balances for their own children.

---

## 🛠️ Tech Stack

* **Frontend:** React 18, Vite
* **Styling:** Tailwind CSS, Lucide React Icons
* **Backend / Database:** Firebase Firestore
* **Authentication:** Firebase Auth (Google / Email)
* **Utilities:** `ical.js` (Calendar Parsing)

---

## 🚀 Quick Start

### 1. Prerequisites
Ensure you have Node.js installed.
```bash
node -v
npm -v
```

### 2. Install Dependencies

```bash
git clone [https://github.com/yourusername/nola-dfc-manager.git](https://github.com/yourusername/nola-dfc-manager.git)
cd nola-dfc-manager
npm install
```

### 3. Environment Setup
Create a .env.local file in the root directory and add your Firebase configuration:
```bash
VITE_FIREBASE_API_KEY="your-api-key"
VITE_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-project"
VITE_FIREBASE_STORAGE_BUCKET="your-project.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
VITE_FIREBASE_APP_ID="your-app-id"
* Note: Ensure your local development URL (e.g., http://localhost:5173/*) is whitelisted in Google Cloud API Credentials and Firebase Auth Authorized Domains.
```

### 4. Run the Development Server
```bash
npm run dev
```

---

## 🔐 Firebase Security Rules
To ensure data privacy between Managers and Parents, deploy the following Firestore security rules:
```bash
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    function isAuth() {
      return request.auth != null;
    }

    function isManager() {
      return isAuth() && (
        request.auth.token.email == 'jonny5v@gmail.com' ||
        request.auth.token.email == 'lauren.willie@gmail.com'
      );
    }

    // 1. Players & Ledger
    match /players/{document=**} {
      allow read: if isAuth();
      allow write: if isManager();
    }
    match /transactions/{document=**} {
      allow read: if isAuth();
      allow write: if isManager();
    }

    // 2. Budget & Seasons
    match /seasons/{document=**} {
      allow read: if isAuth();
      allow write: if isManager();
    }
    
    // 3. Schedule (Public Read Allowed)
    match /blackouts/{document=**} {
      allow read: if true; 
      allow write: if isManager();
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 🧠 Core Architecture Documentation

### The Waterfall Engine (useFinance.js)
The most complex logic in the app governs how external money (fundraising/sponsors) is applied to player fees.
1. The Cap: It calculates the target player's exact remaining balance in real-time.
2. The Fill: It applies the credit only up to that balance.
3. The Spillover: Any remaining funds are collected and divided evenly among all other active, non-waived players.
4. The Loop: It iteratively applies these fractional funds, dropping players out of the distribution pool if their balances hit $0.00, until the money is completely spent.
5. Team Pool: Any absolute remainder (if the whole team is paid off) is credited to a generic "Team Pool".

### Financial Aggregation (PlayerModal.jsx)
A player's balance is dynamically computed on the fly by combining their seasonProfiles.[seasonId].baseFee with a filtered reduction of all cleared transactions linked to their ID. If a player's feeWaived boolean is set to true by the Budgeting tool, the engine forces their baseFee to $0, ensuring they do not show a false negative balance even if accidental charges are logged.

### Optimistic UI & Toast Actions
The application relies heavily on Optimistic UI updates. When a Manager toggles a waiver or compliance switch, the UI updates instantly while the Firestore updateDoc runs in the background. Errors gracefully revert the UI. Deletions and sensitive toggles trigger a custom asynchronous Confirmation Modal and Toast system that supports recursive "Undo" actions.