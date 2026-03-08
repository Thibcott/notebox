# Notebox

Mini web-app Node.js/Express pour notes par **projet** + **onglets**, avec **images** (upload + collage Ctrl+V) et **aperçu Markdown** avec **coloration du code**.

Ce projet a été généré, debuggué, et enrichi **intégralement par l'IA Antigravity (Google Deepmind)**, sans intervention manuelle sur le code. Dans le but de tester et d’explorer les limites de l’IA. 

## Fonctionnalités Principales

- 📝 **Éditeur Markdown** : Prise en charge avec de la coloration syntaxique du code (via `Highlight.js`), des blocs de code et des citations.
- 🗂️ **Projets et Onglets** : Organisation sous forme de multiples projets contenant chacun plusieurs onglets de notes.
- 💾 **Sauvegarde Automatique** : La position du curseur, le scroll, et le contenu sont conservés et restaurés automatiquement.
- 🖼️ **Images** : Glissez-déposez ou collez (Ctrl+V) directement une capture d'écran, elle sera uploadée au serveur et insérée dans le Markdown.
- ⏱️ **Timbreuse (Time Tracker)** : Suivi journalier des heures de travail avec balance calculée par rapport à une cible (8h24). Ajustements manuels disponibles.
- ⬇️ **Exportation** : Téléchargement facile des notes au format `.md` ou exportation des intervalles de pointage en `.csv`.

## Installation (Linux/Windows)

```bash
cd notebox
npm install
```

Créez un fichier `.env` à la racine (celui-ci est ignoré par Git) pour protéger l'application si vous la déployez en ligne.
```ini
NOTEBOX_PASSWORD="Mon_Mot_De_Passe_Robuste"
PORT=3000
```

Puis lancez l'application :
```bash
npm start

```

Accédez ensuite à http://localhost:3000

## Architecture des Dossiers

* **`/public`** : Contient l'interface front-end (HTML, CSS, JS vanilla client).
* **`/data`** : *(Généré)* Contient les fichiers JSON `projects.json` et `time.json` où sont stockées vos données. Ce dossier est ignoré par Git pour la confidentialité.
* **`/uploads`** : *(Généré)* Contient vos images uploadées. Ignoré par Git.
* **`server.js`** : Le serveur Express/Node gérant l'API REST.
