# AUX Cloud (AC Freedom)

Pilotez vos climatiseurs et pompes à chaleur **AUX** depuis Gladys, via le
cloud AUX utilisé par l'application mobile **AC Freedom**. Tous les appareils
appairés dans l'application (y compris ceux que d'autres comptes partagent
avec vous) apparaissent dans Gladys.

> L'intégration passe uniquement par le cloud AUX : vos appareils et Gladys
> ont besoin d'une connexion Internet. AUX ne publie pas d'API officielle :
> l'intégration parle le protocole de l'application AC Freedom, tel que
> rétro-ingénieré par le projet
> [ha-aux-cloud](https://github.com/maeek/ha-aux-cloud).

## Avant de commencer

1. Appairez vos appareils dans l'application **AC Freedom** et vérifiez que
   vous pouvez les piloter depuis celle-ci.
2. Recommandé : créez un **second compte AC Freedom** pour Gladys, et
   partagez-lui vos appareils depuis l'application (_Appareil → Partager_). Le
   cloud AUX ne garde qu'une session par compte : avec un compte dédié, Gladys
   ne déconnecte jamais votre téléphone (et inversement).

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Saisissez l'**e-mail ou le numéro de téléphone** et le **mot de passe** du
   compte.
3. Choisissez la **région du cloud** sur laquelle votre compte a été créé :
   _Europe_ pour la plupart des utilisateurs européens, sinon _États-Unis_,
   _Chine_ ou _Russie_. Une mauvaise région ressemble à un mauvais mot de
   passe.
4. L'**intervalle de rafraîchissement** fixe la fréquence de lecture des
   appareils sur le cloud (60 secondes par défaut, 30 secondes minimum). Les
   changements faits avec la télécommande ou l'application arrivent dans
   Gladys au rafraîchissement suivant ; les commandes envoyées depuis Gladys
   sont appliquées immédiatement.
5. Enregistrez, puis cliquez sur **Tester la connexion** : le nombre
   d'appareils trouvés s'affiche. Ouvrez l'onglet **Découverte** et ajoutez
   vos appareils.

## Ce que vous obtenez

**Climatiseurs**

| Fonction                                                                                                                | Remarques                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Marche                                                                                                                  | allumé / éteint                                                                                   |
| Mode                                                                                                                    | auto, froid, chaud, déshumidification, ventilation                                                |
| Consigne                                                                                                                | 16 à 32 °C, par demi-degré                                                                        |
| Ventilation                                                                                                             | auto, silence, faible, moyenne, forte, turbo (et les vitesses intermédiaires si l'appareil les a) |
| Balayage vertical / horizontal                                                                                          | si l'appareil le permet                                                                           |
| Température de la pièce                                                                                                 | mesurée par l'unité intérieure                                                                    |
| Éco, sommeil, affichage, santé, chauffage d'appoint, auto-nettoyage, sécurité enfant, anti-moisissure, vent confortable | uniquement celles que votre appareil remonte                                                      |

**Pompes à chaleur** : chauffage marche/arrêt et consigne, eau chaude
marche/arrêt, consigne et température du ballon, chauffe rapide, modes
silence et éco.

Chaque appareil porte un badge **cloud**, qui passe à **injoignable** quand
l'appareil est hors ligne sur le cloud AUX.

## Scènes

L'intégration ajoute ses propres cartes à l'éditeur de scènes (Gladys 5.1 ou
plus récent), dans la catégorie **Intégrations**.

Déclencheurs :

- **Appareil AUX allumé ou éteint** — depuis Gladys, la télécommande ou
  l'application. Choisissez éventuellement l'appareil et le nouvel état. Le
  nouvel état est disponible via `{{triggerEvent.data.state}}` (`on` / `off`).
- **Appareil AUX en erreur** — l'appareil a levé son indicateur d'erreur ; le
  code est disponible via `{{triggerEvent.data.error_code}}`.
- **Appareil AUX en ligne ou hors ligne** — un appareil a perdu ou retrouvé sa
  connexion.

Actions :

- **Régler un climatiseur** — marche, mode, consigne et ventilation en une
  seule commande. Les champs vides ne sont pas modifiés. Indique si une
  commande a été envoyée.
- **Régler l'eau chaude (PAC)** — eau chaude marche/arrêt, consigne et
  chauffe rapide.
- **Éteindre tous les appareils AUX** — par exemple quand la dernière personne
  quitte la maison. Indique le nombre d'appareils éteints.

Les cartes standard de Gladys (régler la valeur d'un appareil, déclencheur
« état d'un appareil »...) fonctionnent aussi avec toutes les fonctions
ci-dessus.

## Tableau de bord

- Widget **Appareils AUX** : tous les appareils en un coup d'œil (éteint, mode
  et consigne, hors ligne, erreur), avec les boutons **Tout éteindre** et
  **Actualiser**.
- Widget **Appareil AUX** : choisissez un appareil dans les réglages du widget
  pour afficher ses températures en direct et des commandes rapides
  (marche/arrêt, consigne −0,5 °C / +0,5 °C ; chauffage et eau chaude pour une
  pompe à chaleur).

## Dépannage

- **« AUX Cloud a refusé la connexion »** : vérifiez le compte, le mot de passe
  et la région. Connectez-vous à l'application AC Freedom avec le même compte
  pour en être sûr.
- **« AUX Cloud limite les requêtes »** : augmentez l'intervalle de
  rafraîchissement.
- **Un appareil manque** : il doit être visible dans l'application AC Freedom
  avec le même compte. Les appareils ajoutés plus tard sont détectés dans
  l'heure, ou immédiatement avec **Tester la connexion** ou un nouveau scan.
- **Une fonction manque** : les fonctions optionnelles ne sont publiées que si
  l'appareil les remonte.

Consultez les logs de l'intégration depuis l'interface de Gladys pour le
détail. Les mots de passe et jetons de session ne sont jamais écrits dans les
logs.
