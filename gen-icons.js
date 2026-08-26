// ============================================================
//  gen-icons.js — สร้างไอคอน PWA (PNG) แบบ pure-Node ไม่ง้อ lib ภายนอก
//  วาด "ใบไม้" สีขาวบนพื้นโค้งสีแบรนด์ + midrib
//  ปรับสีได้ที่ BRAND ด้านล่าง (ดึงจาก config.js ให้อัตโนมัติถ้าหาเจอ)
//  รัน:  node gen-icons.js   → เขียนไฟล์ลง ./icons/
// ============================================================
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── สีแบรนด์ (พยายามอ่านจาก config.js; ไม่ได้ก็ใช้ค่า default) ──
let BRAND = { bg: '#2f9e6e', leaf: '#ffffff' };
try {
  const cfg = require('./config.js');
  const accent = cfg?.app?.accentColor || cfg?.app?.primaryColor;
  if (accent) BRAND.bg = accent;
} catch (_) { /* ใช้ default */ }

const hex = h => {
  const s = h.replace('#','');
  return [parseInt(s.slice(0,2),16), parseInt(s.slice(2,4),16), parseInt(s.slice(4,6),16)];
};
const BG   = hex(BRAND.bg);
const LEAF = hex(BRAND.leaf);

// ── PNG encoder (8-bit RGBA) ──────────────────────────────
function crc32(buf){
  let c = ~0;
  for (let i=0;i<buf.length;i++){
    c ^= buf[i];
    for (let k=0;k<8;k++) c = (c>>>1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length,0);
  const t = Buffer.from(type,'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t,data])),0);
  return Buffer.concat([len,t,data,crc]);
}
function encodePNG(width, height, rgba){
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width,0); ihdr.writeUInt32BE(height,4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0; // 8-bit, RGBA
  // add filter byte (0) per scanline
  const stride = width*4;
  const raw = Buffer.alloc((stride+1)*height);
  for (let y=0;y<height;y++){
    raw[y*(stride+1)] = 0;
    rgba.copy(raw, y*(stride+1)+1, y*stride, y*stride+stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR',ihdr), chunk('IDAT',idat), chunk('IEND',Buffer.alloc(0))]);
}

// ── วาดไอคอน (supersampled AA) ─────────────────────────────
// maskable=true → พื้นเต็มจอ (ไม่มีมุมโปร่ง) + ใบเล็กลงกันโดน mask ตัด
function draw(size, { maskable=false }={}){
  const SS = 4;                 // supersample
  const W = size, H = size;
  const out = Buffer.alloc(W*H*4);

  const R = size;               // ทำงานบน normalized ต่อ size
  const corner = maskable ? 0 : size*0.22;   // รัศมีมุมพื้น
  const pad    = maskable ? size*0.14 : 0;   // safe-area สำหรับ maskable

  // ── leaf geometry (vesica = intersection ของสองวงกลม) ──
  const cx = size/2, cy = size/2;
  const leafR   = (size/2 - pad) * 0.92;     // รัศมีวงกลมที่ตัดกัน
  const offset  = leafR * 0.62;              // ระยะห่างศูนย์กลางสองวง
  const ang     = -Math.PI/4;                // เอียง 45° → ใบชี้ขวาบน
  const cosA = Math.cos(ang), sinA = Math.sin(ang);
  // ศูนย์กลางสองวง (ในระบบใบก่อนหมุน: ซ้าย-ขวา)
  const A = { x: -offset, y: 0 }, B = { x: offset, y: 0 };

  const inRoundRect = (x,y) => {
    const rx = Math.min(x, W-x), ry = Math.min(y, H-y);
    if (rx>=corner && ry>=corner) return true;
    if (rx>=corner || ry>=corner) return (rx>=corner? true : false) || (ry>=corner);
    const dx = corner-Math.min(x,W-x), dy = corner-Math.min(y,H-y);
    return dx*dx+dy*dy <= corner*corner;
  };

  const inLeaf = (x,y) => {
    // ย้ายมาที่ศูนย์กลาง แล้วหมุนกลับ -ang เข้าสู่ระบบใบ
    const px = x-cx, py = y-cy;
    const lx =  cosA*px + sinA*py;
    const ly = -sinA*px + cosA*py;
    const dA = Math.hypot(lx-A.x, ly-A.y);
    const dB = Math.hypot(lx-B.x, ly-B.y);
    if (dA>leafR || dB>leafR) return 0;
    // midrib: เส้นกลางแนวใบ (แกน lx) → คืน -1 = สีพื้น(เว้นเป็นเส้น)
    if (Math.abs(ly) < size*0.018 && Math.abs(lx) < leafR*0.72) return -1;
    return 1;
  };

  for (let y=0;y<H;y++){
    for (let x=0;x<W;x++){
      let r=0,g=0,b=0,a=0;
      for (let sy=0;sy<SS;sy++) for (let sx=0;sx<SS;sx++){
        const fx = x + (sx+0.5)/SS, fy = y + (sy+0.5)/SS;
        let cr=0,cg=0,cb=0,ca=0;
        if (inRoundRect(fx,fy)){ cr=BG[0]; cg=BG[1]; cb=BG[2]; ca=255; }
        const lf = inLeaf(fx,fy);
        if (lf===1){ cr=LEAF[0]; cg=LEAF[1]; cb=LEAF[2]; ca=255; }
        // lf===-1 → midrib: คงสีพื้น (โชว์เส้นแบรนด์บนใบขาว)
        r+=cr; g+=cg; b+=cb; a+=ca;
      }
      const n = SS*SS, i=(y*W+x)*4;
      out[i]=Math.round(r/n); out[i+1]=Math.round(g/n); out[i+2]=Math.round(b/n); out[i+3]=Math.round(a/n);
    }
  }
  return encodePNG(W,H,out);
}

// ── เขียนไฟล์ ─────────────────────────────────────────────
const dir = path.join(__dirname, 'icons');
fs.mkdirSync(dir, { recursive: true });
const jobs = [
  ['icon-192.png',           192, {}],
  ['icon-512.png',           512, {}],
  ['icon-maskable-192.png',  192, { maskable:true }],
  ['icon-maskable-512.png',  512, { maskable:true }],
  ['apple-touch-icon.png',   180, { maskable:true }],  // iOS ไม่รองรับมุมโปร่ง → full-bleed
];
for (const [name, size, opt] of jobs){
  const png = draw(size, opt);
  fs.writeFileSync(path.join(dir, name), png);
  console.log(`✓ icons/${name}  (${size}px, ${png.length} bytes)`);
}
console.log(`เสร็จ — สีพื้น ${BRAND.bg}`);
