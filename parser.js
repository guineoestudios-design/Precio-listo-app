/* PrecioListo — lector de facturas por algoritmo (sin IA).
   Recibe las líneas de texto que sacó el OCR y devuelve proveedor, número, fecha y productos.
   Pensado para facturas colombianas: miles con punto ("12.500"), decimales con coma ("12.500,00"). */
(function (root) {
  "use strict";

  const SKIP = /\b(sub\s*total|total|iva\s*\d+|base\s+gravable|nit|r\.?u\.?t|tel[eé]fono|tel\b|cel\b|direcci[oó]n|dir\b|cufe|resoluci[oó]n|autoriza|cliente|vendedor|p[aá]gina|retenci[oó]n|rete\s*(fuente|ica|iva)|reteica|forma\s+de\s+pago|vence|vencimiento|cambio|efectivo|cr[eé]dito|contado|firma|recibido|observaci|son:|pesos\s+m\/?cte|saldo|abono|flete|domicilio|consecutivo|prefijo|regimen|r[eé]gimen|responsable|actividad\s+econ|www\.|@|correo|email)\b/i;
  const HEADER_ROW = /\b(descripci[oó]n|producto|art[ií]culo|referencia)\b.*\b(cant|valor|precio|vr|total)\b/i;
  const UNIT_AFTER = /^(g|gr|grs|gramos?|kg|kgs|kilos?|ml|cc|l|lt|lts|litros?|oz|und|unds|un|uni|unidades?|cm|mt|m|mts|x|pack|paq|sobres?|tabletas?|rollos?)\.?$/i;
  const NUM_RE = /^\$?-?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?$|^\$?-?\d+(?:[.,]\d{1,2})?$/;

  const BRANDS = [
    "Diana","Roa","Florhuila","Arroz Blanquita","Supremo","Doria","Comarrico","La Muñeca","Monticello","Premier","Gourmet","Oleocali","Olivetto",
    "Riopaila","Manuelita","Incauca","Providencia","Refisal","Fruco","San Jorge","Respin","Knorr","Maggi","Badia","El Rey","Zenú","Ranchera","Rica",
    "Van Camp's","Van Camps","Atún Isabel","Isabel","Sello Rojo","Águila Roja","Colcafé","Nescafé","Juan Valdez","Corona","Luker","Chocolate Corona","Quaker",
    "Kellogg's","Nestlé","Milo","Alpina","Colanta","Alquería","Parmalat","Algarra","Klim","La Lechera","Bimbo","Ramo","Noel","Colombina","Nutresa",
    "Jet","Jumbo","Super Ricas","Margarita","Frito Lay","Doritos","Cheetos","De Todito","Choclitos","Natuchips","Yupi","Gol","Chocorramo","Festival",
    "Saltín","Ducales","Tosh","Oreo","Trululú","Bon Bon Bum","Chocolatina Jet","Coca-Cola","Coca Cola","Postobón","Pepsi","Sprite","Big Cola","Quatro",
    "Colombiana","Manzana Postobón","Pony Malta","Hit","Tutti Frutti","Cifrut","Gatorade","Powerade","Brisa","Cristal","Manantial","Speed Max",
    "Vive 100","Red Bull","Bretaña","Águila","Poker","Club Colombia","Costeña","Pilsen","Corona Extra","Budweiser","Aguardiente Antioqueño",
    "Néctar","Ron Medellín","Ron Viejo de Caldas","Old Parr","Fab","Ariel","Dersa","Rindex","Ace","Axion","Lava","Las Llaves","Bon Bril","Fassi",
    "Familia","Scott","Rosal","Nube","Suavitel","Clorox","Límpido","Blancox","Fabuloso","Colgate","Fortident","Protex","Palmolive","Rexona",
    "Lux","Johnson's","Savital","Sedal","Pantene","Head & Shoulders","Konzil","Nosotras","Kotex","Huggies","Pequeñín","Winny","Gillette","Speed Stick",
    "Mimo","Purina","Dog Chow","Chunky","Ringo","Agrocampo"
  ];
  const BRAND_RE = BRANDS
    .map(b => ({b, re: new RegExp("(^|[^\\p{L}])" + norm(b).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*") + "(?=$|[^\\p{L}])", "iu")}))
    .sort((a, b) => b.b.length - a.b.length);

  const CONCEPTS = [
    {k:"licores",  match:/licor|cerveza|trago|vino/i, words:/\b(cerveza|aguardiente|ron|vino|whisky|vodka|tequila|brandy|ginebra|lata\s+aguila|pola|cerv)\b|aguila|poker|club colombia|costena|pilsen|antioqueno/},
    {k:"bebidas",  match:/bebida|gaseosa|refresco/i, words:/\b(gaseosa|agua|jugo|refresco|malta|cola|energizante|energetica|bebida|te\s+helado|soda|hidratante|limonada|kola|naranjada)\b|postobon|coca|pepsi|sprite|pony|gatorade|powerade|brisa|cristal|manantial|speed|vive 100|red bull|cifrut|tutti|bretana|quatro/},
    {k:"lacteos",  match:/l[aá]cteo|refriger|lacteo|fr[ií]o/i, words:/\b(leche|queso|yogur|yogurt|kumis|kumi|mantequilla|margarina|crema\s+de\s+leche|arequipe|avena\s+liquida|huevo|huevos|salchicha|jamon|mortadela|chorizo|cuajada|kefir)\b|alpina|colanta|alqueria|parmalat|algarra/},
    {k:"aseo",     match:/aseo|limpieza|hogar|higiene|cuidado/i, words:/\b(detergente|jabon|papel\s+higienico|higienico|cloro|blanqueador|lavaloza|suavizante|shampoo|champu|crema\s+dental|dental|toalla|toallas|panal|panales|desodorante|esponja|limpiador|ambientador|servilleta|servilletas|cepillo|afeitar|rinse|acondicionador|pañal|pañales|lavaplatos|desinfectante|insecticida|bolsas?\s+basura)\b|fab|ariel|dersa|rindex|axion|familia|scott|rosal|suavitel|clorox|limpido|colgate|protex|palmolive|rexona|savital|sedal|pantene|nosotras|kotex|huggies|pequenin|winny|bon bril/},
    {k:"snacks",   match:/snack|dulce|golosina|mecato|confit/i, words:/\b(papas|papa\s+frita|galleta|galletas|chocolatina|dulce|dulces|chicle|chicles|mani|ponque|gomitas|bombon|bombones|caramelo|caramelos|chito|chitos|rosquitas|tostacos|platanitos|wafer|brownie|barra|bocadillo|mecato|snack|gelatina|helado|paleta)\b|margarita|super ricas|de todito|choclitos|doritos|cheetos|jet|jumbo|gol|chocorramo|festival|saltin|ducales|tosh|oreo|trululu|bon bon bum|yupi|natuchips/},
    {k:"abarrotes",match:/abarrote|grano|despensa|v[ií]vere|mercado|alimento/i, words:/\b(arroz|aceite|azucar|sal|frijol|frijoles|lenteja|lentejas|garbanzo|arveja|pasta|pastas|spaghetti|espagueti|harina|atun|sardina|cafe|chocolate|panela|avena|maiz|arepa|arepas|pan|salsa|mayonesa|mostaza|vinagre|caldo|cubo|cubos|condimento|comino|color|levadura|maizena|fecula|cereal|galleta\s+de\s+sal|enlatado|mermelada|miel|bocadillo)\b|diana|roa|florhuila|doria|comarrico|premier|oleocali|riopaila|manuelita|incauca|fruco|knorr|maggi|sello rojo|aguila roja|colcafe|nescafe|corona|luker|quaker|zenu|van camp/},
  ];

  function norm(s){ return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

  // "12.500" -> 12500 · "12.500,50" -> 12500.5 · "2,5" -> 2.5 · "4.200" -> 4200
  function parseNum(tok){
    let t = tok.replace(/^\$/, "").replace(/[^\d.,-]/g, "");
    if (!t) return null;
    const last = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
    if (last >= 0){
      const decs = t.length - last - 1;
      if (decs === 3) t = t.replace(/[.,]/g, "");                     // separador de miles
      else { t = t.slice(0, last).replace(/[.,]/g, "") + "." + t.slice(last + 1); } // decimales
    }
    const n = parseFloat(t);
    return isFinite(n) ? n : null;
  }
  // Corrige confusiones típicas del OCR dentro de números: O→0, l/I→1, S→5
  function fixDigits(tok){
    // Solo si el token es todo dígitos, separadores y letras que se confunden con números
    if (/\d/.test(tok) && /^\$?[\dOoIlS|.,]+%?$/.test(tok) && /\d[.,]?[OoIlS]|[OoIlS][.,]?\d/.test(tok))
      return tok.replace(/[Oo]/g, "0").replace(/[lI|]/g, "1").replace(/S/g, "5");
    return tok;
  }
  const SIZE_TOK = /^\d+(?:[.,]\d+)?[a-z]{1,4}\.?$/i;
  const isWord = t => (t.match(/\p{L}/gu) || []).length >= 2 && !SIZE_TOK.test(t) && !/^\d{2,}/.test(t);

  function sentenceCase(s){
    const low = s.toLowerCase().replace(/\s+/g, " ").trim();
    return low.charAt(0).toUpperCase() + low.slice(1);
  }

  function findBrand(desc){
    const n = norm(desc);
    for (const {b, re} of BRAND_RE) if (re.test(n)) return b;
    return "";
  }

  function pickCategory(desc, brand, categorias){
    const n = norm(desc + " " + brand);
    const names = categorias.map(c => c.nombre);
    for (const c of CONCEPTS){
      if (!c.words.test(n)) continue;
      const hit = names.find(name => c.match.test(norm(name)) || c.match.test(name));
      if (hit) return hit;
    }
    return names.find(x => /otro/i.test(x)) || names[names.length - 1] || "Otros";
  }

  function parseLine(raw){
    let line = raw.replace(/[|¦]/g, " ").replace(/\s+/g, " ").trim();
    if (line.length < 6 || SKIP.test(norm(line)) || HEADER_ROW.test(line)) return null;
    const toks = line.split(" ").map(fixDigits);

    // Tramo de la descripción: desde la primera hasta la última palabra con letras
    let a = toks.findIndex(isWord), b = -1;
    for (let i = toks.length - 1; i >= 0; i--) if (isWord(toks[i]) && !UNIT_AFTER.test(toks[i])) { b = i; break; }
    if (a < 0 || b < 0) return null;
    // Una palabra de unidad pegada al final (UND, KG) no es parte del nombre
    while (a > 0 && /^\d+[a-z]*$/i.test(toks[a-1]) && UNIT_AFTER.test(toks[a])) a--; // "500 g" al inicio
    // Extiende el nombre sobre la presentación: "X 500GR", "1.5L", "330 ML", "X 12 UND"
    const SIZE = /^\d+(?:[.,]\d+)?(g|gr|grs|kg|ml|cc|l|lt|lts|oz|und|un|cm|mt|m)\.?$/i;
    for (;;){
      const t = toks[b+1], t2 = toks[b+2];
      if (t == null) break;
      if (/^x$/i.test(t) || SIZE.test(t) || UNIT_AFTER.test(t)) { b++; continue; }
      if (/^\d+(?:[.,]\d+)?$/.test(t) && t2 != null && UNIT_AFTER.test(t2) && !/^x$/i.test(t2)) { b += 2; continue; }
      if (/^x\d+/i.test(t)) { b++; continue; }
      break;
    }
    let desc = toks.slice(a, b + 1).join(" ").replace(/^[-–:*.\s]+|[-–:*.\s]+$/g, "").replace(/^\d(?=\p{L}{3})/u, "");
    if ((desc.match(/\p{L}/gu) || []).length < 3) return null;

    // Números fuera de la descripción
    const nums = []; let iva = null;
    toks.forEach((t, i) => {
      if (i >= a && i <= b) return;
      if (/^\d{1,2}([.,]\d+)?%$/.test(t)) { const v = parseNum(t); if ([0,5,19,8,16].includes(Math.round(v))) iva = Math.round(v); return; }
      const clean = t.replace(/[^\d.,$-]/g, "");
      if (!clean || !NUM_RE.test(clean)) return;
      if (/^\d{7,}$/.test(clean)) return;                       // código de barras / referencia
      const v = parseNum(clean); if (v == null || v <= 0) return;
      nums.push({v, i, sep: /[.,]\d{3}/.test(clean), before: i < a});
    });
    // Códigos cortos al inicio de la línea (ej. "10234 ARROZ…") no son cantidades si son largos
    const cand = nums.filter(n => !(n.before && n.i === 0 && n.v >= 1000 && !n.sep && nums.length > 2));
    if (!cand.length) return null;

    const money = cand.filter(n => n.v >= 100 || n.sep);
    const qtys  = cand.filter(n => Number.isInteger(n.v) && n.v >= 1 && n.v <= 9999 && !n.sep);
    if (!money.length) return null;

    let best = null;
    const near = (x, y) => Math.abs(x - y) <= Math.max(2, y * 0.015);
    for (const q of qtys) for (const u of money) for (const t of money){
      if (u === t || q === u || q === t || t.v <= u.v) continue;
      for (const r of [0, 5, 19]){
        if (iva != null && r && r !== iva) continue;
        if (near(q.v * u.v * (1 + r/100), t.v)) {
          const score = (u.i < t.i ? 2 : 0) + (r === 0 ? 1 : 0) + (q.before || q.i < u.i ? 1 : 0) + (r === iva ? 1 : 0);
          if (!best || score > best.score) best = {q, u, t, iva: r || iva || 0, score};
        }
      }
    }
    let cantidad, costo, revisar = false, ivaPct = iva || 0, used = [];
    if (best){ cantidad = best.q.v; costo = best.u.v; ivaPct = best.iva; used = [best.q, best.u, best.t]; }
    else if (money.length >= 2){
      const u = money[0], t = money[money.length - 1];
      // ¿El total es unitario × cantidad (con o sin IVA)? Si la cantidad leída no cuadra, la deducimos.
      let found = null;
      for (const r of iva != null ? [iva, 0] : [0, 19, 5]){
        const ratio = t.v / (u.v * (1 + r/100)), q = Math.round(ratio);
        if (q >= 1 && Math.abs(ratio - q) / q < 0.01){ found = {q, r}; break; }
      }
      if (found){
        cantidad = found.q; costo = u.v; ivaPct = found.r;
        revisar = !qtys.some(x => x.v === found.q);
        used = [u, t, ...qtys.filter(x => x.v === found.q)];
      } else {
        const q = qtys.find(x => x !== u && x !== t);
        cantidad = q ? q.v : 1; costo = u.v; revisar = true; used = [u, t, q].filter(Boolean);
      }
    } else {
      const q = qtys.find(x => x !== money[0]);
      cantidad = q ? q.v : 1; costo = money[0].v; revisar = true; used = [money[0], q].filter(Boolean);
    }
    if (!best && [5, 19].includes(cantidad)) revisar = true;
    // Números sobrantes pegados al nombre suelen ser la presentación mal leída: "1106" → "110g", "1.51" → "1.5l"
    const firstUsed = Math.min(...used.map(x => x.i).filter(i => i > b));
    const extra = toks.filter((t, i) => i > b && i < firstUsed && /^\d+(?:[.,]\d+)?$/.test(t) && !used.some(x => x.i === i));
    if (extra.length === 1){
      const t = extra[0];
      desc += " " + (/^\d{2,4}6$/.test(t) ? t.slice(0, -1) + "g" : /^\d+[.,]\d1$/.test(t) ? t.slice(0, -1) + "l" : t);
    }
    return {desc, cantidad, costo, iva: ivaPct, revisar};
  }

  function parseHeader(lines){
    const text = lines.join("\n");
    let numero = null, fecha = null, proveedor = null;
    const mN = text.match(/(?:factura|fact\.?|fe\b|remisi[oó]n|pedido)[^\n\d]{0,30}?(?:n[°ºo.]*|#|:)?\s*([A-Z]{1,5}[-\s]?\d{2,}|\d{3,})/i);
    if (mN) numero = mN[1].replace(/\s+/g, "");
    const mF = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/) || text.match(/\b(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/);
    if (mF){
      let y, m, d;
      if (mF[1].length === 4){ y = mF[1]; m = mF[2]; d = mF[3]; } else { d = mF[1]; m = mF[2]; y = mF[3]; }
      if (y.length === 2) y = "20" + y;
      if (+m > 12 && +d <= 12) [d, m] = [m, d];
      if (+m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) fecha = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    }
    const top = lines.slice(0, 8).map(l => l.trim()).filter(Boolean);
    const company = top.find(l => /\b(s\.?\s?a\.?\s?s|ltda|s\.?\s?a\b|distribuidora|distribuciones|comercializadora|mayorista|dist\.)/i.test(l));
    proveedor = company || top.find(l => (l.match(/\p{L}/gu) || []).length >= 6 && !SKIP.test(norm(l)) && !/factura/i.test(l)) || null;
    if (proveedor) proveedor = proveedor.replace(/\s{2,}/g, " ").replace(/^[^\p{L}]+/u, "").slice(0, 60);
    return {proveedor, numero, fecha};
  }

  function parseInvoice(lines, categorias){
    const items = [];
    for (const l of lines){
      const r = parseLine(l);
      if (!r) continue;
      const marca = findBrand(r.desc);
      items.push({
        producto: sentenceCase(r.desc), marca, cantidad: r.cantidad, costo_unitario: r.costo,
        iva_pct: r.iva, categoria: pickCategory(r.desc, marca, categorias), revisar: r.revisar
      });
    }
    return {...parseHeader(lines), items};
  }

  const api = {parseInvoice, parseLine, parseNum, parseHeader, findBrand, pickCategory};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.InvoiceParser = api;
})(typeof self !== "undefined" ? self : this);
