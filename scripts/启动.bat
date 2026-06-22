@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0\.."
for /f "usebackq delims=" %%P in (`node -e "try{require('dotenv').config();console.log(require('./server/config').PORT)}catch(e){console.log(48080)}"`) do set "APP_PORT=%%P"
title 声声网络思政工作室 - 一键启动

:menu
cls
echo.
echo  ============================================================
echo    声声网络思政工作室 - 一键启动菜单
echo  ============================================================
echo.

:: 检测服务运行状态（端口 %APP_PORT%）
set "SERVER_STATUS=未运行"
set "STATUS_ICON=O"
for /f "tokens=*" %%A in ('netstat -ano ^| findstr ":%APP_PORT%" ^| findstr "LISTENING"') do (
    set "SERVER_STATUS=运行中"
    set "STATUS_ICON=*"
    goto :status_done
)
:status_done

if "!SERVER_STATUS!"=="运行中" (
    echo    当前状态：[!STATUS_ICON!] 服务运行中（端口 %APP_PORT%）
) else (
    echo    当前状态：[!STATUS_ICON!] 服务未运行
)
echo.
echo  ----- 日常使用 -----
echo.
echo    [1] 一键启动 + 显示二维码（推荐）
echo    [2] 仅启动服务（生产模式）
echo    [3] 仅启动服务（开发模式，自动重启）
echo    [4] 显示移动端访问地址 / 二维码
echo    [5] 停止服务
echo.
echo  ----- 首次使用 / 维护 -----
echo.
echo    [6] 首次安装（装依赖 + 初始化数据库）
echo    [7] 放行 Windows 防火墙（自动提权）
echo    [8] 健康检查（访问 /api/health）
echo    [9] PM2 守护启动（生产级，开机自启）
echo.
echo    [0] 退出
echo.
echo  ============================================================
echo.

set "choice="
set /p "choice=  请选择 [0-9]："
if "!choice!"=="" goto :menu
if "!choice!"=="1" goto :all_in_one
if "!choice!"=="2" goto :start_prod
if "!choice!"=="3" goto :start_dev
if "!choice!"=="4" goto :show_qr
if "!choice!"=="5" goto :stop_server
if "!choice!"=="6" goto :setup
if "!choice!"=="7" goto :firewall
if "!choice!"=="8" goto :health
if "!choice!"=="9" goto :pm2_start
if "!choice!"=="0" goto :end
echo.
echo   [!] 无效选项，请重新输入。
timeout /t 2 >nul
goto :menu


:: ============================================================
:: [1] 一键启动 + 二维码
:: ============================================================
:all_in_one
cls
echo.
echo  ============================================================
echo    一键启动 + 显示二维码
echo  ============================================================
echo.

if "!SERVER_STATUS!"=="运行中" (
    echo   [√] 服务已经在运行，跳过启动步骤。
    echo.
) else (
    echo   [1/2] 正在新窗口启动服务...
    start "声声服务（端口 %APP_PORT%）" cmd /k "chcp 65001 >nul && cd /d "%~dp0\.." && echo. && echo === 声声服务（关闭此窗口=停止服务） === && echo. && npm start"

    echo        等待服务就绪（最多 8 秒）...
    set "READY=0"
    for /l %%i in (1,1,16) do (
        timeout /t 1 /nobreak >nul
        for /f "tokens=*" %%A in ('netstat -ano ^| findstr ":%APP_PORT%" ^| findstr "LISTENING"') do (
            set "READY=1"
        )
        if "!READY!"=="1" goto :all_in_one_ready
    )
    :all_in_one_ready
    if "!READY!"=="1" (
        echo   [√] 服务已就绪
        echo   [i] 正在用浏览器打开网站...
        start "" "http://localhost:%APP_PORT%/"
    ) else (
        echo   [!] 服务可能仍在启动中，二维码若无法访问，请稍等再试。
    )
    echo.
)

echo   [2/2] 显示移动端二维码...
echo.
call npm run network
echo.
pause
goto :menu


:: ============================================================
:: [2] 启动生产模式
:: ============================================================
:start_prod
cls
echo.
echo  ============================================================
echo    启动服务（生产模式）
echo  ============================================================
echo.
if "!SERVER_STATUS!"=="运行中" (
    echo   [!] 检测到服务已经在运行（端口 %APP_PORT%）。
    echo       如需重启，请先选 [5] 停止服务。
    echo.
    pause
    goto :menu
)
echo   提示：服务将在当前窗口运行，关闭窗口或按 Ctrl+C 可停止。
echo         服务就绪后会自动打开浏览器。
echo.
:: 后台延时打开浏览器（不阻塞前台 npm start；生产模式约 1-2 秒即就绪）
start "" /min powershell -NoProfile -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:%APP_PORT%/'"
call npm start
echo.
pause
goto :menu


:: ============================================================
:: [3] 启动开发模式
:: ============================================================
:start_dev
cls
echo.
echo  ============================================================
echo    启动服务（开发模式 - 文件改动自动重启）
echo  ============================================================
echo.
if "!SERVER_STATUS!"=="运行中" (
    echo   [!] 检测到服务已经在运行（端口 %APP_PORT%）。
    echo       如需重启，请先选 [5] 停止服务。
    echo.
    pause
    goto :menu
)
echo   提示：使用 nodemon 启动，编辑文件后自动重启。
echo.
call npm run dev
echo.
pause
goto :menu


:: ============================================================
:: [4] 显示二维码
:: ============================================================
:show_qr
cls
echo.
echo  ============================================================
echo    显示移动端访问地址 / 二维码
echo  ============================================================
echo.
if "!SERVER_STATUS!"=="未运行" (
    echo   [!] 检测到服务未运行，二维码扫码后将无法访问。
    echo       建议先选 [1] 或 [2] 启动服务，再来这里看二维码。
    echo.
    set "go_on="
    set /p "go_on=  仍然显示二维码？(y/N)："
    if /i not "!go_on!"=="y" goto :menu
    echo.
)
call npm run network
echo.
pause
goto :menu


:: ============================================================
:: [5] 停止服务
:: ============================================================
:stop_server
cls
echo.
echo  ============================================================
echo    停止服务
echo  ============================================================
echo.
if "!SERVER_STATUS!"=="未运行" (
    echo   [√] 服务本来就没在运行。
    echo.
    pause
    goto :menu
)
echo   正在查找并结束占用端口 %APP_PORT% 的进程...
echo.
set "KILLED=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%APP_PORT%" ^| findstr "LISTENING"') do (
    echo   结束进程 PID=%%P
    taskkill /F /PID %%P >nul 2>&1
    if not errorlevel 1 set "KILLED=1"
)
echo.
if "!KILLED!"=="1" (
    echo   [√] 服务已停止
) else (
    echo   [!] 没有找到可结束的进程，可能服务此刻刚好关闭。
)
echo.
pause
goto :menu


:: ============================================================
:: [6] 首次安装（内联自原 setup.bat）
::   端口、编码、CWD 已在脚本顶部统一处理，这里直接做事
:: ============================================================
:setup
cls
echo.
echo  ============================================================
echo    首次安装（装依赖 + 初始化数据库）
echo  ============================================================
echo.

node --version >nul 2>&1
if errorlevel 1 (
    echo   [X] 未检测到 Node.js，请先安装 Node.js 18+
    echo       下载地址: https://nodejs.org/
    echo.
    pause
    goto :menu
)

npm --version >nul 2>&1
if errorlevel 1 (
    echo   [X] 未检测到 npm
    echo.
    pause
    goto :menu
)

echo   [1/6] 检查环境...
echo         Node.js 版本：
node --version
echo         npm 版本：
npm --version
echo.

echo   [2/6] 安装依赖（npm install）...
call npm install
if errorlevel 1 (
    echo.
    echo   [X] 依赖安装失败，请检查网络连接
    echo       提示：可以尝试使用国内镜像源
    echo         npm config set registry https://registry.npmmirror.com
    echo.
    pause
    goto :menu
)
echo         依赖安装完成
echo.

echo   [3/6] 配置环境变量...
if not exist .env (
    copy .env.example .env >nul
    echo         已创建 .env 文件
    echo         提示：请编辑 .env 文件修改管理员密码和其他配置
) else (
    echo         .env 文件已存在，跳过创建
)
echo.

echo   [4/6] 创建必要目录...
if not exist server\data mkdir server\data
if not exist server\uploads mkdir server\uploads
if not exist server\uploads\media mkdir server\uploads\media
if not exist server\uploads\inbox mkdir server\uploads\inbox
echo         目录结构创建完成
echo.

echo   [5/6] 初始化数据库...
if not exist server\data\studio.sqlite (
    echo         正在创建数据库...
    node server\scripts\init-db.js
    if errorlevel 1 (
        echo         [!] 数据库初始化失败，将在首次启动时自动创建
    ) else (
        echo         数据库初始化完成
    )
) else (
    echo         数据库已存在，跳过初始化
)
echo.

echo   [6/6] 环境检查...
node server\scripts\check-env.js
if errorlevel 1 (
    echo         [!] 环境检查发现问题，但可以继续
)
echo.

echo  ============================================================
echo    部署完成！
echo  ============================================================
echo.
echo   下一步：回到主菜单选 [1] 一键启动，或 [2] 生产启动。
echo.
pause
goto :menu


:: ============================================================
:: [7] 放行防火墙（自动提权）
:: ============================================================
:firewall
cls
echo.
echo  ============================================================
echo    放行 Windows 防火墙（端口 %APP_PORT%）
echo  ============================================================
echo.

:: 检测是否已是管理员
net session >nul 2>&1
if %errorLevel% equ 0 (
    echo   [√] 已是管理员权限，直接执行。
    echo.
    if exist "%~dp0open-firewall.bat" (
        call "%~dp0open-firewall.bat"
    ) else (
        echo   [X] 未找到 open-firewall.bat
        echo.
        pause
    )
) else (
    echo   [i] 需要管理员权限，正在请求 UAC 提权...
    echo       系统会弹出"是否允许此应用对你的设备进行更改?"，请点【是】。
    echo.
    if exist "%~dp0open-firewall.bat" (
        powershell -Command "Start-Process -FilePath '%~dp0open-firewall.bat' -Verb RunAs"
        echo   [i] 已在新窗口请求执行，请在那个窗口完成操作。
    ) else (
        echo   [X] 未找到 open-firewall.bat
    )
    echo.
    pause
)
goto :menu


:: ============================================================
:: [8] 健康检查
:: ============================================================
:health
cls
echo.
echo  ============================================================
echo    健康检查
echo  ============================================================
echo.
if "!SERVER_STATUS!"=="未运行" (
    echo   [!] 服务未运行，无法做健康检查。
    echo       请先选 [1] 或 [2] 启动服务。
    echo.
    pause
    goto :menu
)
echo   正在访问 http://127.0.0.1:%APP_PORT%/api/health ...
echo.
echo  ------------------------------------------------------------

:: 优先使用 curl（Win10+ 自带），失败则降级到 PowerShell
where curl >nul 2>&1
if !errorLevel! equ 0 (
    curl -sS --max-time 5 http://127.0.0.1:%APP_PORT%/api/health
    set "HEALTH_OK=!errorLevel!"
) else (
    powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:%APP_PORT%/api/health' -UseBasicParsing -TimeoutSec 5).Content } catch { Write-Host ('请求失败：' + $_.Exception.Message) }"
    set "HEALTH_OK=!errorLevel!"
)

echo.
echo  ------------------------------------------------------------
if "!HEALTH_OK!"=="0" (
    echo   [√] 健康检查完成
) else (
    echo   [!] 请求失败或超时，请确认服务正在 %APP_PORT% 端口监听。
)
echo.
pause
goto :menu


:: ============================================================
:: [9] PM2 守护启动（内联自原 start-pm2.bat）
:: ============================================================
:pm2_start
cls
echo.
echo  ============================================================
echo    PM2 守护启动（生产级）
echo  ============================================================
echo.
echo   提示：PM2 会在后台守护服务进程，关闭窗口不影响服务。
echo         支持开机自启、零停机重启、日志管理等。
echo.

where pm2 >nul 2>nul
if errorlevel 1 (
    echo   [X] 未找到 PM2，请先在管理员命令行执行：
    echo         npm install -g pm2
    echo.
    pause
    goto :menu
)

echo   [→] 通过 PM2 启动服务（生产模式）...
pm2 start ecosystem.config.js --env production
if errorlevel 1 (
    echo.
    echo   [X] PM2 启动失败，请查看上方输出。
    echo.
    pause
    goto :menu
)

echo.
echo   [√] 服务已交给 PM2 守护，关闭此窗口不会影响服务。
echo.
echo   常用命令：
echo     pm2 status                    查看服务状态
echo     pm2 logs shengsheng-studio    查看实时日志
echo     pm2 reload shengsheng-studio  零停机重启
echo     pm2 stop shengsheng-studio    停止服务
echo     pm2 startup                   配置开机自启（按提示执行回显命令）
echo.
pause
goto :menu


:: ============================================================
:: 退出
:: ============================================================
:end
cls
echo.
echo  感谢使用，再见！
echo.
timeout /t 1 >nul
endlocal
exit /b 0
