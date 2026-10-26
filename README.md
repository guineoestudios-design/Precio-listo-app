# PrecioListo

App instalable (PWA) para leer facturas de distribuidores con la cámara del celular, detectar productos y costos, aplicar el % de ganancia por categoría y exportar la lista de precios en PDF y Excel.

Tres formas de leer la factura (Ajustes → Cómo leer las facturas):
- **IA del PC** (Ollama + qwen3-vl, vía Tailscale): la más precisa, gratis y sin límites. Ver [GUIA-PC.md](GUIA-PC.md).
- **Lector del celular** (Tesseract + algoritmo, `parser.js`): sin internet; se usa solo si el PC no responde.
- **Gemini** (opcional, con clave gratuita).

- `index.html` — la app completa
- `parser.js` — algoritmo que reconoce las líneas de la factura (cantidad, costo, IVA, marca, categoría)
- `instalar-pc.bat` — instala y configura la IA en el PC con Windows
- `sw.js` — guarda la app en el celular para abrir sin internet (la lectura de facturas sí necesita internet)
- `lib/` — jsPDF, jsPDF-AutoTable y SheetJS (PDF y Excel), Tesseract.js con español (lector del celular)

La clave de Gemini y los ajustes se guardan solo en cada celular; no están en este repositorio.
