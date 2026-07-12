/**
 * routes/weather.js
 * -----------------------------------------------------------
 * 기상청 단기예보 조회서비스 연동
 * 출처: 공공데이터포털 - 기상청_단기예보 조회서비스
 *       https://www.data.go.kr/data/15084084/openapi.do
 *
 * 위경도 좌표를 기상청 격자좌표(nx, ny)로 변환해야 하는데,
 * 이 변환식은 기상청이 공식 배포하는 "격자-위경도 변환 프로그램 소스"를
 * 그대로 옮긴 것입니다 (LCC 도법, 국내 개발자들이 공통으로 사용하는 표준 코드).
 *
 * ⚠ 주의: 단기예보 API는 "지금~수일 내 예보"만 제공합니다.
 *   우리 평가 로직에서 필요한 "연평균 기온" 같은 장기 평년값은
 *   기상청 "기후평년값 조회서비스"처럼 별도 API를 써야 합니다.
 *   이 파일은 우선 "현재 기온"을 예시로 연동한 스켈레톤이며,
 *   실서비스 전 담당 API를 기후평년값 서비스로 교체하는 걸 권장합니다.
 * -----------------------------------------------------------
 */
const express = require("express");
const axios = require("axios");
const router = express.Router();

const SERVICE_KEY = process.env.PUBLIC_DATA_SERVICE_KEY;
const BASE_URL = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";

// ---- 기상청 공식 격자-위경도 변환식 (LCC 투영) ----
function latLonToGrid(lat, lon) {
  const RE = 6371.00877, GRID = 5.0;
  const SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0;
  const XO = 43, YO = 136;
  const DEGRAD = Math.PI / 180.0;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD, olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + (lat * DEGRAD) * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
  return { nx, ny };
}

function latestBaseDateTime() {
  // 단기예보는 02,05,08,11,14,17,20,23시(KST)에 발표됨. 발표 10분 후부터 조회 가능.
  const slots = [23, 20, 17, 14, 11, 8, 5, 2];
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC → KST 보정
  let h = now.getUTCHours();
  let d = new Date(now);
  let base = slots.find((s) => h >= s + (h === s ? 0 : 0) && (h > s || (h === s)));
  base = slots.find((s) => h - s >= 0) ?? null;
  if (base === null) { d.setUTCDate(d.getUTCDate() - 1); base = 23; }
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return { base_date: `${yyyy}${mm}${dd}`, base_time: `${String(base).padStart(2, "0")}00` };
}

// GET /api/weather?lat=37.1&lon=128.9
router.get("/", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return res.status(400).json({ error: "lat, lon 쿼리 파라미터가 필요합니다." });
    }
    const { nx, ny } = latLonToGrid(lat, lon);
    const { base_date, base_time } = latestBaseDateTime();

    const { data } = await axios.get(BASE_URL, {
      params: {
        serviceKey: SERVICE_KEY,
        numOfRows: 100,
        pageNo: 1,
        dataType: "JSON",
        base_date,
        base_time,
        nx,
        ny,
      },
      timeout: 8000,
    });

    const items = data?.response?.body?.items?.item || [];
    const tempItem = items.find((it) => it.category === "TMP"); // 1시간 기온
    res.json({
      source: "기상청 단기예보 조회서비스 (data.go.kr)",
      grid: { nx, ny },
      base_date,
      base_time,
      temperatureC: tempItem ? Number(tempItem.fcstValue) : null,
      raw_note: "TMP 항목이 현재(최근 발표) 기온입니다. 연평균 기온이 필요하면 기후평년값 API로 교체하세요.",
    });
  } catch (err) {
    res.status(502).json({ error: "기상청 API 호출 실패", detail: err.message });
  }
});

module.exports = router;
