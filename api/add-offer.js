import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method === "POST") {
    const { offerId, prizeId } = req.body;

    if (!offerId || !prizeId) {
      return res.status(400).json({ error: "offerId and prizeId are required" });
    }

    try {
      await db.collection("offer_mappings").doc(offerId).set({
        prizeId,
        createdAt: new Date(),
      });

      res.status(200).json({ success: true, message: "Mapping added successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
