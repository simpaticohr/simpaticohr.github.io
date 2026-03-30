import re

# ─── 1. hr-ops.html — add `days` calculation before POST ───────────────────
with open('hr-ops.html', 'r') as f:
    src = f.read()

old = "await post('leave_requests',{employee_id:emp,leave_type:lt,from_date:fd,to_date:td,reason:reason||null,status:'pending',submitted_at:new Date().toISOString(),tenant_id:TENANT});"
new = "var days=Math.max(1,Math.ceil((new Date(td)-new Date(fd))/(864e5))+1);\n    await post('leave_requests',{employee_id:emp,leave_type:lt,from_date:fd,to_date:td,days:days,reason:reason||null,status:'pending',submitted_at:new Date().toISOString(),tenant_id:TENANT});"

if old in src:
    src = src.replace(old, new)
    print("✅ hr-ops.html — days calculation added")
else:
    print("⚠️  hr-ops.html — days block not found (may already be patched)")

with open('hr-ops.html', 'w') as f:
    f.write(src)


# ─── 2. employees.html — null guard in fillMgr + renderTable guard ──────────
with open('employees.html', 'r') as f:
    src = f.read()

# Fix fillMgr null crash
old2 = "var sel = el('em'), cur = sel.value;"
new2 = "var sel = el('em'); if(!sel) return; var cur = sel.value;"
if old2 in src:
    src = src.replace(old2, new2)
    print("✅ employees.html — fillMgr null guard added")
else:
    print("⚠️  employees.html — fillMgr pattern not found")

# Fix renderTable null guard for tbody
old3 = "el('tb').innerHTML = ROWS.map(function(e) {"
new3 = "var tbody=el('tb'); if(!tbody)return; tbody.innerHTML = ROWS.map(function(e) {"

if old3 in src:
    # Also replace closing of innerHTML assignment
    src = src.replace(old3, new3)
    # Fix the closing part that still refs el('tb')
    print("✅ employees.html — renderTable null guard added")
else:
    print("⚠️  employees.html — renderTable pattern not found")

# Better: guard sbInsert null response
old4 = "return Array.isArray(d) ? d[0] : d;"
new4 = "return Array.isArray(d) ? (d[0] || d) : d;"
if old4 in src:
    src = src.replace(old4, new4)
    print("✅ employees.html — sbInsert null guard fixed")

with open('employees.html', 'w') as f:
    f.write(src)


# ─── 3. performance.html — remove duplicate supabase client (GoTrueClient warning) ─
with open('performance.html', 'r') as f:
    src = f.read()

# Remove CDN script (causes duplicate client)
old5 = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>'
if old5 in src:
    src = src.replace(old5, '<!-- supabase CDN removed — using plain fetch instead -->')
    print("✅ performance.html — duplicate supabase CDN removed")
else:
    print("⚠️  performance.html — CDN tag not found")

# Remove unused sb client creation
old6 = "const sb = supabase.createClient(SB_URL, SB_ANON);\nconst headers = { 'X-Tenant-ID': TENANT };"
if old6 in src:
    src = src.replace(old6, "// sb client removed — using sbGet/sbPost (plain fetch) below")
    print("✅ performance.html — unused supabase.createClient removed")
else:
    # Try alternate
    old6b = "const sb = supabase.createClient(SB_URL, SB_ANON);"
    if old6b in src:
        src = src.replace(old6b, "// supabase.createClient removed — using plain fetch sbGet/sbPost")
        print("✅ performance.html — supabase.createClient line removed")
    else:
        print("⚠️  performance.html — createClient line not found")

with open('performance.html', 'w') as f:
    f.write(src)


# ─── 4. onboarding.html — guard patch() null response ──────────────────────
with open('onboarding.html', 'r') as f:
    src = f.read()

old7 = "async function patch(t,id,b){var r=await fetch(SB+'/rest/v1/'+t+'?id=eq.'+id,{method:'PATCH',headers:hdr({'Prefer':'return=representation'}),body:JSON.stringify(b)});var d=await r.json();if(!r.ok)throw new Error((d&&d.message)||r.statusText);return d;}"
new7 = "async function patch(t,id,b){var r=await fetch(SB+'/rest/v1/'+t+'?id=eq.'+id,{method:'PATCH',headers:hdr({'Prefer':'return=representation'}),body:JSON.stringify(b)});var d=await r.json().catch(function(){return{};});if(!r.ok)throw new Error((d&&d.message)||r.statusText);return d;}"
if old7 in src:
    src = src.replace(old7, new7)
    print("✅ onboarding.html — patch() null response guard added")
else:
    print("⚠️  onboarding.html — patch pattern not found (may be OK)")

with open('onboarding.html', 'w') as f:
    f.write(src)


# ─── 5. payroll.html — guard get() null response ───────────────────────────
with open('payroll.html', 'r') as f:
    src = f.read()

old8 = "async function get(qs){var r=await fetch(SB+'/rest/v1/'+qs,{headers:hdr()});var d=await r.json();if(!r.ok)throw new Error((d&&d.message)||r.statusText);return Array.isArray(d)?d:[];}"
new8 = "async function get(qs){var r=await fetch(SB+'/rest/v1/'+qs,{headers:hdr()});var d=await r.json().catch(function(){return{};});if(!r.ok)throw new Error((d&&d.message)||r.statusText);return Array.isArray(d)?d:[];}"
if old8 in src:
    src = src.replace(old8, new8)
    print("✅ payroll.html — get() response guard added")
else:
    print("⚠️  payroll.html — get pattern not found")

with open('payroll.html', 'w') as f:
    f.write(src)


print("\n✅ Done. Run: git diff --stat  to review all changes.")