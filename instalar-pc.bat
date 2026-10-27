@echo off
setlocal EnableExtensions
chcp 65001 >nul
title PrecioListo - Instalar IA en el PC

echo ============================================================
echo   PrecioListo - Instalar la IA para leer facturas en este PC
echo ============================================================
echo.
echo Esto va a:
echo   1. Instalar Ollama (programa gratuito que corre la IA)
echo   2. Descargar el modelo de vision qwen3-vl:4b (unos 3,3 GB)
echo   3. Instalar Tailscale para que el celular se conecte seguro
echo.
echo Necesitas internet. La descarga puede tardar 10 a 30 minutos.
echo.
pause

set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
set "OLLAMA_APP=%LOCALAPPDATA%\Programs\Ollama\ollama app.exe"
set "TS_EXE=%ProgramFiles%\Tailscale\tailscale.exe"
set "APP_ORIGIN=https://guineoestudios-design.github.io"

where winget >nul 2>nul
if errorlevel 1 (
  echo.
  echo [!] No encontre "winget". Actualiza "Instalador de aplicacion" desde la Microsoft Store
  echo     o instala Ollama desde https://ollama.com/download y Tailscale desde https://tailscale.com/download
  echo     y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)

echo.
echo --- Paso 1 de 5: Instalando Ollama ---
if exist "%OLLAMA_EXE%" (
  echo Ollama ya esta instalado.
) else (
  winget install -e --id Ollama.Ollama --accept-source-agreements --accept-package-agreements
)
if not exist "%OLLAMA_EXE%" (
  echo [!] No se pudo instalar Ollama. Instalalo desde https://ollama.com/download y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)

echo.
echo --- Paso 2 de 5: Configurando Ollama para PrecioListo ---
rem Escuchar fuera de "localhost" (necesario para que Tailscale lo entregue al celular)
setx OLLAMA_HOST "0.0.0.0" >nul
rem Permitir que la app PrecioListo le hable a Ollama
setx OLLAMA_ORIGINS "%APP_ORIGIN%" >nul
rem Dejar el modelo cargado 30 minutos para que las siguientes facturas sean mas rapidas
setx OLLAMA_KEEP_ALIVE "30m" >nul
set "OLLAMA_HOST=0.0.0.0"
set "OLLAMA_ORIGINS=%APP_ORIGIN%"
set "OLLAMA_KEEP_ALIVE=30m"
taskkill /IM "ollama app.exe" /F >nul 2>nul
taskkill /IM "ollama.exe" /F >nul 2>nul
timeout /t 2 /nobreak >nul
start "" "%OLLAMA_APP%"
echo Esperando a que Ollama arranque...
timeout /t 8 /nobreak >nul
echo Si Windows pregunta por el Firewall para Ollama, toca CANCELAR: no hace falta y es mas seguro.

echo.
echo --- Paso 3 de 5: Descargando el modelo de vision (3,3 GB) ---
"%OLLAMA_EXE%" pull qwen3-vl:4b
if errorlevel 1 (
  echo [!] La descarga fallo. Revisa el internet y vuelve a ejecutar este archivo; continua donde quedo.
  pause
  exit /b 1
)

echo.
echo --- Paso 4 de 5: Instalando Tailscale ---
if exist "%TS_EXE%" (
  echo Tailscale ya esta instalado.
) else (
  winget install -e --id Tailscale.Tailscale --accept-source-agreements --accept-package-agreements
)
if not exist "%TS_EXE%" (
  echo [!] No se pudo instalar Tailscale. Instalalo desde https://tailscale.com/download y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)
echo.
echo Si creaste una "clave de acceso" de Tailscale en tu celular, pegala aqui
echo (clic derecho para pegar) y presiona Enter. Asi NO tienes que iniciar sesion en este PC.
echo Si no tienes clave, solo presiona Enter para iniciar sesion en el navegador.
set "TSKEY="
set /p "TSKEY=Clave de Tailscale: "
if defined TSKEY (
  "%TS_EXE%" up --authkey=%TSKEY% --unattended
) else (
  echo Se abrira el navegador para iniciar sesion en Tailscale.
  echo Usa la MISMA cuenta que vas a usar en los celulares.
  "%TS_EXE%" up --unattended
)
if errorlevel 1 (
  echo [!] No se pudo conectar Tailscale. Si usaste una clave, puede que haya vencido o ya se haya usado:
  echo     crea una nueva en https://login.tailscale.com/admin/settings/keys y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)

echo.
echo --- Paso 5 de 5: Publicando la IA de forma segura para tus celulares ---
echo Si aparece un enlace para "habilitar HTTPS", abrelo, toca Enable y vuelve aqui.
"%TS_EXE%" serve --bg --https=443 localhost:11434
if errorlevel 1 (
  echo.
  echo [!] Falta habilitar HTTPS en Tailscale:
  echo     1. Abre https://login.tailscale.com/admin/dns
  echo     2. Activa MagicDNS y luego "HTTPS Certificates" ^(Enable HTTPS^)
  echo     3. Vuelve a ejecutar este archivo.
  pause
  exit /b 1
)

for /f "usebackq delims=" %%U in (`powershell -NoProfile -Command "$s = & '%TS_EXE%' status --json | ConvertFrom-Json; 'https://' + $s.Self.DNSName.TrimEnd('.')"`) do set "PC_URL=%%U"

echo.
echo ============================================================
echo   LISTO. Escribe esta direccion en PrecioListo:
echo.
echo      %PC_URL%
echo.
echo   (Ajustes ^> Direccion del PC ^> Probar)
echo ============================================================
echo.
echo En cada celular:
echo   - Instala la app "Tailscale" e inicia sesion con la misma cuenta.
echo   - Deja Tailscale activado mientras escaneas facturas.
echo.
echo Para que funcione, este PC debe estar prendido (sin suspender) y con internet o wifi.
echo.
pause
