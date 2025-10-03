// netlify/functions/postback.js
import admin from "firebase-admin";

const REG_COLLECTION = process.env.FIREBASE_REG_COLLECTION || "registrations";
const MAPPINGS_COLLECTION = process.env.FIREBASE_MAPPINGS_COLLECTION || "offer_mappings";

// قراءة service account من متغير بيئة Base64
function getServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) return null;
  try {
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch (e) {
    console.error("Invalid FIREBASE_SERVICE_ACCOUNT_BASE64", e);
    return null;
  }
}

if (!admin.apps.length) {
  const sa = getServiceAccount();
  if (sa) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id
    });
  } else {
    console.warn("No service account — Firestore calls will fail.");
  }
}

export async function handler(event) {
  try {
    const secret = process.env.POSTBACK_SECRET || "";
    // قراءة الباراميترات (OGAds عادة يرسل GET)
    const params = event.queryStringParameters || {};
    // إذا POST وجاء JSON في body
    if (event.body && !Object.keys(params).length && event.headers["content-type"]?.includes("application/json")) {
      Object.assign(params, JSON.parse(event.body));
    }

    // تحقق أمني بسيط
    if (secret) {
      const incoming = (params.secret || event.headers["x-postback-secret"] || "").toString();
      if (incoming !== secret) {
        console.warn("Invalid secret from:", event.headers["x-forwarded-for"] || "unknown");
        return { statusCode: 403, body: "Forbidden" };
      }
    }

    const email = (params.subid || params.email || "").toString().trim();
    if (!email) return { statusCode: 400, body: "Missing subid/email" };

    // offer id يأتي بأسماء مختلفة بحسب الشبكة: offer_id, offerid, campaign_id, offer
    const offerId = (params.offer_id || params.offerid || params.campaign_id || params.offer || "").toString();
    const txId = (params.tx_id || params.transaction || params.txid || "").toString() || null;
    const payout = params.payout || null;

    const db = admin.firestore();

    // 1) البحث عن mapping: ogadsOfferId == offerId
    let prizeId = null;
    if (offerId) {
      const snap = await db.collection(MAPPINGS_COLLECTION)
        .where("ogadsOfferId", "==", offerId)
        .limit(1)
        .get();

      if (!snap.empty) {
        prizeId = snap.docs[0].data().prizeId || null;
      }
    }

    if (!prizeId) {
      // لم نجد mapping -> سجّل في سجل الأخطاء للمراجعة ولا ترجع خطأ لـ OGAds (لمنع إعادة المحاولة)
      await db.collection("postback_errors").add({
        reason: "mapping_not_found",
        offerId,
        email,
        params,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.warn("Mapping not found for offerId:", offerId);
      return { statusCode: 200, body: "ok" }; // رجع 200 حتى لا يعيد OGAds المحاولة
    }

    // 2) dedupe: استخدم txId إن وُجد كـ docId
    const makeId = (s) => encodeURIComponent(String(s).replace(/\./g, "%2E"));
    const docId = txId ? makeId(txId) : `${makeId(email)}_${makeId(offerId || Date.now())}`;

    if (txId) {
      // تحقق من وجوده لمنع التكرار
      const existing = await db.collection(REG_COLLECTION).doc(docId).get();
      if (existing.exists) {
        console.log("Duplicate txId:", txId);
        return { statusCode: 200, body: "ok" }; // لا تسجل مرتين
      }
    }

    // 3) حفظ التسجيل بالمفاتيح التي تريدها
    await db.collection(REG_COLLECTION).doc(docId).set({
      email,
      joinDate: new Date().toISOString(),
      prize: params.prizeName || "unknown prize", // إن أردت اسم الجائزة يمكنك وضعه في mapping أيضاً
      prizeId,
      status: "accepted",
      verified: false,
      offerId,
      payout: payout ? Number(payout) : null,
      txId,
      rawParams: params,
      receivedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log("Saved registration:", { docId, email, prizeId });
    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("Postback handler error:", err);
    return { statusCode: 500, body: "error" };
  }
}
