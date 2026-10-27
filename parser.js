/* PrecioListo — lector de facturas por algoritmo (sin IA).
   Recibe las líneas de texto que sacó el OCR y devuelve proveedor, número, fecha y productos.
   Pensado para facturas colombianas: miles con punto ("12.500"), decimales con coma ("12.500,00"). */
(function (root) {
  "use strict";

  // Líneas que no son productos (encabezados, pies de página, totales, bancos…)
  const SKIP = /\b(sub\s*-?\s*total|total(es)?|iva\s*\d+|base\s+gravable|nit|r\.?u\.?t|tel[eé]fono|tel\b|telf|cel\b|celular|direcci[oó]n|dir\b|cufe|resoluci[oó]n|autoriza\w*|numeraci[oó]n|cliente|vendedor|contacto|p[aá]gina|retenci[oó]n|rete\s*(fuente|ica|iva)|reteica|forma\s+de\s+pago|medio\s+de\s+pago|vence|vencimiento|cambio|efectivo|cr[eé]dito|contado|firma|recib\w*|observaci\w*|son:|pesos\s+m\/?cte|saldo|abono|flete\w*|domicilio|consecutivo|prefijo|regimen|r[eé]gimen|responsable\w*|contribuyente\w*|actividad\s+econ|www\.|@|correo|email|banco\w*|bancolombia|davivienda|nequi|cta|cuenta|ahorros|corriente|convenio\w*|cartera|software|generad[ao]|validaci[oó]n|rango|vigencia|moneda|tasa\s+de|bodega|pedido|plazo|descuentos?\s+comercial|impuesto\s+al|neto\s+a\s+pagar|a\s+pagar|valor\s+letras|valor\s+bruto|total\s+bruto|items|empaco|revis[oó]|alist[oó]|bultos|peso|ciudad|barrio|fecha|factura|remisi[oó]n|cotizaci[oó]n|elabor\w*|despach\w*|reclam\w*|devoluci\w*|mercanc[ií]a|conductor|placa|veh[ií]culo|transport\w*|entrega|cancel\w*|calidad|redamaci\w*|respetado|nota:|netoapagar|intereses|mora|legal)\b/i;
  // Lo mismo, aunque el OCR se coma la primera letra ("Gubtotal", "mpuestos", "bservación")
  const SKIP_LOOSE = /(ubtotal|mpuesto|bservaci|esoluci[oó]n|etenci[oó]n|utorizaci|otal\s*a\s*pagar|eto\s*a\s*pagar|alor\s*total|iva\s*\d{1,2}\s*%\s*\$)/i;
  const HEADER_ROW = /\b(descripci[oó]n|producto|art[ií]culo|referencia|detalle|[ií]tem)\b.*\b(cant|valor|precio|vr|total|unidad|u\.?m)\b/i;
  const UNIT_AFTER = /^(g|gr|grs|gramos?|kg|kgs|kilos?|ml|cc|l|lt|lts|litros?|oz|und|unds|un|uni|unidades?|cm|mm|mt|mtr|mtrs|mts|m|x|pack|paq|sobres?|tabletas?|rollos?|gl|gal|w|v|lbs?)\.?$/i;
  // Columna "unidad de medida" (UND, Unidad, SCO, PAQ…) y basura de columna: marcan el fin del nombre
  const UM_STOP = /^(und|unds|unid|unidad|unidades|sco|paq|pza|pzas|jgo|cop|cedi|uni)\.?$/i;
  const CODE_TOK = /^(?:[A-Z]{1,3}-?\d{3,}[A-Z]?|\d{3,}[A-Z]|\d+(?:-\d+){1,3}|[A-Z]?\d{4,})$/i;
  const BRANDS = [
    "Pavco","Gerfor","Durman","Colmena","Argos","Cemex","Holcim","Ultracem","Sika","Pegacor","Corona","Eternit","Grival","Fanaloza",
    "Pintuco","Sapolin","Bler","Tito Pabón","Abracol","3M","Truper","Pretul","Stanley","Bellota","Black & Decker","DeWalt","Bosch","Makita",
    "Irwin","Uyustools","Fischer","Leviton","Schneider","Legrand","Centelsa","Procables","Phelps Dodge","Sylvania","Philips","Yale","Segurex",
    // Vistas en las facturas de los proveedores de la ferretería (oct-2026)
    "Tubosa","Plasdel","Arket","Mercury","Gavilán","Eterna","Puma","Motto","Carpincol","Reptools","Nicholson","Swan","Vitta","Alumband",
    "Würth","W-Max","Supermastick","Concolor","Fluidmaster","Fluid Master","West Arco","Barracuda","G-Plast","Durafort","Caballo","Acronal"
  ];
  const BRAND_RE = BRANDS
    .map(b => ({b, re: new RegExp("(^|[^\\p{L}])" + norm(b).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*") + "(?=$|[^\\p{L}])", "iu")}))
    .sort((a, b) => b.b.length - a.b.length);

  const CONCEPTS = [
    // El orden importa: gana el primer concepto que encaje ("tubo conduit" es eléctrico, "tornillo drywall" es tornillería, "llave inglesa" es herramienta).
    {k:"electricos",  match:/el[eé]ctric|electr|ilumin/i, words:/\b(cable|cables|thhn|thw|awg|duplex|encauchetado|alambre\s+(?:de\s+)?cobre|toma|tomas|tomacorriente|interruptor|suiche|switch|breaker|taco|tacos|bombillo|bombillos|bombilla|led|lampara|reflector|roseta|plafon|clavija|enchufe|extension|multitoma|conduit|emt|caja\s+(?:octagonal|rectangular)|cinta\s+aislante|aislante|contactor|timbre|fotocelda|leviton|schneider|legrand|centelsa|procables|phelps|sylvania|philips)\b/},
    {k:"pinturas",    match:/pintur/i, words:/\b(pintura|pinturas|vinilo|viniltex|pintulux|koraza|esmalte|anticorrosivo|laca|thinner|tiner|varsol|barniz|sellador|estuco|brocha|brochas|rodillo|rodillos|lija|lijas|aerosol|pintuco|sapolin|bler|abracol)\b/},
    {k:"tornilleria", match:/tornill|fijaci|ferreter/i, words:/\b(tornillo|tornillos|chazo|chazos|puntilla|puntillas|clavo|clavos|tuerca|tuercas|arandela|arandelas|perno|pernos|esparrago|esparragos|remache|remaches|ancla|anclas|anclaje|grapa|grapas|bisagra|bisagras|fischer)\b/},
    {k:"herramientas",match:/herramient/i, words:/\b(martillo|alicate|alicates|destornillador|atornillador|llave\s+(?:inglesa|expansiva|mixta|de\s+tubo|boca|allen)|flexometro|cinta\s+metrica|nivel|serrucho|segueta|taladro|pulidora|esmeril|broca|brocas|pala|palin|carretilla|machete|pica|pinza|pinzas|cincel|espatula|llana|palustre|disco|discos|tijera|cortafrio|escalera|truper|pretul|stanley|bellota|dewalt|bosch|makita|irwin|uyustools)\b|black\s*&?\s*decker/},
    {k:"plomeria",    match:/plomer|grifer|sanitar|hidr[aá]ul/i, words:/\b(llave|llaves|grifo|griferia|mezclador|sifon|lavamanos|lavaplatos|lavadero|ducha|regadera|flotador|valvula|registro|teflon|acople|manguera|cheque|desague|rejilla|grival|fanaloza)\b/},
    {k:"tuberia",     match:/tuber|pvc/i, words:/\b(tubo|tubos|tuberia|pvc|cpvc|codo|codos|tee|yee|niple|niples|union|universal|adaptador|adaptadores|buje|bujes|reduccion|tapon|tapones|soldadura\s+(?:pvc|liquida)|pavco|gerfor|durman|colmena)\b/},
    {k:"obra",        match:/cement|obra|construc/i, words:/\b(cemento|concreto|mortero|arena|gravilla|triturado|ladrillo|ladrillos|bloque|bloques|varilla|varillas|hierro|malla|alambre|teja|tejas|zinc|eternit|drywall|superboard|pegante|pegacor|boquilla|impermeabilizante|yeso|cal|argos|cemex|holcim|ultracem|sika)\b/},
  ];

  function norm(s){ return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

  // "12.500" -> 12500 · "12.500,50" -> 12500.5 · "2,5" -> 2.5 · "27,500.000" -> 27500 · "25,0000" -> 25
  function parseNum(tok){
    let t = String(tok).replace(/^\$/, "").replace(/[^\d.,-]/g, "");
    if (!t || !/\d/.test(t)) return null;
    const dots = (t.match(/\./g) || []).length, commas = (t.match(/,/g) || []).length;
    const last = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
    if (last >= 0){
      const lastCh = t[last], decs = t.length - last - 1;
      const mixed = dots && commas;
      const repeated = lastCh === "." ? dots > 1 : commas > 1;
      // Con los dos signos, el último es el decimal. Si el último se repite o deja 3 cifras, es de miles.
      if (mixed && !repeated) t = t.slice(0, last).replace(/[.,]/g, "") + "." + t.slice(last + 1);
      else if (decs === 3 || repeated) t = t.replace(/[.,]/g, "");
      else t = t.slice(0, last).replace(/[.,]/g, "") + "." + t.slice(last + 1);
    }
    const n = parseFloat(t);
    return isFinite(n) ? n : null;
  }
  // Corrige confusiones típicas del OCR dentro de números: O→0, l/I→1, S→5
  function fixDigits(tok){
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

  const letters = t => (t.match(/\p{L}/gu) || []).length;
  const THOUS = /\d[.,]\d{3}(?:[.,]\d{3})*(?:[.,]\d{1,3})?$/;          // tiene separador de miles: 12.500, 1,100.000
  const isMoneyTok = t => /^\$/.test(t) || THOUS.test(t.replace(/^[sS5$]/, "$"));
  const DESCISH = /["'*\/½¼¾⅜⅝⅛]|^\d+(?:[.,]\d+)?(?:g|gr|kg|ml|cc|l|lt|cm|mm|mt|mtr|mts|m|gl|w|v|k)$|^\(\d+\)$/i;   // "(420)" es parte del nombre

  // Valores posibles de un número tal como lo leyó el OCR (el "$" a veces sale como 5, S u 8; a veces se pierde un cero).
  function readNumber(raw){
    let t = raw.replace(/^[(\[{<«"'“”=~*]+|[)\]}>»"'“”.,;:—–_=~*-]+$/g, "");
    let dollar = false;
    if (/^\$/.test(t)) { dollar = true; t = t.slice(1); }
    if (!/^\d[\d.,]*$/.test(t)) {
      if (/^[sS]\d/.test(t) && /^[sS][\d.,]+$/.test(t)) { dollar = true; t = t.slice(1); }
      else return null;
    }
    const v = parseNum(t);
    if (v == null) return null;
    let vals = [{v, alt:0}];
    // "$5.40" o "$5.00" → casi siempre es $5.400 / $5.000 con el último cero perdido (en pesos no se usan centavos)
    if (dollar && /^\d{1,3}\.\d{1,2}$/.test(t)) vals = [{v: parseNum(t.padEnd(t.indexOf(".") + 4, "0")), alt:0}, {v, alt:1}];
    // "5396.400" o "81,292" → el primer 5/8 era el "$"
    if (!dollar && /^[58]\d{1,3}[.,]\d{3}/.test(t)) { const w = parseNum(t.slice(1)); if (w) vals.push({v:w, alt:1}); }
    // "1,100,000" en factura con decimales ",000" → 1.100
    if (/[.,]\d{3}[.,]000$/.test(t) && v >= 1000) vals.push({v: v/1000, alt:1});
    const pct2 = !dollar && /^\d{1,2}[.,]\d{2}$/.test(t) && v <= 60;     // "3,00", "19,00": porcentaje de columna
    return {vals, dollar, sep: THOUS.test(t), pct2, plainInt: /^\d+$/.test(t), raw: t};
  }

  function parseLine(raw){
    // Normalizamos sin cambiar el largo de la línea, para conservar en qué columna cae cada número
    const pad = m => " ".repeat(m.length);
    let line = String(raw).replace(/\t/g, " ").replace(/[|¦\[\]{}!¡]/g, " ")
      .replace(/\bC[O0][PRr]\s*[\$sS5]?\s*(?=\d)/gi, m => pad(m).slice(1) + "$")
      .replace(/\$\s+(?=\d)/g, m => pad(m).slice(1) + "$")
      .replace(/(\d)(\s+)%/g, (m, d, sp) => d + "%" + sp)
      .replace(/(\$\d{1,3}[.,])(\s+)(\d{3})(?!\d)/g, (m, a1, sp, c) => a1 + c + sp);            // "$6, 460" → "$6,460"
    if (line.trim().length < 6 || SKIP.test(norm(line)) || SKIP_LOOSE.test(norm(line)) || HEADER_ROW.test(line)) return null;
    const toks = [], pos = [];
    for (const m of line.matchAll(/\S+/g)) { toks.push(fixDigits(m[0])); pos.push(m.index); }

    // Inicio del nombre: primera palabra de verdad (no códigos como D318, PO00031, 0985-191-01)
    let a = toks.findIndex((t, i) => (letters(t) >= 3 || /^(ye|te)$/i.test(t) || /^\p{Lu}{2}$/u.test(t) && letters(toks[i+1] || "") >= 4) && !CODE_TOK.test(t) && !UM_STOP.test(t));
    if (a < 0) return null;
    // Fin del nombre: antes de la columna de unidad (UND, Unidad, COP) o del primer precio
    let stop = toks.length;
    for (let i = a + 1; i < toks.length; i++) if (UM_STOP.test(toks[i]) || isMoneyTok(toks[i])) { stop = i; break; }
    let b = a;
    for (let i = a + 1; i < stop; i++){
      const t = toks[i];
      if (letters(t) >= 2 && !CODE_TOK.test(t)) b = i;
      else if (DESCISH.test(t) || letters(t) === 1 && /\d/.test(t)) b = i;
      else if (/^\d+(?:[.,]\d+)?$/.test(t) && /^(?:x|.*[\d%]x)$/i.test(toks[i-1] || "")) b = i;          // "X 2", "%X 2", "6X 2"
      else if (/^\d+(?:[.,]\d+)?$/.test(t) && /^(x|\d+[.,]?\d*x?)$/i.test(toks[i+1] || "") && /x/i.test(toks[i+1] + (toks[i+2] || ""))) b = i;  // "6 X 25"
      else if (/^\d+$/.test(t) && letters(toks[i+1] || "") >= 1 && i + 1 < stop && !CODE_TOK.test(toks[i+1]) && !UM_STOP.test(toks[i+1])) b = i;   // número en medio del nombre ("NTC 2289 G 60")
    }
    let desc = toks.slice(a, b + 1).join(" ")
      .replace(/^[-–—:*.,;>_\s]+|[-–—:*.,;>_\s]+$/g, "").replace(/\s[-–—_>]+(?=\s|$)/g, "").replace(/^\d(?=\p{L}{3})/u, "");
    if (letters(desc) < 4) return null;
    const hasUM = toks.slice(b + 1).some(t => UM_STOP.test(t) && !/^cop$/i.test(t));

    // Números fuera del nombre
    const nums = []; let iva = null;
    toks.forEach((t, i) => {
      if (i >= a && i <= b) return;
      if (/^\d{1,2}(?:[.,]\d+)?%$/.test(t)) { const v = Math.round(parseNum(t)); if ([0,5,19].includes(v)) iva = v; nums.push({i, pct:true, vals:[{v, alt:0}]}); return; }
      const n = readNumber(t);
      if (!n) return;
      if (i < a && (n.plainInt && n.vals[0].v >= 1000 || CODE_TOK.test(t))) return;       // código o referencia antes del nombre
      if (n.plainInt && n.raw.length >= 7) return;                                     // código de barras / referencia
      n.i = i; n.pos = pos[i]; n.afterUM = i > 0 && UM_STOP.test(toks[i-1]) && !/^cop$/i.test(toks[i-1]);
      nums.push(n);
    });
    // "19,00" como columna IVA
    if (iva == null){ const p = nums.find(n => n.pct2 && n.vals[0].v === 19) || nums.find(n => n.pct2 && n.vals[0].v === 5 && n === nums[nums.length - 2]); if (p) iva = p.vals[0].v; }

    // Un número justo después de "UND" es la cantidad, no un precio
    const money = nums.filter(n => !n.pct && !n.afterUM && n.i > b && n.vals.some(x => x.v >= 10) && (n.dollar || n.sep || n.vals[0].v >= 100));
    // Para la ecuación también sirven precios pequeños sin "$" (tornillos a $90 en una cotización)
    const moneyEq = nums.filter(n => !n.pct && !n.pct2 && !n.afterUM && n.i > b && n.vals.some(x => x.v >= 10));
    const umIdx = toks.findIndex((t, i) => i > b && UM_STOP.test(t) && !/^cop$/i.test(t));
    const qtys  = nums.filter(n => !n.pct && !n.dollar && !n.sep && n.vals[0].v > 0 && n.vals[0].v <= 9999 && (Number.isInteger(n.vals[0].v) || /^\d+[.,]\d{1,2}$/.test(n.raw))
      && !(umIdx > 0 && n.i > b && n.i < umIdx));
    // "…P1200-230 X 10 $1,988": si no quedó ninguna cantidad, el número tras la X era la cantidad
    if (!qtys.length && /\s[xX]\s+\d{1,4}$/.test(desc) && /^\d{1,4}$/.test(toks[b])){
      qtys.push({i: b, pos: pos[b], vals:[{v: +toks[b], alt:0}], raw: toks[b], plainInt: true});
      desc = desc.replace(/\s[xX]\s+\d{1,4}$/, "");
    }
    const saidQty = u => qtys.find(x => x.afterUM) || qtys.find(x => x.i > b && (!u || x.i < u.i)) || qtys.find(x => x.i < a);
    const pctToks = nums.filter(n => (n.pct2 || n.pct) && (n.vals[0].v > 0 && n.vals[0].v <= 60 && n.vals[0].v !== 19 && n.vals[0].v !== 5 || n.vals[0].v === 5 && iva !== 5));
    const pcts = pctToks.map(n => n.vals[0].v);
    const lastMoney = money.length ? money[money.length - 1] : null;

    // Ecuación: cantidad × unitario × (1 − descuentos) × (1 + IVA) ≈ total
    const near = (x, y) => Math.abs(x - y) <= Math.max(2, y * 0.012);
    const dset = [0, ...new Set(pcts)];
    let best = null;
    for (const q of qtys) for (const u of moneyEq) for (const t of moneyEq){
      if (u === t || q === u || q === t || t.i < u.i) continue;           // el total va a la derecha del unitario
      // Los descuentos van entre el unitario y el total (así "2,00" de la cantidad no se toma como 2 %)
      const dset = [0, ...new Set(pctToks.filter(p => p.i > u.i && p.i < t.i && p !== q).map(p => p.vals[0].v))];
      for (const uv of u.vals) for (const tv of t.vals){
        if (uv.v < 10 || tv.v < uv.v * 0.4 || (tv.v === uv.v && q.vals[0].v !== 1)) continue;     // con descuentos el total puede ser menor que el unitario
        for (const d1 of dset) for (const d2 of (d1 ? dset : [0])) for (const r of (iva != null ? [...new Set([0, iva])] : [0, 19])){
          const net = uv.v * (1 - d1/100) * (1 - d2/100);
          if (!near(q.vals[0].v * net * (1 + r/100), tv.v)) continue;
          const score = (t.i > u.i ? 3 : 0) + (t === lastMoney ? 2 : 0) + (q.i < u.i ? 1 : 0) - (q.i > t.i ? 3 : 0) + (u.dollar ? 0.5 : 0) + (u.i > b ? 2 : 0) + (t.dollar || t.sep ? 1 : 0)
            - 2 * (uv.alt + tv.alt) - (d1 ? 0.5 : 0) - (d2 ? 0.5 : 0) - (r && r !== iva ? 1 : 0);
          if (!best || score > best.score) best = {q: q.vals[0].v, net, r, score, used:[q, u, t], uPos: u.pos, tPos: t.pos};
        }
      }
    }
    let cantidad, costo, revisar = false, ivaPct = iva || 0, sinPrecio = false, single = null;
    if (best){ cantidad = best.q; costo = best.net; ivaPct = best.r || iva || 0; }
    else if (money.length >= 2){
      const u = money.find(m => m.i > b && m.dollar && m !== lastMoney) || money.find(m => m.i > b && m !== lastMoney) || money[0], t = lastMoney;
      // Falta la cantidad o se leyó mal: la deducimos de total ÷ unitario
      let found = null;
      outer: for (const uv of u.vals) for (const tv of t.vals) for (const d1 of dset) for (const r of iva != null ? [iva, 0] : [0, 19]){
        const net = uv.v * (1 - d1/100), ratio = tv.v / (net * (1 + r/100)), q = Math.round(ratio);
        if (u === t || net < 10 || q < 1 || q > 999 || Math.abs(ratio - q) / q >= 0.006) continue;
        // Si sí se leyó una cantidad, la deducida no puede ser de otro tamaño (evita 290 cuando dice 4)
        // …salvo que unitario y total se vean limpios (con separador de miles): entonces la cantidad leída es la que está mal
        const said = saidQty(u), clean = (u.sep || u.dollar) && (t.sep || t.dollar) && !uv.alt && !tv.alt;
        if (said && (!clean || said.afterUM) && (q / said.vals[0].v > 3 || said.vals[0].v / q > 3)) continue;
        found = {q, net, r}; break outer;
      }
      if (found){ cantidad = found.q; costo = found.net; ivaPct = found.r || iva || 0; revisar = !qtys.some(x => x.vals[0].v === found.q); }
      else {
        const q0 = saidQty(u) || qtys.find(x => x !== u && x !== t);
        const q = q0 && (q0.vals[0].v <= 999 || q0.afterUM) ? q0 : null;      // 9259 no es una cantidad creíble
        cantidad = q ? q.vals[0].v : 1; costo = u.vals[0].v; revisar = true;
        if (q && t !== u && t.i > u.i && (t.sep || t.dollar)){
          for (const r of iva != null ? [iva] : [0, 19]){
            const guess = t.vals[0].v / (cantidad * (1 + r/100));
            if (guess >= 10 && Math.abs(guess - costo) / guess < 0.3){ costo = guess; ivaPct = r || ivaPct; break; }
          }
        }
      }
    } else if (money.length === 1){
      const m = money[0], q = saidQty(m) || qtys.find(x => x !== m);
      cantidad = q ? q.vals[0].v : 1; costo = m.vals[0].v; revisar = true;
      single = {pos: m.pos, v: m.vals[0].v, hasQ: !!q};
    } else {
      // Remisión sin precios (CCD, Sidoc): solo nombre y cantidad
      if (!hasUM) return null;
      const q = qtys.find(x => x.i > b) || qtys.find(x => x.i < a);
      if (!q) return null;
      cantidad = q.vals[0].v; costo = 0; revisar = true; sinPrecio = true;
    }
    if (!best && [5, 19].includes(cantidad)) revisar = true;
    // Texto basura del OCR (hoja girada, sellos, firmas): pocas palabras reales o casi sin vocales
    if (!best){
      const words = desc.split(/\s+/), L = letters(desc);
      const inWords = words.filter(w => letters(w) >= 3).reduce((acc, w) => acc + letters(w), 0);
      const vowels = (norm(desc).match(/[aeiou]/g) || []).length;
      if (inWords / L < 0.6 || words.filter(w => letters(w) >= 3).length < 2 || vowels / L < 0.22) return null;
    }
    // Sin ecuación ni columna de unidad ni signo $, lo más probable es que no sea un producto
    if (!best && !hasUM && !money.some(m => m.dollar) && letters(desc) < 8) return null;
    return {desc, cantidad: Math.round(cantidad * 100) / 100, costo: Math.round(costo * 100) / 100, iva: ivaPct, revisar, sinPrecio,
      cols: best ? {u: best.uPos, t: best.tPos} : null, single};
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

  // Si la factura trae el IVA solo al final (Würth, Ferroplast…), lo deducimos: IVA ÷ suma de productos ≈ 19 %
  function pageIva(lines, items){
    const base = items.reduce((acc, x) => acc + x.cantidad * x.costo_unitario, 0);
    if (!base) return 0;
    const amounts = [];
    for (const l of lines) for (const m of l.match(/\$?\s?\d{1,3}(?:[.,]\s?\d{3})+(?:[.,]\d{1,2})?/g) || []){ const v = parseNum(m.replace(/\s/g, "")); if (v) amounts.push(v); }
    for (const l of lines){
      if (!/\biva\b|impuesto/i.test(l) || /base|tarifa|responsable|r[eé]gimen/i.test(l)) continue;
      for (const m of l.match(/\$?\s?\d{1,3}(?:[.,]\s?\d{3})+(?:[.,]\d{1,2})?/g) || []){
        const v = parseNum(m.replace(/\s/g, ""));
        if (!v) continue;
        const ratio = v / base;
        if (ratio > 0.16 && ratio < 0.215) return 19;
        // IVA ≈ 19 % de algún subtotal impreso en la factura (el subtotal puede incluir fletes)
        if (amounts.some(M => M > v * 3 && (Math.abs(v / M - 0.19) < 0.004 || amounts.some(N => N < M * 0.2 && Math.abs(v / (M + N) - 0.19) < 0.002)))) return 19;
      }
    }
    return 0;
  }

  function parseInvoice(lines, categorias){
    const items = [], parsed = [];
    for (const l of lines){ const r = parseLine(l); if (r) parsed.push(r); }
    // Columnas de la página: dónde suelen ir el valor unitario y el total en las líneas que sí cuadraron.
    // Si una línea solo tiene un número y cae en la columna del total, el unitario es total ÷ cantidad.
    const med = a => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const ok = parsed.filter(r => r.cols);
    const spread = a => { const m = med(a.slice()); return med(a.map(x => Math.abs(x - m))); };
    if (ok.length >= 3){
      const uCol = med(ok.map(r => r.cols.u)), tCol = med(ok.map(r => r.cols.t));
      // Solo si las columnas están bien alineadas en esta foto
      const sp = Math.max(spread(ok.map(r => r.cols.u)), spread(ok.map(r => r.cols.t)));
      if (Math.abs(tCol - uCol) >= Math.max(6, 4 * sp)) for (const r of parsed){
        const per = r.single ? r.single.v / r.cantidad : 0;
        if (r.single && r.single.hasQ && r.cantidad > 1 && Math.abs(per - Math.round(per)) < 0.01 && Math.abs(r.single.pos - tCol) < Math.abs(r.single.pos - uCol))
          r.costo = Math.round(per);
      }
    }
    for (const r of parsed){
      const marca = findBrand(r.desc);
      items.push({
        producto: sentenceCase(r.desc), marca, cantidad: r.cantidad, costo_unitario: r.costo,
        iva_pct: r.iva, categoria: pickCategory(r.desc, marca, categorias), revisar: r.revisar, sin_precio: r.sinPrecio
      });
    }
    if (items.length && items.filter(x => !x.iva_pct).length >= items.length * 0.7){
      const piva = pageIva(lines, items.filter(x => !x.revisar));
      if (piva) items.forEach(x => { if (!x.iva_pct) x.iva_pct = piva; });
    }
    return {...parseHeader(lines), items};
  }

  const api = {parseInvoice, parseLine, parseNum, readNumber, parseHeader, findBrand, pickCategory};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.InvoiceParser = api;
})(typeof self !== "undefined" ? self : this);
