const admin = require('firebase-admin');
const fs = require('fs');
const csv = require('csv-parser');

// Initialize Firebase Admin with your service account key
const serviceAccount = require('./serviceAccountKey.json'); // Update this path
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Set the target season for this import batch
const TARGET_SEASON = '2025-2026';

// Helper function to read and parse a CSV file
const readCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
};

// Map to hold Player Names -> Firestore IDs for linking transactions
const playerMap = new Map();

async function importPlayers() {
  console.log(`Importing players for season: ${TARGET_SEASON}...`);
  const players = await readCSV('./players.csv');
  const batch = db.batch();

  players.forEach((row) => {
    const playerRef = db.collection('players').doc(); 
    
    const firstName = row['FIRST'] ? row['FIRST'].trim() : '';
    const lastName = row['LAST'] ? row['LAST'].trim() : '';
    const fullName = `${firstName} ${lastName}`.trim();

    // Store the generated ID in our map using the full name
    if (fullName) {
      playerMap.set(fullName.toLowerCase(), playerRef.id);
    }
    
    // Safely build the guardians array
    const guardians = [];
    if (row['GUARDIAN NAME 1']) {
      guardians.push({
        name: row['GUARDIAN NAME 1'].trim(),
        email: row['EMAIL 1'] ? row['EMAIL 1'].trim() : '',
        phone: row['CELL 1'] ? row['CELL 1'].trim() : ''
      });
    }
    if (row['GUARDIAN NAME 2']) {
      guardians.push({
        name: row['GUARDIAN NAME 2'].trim(),
        email: row['EMAIL 2'] ? row['EMAIL 2'].trim() : '',
        phone: row['CELL 2'] ? row['CELL 2'].trim() : ''
      });
    }

    // FIX: Safely strip the '#' sign before parsing the integer
    const rawJersey = row['JERSEY #'] ? String(row['JERSEY #']).replace(/#/g, '').trim() : '';
    const jerseyNumber = parseInt(rawJersey, 10) || null;

    batch.set(playerRef, {
      firstName,
      lastName,
      jerseyNumber,
      medicalRelease: row['MED RELEASE'] === 'TRUE',
      reePlayerWaiver: row['REEPLAYER'] === 'TRUE',
      status: 'active',
      guardians,
      // Create the new seasonal profile structure mapped to the target season
      seasonProfiles: {
        [TARGET_SEASON]: { 
          feeWaived: false,
          baseFee: 750 // Initializes the baseline budget fee expectation
        }
      }
    });
  });

  await batch.commit();
  console.log(`Players imported successfully. Mapped ${playerMap.size} players for transaction linking.`);
}

async function importTransactions() {
  console.log(`Importing transactions for season: ${TARGET_SEASON}...`);
  const transactions = await readCSV('./transactions.csv');
  
  const chunks = [];
  // Firestore batches are limited to 500 operations
  for (let i = 0; i < transactions.length; i += 490) {
    chunks.push(transactions.slice(i, i + 490));
  }

  for (const chunk of chunks) {
    const batch = db.batch();

    chunk.forEach((row) => {
      const txRef = db.collection('transactions').doc();
      
      const dateKey = Object.keys(row).find(key => key.includes('Date')) || 'Date';
      const rawDate = row[dateKey];
      
      let firestoreDate = null;
      if (rawDate) {
        const cleanDate = rawDate.replace(/"/g, '').trim();
        const safeDateString = cleanDate.includes('-') 
          ? `${cleanDate}T12:00:00` 
          : `${cleanDate} 12:00:00`;
          
        firestoreDate = admin.firestore.Timestamp.fromDate(new Date(safeDateString));
      }

      // Lookup the generated Player ID
      const rawName = (row['Name'] || '').trim();
      const mappedPlayerId = playerMap.get(rawName.toLowerCase()) || '';

      const isCleared = row['Received/Paid'] === 'True' || row['Received/Paid'] === 'TRUE' || row['Received/Paid'] === 'TRUE\r';

      batch.set(txRef, {
        date: firestoreDate,
        seasonId: TARGET_SEASON,
        split: (row['Season'] || '').trim(),
        playerName: rawName, 
        playerId: mappedPlayerId, 
        type: (row['Type'] || '').trim(),
        category: (row['Category'] || '').trim(),
        title: (row['Title'] || '').trim(),
        amount: parseFloat(row['Payment']) || 0,
        notes: (row['Notes'] || '').trim(),
        cleared: isCleared,
        distributed: false 
      });
    });
    await batch.commit();
  }
  
  console.log('Transactions imported successfully.');
}

async function runImport() {
  try {
    await importPlayers();
    await importTransactions();
    console.log('All data imported and linked successfully into 2025-2026!');
    process.exit(0);
  } catch (error) {
    console.error('Error importing data: ', error);
    process.exit(1);
  }
}

runImport();