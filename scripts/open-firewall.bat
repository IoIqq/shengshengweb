@echo off
chcp 65001 >nul
REM ================================================================
REM  Windows 防火墙放行 - 声声工作室（端口 3002）
REM  请右键 → 以管理员身份运行
REM ================================================================
echo.
echo ================================================
echo   声声工作室 - Windows 防火墙放行助手
echo ================================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [错误] 需要管理员权限
    echo.
    echo 请关闭此窗口，然后右键此文件 - 以管理员身份运行
    echo.
    pause
    exit /b 1
)

echo [信息] 检查现有规则...
netsh advfirewall firewall show rule name="声声工作室-3002" >nul 2>&1
if %errorLevel% equ 0 (
    echo [信息] 已存在规则，先删除旧规则
    netsh advfirewall firewall delete rule name="声声工作室-3002" >nul
)

echo [操作] 添加 TCP 入站规则（端口 3002）...
netsh advfirewall firewall add rule ^
    name="声声工作室-3002" ^
    dir=in ^
    action=allow ^
    protocol=TCP ^
    localport=3002 ^
    profile=private,domain ^
    description="允许局域网设备访问声声思政工作室网站"

if %errorLevel% equ 0 (
    echo.
    echo [成功] 防火墙规则已添加
    echo.
    echo 现在你可以：
    echo   1. 启动服务器：npm start
    echo   2. 查看访问地址：npm run network
    echo   3. 手机扫码访问，或在浏览器输入打印的 IP 地址
    echo.
) else (
    echo.
    echo [失败] 防火墙规则添加失败，请检查 Windows 防火墙服务是否启用
    echo.
)

pause
