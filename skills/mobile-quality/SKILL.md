---
name: Mobile Quality
description: Cross-platform mobile engineering standards for ${PROJECT_NAME} (Flutter 3.44.2 / Dart) — clean architecture in mobile/, mobile-quality-gate (flutter analyze 0 issues, flutter test), secure enclave storage, offline resilience, and mobile accessibility. Use when building or testing mobile features.
---

# Mobile Quality — ${PROJECT_NAME} (Flutter 3.44.2 / Dart)

Authoritative sources: `mobile/`, `.github/workflows/ci.yml` (`mobile-quality-gate`), `docs/qa/ACCESSIBILITY_TEST_STRATEGY.md`, and the ${PROJECT_NAME} Constitution.

Mobile quality demands high performance, zero jank, battery consciousness, offline resilience, and strict compliance with static analysis gates.

---

## 1. Static Quality & The CI Mobile Quality Gate

The CI pipeline runs `mobile-quality-gate` on Flutter 3.44.2. Local verification must mirror CI:

1. **Static Analysis (Zero Tolerance):**
   ```bash
   cd mobile
   flutter analyze
   ```
   - Must report: `No issues found!`.
   - Any warning, info lint, or error is a blocking defect.
2. **Automated Unit & Widget Tests:**
   ```bash
   flutter test --concurrency=1
   ```
   - Must pass 100% with zero unhandled exceptions or failed assertions.

---

## 2. Clean Architecture & Layer Separation (`mobile/lib/`)

Organize features into three distinct layers:

1. **Presentation Layer (`features/<feature>/presentation/`):**
   - Pure UI widgets and view controllers / blocs.
   - UI consumes state and emits user intents.
   - No direct HTTP calls or raw database queries inside widget classes.
2. **Domain Layer (`features/<feature>/domain/`):**
   - Business entities, value objects, and use cases.
   - Independent of Flutter UI frameworks and external third-party SDKs.
3. **Data Layer (`features/<feature>/data/`):**
   - Remote data sources (HTTP clients communicating with ${PROJECT_NAME} REST APIs).
   - Local data sources (secure encrypted key-value store, local SQLite cache).
   - Repository implementations mapping DTOs to Domain Entities.

---

## 3. Mobile Security & Credential Hygiene (Statutory Data Privacy (GDPR / UU PDP / CCPA per project profile))

1. **Encrypted Storage:**
   - Authentication tokens (JWT / refresh tokens) and user profile caches MUST be stored in hardware-backed secure storage via `flutter_secure_storage` (KeyStore on Android, Keychain on iOS).
   - Plain text `SharedPreferences` or unencrypted local databases are strictly forbidden for personal career data.
2. **Network Security:**
   - Enforce HTTPS across all endpoints; validate SSL certificates.
   - User inputs sanitized on device before transmission to backend endpoints.

---

## 4. Offline Resilience & Network State Handling

Mobile devices operate under intermittent connectivity (4G/3G/offline switches):

1. **Network Interceptor:**
   - Detect network drop gracefully. Wrap HTTP requests in explicit timeout blocks (default timeout: 15 seconds).
2. **State Representation:**
   - Every screen state machine must support an explicit `Offline` or `NetworkError` state with a visible retry button.
   - Never show infinite spinner loaders when an HTTP socket fails.
3. **Local Draft Caching:**
   - In-progress CV edits must be cached locally to prevent data loss if connectivity drops during editing.

---

## 5. UI Robustness, Safe Areas & Accessibility

1. **No RenderFlex Overflows:**
   - Ensure layouts adapt fluidly across small displays (320dp width) to tablets.
   - Use `LayoutBuilder`, `SingleChildScrollView`, and flexible widgets (`Expanded`, `Flexible`).
   - Wrap screens in `SafeArea` to avoid system notch or bottom home-indicator clipping.
2. **Touch Targets & Typography:**
   - Minimum interactive touch target size: `48 x 48 dp`.
   - Text contrast >= 4.5:1 against backgrounds.
   - Support system font scaling without text clipping or button breakage.
3. **Accessibility (Semantics):**
   - Provide explicit `Semantics(label: "...", button: true)` annotations for custom gesture detectors and icon buttons.
   - Ensure TalkBack (Android) and VoiceOver (iOS) can navigate full user journeys.

---

## 6. Performance & Lifecycle Discipline

1. **Frame Rate Target:** Target consistent 60 FPS (or 120 FPS on high-refresh displays). Avoid heavy computation inside widget `build()` methods.
2. **Resource Disposal:** Always cancel stream subscriptions, dispose animation controllers, and close text editing controllers inside `dispose()`.
3. **Asset Optimization:** Compress raster images to WebP format; use vector SVG / vector icons (`lucide_icons` or material symbols) for scalable graphics.

---

## Output Contract

STATUS: DONE / PARTIAL / BLOCKED
- **MOBILE CHANGES:** Summary of Flutter implementation or fixes.
- **FLUTTER ANALYZE OUTPUT:** Verbatim result (must be "No issues found!").
- **FLUTTER TEST OUTPUT:** Test counts and execution duration.
- **VIEWPORT & ACCESSIBILITY COVERAGE:** Devices/resolutions and accessibility verified.
- **RISKS & RECOMMENDATIONS:** Platform-specific considerations.
