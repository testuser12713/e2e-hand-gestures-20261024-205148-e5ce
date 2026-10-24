# HandGestures – Handgesten-Steuerung für Präsentationen

HandGestures ist eine wiederverwendbare Browser-Bibliothek, die das Bild der Webcam liest, Handgesten direkt im Browser erkennt (MediaPipe-Hand-Landmarks) und daraus Präsentationsbefehle macht: nächste/vorherige Folie, hoch/runter in vertikalen Folienstapeln, Übersicht und Pause (schwarzer Bildschirm). Sie wird als einzelnes klassisches Skript (IIFE, globale Variable `HandGestures`) und als ES-Modul ausgeliefert und lässt sich so in jedes Präsentationsprojekt einbauen – auch in eine reveal.js-`index.html`, die direkt von der Festplatte geöffnet wird. Eine Demo-Seite im Repository zeigt die Bibliothek im Einsatz. Die gesamte Videoverarbeitung bleibt im Browser; es wird nichts hochgeladen.

## Tech-Stack

- **Sprache:** TypeScript
- **Build:** Vite im Library-Modus (Ausgaben IIFE und ES-Modul, Typdeklarationen über `vite-plugin-dts`)
- **Handerkennung:** `@mediapipe/tasks-vision` (HandLandmarker), fest auf Version 1.1.1 gepinnt
- **Demo:** reveal.js
- **Tests:** Vitest mit jsdom

## Installation

Voraussetzung: Node.js 22 oder neuer und npm.

```bash
npm ci
```

## Entwicklung, Build und Tests

| Befehl | Wirkung |
| --- | --- |
| `npm run dev` | Baut die Bibliothek und startet den Vite-Entwicklungsserver mit der Demo-Seite `index.html` (Adresse steht in der Konsole, standardmäßig `http://localhost:5173`). |
| `npm run build` | Erzeugt den Produktions-Build im Ordner `dist/`: `hand-gestures.iife.js`, `hand-gestures.es.js`, `index.d.ts` (plus die übrigen `.d.ts`-Dateien) sowie eine lauffähige Kopie der Demo-Seite mit ihren Schriften. |
| `npm test` | Führt die Unit-Tests einmal aus (Vitest). |

Den fertigen Build kann man mit einem beliebigen statischen Webserver ausliefern, zum Beispiel:

```bash
npm run build
npx vite preview
```

Alternativ funktioniert `index.html` im Repository-Wurzelverzeichnis nach `npm run build` auch direkt per Doppelklick (`file://`), weil die Bibliothek als klassisches Skript geladen wird.

## Verwendung

### Als klassisches Skript (auch von der Festplatte)

```html
<script src="hand-gestures.iife.js"></script>
<script>
  const control = HandGestures.createGestureControl();
  control.on('gesture', (g) => console.log('Geste', g.type));
  control.on('status', (s) => console.log('Status', s.status, s.message));
</script>
```

Ist auf der Seite reveal.js (`window.Reveal`) vorhanden und wird kein eigener Adapter übergeben, steuert die Bibliothek reveal.js automatisch; ohne reveal.js löst sie Tastatur-Ereignisse aus.

### Als ES-Modul in einem gebündelten Projekt

```ts
import Reveal from 'reveal.js';
import { createGestureControl, revealAdapter } from 'hand-gestures';

const control = createGestureControl({ adapter: revealAdapter(Reveal) });
```

### Bedienung

- Beim Laden der Seite passiert nichts: Das Overlay in der Ecke zeigt den Status **Off**, Kamera und Modell werden **nicht** angefordert.
- **Start:** Taste <kbd>G</kbd> (konfigurierbar über `toggleKey`) oder der Button „Start gestures“ im Overlay. Erst jetzt fragt der Browser nach der Kamera und die MediaPipe-Dateien werden geladen.
- **Stopp:** erneut <kbd>G</kbd> oder der Button „Stop“. Der Kamerastream wird freigegeben (alle Tracks werden mit `track.stop()` beendet).
- Das Overlay zeigt eine gespiegelte Kameravorschau, ein Status-Badge (Off, Loading, No hand, Hand detected, Error) und blendet den Namen jeder erkannten Geste kurz ein.
- Wird die Kamera verweigert oder fehlt sie, erscheint eine lesbare Fehlermeldung; Tastatur und Maus funktionieren weiter.

### Gesten (Standardbelegung für reveal.js)

Wischgesten werden in der gespiegelten Ansicht ausgewertet: Eine Handbewegung nach links (aus Sicht der Person vor der Kamera) blättert vor.

| Geste | Bewegung | reveal.js-Aufruf | Taste (Tastatur-Adapter) |
| --- | --- | --- | --- |
| `SWIPE_LEFT` | offene Hand schnell nach links | `Reveal.next()` | `ArrowRight` |
| `SWIPE_RIGHT` | offene Hand schnell nach rechts | `Reveal.prev()` | `ArrowLeft` |
| `SWIPE_UP` | offene Hand schnell nach oben | `Reveal.up()` | `ArrowUp` |
| `SWIPE_DOWN` | offene Hand schnell nach unten | `Reveal.down()` | `ArrowDown` |
| `OPEN_PALM_HOLD` | offene Handfläche ruhig halten | `Reveal.togglePause()` | `b` |
| `FIST_HOLD` | Faust ruhig halten | `Reveal.toggleOverview()` | `o` |

### API

`createGestureControl(options?)` liefert einen Controller mit:

| Methode | Beschreibung |
| --- | --- |
| `start(): Promise<void>` | Kamera anfordern, Modell laden, Erkennung starten. Lehnt nie ab; Fehler erscheinen als Status `error`. |
| `stop()` | Erkennung beenden, Kamera freigeben. |
| `enable()` / `disable()` / `toggle()` | Steuerung ein-, aus- bzw. umschalten (wie Button und Toggle-Taste). |
| `on('gesture', h)` | `h({ type, timestamp })` bei jeder erkannten Geste. |
| `on('status', h)` | `h({ status, message? })` mit `status` aus `off`, `loading`, `ready`, `running`, `no-hand`, `hand-detected`, `error`. |
| `off(event, h)` | Handler entfernen. |
| `isRunning()` / `isEnabled()` | Aktueller Zustand. |

Weitere Exporte: `revealAdapter(Reveal, mapping?)`, `keyboardAdapter(mapping?, target?)`, `createRecognizer(opts)`, `resolveOptions(opts)`, `DEFAULT_OPTIONS`, `DEFAULT_REVEAL_MAPPING`, `DEFAULT_KEY_MAPPING` sowie alle Typen.

### Optionen

| Option | Standard | Bedeutung |
| --- | --- | --- |
| `adapter` | reveal.js-Adapter, falls `window.Reveal` existiert, sonst Tastatur-Adapter | Objekt `{ handle(gesture) }`, das jede Geste erhält |
| `assetBaseUrl` | `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1` | Basis-URL der MediaPipe-wasm-/Modelldateien; nur `https:` oder relative/same-origin-URLs |
| `mirror` | `true` | Bewegungen in der gespiegelten Ansicht auswerten |
| `cooldownMs` | `800` | Sperrzeit nach einer Geste in ms |
| `swipeDistance` | `0.2` | Mindestweg einer Wischgeste (Anteil der Bildbreite/-höhe) |
| `swipeMaxDurationMs` | `500` | Maximale Dauer einer Wischgeste in ms |
| `holdMs` | `1000` | Haltedauer für offene Hand / Faust in ms |
| `showPreview` | `true` | Kameravorschau im Overlay anzeigen |
| `previewPosition` | `'bottom-left'` | Ecke des Overlays: `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| `toggleKey` | `'g'` | Taste zum Ein-/Ausschalten |
| `invertSwipe` | `false` | Horizontale Wischrichtung umkehren |

## Adapter

Ein Adapter ist ein Objekt `{ handle(gesture) }`; der Controller ruft `handle` für jede erkannte Geste auf.

### `revealAdapter(Reveal, mapping?)`

Steuert ein reveal.js-Deck. Standardbelegung (`DEFAULT_REVEAL_MAPPING`): siehe Gesten-Tabelle oben. Einzelne Einträge lassen sich überschreiben:

```js
HandGestures.createGestureControl({
  adapter: HandGestures.revealAdapter(Reveal, { SWIPE_LEFT: 'right', SWIPE_RIGHT: 'left' }),
});
```

### `keyboardAdapter(mapping?, target?)`

Löst für jede Geste ein `KeyboardEvent` auf `target` (Standard: `document`) aus – geeignet für jedes Folienwerkzeug, das auf Pfeiltasten reagiert. Standardbelegung (`DEFAULT_KEY_MAPPING`):

| Geste | Taste |
| --- | --- |
| `SWIPE_LEFT` | `ArrowRight` |
| `SWIPE_RIGHT` | `ArrowLeft` |
| `SWIPE_UP` | `ArrowUp` |
| `SWIPE_DOWN` | `ArrowDown` |
| `OPEN_PALM_HOLD` | `b` |
| `FIST_HOLD` | `o` |

Ein Eintrag kann ein Tastenname oder ein Objekt `{ key, code?, shiftKey?, ctrlKey?, altKey?, metaKey? }` sein:

```js
HandGestures.createGestureControl({
  adapter: HandGestures.keyboardAdapter({ OPEN_PALM_HOLD: { key: 'p', shiftKey: true } }),
});
```

### Eigener Adapter

```js
HandGestures.createGestureControl({
  adapter: {
    handle(gesture) {
      if (gesture.type === 'SWIPE_LEFT') meineFolien.weiter();
    },
  },
});
```

## Funktionen

- Erkennung von Wischgesten (links, rechts, hoch, runter) sowie gehaltener offener Hand und Faust
- Sperrzeit nach jeder Geste, damit die Rückbewegung keinen Gegenbefehl auslöst
- Auswertung in der gespiegelten Ansicht, Richtung umkehrbar (`invertSwipe`)
- Adapter für reveal.js und für Tastatur-Ereignisse, eigene Adapter möglich
- Overlay mit gespiegelter Vorschau, Status-Badge, Ein/Aus-Button und Gesten-Einblendung
- Ein-/Ausschalten per Taste (Standard <kbd>G</kbd>)
- Lesbare Fehlermeldungen bei verweigerter oder fehlender Kamera; die Präsentation bleibt per Tastatur und Maus bedienbar
- Auslieferung als IIFE (`HandGestures`) und als ES-Modul mit Typdeklarationen

## Datenschutz

- Die Verarbeitung findet ausschließlich auf dem Gerät im Browser statt.
- Es werden keine Videobilder und keine Landmark-Daten gespeichert oder übertragen; es gibt keine Telemetrie.
- Die Kamera wird erst nach ausdrücklichem Start durch die Nutzerin bzw. den Nutzer angefordert (Taste oder Button), nie beim Laden der Seite.
- Die einzigen Netzwerkanfragen sind das Laden der MediaPipe-wasm-Dateien und des Hand-Landmarker-Modells (`hand_landmarker.task`) – und zwar erst, nachdem die Steuerung ausdrücklich gestartet wurde.
- In der Standardeinrichtung kommen diese Dateien von zwei Hosts: die wasm-Dateien vom CDN jsDelivr (`cdn.jsdelivr.net`, fest gepinnter Pfad `@mediapipe/tasks-vision@1.1.1`) und das Modell von `storage.googleapis.com` (Google). Dabei wird die IP-Adresse der Nutzerin bzw. des Nutzers an beide Betreiber übermittelt – an den CDN-Betreiber jsDelivr und an den Betreiber von `storage.googleapis.com`; eine Übermittlung in Drittländer ist möglich.
- Wer das vermeiden will, hostet wasm-Dateien **und** Modell selbst und setzt `assetBaseUrl` auf den eigenen Pfad; dann entfallen beide Anfragen an fremde Hosts (siehe „Self-Hosting der MediaPipe-Dateien“).

## Self-Hosting der MediaPipe-Dateien

Standardmäßig lädt die Bibliothek die wasm-Laufzeit vom öffentlichen CDN jsDelivr, fest gepinnt auf `@mediapipe/tasks-vision@1.1.1` (nie „latest“), und das Hand-Landmarker-Modell (`hand_landmarker.task`) vom festen zweiten Host `storage.googleapis.com`. Beide Hosts erhalten dabei die IP-Adresse der Nutzerin bzw. des Nutzers. Mit selbst gehosteten wasm-Dateien und Modell unter `assetBaseUrl` werden beide Hosts nicht mehr kontaktiert. Das ist nötig, damit Präsentationen funktionieren, die per `file://` direkt von der Festplatte geöffnet werden – dort gibt es keinen eigenen Server, der die Dateien ausliefern könnte.

`assetBaseUrl` akzeptiert nur `https:`-URLs oder relative bzw. same-origin-Pfade; andere Schemata (z. B. `http:`) werden beim Start mit einer lesbaren Fehlermeldung abgelehnt.

Die wasm-Dateien liegen nach `npm ci` unter `node_modules/@mediapipe/tasks-vision/wasm/`. Kopieren Sie sie zusammen mit dem Hand-Landmarker-Modell auf den eigenen Webserver und übergeben Sie den Pfad:

```js
HandGestures.createGestureControl({ assetBaseUrl: './mediapipe' });
// oder absolut:
HandGestures.createGestureControl({ assetBaseUrl: 'https://static.example.org/mediapipe' });
```

Die Verzeichnisstruktur unter dem eigenen Pfad entspricht der des CDN-Pakets (wasm-Dateien im Unterordner `wasm/`). Ein relativer Pfad wie `./mediapipe` setzt voraus, dass die Seite über einen Webserver ausgeliefert wird (nicht `file://`); eine absolute `https:`-URL auf den eigenen Server funktioniert auch aus einer per `file://` geöffneten Seite.
