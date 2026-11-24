# AUX Cloud (AC Freedom)

Steuern Sie Ihre **AUX**-Klimaanlagen und -Wärmepumpen aus Gladys, über die
AUX-Cloud der mobilen App **AC Freedom**. Alle in der App gekoppelten Geräte
(auch die, die andere Konten mit Ihnen teilen) erscheinen in Gladys.

> Die Integration nutzt ausschließlich die AUX-Cloud: Ihre Geräte und Gladys
> benötigen eine Internetverbindung. AUX veröffentlicht keine offizielle API:
> Die Integration spricht das Protokoll der AC-Freedom-App, wie es vom Projekt
> [ha-aux-cloud](https://github.com/maeek/ha-aux-cloud) analysiert wurde.

## Vorbereitung

1. Koppeln Sie Ihre Geräte in der App **AC Freedom** und prüfen Sie, dass Sie
   sie dort steuern können.
2. Empfohlen: Legen Sie ein **zweites AC-Freedom-Konto** für Gladys an und
   teilen Sie Ihre Geräte in der App damit (_Gerät → Teilen_). Die AUX-Cloud
   hält nur eine Sitzung pro Konto: Mit einem eigenen Konto meldet Gladys Ihr
   Telefon nie ab (und umgekehrt).

## Konfiguration

1. Öffnen Sie den Reiter **Konfiguration** der Integration.
2. Geben Sie die **E-Mail-Adresse oder Telefonnummer** und das **Passwort**
   des Kontos ein.
3. Wählen Sie die **Cloud-Region**, in der Ihr Konto erstellt wurde: _Europa_
   für die meisten europäischen Nutzer, sonst _Vereinigte Staaten_, _China_
   oder _Russland_. Eine falsche Region sieht aus wie ein falsches Passwort.
4. Das **Aktualisierungsintervall** legt fest, wie oft die Geräte aus der
   Cloud gelesen werden (standardmäßig 60 Sekunden, mindestens 30 Sekunden).
   Änderungen über die Fernbedienung oder die App erscheinen bei der nächsten
   Aktualisierung in Gladys; Befehle aus Gladys werden sofort ausgeführt.
5. Speichern Sie und klicken Sie auf **Verbindung testen**: Die Anzahl der
   gefundenen Geräte wird angezeigt. Öffnen Sie den Reiter **Erkennung** und
   fügen Sie Ihre Geräte hinzu.

## Funktionen

**Klimaanlagen**

| Funktion                                                                                                       | Hinweise                                                                                   |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Betrieb                                                                                                        | an / aus                                                                                   |
| Modus                                                                                                          | Auto, Kühlen, Heizen, Entfeuchten, Lüften                                                  |
| Solltemperatur                                                                                                 | 16 bis 32 °C, in halben Grad                                                               |
| Lüfterstufe                                                                                                    | Auto, Leise, Niedrig, Mittel, Hoch, Turbo (und die Zwischenstufen, wenn das Gerät sie hat) |
| Vertikale / horizontale Lamellen                                                                               | wenn das Gerät es unterstützt                                                              |
| Raumtemperatur                                                                                                 | vom Innengerät gemessen                                                                    |
| Eco, Schlaf, Display, Gesundheit, Zusatzheizung, Selbstreinigung, Kindersicherung, Schimmelschutz, Komfortwind | nur die, die Ihr Gerät meldet                                                              |

**Wärmepumpen**: Heizung an/aus und Solltemperatur, Warmwasser an/aus,
Soll- und Speichertemperatur, Schnellaufheizung, Leise- und Eco-Modus.

Jedes Gerät trägt ein **Cloud**-Abzeichen, das zu **nicht erreichbar**
wechselt, wenn das Gerät in der AUX-Cloud offline ist.

## Szenen

Die Integration fügt dem Szeneneditor eigene Karten hinzu (Gladys 5.1 oder
neuer), in der Kategorie **Integrationen**.

Auslöser:

- **AUX-Gerät ein- oder ausgeschaltet** — über Gladys, die Fernbedienung oder
  die App. Wählen Sie optional das Gerät und den neuen Zustand. Der neue
  Zustand ist als `{{triggerEvent.data.state}}` verfügbar (`on` / `off`).
- **AUX-Gerät meldet einen Fehler** — das Gerät hat sein Fehlerkennzeichen
  gesetzt; der Code ist als `{{triggerEvent.data.error_code}}` verfügbar.
- **AUX-Gerät online oder offline** — ein Gerät hat die Verbindung verloren
  oder wiederhergestellt.

Aktionen:

- **Klimaanlage einstellen** — Betrieb, Modus, Solltemperatur und Lüfterstufe
  in einem Befehl. Leere Felder bleiben unverändert. Gibt zurück, ob ein
  Befehl gesendet wurde.
- **Warmwasser der Wärmepumpe** — Warmwasser an/aus, Sollwert und
  Schnellaufheizung.
- **Alle AUX-Geräte ausschalten** — z. B. wenn die letzte Person das Haus
  verlässt. Gibt die Anzahl der ausgeschalteten Geräte zurück.

Die Standardkarten von Gladys (Gerätewert setzen, Auslöser „Gerätezustand"…)
funktionieren ebenfalls mit allen oben genannten Funktionen.

## Dashboard

- Widget **AUX-Geräte**: alle Geräte auf einen Blick (aus, Modus und
  Sollwert, offline, Fehler), mit den Tasten **Alle aus** und
  **Aktualisieren**.
- Widget **AUX-Gerät**: Wählen Sie ein Gerät in den Widget-Einstellungen, um
  seine Live-Temperaturen und Schnellsteuerungen zu sehen (an/aus, Sollwert
  −0,5 °C / +0,5 °C; Heizung und Warmwasser bei einer Wärmepumpe).

## Fehlerbehebung

- **„AUX Cloud hat die Anmeldung abgelehnt"**: Prüfen Sie Konto, Passwort und
  Region. Melden Sie sich zur Sicherheit mit demselben Konto in der App AC
  Freedom an.
- **„AUX Cloud begrenzt die Anfragen"**: Erhöhen Sie das
  Aktualisierungsintervall.
- **Ein Gerät fehlt**: Es muss mit demselben Konto in der App AC Freedom
  sichtbar sein. Später hinzugefügte Geräte werden innerhalb einer Stunde
  erkannt, oder sofort mit **Verbindung testen** oder einer neuen Suche.
- **Eine Funktion fehlt**: Optionale Funktionen werden nur veröffentlicht,
  wenn das Gerät sie meldet.

Details finden Sie in den Logs der Integration in der Gladys-Oberfläche.
Passwörter und Sitzungstoken werden nie in die Logs geschrieben.
