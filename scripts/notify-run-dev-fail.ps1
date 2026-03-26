param(
  [Parameter(Mandatory = $true)]
  [string]$LogPath
)
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.MessageBox]::Show(
  "stockMonitoring dev 실행에 실패했습니다.$([Environment]::NewLine)로그: $LogPath",
  "stockMonitoring")
