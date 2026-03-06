const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const TARGET_SEASON = "2025-2026";

async function runMigration() {
  console.log(`🚀 Starting migration for Season: ${TARGET_SEASON}...`);

  try {
    // 1. Ensure the Season document exists
    const seasonRef = db.collection('seasons').doc(TARGET_SEASON);
    await seasonRef.set({
      name: TARGET_SEASON,
      status: 'active',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`✅ Season ${TARGET_SEASON} initialized.`);

    // 2. Migrate Players
    const playersSnapshot = await db.collection('players').get();
    const playerPromises = playersSnapshot.docs.map(async (playerDoc) => {
      const data = playerDoc.data();
      
      // Prep the seasonal profile from existing flat data
      const seasonalProfile = {
        status: data.status || 'active',
        baseFee: data.financials?.baseFee ?? 750
      };

      return playerDoc.ref.update({
        [`seasonProfiles.${TARGET_SEASON}`]: seasonalProfile
      });
    });

    await Promise.all(playerPromises);
    console.log(`✅ ${playerPromises.length} players migrated to seasonal profiles.`);

    // 3. Migrate Transactions
    const txSnapshot = await db.collection('transactions').get();
    let txCount = 0;
    const txPromises = txSnapshot.docs.map(async (txDoc) => {
      const data = txDoc.data();
      
      // Only tag transactions that don't have a seasonId yet
      if (!data.seasonId) {
        txCount++;
        return txDoc.ref.update({
          seasonId: TARGET_SEASON
        });
      }
    });

    await Promise.all(txPromises);
    console.log(`✅ ${txCount} transactions tagged with seasonId: ${TARGET_SEASON}.`);

    console.log("\n✨ Migration Complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();