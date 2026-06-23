const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./sa.json')) });
const db = admin.firestore();
(async () => {
  const ref = db.collection('tenants').doc('phuansuan');
  await ref.set({
    name: 'เพื่อนสวน',
    plan: 'free',
    status: 'active',
    domains: ['phuansuan.web.app', 'office-phuansuan.web.app'],
    ownerLineId: 'U03582167674331d9005dfb42728c7151',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  const s = await ref.get();
  console.log('tenants/phuansuan =', JSON.stringify(s.data(), null, 2));
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
