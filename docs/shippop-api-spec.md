# SHIPPOP Marketplace API — Domestic APIs Spec

> Source: https://documenter.getpostman.com/view/10021496/Tzz8qwkE (Postman documenter, "SHIPPOP APIS" → **Domestic APIs**).
> Extracted verbatim from the page. Field names are EXACT as shown. Anything not present on the page is marked **NOT FOUND**.
> This account: Market ID **B-3469** (see §7 — market id is NOT a request field; it is tied to the api_key).

## Base URLs & Flow

| Environment | Base URL |
|---|---|
| Production | `https://mkpservice.shippop.com/` |
| Dev | `https://mkpservice.shippop.dev/` |

**API FLOW** (verbatim):
1. **GET PRICE** — Checking price of available couriers.
2. **BOOKING ORDER** — Booking order by selecting the available courier, then get the purchase ID (for confirm) and SHIPPOP tracking code (for tracking).
3. **CONFIRM** — Confirm purchase; sends data to the courier. After confirm you cannot edit any info or cancel the purchase.
4. **LABEL** — SHIPPOP label template (or use your own template).

Endpoint summary (all POST, path appended to `{{BASE_URL}}`):

| Step | Method | Path | Body format |
|---|---|---|---|
| GET PRICE (2.1.1 Check Price) | POST | `/pricelist/` | raw JSON |
| Public Check Price (2.2, standard website price) | POST | `/pricelist/` (public variant; exact path NOT clearly shown) | raw JSON |
| BOOKING (3.1) | POST | `/booking/` | raw JSON, `Content-Type: application/json` |
| CONFIRM (3.2) | POST | `/confirm/` | multipart formdata |
| UPDATE weight (3.3, Flash only) | POST | `/update/` | formdata |
| CANCEL (3.4) | POST | `/cancel/` | raw JSON |
| LABEL (6.1) | POST | `/label/` (cURL example uses `/v2/label/`) | raw JSON |

> Note: there is **no** `/getprice/` endpoint on this page. GET PRICE = `/pricelist/`.

---

## 1. Address Object ("Address - ข้อมูลที่อยู่")

An object that stores province, state, district, postcode and phone number.

| Field (exact key) | Optional | Type | Description |
|---|---|---|---|
| `province` | required | String | Store province data (จังหวัด) |
| `state` | required | String | Store state data (เขต/อำเภอ) |
| `district` | required | String | Store district data (แขวง/ตำบล) |
| `postcode` | required | String | Store postcode data |
| `address` | required | String | Full address |
| `name` | required | String | Name of contact person of this address |
| `tel` | required | String | Phone number of contact person |
| `email` | **yes (optional)** | String | Email of contact person |
| `lat` | **yes (optional)** | String | On-demand |
| `lng` | **yes (optional)** | String | On-demand |

**Thai admin-level mapping** (from examples — important, easy to get wrong):
`district` = แขวง/ตำบล (sub-district), `state` = เขต/อำเภอ (district), `province` = จังหวัด (province).
Example: `"district":"แขวงห้วยขวาง", "state":"เขตห้วยขวาง", "province":"กรุงเทพ"`.

---

## 2. Parcel Object

Not defined in a standalone "Object" table; its fields come from the request tables/examples (referenced as "Parcel Object").

| Field (exact key) | Type | Unit | Example |
|---|---|---|---|
| `name` | String | — | `"สินค้าชิ้นที่ 1"` / `"BOX1"` |
| `weight` | Number | **grams** | `18000` (=18 kg), `1`, `800` |
| `width` | Number | **cm** | `30` |
| `length` | Number | **cm** | `100` |
| `height` | Number | **cm** | `30` |

> Units confirmed: Product `weight` is documented "Store product weight in **gram**"; parcel physical limit is described as "กว้าง + ยาว + สูง ไม่เกิน 120 เซนติเมตร" (width+length+height ≤ 120 **cm**). So parcel weight = grams, dimensions = cm.

---

## 3. Product Object ("PRODUCT - ข้อมูลสินค้า")

Stores product price, amount, weight. **\*Required for COD Shipment.** In requests it is nested as `product: { "0": {...}, "1": {...} }` (object keyed by index).

| Field (exact key) | Optional | Type | Description |
|---|---|---|---|
| `product_code` | required | String | Store product code |
| `name` | required | String | Store product name in the parcel |
| `category` | required | String | (category) |
| `detail` | **yes** | String | Store product detail in the parcel |
| `price` | required | Float | Store product price in the parcel |
| `amount` | required | Integer | Store amount of the product in the parcel |
| `weight` | required | Float | Store product weight **in gram** |
| `size` | **yes** | (no type shown) | — |
| `color` | **yes** | (no type shown) | — |

### POST OFFICE Object ("POST OFFICE - ข้อมูลสาขาไปรษณีย์") — bonus
| Field | Type | Description |
|---|---|---|
| `id` | Integer | Thailand post dropoff ID code |
| `name` | String | Thailand post dropoff name |
| `postcode` | String | Thailand post dropoff postcode |
| `latlong` | String | Thailand post dropoff latitude and longitude |

---

## 4. Courier Code list ("Courier Code - รายการขนส่ง")

Full table (courier name → courier code):

| Courier name | `courier_code` | Note |
|---|---|---|
| SHIPPOP Fruit | `SHF` | |
| ไปรษณีย์ไทย EMS (Thailand Post EMS) | `EMST` | |
| ไปรษณีย์ไทย eCo-post (Thailand Post eCo-post) | `ECP` | |
| DHL | `DHL` | |
| Flash Express | `FLE` | |
| Flash Express Bulky | `FLEB` | large parcels (ส่งพัสดุขนาดใหญ่) |
| Flash Express Fruit | `FLEF` | vegetables/fruit (ส่งผักและผลไม้) |
| Flash Express Dropoff | `FLEDS` | dropoff offline (เฉพาะผู้มีหน้าร้านสาขา) |
| Best Express | `BEST` | |
| Aramex | `ARM` | |
| KEX Exclusive (Kerry) | `KRYX` | |
| KEX Offline (Kerry) | `KRYS` | dropoff offline |
| KEX Dropoff (Kerry) | `KRYDS` | dropoff offline |
| J&T Express (Pickup) | `JNTP` | dropoff offline |
| J&T Express (Dropoff) | `JNTD` | dropoff offline |
| Lazada Dropoff | `LZDS` | dropoff offline |
| Makesend | `MSE` | |
| Makesend Chilled | `MSEC` | ส่งของเย็น (chilled) |
| Makesend Frozen | `MSEF` | ส่งของแช่แข็ง (frozen) |
| SPX Express (Shopee) | `SPX` | |
| Lalamove | `LLM` | On-demand |
| Skootar | `SKT` | On-demand |

> Kerry = `KRYX`/`KRYS`/`KRYDS`. **Thailand Post = `EMST` (EMS) / `ECP` (eCo-post).** J&T = `JNTP`/`JNTD`. Flash = `FLE`/`FLEB`/`FLEF`/`FLEDS`.
> **NOT in this marketplace code table:** Ninja Van, SCG Express, Nim Express, Cool Ta-Q-Bin, plain "KERRY". (The Courier Info cut-off-time section shows some of those logos, but they do not appear in the Courier Code list.)

---

## 5. GET PRICE — POST `{{BASE_URL}}/pricelist/`

**Request body (raw JSON):**

| Field | Optional | Type | Description |
|---|---|---|---|
| `api_key` | required | String | Api key |
| `data[{key}]` | required | Array Object | GET PRICE DATA OBJECT (see below). In example, `data` is an **object keyed "0","1",...** |

**GET PRICE DATA OBJECT** (each item in `data`):

| Field | Optional | Type | Description |
|---|---|---|---|
| `from` | required | Object | ADDRESS OBJECT |
| `to` | required | Object | ADDRESS OBJECT |
| `parcel` | required | Object | PARCEL OBJECT |
| `courier_code` | **yes** | String | Select courier |
| `cod_amount` | **yes** | Int | cod amount |
| `showall` | **yes** | Integer | `0` (default) = show only available couriers; `1` = show all couriers on hands |

**RESPONSE GET PRICE:**

| Field | Optional | Type | Description |
|---|---|---|---|
| `status` | required | Boolean | True = Success; False = Fail with error code |
| `code` | yes | Integer | 400 = Incomplete request |
| `data` | required | Array | Array of data request |
| `data[{key}]` | required | Array Object | Post data object and key |
| `data[{key}][{courier_code}]` | required | Array Object | **Courier Data Object** (below) — the price lives here |

**Courier Data Object** (the price holder, keyed by `courier_code`):

| Field (exact key) | Optional | Type | Description |
|---|---|---|---|
| `price` | required | Integer | **Total price** — includes all surcharges (remote/travel/island/fuel) |
| `estimate_time` | required | String | Condition delivery time |
| `available` | required | Boolean | True = courier_code available; False = unavailable |
| `courier_code` | required | String | courier code |
| `error_code` | required | String | Get-price error code table |
| `courier_name` | required | String | courier name |
| `remark` | yes | String | Remark / condition shipment |
| `notice` | yes | String | Notice |
| `price_fuel_surcharge` | yes | Integer | Fuel surcharge |
| `price_remote_area` | yes | Integer | Extra charge |
| `price_travel_area` | yes | Integer | Travel surcharge |
| `price_island_area` | yes | Integer | Island surcharge |
| `price_cod` | default = 0 | Float | COD charge |
| `price_cod_vat` | default = 0 | Float | Vat of COD charge |
| `price_zone` | yes | String | zone for price calculation |

**Example request (verbatim):**
```json
{
    "api_key": "{{YOUR_API_KEY}}",
    "data": {
        "0": {
            "from": {
                "name": "ผู้ส่ง ต้นทาง 1",
                "address": "บริษัท​ ชิปป๊อป​ จำกัด 1​",
                "district": "ถนนพญาไท",
                "state": "ราชเทวี",
                "province": "กรุงเทพมหานคร",
                "postcode": "10400",
                "tel": "0123456789",
                "lat": "13.7615902",
                "lng": "100.534519"
            },
            "to": {
                "name": "ผู้รับ ปลายทาง 1",
                "address": "บริษัท​ ชิปป๊อป​ จำกัด​ 2",
                "district": "สีลม",
                "state": "บางรัก",
                "province": "กรุงเทพมหานคร",
                "postcode": "10500",
                "tel": "0123456789",
                "lat": "13.7615902",
                "lng": "100.534519"
            },
            "parcel": {
                "name": "สินค้าชิ้นที่ 1",
                "weight": 18000,
                "width": 30,
                "length": 100,
                "height": 30
            },
            "courier_code": "FLE",
            "showall": 1
        },
        "1": { "...": "same shape as 0" }
    }
}
```

**Example response (verbatim):**
```json
{
  "status": true,
  "data": {
    "0": {
      "FLE": {
        "estimate_time": "ภายใน 1 - 2 วัน",
        "courier_code": "FLE",
        "price": "238",
        "available": true,
        "remark": "optional",
        "err_code": "ERR_DEFAULT",
        "courier_name": "FlashExpress",
        "price_cod": 0,
        "price_cod_vat": 0
      }
    },
    "1": {
      "EMST": {
        "courier_code": "EMST",
        "price": "52",
        "estimate_time": "ภายใน 1 - 2 วัน",
        "available": true,
        "remark": "optional",
        "err_code": "ERR_DEFAULT",
        "courier_name": "EMS Thailand Post",
        "price_cod": 0,
        "price_cod_vat": 0
      }
    }
  }
}
```
> Note: in the response example `price` is a **String** (`"238"`) and the surcharge field appears as `err_code` (the field table calls it `error_code`). Price is nested at `data[index][courier_code].price`.

---

## BOOKING — POST `{{BASE_URL}}/booking/`

Header: `Content-Type: application/json`. Body: raw JSON.

**Request body:**

| Field | Optional | Type | Description |
|---|---|---|---|
| `api_key` | required | String | Api key : **Verify Marketplace** |
| `email` | required | String | Email Address |
| `data` | required | Array | Data — can post multiple orders (Array) |
| `data[{key}]` | required | Array Object | BOOKING DATA OBJECT (below) |
| `promo_code` | yes | String | Coupon code |
| `token` | yes | String | Token verified instead of email (only SHIPPOP B2C customers) |
| `domain` | yes | String | If sending a token, must post the domain (SHIPPOP B2C domain setting) |
| `force_confirm` | yes | Integer | `0` = must confirm (default); `1` = auto confirm |

**Additional request body (PREPAID customers):** `url[success]` (String, redirect after payment success), `url[fail]` (String, redirect after payment fail).

**BOOKING DATA OBJECT:**

| Field (exact key) | Optional | Type | Description |
|---|---|---|---|
| `from` | required | Object | Ref: Address Object |
| `to` | required | Object | Ref: Address Object |
| `parcel` | required | Object | Ref: Parcel Object |
| `product[{key}]` | required* | Array Object | Ref: Product Object (`product: {"0":{...}}`). *Required for COD |
| `courier_code` | required | String | Courier code |
| `remark` | yes | String | Remark for this order |
| `starttime` | yes | Time | start time to pick up parcel (Only Skootar) |
| `finishtime` | yes | Time | finish time to complete (Only Skootar) |
| `cod_amount` | yes | Integer | COD amount |
| `insurance_code` | yes | String | `DHPY` = Dhipaya Insurance (all couriers); `THP` = Thailand Post Insurance (Thailand Post shipments only) |
| `declared_value` | yes | Integer | Declared insurance value |
| `branch_id` | yes | String | Kerry Offline required branch_id |
| `pre_barcode` | yes | String | Tracking Code (for some courier types) |
| `meta` | yes | Object | Extra shipment reference data |
| `meta[ref_no_1]` | yes | String | Reference1 |
| `meta[ref_no_2]` | yes | String | Reference2 |

**RESPONSE BOOKING ORDER** (Case Payment Form = 0 / must-confirm; does not return a payment form):

| Field | Optional | Type | Description |
|---|---|---|---|
| `status` | required | Boolean | True = Success; False = fail |
| `code` | yes | Integer | Error code 404 on status false |
| `data` | required | Array | Multiple orders by array |
| `data[{key}]` | required | Array Object | BOOKING RESPONSE OBJECT (below) |
| `purchase_id` | required | Integer | Purchase Shippop (used in confirm/label) |
| `payment_url` | yes | String | payment URL |
| `total_price` | required | Float | Total price |
| `total_cod_charge` | required | Float | Total cod charge |

**BOOKING RESPONSE OBJECT** (each item in `data`):

| Field (exact key) | Optional | Type | Description |
|---|---|---|---|
| `price` | required | Float | Price |
| `from` | required | Object | Ref: Address Object |
| `to` | required | Object | Ref: Address Object |
| `parcel` | required | Object | Ref: Parcel Object |
| `courier_code` | required | String | Courier code |
| `status` | required | Boolean | True = Booking Success; False = Booking Fail |
| `tracking_code` | required | String | **SHIPPOP CODE** (e.g. `SP...`) |
| `courier_tracking_code` | required | String | Courier tracking code |
| `discount` | required | Float | Discount |
| `cod_amount` | required | Integer | COD amount |
| `cod_charge` | required | Float | COD charge |
| `cod_vat` | required | Float | COD vat |
| `price_fuel_surcharge` | yes | Integer | Fuel surcharge |
| `price_remote_area` | yes | Integer | Extra charge |
| `price_travel_area` | yes | Integer | Travel surcharge |
| `price_island_area` | yes | Integer | Island surcharge |
| `price_zone` | yes | String | zone for price calculation |
| `insurance_charge` | yes | Float | (BETA) |

**Example booking request — basic (verbatim):**
```json
{
    "api_key": "{{YOUR_API_KEY}}",
    "email": "test@shippop.com",
    "data": [
        {
            "from": {
                "name": "ผู้ส่ง นามสกุล (ทดสอบระบบไม่ต้องเข้ารับ)",
                "address": "1/1",
                "district": "แขวงห้วยขวาง",
                "state": "เขตห้วยขวาง",
                "province": "กรุงเทพ",
                "postcode": "10310",
                "tel": "0800000000"
            },
            "to": {
                "name": "ผู้รับ นามสกุล",
                "address": "2/2",
                "district": "สีลม",
                "state": "บางรัก",
                "province": "กรุงเทพ",
                "postcode": "10500",
                "tel": "0800000000"
            },
            "parcel": {
                "name": "-",
                "weight": 1,
                "width": 1,
                "length": 1,
                "height": 1
            },
            "courier_code": "EMST"
        }
    ]
}
```

**Example booking request — with Product + COD (verbatim, cURL body):**
```json
{
    "api_key": "{{YOUR_API_KEY}}",
    "email": "test@shippop.com",
    "data": [
        {
            "product": {
                "0": {
                    "product_code": "A01",
                    "name": "ตุ๊กตา",
                    "category": "ของเล่น",
                    "detail": "-",
                    "price": 199.00,
                    "amount": 1,
                    "size": "-",
                    "color": "-",
                    "weight": 100.02
                },
                "1": {
                    "product_code": "A02",
                    "name": "เสื้อยืด",
                    "category": "เสื้อผ้า",
                    "detail": "แขนยาวลายทาง",
                    "price": 100.01,
                    "amount": 3,
                    "size": "XL",
                    "color": "แดง",
                    "weight": 100.02
                }
            },
            "from": {
                "name": "ผู้ส่ง นามสกุลผู้ส่ง",
                "address": "1/1",
                "district": "แขวงห้วยขวาง",
                "state": "เขตห้วยขวาง",
                "province": "กรุงเทพ",
                "postcode": "10310",
                "tel": "0800000000"
            },
            "to": {
                "name": "ผู้รับ นามสกุลผู้รับ",
                "address": "2/2",
                "district": "สีลม",
                "state": "บางรัก",
                "province": "กรุงเทพ",
                "postcode": "10500",
                "tel": "0800000000"
            },
            "parcel": {
                "name": "BOX1",
                "weight": 1,
                "width": 1,
                "length": 1,
                "height": 1
            },
            "cod_amount": 100,
            "courier_code": "EMST"
        }
    ]
}
```
cURL: `curl --location -g '{{BASE_URL}}/booking/' --header 'Content-Type: application/json' --data-raw '<json above>'`

**Example booking response JSON:** **NOT FOUND** — the Postman "Example Response" for booking says *"No response body / This request doesn't return any response body."* Only the field tables above are documented. (Confirm response is the JSON that carries the per-item result — see CONFIRM below.)

---

## CONFIRM — POST `{{BASE_URL}}/confirm/`

Body: multipart **formdata**.

**Request:**

| Field | Optional | Type | Description |
|---|---|---|---|
| `api_key` | required | String | Api key for verify Marketplace |
| `purchase_id` | required | Integer | Purchase Shippop (from booking response) |

**RESPONSE CONFIRM PURCHASE:**

| Field | Optional | Type | Description |
|---|---|---|---|
| `status` | required | Boolean | True = Success; False = fail |
| `code` | yes | Integer | 400 = code; 404 = Not found Purchase |
| `result[{key}]` | required | Array of Object | CONFIRM RESPONSE OBJECT (below) |

**CONFIRM RESPONSE OBJECT:**

| Field (exact key) | Optional | Type | Description |
|---|---|---|---|
| `status` | required | Boolean | result of this object |
| `courier_code` | required | String | courier_code |
| `tracking_code` | required | String | SHIPPOP tracking code |
| `courier_tracking_code` | required | String | Courier tracking code |
| `message` | yes | String | Error message |

cURL: `curl --form 'api_key="{{YOUR_API_KEY}}"' --form 'purchase_id="444021"'` → `{{BASE_URL}}/confirm/`

**Example response (verbatim):**
```json
{
  "status": true,
  "result": {
    "0": {
      "status": false,
      "tracking_code": "SP452030814",
      "courier_tracking_code": "",
      "courier_code": "LLM",
      "message": "'+6608000' is not valid 'phone'. Phone must be: in e.164 format, a valid phone number, and have the correct area code."
    },
    "1": {
      "status": true,
      "tracking_code": "SP452030829",
      "courier_tracking_code": "ST499959975ST",
      "courier_code": "EMST"
    }
  }
}
```
> `result` is keyed by index ("0","1",...). Per item, `status:false` + `message` = that shipment failed; `status:true` + `courier_tracking_code` = success.

---

## 6. LABEL — POST `{{BASE_URL}}/label/`

Section "6.1 LABEL PURCHASE - ใบปะหน้าโดย purchase". Body: raw JSON.
(The cURL example actually posts to **`{{BASE_URL}}/v2/label/`** — the heading says `/label/`. Verify which path the sandbox expects.)

**Request:**

| Field (exact key) | Optional | Type | Description |
|---|---|---|---|
| `api_key` | required | String | Api key verify Marketplace |
| `purchase_id` | required | Integer | purchase id Shippop |
| `tracking_code` | yes | String | SHIPPOP code, comma-separated. Ex. `SP009391312,SP009391327,SP009391331` |
| `size` | yes | String | `A4`, `A5`, `A6`, `letter` (envelop 162x80mm), `letter4x6` (envelop 152x90mm), `sticker` (8x8 cm), `sticker4x6` (4x6 inch), `sticker100x75` (100x75 mm), `paperang` (paperang printer) |
| `logo` | yes | String | Url logo |
| `schema` | yes | String | `"http"` or `"https"` (otherwise depends on relative path) |
| `type` | yes | String | `html` (default), `pdf`, `json` |
| `showproduct` | yes | int | Show product detail + order number on label (only `sticker4x6`): `0` = hide (default), `1` = show |
| `each` | yes | int | `0` = not separate (default), `1` = separate |
| `options[{tracking_code}]` | yes | Label Option Data Object | Replace origin detail on label (when origin differs from booking) |
| `hide_information` | yes | int | `0` = not hide (default), `1` = hide receiver information |

**Label Option Data Object** (`options[<SHIPPOP tracking_code>]`):
- `replaceOrigin`: Object = { `name`, `address`, `district`, `state`, `province`, `tel` }
- `orderDate`: String (e.g. `"2023-07-01"`)
- `printDate`: String (e.g. `"2023-07-02"`)

**Example request (verbatim):**
```json
{
    "api_key": "{{YOUR_API_KEY}}",
    "tracking_code": "SP522560308,SP522558132",
    "size": "sticker4x6",
    "type": "html",
    "showproduct": 1,
    "options": {
        "SP522560308": {
            "replaceOrigin": {
                "name": "ผู้ส่งต้นทาง1",
                "address": "เลขที่ 15 ห้อง 601 ชั้น 6 อาคารเซนจูรี่ เดอะ มูฟวี่ พลาซ่า",
                "district": "สามเสนใน",
                "state": "พญาไท",
                "province": "กรุงเทพมหานคร",
                "tel": "01234567890"
            },
            "orderDate": "2023-07-01",
            "printDate": "2023-07-02"
        },
        "SP522558132": { "...": "same shape" }
    }
}
```
cURL example (by purchase_id): `curl --location -g '{{BASE_URL}}/v2/label/' --data '{ "api_key":"{{YOUR_API_KEY}}", "purchase_id":"24744979", "type":"html", "size":"sticker4x6" }'`

**How the label is returned:**
- For **`type: "html"`** (default) the response is JSON with the label markup inline in an **`html`** field:
  ```json
  { "status": true, "html": "<!DOCTYPE html><html><head>...</html>" }
  ```
- For **`type: "pdf"`** and **`type: "json"`**: the page documents these as valid `type` values but does **not** show a separate response example for them → exact response field name for PDF = **NOT FOUND** (likely returns the PDF directly or a URL, but not shown on the page). Verify against the sandbox.

There is also a section **6.2 LABEL TRACKING CODE** (same idea, keyed by tracking_code) — same field set.

---

## 7. API key / Market ID placement

- Authentication is by **`api_key` sent inside the request body** — as a JSON field for `/pricelist/`, `/booking/`, `/label/`, and as a **formdata** field for `/confirm/`. There is **no** `Authorization` header, no `X-API-*` header. (searched: none found).
- The api_key is described as **"Api key : Verify Marketplace"** / **"Api key verify Marketplace"** — i.e. the Marketplace (Market ID **B-3469**) is identified by the api_key itself.
- There is **no `market_id` / "Market ID" request field anywhere** on the page (searched `Market ID`, `market_id`, `B-3469` → all **NOT FOUND**). The market id is bound to the api_key, not passed per request.

---

## Bonus endpoints found

- **3.3 UPDATE ORDER** — POST `{{BASE_URL}}/update/` (Flash only), formdata: `api_key`, `tracking_code`, `data[0][parcel][weight|width|length|height]`. No response body.
- **3.4 CANCEL ORDER** — POST `{{BASE_URL}}/cancel/`, JSON: `api_key`, `courier_tracking_code`. Response: `status`, `code`, `message`. (One example posts `tracking_code` instead of `courier_tracking_code` — table says `courier_tracking_code`.)

## Error codes (partial, from "Error Code" table)
`SERVICE_MAINTENANCE`, `ERR_MAINTENANCE`, `ERR_ORIGIN` (Invalid Origin area), `ERR_DEST` (Invalid Destination area), `ERR_DEFAULT`, `ERR_REALTIME_CHECKPRICE`, `ERR_REVERSE_GEOCODE_FAILURE`, `ERR_COD_AMOUNT_EXCEED`, `ERR_NOT_SUPPORT_COD`, `NOT_SUPPORT_COD`, `INVALID_WEIGHT`, `ERR_OVER_WEIGHT`, `ERR_MIN_ORDER_10`, `ERR_OUT_OF_AREA` (Service Unavailable), `ERR_SIZE`, `ERR_OVER_SIZE`, `ERR_MIN_ORDER_{x}`, `DAY_OFF` (Holiday) … (list truncated on page).
