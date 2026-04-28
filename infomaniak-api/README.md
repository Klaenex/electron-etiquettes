# API Infomaniak pour Electron Etiquettes

Cette API sert de passerelle entre l'application Electron et la base MariaDB Infomaniak.
Les utilisateurs de l'application ne recoivent jamais le mot de passe MariaDB.

## Installation

1. Ouvrir `carnet-api.php`.
2. Remplacer `DB_PASSWORD` par le mot de passe MariaDB.
3. Remplacer les valeurs dans `API_KEYS` par 2 ou 3 codes longs, un par utilisateur.
4. Envoyer `carnet-api.php` sur l'hebergement Infomaniak, par exemple dans un dossier discret.
5. Utiliser l'URL HTTPS du fichier dans l'application Electron.

Exemple d'URL dans l'application:

```text
https://votre-domaine.ch/dossier-discret/carnet-api.php
```

## Test rapide

Dans l'application Electron:

1. Cliquer sur `Connexion`.
2. Coller l'URL HTTPS de `carnet-api.php`.
3. Entrer le code d'acces d'un utilisateur.
4. Cliquer sur `Tester`.
5. Cliquer sur `Se connecter`.

## Securite

- Garder uniquement les codes actifs dans `API_KEYS`.
- Donner un code different a chaque personne.
- Si un PC est perdu, supprimer uniquement le code concerne.
- Ne jamais mettre le mot de passe MariaDB dans l'application Electron.
