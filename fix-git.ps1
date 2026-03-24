if (Test-Path -Path "hr.html") {
    $hrFile = "hr.html"
} elseif (Test-Path -Path "dashboard/hr.html") {
    $hrFile = "dashboard/hr.html"
} else {
    Write-Output "Could not find hr.html or dashboard/hr.html"
    exit 1
}

$gitStatus = git status --porcelain

if ($gitStatus -like "*$hrFile*") {
    Write-Output "Changes found in $hrFile"
    git add $hrFile
    git commit -m "Update $hrFile"
} else {
    Write-Output "No changes found in $hrFile"
}

if ($gitStatus -like "*deleted:    simpaticohr.github.io*") {
    Write-Output "Staging deletion of simpaticohr.github.io"
    git add simpaticohr.github.io
    git commit --amend --no-edit
}

Write-Output "Pushing to remote"
git push
