# PrecioListo — contexto para Claude

App web instalable (PWA) para una **ferretería en Colombia**. El dueño toma la foto de la factura de un distribuidor, la app detecta productos, marca, cantidad, costo e IVA, aplica el % de ganancia según la categoría y genera la lista de precios de venta en **PDF y Excel**.

El dueño no programa: habla en español sencillo, prefiere pasos cortos y concretos, y casi siempre manda fotos de pantalla en vez de copiar texto. Respóndele en español.

## Dónde vive
- Repositorio: `guineoestudios-design/Precio-listo-app` (público). Publicado con GitHub Pages en <https://guineoestudios-design.github.io/Precio-listo-app/>.
- Cada push a `main` se publica en 1–2 min. Los celulares reciben la versión nueva al cerrar y abrir la app con internet.
- **Siempre sube la versión de `CACHE` en `sw.js`** (`preciolisto-vN`) cuando cambies archivos de la app, o los celulares siguen con la versión vieja.
- Haz los commits con el correo anónimo `347576487+guineoestudios-design@users.noreply.github.com`, nunca con el correo personal.

## Archivos
- `index.html` — toda la app (HTML + CSS + JS en un archivo, sin compilación). Ajustes y clave en `localStorage` de cada celular.
- `parser.js` — lector por algoritmo: convierte las líneas del OCR en productos (cantidad × unitario × IVA ≈ total, marcas, categorías por palabras clave). Funciona en navegador y en Node (`module.exports`).
- `sw.js` — service worker (caché para abrir sin internet).
- `lib/` — jsPDF + autotable, SheetJS (xlsx 0.18.5, solo para *escribir*), Tesseract.js 6 con español (`lib/tesseract/`).
- `instalar-pc.bat` — instala Ollama + modelo + Tailscale en Windows. Windows Defender lo marcó una vez como `Trojan:Script/Ulthar.A!ml` (falso positivo por comportamiento). Si molesta, guía al usuario a instalar a mano con los instaladores oficiales.
- `GUIA-PC.md` — guía para el usuario.

## Cómo lee las facturas (Ajustes → "Cómo leer las facturas")
1. **IA del PC (principal)**: Ollama en el PC de la ferretería, alcanzado desde el celular por **Tailscale** (`tailscale serve --bg --https=443 localhost:11434`). La app llama `/api/tags`, `/api/ps`, `/api/generate` (precarga) y `/api/chat` con `stream:true`, `format:"json"`, imágenes en base64 a 1280 px.
2. **Lector del celular**: Tesseract.js + `parser.js`, sin internet. Respaldo automático si el PC no responde.
3. **Gemini**: opcional con clave gratuita; se dejó de usar porque la API gratis estaba saturada.

## El PC de la ferretería
- Portátil **Ryzen 7 4700U, 16 GB RAM, gráficos integrados**, Windows 11. Nombre en Tailscale: `ferreteria-mr` → `https://ferreteria-mr.tail444b1f.ts.net`.
- Ollama 0.40.x con `OLLAMA_HOST=0.0.0.0`, `OLLAMA_ORIGINS=https://guineoestudios-design.github.io`, `OLLAMA_KEEP_ALIVE=8h`.
- Firewall: se recomienda **no** permitir Ollama (Tailscale llega por localhost); así nadie más en el wifi lo usa.
- Hay otro PC de escritorio: **Ryzen 5 5600G, 16 GB**, Windows 11, nombre de equipo `FERRETERIA_MR`, usuario `pcfer`. Tiene Ollama 0.40.11 con `qwen3-vl:4b-instruct` y `qwen3-vl:2b-instruct`, y Git instalado. El repo está clonado en `D:\factura lista\Precio-listo-app`. No tiene Node ni Python.

## Lo que ya aprendimos
- **Primera carga del modelo ≈ 3 min** en este PC. Durante ese tiempo la conexión no envía nada y se cortaba ("network error"). Solución ya hecha: la app precarga el modelo al abrirse y, al leer, sondea `/api/ps` hasta que esté cargado antes de mandar la foto.
- `qwen3-vl:4b` (la etiqueta por defecto) es la versión que **piensa** ("Thinking...") y tardó más de 6 min con una factura. La app prefiere `qwen3-vl:4b-instruct`: la etiqueta existe y se midió en el 5600G (27-oct-2026) con una factura de prueba de 12 productos y la misma petición de la app: **3 min 17 s** (41 s leyendo la imagen, 152 s escribiendo ~900 tokens, 100 % CPU). Todos los números salieron bien.
- `qwen3-vl:2b-instruct` en el mismo PC: **2 min**, pero leyó todos los precios mil veces menores (`18.45` en vez de `18450`). **No usarlo.**
- Si la pantalla del celular se apaga o se cambia de app, Android corta la conexión: la app pide *wake lock* y avisa con un mensaje claro.
- El usuario es administrador del PC.

## Pendientes (en orden)
1. Medir el 4b-instruct con una **foto real** tomada con el celular (la de prueba era una imagen limpia generada en el PC) y decidir qué PC queda de servidor. Si hay que acelerar: la mayor parte del tiempo es escribir la respuesta, así que pedir un JSON más corto ayudaría más que cambiar de modelo.
2. **Calibración de `parser.js` hecha (27-oct-2026)** con 31 páginas escaneadas (CamScanner) de sus proveedores: Mercadeo SAS (Tubosa), Distribuidora La Superior, Ferredistarco, Würth, Ferroplast, Distribuciones ARO, CCD, Sidoc, una cotización y una remisión. Acierto (cantidad y costo exactos) **32 % → 71 %** (89/125) sobre 12 facturas con respuesta correcta, productos falsos 94 → 37; de los que no quedan marcados "Revisar", 92 % están bien. Lo que ya maneja: hojas giradas (prueba 90/180/270 a 1600 px), descuentos por línea (Dcto1/Dcto2/%Desc, solo entre unitario y total), "$" leído como 5/S/8, ceros perdidos ("$5.40"→5400), formato `27,500.000`, `COP $`, cantidad tras "UND", IVA solo al pie (≈19 % de un subtotal, con fletes), remisiones sin precio (costo 0, "Falta precio"), borrado de tinta azul y sellos rojos antes del OCR. Pendiente: remisiones CCD/Sidoc (la columna UND sale ilegible), Ferroplast con cantidades encerradas en círculo, confirmar `NIZ` y `ZINC DR BL*250`. Las fotos y el texto OCR de las facturas **no están en el repo** (tienen NIT y datos de proveedores).
   **Segunda ronda (27-oct-2026)**, medida con nombre, cantidad y unitario neto correctos de 20 facturas (234 productos), OCR hecho con el mismo proceso de la app: nombre bien 65 % → **85 %**, cantidad 72 % → **82 %**, precio 68 % → **79 %**, cantidad+precio 63 % → **75 %**, productos falsos 16 → 9; todos los que salen mal quedan marcados "Revisar". Qué se hizo:
   - **Código vs. precio** (queja del usuario): un número de 5+ dígitos sin "$" ni separador de miles (REF/código del proveedor) nunca es precio; uno de 4 dígitos sin "$" no compite con los que sí lo tienen; la cantidad no se usa como precio.
   - **Nombres**: vocabulario de ferretería (`LEX`) para corregir letras mal leídas (`fixWord`: "L1JA"→lija, palabras pegadas, "ERIVAL"→Grival), quitar códigos y basura del OCR al inicio/fin (`cleanName`, `isJunkTok`) y mostrarlo bonito (`prettyName`: tildes, "SANIT"→sanitario/a, abreviaturas, siglas, "C*25"→"(caja x25)"). Cuidado: la corrección por parecido no toca palabras cortas que parecen español ("papel" no pasa a "panel") ni palabras en MAYÚSCULAS con vocales al inicio del nombre aunque no estén en el vocabulario ("ARROZ DIANA").
   - **Líneas partidas**: une nombre y precios que el OCR separó en dos renglones (`logicalLines`).
   - **Aprende de la página** (`learnPage`, dos pasadas): descuento fijo de la factura, cantidades con decimales, precios con espacio de miles ("$42 795"), si el total trae IVA.
   - **Categorías** (`CONCEPTS` / `pickCategory`): gana la primera palabra del nombre que dice qué es ("chapeta lavamanos con tornillo" → plomería); frases que mandan ("tubo conduit" → eléctricos, "llave inglesa" → herramientas, "cinta aisl" → eléctricos); las marcas solo deciden si no hay otra pista. Si el usuario crea una categoría (ej. "Jardín", "Cerrajería", "Siliconas y pegantes"), su nombre también sirve de pista. En la IA del PC, si el modelo deja "Otros" o inventa una categoría, se usa `pickCategory`. En las 234 líneas reales "Otros" bajó de 56 a 25 (quedan siliconas, chapas, cintas: no tienen categoría propia por defecto).
   - Para medir: guarda en el scratchpad un `truth.json` con `[nombre, cantidad, unitario neto]` por página y compara; no subas esos archivos al repo.
3. **Excel para el POS (29-oct-2026)**: el botón Excel ("Excel POS") llena la plantilla `plantilla_productos.xlsx` del sistema POS del usuario (se importa en el POS en Productos → Importar Excel). Hojas `Productos` (14 columnas con los títulos EXACTOS de la fila 1: Nombre *, Código de barras, SKU (código interno), Categoría, Marca, Proveedor, Unidad, Costo, Precio de venta *, IVA %, Stock inicial, Stock mínimo, Ubicación, Descripción; con sus notas), `Listas` e `Instrucciones`. No cambies esos títulos. Decisiones: Costo = el costo que muestra la app (con IVA si "Sumar el IVA" está activo); Precio de venta = el de la app; IVA 0 se deja vacío (el POS usa su IVA por defecto), 5 y 19 se escriben; Stock inicial = cantidad de la factura; Unidad = "unidad" ("metro" si el nombre dice por metro); código de barras y SKU vacíos (el código del proveedor no es código de barras). En Ajustes ("El botón Excel descarga") se puede volver al resumen con ganancias. La hoja `Listas` de la plantilla real trae las categorías, marcas y proveedores del POS: **no se guardó en el repo**. Las categorías del POS son distintas a las de la app (aerosoles, brocas, herramientas, niples, niveles, pinturas, siliconar, tornilleria, tubos): falta preguntar al usuario si quiere alinearlas.
   - **Proveedor**: el POS crea un proveedor nuevo por cada nombre distinto, así que `parseHeader` ya no adivina con cualquier renglón: usa `KNOWN_SUPPLIERS` (nombres como están en el POS: mercadeo, la superior, ferredistarco, wurth, sidoc, ferroplast, aro, ccd) o una línea con SAS/Ltda/Distribuidora…; si no, queda vacío. También saca el NIT del proveedor (antes del bloque "Cliente") y el número ("No. 00031713", concesión, cotización). Lo que el usuario escribe en Proveedor se recuerda por NIT (`localStorage` `pl_prov`, viaja en "Copiar código"). La IA del PC devuelve también `nit`.
4. Historial de git: los 4 commits más antiguos tienen el correo personal del usuario. Reescribirlos requiere `git push --force` y **el usuario aún no lo ha autorizado**. No lo hagas sin su permiso explícito.

Hecho (27-oct-2026): categorías de ferretería por defecto, todas al **30 %** (lo eligió el usuario): Tubería y PVC, Tornillería y fijaciones, Eléctricos, Pinturas, Herramientas, Cemento y obra, Plomería, Otros. Los celulares que tenían guardadas las categorías viejas de abarrotes sin cambios pasan solos a las nuevas (`OLD_CATS` en `index.html`).

## Pruebas
- Servir la carpeta (`python -m http.server`) y abrirla en un navegador. Para el lector del celular sirve una foto de factura; para la IA del PC se puede simular Ollama con respuestas falsas.
- `node -e "const P=require('./parser.js'); console.log(P.parseInvoice(lineas, categorias))"` para probar el algoritmo. En el 5600G no hay Node ni Python: servir con un `HttpListener` de PowerShell y probar `InvoiceParser` desde la consola del navegador.
