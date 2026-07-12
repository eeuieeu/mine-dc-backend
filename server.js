/**
 * server.js
 * -----------------------------------------------------------
 * 폐광산 데이터센터 적합성 평가 - 공공데이터 자동조회 백엔드 진입점
 *
 * 실행 방법:
 *   1) npm install
 *   2) .env.example 을 .env 로 복사하고 API 키 입력
 *   3) data/komir_abandoned_mines.csv 를 실제 다운로드 파일로 교체
 *   4) npm start   (기본 포트 4000)
 *
 * 프론트엔드(React 아티팩트)에서는 이 서버를
 *   GET /api/mine/search?q=...
 *   GET /api/weather?lat=...&lon=...
 *   GET /api/geo/search?query=...
 * 형태로 호출하면 됩니다.
 * -----------------------------------------------------------
 */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const NodeCache = require("node-cache");

const weatherRoute = require("./routes/weather");
const mineRoute = require("./routes/mine");
const geoRoute = require("./routes/geo");

const app = express();
const PORT = process.env.PORT || 4000;

// 반복 조회 비용 절감을 위한 간단한 응답 캐시(선택 적용은 각 라우트에서)
app.locals.cache = new NodeCache({
  stdTTL: Number(process.env.CACHE_TTL_SECONDS || 3600),
});

app.use(cors());
app.use(express.json());

// 헬스체크
app.get("/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use("/api/weather", weatherRoute);
app.use("/api/mine", mineRoute);
app.use("/api/geo", geoRoute);

// 공통 에러 핸들러
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "서버 내부 오류", detail: err.message });
});

app.listen(PORT, () => {
  console.log(`✅ mine-dc-evaluator backend running on http://localhost:${PORT}`);
  console.log(`   GET /api/mine/search?q=태백`);
  console.log(`   GET /api/weather?lat=37.16&lon=128.98`);
  console.log(`   GET /api/geo/search?query=태백시`);
});
