# Leda Diecutting — mobil + web

Tek Expo kod tabanından **iOS, Android ve web** (`diecutting.ledayazilim.com`).
API: `api-diecutting.ledayazilim.com` ([ledayazilim-diecutting-be](https://github.com/sdsonbay/ledayazilim-diecutting-be)).

```bash
cp .env.example .env.local     # EXPO_PUBLIC_API_URL
npm ci
npm run web                    # tarayıcı
npm run ios | npm run android  # development build gerekir (expo-gl, secure-store…)
npm run typecheck && npm run lint && npm test
```

## Özellikler

| Ekran | İçerik |
|-------|--------|
| Katalog | 37k+ şablon, arama, malzeme/aile filtreleri, favoriler, sonsuz kaydırma |
| Editör | Parametreler, 2D bıçak izi (pinch-zoom), **3D katlama** (Three.js / R3F), tabaka yerleşimi + maliyet, baskı görseli ve finish efektleri, kayıt, PDF/DXF/SVG indirme |
| Stüdyo | Hazır aileden üretim veya dokunmatik çizim → 3D |
| Yükle | SVG / DXF / PDF / PNG / JPG'den bıçak izi |
| Kayıtlar · Hesap · Kredi | Senkron tasarımlar, tema/dil, API anahtarı, kredi paketleri |

## Yapı

```
src/app/            Expo Router ekranları ((tabs), template/[id], auth/*, credits)
src/components/     ui/ (tasarım sistemi), dieline/, fold/, editor/
src/fold/           Katlama geometrisi (referans web uygulamasından, platformdan bağımsız)
src/lib/            API istemcisi, tipler, tabaka yerleşimi, depolama
src/studio/         Çizim geometrisi + tuval
src/theme/          Renk, tipografi, hareket token'ları (açık/koyu)
src/i18n/           TR / EN
```

`*.native.ts` / `*.web.ts` dosyaları platforma özel uygulamalardır (dosya kaydetme, R3F girişi, finish maskeleri).

## Dağıtım

**Web** — `Dockerfile` (Expo static export → nginx, :8080). Pod `/api/` isteklerini kümedeki API'ye proxy'ler
(`API_PROXY_PASS`), bu yüzden aynı imaj dev ve prod'da çalışır.

| Workflow | Tetik | İş |
|----------|-------|----|
| `CI` | PR | typecheck, lint, test, web export |
| `Deploy dev` | `main` push | imaj → `ghcr.io/sdsonbay/ledayazilim-diecutting-fe:sha-…` → kube-objects `fe/overlays/dev`; `EXPO_TOKEN` varsa `preview` kanalına OTA |
| `Deploy prod (web)` | **Manuel**, `production` onayı | Dev imajını `prod-…` olarak işaretler → `fe/overlays/prod` |
| `Mobile (EAS)` | **Manuel** | `preview` (dahili) veya `production` derlemesi; istenirse mağazalara gönderim |

**Mobil** — EAS profilleri (`eas.json`): `development` (dev client), `preview` (dev API), `production` (prod API).
Bundle id: `com.ledayazilim.diecutting` (+ `.preview` / `.dev`).

### Gerekli GitHub ayarları

| Tür | Ad | Açıklama |
|-----|----|----------|
| Secret | `KUBE_OBJECTS_TOKEN` | kube-objects reposuna `Contents: write` fine-grained PAT |
| Secret | `EXPO_TOKEN` | expo.dev → Access tokens (mobil derleme/OTA) |
| Variable | `EAS_PROJECT_ID` | `npx eas-cli init` sonrası proje kimliği |
| Environment | `production` | Required reviewers → prod web ve mağaza derlemeleri onaylı |
