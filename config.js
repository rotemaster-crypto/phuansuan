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

  // ── Auth providers (เปิด/ปิดปุ่ม login แต่ละช่อง) ──
  // line ใช้ผ่าน LIFF เสมอ; google/facebook ใช้ native Firebase provider
  // (ปุ่ม google/facebook จะซ่อนอัตโนมัติเมื่อเปิดในแอป LINE)
  auth: {
    providers: { line: true, google: true, facebook: false },
  },

  // ── Terminology (ค่ากลาง — แบรนด์ตั้งคำเองได้ ไม่ฝังในโค้ด) ──
  terms: {
    item:      'พืช',
    itemPlace: 'สวน',
    people:    'ชาวสวน',
    expert:    'หมอพืช',
    problem:   'โรคพืช',
  },

  // ── ร้านค้า ───────────────────────────────────────────────
  shop: {
    name:         'DemeterRich',
    lineShopUrl:  'https://line.me/R/ti/p/@demeterrich',
    lineOaId:     '@demeterrich',
    lineOaButton: { enabled: true, label: 'แชทกับเรา' },
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
    aiDiagnosis:     false,  // AI วิเคราะห์รูป (ปิด default — เปิดเฉพาะแบรนด์ที่ต้องการ, มีค่าใช้จ่าย)
    proximityAlert:  false,  // "ใกล้ฉัน"/ตำแหน่ง (แท็บใกล้ฉัน + ขอ GPS + แจ้งเตือนพื้นที่) — default ปิด เปิดต่อแบรนด์ที่ต้องการ location
    productLink:     true,   // ลิงก์สินค้าร้าน
    stories:         true,   // Stories บนสุด Feed
    pointSystem:     true,   // ระบบแต้มสะสม
    communityGroups: false,  // กลุ่มย่อย (มี join) — default ปิด เปิดทีละแบรนด์ที่ต้องการ (ฟีด/ถามปัญหา/รีวิว ไม่เกี่ยว ยังอยู่)
    leaderboard:     true,   // ตารางอันดับ (ปราชญ์) — คุมต่อแบรนด์
    weatherAlert:    false,  // แจ้งเตือนสภาพอากาศ (เปิดทีหลัง)
    commerce:        true,   // ระบบร้านค้า + ตะกร้า (Phase 3)
    pricingTool:     false,  // เครื่องมือคิดราคา–กำไร (แอดมิน) — default ปิด เปิดทีละแบรนด์ (pilot)
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
  // ระดับสมาชิก (ค่ามาตรฐานอังกฤษ + เหรียญ) — แบรนด์ตั้งชื่อ/เกณฑ์/สิทธิพิเศษเองทับได้ (settings/app.tierLabels + Tier Thresholds)
  tiers: {
    bronze:   { min: 0,    max: 999,   discount: 0,  label: 'Bronze',   emoji: '🥉' },
    silver:   { min: 1000, max: 2999,  discount: 5,  label: 'Silver',   emoji: '🥈' },
    gold:     { min: 3000, max: 5999,  discount: 10, label: 'Gold',     emoji: '🥇' },
    platinum: { min: 6000, max: 99999, discount: 15, label: 'Platinum', emoji: '🏅' },
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

  // ── หมวดสินค้า (แนว Shopee — แบรนด์หลากหลาย ตั้งต่อแบรนด์ทับได้) ──
  // customer shop โชว์เฉพาะหมวดที่มีสินค้าจริง → รายการยาวไม่รก
  // หมวดเกษตร (fertilizer/pesticide/hormone/organic/equipment) คงไว้ กันสินค้าเดิมกำพร้า
  productCategories: [
    { id: 'fashion',    name: 'เสื้อผ้า/แฟชั่น',       emoji: '👕' },
    { id: 'beauty',     name: 'ความงาม/เครื่องสำอาง',   emoji: '💄' },
    { id: 'health',     name: 'สุขภาพ',               emoji: '🩺' },
    { id: 'mombaby',    name: 'แม่และเด็ก',            emoji: '🍼' },
    { id: 'home',       name: 'บ้าน/ครัว/ของใช้',      emoji: '🏠' },
    { id: 'appliance',  name: 'เครื่องใช้ไฟฟ้า',        emoji: '🔌' },
    { id: 'mobile',     name: 'มือถือ/แท็บเล็ต',        emoji: '📱' },
    { id: 'computer',   name: 'คอมพิวเตอร์/ไอที',       emoji: '💻' },
    { id: 'gadget',     name: 'แกดเจ็ต/เครื่องเสียง',    emoji: '🎧' },
    { id: 'camera',     name: 'กล้อง/ถ่ายภาพ',          emoji: '📷' },
    { id: 'food',       name: 'อาหาร/เครื่องดื่ม',       emoji: '🍜' },
    { id: 'pet',        name: 'สัตว์เลี้ยง',            emoji: '🐾' },
    { id: 'sport',      name: 'กีฬา/กลางแจ้ง',          emoji: '⚽' },
    { id: 'auto',       name: 'ยานยนต์/อะไหล่',         emoji: '🚗' },
    { id: 'tools',      name: 'เครื่องมือ/ช่าง',        emoji: '🛠️' },
    { id: 'book',       name: 'หนังสือ/เครื่องเขียน',    emoji: '📚' },
    { id: 'toy',        name: 'ของเล่น/เกม',            emoji: '🧸' },
    { id: 'bag',        name: 'กระเป๋า',               emoji: '👜' },
    { id: 'shoes',      name: 'รองเท้า',               emoji: '👟' },
    { id: 'watch',      name: 'นาฬิกา/แว่นตา',          emoji: '⌚' },
    { id: 'jewelry',    name: 'เครื่องประดับ',          emoji: '💍' },
    { id: 'fertilizer', name: 'ปุ๋ย',                 emoji: '💊' },
    { id: 'pesticide',  name: 'ยา/สารกำจัดศัตรูพืช',    emoji: '🧴' },
    { id: 'hormone',    name: 'ฮอร์โมน/อาหารเสริมพืช',   emoji: '💧' },
    { id: 'organic',    name: 'เกษตรอินทรีย์',          emoji: '🌱' },
    { id: 'equipment',  name: 'อุปกรณ์การเกษตร',        emoji: '🔧' },
    { id: 'other',      name: 'อื่นๆ',                emoji: '📦' },
  ],

  // ── AI ───────────────────────────────────────────────────
  ai: {
    provider:      'gemini',        // gemini หรือ claude
    model:         'gemini-1.5-flash',
    maxTokens:     500,
    language:      'th',
    // API key ใส่ใน firebase-config.js เท่านั้น ไม่ใส่ที่นี่
  },

};

// Export
if (typeof module !== 'undefined') module.exports = APP_CONFIG;
