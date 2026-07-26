import { MatchResult } from "../types";

export interface SampleReceipt {
  id: string;
  name: string;
  date: string;
  itemsCount: number;
  qtyCount: number;
  results: MatchResult[];
  // Smaller preview representations for the UI
  description: string;
}

export const SAMPLE_RECEIPTS: SampleReceipt[] = [
  {
    id: "receipt_1",
    name: "POS Sales Report (14/07/2026)",
    date: "14/07/2026",
    itemsCount: 8,
    qtyCount: 12,
    description: "Watson K Avenue Nakornsawan, Branch 3327 - Herhyness",
    results: [
      {
        plu: "321137",
        name_th: "SEMI_โทนเนอร์แพด ดำ 80 แผ่น",
        price: 395,
        qty: 1,
        total: 395,
        image_url: "https://api.hynessbeauty.com/uploads/images/1759480797470-781543788.png",
        matchType: "exact",
        levenshteinDistance: 0
      },
      {
        plu: "324755",
        name_th: "HH MM ทินท์กันแดด เอสเอฟ 40ML (324755 / 324785)",
        price: 490,
        qty: 2,
        total: 980,
        image_url: "https://api.hynessbeauty.com/uploads/images/1749696112345-678703026.png",
        originalPlu: "324785",
        matchType: "typo",
        levenshteinDistance: 1
      },
      {
        plu: "293878",
        name_th: "SEMI_มาส์กดำกล่อง",
        price: 580,
        qty: 1,
        total: 580,
        image_url: "https://api.hynessbeauty.com/uploads/images/1749696006972-74508736.png",
        matchType: "exact",
        levenshteinDistance: 0
      },
      {
        plu: "302047",
        name_th: "CONSHINE_ไฮดราโกลว์ครีม 30ML",
        price: 790,
        qty: 1,
        total: 790,
        image_url: "https://api.hynessbeauty.com/uploads/images/1772189203237-678703025.png",
        matchType: "exact",
        levenshteinDistance: 0
      },
      {
        plu: "306246",
        name_th: "HER HYNESS พาวเวอร์ โกลว์ พอร์ รีไฟเนอร์ เซรั่ม 30ML",
        price: 890,
        qty: 2,
        total: 1780,
        image_url: "https://api.hynessbeauty.com/uploads/images/1749696223456-678703027.png",
        matchType: "exact",
        levenshteinDistance: 0
      },
      {
        plu: "306249",
        name_th: "HER HYNESS พาวเวอร์ โกลว์ ครีม 50ML",
        price: 1090,
        qty: 2,
        total: 2180,
        image_url: "https://api.hynessbeauty.com/uploads/images/1749696334567-678703028.png",
        matchType: "exact",
        levenshteinDistance: 0
      },
      {
        plu: "310589",
        name_th: "HER HYNESS 3ดี พาวเวอร์ แอคเน่ เคลียร์ สปอต เจล 15ML",
        price: 340,
        qty: 2,
        total: 680,
        image_url: "https://api.hynessbeauty.com/uploads/images/1749696445678-678703029.png",
        matchType: "exact",
        levenshteinDistance: 0
      },
      {
        plu: "316981",
        name_th: "HER HYNESS ยูวี อะแดปทีฟ ไฮยา ซันสกรีน 50ML",
        price: 1090,
        qty: 1,
        total: 1090,
        image_url: "https://api.hynessbeauty.com/uploads/images/1749696556789-678703030.png",
        matchType: "exact",
        levenshteinDistance: 0
      }
    ]
  },
  {
    id: "receipt_2",
    name: "POS Sales Report (16/07/2026)",
    date: "16/07/2026",
    itemsCount: 7,
    qtyCount: 9,
    description: "Watson K Avenue Nakornsawan, Branch 3327 - Herhyness",
    results: [
      {
        plu: "293879",
        name_th: "HER HYNESS มาส์กดำ แผ่นเดี่ยว",
        price: 89,
        qty: 3,
        total: 267,
        image_url: "https://api.hynessbeauty.com/uploads/images/1749696667890-678703031.png",
        matchType: "exact",
        levenshteinDistance: 0
      },
      {
        plu: "321137",
        name_th: "SEMI_โทนเนอร์แพด ดำ 80 แผ่น",
        price: 395,
        qty: 1,
        total: 395,
        image_url: "https://api.hynessbeauty.com/uploads/images/1759480797470-781543788.png",
        matchType: "exact",
        levenshteinDistance: 0
      },
      {
        plu: "327966",
        name_th: "HER HYNESS อินสแตนท์ เฟิร์ม 3ดี แผ่นมาส์ก",
        price: 395,
        qty: 1,
        total: 395,
        image_url: "https://api.hynessbeauty.com/uploads/images/1749696778901-678703032.png",
        matchType: "exact",
        levenshteinDistance: 0
      },
      {
        plu: "293878",
        name_th: "SEMI_มาส์กดำกล่อง",
        price: 580,
        qty: 1,
        total: 580,
        image_url: "https://api.hynessbeauty.com/uploads/images/1749696006972-74508736.png",
        matchType: "exact",
        levenshteinDistance: 0
      },
      {
        plu: "296363",
        name_th: "HER HYNESS พรีไบโอ แอนตี้ แอคเน่ เซรั่ม 30ML",
        price: 890,
        qty: 1,
        total: 890,
        image_url: "https://api.hynessbeauty.com/uploads/images/1749696889012-678703033.png",
        matchType: "exact",
        levenshteinDistance: 0
      },
      {
        plu: "298527",
        name_th: "HER HYNESS พรีไบโอ แอนตี้ แอคเน่ คลีนเซอร์ 100ML",
        price: 380,
        qty: 1,
        total: 380,
        image_url: "https://api.hynessbeauty.com/uploads/images/1749696990123-678703034.png",
        matchType: "exact",
        levenshteinDistance: 0
      },
      {
        plu: "310589",
        name_th: "HER HYNESS 3ดี พาวเวอร์ แอคเน่ เคลียร์ สปอต เจล 15ML",
        price: 340,
        qty: 1,
        total: 340,
        image_url: "https://api.hynessbeauty.com/uploads/images/1749696445678-678703029.png",
        matchType: "exact",
        levenshteinDistance: 0
      }
    ]
  }
];
