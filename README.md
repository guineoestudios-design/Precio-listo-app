# PrecioListo

App instalable (PWA) para leer facturas de distribuidores con la cámara del celular, detectar productos y costos con Gemini, aplicar el % de ganancia por categoría y exportar la lista de precios en PDF y Excel.

- `index.html` — la app completa
- `sw.js` — guarda la app en el celular para abrir sin internet (la lectura de facturas sí necesita internet)
- `lib/` — jsPDF, jsPDF-AutoTable y SheetJS para generar PDF y Excel

La clave de Gemini y los ajustes se guardan solo en cada celular; no están en este repositorio.
