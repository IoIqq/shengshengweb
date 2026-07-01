@echo off
chcp 65001 >nul
set CERTS_DIR=%~dp0..\server\certs
if not exist "%CERTS_DIR%" mkdir "%CERTS_DIR%"

echo 正在生成自签名 TLS 证书（有效期 10 年）...
openssl req -x509 -newkey rsa:2048 ^
  -keyout "%CERTS_DIR%\key.pem" ^
  -out "%CERTS_DIR%\cert.pem" ^
  -days 3650 -nodes ^
  -subj "/CN=localhost" ^
  -addext "subjectAltName=IP:127.0.0.1,DNS:localhost"

if %errorlevel% neq 0 (
  echo.
  echo 失败。请确保 OpenSSL 已安装（Git 自带的 Git Bash 中已包含）。
  echo 用 Git Bash 运行：bash scripts/generate-cert.bat
) else (
  echo.
  echo 证书已生成：server/certs/cert.pem + key.pem
  echo 重启服务器后将自动启用 HTTPS。
  echo 首次访问浏览器会提示"不安全"，点击"高级 - 继续访问"即可。
)
pause
