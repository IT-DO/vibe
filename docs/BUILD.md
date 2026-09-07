# Сборка: APK для Android и приложение для iPad

Платформенные проекты лежат в репозитории и настроены — нативные модули уже
подключены к целям сборки, разрешения прописаны. Ничего генерировать не нужно.

Ниже три пути. Начните с первого: он не требует ставить ничего, кроме браузера.

---

## Путь 1. APK из CI — без установки инструментов

Самый быстрый способ получить файл для планшета.

1. Запушьте ветку в GitHub (или откройте вкладку **Actions** → «Сборка» →
   **Run workflow**).
2. Дождитесь работы **«APK для Android»** — около 10–15 минут на первой
   сборке, дальше быстрее за счёт кеша.
3. Внизу страницы прогона — артефакт **`apk`**. Скачайте, распакуйте,
   внутри `photo-na-pamyat-<номер>.apk`.

Файл подписан отладочным ключом: на планшет ставится, в Google Play — нет.
Для своего ключа см. раздел «Подпись» ниже.

**Установка на планшет:**

```bash
# по USB, с включённой отладкой
adb install -r photo-na-pamyat-42.apk
```

Или скиньте APK на планшет любым способом и откройте — Android спросит
разрешение на установку из этого источника.

Дальше — [`KIOSK-SETUP.md`](KIOSK-SETUP.md): как закрепить приложение, чтобы
из него нельзя было выйти.

---

## Путь 2. APK на своей машине

### Что нужно поставить

| Инструмент | Версия | Зачем |
|---|---|---|
| Node.js | 18+ (проверялось на 22) | Сборка JS |
| JDK | **17** | React Native 0.76 не собирается на 21 |
| Android SDK | Platform 35, Build-Tools 35.0.0 | Компиляция |
| Android NDK | **26.1.10909125** | Skia и VisionCamera компилируют свой C++ |
| CMake | 3.22.1 | То же |

Проще всего поставить Android Studio и в **SDK Manager → SDK Tools** отметить
NDK и CMake нужных версий. Версия NDK должна совпадать с указанной в
`android/build.gradle` — иначе Gradle попросит именно её.

### Команды

```bash
npm install

# Отладочный APK — быстрее, но требует запущенного Metro для JS
cd android && ./gradlew assembleDebug

# Релизный APK — самодостаточный файл, который и нужен для мероприятия
cd android && ./gradlew assembleRelease
```

Готовый файл: `android/app/build/outputs/apk/release/app-release.apk`.

Сборка только под нужную архитектуру втрое быстрее и даёт файл меньше:

```bash
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

`arm64-v8a` подходит всем планшетам последних лет. Для совсем старых
устройств добавьте `armeabi-v7a`.

### Разработка с горячей перезагрузкой

```bash
npm start                  # Metro в отдельном терминале
npm run android            # сборка и запуск на подключённом устройстве
```

---

## Путь 3. Приложение для iPad

**Нужен компьютер Mac с Xcode.** Собрать приложение для iOS на Windows или
Linux нельзя — это ограничение Apple, обойти его нечем.

### Подготовка

```bash
npm install
cd ios && pod install
open PhotoNaPamyat.xcworkspace     # именно .xcworkspace, не .xcodeproj
```

В Xcode: выберите цель **PhotoNaPamyat** → вкладка **Signing & Capabilities**
→ поставьте галочку **Automatically manage signing** и выберите свою команду
разработчика.

### Вариант А: бесплатный Apple ID — попробовать

Подходит, чтобы посмотреть приложение на своём iPad.

1. Xcode → **Settings → Accounts** → добавьте свой Apple ID.
2. В **Signing & Capabilities** выберите его как Team. Xcode сам придумает
   Bundle Identifier — при необходимости поменяйте на уникальный, например
   `ru.вашадомен.photonapamyat`.
3. Подключите iPad, выберите его в списке устройств, нажмите **Run** (⌘R).
4. На iPad: **Настройки → Основные → VPN и управление устройством** →
   доверять профилю разработчика.

Ограничение: подпись действует **7 дней**, потом приложение перестаёт
запускаться и его надо переустановить. Для мероприятия так делать не стоит.

### Вариант Б: платный аккаунт разработчика — для работы

Apple Developer Program, 99 $ в год. Подпись действует год, и приложение можно
раздать команде.

**Ad-hoc — поставить на конкретные iPad:**

1. В [developer.apple.com](https://developer.apple.com) зарегистрируйте UDID
   каждого планшета.
2. Xcode → **Product → Archive** → **Distribute App** → **Ad Hoc**.
3. Полученный `.ipa` ставится через Apple Configurator или Finder.

**TestFlight — удобнее, если планшетов несколько:**

1. **Product → Archive** → **Distribute App** → **App Store Connect**.
2. В App Store Connect добавьте тестировщиков; они ставят приложение через
   TestFlight.
3. Сборка живёт 90 дней, потом нужна новая.

### Что проверить на iPad после установки

1. **Разрешение на камеру** — запросится при первом запуске.
2. **Разрешение на локальную сеть** — запросится при первом поиске принтера.
   Без него принтер не найдётся, и приложение не получит никакой ошибки:
   iOS блокирует такие обращения молча. Проверить: **Настройки → Фото на
   память → Локальная сеть**.
3. **Гид-доступ** — киоск-режим на iOS включается только так, см.
   [`KIOSK-SETUP.md`](KIOSK-SETUP.md).

---

## Подпись релизного APK

Отладочный ключ годится, чтобы поставить APK вручную. Для Google Play и для
обновлений «поверх» нужен свой.

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore photo-na-pamyat.keystore \
  -alias photo-na-pamyat \
  -keyalg RSA -keysize 2048 -validity 10000
```

Файл ключа **не кладите в репозиторий**. Параметры пропишите в
`~/.gradle/gradle.properties`:

```properties
PHOTO_UPLOAD_STORE_FILE=/полный/путь/photo-na-pamyat.keystore
PHOTO_UPLOAD_STORE_PASSWORD=...
PHOTO_UPLOAD_KEY_ALIAS=photo-na-pamyat
PHOTO_UPLOAD_KEY_PASSWORD=...
```

`android/app/build.gradle` подхватит их автоматически: если свойства заданы,
релиз подписывается вашим ключом, если нет — отладочным.

Потеря ключа означает, что обновить приложение «поверх» установленного больше
нельзя — только удалять и ставить заново. Сделайте копию.

---

## Решения, зашитые в конфигурацию

Эти настройки отличаются от шаблона React Native. Если что-то менять — вот
почему они такие.

| Параметр | Значение | Причина |
|---|---|---|
| `minSdkVersion` | **26** вместо 24 | Требование `react-native-vision-camera` 4 (Camera2 API) |
| `newArchEnabled` | **false** | `react-native-fs` и `react-native-zeroconf` — модули старого поколения; под новой архитектурой они идут через слой совместимости и ломаются на обновлениях. Skia, VisionCamera и MMKV поддерживают обе, так что вернуть можно — но эти два надо проверить |
| `VisionCamera_disableFrameProcessors` | **true** | Приложение только снимает кадры и не обрабатывает видеопоток. Отключение убирает зависимость от `react-native-worklets-core` и заметно сокращает сборку |
| Ориентация | только портрет | Планшет закреплён вертикально, лист 10×15 тоже портретный |
| `react-native-svg` | закреплён на **15.8.0**, без каретки | Версии 15.15+ рассчитаны на более новую Yoga (`StyleSizeLength`), чем поставляется с RN 0.76.5 — сборка Fabric падает на компиляции |
| `RCT_NEW_ARCH_ENABLED=0` в Podfile | выключена | Иначе iOS собирался бы с Fabric, а Android без него, и ошибки вылезали бы только на одной платформе |
| `UIRequiresFullScreen` | true | Киоску не нужны Split View и Slide Over |

Нативные модули (`PhotoKiosk`, `PhotoNetworkInfo`, `PhotoSystemPrint`) живут
прямо в проекте, а не в отдельном npm-пакете, поэтому автолинковка их не
видит. На Android они регистрируются в `MainApplication.kt`, на iOS — уже
добавлены в цель сборки. Если платформенный проект придётся пересоздавать из
шаблона, верните их скриптом `ios/setup-project.rb`.

---

## Если не собирается

| Ошибка | Причина | Решение |
|---|---|---|
| `Unsupported class file major version 65` | Сборка идёт на JDK 21 | Поставьте JDK 17 и укажите его в `JAVA_HOME` |
| `NDK at ... did not have a source.properties` | Не та версия NDK | Поставьте ровно `26.1.10909125` через SDK Manager |
| `CMake ... not found` | Нет CMake | SDK Manager → SDK Tools → CMake 3.22.1 |
| `SDK location not found` | Нет `local.properties` | Создайте `android/local.properties` со строкой `sdk.dir=/путь/к/Android/sdk` |
| `minSdkVersion 24 cannot be smaller than 26` | Правился корневой `build.gradle` | Верните `minSdkVersion = 26` |
| Сборка идёт очень долго | Собираются все четыре ABI | Добавьте `-PreactNativeArchitectures=arm64-v8a` |
| iOS: `Undefined symbol: PhotoKiosk` | Файлы модулей выпали из цели | `cd ios && ruby setup-project.rb` |
| iOS: `pod install` падает | Устаревшие спеки CocoaPods | `pod install --repo-update` |
| `cannot find symbol: PrintHelper` | Нет зависимости `androidx.print:print` | Она есть в `android/app/build.gradle`; проверьте, что блок `dependencies` не правился |
| iOS: `no member named 'StyleSizeLength'` | `react-native-svg` новее, чем RN | Держите версию `15.8.0` точно, без каретки |
| APK ставится, но белый экран | Отладочная сборка без Metro | Соберите `assembleRelease` или запустите `npm start` |
