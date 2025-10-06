import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, "base64").toString("utf8")
);

// ✅ تهيئة Firebase Admin مرة واحدة فقط
if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  try {
    const { key, secret } = req.query;

    // ✅ تحقق من السر القادم من OGAds (أمان)
    if (secret !== process.env.POSTBACK_SECRET) {
      return res.status(403).json({ success: false, error: "Invalid secret" });
    }

    if (!key) {
      return res.status(400).json({ success: false, error: "Missing key" });
    }

    // ✅ تحديث verified إلى true
    const participantRef = db.collection("participants").doc(key);
    const docSnap = await participantRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ success: false, error: "Key not found" });
    }

    await participantRef.update({
      verified: true,
      verifiedAt: new Date().toISOString(),
    });

    console.log(`✅ Updated participant ${key} -> verified: true`);
    return res.json({ success: true, message: `Participant ${key} verified.` });
  } catch (error) {
    console.error("❌ Error updating participant:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
