import admin from "firebase-admin";

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8")
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  try {
    // نسمح فقط بالطلبات GET أو POST من OGAds أو أي شبكة
    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // استقبال البيانات من postback
    const { payout, secret } = req.query;

    // دعم جميع أسماء المفاتيح المحتملة من OGAds أو LockedApp
    const key =
      req.query.key ||
      req.query.sub1 ||
      req.query.subid ||
      req.query.uid ||
      req.query.sub_id;

    // تحقق من السر لحماية الرابط
    if (secret !== process.env.POSTBACK_SECRET) {
      return res.status(403).json({ error: "Invalid secret" });
    }

    if (!key) {
      return res.status(400).json({ error: "Missing key" });
    }

    // جلب المستند من Firestore
    const docRef = db.collection("participants").doc(key);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: "Key not found" });
    }

    // تحديث verified + payout
    await docRef.update({
      verified: true,
      payout: payout ? parseFloat(payout) : 0,
      verifiedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      message: "✅ Participant verified successfully",
      key,
      payout: payout || 0,
    });
  } catch (error) {
    console.error("❌ Error verifying participant:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
