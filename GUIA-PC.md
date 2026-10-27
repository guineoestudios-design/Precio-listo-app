# Guía: IA de PrecioListo en el PC del negocio

Con esto el celular le manda la foto de la factura al PC, y el PC la lee con una IA que corre ahí mismo: gratis, sin límites y sin depender de Google. Si el PC está apagado, la app usa sola el lector del celular.

## Lo que necesitas
- PC con Windows 10 u 11 y 16 GB de RAM (el tuyo, Ryzen 7 4700U, sirve).
- Unos 5 GB libres en el disco.
- Internet para la instalación.

## 1. En el PC (una sola vez)
1. Descarga el instalador: <https://github.com/guineoestudios-design/Precio-listo-app/raw/main/instalar-pc.bat>
2. Haz doble clic en `instalar-pc.bat`. Si Windows muestra "Windows protegió su PC", toca **Más información → Ejecutar de todas formas**.
3. Sigue los mensajes. El paso más largo es la descarga del modelo (3,3 GB).
4. Cuando se abra el navegador de **Tailscale**, inicia sesión (con Google, por ejemplo). Usa la misma cuenta en los celulares.
5. Si Tailscale pide **habilitar HTTPS**, abre el enlace que aparece, toca **Enable** y vuelve a ejecutar el instalador.
6. Al final aparece una dirección como `https://nombre-del-pc.tail1234.ts.net`. Anótala.

Si Windows pregunta por el **Firewall** de Ollama, permite **Redes privadas**.

## Instalar en un PC donde no quieres iniciar sesión (por ejemplo, el del trabajo)
No necesitas cuentas en ese PC: Ollama y el modelo no piden cuenta, y Tailscale se conecta con una clave de acceso que creas desde tu celular.
1. **En tu celular**, abre <https://login.tailscale.com/admin/settings/keys> (ya con tu sesión de Tailscale) → **Generate auth key**. Deja *Reusable* apagado y toca **Generate**. Copia la clave (empieza con `tskey-auth-`).
2. Mándate por **WhatsApp** (a ti mismo) la clave y este enlace: <https://github.com/guineoestudios-design/Precio-listo-app/raw/main/instalar-pc.bat>
3. **En el PC**, abre WhatsApp Web, toca el enlace para descargar el instalador y ejecútalo.
4. Cuando pida **Clave de Tailscale**, pega la clave (clic derecho) y presiona Enter.
5. Si es la primera vez que usas Tailscale, activa HTTPS desde el celular: <https://login.tailscale.com/admin/dns> → **Enable HTTPS**.
6. Al final copia la dirección que muestra y pégala en PrecioListo (Ajustes → Dirección del PC).

La clave sirve una sola vez y vence en unos días; si caduca, crea otra.

## 2. En cada celular
1. Instala la app **Tailscale** (Play Store / App Store) e inicia sesión con la misma cuenta.
2. Deja Tailscale **activado**.
3. En PrecioListo: **Ajustes → Cómo leer las facturas → Automático**.
4. En **Dirección del PC** pega la dirección del paso 1 y toca **Probar**. Debe decir "Conectado".
5. Para pasarlo al otro celular: **Ajustes → Copiar código**, y en el otro **Pegar código**.

## Uso diario
- El PC debe estar **prendido y sin suspender**. Para evitar que se duerma: Configuración de Windows → Sistema → Inicio/apagado y suspensión → "Cuando está enchufado, suspender después de": **Nunca**.
- Ollama arranca solo con Windows; no tienes que abrir nada.
- Con este PC cada factura tarda de 1 a 3 minutos. La primera del día tarda un poco más porque el modelo se carga en memoria.
- Si el PC no responde, la app lo dice y lee con el lector del celular.

## Si algo falla
| Mensaje en la app | Qué hacer |
|---|---|
| "No pude conectar con el PC" | Revisa que el PC esté prendido y que Tailscale esté activo en el celular y en el PC. |
| "El PC rechazó la conexión" | Vuelve a ejecutar `instalar-pc.bat`. |
| "El PC no tiene un modelo de visión" | Vuelve a ejecutar `instalar-pc.bat` (descarga el modelo). |
| Tarda demasiado | Cierra programas pesados del PC mientras lee. En Ajustes puedes elegir el modelo `qwen3-vl:2b` (más rápido, algo menos preciso) si lo instalas con `ollama pull qwen3-vl:2b`. |
