# 폐광산 데이터센터 적합성 평가 — 공공데이터 자동조회 백엔드

프론트엔드 평가기(mine-dc-evaluator)에서 "폐광산 이름 검색 → 자동입력" 기능을
실제로 작동시키기 위한 Express 백엔드 스켈레톤입니다.

## 1. 구성

```
backend/
├── server.js              # 진입점
├── routes/
│   ├── weather.js          # 기상청 단기예보 API (좌표→기온)
│   ├── mine.js              # KOMIR 폐광산 위치정보 (로컬 CSV 검색)
│   └── geo.js                # VWorld 지오코딩 (지명/주소→좌표)
├── data/
│   └── komir_abandoned_mines.csv   # ⚠ 더미 데이터, 교체 필요
├── .env.example
└── package.json
```

## 2. 실제로 되는 것 / 아직 안 되는 것

| 기능 | 상태 | 비고 |
|---|---|---|
| 폐광산 이름 검색 | 🟢 **실제 데이터 반영 완료** | `data/komir_abandoned_mines.csv`를 사용자가 제공한 KOMIR 실제 파일(2024-12-31 기준, 5,147건)로 교체함. UTF-8 변환 + 컬럼명 오류 수정 완료 |
| 좌표(위도/경도) | 🔴 **원본에 아예 없음** | KOMIR 파일은 시도/시군구/읍면동/리 주소 텍스트만 제공. `/api/mine/search` 결과의 `소재지` 필드를 `/api/geo/search`(VWorld)로 넘겨 좌표를 얻는 2단계 조회가 필수 |
| 현재 기온 조회 | 🟢 구현됨 | 기상청 단기예보 API 연동, 서비스키만 넣으면 작동 (좌표 필요 — 위 참고) |
| 연평균 기온(평년값) | 🔴 미구현 | 단기예보 API로는 "지금 기온"만 가능. 기후평년값 API로 교체 필요(TODO 주석 참고) |
| 지명 → 좌표 변환 | 🟢 구현됨 | VWorld 검색 API, 키만 넣으면 작동 |
| 좌표 → 고도(DEM) | 🔴 미구현(스텁) | VWorld 표고 API 접근 가능 여부 별도 확인 필요 |
| 변전소 거리 | ⛔ 자동화 불가 | 한전 변전소 위치는 국가기밀시설로 비공개. 수동 입력만 가능 |
| RMR, 암종, 단층 | 🔴 미구현 | KIGAM 국가지질도는 지도(WMS) 형태로만 제공. 좌표 기반 속성값 자동추출은 별도 개발(GetFeatureInfo) 필요 |

### KOMIR 원본 파일에서 확인된 주의사항

1. **인코딩**: 원본은 EUC-KR입니다. 이 저장소의 CSV는 UTF-8로 이미 변환해뒀습니다.
2. **컬럼명 오류**: 원본 헤더의 "광산명"과 "광산유형" 컬럼에 실제 내용이 서로 바뀌어 들어있었습니다
   (예: "광산명" 컬럼에 광종이, "광산유형" 컬럼에 진짜 광산 이름이 들어있음).
   이 저장소의 CSV는 광산명/광종으로 바로잡아 저장했습니다. 새 원본 파일을 받아 교체할 때
   이 문제가 재현되는지 반드시 확인하세요.
3. **광산명에 콤마가 포함된 행이 실제로 존재**합니다 (예: `"천년,천대"`). 단순 `split(",")`로는
   깨지기 때문에 `routes/mine.js`에 따옴표를 인식하는 간이 CSV 파서를 넣어뒀습니다.
4. **좌표 없음**: 시도/시군구/읍면동/리 행정주소만 제공되며, 위경도는 없습니다.

**즉 이 코드는 "완성품"이 아니라 실제로 돌아가는 부분(광산 검색, 기온, 지오코딩)과
아직 개발이 더 필요한 부분(고도, 지질, 변전소, 좌표 자동 연결 파이프라인)을 명확히 구분해둔 상태입니다.**

## 3. 설치 및 실행

```bash
cd backend
npm install
cp .env.example .env
# .env 파일 열어서 아래 두 키 입력
#   PUBLIC_DATA_SERVICE_KEY  ← data.go.kr에서 발급 (기상청 단기예보 API 활용신청)
#   VWORLD_API_KEY           ← vworld.kr에서 발급

npm start
# http://localhost:4000/health 로 정상 기동 확인
```

## 4. API 키 발급 절차

**공공데이터포털 (data.go.kr)**
1. 회원가입 → 로그인
2. "기상청_단기예보 조회서비스" 검색 → 활용신청 (승인 보통 1일 이내, 자동승인인 경우도 있음)
3. 마이페이지 → 개발계정 → 일반 인증키(Decoding) 복사

**브이월드 (vworld.kr)**
1. 회원가입 → 로그인
2. 오픈API → 인증키 발급 신청 (도메인/IP 등록 필요)
3. 승인 후 발급된 인증키 복사

## 5. KOMIR 폐광산 데이터

✅ 이미 실제 파일(2024-12-31 기준)로 반영해뒀습니다. 더 최신 파일로 갱신하려면:

1. https://www.data.go.kr/data/15117195/fileData.do 접속
2. CSV 파일 다운로드 (원본은 EUC-KR 인코딩)
3. UTF-8로 변환하고, "광산명"/"광산유형" 컬럼 내용이 서로 바뀌어 있는지 확인 후 필요시 바로잡아
   `data/komir_abandoned_mines.csv` 교체 (컬럼 순서: 광산명,광종,시도,시군구,읍면동,리)
4. 서버 재시작 또는 `POST /api/mine/reload` 호출

파이썬으로 변환할 때 참고 코드:
```python
import pandas as pd
df = pd.read_csv("원본파일.csv", encoding="euc-kr")
df = df.rename(columns={"광산명": "광종", "광산유형": "광산명"})  # 원본 컬럼명 오류 보정
df = df[["광산명", "광종", "시도", "시군구", "읍면동", "리"]].fillna("")
df.to_csv("data/komir_abandoned_mines.csv", index=False, encoding="utf-8")
```

## 6. 배포

간단한 배포라면 Render, Railway, Fly.io 같은 PaaS에 그대로 올려도 됩니다.
사내 인프라에 올릴 경우 `.env`의 서비스키가 노출되지 않도록 환경변수로 주입하세요.

## 7. 프론트엔드 연동 지점

좌표가 없는 KOMIR 데이터 특성상, 실제로는 아래 3단계를 순서대로 호출해야 합니다.

```js
// ① 광산 검색 → 이름 + 주소 텍스트
const r1 = await fetch(`${API_BASE}/api/mine/search?q=${encodeURIComponent(query)}`);
const { results } = await r1.json();
const mine = results[0]; // 사용자가 목록에서 하나 선택

// ② 주소 → 좌표 (VWorld 지오코딩)
const r2 = await fetch(`${API_BASE}/api/geo/search?query=${encodeURIComponent(mine.소재지)}`);
const { results: geoResults } = await r2.json();
const { lat, lon } = geoResults[0];

// ③ 좌표 → 기온 (기상청)
const r3 = await fetch(`${API_BASE}/api/weather?lat=${lat}&lon=${lon}`);
const weather = await r3.json();
```

`API_BASE`는 배포한 백엔드 주소(예: `https://your-backend.onrender.com`)로 설정하세요.
프론트엔드 아티팩트(mine-dc-evaluator.jsx)는 현재 이 3단계를 실제로 호출하지 않고
"이 단계들이 필요하다"는 UI 안내만 표시합니다. 실제 연동은 위 코드를
평가기 컴포넌트의 `applyMine` 함수 안에 넣으면 됩니다.
