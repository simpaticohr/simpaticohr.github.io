# Fix employees.js auth function
$content = Get-Content "js\employees.js" -Raw -Encoding UTF8

# Replace the broken authHeaders function
$oldAuth = 'function authHeaders\(\) \{[^}]*\}'
$newAuth = 'async function authHeaders() {
  try {
    const client = window.SimpaticoDB; if (!client) return {};
    const { data } = await client.auth.getSession();
    const token = data?.session?.access_token || localStorage.getItem("simpatico_token") || "";
    return token ? { Authorization: "Bearer " + token } : {};
  } catch {
    const token = localStorage.getItem("simpatico_token") || "";
    return token ? { Authorization: "Bearer " + token } : {};
  }
}'

$content = $content -replace $oldAuth, $newAuth

# Also fix any remaining .auth.session() calls
$content = $content -replace "sb\(\)\?\.auth\?\.session\(\)\?\.access_token", "localStorage.getItem('simpatico_token') || ''"
$content = $content -replace "\(await sb\(\)\?\.auth\?\.getSession\(\)\)\?\.data\?\.session\?\.access_token", "localStorage.getItem('simpatico_token') || ''"

Set-Content "js\employees.js" -Value $content -Encoding UTF8
Write-Host "Fixed employees.js"
