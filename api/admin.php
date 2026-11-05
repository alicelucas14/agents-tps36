<?php
/*
 * Admin API for admin.html.
 *
 * Stores admin accounts on the server (api/data/users.php) and publishes content.js.
 * All requests are JSON: POST api/admin.php?action=NAME with a JSON body.
 *
 * Actions:
 *   status       - who is signed in, and whether the first Super Admin still needs creating
 *   setup        - create the first Super Admin (only works while no accounts exist)
 *   login        - sign in
 *   logout       - sign out
 *   users        - list admin accounts (signed in)
 *   user_save    - add a user (Super Admin) or change password/role
 *   user_delete  - remove a user (Super Admin)
 *   publish      - write content.js on the server (signed in)
 */

declare(strict_types=1);

const MIN_PASSWORD = 8;
const ROLES = ['Super Admin', 'Editor'];
const MAX_FAILED_LOGINS = 5;      // per IP address ...
const LOCKOUT_SECONDS = 900;      // ... within 15 minutes
const SESSION_IDLE_SECONDS = 7200; // sign out after 2 hours without activity
const BACKUPS_TO_KEEP = 20;

// Data files start with an exit line so they print nothing if someone requests them in a browser.
const GUARD = "<?php http_response_code(404); exit; ?>\n";

$DATA_DIR = __DIR__ . '/data';
$SITE_DIR = dirname(__DIR__);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

/* ---------- Helpers ---------- */

function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(int $status, string $message): void
{
    respond($status, ['ok' => false, 'error' => $message]);
}

function ensure_data_dir(): void
{
    global $DATA_DIR;
    if (!is_dir($DATA_DIR) && !@mkdir($DATA_DIR, 0750, true)) {
        fail(500, 'The server cannot create api/data. Make the site folder writable by the web server user (www).');
    }
    // Extra protection on Apache; nginx relies on the exit line inside each data file.
    $htaccess = $DATA_DIR . '/.htaccess';
    if (!file_exists($htaccess)) {
        @file_put_contents($htaccess, "Require all denied\nDeny from all\n");
    }
}

function read_store(string $name, $default)
{
    global $DATA_DIR;
    $file = "$DATA_DIR/$name.php";
    if (!is_file($file)) return $default;
    $raw = (string) file_get_contents($file);
    if (strpos($raw, GUARD) === 0) $raw = substr($raw, strlen(GUARD));
    $data = json_decode($raw, true);
    return is_array($data) ? $data : $default;
}

function write_store(string $name, $data): void
{
    global $DATA_DIR;
    ensure_data_dir();
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $file = "$DATA_DIR/$name.php";
    if (@file_put_contents($file, GUARD . $json, LOCK_EX) === false) {
        fail(500, "The server cannot write api/data/$name.php. Check folder permissions (owner www).");
    }
    @chmod($file, 0640);
}

// Serialises account changes so two requests can't both create the "first" Super Admin.
function with_lock(callable $fn)
{
    global $DATA_DIR;
    ensure_data_dir();
    $handle = fopen("$DATA_DIR/.lock", 'c');
    if (!$handle || !flock($handle, LOCK_EX)) fail(500, 'Could not lock the account store.');
    try {
        return $fn();
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function read_users(): array
{
    $users = read_store('users', []);
    return array_values(array_filter($users, fn($u) => is_array($u) && isset($u['username'], $u['hash'])));
}

function find_user(array $users, string $username): int
{
    foreach ($users as $i => $u) {
        if (strcasecmp($u['username'], $username) === 0) return $i;
    }
    return -1;
}

function public_user(array $u): array
{
    return ['username' => $u['username'], 'role' => $u['role'], 'createdAt' => $u['createdAt'] ?? null];
}

function super_admin_count(array $users): int
{
    return count(array_filter($users, fn($u) => $u['role'] === 'Super Admin'));
}

function clean_username($value): string
{
    $name = strtolower(trim((string) $value));
    if (!preg_match('/^[a-z0-9._-]{3,32}$/', $name)) {
        fail(400, 'Username must be 3–32 characters: letters, numbers, dot, dash or underscore.');
    }
    return $name;
}

function check_password($value): string
{
    $password = (string) $value;
    if (strlen($password) < MIN_PASSWORD) fail(400, 'Password must be at least ' . MIN_PASSWORD . ' characters.');
    if (strlen($password) > 200) fail(400, 'Password is too long.');
    return $password;
}

function client_ip(): string
{
    return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

/* ---------- Site files: blog posts and pages published from the admin ---------- */

// The browser builds the blog and page files (the same code as tools/blog.mjs) and sends the ones that changed.
// Only these exact kinds of files can be written or removed, so this cannot be used to put anything else on the server.
// Every admin role may do it (Editors included, by the site owner's choice). The files are HTML served from this
// site's own address, next to the admin, so anyone given an account is trusted with what visitors' browsers run.
const SITE_ROLES = ROLES;
const SITE_CHUNK_PLAIN = 600000;   // bytes of file data per request when the browser cannot compress its uploads
const SITE_CHUNK_GZIP = 3000000;   // ... and when it can (HTML shrinks about 5x, so the request itself stays small)
const SITE_REQUEST_MAX = 3200000;  // most file data accepted in one request, after unpacking
const SITE_PIECES_MAX = 400;       // most file pieces accepted in one request
const SITE_FILE_MAX = 30000000;    // largest single file
const SITE_BACKUPS_TO_KEEP = 10;
const SITE_DATA_FILES = [
    '404.html', 'pages.json', 'sitemap-pages.xml',
    'blogs/posts.json', 'blogs/search.json', 'blogs/sitemap.xml',
    'blogs/redirects.txt', 'blogs/redirects.nginx.conf', 'blogs/.manifest.json',
];
// First folders that belong to the site itself; a page can never be put in them.
const SITE_BLOCKED_ROOTS = ['api', 'admin', 'fonts', 'tools', 'uploads', 'wp-content', 'wp-admin', 'wp-includes', 'author', 'tag'];

// Allowed: <page address>/index.html (up to six folders), blogs/index.html, blogs/<post>/index.html,
// blogs/page/<number>/index.html, and the fixed data files above. Nothing else, and never ".." or a leading "/".
function site_path_ok($path): bool
{
    if (!is_string($path) || strlen($path) > 300) return false;
    if (in_array($path, SITE_DATA_FILES, true)) return true;
    if (!preg_match('#^[a-z0-9][a-z0-9-]*(?:/[a-z0-9][a-z0-9-]*){0,5}/index\.html$#D', $path)) return false;
    $parts = explode('/', $path);
    if (in_array($parts[0], SITE_BLOCKED_ROOTS, true)) return false;
    if ($parts[0] === 'blogs') {
        $n = count($parts);
        return $n === 2 || $n === 3 || ($n === 4 && $parts[1] === 'page' && ctype_digit($parts[2]));
    }
    return true;
}

// A file that may be deleted: a page or post folder's index.html (never the blog's own front page).
function site_remove_ok($path): bool
{
    return site_path_ok($path) && substr($path, -11) === '/index.html' && $path !== 'blogs/index.html';
}

function site_file(string $rel): string
{
    global $SITE_DIR;
    return $SITE_DIR . '/' . $rel;
}

// The nearest folder that exists for a new file, when the web server user cannot write to it (null when it can).
function site_unwritable(string $rel): ?string
{
    global $SITE_DIR;
    $dir = dirname(site_file($rel));
    while (!is_dir($dir)) $dir = dirname($dir);
    if (is_writable($dir)) return null;
    $short = ltrim(substr($dir, strlen($SITE_DIR)), '/\\');
    return $short === '' ? '(site folder)' : $short;
}

function site_part_file(string $rel): string
{
    global $DATA_DIR;
    return "$DATA_DIR/tmp/" . sha1($rel) . '.part';
}

// Keeps the last few copies of the two files every other file is rebuilt from, so a bad publish can be undone.
function site_backup(string $rel): void
{
    global $DATA_DIR;
    if ($rel !== 'blogs/posts.json' && $rel !== 'pages.json') return;
    $source = site_file($rel);
    if (!is_file($source)) return;
    $dir = "$DATA_DIR/backups";
    if (!is_dir($dir)) @mkdir($dir, 0750, true);
    $prefix = $rel === 'pages.json' ? 'pages' : 'posts';
    @copy($source, "$dir/$prefix-" . gmdate('Ymd-His') . '.json');
    $old = glob("$dir/$prefix-*.json") ?: [];
    sort($old);
    foreach (array_slice($old, 0, max(0, count($old) - SITE_BACKUPS_TO_KEEP)) as $file) @unlink($file);
}

// The command that lets the web server user write the site files. Git refuses to work in a folder owned by another
// user ("detected dubious ownership"), so the folder is marked safe first and .git itself is left alone. aaPanel's
// .user.ini is locked against changes, so it is skipped.
function site_fix_hint(): string
{
    global $SITE_DIR;
    $user = 'www';
    if (function_exists('posix_geteuid') && function_exists('posix_getpwuid')) {
        $info = posix_getpwuid(posix_geteuid());
        if (!empty($info['name'])) $user = $info['name'];
    }
    return "On the server run: sudo git config --system --add safe.directory $SITE_DIR && "
        . "sudo find $SITE_DIR -path '*/.git' -prune -o ! -name .user.ini -exec chown $user:$user {} +  and publish again.";
}

function require_site_publisher(): array
{
    $user = require_user();
    if (!in_array($user['role'], SITE_ROLES, true)) fail(403, 'Your account is not allowed to publish blog posts and pages.');
    return $user;
}

/* ---------- Session ---------- */

function start_session(): void
{
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('tps_admin');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();

    if (isset($_SESSION['seen']) && time() - $_SESSION['seen'] > SESSION_IDLE_SECONDS) {
        $_SESSION = [];
    }
    $_SESSION['seen'] = time();
}

// Returns the signed-in user, re-read from the store so deleted users and role changes apply at once.
function current_user(): ?array
{
    $name = $_SESSION['username'] ?? null;
    if (!$name) return null;
    $users = read_users();
    $i = find_user($users, $name);
    if ($i < 0) {
        $_SESSION = [];
        return null;
    }
    return $users[$i];
}

function require_user(): array
{
    $user = current_user();
    if (!$user) fail(401, 'Your session has ended. Please sign in again.');
    return $user;
}

function require_super(): array
{
    $user = require_user();
    if ($user['role'] !== 'Super Admin') fail(403, 'Only a Super Admin can do that.');
    return $user;
}

function sign_in(array $user): void
{
    session_regenerate_id(true);
    $_SESSION['username'] = $user['username'];
    $_SESSION['seen'] = time();
}

/* ---------- Login rate limiting (per IP) ---------- */

function recent_failures(string $ip): array
{
    $all = read_store('attempts', []);
    $cutoff = time() - LOCKOUT_SECONDS;
    return array_values(array_filter($all[$ip] ?? [], fn($t) => $t > $cutoff));
}

function record_failure(string $ip): void
{
    $all = read_store('attempts', []);
    $cutoff = time() - LOCKOUT_SECONDS;
    foreach ($all as $key => $times) {
        $all[$key] = array_values(array_filter($times, fn($t) => $t > $cutoff));
        if (!$all[$key]) unset($all[$key]);
    }
    $all[$ip][] = time();
    write_store('attempts', $all);
}

function clear_failures(string $ip): void
{
    $all = read_store('attempts', []);
    if (isset($all[$ip])) {
        unset($all[$ip]);
        write_store('attempts', $all);
    }
}

/* ---------- Request ---------- */

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405, 'Use POST.');

// Browsers only send this header from our own scripts, which blocks cross-site form posts.
if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'tps-admin') fail(403, 'Bad request.');

$raw = (string) file_get_contents('php://input');
// Large uploads (publishing posts and pages) are sent gzip-compressed. The size cap stops a "zip bomb".
if (($_SERVER['HTTP_X_BODY_ENCODING'] ?? '') === 'gzip') {
    $raw = function_exists('gzdecode') ? @gzdecode($raw, SITE_REQUEST_MAX * 2) : false;
    if ($raw === false) fail(400, 'The server could not read the compressed upload. Please publish again.');
}
$input = json_decode($raw, true);
unset($raw);
if (!is_array($input)) $input = [];
$action = (string) ($_GET['action'] ?? '');

start_session();

switch ($action) {
    case 'status': {
        $user = current_user();
        respond(200, [
            'ok' => true,
            'setup' => count(read_users()) === 0,
            'user' => $user ? public_user($user) : null,
        ]);
    }

    case 'setup': {
        $username = clean_username($input['username'] ?? '');
        $password = check_password($input['password'] ?? '');
        $user = with_lock(function () use ($username, $password) {
            if (count(read_users()) > 0) fail(403, 'The Super Admin account already exists. Please sign in.');
            $user = [
                'username' => $username,
                'hash' => password_hash($password, PASSWORD_DEFAULT),
                'role' => 'Super Admin',
                'createdAt' => gmdate('c'),
            ];
            write_store('users', [$user]);
            return $user;
        });
        sign_in($user);
        respond(200, ['ok' => true, 'user' => public_user($user)]);
    }

    case 'login': {
        $ip = client_ip();
        $failures = recent_failures($ip);
        if (count($failures) >= MAX_FAILED_LOGINS) {
            $wait = (int) ceil(($failures[0] + LOCKOUT_SECONDS - time()) / 60);
            fail(429, "Too many failed attempts. Try again in $wait minute" . ($wait === 1 ? '' : 's') . '.');
        }
        $username = strtolower(trim((string) ($input['username'] ?? '')));
        $password = (string) ($input['password'] ?? '');
        $users = read_users();
        $i = find_user($users, $username);
        // Always run a hash check so response time doesn't reveal whether the username exists.
        $hash = $i >= 0 ? $users[$i]['hash'] : password_hash('not-a-real-account', PASSWORD_DEFAULT);
        if (!password_verify($password, $hash) || $i < 0) {
            record_failure($ip);
            fail(401, 'Incorrect username or password.');
        }
        clear_failures($ip);
        if (password_needs_rehash($users[$i]['hash'], PASSWORD_DEFAULT)) {
            with_lock(function () use ($users, $i, $password) {
                $users[$i]['hash'] = password_hash($password, PASSWORD_DEFAULT);
                write_store('users', $users);
            });
        }
        sign_in($users[$i]);
        respond(200, ['ok' => true, 'user' => public_user($users[$i])]);
    }

    case 'logout': {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'],
                'httponly' => true, 'samesite' => 'Strict',
            ]);
        }
        session_destroy();
        respond(200, ['ok' => true]);
    }

    case 'users': {
        require_user();
        respond(200, ['ok' => true, 'users' => array_map('public_user', read_users())]);
    }

    case 'user_save': {
        $me = require_user();
        $isSuper = $me['role'] === 'Super Admin';
        $isNew = !empty($input['isNew']);
        $role = in_array($input['role'] ?? '', ROLES, true) ? $input['role'] : 'Editor';
        $password = (string) ($input['password'] ?? '');

        $saved = with_lock(function () use ($me, $isSuper, $isNew, $role, $password, $input) {
            $users = read_users();
            if ($isNew) {
                if (!$isSuper) fail(403, 'Only a Super Admin can add accounts.');
                $username = clean_username($input['username'] ?? '');
                if (find_user($users, $username) >= 0) fail(409, "Username \"$username\" is already taken.");
                $user = [
                    'username' => $username,
                    'hash' => password_hash(check_password($password), PASSWORD_DEFAULT),
                    'role' => $role,
                    'createdAt' => gmdate('c'),
                ];
                $users[] = $user;
                write_store('users', $users);
                return $user;
            }

            $username = strtolower(trim((string) ($input['username'] ?? '')));
            $i = find_user($users, $username);
            if ($i < 0) fail(404, 'That user no longer exists.');
            $isSelf = strcasecmp($users[$i]['username'], $me['username']) === 0;
            if (!$isSuper && !$isSelf) fail(403, 'You can only change your own password.');

            if ($password !== '') $users[$i]['hash'] = password_hash(check_password($password), PASSWORD_DEFAULT);
            if ($isSuper && $users[$i]['role'] !== $role) {
                if ($users[$i]['role'] === 'Super Admin' && super_admin_count($users) <= 1) {
                    fail(400, 'There must always be at least one Super Admin.');
                }
                $users[$i]['role'] = $role;
            }
            write_store('users', $users);
            return $users[$i];
        });
        respond(200, ['ok' => true, 'user' => public_user($saved)]);
    }

    case 'user_delete': {
        $me = require_super();
        with_lock(function () use ($me, $input) {
            $users = read_users();
            $i = find_user($users, (string) ($input['username'] ?? ''));
            if ($i < 0) fail(404, 'That user no longer exists.');
            if (strcasecmp($users[$i]['username'], $me['username']) === 0) fail(400, 'You cannot delete your own account.');
            if ($users[$i]['role'] === 'Super Admin' && super_admin_count($users) <= 1) {
                fail(400, 'You cannot delete the only Super Admin.');
            }
            array_splice($users, $i, 1);
            write_store('users', $users);
        });
        respond(200, ['ok' => true]);
    }

    case 'upload': {
        require_user();
        if (empty($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'])) {
            fail(400, 'No file was uploaded.');
        }
        $file = $_FILES['file'];
        if ($file['error'] !== UPLOAD_ERR_OK) {
            fail(400, 'File upload error code: ' . $file['error']);
        }
        if ($file['size'] > 10 * 1024 * 1024) {
            fail(400, 'Image exceeds maximum allowed size (10 MB).');
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);

        $allowed = [
            'image/jpeg' => 'jpg',
            'image/png'  => 'png',
            'image/webp' => 'webp',
            'image/gif'  => 'gif',
            // SVG is deliberately not allowed: an SVG can carry script, and /uploads is on the same
            // origin as this admin, so opening one would run with the signed-in admin's session.
        ];
        if (!isset($allowed[$mime])) {
            fail(400, 'Invalid file type. Please upload a JPG, PNG, WebP, or GIF image.');
        }

        $ext = $allowed[$mime];
        $uploadDir = $SITE_DIR . '/uploads';
        if (!is_dir($uploadDir) && !@mkdir($uploadDir, 0755, true)) {
            fail(500, 'Could not create /uploads directory on the server.');
        }

        $cleanOrig = preg_replace('/[^a-zA-Z0-9_-]/', '-', pathinfo($file['name'], PATHINFO_FILENAME));
        $cleanOrig = substr($cleanOrig ?: 'media', 0, 30);
        $filename = sprintf('%s-%s-%s.%s', $cleanOrig, gmdate('Ymd'), bin2hex(random_bytes(4)), $ext);
        $dest = $uploadDir . '/' . $filename;

        if (!@move_uploaded_file($file['tmp_name'], $dest)) {
            fail(500, 'Could not save uploaded file. Check server folder permissions.');
        }
        @chmod($dest, 0644);

        respond(200, [
            'ok' => true,
            'url' => '/uploads/' . $filename,
            'name' => $filename,
        ]);
    }

    // Step 1 of publishing posts or pages: the browser sends a checksum for every file it built, and the server
    // answers with the ones it does not already have, so a publish only transfers what changed.
    case 'site_plan': {
        require_site_publisher();
        $hashes = $input['hashes'] ?? null;
        $remove = $input['remove'] ?? [];
        if (!is_array($hashes) || !is_array($remove) || count($hashes) > 5000 || count($remove) > 5000) fail(400, 'That publish request is not valid.');
        $need = [];
        $blocked = [];
        $same = 0;
        foreach ($hashes as $path => $sha) {
            $path = (string) $path;
            if (!site_path_ok($path) || !is_string($sha) || !preg_match('/^[a-f0-9]{64}$/', $sha)) fail(400, "Not an allowed file: $path");
            $file = site_file($path);
            if (is_file($file) && hash_equals($sha, (string) hash_file('sha256', $file))) {
                $same++;
                continue;
            }
            $need[] = $path;
            if (($folder = site_unwritable($path)) !== null) $blocked[] = $folder;
        }
        $gone = [];
        foreach ($remove as $path) {
            if (!site_remove_ok($path)) fail(400, 'Not an allowed file to remove: ' . (is_string($path) ? $path : '?'));
            if (!is_file(site_file($path))) continue;
            $gone[] = $path;
            if (!is_writable(dirname(site_file($path)))) $blocked[] = dirname($path);
        }
        // Pieces left behind by an upload that was interrupted.
        foreach (glob("$DATA_DIR/tmp/*.part") ?: [] as $part) {
            if (filemtime($part) < time() - 3600) @unlink($part);
        }
        respond(200, [
            'ok' => true,
            'need' => $need,
            'remove' => $gone,
            'same' => $same,
            'blocked' => array_values(array_unique($blocked)),
            'chunk' => SITE_CHUNK_PLAIN,
            'chunkGzip' => function_exists('gzdecode') ? SITE_CHUNK_GZIP : 0,
            'maxPieces' => SITE_PIECES_MAX,
            'fix' => site_fix_hint(),
        ]);
    }

    // Step 2: receive files in pieces. Each file is checked against its checksum and only then moved into place in
    // one step, so a visitor never sees a half-written page.
    case 'site_write': {
        require_site_publisher();
        $chunks = $input['chunks'] ?? null;
        if (!is_array($chunks) || !$chunks || !array_is_list($chunks) || count($chunks) > SITE_PIECES_MAX) fail(400, 'That publish request is not valid.');
        $total = 0;
        foreach ($chunks as $c) $total += is_array($c) ? strlen((string) ($c['data'] ?? '')) : 0;
        if ($total > SITE_REQUEST_MAX) fail(413, 'That piece of the upload is too large.');
        $hint = site_fix_hint();

        $written = with_lock(function () use ($chunks, $DATA_DIR, $hint) {
            if (!is_dir("$DATA_DIR/tmp") && !@mkdir("$DATA_DIR/tmp", 0750, true)) {
                fail(500, 'The server cannot create api/data/tmp. Make the site folder writable by the web server user (www).');
            }
            $done = [];
            foreach ($chunks as $c) {
                if (!is_array($c)) fail(400, 'That publish request is not valid.');
                $path = $c['path'] ?? null;
                if (!site_path_ok($path)) fail(400, 'Not an allowed file: ' . (is_string($path) ? $path : '?'));
                $offset = (int) ($c['offset'] ?? 0);
                $data = (string) ($c['data'] ?? '');
                $part = site_part_file($path);

                if ($offset === 0) {
                    if (@file_put_contents($part, $data, LOCK_EX) === false) fail(500, 'The server cannot write to api/data/tmp. Check folder permissions (owner www).');
                } else {
                    clearstatcache(true, $part);
                    if (!is_file($part) || filesize($part) !== $offset) fail(409, "The pieces of $path arrived out of order. Please publish again.");
                    if (@file_put_contents($part, $data, FILE_APPEND | LOCK_EX) === false) fail(500, 'The server cannot write to api/data/tmp. Check folder permissions (owner www).');
                }
                if (empty($c['last'])) continue;

                clearstatcache(true, $part);
                $sha = (string) ($c['sha256'] ?? '');
                if (filesize($part) > SITE_FILE_MAX) {
                    @unlink($part);
                    fail(413, "$path is too large.");
                }
                if (!preg_match('/^[a-f0-9]{64}$/', $sha) || !hash_equals($sha, (string) hash_file('sha256', $part))) {
                    @unlink($part);
                    fail(422, "$path did not arrive intact. Please publish again.");
                }
                $dest = site_file($path);
                $dir = dirname($dest);
                if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
                    @unlink($part);
                    fail(500, "The server cannot create the folder for $path. $hint");
                }
                site_backup($path);
                if (!@rename($part, $dest)) {
                    @unlink($part);
                    fail(500, "The server cannot write $path. $hint");
                }
                @chmod($dest, 0644);
                $done[] = $path;
            }
            return $done;
        });
        respond(200, ['ok' => true, 'written' => $written]);
    }

    // Step 3: delete the pages and posts that were removed, and any folder that is left empty.
    case 'site_remove': {
        require_site_publisher();
        $paths = $input['paths'] ?? null;
        if (!is_array($paths) || count($paths) > 5000) fail(400, 'That publish request is not valid.');
        $removed = 0;
        $hint = site_fix_hint();
        with_lock(function () use ($paths, &$removed, $hint) {
            foreach ($paths as $path) {
                if (!site_remove_ok($path)) fail(400, 'Not an allowed file to remove: ' . (is_string($path) ? $path : '?'));
                $file = site_file($path);
                if (!is_file($file)) continue;
                if (!@unlink($file)) fail(500, "The server cannot remove $path. $hint");
                $removed++;
                $dir = dirname($path);
                while ($dir !== '.' && $dir !== '' && $dir !== 'blogs') {
                    if (!@rmdir(site_file($dir))) break; // not empty (or not ours to remove)
                    $dir = dirname($dir);
                }
            }
        });
        respond(200, ['ok' => true, 'removed' => $removed]);
    }

    case 'publish': {
        $me = require_user();
        $content = $input['content'] ?? null;
        if (!is_array($content) || !$content || array_is_list($content)) fail(400, 'No site content was sent.');
        $json = json_encode($content, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false || strlen($json) > 2_000_000) fail(400, 'The site content is invalid or too large.');

        $target = $SITE_DIR . '/content.js';
        // Escape "</" so content can never close a <script> tag early.
        $body = "/*\n"
            . " * Published site content for index.html (edited in admin.html).\n"
            . " * Published by {$me['username']} on " . gmdate('Y-m-d H:i') . " UTC.\n"
            . " * Any text may contain {commission}, which is replaced by the commission value,\n"
            . " * and {year}, which is replaced by the current year.\n"
            . " */\n"
            . 'window.SITE_DEFAULTS = ' . str_replace('</', '<\/', $json) . ";\n";

        // Keep a copy of the previous version so a bad publish can be rolled back.
        if (is_file($target)) {
            ensure_data_dir();
            $backupDir = "$DATA_DIR/backups";
            if (!is_dir($backupDir)) @mkdir($backupDir, 0750, true);
            @copy($target, $backupDir . '/content-' . gmdate('Ymd-His') . '.js');
            $old = glob("$backupDir/content-*.js") ?: [];
            sort($old);
            foreach (array_slice($old, 0, max(0, count($old) - BACKUPS_TO_KEEP)) as $file) @unlink($file);
        }

        if (@file_put_contents($target, $body, LOCK_EX) === false) {
            fail(500, 'The server cannot write content.js. Make it owned by the web server user (www).');
        }
        respond(200, ['ok' => true, 'publishedAt' => gmdate('c')]);
    }

    default:
        fail(404, 'Unknown action.');
}
