/**
 * routes/geo.js
 * -----------------------------------------------------------
 * 출처: 브이월드(VWorld) Open API - https://www.vworld.kr
 *
 * 1) 지명·주소 검색(지오코딩): 실제 안정적으로 제공되는 REST API입니다.
 *    광산명이나 주소를 좌표(위도/경도)로 변환할 때 사용합니다.
 *
 * 2) 특정 좌표의 표고(고도) 조회: VWorld가 3D/DEM 원본 데이터에 대해
 *    보안상 접근을 제한하는 경우가 있어, raw DEM 좌표 조회 API를
 *    바로 쓸 수 없을 수 있습니다. 이 부분은 실제 계약/협의 없이는
 *    확정하기 어려워 이 파일에서는 스텁(TODO)으로만 남겨둡니다.
 *    대안: 국토지리정보원에 직접 자료 이용 협의, 또는 상용 GIS 데이터 구매.
 * -----------------------------------------------------------
 */
/**
 * routes/geo.js
 * -----------------------------------------------------------
 * 출처: 브이월드(VWorld) Open API - https://www.vworld.kr
 *
 * ✅ 2026-07 수정: 주소→좌표 변환은 "검색 API"가 아니라
 *    전용 "주소 API"(service=address, request=getcoord)를 써야
 *    정확히 동작합니다. 처음에 검색 API로 잘못 연동해뒀던 부분을
 *    고쳤습니다. 이 API는 type=PARCEL(지번) / ROAD(도로명) 중
 *    하나를 명시해야 하며, 완전한 지번(번지수)이 없으면 실패할 수
 *    있습니다. KOMIR 주소는 "시도 시군구 읍면동 리"까지만 있고
 *    번지수가 없는 경우가 많아서, 아래처럼 여러 방식을 순서대로
 *    시도하도록 만들었습니다:
 *      ① 주소 API(PARCEL) 그대로 시도
 *      ② 실패하면 주소 API(ROAD)로 시도
 *      ③ 그래도 실패하면 검색 API(type=district, 행정구역 검색)로 시도
 *      ④ 그래도 실패하면 마지막 토큰(리)을 떼고 다시 ①부터 재시도
 *
 * 2) 특정 좌표의 표고(고도) 조회: VWorld가 3D/DEM 원본 데이터에 대해
 *    보안상 접근을 제한하는 경우가 있어, raw DEM 좌표 조회 API를
 *    바로 쓸 수 없을 수 있습니다. 이 부분은 실제 계약/협의 없이는
 *    확정하기 어려워 이 파일에서는 스텁(TODO)으로만 남겨둡니다.
 *    대안: 국토지리정보원에 직접 자료 이용 협의, 또는 상용 GIS 데이터 구매.
 * -----------------------------------------------------------
 */
const express = require("express");
const axios = require("axios");
const router = express.Router();

const VWORLD_KEY = process.env.VWORLD_API_KEY;
const ADDRESS_URL = "http://api.vworld.kr/req/address";
const SEARCH_URL = "http://api.vworld.kr/req/search";

async function tryAddressGeocode(address, type) {
  const { data } = await axios.get(ADDRESS_URL, {
    params: {
      service: "address",
      request: "getcoord",
      version: "2.0",
      crs: "epsg:4326",
      address,
      type, // PARCEL(지번) | ROAD(도로명)
      format: "json",
      key: VWORLD_KEY,
    },
    timeout: 8000,
  });
  const point = data?.response?.result?.point;
  if (data?.response?.status === "OK" && point) {
    return [{ title: address, address, lat: Number(point.y), lon: Number(point.x) }];
  }
  return [];
}

async function trySearchDistrict(query) {
  const { data } = await axios.get(SEARCH_URL, {
    params: {
      service: "search", request: "search", version: "2.0",
      crs: "epsg:4326", size: 5, query, type: "district", format: "json", key: VWORLD_KEY,
    },
    timeout: 8000,
  });
  const items = data?.response?.result?.items || [];
  return items.map((it) => ({
    title: it.title, address: it.address?.road || it.address?.parcel,
    lat: Number(it.point?.y), lon: Number(it.point?.x),
  }));
}

// GET /api/geo/search?query=강원 태백시 동점동
router.get("/search", async (req, res) => {
  const query = (req.query.query || "").trim();
  if (!query) return res.status(400).json({ error: "query 파라미터가 필요합니다." });

  const attempts = [];
  let tokens = query.split(/\s+/);

  try {
    // 토큰을 하나씩 줄여가며 PARCEL → ROAD → district 순서로 시도
    while (tokens.length > 0) {
      const addr = tokens.join(" ");

      let results = await tryAddressGeocode(addr, "PARCEL");
      attempts.push(`address/PARCEL:"${addr}" → ${results.length}건`);
      if (results.length) return res.json({ source: "VWorld 주소 API (PARCEL)", count: results.length, results, attempts });

      results = await tryAddressGeocode(addr, "ROAD");
      attempts.push(`address/ROAD:"${addr}" → ${results.length}건`);
      if (results.length) return res.json({ source: "VWorld 주소 API (ROAD)", count: results.length, results, attempts });

      results = await trySearchDistrict(addr);
      attempts.push(`search/district:"${addr}" → ${results.length}건`);
      if (results.length) return res.json({ source: "VWorld 검색 API (행정구역)", count: results.length, results, attempts });

      tokens = tokens.slice(0, -1); // 마지막 단어(리 등)를 떼고 다시 시도
    }

    res.json({ source: "VWorld", count: 0, results: [], attempts, note: "모든 방식에서 좌표를 찾지 못했습니다. attempts 배열을 확인하세요." });
  } catch (err) {
    res.status(502).json({ error: "VWorld API 호출 실패", detail: err.message, attempts });
  }
});

// GET /api/geo/elevation?lat=37.16&lon=128.98  ← 스텁(TODO)
router.get("/elevation", async (req, res) => {
  res.status(501).json({
    error: "미구현",
    reason:
      "VWorld 표고(DEM) 조회는 별도 승인/제한이 있을 수 있어 이 스켈레톤에는 포함하지 않았습니다.",
    todo: [
      "1) VWorld 오픈API 콘솔에서 표고 관련 API 제공 여부 및 신청 절차 확인",
      "2) 불가할 경우 국토지리정보원(국토정보플랫폼)에 자료 이용 협의",
      "3) 최후 대안: 사용자가 직접 입력(현행 프론트엔드 기본 동작)",
    ],
  });
});

module.exports = router;
