export default async function handler(req, res) {
  // OGAds سيرسل بيانات GET أو POST
  const { subid, offer_id, payout } = req.query; // لو GET
  // const { subid, offer_id, payout } = req.body; // لو POST

  // مثال: طباعة في اللوج
  console.log('OGAds postback:', { subid, offer_id, payout });

  // يمكنك هنا استدعاء Firebase Admin SDK لحفظ البيانات
  // await saveToFirebase({ subid, offer_id, payout });

  res.status(200).json({
    message: 'Postback received successfully',
    data: { subid, offer_id, payout }
  });
}
