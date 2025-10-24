# Idle Clicker (Angular)

Un petit jeu de type clicker (idle game) réalisé avec Angular. Cliquez pour gagner des « éclats », achetez des générateurs et des améliorations, et laissez tourner pour accumuler automatiquement.

## Fonctionnalités
- Clic principal qui rapporte (base) 1 éclat
- Générateurs automatiques (Mineur, Drone, Usine) qui produisent des éclats par seconde
- Améliorations du clic et bonus de production globale
- Sauvegarde locale automatique (localStorage)
- Design minimal « néon » (polices Inter/Orbitron, SVG inline libres de droits)

## Lancer en local
```bash
npm install
npm start
```
Puis ouvrez http://localhost:4200.

## Construire pour la production
```bash
npm run build
```
Les fichiers de sortie se trouvent dans `dist/idle-clicker`.

## Tests unitaires
Un test minimal du service `GameService` est fourni.

```bash
npm test
```
Note : l’exécution des tests nécessite un navigateur (Chrome) disponible sur la machine. Si vous êtes en environnement sans interface graphique, configurez `CHROME_BIN` ou utilisez un lanceur adapté.

## Structure (extraits)
- `src/app/services/game.service.ts` : logique du jeu (état, achats, tick, sauvegarde)
- `src/app/app.ts` / `src/app/app.scss` : interface (template inline) et styles
- `src/index.html` : métadonnées et polices

## Licence des assets
Les icônes/SVG sont écrits à la main et inclus inline dans le code. Vous pouvez les modifier ou les remplacer par des images libres (ex. Flaticon, Heroicons) en respectant leurs licences.

## Idées d’amélioration
- Prestige et multiplicateurs long-terme
- Événements temporaires (boosts)
- Déverrouillage progressif d’objets
- Internationalisation (i18n)