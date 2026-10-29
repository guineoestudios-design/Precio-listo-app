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
  const UM_STOP = /^(und|unds|unid|unidad|unidades|sco|paq|pza|pzas|jgo|cop|cedi|uni|uno|undo|lud|uud)\.?$/i;   // "Uno", "LuD": UND mal leído
  const CODE_TOK = /^(?:[A-Z]{1,3}-?\d{3,}[A-Z]?|\d{3,}[A-Z]|\d+(?:-\d+){1,3}|[A-Z]?\d{4,})$/i;
  const BRANDS = [
    "Pavco","Gerfor","Durman","Colmena","Argos","Cemex","Holcim","Ultracem","Sika","Pegacor","Corona","Eternit","Grival","Fanaloza",
    "Pintuco","Sapolin","Bler","Tito Pabón","Abracol","3M","Truper","Pretul","Stanley","Bellota","Black & Decker","DeWalt","Bosch","Makita",
    "Irwin","Uyustools","Fischer","Leviton","Schneider","Legrand","Centelsa","Procables","Phelps Dodge","Sylvania","Philips","Yale","Segurex",
    // Vistas en las facturas de los proveedores de la ferretería (oct-2026)
    "Tubosa","Plasdel","Arket","Mercury","Gavilán","Eterna","Puma","Motto","Carpincol","Reptools","Nicholson","Swan","Vitta","Alumband",
    "Würth","W-Max","Supermastick","Concolor","Fluidmaster","Fluid Master","West Arco","Barracuda","G-Plast","Durafort","Caballo","Acronal",
    "Silplas","Rioplast","Omega","Tesa","Cintandina","Unifer","Ranger","Dicol","Griflex","Energy","Mejía","Topex","Diablo"
  ];
  const BRANDS_N = new Set(BRANDS.map(b => norm(b).replace(/[^a-z0-9ñ-]/g, "")));
  const BRAND_RE = BRANDS
    .map(b => ({b, re: new RegExp("(^|[^\\p{L}])" + norm(b).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*") + "(?=$|[^\\p{L}])", "iu")}))
    .sort((a, b) => b.b.length - a.b.length);

  // Categorías por palabras clave. Gana la PRIMERA palabra del nombre que diga qué es el producto (en español el
  // sustantivo va primero: "chapeta lavamanos con tornillo" es plomería, "tornillo drywall" es tornillería).
  // "first": frases que mandan aunque vayan después ("tubo conduit" es eléctrico, "llave inglesa" es herramienta).
  // "brands": solo deciden si el nombre no trae ninguna otra pista ("Abracol disco" es disco → herramienta).
  // Los conceptos sin categoría parecida en Ajustes (cerrajería, adhesivos, aseo, seguridad) solo sirven a quien
  // cree esa categoría; si no existe, se sigue con la siguiente pista.
  const W = s => new RegExp("\\b(?:" + s.trim().split(/\s+/).join("|").replace(/_/g, "\\s+") + ")\\b", "g");
  const CONCEPTS = [
    {k:"otros",       match:/^otro/i, first:W("tapon_(?:de_)?(?:baston|muleta|cuadrado|rectangular)")},
    {k:"obra",        match:/cement|obra|construc/i, first:W("sika impermeabiliz\\w*")},
    {k:"electricos",  match:/el[eé]ctric|electr|ilumin/i,
      first:W("conduit emt cinta_aislante aisl\\w*"),
      words:W(`cables? thhn thw awg duplex encauchetado alambre_(?:de_)?cobre tomas? tomacorriente interruptor suiche switch breaker
               tacos? bombillos? bombillas? led lamparas? reflector roseta plafon clavija enchufe extension multitoma
               caja_(?:octagonal|rectangular) contactor timbre fotocelda canaletas? amarras? luminaria balasto pilas? sensor`),
      brands:W("leviton schneider legrand centelsa procables phelps sylvania philips mercury")},
    {k:"cerrajeria",  match:/cerraj|chapa/i, words:W("chapas? candados? cerraduras? cerrojos? pasador(?:es)? manijas? bisagras?")},
    {k:"adhesivos",   match:/adhesiv|pegant|silicon|sellad/i, words:W("siliconas? pegantes? carpincol colbon espuma_(?:de_)?poliuretano")},
    {k:"aseo",        match:/aseo|limpiez/i, words:W("escobas? traperos? recogedor desmanchador potasa jabon detergente")},
    {k:"seguridad",   match:/segurid|protecc|dotaci/i, words:W("guantes? cascos? gafas tapabocas botas overol careta arnes")},
    {k:"pinturas",    match:/pintur/i,
      words:W(`pinturas? vinilos? vinilico esmaltes? anticorrosivo laca thinner tiner varsol barniz sellador estucos? masilla
               brochas? rodillos? lijas? aerosol spray removedor`),
      brands:W("viniltex pintulux koraza pintuco sapolin bler abracol")},
    {k:"tornilleria", match:/tornill|fijaci|ferreter/i,
      words:W(`tornillos? torn chazos? puntillas? clavos? tuercas? arandelas? pernos? esparragos? remaches? anclas? anclaje grapas?
               bisagras? carriage carreaje flange flanje varilla_roscada perros?`),
      brands:W("fischer")},
    {k:"herramientas",match:/herramient/i,
      first:W("llaves?_(?:inglesa|expansiva|mixta|de_tubo|boca|allen|pestana) manguera_(?:de_)?nivel cinta_metrica porta\\s*electrodo"),
      words:W(`martillo alicates? destornillador atornillador flexometro nivel serrucho seguetas? taladro pulidora esmeril brocas? pala
               palin carretilla machet\\w* pica pinzas? cincel espatula llana palustre discos? tijeras? cortafrio escalera limas?
               mandril sierra plomada polea dados? electrodos? soldador cepillo grata hachas? barra_de_una`),
      brands:W("truper pretul stanley bellota dewalt bosch makita irwin uyustools nicholson corneta incolma black\\s*&?\\s*decker")},
    {k:"plomeria",    match:/plomer|grifer|sanitar|hidr[aá]ul/i,
      words:W(`llaves? llav grifo griferia mezclador sifon lavamanos lavaplatos lavadero ducha regadera flotador valvulas? valv registro
               teflon acople mangueras? cheque desague rejillas? rej pozuelo orinal asiento taza tanque pedest\\w* canastilla chapeta
               herraje griflex`),
      brands:W("grival fanaloza corona rioplast")},
    {k:"tuberia",     match:/tuber|pvc/i,
      first:W("pegantes?_(?:para_)?pvc limpiador_(?:para_)?pvc"),
      words:W(`tubos? tuberia pvc cpvc codos? tee yee ye niples? union(?:es)? universal adaptador(?:es)? bujes? reduccion tapon(?:es)?
               soldadura_(?:pvc|liquida)`),
      brands:W("pavco gerfor durman colmena tubosa")},
    {k:"obra",        match:/cement|obra|construc/i,
      words:W(`cemento concreto mortero arena gravilla triturado ladrillos? bloques? varillas? hierro malla alambre tejas? zinc eternit
               drywall superboard pegacor boquilla yeso cal fragua ceramic[oa] acronal esquinero angulos? platina perfil corrugad\\w*
               puas polisombra construccion laminas? estructural pegantes? megapega pega_?cer\\w* concolor`),
      brands:W("argos cemex holcim ultracem eterna")},
  ];

  function norm(s){ return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

  // Vocabulario de ferretería (sin tildes). Sirve para corregir letras mal leídas, separar palabras pegadas
  // y saber qué es parte del nombre y qué es basura del OCR (firmas, números escritos a mano).
  const LEX = new Set((`
    tubo tubos tuberia codo codos tee yee ye union uniones universal buje bujes niple niples tapon tapones adaptador reduccion reducida
    reducido sanitario sanitaria sanit presion pres social soldar soldado sold soldadura limpiador pegante coex rde liviano pesado
    conduit canaleta caja cajas plafon roseta bombillo bombilla lampara panel led sensor cable duplex alambre cobre extension toma
    interruptor breaker taco clavija enchufe cinta aislante aisl teflon doble faz malla tela sombra rollo rll puas galli eterna
    tornillo tornillos torn tuerca tuercas arandela arandelas chazo chazos puntilla puntillas clavo clavos grapa grapas perno pernos
    remache remaches pop esparrago varilla varillas roscada roscado bisagra bisagras chapa chapas candado cerradura pasador pasadores
    hex hexagonal zinc zincada zincado zin bicromatizada bicromatizado galv galvanizado galvanizada cilindrico flange flanje carriage carreaje
    drywall driwall extraplano punta broca brocas neopreno expansion autoperforante estufa lamina
    llave llaves lavaplatos lavamanos lavadero lavadora meson flexible encauchetada jardin movil mesa cromada griferia grifo mezclador
    ducha regadera lluvia cuadrada sifon registro valvula valv entrada flotador fluid master acople manguera mangueras rejilla rej
    desague chapeta herraje combo pedestal asiento sanitario taza tanque laguna milan push
    alicate alicates destornillador martillo serrucho segueta seguetas sierra copa mandril disco discos corte metal madera vidrio
    multiuso multiusos fino doble prop dientes espatula palustre llana pala redonda palin pica machete carretilla platon balde
    plomada nivel flexometro metro cinta polea gancho fija sencilla perro cadena cadenas dado magnetico porta electrodo
    tijera tijeras corneta ojo pinza pinzas cincel lima limas cepillo acero escoba brocha brochas rodillo rodillos antigota
    pintura pinturas spray aerosol esmalte vinilo vinilico estuco estucos plastico plastica exterior interior galon cunete cuarto
    blanco blanca negro negra rojo roja verde azul gris beige cafe amarillo amarilla transparente transp brillante mate color
    lija lijas agua carburo silicio hoja hojas silicona acetica espuma poliuretano lubricante desmanchador acronal sellador
    cemento bulto cal yeso fragua ceramico relleno listo concreto arena ladrillo bloque teja tejas perfil tubular estructural estruc
    platina angulo angulos corrugada corrugado bar barra hierro esquinero perforado potasa caustica escamas
    pequeno pequena grande grandes mediano mediana mini largo larga corto corta ancho grueso delgado plana plano liso lisa
    economica economico industrial ind profesional prof deluxe especial superior tipo usos uso curvo podadora berbiqui
    rosca roscas metalica metalico acrilico hueco tapa tapas baston muleta deslizador cuadrado rectangular rectangulares
    nylon barracuda lbs filtro canastilla boton botones juego set kit pack paquete paq caja unidad unidades precio
    eco gas luz sol oro pro max uso usos ojo una bolsa bolsas cuadrada redondo redonda doble triple sencillo
    bola bolas pastel plus nevera perf tras blister bliste milano reg ros latom kilos kilo tonelada sencilla fija pesada
    entrerosca macho hembra cromado niquelado bronce aluminio inoxidable acero galvanizada rosca plast plas
    escoba trapero guante guantes candado bomba motor aceite grasa tapete cortina espejo marco puerta ventana manija cerrojo
    toallero jabonera carbon soga lazo estopa thinner varsol gasolina alcohol masilla vela pilas pila linterna timbre tapabocas
    casco gafas botas overol escalera carpa polipropileno angeo guadana azadon rastrillo hacha cuchillo extractor ventilador
    estante mopa tinte laca sello fibra esponja cloro canal bajante canoa caballete amarre pistola grata cuna plomo estano
    caucho empaque oring abrazadera racor tapagoteras impermeabilizante brea asfalto manto geotextil manila pita piola guaya
    tensor argolla eslabon mosqueton rodachina rueda garrucha cajon perchero ganchos colgador bandeja rociador aspersor
    papel hilo paral tabla listón liston triplex madera puntal formaleta alambron cemento gris marmolina granito
    de del con sin para por en la el las los y o al x
  `).trim().split(/\s+/));
  const SHORT_OK = new Set("de del con sin para por en la el y al x no pvc led rde cxc hss emt ntc cc gr kg ml mm cm mt mts lt gl lb w v e27 e14 n° # s/r m/m c/m p/ c/ t/ m/ zin hex ind psi bl rd mh m.h ojo usa ros tr amp hp kls lbs oz".split(" "));
  const isLex = w => { const n = norm(w).replace(/^[^a-z0-9ñ]+|[^a-z0-9ñ]+$/g, "");
    return /^[a-zñ.]+$/.test(n) && LEX.has(n.replace(/\./g, "")) || BRANDS_N.has(n.replace(/[^a-z0-9ñ-]/g, "")); };

  function lev(a, b){
    if (Math.abs(a.length - b.length) > 2) return 9;
    let p = [...Array(b.length + 1).keys()];
    for (let i = 1; i <= a.length; i++){ const c = [i]; for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j-1] + 1, p[j-1] + (a[i-1] === b[j-1] ? 0 : 1)); p = c; }
    return p[b.length];
  }
  let LEX_CACHE = null;
  const LEX_ARR = () => LEX_CACHE || (LEX_CACHE = [...LEX].filter(w => w.length >= 4).concat([...BRANDS_N].filter(b => /^[a-zñ]{5,}$/.test(b))));
  // "L1JA" → "LIJA", "ZCUIERDA" → "IZQUIERDA", "TORNILLOCILINDRICO" → "TORNILLO CILINDRICO", "FLANGE8X20" → "FLANGE 8X20"
  function fixWord(tok){
    const raw = tok, low = norm(tok);
    if (!/[a-z]/.test(low) || isLex(low)) return raw;
    if (/^[a-zñ]{4,}s$/.test(low) && (isLex(low.slice(0, -1)) || /es$/.test(low) && isLex(low.slice(0, -2)))) return raw;   // plural de una palabra conocida
    // palabra + medida pegadas
    let m = low.match(/^([a-zñ]{3,})(\d.*)$/);
    if (m && isLex(m[1])) return raw.slice(0, m[1].length) + " " + raw.slice(m[1].length);
    // marca/palabra + "c*10"
    m = low.match(/^([a-zñ]{4,})(c[*'°]\d+)$/);
    if (m && isLex(m[1])) return raw.slice(0, m[1].length) + " " + raw.slice(m[1].length);
    // dos palabras pegadas, también con una letra de basura delante ("FPOLEAFIJA") o una medida detrás ("FLANJESX30")
    if (/^[a-zñ]{7,}(?:x\d+)?$/.test(low)){
      const [w, tail] = [low.replace(/x\d+$/, ""), (low.match(/x\d+$/) || [""])[0]];
      for (const off of [0, 1]) for (let k = off + 3; k <= w.length - 3; k++){
        const w1 = w.slice(off, k), w2 = w.slice(k), f2 = isLex(w2) ? w2 : fixWord(w2);
        if (isLex(w1) && isLex(f2)) return w1 + " " + f2 + (tail ? " " + tail : "");
      }
    }
    if (/^[a-zñ]{5,}$/.test(low) && !isLex(low) && isLex(low.slice(1))) return low.slice(1);
    // dígitos que en realidad son letras dentro de una palabra
    if (/[a-z]/.test(low) && /\d/.test(low) && letters(low) >= 3){
      const t = low.replace(/1/g, "i").replace(/0/g, "o").replace(/5/g, "s").replace(/9/g, "j").replace(/8/g, "b").replace(/,/g, "");
      if (isLex(t)) return t;
    }
    const clean = low.replace(/[^a-zñ]/g, "");
    // Corrección por parecido. Las palabras cortas que parecen español ("papel", "hilo", "paral") NO se tocan aunque se
    // parezcan a una del vocabulario ("panel", "kilo", "para"): solo las que se ven mal leídas ("ljja", "llav", "sant").
    const oddShort = /([bdfghjkmnpqstvwxz])\1|[^aeiouy]{3}|[^aeioulnrsdzjy]$/.test(clean);
    if (clean.length >= 4 && clean.length === low.length && (clean.length >= 6 || oddShort)){
      const maxD = clean.length >= 9 ? 2 : 1; let best = null, bd = 9, ties = 0;
      for (const w of LEX_ARR()){ const d = lev(clean, w); if (d < bd){ bd = d; best = w; ties = 0; } else if (d === bd) ties++; }
      if (best && bd <= maxD && !ties) return best;
    }
    return raw;
  }
  const isCodeTok = t => /^\d{5,}$/.test(t) || /^(?=.*\d{4,})(?=.*[a-z]{2,})[a-z0-9-]{6,}$/i.test(t) && !/^\d+(?:mm|cm|ml|mts?|gr|kg)$/i.test(t) || /^0\d{3,}$/.test(t);
  const isSizeTok = t => /^\d+(?:[.,/]\d+)?[a-z"]*(?:x\d+(?:[.,/]\d+)?[a-z"]*)+$/i.test(t) || /^[a-zñ]{3,}[*x]\d+[a-z]{0,2}$/i.test(t) || /^\(?(?:\d+(?:[.,/]\d+)*\s*(?:["'”]|mm|cm|m|mt|mts|mtr|ml|cc|gr|grs|grm|g|kg|kls?|k|lt|l|gl|w|v|lbs?|in|amp|oz|onz|pulg|hp)?|\d*x\d+[\w./"']*|[a-z]?\d+x\d+[\w./"']*|x\d+[\w./"']*|c[*'°]\d+|#\s?\d+|p\d{3,4}[-\w]*|e\d{2}|\d+w\w*)\)?$/i.test(t);

  // ¿Es basura del OCR (firma, número escrito a mano, "UND")?
  function isJunkTok(t){
    const c = String(t).replace(/^[(\["'.,;:—–_*>¿¡-]+|[)\]"'.,;:—–_*>?¿-]+$/g, "");
    if (!c) return true;
    if (isLex(c) || SHORT_OK.has(norm(c))) return false;
    if (isSizeTok(c)) return false;
    if (/^(und|unid|unidad|un|uno|cop)$/i.test(c)) return true;
    if (/\p{L}\/|\/\p{L}/u.test(c)) return false;                          // "s/r", "c/madera", "lvm/lvp"
    const L = letters(c), D = /\d/.test(c);
    if (!L && !D) return true;                                       // "/", "_—-"
    if (L && D) return L <= 2;                                       // "2z00", "6co", "g9", "1ss2-500" (pero no "3CAN", "P2500")
    if (L && L <= 3) return true;                                    // "hp", "do", "sa", "nn"
    if (L >= 4 && !/[aeiouáéíóúy]/i.test(c)) return true;           // sin vocales
    return false;
  }

  // Quita del nombre lo que no es nombre: códigos, basura del OCR al inicio y al final, la cantidad repetida
  function cleanName(desc, cantidad){
    let toks = desc.replace(/[“”«»]/g, '"').replace(/(\p{L}),+(?=\p{L})/gu, "$1 ").replace(/(\p{L})\.(?=\p{L}{3})/gu, "$1. ").replace(/\s+/g, " ").trim()
      .split(" ").map(t => t.replace(/(\d)[oO](?=\d)/g, (_, d) => d + "0").replace(/^[*"'`]+(?=\p{L}{2})/u, ""))   // "5O0GR" → "500GR", "**CODO" → "CODO"
      .flatMap(t => fixWord(t.replace(/^,+|,+$/g, "")).split(" ")).filter(Boolean);
    toks = toks.filter(t => !isCodeTok(t.replace(/[(),.;:]/g, "")));
    const junk = isJunkTok;

    // inicio: basura antes de la primera palabra conocida (máx. 3 fichas)
    let k = 0;
    // Hasta 3 fichas de basura antes de la primera palabra conocida: "Dess", "Sr7ez", "Poddd31 1 (", "Ema 13"
    // Una palabra en MAYÚSCULAS con vocales, en un nombre escrito en mayúsculas, es parte del nombre aunque no la
    // conozcamos ("ARROZ DIANA", "ATUN VAN CAMPS"); la basura del OCR suele salir en minúsculas o con dígitos ("Dess", "Sr7ez").
    const upLetters = (desc.match(/\p{Lu}/gu) || []).length, allLetters = letters(desc);
    const upperName = allLetters >= 6 && upLetters / allLetters > 0.8;
    const realWord = t => upperName && /^\p{Lu}{4,}[.,]?$/u.test(t) && (t.match(/[AEIOUÁÉÍÓÚ]/g) || []).length / letters(t) >= 0.25 && !/(\p{L})\1\1/u.test(t) && !/([^LR])\1[.,]?$/u.test(t);   // "DESS" no es palabra
    const unknownLead = t => { const c = t.replace(/[^\p{L}\d]/gu, ""); return !c || !isLex(c) && !SHORT_OK.has(norm(c)) && !realWord(t) && (c.length <= 5 || /\d/.test(c)); };
    const first = toks.findIndex(t => isLex(t.replace(/^[(\[]+/, "")));
    const brandNext = first > 0 && BRANDS_N.has(norm(toks[first]).replace(/[^a-z0-9ñ-]/g, ""));
    if (first > 0 && first <= 3 && toks.slice(0, first).every(t => junk(t) || unknownLead(t) || /^[\d(]+$/.test(t) || brandNext && letters(t) <= 8 && !isLex(t))
        && !(/^1$/.test(toks[0]) && /^x$/i.test(toks[1] || ""))) k = first;
    toks = toks.slice(k);
    if (toks[0]) toks[0] = toks[0].replace(/^[(\[]+/, "");
    // paquete "1 X 25" / "1X25" al inicio: es cuántas trae la caja, no parte del nombre
    if (/^1$/.test(toks[0]) && /^x$/i.test(toks[1] || "") && /^\d+$/.test(toks[2] || "")) toks = toks.slice(3);
    else if (/^1x\d+$/i.test(toks[0] || "")) toks = toks.slice(1);
    // final: basura escrita a mano; un número suelto pegado a la basura también se va
    let removed = false;
    while (toks.length > 1){
      const t = toks[toks.length - 1], c = t.replace(/[^\w/".]/g, "");
      if (junk(t) || /^\(\d+\)$/.test(t) && removed || /^\d{3,}$/.test(c) && !/^#/.test(t) && !/[x"']$/i.test(toks[toks.length - 2] || "")) { toks.pop(); removed = true; continue; }
      if (/^\d{1,2}$/.test(c) && (removed || +c === cantidad) && !/^(x|no|#|de)$/i.test(toks[toks.length - 2] || "")) { toks.pop(); removed = true; continue; }
      break;
    }
    return toks.join(" ").replace(/\s+([)"'])/g, "$1").replace(/([(])\s+/g, "$1").replace(/^[-–—:*.,;>_\s(]+|[-–—:*.,;>_\s]+$/g, "");
  }

  // Nombre para mostrar: tildes, abreviaturas completas, siglas y marcas con su forma correcta
  const ACCENT = {presion:"presión",union:"unión",valvula:"válvula",sifon:"sifón",plastico:"plástico",plastica:"plástica",metalica:"metálica",
    metalico:"metálico",cilindrico:"cilíndrico",teflon:"teflón",tapon:"tapón",tapones:"tapones",electrico:"eléctrico",angulo:"ángulo",
    acrilico:"acrílico",magnetico:"magnético",acetica:"acética",espatula:"espátula",economica:"económica",economico:"económico",lampara:"lámpara",
    galon:"galón",construccion:"construcción",expansion:"expansión",extension:"extensión",reduccion:"reducción",tuberia:"tubería",baston:"bastón",
    jardin:"jardín",meson:"mesón",movil:"móvil",boton:"botón",camion:"camión",cunete:"cuñete",pequeno:"pequeño",pequena:"pequeña",
    caustica:"cáustica",vinilico:"vinílico",ceramico:"cerámico",platon:"platón",tijera:"tijera",metrica:"métrica",hexagonal:"hexagonal"};
  const ABBR = {galv:"galvanizado",bco:"blanco",aisl:"aislante",transp:"transparente",llav:"llave","valv.":"válvula",valv:"válvula",
    torn:"tornillo","torn.":"tornillo",rll:"rollo",rej:"rejilla",prof:"profesional",ind:"industrial",cja:"caja",estruc:"estructural",
    driwall:"drywall",flanje:"flange",carreaje:"carriage",pres:"presión"};
  const UPPER = new Set("pvc cpvc led rde cxc hss emt ntc thhn awg e27 e14 lvm lvp m.h".split(" "));
  const FEM = /^(union|yee|ye|llave|valvula|tapa|rejilla|tee|cinta|griferia|ducha)$/;
  function prettyName(s){
    const toks = String(s).toLowerCase().replace(/\s+/g, " ").trim().split(" ");
    const out = toks.map((t, i) => {
      const n = norm(t);
      if (n === "sanit") return FEM.test(norm(toks[i-1] || "")) ? "sanitaria" : "sanitario";
      if (ABBR[n]) return ABBR[n];
      const m = t.match(/^c[*'°](\d+)$/); if (m) return `(caja x${m[1]})`;
      if (/^cja[*'°](\d+)$/.test(t)) return `(caja x${t.match(/(\d+)/)[1]})`;
      if (ACCENT[n]) return ACCENT[n];
      if (UPPER.has(n)) return t.toUpperCase();
      const br = BRANDS.find(b => norm(b) === n); if (br) return br;
      return t;
    });
    const r = out.join(" ").replace(/\s+/g, " ").trim();
    return r.charAt(0).toUpperCase() + r.slice(1);
  }

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
      else if (decs === 3 || repeated && decs !== 1 && decs !== 2) t = t.replace(/[.,]/g, "");
      else t = t.slice(0, last).replace(/[.,]/g, "") + "." + t.slice(last + 1);
    }
    const n = parseFloat(t);
    return isFinite(n) ? n : null;
  }
  // Corrige confusiones típicas del OCR dentro de números: O→0, l/I→1, S→5
  function fixDigits(tok){
    if (/\d/.test(tok) && /^\$?[\dOoIlS|.,]+%?$/.test(tok) && /\d[.,]?[OoIlS]|[OoIlS][.,]?\d/.test(tok))
      return tok.replace(/[Oo]/g, "0").replace(/[lI|]/g, "1").replace(/S/g, "5");
    // "$6.90T" → "$6.901"
    if (/^\$\d{1,3}[.,]\d{1,2}[TBZ]$/.test(tok)) return tok.slice(0, -1) + {T:"1", B:"8", Z:"2"}[tok.slice(-1)];
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
    const n = norm(desc).replace(/[*_]/g, " ") + " | " + norm(brand || "");
    const names = (categorias || []).map(c => c.nombre).filter(Boolean);
    const other = names.find(x => /^otro/i.test(norm(x))) || names[names.length - 1] || "Otros";
    const catFor = c => names.find(name => c.match.test(norm(name)));
    // Pistas encontradas: [nivel, posición, orden]. Nivel 0 = frases que mandan, 0.5 = nombre de una categoría creada por el
    // usuario (lo que él creó pesa más que las palabras genéricas), 1 = palabras, 2 = marcas.
    const hits = [];
    const scan = (re, lvl, cat, ord) => { if (!re || !cat) return; re.lastIndex = 0; const m = re.exec(n); if (m) hits.push([lvl, m.index, ord, cat]); };
    CONCEPTS.forEach((c, i) => { const cat = catFor(c); scan(c.first, 0, cat, i); scan(c.words, 1, cat, i); scan(c.brands, 2, cat, i); });
    // Categorías que el usuario inventó (ej. "Jardín", "Cerraduras"): su nombre también es una pista.
    names.forEach((name, i) => {
      if (CONCEPTS.some(c => c.match.test(norm(name)))) return;
      const stems = norm(name).split(/[^a-zñ]+/).filter(w => w.length >= 4 && !/^(otro|otros|varios|para|con)$/.test(w)).map(w => w.replace(/(es|s)$/, ""));
      if (stems.length) scan(new RegExp("\\b(?:" + stems.join("|") + ")", "g"), 0.5, name, 100 + i);
    });
    if (!hits.length) return other;
    hits.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    return hits[0][3];
  }

  const letters = t => (t.match(/\p{L}/gu) || []).length;
  const THOUS = /\d[.,]\d{3}(?:[.,]\d{3})*(?:[.,]\d{1,3})?$/;          // tiene separador de miles: 12.500, 1,100.000
  const isMoneyTok = t => /^\$/.test(t) || THOUS.test(t.replace(/^[sS5$]/, "$"));
  const DESCISH = /["'*\/½¼¾⅜⅝⅛]|^\d+(?:[.,]\d+)?(?:g|gr|kg|ml|cc|l|lt|cm|mm|mt|mtr|mts|m|gl|w|v|k)$|^\(\d+\)$/i;   // "(420)" es parte del nombre

  // Valores posibles de un número tal como lo leyó el OCR (el "$" a veces sale como 5, S u 8; a veces se pierde un cero).
  function readNumber(raw){
    let t = raw.replace(/^[(\[{<«"'“”=~*—–>_¿¡.-]+(?=\d)|^[(\[{<«"'“”=~*—–>_¿¡-]+|[)\]}>»"'“”.,;:—–_=~*?¿-]+$/g, "");
    let dollar = false, sDollar = false;
    if (/^\$/.test(t)) { dollar = true; t = t.slice(1); }
    if (!/^\d[\d.,]*$/.test(t)) {
      if (/^[sS]\d/.test(t) && /^[sS][\d.,]+$/.test(t)) { dollar = true; sDollar = true; t = t.slice(1); }
      else return null;
    }
    const v = parseNum(t);
    if (v == null) return null;
    let vals = [{v, alt:0}];
    // "$5.40" o "$5.00" → casi siempre es $5.400 / $5.000 con el último cero perdido (en pesos no se usan centavos)
    if (dollar && /^\d{1,3}\.\d{1,2}$/.test(t)) vals = [{v: parseNum(t.padEnd(t.indexOf(".") + 4, "0")), alt:0}, {v, alt:1}];
    // "5396.400" o "81,292" → el primer 5/8 era el "$"
    if (/^[58]\d{1,3}[.,]\d{3}/.test(t)) { const w = parseNum(t.slice(1)); if (w) vals.push({v:w, alt:1}); }      // también "$51.000" → $1.000
    // "$84.4591": se coló un dígito del borde de la tabla
    if (dollar && /^\d{1,3}[.,]\d{4}$/.test(t)) vals.push({v: parseNum(t.slice(0, -1)), alt:1});
    // "1,100,000" en factura con decimales ",000" → 1.100
    if (/[.,]\d{3}[.,]000$/.test(t) && v >= 1000) vals.push({v: v/1000, alt:1});
    const pct2 = !dollar && /^\d{1,2}[.,]\d{2}$/.test(t) && v <= 60;     // "3,00", "19,00": porcentaje de columna
    return {vals, dollar, sDollar, sep: THOUS.test(t), pct2, plainInt: /^\d+$/.test(t), raw: t};
  }

  function parseLine(raw, H = {}){
    // Normalizamos sin cambiar el largo de la línea, para conservar en qué columna cae cada número
    const pad = m => " ".repeat(m.length);
    let line = String(raw).replace(/\t/g, " ").replace(/[|¦\[\]{}!¡]/g, " ")
      .replace(/\bC[O0][PRr]\s*[\$sS5]?\s*(?=\d)/gi, m => pad(m).slice(1) + "$")
      .replace(/(^|\s)[Ss](\s+)(?=\d)/g, (m, a1, sp) => a1 + sp + "$")        // "S   18" → "$18" ("$" leído como S)
      .replace(/\$\s+(?=\d)/g, m => pad(m).slice(1) + "$")
      .replace(/(\d)(\s+)%/g, (m, d, sp) => d + "%" + sp)
      .replace(/(\$\d{1,3}[.,])(\s+)(\d{3})(?!\d)/g, (m, a1, sp, c) => a1 + c + sp)            // "$6, 460" → "$6,460"
      .replace(/(\$\d{1,3}) (\d{3})(?![\d.,])/g, "$1\u00b7$2")              // "$42 795": quizá era $42.795 (lo decide la ecuación)
      .replace(/\b(YE|TEE|TE)(\d)/gi, "$1 $2")                                          // "$42 795" → "$42.795"
      .replace(/(^|\s)[Ss]\$(?=\d)/g, "$1 $")                                                     // "S$10518"
      .replace(/(^|[\s|(])(\d{1,2}):(\d{2})(?=[\s|)!\]]|$)/g, "$1$2,$3");                          // "3:00)" → "3,00)"
    if (line.trim().length < 6 || SKIP.test(norm(line)) || SKIP_LOOSE.test(norm(line)) || HEADER_ROW.test(line)) return null;
    const toks = [], pos = [];
    for (const m of line.matchAll(/\S+/g)) { toks.push(fixDigits(m[0].replace(/\u00b7/g, "\u00b7"))); pos.push(m.index); }

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
    // Un espacio grande dentro del "nombre" casi siempre separa lo impreso de lo escrito a mano.
    // Después del hueco solo seguimos si vienen medidas o palabras de producto ("PVC SOLD", "1/16").
    const gapAt = i => pos[i] - (pos[i-1] + toks[i-1].length);
    for (let i = a + 2; i <= b; i++){
      if (gapAt(i) < 3) continue;
      let j = i;
      while (j <= b && (isLex(toks[j]) || isSizeTok(toks[j].replace(/^[—–-]+|[—–-]+$/g, "")) || /^[—–-]+$/.test(toks[j])) && !(j > i && gapAt(j) >= 3)) j++;
      if (j <= b){ b = j - 1; break; }
    }
    while (b > a && (/^[—–\-.,;:]+$/.test(toks[b]) || isJunkTok(toks[b]) && !isLex(toks[b]))) b--;
    let desc = toks.slice(a, b + 1).join(" ")
      .replace(/^[-–—:*.,;>_\s]+|[-–—:*.,;>_\s]+$/g, "").replace(/\s[-–—_>]+(?=\s|$)/g, "").replace(/^\d(?=\p{L}{3})/u, "");
    if (letters(desc) < 4 && !(letters(desc) >= 2 && /\d/.test(desc) && isLex(toks[a]))) return null;
    let hasUM = toks.slice(b + 1).some(t => UM_STOP.test(t) && !/^cop$/i.test(t));

    // Números fuera del nombre
    const nums = []; let iva = null;
    toks.forEach((t, i) => {
      if (i >= a && i <= b) return;
      if (/^\d{1,2}(?:[.,]\d+)?%$/.test(t)) { const v = Math.round(parseNum(t)); if ([0,5,19].includes(v)) iva = v; nums.push({i, pct:true, vals:[{v, alt:0}]}); return; }
      let n;
      const jm = t.match(/^\$(\d{1,3})\u00b7(\d{3})$/);
      if (jm){
        // "$42 795": $42.795 o $42 y una nota "795". Primero lo que la factura suele hacer (aprendido), luego lo otro.
        const joined = +(jm[1] + jm[2]), solo = +jm[1];
        n = {vals: H.joinSpace ? [{v: joined, alt:0}, {v: solo, alt:1}] : [{v: solo, alt:0}, {v: joined, alt:1, joined:true}], dollar:true, sep: !!H.joinSpace, raw: jm[1] + jm[2], plainInt:false, joinTok:true};
        if (H.joinSpace) n.vals[0].joined = true;
      } else n = readNumber(t);
      if (!n) return;
      if (i < a && (n.plainInt && n.vals[0].v >= 1000 || CODE_TOK.test(t))) return;       // código o referencia antes del nombre
      if (n.plainInt && !n.dollar && n.raw.length >= 5) return;                                     // referencia / código: 101043, 797503331 (nunca es un precio)
      n.i = i; n.pos = pos[i]; n.afterUM = i > 0 && UM_STOP.test(toks[i-1]) && !/^cop$/i.test(toks[i-1]);
      n.qdec = /^\d+[.,]0{1,2}$/.test(n.raw);
      nums.push(n);
    });
    // "UND" al final de la línea (basura) no es la columna de unidad
    if (hasUM && !nums.some(n => n.afterUM) && !nums.some(n => n.i > toks.findIndex((t, i) => i > b && UM_STOP.test(t)))) hasUM = false;
    // "19,00" como columna IVA
    if (iva == null){ const p = nums.find(n => n.pct2 && n.vals[0].v === 19) || nums.find(n => n.pct2 && n.vals[0].v === 5 && n === nums[nums.length - 2]); if (p) iva = p.vals[0].v; }

    // Un número justo después de "UND" es la cantidad, no un precio
    const money0 = nums.filter(n => !n.pct && !n.afterUM && n.i > b && n.vals.some(x => x.v >= 10) && (n.dollar || n.sep || n.vals[0].v >= 100));
    // Si hay precios con "$" o con puntos de miles, los números sueltos (notas a mano, códigos) no compiten con ellos
    let money = money0.filter(n => n.dollar || n.sep).length >= 1 && money0.some(n => !(n.dollar || n.sep)) && money0.filter(n => n.dollar || n.sep).length >= 2
      ? money0.filter(n => n.dollar || n.sep) : money0;
    // Para la ecuación también sirven precios pequeños sin "$" (tornillos a $90 en una cotización)
    const strong = nums.filter(n => n.dollar || n.sep).length;
    const moneyEq = nums.filter(n => !n.pct && !n.pct2 && !n.afterUM && n.i > b && n.vals.some(x => x.v >= 10) && !(strong >= 2 && n.plainInt && !n.dollar && n.raw.length >= 4));
    const firstPrice = nums.find(n => n.i > b && (n.dollar || n.sep));
    const umIdx = toks.findIndex((t, i) => i > b && UM_STOP.test(t) && !/^cop$/i.test(t) && (!firstPrice || i < firstPrice.i));
    const qtys  = nums.filter(n => !n.pct && !n.dollar && !n.sep && n.vals[0].v > 0 && n.vals[0].v <= 9999 && (Number.isInteger(n.vals[0].v) || /^\d+[.,]\d{1,2}$/.test(n.raw))
      && !(umIdx > 0 && n.i > b && n.i < umIdx));
    if (!qtys.some(x => x.i > b) && !qtys.some(x => x.i < a) && b > a + 1 && /^\d{1,3}$/.test(toks[b]) && gapAt(b) >= 1 && nums.some(n => n.dollar || n.sep)){
      qtys.push({i: b, pos: pos[b], vals:[{v: +toks[b], alt:0}], raw: toks[b], plainInt: true});
      desc = desc.replace(/\s\d{1,3}$/, ""); b--;
    }
    // "…P1200-230 X 10 $1,988": si no quedó ninguna cantidad, el número tras la X era la cantidad
    if (!qtys.length && /\s[xX]\s+\d{1,4}$/.test(desc) && /^\d{1,4}$/.test(toks[b])){
      qtys.push({i: b, pos: pos[b], vals:[{v: +toks[b], alt:0}], raw: toks[b], plainInt: true});
      desc = desc.replace(/\s[xX]\s+\d{1,4}$/, "");
    }
    if (H.qtyDec && !qtys.some(x => x.qdec)) for (const x of qtys) if (/^[1-9]\d*00$/.test(x.raw) && x.i > b) x.vals = [{v: +x.raw / 100, alt:0}, ...x.vals.map(v => ({...v, alt:1}))];
    const saidQty = u => qtys.find(x => x.afterUM) || (H.qtyDec && qtys.find(x => x.qdec && x.i > b && (!u || x.i < u.i))) || qtys.find(x => x.i > b && (!u || x.i < u.i)) || qtys.find(x => x.i < a);
    // Si el único candidato a cantidad es un número sin "$" junto a un precio con "$", es la cantidad ("500   $ 9.500")
    { const plainQ = qtys.filter(x => x.i > b); if (plainQ.length === 1 && money.includes(plainQ[0]) && money.some(m => m.dollar || m.sep)) money = money.filter(m => m !== plainQ[0]); }
    const pctToks = nums.filter(n => (n.pct2 || n.pct) && (n.vals[0].v > 0 && n.vals[0].v <= 60 && n.vals[0].v !== 19 && n.vals[0].v !== 5 || n.vals[0].v === 5 && iva !== 5));
    const pcts = pctToks.map(n => n.vals[0].v);
    const lastMoney = money.length ? money[money.length - 1] : null;

    // Ecuación: cantidad × unitario × (1 − descuentos) × (1 + IVA) ≈ total
    const near = (x, y) => Math.abs(x - y) <= Math.max(2, y * 0.012);
    const dset = [0, ...new Set(pcts)];
    let best = null;
    const rset = H.ivaInTotal === false ? [0] : H.ivaInTotal === true && iva ? [iva] : (iva != null ? [...new Set([0, iva])] : [0, 19]);
    for (const q of qtys) for (const u of moneyEq) for (const t of moneyEq){
      if (u === t || q === u || q === t || t.i < u.i) continue;           // el total va a la derecha del unitario
      // Los descuentos van entre el unitario y el total (así "2,00" de la cantidad no se toma como 2 %)
      const dset = [0, ...new Set([...pctToks.filter(p => p.i > u.i && p.i < t.i && p !== q).map(p => p.vals[0].v), ...(H.d1 ? [H.d1] : [])])];
      for (const qv of q.vals) for (const uv of u.vals) for (const tv of t.vals){
        if (uv.v < 10 || tv.v < uv.v * 0.4 || (tv.v === uv.v && qv.v !== 1)) continue;     // con descuentos el total puede ser menor que el unitario
        for (const d1 of dset) for (const d2 of (d1 ? dset : [0])) for (const r of rset){
          const net = uv.v * (1 - d1/100) * (1 - d2/100), calc = qv.v * net * (1 + r/100);
          if (!near(calc, tv.v)) continue;
          const score = (t.i > u.i ? 3 : 0) + (t === lastMoney ? 2 : 0) + (q.i < u.i ? 1 : 0) - (q.i > t.i ? 3 : 0) - (q.i > u.i ? 2 : 0)
            - (tv.v === uv.v && qtys.some(x => x !== q && x.i > b && x.i < u.i) ? 3 : 0) + (u.dollar ? 0.5 : 0) + (u.i > b ? 2 : 0) + (t.dollar || t.sep ? 1 : 0)
            - 2 * (uv.alt + tv.alt + qv.alt) - (d1 && d1 !== H.d1 ? 0.5 : 0) - (d2 ? 0.5 : 0) - (r && r !== iva ? 1 : 0) + (H.qtyDec && q.qdec ? 1 : 0) - Math.abs(calc - tv.v) / tv.v * 60;   // la combinación que cuadra más exacto
          if (!best || score > best.score) best = {q: qv.v, net, r, d1, score, joined: !!uv.joined || !!tv.joined, used:[q, u, t], uPos: u.pos, tPos: t.pos, qi: q.i, qdec: !!q.qdec, pctBetween: pctToks.some(p => p.i > u.i && p.i < t.i)};
        }
      }
    }
    let cantidad, costo, revisar = false, ivaPct = iva || 0, sinPrecio = false, single = null;
    if (best){ cantidad = best.q; costo = best.net; ivaPct = best.r || iva || 0; }
    else if (money.length >= 2){
      const qTok = saidQty(null);
      const u = money.find(m => m.i > b && m.dollar && m !== lastMoney) || money.find(m => m.i > b && m !== lastMoney && m !== qTok) || money[0], t = lastMoney;
      // Falta la cantidad o se leyó mal: la deducimos de total ÷ unitario
      let found = null;
      const dsetF = [...new Set([...(H.d1 ? [H.d1] : []), ...dset])];
      outer: for (const uv of u.vals) for (const tv of t.vals) for (const d1 of dsetF) for (const r of (H.ivaInTotal === false ? [0] : iva != null ? [iva, 0] : [0, 19])){
        const net = uv.v * (1 - d1/100), ratio = tv.v / (net * (1 + r/100)), q = Math.round(ratio);
        if (u === t || net < 10 || q < 1 || q > 999 || Math.abs(ratio - q) / q >= 0.006) continue;
        // Si sí se leyó una cantidad, la deducida no puede ser de otro tamaño (evita 290 cuando dice 4)
        // …salvo que unitario y total se vean limpios (con separador de miles): entonces la cantidad leída es la que está mal
        const said = saidQty(u), clean = (u.sep || u.dollar && !u.sDollar) && (t.sep || t.dollar && !t.sDollar) && !uv.alt && !tv.alt;
        const extraDigit = said && said.raw.length === String(q).length + 1 && (said.raw.startsWith(String(q)) || said.raw.endsWith(String(q)));
        if (said && !extraDigit && (!clean || said.afterUM) && (q / said.vals[0].v > 3 || said.vals[0].v / q > 3)) continue;
        found = {q, net, r}; break outer;
      }
      const said0 = saidQty(u);
      if (found && said0 && said0.vals[0].v !== found.q && Math.abs(said0.vals[0].v - found.q) / said0.vals[0].v < 0.15){
        const per = t.vals[0].v / said0.vals[0].v;
        if (per >= 10 && per % 50 === 0) found = {q: said0.vals[0].v, net: per, r: 0};       // "20 × $1.990 = 38.000" → era $1.900
      }
      if (found){ cantidad = found.q; costo = found.net; ivaPct = found.r || iva || 0; revisar = !qtys.some(x => x.vals.some(v => v.v === found.q)); }
      else {
        const q0 = saidQty(u) || qtys.find(x => x !== u && x !== t);
        const q = q0 && (q0.vals[0].v <= 999 || q0.afterUM) ? q0 : null;      // 9259 no es una cantidad creíble
        cantidad = q ? q.vals[0].v : 1; revisar = true;
        // De los valores posibles del unitario, el que no es mayor que el total ("51.820" → $1.820 cuando el total es $21.658)
        const tv0 = t !== u && t.i > u.i ? t.vals[0].v : 0;
        const uvOk = tv0 ? u.vals.find(x => x.v <= tv0 * 1.05 && x.v >= 10) : null;
        costo = (uvOk || u.vals[0]).v;
        const uSuspicious = !(u.sep || u.dollar) || u.sDollar || !!uvOk && uvOk !== u.vals[0] || u.vals.length > 1;
        if (q && tv0 && (t.sep || t.dollar)){
          for (const r of (H.ivaInTotal === false ? [0] : iva != null ? [iva] : [0, 19])){
            const guess = tv0 / (cantidad * (1 + r/100));
            // El total corrige un unitario mal leído, si el unitario se ve dudoso o el total ÷ cantidad da redondo
            if (guess >= 10 && (Math.abs(guess - costo) / guess < 0.3 || uSuspicious && t.sep && !t.sDollar && guess % 1 < 0.02)
                && (uSuspicious || guess % 50 === 0)){ costo = Math.round(guess * 100) / 100; ivaPct = r || ivaPct; break; }
          }
        }
        if (H.d1 && costo === (uvOk || u.vals[0]).v) costo = costo * (1 - H.d1 / 100);       // descuento habitual de este proveedor
      }
    } else if (money.length === 1){
      const m = money[0], q = saidQty(m) || qtys.find(x => x !== m);
      cantidad = q ? q.vals[0].v : 1; costo = m.vals[0].v; revisar = true;
      single = {pos: m.pos, v: m.vals[0].v, hasQ: !!q};
      // Con columnas de descuento/IVA antes del número, ese número es el total de la línea (Ferredistarco)
      if (q && cantidad > 1 && pctToks.concat(nums.filter(n => n.pct2)).some(p => p.i > q.i && p.i < m.i)) { costo = m.vals[0].v / cantidad; single = null; }
    } else {
      // Remisión sin precios (CCD, Sidoc): solo nombre y cantidad
      if (!hasUM) return null;
      const q = qtys.find(x => x.i > b) || qtys.find(x => x.i < a);
      if (!q) return null;
      cantidad = q.vals[0].v; costo = 0; revisar = true; sinPrecio = true;
    }
    if (!best && [5, 19].includes(cantidad)) revisar = true;
    // Números pequeños pegados al nombre que no se usaron como cantidad son parte del nombre ("UNION 2", "SEGUETA NICHOLSON 18")
    if (best && !hasUM && best.qi > b + 1){
      const extra = [];
      for (let i = b + 1; i < best.qi; i++){
        if (gapAt(i) >= 3 || !/^\d{1,2}(?:\/\d+)?["']?$/.test(toks[i])) break;
        extra.push(toks[i]);
      }
      if (extra.length && extra.length === best.qi - b - 1) desc += " " + extra.join(" ");
    }
    // Texto basura del OCR (hoja girada, sellos, firmas): pocas palabras reales o casi sin vocales
    if (!best){
      const words = desc.split(/\s+/), L = letters(desc);
      const inWords = words.filter(w => letters(w) >= 3).reduce((acc, w) => acc + letters(w), 0);
      const vowels = (norm(desc).match(/[aeiou]/g) || []).length;
      if (inWords / L < 0.6 || words.filter(w => letters(w) >= 3).length < 2 || vowels / L < 0.22) return null;
    }
    // Sin ecuación ni columna de unidad ni signo $, lo más probable es que no sea un producto
    if (!best && !hasUM && !money.some(m => m.dollar) && letters(desc) < 8) return null;
    const cleaned = cleanName(desc, cantidad);
    if (letters(cleaned) >= 3) desc = cleaned;
    return {desc, cantidad: Math.round(cantidad * 100) / 100, costo: Math.round(costo * 100) / 100, iva: ivaPct, revisar, sinPrecio,
      cols: best ? {u: best.uPos, t: best.tPos} : null, single,
      learn: best ? {d1: best.d1, r: best.r, ivaLine: iva, qdec: best.qdec, joined: best.joined} : null};
  }

  // Proveedores habituales de la ferretería, con el nombre que ya tienen en su sistema POS (así el POS no crea
  // un proveedor repetido). Lo que el usuario corrija a mano en la app se recuerda por NIT y manda sobre esto.
  const KNOWN_SUPPLIERS = [
    [/\bmercadeo\b/i, "mercadeo"],
    [/\bla\s+superior\b|ferreteros\s+la\s+sup/i, "la superior"],
    [/ferredistarco|ferre\s*distarco/i, "ferredistarco"],
    [/\bw[uü]rth\b/i, "wurth"],
    [/\bsidoc\b|sider[uú]rgica\s+de\s+occidente/i, "sidoc"],
    [/ferroplast/i, "ferroplast"],
    [/distribuciones\s+aro\b/i, "aro"],
    [/\bccd\b|construyendo[\s\S]{0,80}?\bjuntos\b/i, "ccd"],
  ];
  const supplierName = s => { const t = String(s || "").replace(/\s+/g, " "); for (const [re, name] of KNOWN_SUPPLIERS) if (re.test(t)) return name; return null; };
  // NIT sin puntos ni dígito de verificación: "900.145.983-2", "9001459832" → "900145983"
  function nitKey(s){
    let t = String(s || "").replace(/[\s.,]/g, "");
    const m = t.match(/^(\d{6,10})(?:-(\d))?$/); if (!m) return "";
    t = m[1];
    if (!m[2] && t.length === 10 && /^[89]/.test(t)) t = t.slice(0, 9);
    return t;
  }
  // Limpia una línea candidata a nombre del proveedor: "e e*. SIDERURGICA DE OCCIDENTE SAS [REMISIÓN —]" → "SIDERURGICA DE OCCIDENTE SAS"
  function cleanSupplier(l){
    let s = String(l).split(/\s[|\[—–]|[|\[]|\s{3,}|\b(?:nit|n\.i\.t|factura|remisi[oó]n|cotizaci[oó]n|concesi[oó]n|fecha|tel[eé]?f?o?n?o?s?|direcci[oó]n|no\.\s?\d|nro|n[°º])\b/i)[0];
    const suf = s.match(/^(.*?\b(?:s\.?\s?a\.?\s?,?\s?s\.?|ltda\.?|s\.\s?a\.|e\.\s?u\.)(?=\s|$))/i);
    if (suf) s = suf[1];
    // Ni direcciones, ni ciudades, ni títulos de la tabla, ni fechas escritas: eso no es el nombre del proveedor
    if (/colombia|valle\s+del\s+cauca|\bcali\b|\bbarrio\b|\bcarrera\b|\bcalle\b|\b(?:cr|cra|cl|kr|av)\.?\s?\d|\bkm\s?\d|referencia|descripci|cantidad|\bvalor\b|precio|c[oó]digo|\bitem|\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b|aceptaci|^\W*remisi/i.test(s)) return "";
    // Una palabra con demasiadas I/J intercaladas es letra grande mal leída ("EJEIRIRIE", "TAIRICION")
    const garbled = t => letters(t) >= 5 && ((t.match(/[ijl1|]/gi) || []).length / letters(t) >= 0.3);
    const ok = t => letters(t) >= 3 && /[aeiouáéíóú]/i.test(t) && !/[|!\])(]/.test(t) && !/\p{Lu}\p{Ll}+\p{Lu}/u.test(t) && !garbled(t)
      || /^(s\.?a\.?s\.?|ltda\.?|y|de|del|la|el|&)$/i.test(t) || /^\p{Lu}{2,4}$/u.test(t);
    const toks = s.replace(/[“”"'*_~=>]+/g, " ").trim().split(/\s+/).filter(Boolean);
    while (toks.length && !(ok(toks[0]) && letters(toks[0]) >= 3)) toks.shift();
    while (toks.length && !ok(toks[toks.length - 1])) toks.pop();
    const out = toks.join(" ").replace(/(?<!\b\p{L})[,;:.\-–—]+$/u, "").trim();   // "S.A.S." conserva su punto
    const words = toks.filter(t => letters(t) >= 3);
    // basura del OCR: pocas letras o muchas fichas raras
    if (letters(out) < 6 || !words.length || words.filter(ok).length / words.length < 0.75) return "";
    return out.slice(0, 60);
  }

  function parseHeader(lines){
    const text = lines.join("\n");
    let numero = null, fecha = null, proveedor = null, nit = null;
    const mN = text.match(/(?:factura|fact\.?|fe\b|remisi[oó]n|pedido|concesi[oó]n|cotizaci[oó]n|cuenta\s+de\s+cobro|documento)[^\n\d]{0,30}?(?:n[°ºo.]*|#|:)?\s*([A-Z]{1,5}[-\s]?\d{2,10}|\d{3,10})(?!\d)/i)
      || text.match(/(?:^|\n)\s*(?:no|n[°º]|nro|n[uú]mero)\.?\s*[:#]?\s*([A-Z]{0,5}-?\d{3,10})(?!\d)/i);
    if (mN) numero = mN[1].replace(/\s+/g, "");
    const mF = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/) || text.match(/\b(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/);
    if (mF){
      let y, m, d;
      if (mF[1].length === 4){ y = mF[1]; m = mF[2]; d = mF[3]; } else { d = mF[1]; m = mF[2]; y = mF[3]; }
      if (y.length === 2) y = "20" + y;
      if (+m > 12 && +d <= 12) [d, m] = [m, d];
      if (+m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) fecha = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    }
    // Encabezado = lo que va antes de los datos del cliente (ahí está el NIT del proveedor, no el del cliente)
    let cut = lines.findIndex((l, i) => i > 0 && /^\s*(?:cliente|se[ñn]or(?:es)?|sr\.?|adquir\w*|comprador|nombre)\b/i.test(l));
    if (cut < 0 || cut > 14) cut = Math.min(lines.length, 10);
    const head = lines.slice(0, cut);
    const mNit = head.join("\n").match(/\bn\.?\s?i\.?\s?t\.?\s*(?:\/?\s*c\.?\s?c\.?)?\s*[:.#]?\s*(\d[\d.,\s]{4,13}\d(?:\s?-\s?\d)?)/i);
    if (mNit) nit = nitKey(mNit[1].replace(/\s+/g, "")) || null;
    const known = supplierName(head.join(" ")) || supplierName(lines.slice(0, 14).join(" "));
    const COMPANY = /\b(s\.?\s?a\.?\s?,?\s?s\b|ltda|s\.\s?a\.|e\.\s?u\.|&\s?c[ií]a|distribuidora|distribuciones|comercializadora|comercial|mayorista|dist\.|sider[uú]rgica|industrias|importadora|inversiones|almac[eé]n|dep[oó]sito|ferreter[ií]a|ferre\w+|grupo)/i;
    const cands = head.slice(0, 9).map(l => l.trim()).filter(Boolean)
      .filter(l => !/^\s*(?:nombre|cliente|se[ñn]or)/i.test(l))
      .map(l => ({l, c: cleanSupplier(l)})).filter(x => x.c && !SKIP.test(norm(x.c)));
    // Sin palabra de empresa (SAS, Ltda, Distribuidora…) no adivinamos: en hojas escaneadas casi siempre es basura del
    // logo, y el POS crearía un proveedor falso. Si queda vacío, el usuario lo escribe una vez y la app lo recuerda por NIT.
    const best = cands.find(x => COMPANY.test(x.c));
    proveedor = known || (best ? best.c : null);
    return {proveedor, numero, fecha, nit};
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

  // Renglones lógicos: une nombres partidos en dos renglones y recibos donde el nombre va debajo del código
  const MONEY_RE = /(?:\$|(?:^|\s)[Ss]\s+)\s*\d|\d[.,]\d{3}(?!\d)/g;
  const moneyCount = l => (String(l).match(MONEY_RE) || []).length;
  const nameLetters = l => String(l).split(/\s+/).filter(t => !isSizeTok(t) && !/^[Ss$]$/.test(t)).reduce((a, t) => a + letters(t), 0);
  const isHead = l => SKIP.test(norm(l)) || SKIP_LOOSE.test(norm(l)) || HEADER_ROW.test(l);
  const textOnly = l => moneyCount(l) === 0 && nameLetters(l) >= 6 && (String(l).match(/(?:^|\s)\d{2,}(?=\s|$)/g) || []).length <= 1 && !isHead(l);
  function logicalLines(lines, H = {}){
    const out = [];
    for (let i = 0; i < lines.length; i++){
      const l = lines[i], n1 = lines[i+1] || "";
      // A) "Tornillo extraplano punta broca" + "8x3/4   500   $ 9.500"
      if (textOnly(l) && moneyCount(n1) >= 1 && nameLetters(n1) <= 3 && !isHead(n1)){
        const m = parseLine(l.trim() + "    " + n1.trim(), H);
        if (m && !parseLine(n1, H)){ out.push(m); i++; continue; }
      }
      // B) "1155161   15,0  $1,155,0  $20,616" y debajo "VARILLA ROSCADA" / "5/16 X 1 MT"
      if (moneyCount(l) >= 1 && nameLetters(l) <= 2 && /(?:^|\s)\d{5,}(?=\s)/.test(l) && !isHead(l)){
        const desc = []; let j = i + 1;
        while (j < lines.length && j <= i + 4 && !/^\s*\S*\d{5,}/.test(lines[j]) && !isHead(lines[j])){
          const txt = lines[j].split(/\s{3,}/)[0].trim();          // lo de la izquierda; a la derecha van descuentos y notas
          if (letters(txt) >= 2 || isSizeTok(txt.replace(/\s+/g, ""))) desc.push(txt);
          j++;
        }
        if (desc.length){
          const m = parseLine(desc.join(" ") + "    " + l.trim(), H);
          if (m){ out.push(m); i = j - 1; continue; }
        }
      }
      const r = parseLine(l, H); if (r) out.push(r);
    }
    return out;
  }
  // Lo que aprendemos de las líneas que sí cuadraron: descuento habitual, formato de cantidad, si el total trae IVA
  function learnPage(parsed){
    const L = parsed.map(r => r.learn).filter(Boolean), H = {};
    if (L.length < 3) return H;
    const mode = a => { const c = {}; a.forEach(x => c[x] = (c[x] || 0) + 1); const k = Object.keys(c).sort((x, y) => c[y] - c[x])[0]; return [k, c[k] / a.length]; };
    const [d, dShare] = mode(L.map(x => x.d1 || 0));
    if (+d > 0 && dShare >= 0.6) H.d1 = +d;
    if (L.filter(x => x.qdec).length / L.length >= 0.6) H.qtyDec = true;
    if (L.filter(x => x.joined).length >= 2) H.joinSpace = true;
    const withIva = L.filter(x => x.ivaLine);
    if (withIva.length >= 3){ const inc = withIva.filter(x => x.r).length / withIva.length; if (inc >= 0.8) H.ivaInTotal = true; else if (inc <= 0.2) H.ivaInTotal = false; }
    return H;
  }

  function parseInvoice(lines, categorias){
    const items = [];
    let parsed = logicalLines(lines);
    const H = learnPage(parsed);
    if (Object.keys(H).length) parsed = logicalLines(lines, H);
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
        producto: prettyName(r.desc), marca, cantidad: r.cantidad, costo_unitario: r.costo,
        iva_pct: r.iva, categoria: pickCategory(r.desc, marca, categorias), revisar: r.revisar, sin_precio: r.sinPrecio
      });
    }
    if (items.length && items.filter(x => !x.iva_pct).length >= items.length * 0.7){
      const piva = pageIva(lines, items.filter(x => !x.revisar));
      if (piva) items.forEach(x => { if (!x.iva_pct) x.iva_pct = piva; });
    }
    return {...parseHeader(lines), items};
  }

  const api = {parseInvoice, parseLine, parseNum, readNumber, parseHeader, supplierName, nitKey, findBrand, pickCategory, cleanName, prettyName, fixWord};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.InvoiceParser = api;
})(typeof self !== "undefined" ? self : this);
