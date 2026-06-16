// ============================================================
//  เพื่อนสวน — CONFIG FILE
//  แก้ไขไฟล์นี้เพื่อปรับแต่งแอปโดยไม่ต้องแตะ code หลัก
// ============================================================

if(!window.APP_CONFIG) window.APP_CONFIG = {

  // ── แอปพลิเคชัน ──────────────────────────────────────────
  app: {
    name:        'เพื่อนสวน',
    subtitle:    'DemeterRich Community',
    version:     '1.0.0',
    primaryColor:'#1877f2',   // สีหลัก (น้ำเงิน FB)
    accentColor: '#42b883',   // สีเสริม
    logoEmoji:   '🌿',
  },

  // ── Tenant (Multi-project / SaaS) ─────────────────
  // เปลี่ยน tenant.id ตัวเดียว = แยก project ใหม่ (feed ไม่ปนกัน)
  tenant: {
    id:   'phuansuan',          // รหัส project นี้ (ใช้กรองทุก query)
    name: 'เพื่อนสวน',
    plan: 'free',
    domains:   { 'phuansuan.web.app':'phuansuan', 'phuansuan.firebaseapp.com':'phuansuan', 'localhost':'phuansuan', 'office-phuansuan.web.app':'office' },
    overrides: { office: { auth:'anonymous', name:'Office Social', logoEmoji:'💬', features:{ aiDiagnosis:false, proximityAlert:false, productLink:false, weatherAlert:false, communityGroups:false } } },               // free | pro | enterprise (รองรับ subscription)
  },

  // ── Admin ─────────────────────────────────
  admin: {
    lineUserId: 'U03582167674331d9005dfb42728c7151',
  },

  // ── ร้านค้า ───────────────────────────────────────────────
  shop: {
    name:         'DemeterRich',
    lineShopUrl:  'https://line.me/R/ti/p/@demeterrich',
    lineOaId:     '@demeterrich',
    contactPhone: '099-999-9999',
    // ── ระบบร้านค้า + ตะกร้า (Phase 3) ──
    commerce: {
      enabled:        true,
      promptpayId:    '0868834583',   // ⚠️ ใส่เบอร์พร้อมเพย์ หรือเลขผู้เสียภาษี DemeterRich
      promptpayName:  'DemeterRich',
      shippingTiers: [                // ค่าส่งตามน้ำหนักรวม (กก.)
        { maxKg: 1,   fee: 40 },
        { maxKg: 5,   fee: 60 },
        { maxKg: 999, fee: 90 },
      ],
      freeShippingMin: 1000,          // ส่งฟรีเมื่อยอดสินค้า ≥ (0 = ปิด)
      defaultWeightKg: 1,             // น้ำหนัก/ชิ้น ถ้าสินค้าไม่ระบุ weightKg
      currency:       'บาท',
      useTierDiscount: true,          // ใช้ส่วนลดตาม tier กับยอดสินค้า
    },

  },

  // ── Feed & Content ────────────────────────────────────────
  feed: {
    nearbyRadius:  15,    // กม. ที่แสดงใน feed ใกล้ฉัน
    postsPerPage:  10,    // โพสที่โหลดครั้งแรก
    alertRadius:   20,    // กม. สำหรับแจ้งเตือนโรคระบาด
  },

  // ── เปิด/ปิด Features ────────────────────────────────────
  features: {
    aiDiagnosis:     true,   // AI วิเคราะห์โรคพืช
    proximityAlert:  true,   // แจ้งเตือนโรคระบาดในพื้นที่
    productLink:     true,   // ลิงก์สินค้าร้าน
    stories:         true,   // Stories บนสุด Feed
    pointSystem:     true,   // ระบบแต้มสะสม
    communityGroups: true,   // กลุ่ม/ชุมชน
    weatherAlert:    false,  // แจ้งเตือนสภาพอากาศ (เปิดทีหลัง)
    commerce:        true,   // ระบบร้านค้า + ตะกร้า (Phase 3)
  },

  // ── ระบบแต้มสะสม ─────────────────────────────────────────
  points: {
    perPost:        10,   // โพสใหม่
    perPostWithImg: 15,   // โพสพร้อมภาพ
    perComment:      3,   // แสดงความคิดเห็น
    perHelp:        15,   // กด "ช่วยได้" จากคนอื่น
    perLike:         2,   // ได้รับ Like
    perPurchase:    20,   // ซื้อสินค้าผ่านร้าน
    perAlert:        8,   // โพสแจ้งเตือนโรคระบาด
    perVerified:    25,   // โพสที่ Expert ยืนยัน
    dailyLoginBonus: 5,   // เข้าแอปทุกวัน
  },

  // ── ระดับ Tier ───────────────────────────────────────────
  tiers: {
    bronze:   { min: 0,    max: 999,   discount: 0,  label: 'Bronze',   emoji: '🥉' },
    silver:   { min: 1000, max: 2999,  discount: 5,  label: 'Silver',   emoji: '🥈' },
    gold:     { min: 3000, max: 5999,  discount: 10, label: 'Gold',     emoji: '🥇' },
    platinum: { min: 6000, max: 99999, discount: 15, label: 'Platinum', emoji: '💎' },
  },

  // ── การแจ้งเตือน ──────────────────────────────────────────
  notifications: {
    newPostNearby:  true,   // มีโพสใหม่ใกล้บ้าน
    diseaseAlert:   true,   // โรคระบาดในพื้นที่
    commentReply:   true,   // มีคนตอบโพสของเรา
    pointsEarned:   true,   // ได้รับแต้มใหม่
    tierUpgrade:    true,   // เลื่อน tier
    newFollower:    true,   // มีคนติดตามใหม่
    shopPromotion:  true,   // โปรโมชั่นร้านค้า
  },

  // ── พืชที่รองรับ (เพิ่ม/ลบได้) ───────────────────────────
  crops: [
    { id: 'mango',    name: 'มะม่วง',   emoji: '🥭' },
    { id: 'chili',    name: 'พริก',      emoji: '🌶️' },
    { id: 'lime',     name: 'มะนาว',    emoji: '🍋' },
    { id: 'banana',   name: 'กล้วย',    emoji: '🍌' },
    { id: 'rice',     name: 'ข้าว',     emoji: '🌾' },
    { id: 'guava',    name: 'ฝรั่ง',    emoji: '🍈' },
    { id: 'cassava',  name: 'มันสำปะหลัง', emoji: '🌿' },
    { id: 'sugarcane',name: 'อ้อย',     emoji: '🎍' },
    { id: 'corn',     name: 'ข้าวโพด',  emoji: '🌽' },
    { id: 'lemongrass',name:'ตะไคร้',   emoji: '🌿' },
    { id: 'other',    name: 'อื่นๆ',    emoji: '🌱' },
  ],

  // ── หมวดสินค้า ────────────────────────────────────────────
  productCategories: [
    { id: 'fertilizer', name: 'ปุ๋ย',         emoji: '💊' },
    { id: 'pesticide',  name: 'ยาฆ่าแมลง',    emoji: '🧴' },
    { id: 'hormone',    name: 'ฮอร์โมน',      emoji: '💧' },
    { id: 'organic',    name: 'อินทรีย์',     emoji: '🌱' },
    { id: 'equipment',  name: 'อุปกรณ์',      emoji: '🔧' },
  ],

  // ── สินค้าแนะนำ (เพิ่ม/ลบได้) ────────────────────────────
  products: [
    {
      id: 'p001',
      name: 'Mancozeb 80% WP',
      category: 'pesticide',
      price: '180 บาท',
      url: 'https://line.me/R/ti/p/@demeterrich',
      diseases: ['แอนแทรคโนส', 'ราสนิม'],
      crops: ['mango', 'chili'],
    },
    {
      id: 'p002',
      name: 'โปแตสเซียม 0-0-60',
      category: 'fertilizer',
      price: '450 บาท',
      url: 'https://line.me/R/ti/p/@demeterrich',
      diseases: [],
      crops: ['chili', 'mango'],
    },
    {
      id: 'p003',
      name: 'ฮิวมิคแอซิด DemeterRich',
      category: 'organic',
      price: '320 บาท',
      url: 'https://line.me/R/ti/p/@demeterrich',
      diseases: [],
      crops: ['all'],
    },
    {
      id: 'p004',
      name: 'ปุ๋ยสูตร 13-0-46',
      category: 'fertilizer',
      price: '520 บาท',
      url: 'https://line.me/R/ti/p/@demeterrich',
      diseases: [],
      crops: ['mango', 'guava'],
    },
  ],

  // ── โรคพืชและการแนะนำสินค้า ──────────────────────────────
  diseases: [
    {
      id: 'anthracnose',
      name: 'โรคแอนแทรคโนส',
      symptoms: ['จุดดำ', 'ขอบเหลือง', 'ใบไหม้'],
      crops: ['mango', 'chili'],
      products: ['p001'],
      severity: 'high',
    },
    {
      id: 'powdery_mildew',
      name: 'โรคราแป้ง',
      symptoms: ['ผงขาว', 'ใบหงิก', 'ยอดแห้ง'],
      crops: ['mango'],
      products: ['p001'],
      severity: 'medium',
    },
  ],

  // ── AI ───────────────────────────────────────────────────
  ai: {
    provider:      'gemini',        // gemini หรือ claude
    model:         'gemini-1.5-flash',
    maxTokens:     500,
    language:      'th',
    // API key ใส่ใน firebase-config.js เท่านั้น ไม่ใส่ที่นี่
  },

  // ── Badge ────────────────────────────────────────────────
  badges: [
    { id: 'mango_expert',  name: 'ปราชญ์มะม่วง',   emoji: '🥭', condition: 'posts_mango >= 20' },
    { id: 'good_neighbor', name: 'เพื่อนบ้านที่ดี', emoji: '🤝', condition: 'helped >= 10' },
    { id: 'reporter',      name: 'นักแจ้งเตือน',    emoji: '⚠️', condition: 'alerts >= 5' },
    { id: 'guru',          name: 'ปราชญ์ชาวสวน',   emoji: '⭐', condition: 'helped >= 50' },
  ],

};

// Export
if (typeof module !== 'undefined') module.exports = APP_CONFIG;
