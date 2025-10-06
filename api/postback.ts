// pages/api/postback.ts
import type { NextApiRequest, NextApiResponse } from "next";
import * as admin from "firebase-admin";

type Data = { success: boolean; message?: string };

function initFirebaseAdmin() {
  if (admin.apps && admin.apps.length) return;

  // نقبل إما JSON مكشوف في FIREBASE_ADMIN_KEY أو Base64 في FIREBASE_ADMIN_KEY_B64
  const b64 = process.env.FIREBASE_ADMIN_KEY_B64;
  const raw = process.env.FIREBASE_ADMIN_KEY;

  let serviceAccount: any = null;
  if (b64) {
    const json = Buffer.from(b64, "base64").toString("utf8");
    serviceAccount = JSON.parse(json);
  } else if (raw) {
    serviceAccount = JSON.parse(raw);
  } else {
    throw new Error(
      "Firebase service account not found. Set FIREBASE_ADMIN_KEY or FIREBASE_ADMIN_KEY_B64 in env."
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  try {
    initFirebaseAdmin();
  } catch (err: any) {
    console.error("Init Firebase error:", err);
    return res.status(500).json({ success: false, message: "Firebase init error" });
  }

  // ------------------------------------------------
  // 1) مصادقة بسيطة (اختياري، لكن أنصح به)
  // ------------------------------------------------
  const expectedToken = process.env.POSTBACK_SECRET; // ضع هذا في Vercel env
  if (expectedToken) {
    const tokenFromQuery = (req.query.token as string) || "";
    const tokenFromHeader = (req.headers["x-postback-token"] as string) || "";
    if (tokenFromQuery !== expectedToken && tokenFromHeader !== expectedToken) {
      console.warn("Postback rejected: bad token");
      return res.status(403).json({ success: false, message: "Invalid token" });
    }
  }

  // ------------------------------------------------
  // 2) استخراج الـ key من query أو body (sub_id / key / pubkey)
  // ------------------------------------------------
  const q = req.query || {};
  let key =
    (q.key as string) ||
    (q.sub_id as string) ||
    (q.pubkey as string) ||
    (req.body && (req.body.key || req.body.sub_id || req.body.pubkey));

  // إذا body هو raw string (x-www-form-urlencoded) حاول تفكيكه
  if (!key && typeof req.body === "string" && req.body.includes("=")) {
    // تحويل simple form-urlencoded إلى كائن
    const params = new URLSearchParams(req.body);
    key = params.get("key") || params.get("sub_id") || params.get("pubkey") || undefined;
  }

  if (!key) {
    console.warn("Missing key in postback");
    return res.status(400).json({ success: false, message: "Missing key (sub_id/key)" });
  }

  try {
    const db = admin.firestore();

    // 1) حاول تحديث مباشرةً مستند ID = key
    const docRef = db.collection("participants").doc(key);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      await docRef.update({
        verified: true,
        completed: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`Verified by docId: ${key}`);
      return res.status(200).json({ success: true, message: "Verified (by docId)" });
    }

    // 2) إن لم يوجد، حاول البحث عن مستند يحتوي الحقل key == value
    const qSnap = await db
      .collection("participants")
      .where("key", "==", key)
      .limit(1)
      .get();

    if (!qSnap.empty) {
      const docFound = qSnap.docs[0];
      await docFound.ref.update({
        verified: true,
        completed: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`Verified by field key: ${docFound.id}`);
      return res.status(200).json({ success: true, message: "Verified (by field key)" });
    }

    // إذا لم نجد أي شيء
    console.warn("Participant not found for key:", key);
    return res.status(404).json({ success: false, message: "Participant not found" });
  } catch (err: any) {
    console.error("Postback handler error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}
