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
| Ana sayfa | Markalı kutunun canlı 3D katlanışı, nasıl çalışır, popüler aileler, özellikler |
| Katalog | 37k+ şablon, arama, malzeme/aile filtreleri, favoriler, sonsuz kaydırma, derin bağlantı (`?material=&category=`) |
| Editör | Parametreler (mm / inç), 2D bıçak izi + otomatik ölçü çizgileri, **sıralı 3D katlama**, tabaka yerleşimi + maliyet, baskı görseli ve finish, malzeme (beyaz / kraft / oluklu / siyah), PNG / GLB, paylaşım bağlantısı, kayıt, PDF/DXF/SVG |
| Stüdyo | Hazır aileden üretim, dokunmatik çizim veya dosyadan (SVG / DXF / PDF / PNG / JPG) → 3D |
| Kayıtlar · Hesap · Kredi | Senkron tasarımlar, tema/dil/birim, API anahtarı, kredi paketleri |

### 3D katlama motoru (`src/fold/foldPlan.ts`)

- **Gerçek menteşe:** her kırım kartonun iç yüzeyi etrafında döner; 180° katlanan parça tam bir kalınlık üstüne oturur.
- **Montaj sırası:** gövde → yapıştırma kanadı → alt toz kapakları → alt kapak/dil → üst toz kapakları → üst kapak/dil
  (rol ve konuma göre otomatik; her kırım kendi zaman penceresinde).
- **Katmanlama:** kapalı pozda her panel öncekilere karşı sınanır; çakışan menteşe bir kalınlık dışarı alınır.
- **Baskı dışarıda:** gövde baskılı tarafa katlanıyorsa montaj aynalanır.
- `src/fold/foldPlan.test.ts`: 12 kutu tipinde (tuck end, kilitli/otomatik taban, FEFCO, tepsi, kılıf, tüp…)
  kapalı pozda **sıfır çakışma**, baskılı yüz dışarıda ve sıra kuralları.

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
| `Deploy` | `main` push | imaj → `ghcr.io/sdsonbay/ledayazilim-diecutting-fe:{sha,prod}-…` → kube-objects `fe/overlays/dev` + `fe/overlays/prod` (`diecutting.ledayazilim.com`); `EXPO_TOKEN` varsa `preview` kanalına OTA |
| `Prod sürüm seç (geri alma, web)` | **Manuel** | Var olan bir `sha-…` imajını `prod-…` olarak işaretler → `fe/overlays/prod` |
| `Mobile (EAS)` | **Manuel** | `preview` (dahili) veya `production` derlemesi; istenirse mağazalara gönderim |

**Mobil** — Expo projesi [`@leda-yazilim-2/leda-diecutting`](https://expo.dev/accounts/leda-yazilim-2/projects/leda-diecutting).
EAS profilleri (`eas.json`): `development` (dev client), `preview` (dev API), `production` (prod API).
Bundle id: `com.ledayazilim.diecutting` (+ `.preview` / `.dev`).

**Marka** — `assets/brand/`: işaret (`mark.svg`), yatay logo (açık/koyu), sosyal görsel. Uygulama ikonları `assets/*.png`.

### Gerekli GitHub ayarları

| Tür | Ad | Açıklama |
|-----|----|----------|
| Secret | `KUBE_OBJECTS_DEPLOY_KEY` | kube-objects reposunda yazma yetkili deploy key'in özel anahtarı (alternatif: `KUBE_OBJECTS_TOKEN`) |
| Secret | `EXPO_TOKEN` | `leda-yazilim-2` hesabındaki `github-actions-leda-diecutting` robotunun token'ı |
| Variable | `EAS_PROJECT_ID` | `788acf67-f577-43a7-9069-e8bc9f6bb596` (boşsa `app.config.ts` varsayılanı) |
| Environment | `production` | Prod yayını bu ortamda çalışır; onay istenirse *Required reviewers* eklenebilir |
