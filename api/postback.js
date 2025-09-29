import admin from "firebase-admin";

const COLLECTION = process.env.FIREBASE_COLLECTION || "ogads_completed";

// احضار حساب الخدمة من متغير البيئة (Base64)
function getServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) return null;
  try {
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch (e) {
    console.error("Invalid FIREBASE_SERVICE_ACCOUNT_BASE64:", e);
    return null;
  }
}

// تهيئة Firebase Admin لمرة واحدة
if (!admin.apps.length) {
  const sa = getServiceAccount();
  if (sa) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id
    });
  } else {
    console.warn("No service account loaded — Firestore won't work until env var is set.");
  }
}

export default async function handler(req, res) {
  try {
    // OGAds قد يرسل GET أو POST
    const params = req.method === "GET" ? req.query : (req.body || {});
    // أمان: تحقق من secret (موجود في إعدادات Vercel)
    const secret = process.env.POSTBACK_SECRET || "";
    const incomingSecret = (params.secret || req.headers["x-postback-secret"] || "").toString();
    if (secret && incomingSecret !== secret) {
      console.warn("Invalid postback secret:", incomingSecret);
      return res.status(403).send("Forbidden");
    }

    const email = (params.subid || params.email || "").toString().trim();
    if (!email) return res.status(400).send("Missing subid/email");

    const offerId = params.offer_id || params.offer || null;
    const payout = params.payout || null;
    const txId = params.tx_id || params.transaction || params.txid || null;

    const db = admin.firestore();

    // dedupe: استخدم txId إن وُجد (أفضل) وإلا استخدم مركب email+offerId
    const makeId = (s) => encodeURIComponent(String(s));
    const docId = txId ? makeId(txId) : `${makeId(email)}_${makeId(offerId || Date.now())}`;

    // لو txId متوفر، تفقد ما إذا سبق وتم تسجيله لتفادي التكرار
    if (txId) {
      const existing = await db.collection(COLLECTION).doc(docId).get();
      if (existing.exists) {
        console.log("Duplicate txId, ignoring:", txId);
        // IMPORTANT: يفضل إرجاع 200 حتى لا يعيد OGAds المحاولة.
        return res.status(200).send("ok");
      }
    }

    await db.collection(COLLECTION).doc(docId).set({
      email,
      offerId,
      payout: payout ? Number(payout) : null,
      txId: txId || null,
      params,
      receivedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log("Saved postback:", { docId, email, offerId, payout });
    return res.status(200).send("ok");
  } catch (err) {
    console.error("Postback error:", err);
    return res.status(500).send("error");
  }
}
