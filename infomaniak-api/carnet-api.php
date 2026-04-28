<?php
declare(strict_types=1);

/*
 * API Carnet pour l'application Electron.
 *
 * Installation:
 * 1. Copiez ce fichier sur votre hebergement Infomaniak.
 * 2. Changez les valeurs DB_* et API_KEYS ci-dessous.
 * 3. Utilisez l'URL HTTPS de ce fichier dans l'application Electron.
 */

const API_NAME = 'Carnet NBK';

const DB_HOST = 'nbk.myd.infomaniak.com';
const DB_NAME = 'nbk_carnet';
const DB_USER = 'nbk_carnet';
const DB_PASSWORD = 'REMPLACER_PAR_LE_MOT_DE_PASSE_DB';

const API_KEYS = [
    // Une cle par personne. Gardez uniquement les personnes autorisees.
    'CARNET-UTILISATEUR-1-REMPLACER' => 'Utilisateur 1',
    'CARNET-UTILISATEUR-2-REMPLACER' => 'Utilisateur 2',
    'CARNET-UTILISATEUR-3-REMPLACER' => 'Utilisateur 3',
];

const CONTACT_COLUMNS = [
    'id',
    'categorie',
    'titre',
    'prenom',
    'nom',
    'fonction',
    'organisme',
    'adresse',
    'numero',
    'code_postal',
    'ville',
    'telephone',
    'gsm',
    'fax',
    'email',
    'refus',
    'date_modification',
    'listes',
    'notes',
];

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

try {
    requireHttps();
    requireApiKey();

    $action = $_GET['action'] ?? 'ping';

    if ($action === 'ping') {
        respond([
            'success' => true,
            'name' => API_NAME,
        ]);
    }

    if ($action === 'contacts') {
        respond(getContacts());
    }

    fail(404, 'Action inconnue.');
} catch (Throwable $err) {
    fail(500, 'Erreur serveur.');
}

function requireHttps(): void
{
    $https = $_SERVER['HTTPS'] ?? '';
    $forwardedProto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';

    if ($https !== 'on' && $forwardedProto !== 'https') {
        fail(403, 'HTTPS requis.');
    }
}

function requireApiKey(): string
{
    $apiKey = $_SERVER['HTTP_X_API_KEY'] ?? '';

    if ($apiKey === '' || !array_key_exists($apiKey, API_KEYS)) {
        fail(403, 'Code acces invalide.');
    }

    return API_KEYS[$apiKey];
}

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=utf8mb4',
        DB_HOST,
        DB_NAME
    );

    $pdo = new PDO($dsn, DB_USER, DB_PASSWORD, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}

function getContacts(): array
{
    $pdo = db();

    $contacts = $pdo->query("
        SELECT
            id,
            categorie,
            titre,
            prenom,
            nom,
            fonction,
            organisme,
            adresse,
            numero,
            code_postal,
            ville,
            telephone,
            gsm,
            fax,
            email,
            refus,
            DATE_FORMAT(date_modification, '%d/%m/%Y') AS date_modification,
            notes
        FROM contacts
        ORDER BY id
    ")->fetchAll();

    $links = $pdo->query("
        SELECT cl.contact_id, l.nom
        FROM contact_listes cl
        INNER JOIN listes l ON l.id = cl.liste_id
        ORDER BY l.nom
    ")->fetchAll();

    $listesByContact = [];
    foreach ($links as $link) {
        $contactId = (string)$link['contact_id'];
        if (!isset($listesByContact[$contactId])) {
            $listesByContact[$contactId] = [];
        }
        $listesByContact[$contactId][] = cleanValue($link['nom']);
    }

    $rows = [];
    foreach ($contacts as $contact) {
        $row = [];

        foreach (CONTACT_COLUMNS as $column) {
            if ($column === 'listes') {
                $row[$column] = implode(', ', $listesByContact[(string)$contact['id']] ?? []);
                continue;
            }

            $row[$column] = cleanValue($contact[$column] ?? null);
        }

        $rows[] = $row;
    }

    return [
        'success' => true,
        'columns' => CONTACT_COLUMNS,
        'rows' => $rows,
    ];
}

function cleanValue($value): string
{
    if ($value === null) {
        return '';
    }

    return (string)$value;
}

function respond(array $payload): void
{
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $status, string $message): void
{
    http_response_code($status);
    respond([
        'success' => false,
        'error' => $message,
    ]);
}
