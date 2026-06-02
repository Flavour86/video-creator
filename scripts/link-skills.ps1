# link-skills.ps1
# Run from repo root (or any dir) to link .agents/skills/ -> .claude/skills/
# Re-run after clone or pull to restore the junctions.
# Requires Developer Mode ON (Settings -> Privacy & security -> For developers).

$repoRoot = Split-Path -Parent $PSScriptRoot
$src = Join-Path $repoRoot ".agents\skills"
$dst = Join-Path $repoRoot ".claude\skills"

Write-Host "Linking skills: $src -> $dst"
Write-Host ""

$ok = 0; $fail = 0

foreach ($dir in Get-ChildItem $src -Directory) {
    $name   = $dir.Name
    $target = $dir.FullName
    $link   = Join-Path $dst $name

    # Remove any existing entry (text file, real dir, or stale junction)
    if (Test-Path $link) { Remove-Item -Recurse -Force $link }

    # mklink /D honours Developer Mode without requiring admin
    cmd /c "mklink /D `"$link`" `"$target`"" | Out-Null

    $item = Get-Item $link -ErrorAction SilentlyContinue
    if ($item -and $item.LinkType -eq 'SymbolicLink' -and (Test-Path "$link\SKILL.md")) {
        Write-Host "  OK   $name"
        $ok++
    } else {
        Write-Host "  FAIL $name  (try running as Administrator if Developer Mode is off)"
        $fail++
    }
}

Write-Host ""
Write-Host "$ok linked, $fail failed."
