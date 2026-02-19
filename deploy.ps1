# ToolBox 一键部署脚本
# 用法: .\deploy.ps1 [-Message "commit message"]

param(
    [string]$Message = "chore: update site content"
)

Write-Host "🧰 ToolBox Deploy Script" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

# 1. 检查 git 状态
$status = git status --porcelain
if (-not $status) {
    Write-Host "✅ 没有需要提交的更改" -ForegroundColor Green
    exit 0
}

Write-Host "`n📝 检测到以下更改:" -ForegroundColor Yellow
git status --short

# 2. 暂存所有更改
Write-Host "`n📦 暂存更改..." -ForegroundColor Yellow
git add -A

# 3. 提交
Write-Host "💾 提交: $Message" -ForegroundColor Yellow
git commit -m $Message

# 4. 推送
Write-Host "🚀 推送到 GitHub..." -ForegroundColor Yellow
git push

# 5. 完成
Write-Host "`n✅ 部署完成！GitHub Actions 将自动更新网站。" -ForegroundColor Green
Write-Host "🌐 预计 1-2 分钟后生效: https://1426013249.github.io/toolbox/" -ForegroundColor Cyan
