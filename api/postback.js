import admin from "firebase-admin";

// تحميل مفاتيح Firebase من بيئة Vercel (Environment Variables)
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
  try {
    // البيانات من OGAds
    const { offer_id, subid } = req.query;

    if (!offer_id || !subid) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    // ابحث عن الـ prizeId من جدول offer_mappings
    const snapshot = await db
      .collection("offer_mappings")
      .where("offerId", "==", offer_id)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: "Offer not found" });
    }

    const prizeId = snapshot.docs[0].data().prizeId;

    // خزّن المستخدم مع الـ prizeId
    await db.collection("winners").add({
      email: subid,
      prizeId: prizeId,
      date: new Date(),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}
