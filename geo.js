/**
 * routes/geo.js
 * -----------------------------------------------------------
 * ✅ 2026-07 재작성: 브이월드(VWorld) → 카카오(Kakao) 로컬 API로 교체
 *
 * 왜 바꿨나:
 *   브이월드는 국내 공간정보 유출 방지를 위해 "IDC(데이터센터) 대역 IP"에서
 *   오는 요청을 정책적으로 차단합니다(공간정보관리법 제16조 관련). 로컬(집
 *   인터넷)에서는 잘 되지만, Render 같은 클라우드 서버에 배포하면 502로
 *   막힙니다. 즉 브이월드는 "서버에 배포해서 쓰는" 이번 프로젝트 용도에는
 *   구조적으로 맞지 않는 API였습니다.
 *
 *   카카오 로컬 API는 민간 상업 서비스라 이런 제한이 없고, 서버에서
 *   호출하는 게 표준적인 사용 방식입니다.
 *
 * 출처: Kakao Developers - https://developers.kakao.com/docs/latest/ko/local/dev-guide
 *
 * 사전 준비 (아래 절차를 안 하면 401/403 에러가 납니다):
 *   1) https://developers.kakao.com 가입 → 애플리케이션 추가
 *   2) 앱 설정 → 앱 키에서 "REST API 키" 복사 → .env의 KAKAO_REST_API_KEY에 입력
 *   3) 앱 설정 → 카카오맵 → 사용 설정을 ON으로 변경
 *      (2024-12-01 이후 신규 앱은 이 설정을 안 하면 로컬 API가 막힙니다)
 * -----------------------------------------------------------
 */
const express = require("express");
const axios = require("axios");
const router = express.Router();

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
const ADDRESS_URL = "https://dapi.kakao.com/v2/local/search/address.json";
const KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";

function authHeader() {
  return { Authorization: `KakaoAK ${KAKAO_KEY}` };
}

async function tryAddressSearch(query) {
  const { data } = await axios.get(ADDRESS_URL, {
    headers: authHeader(),
    params: { query, analyze_type: "similar", size: 5 }, // similar: 지번 번호가 없어도 근접 매칭
    timeout: 8000,
  });
  return (data.documents || []).map((d) => ({
    title: d.address_name,
    address: d.road_address?.address_name || d.address_name,
    lat: Number(d.y),
    lon: Number(d.x),
  }));
}

async function tryKeywordSearch(query) {
  const { data } = await axios.get(KEYWORD_URL, {
    headers: authHeader(),
    params: { query, size: 5 },
    timeout: 8000,
  });
  return (data.documents || []).map((d) => ({
    title: d.place_name,
    address: d.road_address_name || d.address_name,
    lat: Number(d.y),
    lon: Number(d.x),
  }));
}

// GET /api/geo/search?query=강원 태백시 동점동
router.get("/search", async (req, res) => {
  const query = (req.query.query || "").trim();
  if (!query) return res.status(400).json({ error: "query 파라미터가 필요합니다." });
  if (!KAKAO_KEY) return res.status(500).json({ error: "KAKAO_REST_API_KEY가 설정되지 않았습니다. .env를 확인하세요." });

  const attempts = [];
  let tokens = query.split(/\s+/);

  try {
    while (tokens.length > 0) {
      const addr = tokens.join(" ");

      let results = await tryAddressSearch(addr);
      attempts.push(`address:"${addr}" → ${results.length}건`);
      if (results.length) return res.json({ source: "Kakao 로컬 API (주소 검색)", count: results.length, results, attempts });

      results = await tryKeywordSearch(addr);
      attempts.push(`keyword:"${addr}" → ${results.length}건`);
      if (results.length) return res.json({ source: "Kakao 로컬 API (키워드 검색)", count: results.length, results, attempts });

      tokens = tokens.slice(0, -1); // 마지막 단어(리 등)를 떼고 다시 시도
    }

    res.json({ source: "Kakao", count: 0, results: [], attempts, note: "모든 방식에서 좌표를 찾지 못했습니다." });
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    res.status(502).json({
      error: "Kakao API 호출 실패",
      detail: err.message,
      status,
      body,
      attempts,
      hint: status === 401 || status === 403
        ? "REST API 키가 틀렸거나, 카카오 개발자 콘솔에서 '카카오맵 사용 설정'이 꺼져있을 수 있습니다."
        : undefined,
    });
  }
});

// GET /api/geo/elevation?lat=37.16&lon=128.98  ← 스텁(TODO)
router.get("/elevation", async (req, res) => {
  res.status(501).json({
    error: "미구현",
    reason: "고도(DEM) 조회 API는 별도 조사가 필요해 이 스켈레톤에는 포함하지 않았습니다.",
    todo: [
      "국토지리정보원(국토정보플랫폼)에 자료 이용 협의",
      "최후 대안: 사용자가 직접 입력(현행 프론트엔드 기본 동작)",
    ],
  });
});

module.exports = router;
