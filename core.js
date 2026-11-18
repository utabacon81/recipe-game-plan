/* Shared by index.html and builder.html: storage key, text helpers, and the recipe model. */
const KEY = "recipe-game-plan-v1";

const COLORS = ["#E06C5A","#E5B94E","#7FB57A","#9DB4D6","#C98B5A","#C792EA","#5FC4C4","#F29BB3"];
function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

/* ============================================================
   Text helpers
   ============================================================ */
const UNI = {"½":.5,"⅓":1/3,"⅔":2/3,"¼":.25,"¾":.75,"⅛":.125,"⅜":.375,"⅝":.625,"⅞":.875,"⅕":.2};
function normNum(s){
  s = s.replace(/(\d*)\s?([½⅓⅔¼¾⅛⅜⅝⅞⅕])/g,(m,a,f)=>" "+String(+((+a||0)+UNI[f]).toFixed(3)));
  s = s.replace(/(\d+)\s+(\d+)\s*\/\s*(\d+)/g,(m,a,b,c)=>String(+(+a + b/c).toFixed(3)));
  s = s.replace(/(\d+)\s*\/\s*(\d+)/g,(m,a,b)=>String(+(a/b).toFixed(3)));
  return s.replace(/\s+/g," ").trim();
}
function decode(s){
  if (s==null) return "";
  const d = new DOMParser().parseFromString("<!doctype html><body>"+String(s), "text/html");
  return (d.body.textContent || "").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
}
function sentences(t){
  return t.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/).map(x=>x.trim()).filter(Boolean);
}

/* ---------- durations ---------- */
const WORDNUM = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,fifteen:15,twenty:20,thirty:30,forty:40,"forty-five":45,sixty:60};
function durMin(sent){
  let s = normNum(sent.toLowerCase())
    .replace(/half an hour/g,"30 minutes")
    .replace(/\b(an|a) hour\b/g,"1 hour")
    .replace(/\b(forty-five|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|sixty)\b/g,w=>WORDNUM[w]);
  if (/\bovernight\b/.test(s)) return 480;
  s = s.replace(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:and\s*)?(\d+)\s*(?:minutes?|mins?)/g,(m,h,mm)=>(h*60 + +mm)+" minutes");
  const re = /(every\s+)?(\d+(?:\.\d+)?)(?:\s*(?:-|–|to|or)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b(\s*(?:per|on each|each)\s+side)?/g;
  let best = 0, m;
  while ((m = re.exec(s))) {
    if (m[1]) continue;
    let v = +(m[3] || m[2]); const u = m[4];
    v = u[0]==="h" ? v*60 : u[0]==="s" ? v/60 : v;
    if (m[5]) v *= 2;
    best = Math.max(best, v);
  }
  return Math.round(best);
}
function isoMin(iso){
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i.exec(iso||"");
  if (!m) return 0;
  return (+m[1]||0)*1440 + (+m[2]||0)*60 + (+m[3]||0);
}

/* ---------- ingredients ---------- */
const UNITS = ["fluid ounces?","fl\\.? ?oz","cups?","c","tablespoons?","tbsps?","tbs","tbl","T","teaspoons?","tsps?","t","ounces?","oz","pounds?","lbs?","grams?","g","kilograms?","kg","milliliters?","ml","liters?","litres?","l","quarts?","qts?","pints?","pts?","gallons?","cloves?","cans?","jars?","packages?","pkgs?","pkg","sticks?","slices?","pinch(?:es)?","dash(?:es)?","bunch(?:es)?","sprigs?","heads?","stalks?","ribs?","pieces?","bags?","bottles?","boxes?","handfuls?","envelopes?","sheets?","fillets?","links?","containers?","large","medium","small","whole","heaping","level","scant","generous"];
const UNIT_RE = new RegExp("^(?:"+UNITS.join("|")+")\\.?\\s+","i");
const PREP_CLAUSE = /\b(chop|chopped|dice|diced|mince|minced|slice|sliced|shred|shredded|grate|grated|cube|cubed|peel|peeled|halve|halved|quarter|quartered|soften|softened|melt|melted|beat|beaten|toast|toasted|julienne|julienned|trim|trimmed|rinse|rinsed|drain|drained|zested|juiced|thaw|thawed|crumble|crumbled|crush|crushed|smash|smashed|seeded|cored|pitted|cut|torn|pounded|mashed|sifted|patted|deveined|stemmed|room temperature|at room temp)\b/i;
const LEAD_PREP = /^((?:(?:finely|thinly|coarsely|roughly|freshly|lightly|very)\s+)?(?:chopped|diced|minced|sliced|shredded|grated|cubed|peeled|halved|quartered|softened|melted|beaten|toasted|julienned|trimmed|crumbled|mashed|sifted|cooked)\s+(?:and\s+)?)+/i;
const NOT_PREP = /\b(divided|to taste|for serving|for garnish|optional|plus more.*|as needed|or more.*)\b/gi;

const PRODUCT = /^(diced|crushed|chopped|sliced|stewed|whole|shredded)\s+(tomato|green chil|chil|pineapple|olive|water chestnut|peach|beet|jalape|mushroom|coconut|wheat)/i;
function parseIng(raw){
  const line = decode(raw);
  const parts = line.replace(/\([^)]*\)/g," ").replace(/\s+/g," ").trim().split(",");
  let s = normNum(parts.shift() || "");
  s = s.replace(/^[\d.\s-]+(?:(?:to|or|-|–)\s*[\d.]+)?\s*/,"");
  let prev; do { prev = s; s = s.replace(UNIT_RE,""); } while (s !== prev);
  let name = s.replace(/^of\s+/i,"");
  const prep = [];
  const lead = PRODUCT.test(name) ? null : name.match(LEAD_PREP);
  if (lead) { prep.push(lead[0].trim()); name = name.slice(lead[0].length); }
  parts.join(",").split(/[,;]/).forEach(c=>{
    const t = c.replace(NOT_PREP,"").trim();
    if (t && PREP_CLAUSE.test(t) && !PRODUCT.test(t)) prep.push(t);
  });
  name = name.replace(/\b(to taste|for serving|for garnish|optional)\b/gi,"").replace(/\s+/g," ").trim().toLowerCase();
  return { raw: line, name: name || line.toLowerCase(), prep: prep.join(", ") };
}

const STOP = new Set(("fresh large small medium whole ground lean extra virgin boneless skinless bone low reduced sodium unsalted salted kosher sea table plain pure thick thin cut about divided optional taste garnish serving into pieces piece inch more plus and or the for with of to a an good quality homemade store bought dry dried packed light dark sweet hot mild warm cold room temperature finely thinly roughly coarsely chopped diced minced sliced shredded grated softened melted cooked smoked cured roasted toasted canned frozen black white red green yellow orange brown golden purple baby young new old fat free percent organic natural style can cans package").split(" "));
const GENERIC = new Set("powder sauce oil juice seeds seed leaves leaf paste flakes extract pepper peppers vinegar mix water stock broth cream wine meat".split(" "));
const CATS = [
  [/\b(adjust|correct|check)\s+(the\s+)?seasoning|season(ed)? to taste|taste for seasoning/i, /\b(salt|pepper)\b/i],
  [/\b(spices|seasonings|spice mix|spice blend|dry rub)\b/i, /\b(cumin|paprika|chili powder|chile powder|chipotle|oregano|thyme|cinnamon|nutmeg|cayenne|coriander|turmeric|curry|garam|allspice|cloves|ginger|mustard|pepper flakes|italian seasoning|onion powder|garlic powder|bay|sage|rosemary|fennel|cardamom|seasoning|salt|black pepper)\b/i],
  [/\b(vegetables|veggies|aromatics)\b/i, /\b(onions?|garlic|bell peppers?|carrots?|celery|shallots?|leeks?|zucchini|mushrooms?|potatoes?|jalape[nñ]os?|poblanos?|scallions?)\b/i],
  [/\bdry ingredients\b/i, /\b(flour|sugar|baking powder|baking soda|salt|cocoa|cornstarch|oats|cornmeal|yeast|spice)\b/i],
  [/\bwet ingredients\b/i, /\b(milk|buttermilk|eggs?|butter|oil|vanilla|water|cream|yogurt|honey|syrup)\b/i],
  [/\b(fresh )?herbs\b/i, /\b(parsley|basil|cilantro|thyme|rosemary|dill|mint|chives|sage|tarragon)\b/i],
  [/\b(the )?meats?\b/i, /\b(beef|pork|chicken|turkey|sausage|lamb|veal|chorizo|bison)\b/i],
  [/\bcheeses?\b/i, /\b(cheddar|mozzarella|parmesan|parmigiano|jack|gruy[eè]re|cheese|ricotta|feta|provolone|american|swiss|fontina|pecorino)\b/i],
  [/\b(garnish(es)?|toppings?)\b/i, /./]
];
function sing(w){ return w.replace(/ies$/,"y").replace(/(oes|ches|shes|sses|xes)$/,m=>m.slice(0,-2)).replace(/([^s])s$/,"$1"); }
function wordRe(w){ return new RegExp("\\b"+sing(w).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"(?:e?s)?\\b","i"); }
function phraseRe(p){
  const ws = p.split(/\s+/); const last = ws.pop();
  const pre = ws.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("\\s+");
  return new RegExp("\\b"+(pre? pre+"\\s+" : "")+sing(last).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"(?:e?s)?\\b","i");
}

/* ============================================================
   Recipe model
   r = { id, name, url, color, ings:[raw], steps:[{sents:[{t,m,pre}]}], over:{}, prepOver:null }
   ============================================================ */
function flatSteps(ri){
  const out = [];
  const add = x=>{
    if (!x) return;
    if (typeof x === "string") {
      let t = x;
      if (/\n/.test(t)) return t.split(/\n+/).forEach(add);
      t = decode(t);
      if (/(^|\s)\d+[.)]\s+\S/.test(t) && (t.match(/(^|\s)\d+[.)]\s/g)||[]).length > 1) {
        t.split(/(?:^|\s)(?=\d+[.)]\s)/).forEach(p=>{ p=p.replace(/^\d+[.)]\s*/,"").trim(); if (p) out.push(p); });
        return;
      }
      t = t.replace(/^(step\s*)?\d+[.):]\s*/i,"").trim();
      if (t) out.push(t);
      return;
    }
    if (Array.isArray(x)) return x.forEach(add);
    if (x.itemListElement) return add(x.itemListElement);
    if (x.text) return add(x.text);
    if (x.name) return add(x.name);
  };
  add(ri);
  return out;
}
function buildRecipe({name, url, ingredients, steps, yld}){
  const st = steps.map(text=>({ sents: sentences(text).map(t=>{
    const pre = /\bpre-?heat\b/i.test(t);
    const d = durMin(t);
    return { t, m: pre ? 0 : (d || 2), timed: !!d && !pre, pre };
  })})).filter(x=>x.sents.length);
  return {
    id: "r" + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    name: (name || "Untitled recipe").trim(),
    url: url || "",
    yld: yld || "",
    ings: ingredients.map(i=>decode(i)).filter(i=>i && !/:\s*$/.test(i)),
    steps: st,
    over: {}, prepOver: null
  };
}
function fromJsonLd(r, url){
  const ings = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : [r.recipeIngredient]).filter(Boolean);
  const y = Array.isArray(r.recipeYield) ? r.recipeYield.find(v=>/\d/.test(String(v))) || r.recipeYield[0] : r.recipeYield;
  return buildRecipe({ name: decode(r.name), url, ingredients: ings, steps: flatSteps(r.recipeInstructions), yld: y ? decode(String(y)) : "" });
}
function fromText(text, fallbackName){
  const lines = text.split(/\r?\n/).map(l=>l.trim());
  let mode = null, title = "", ings = [], steps = [];
  const isIngHead = l=>/^(ingredients?)\s*:?$/i.test(l);
  const isStepHead = l=>/^(instructions?|directions?|method|preparation|steps|how to make( it)?)\s*:?$/i.test(l);
  const isStopHead = l=>/^(notes?|cook'?s notes?|nutrition( facts| info(rmation)?)?|reviews?|comments?|related( recipes)?|you might also like|more recipes|tips|faqs?|storage)\s*:?$/i.test(l);
  const hasHeads = lines.some(isIngHead) && lines.some(isStepHead);
  for (const l of lines) {
    if (!l) continue;
    if (isIngHead(l)) { mode = "i"; continue; }
    if (isStepHead(l)) { mode = "s"; continue; }
    if (hasHeads && isStopHead(l) && mode === "s" && steps.length) { mode = null; continue; }
    const clean = l.replace(/^[-•*▢☐□]\s*/,"");
    if (!hasHeads) {
      if (!title && !/^\d/.test(clean)) { title = clean; continue; }
      if (/^([\d½⅓⅔¼¾⅛]|a pinch|salt|pinch)/i.test(clean) && clean.length < 120 && !/^\d+[.)]\s/.test(clean)) ings.push(clean);
      else steps.push(clean.replace(/^(step\s*)?\d+[.):]\s*/i,""));
      continue;
    }
    if (mode === "i") ings.push(clean);
    else if (mode === "s") steps.push(clean.replace(/^(step\s*)?\d+[.):]\s*/i,""));
    else if (!title) title = clean;
  }
  return buildRecipe({ name: title || fallbackName, ingredients: ings, steps: steps.filter(s=>s.length > 3) });
}

function cap(s){ s = String(s||""); return s.charAt(0).toUpperCase() + s.slice(1); }
function fmtDur(m){ m=Math.round(m); const h=Math.floor(m/60), mm=m%60; return h ? h+" hr"+(mm? " "+mm+" min":"") : mm+" min"; }
