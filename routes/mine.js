/**
 * routes/mine.js
 * -----------------------------------------------------------
 * 출처: 공공데이터포털 - 한국광해광업공단(KOMIR)_전국 폐광산 위치정보
 *       https://www.data.go.kr/data/15117195/fileData.do
 *
 * ✅ 실제 데이터로 교체 완료 (2024-12-31 기준, 5,147건)
 *
 * ⚠ 원본 파일에서 확인된 주의사항 (2026-07 확인):
 *   1) 원본은 EUC-KR 인코딩이라, 이 저장소에는 UTF-8로 변환해 넣어뒀습니다.
 *   2) 원본 컬럼명 "광산명"/"광산유형"의 실제 내용이 서로 바뀌어 들어있어서
 *      (예: "광산명" 컬럼에 광종이, "광산유형" 컬럼에 실제 광산명이 들어있음)
 *      이 파일에서는 광산명/광종으로 바로잡아 저장했습니다.
 *   3) ⛔ 위도·경도 좌표가 원본에 아예 없습니다. 시도/시군구/읍면동/리 형태의
 *      행정주소 텍스트만 제공됩니다. 그래서 광산을 검색해도 바로 좌표가
 *      나오지 않고, 아래 흐름을 거쳐야 합니다:
 *        ① /api/mine/search   → 광산명 + 주소 텍스트
 *        ② /api/geo/search    → 그 주소 텍스트를 좌표로 변환 (VWorld)
 *        ③ /api/weather        → 변환된 좌표로 기온 조회 (기상청)
 *      프론트엔드에서 이 3단계를 순서대로 호출하도록 구성하세요.
 *   4) 이 데이터셋은 실시간 API가 아니라 "파일데이터"이며 갱신 주기가
 *      깁니다. 최신 파일을 받으면 이 CSV를 통째로 교체하고 서버를
 *      재시작하거나 POST /api/mine/reload 를 호출하세요.
 * -----------------------------------------------------------
 */
const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const CSV_PATH = path.join(__dirname, "..", "data", "komir_abandoned_mines.csv");

// 따옴표로 감싸진 필드(콤마 포함 광산명 등)를 올바르게 처리하는 간이 CSV 파서
// 예: "천년,천대",금속,충북,... 처럼 광산명 자체에 콤마가 들어간 행이 실제로 존재함
function parseCsvLine(line) {
  const cols = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { cols.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  cols.push(cur);
  return cols.map((c) => c.trim());
}

function loadCsv() {
  if (!fs.existsSync(CSV_PATH)) return [];
  const raw = fs.readFileSync(CSV_PATH, "utf-8").trim();
  const [headerLine, ...lines] = raw.split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  return lines
    .filter(Boolean)
    .map((line) => {
      const cols = parseCsvLine(line);
      const row = {};
      headers.forEach((h, i) => (row[h] = cols[i] ?? ""));
      // 검색/지오코딩에 바로 쓸 수 있도록 주소 문자열을 미리 합쳐둠
      row.소재지 = [row.시도, row.시군구, row.읍면동, row.리].filter(Boolean).join(" ");
      return row;
    });
}

// 서버 시작 시 1회 로드 (5,147건 정도는 메모리 검색으로 충분히 빠름)
let MINE_CACHE = loadCsv();

// GET /api/mine/search?q=태백  또는 ?q=금속 처럼 광종 검색도 가능
router.get("/search", (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.status(400).json({ error: "q 쿼리 파라미터(검색어)가 필요합니다." });

  const results = MINE_CACHE.filter(
    (m) =>
      (m.광산명 || "").includes(q) ||
      (m.소재지 || "").includes(q) ||
      (m.광종 || "").includes(q)
  ).slice(0, 30);

  res.json({
    source: "한국광해광업공단(KOMIR) 전국 폐광산 위치정보 (2024-12-31 기준, data.go.kr)",
    count: results.length,
    results,
    note:
      "이 데이터에는 좌표가 없습니다. 선택한 광산의 '소재지' 문자열을 " +
      "/api/geo/search 로 보내 좌표를 먼저 얻은 뒤 /api/weather 를 호출하세요.",
  });
});

// 캐시 수동 재적재용 (CSV 교체 후 서버 재시작 없이 반영하고 싶을 때)
router.post("/reload", (req, res) => {
  MINE_CACHE = loadCsv();
  res.json({ reloaded: true, count: MINE_CACHE.length });
});

module.exports = router;

