// candados.js · reglas fijas, SIN modelo de lenguaje (regla 4 de la casa:
// lo crítico es determinista). Si una regla duda, gana la seguridad de la
// cuidadora en crisis y de la niña; en lo demás, precisión sobre cobertura.
//
// - detectarCrisis(texto, contexto)   -> { detectado, motivo }
// - detectarMaltrato(texto)           -> { detectado, motivo }
// - filtrarDiagnostico(respuesta)     -> { bloqueado, motivo }
// - verificarCitas(respuesta, frags)  -> { ok, falla, motivo, citas, invalidas }  (regla v2, 2026-11-02)
// - datosQueExigenCita(respuesta)     -> [motivos]  (datos de Colombia y cifras de instrumentos)

import { normalizar, normalizarEscritura } from "./texto.js";

// ---------------------------------------------------------------- crisis
// Se busca sobre el texto con la ortografía normalizada (normalizarEscritura: minúsculas,
// sin tildes, sin letras repetidas, «k» -> «qu»), así "no quiero vivir", "NO QUIERO VIVÍR"
// y "no kiero vivirrr" cuentan igual.
//
// 2026-11-10 · auditoría externa (H-01 y H-05). Cada regla dice de quién habla:
//   "yo"    = la cuidadora habla de sí misma («me quiero morir», «ya no puedo más»);
//   "ella"  = la cuidadora cuenta el riesgo de otra persona («quiere morirse», «se corta los brazos»).
// Las frases en primera persona también pueden venir citadas («Mi hija dijo: “me quiero morir”»):
// eso lo decide sujetoCrisis(), más abajo. Controles inocuos que NO deben saltar (precisión):
// «me muero de la risa», «se me desaparecen las medias», «ya no puedo más con el tráfico»,
// «voy a cortarme el pelo», «quiero desaparecer del grupo de WhatsApp», «no sé qué hacer cuando grita».
// Decisión: «no sé qué hacer» SOLO no es crisis (es la pregunta más común de una cuidadora); sí lo es
// «no sé qué hacer con mi vida». Versión anterior: candados.js.bak_2026-11-10 y git (190a5b9).
const NO_ES_RIESGO = "(?:risa|pena|verguenza|amor|ganas|envidia|hambre|sueno|frio|calor|aburrimiento|emocion|felicidad|alegria)";
const COSAS_QUE_ABRUMAN = "(?:trafico|trancon|calor|frio|lluvia|internet|wifi|computador|celular|filas?|tacones|zapatos|bulla del vecino)";
const PELO = "(?:el|las|los|la) (?:pelo|cabello|unas|fleco|flequillo|pelito|barba|unitas|puntas)";
const PATRONES_CRISIS = [
  [/\bsu(?:i)?[cs]id\w*/, "suicidio", "yo"],
  [/\bno quiero (seguir )?vivir\b(?!\s+(en|cerca|lejos|alla|aca|aqui|con mi suegra)\b)/, "no quiero vivir", "yo"],
  [/\bno (quiero|deseo) (seguir )?(existiendo|existir|estar viva|despertar(me)?)\b/, "no quiero existir", "yo"],
  [new RegExp(`\\b(me quiero|quiero|quisiera|quisieramos|me quisiera) morir(me)?\\b(?!\\s+de\\s+(la\\s+)?${NO_ES_RIESGO})`), "quiero morir", "yo"],
  [new RegExp(`\\bganas de morir(me)?\\b(?!\\s+de\\s+(la\\s+)?${NO_ES_RIESGO})`), "ganas de morir", "yo"],
  // Añadido 2026-11-02 por decisión de Santiago; revisado y aprobado por la terapeuta el 2026-11-08.
  // 2026-11-10: no salta con «ya no puedo más de la risa» ni «ya no puedo más con el tráfico».
  [new RegExp(`\\bya no puedo mas\\b(?!\\s+(de\\s+(la\\s+)?${NO_ES_RIESGO}|con\\s+(el|la|los|las|este|esta|tanto|tanta)\\s+${COSAS_QUE_ABRUMAN})\\b)`), "ya no puedo más", "yo"],
  [/\b(estaria|estariamos|estaremos) mejor muert[ao]s?\b|\bmejor muert[ao]\b/, "mejor muerta", "yo"],
  [/\bquitarme la vida\b|\bme quito la vida\b/, "quitarme la vida", "yo"],
  [/\b(acabar|terminar) con (mi vida|todo esto de una vez|mi existencia)\b/, "acabar con mi vida", "yo"],
  [/\b(hacerme|me voy a hacer|me hago|me he hecho) (dano|danio)\b/, "hacerme daño", "yo"],
  [new RegExp(`\\b(lastimarme|cortarme(?! ${PELO})|me corto las venas|me voy a matar|me quiero matar|(matarme|me mato)(?! (trabajando|estudiando|de la risa|de risa|en el gimnasio|haciendo)))\\b`), "autolesión", "yo"],
  [new RegExp(`\\bya no aguanto (mas|nada)\\b(?!\\s+(de\\s+(la\\s+)?${NO_ES_RIESGO}|con\\s+(el|la|los|las|este|esta)\\s+${COSAS_QUE_ABRUMAN})\\b)`), "ya no aguanto más", "yo"],
  [/\bno aguanto (mas )?(vivir|esta vida|la vida|seguir viva|seguir viviendo)\b/, "no aguanto más vivir", "yo"],
  [/\b(tomarme|me tomo|me tome) (todas )?las pastillas\b/, "pastillas", "yo"],
  [/\b(quiero|quisiera|me gustaria|ojala pudiera|ganas de|me provoca|deseo|solo quiero) desaparecer(me)?\b(?!\s+(del?|un|una)\s+(grupo|chat|whatsapp|redes|facebook|instagram|tiktok|rato|ratico|ratito|momento|fin de semana|reunion|fiesta)\b)|\bdesaparecer para siempre\b/, "desaparecer", "yo"],
  [/\b(dormir(me)?|acostarme) y (ya )?no (volver a )?despertar(me)?\b|\bno (quisiera|quiero) (volver a )?despertar(me)?\b|\bojala no (despertar|despertara|despierte)\b/, "dormir y no despertar", "yo"],
  [/\b(estaria|estarian|estarias|estaremos|vivirian|viviria|seria|serian|quedarian) (todos |ustedes |ellos |ellas )?mejor sin mi\b/, "estarían mejor sin mí", "yo"],
  [/\b(yo )?mejor no (estaria|existiria|existir)\b|\bno deberia (estar viva|existir|seguir aqui|haber nacido)\b|\bojala no hubiera nacido\b|\bseria mejor (que yo )?no (estar|existir|haber nacido)\b|\bseria mejor si (yo )?no (estuviera|existiera)\b/, "mejor no estaría", "yo"],
  [/\bya no quiero (estar|seguir) (viva|aqui|en este mundo|mas aqui|mas en este mundo)\b|\bya no quiero (estar|seguir)\s*([.,;!?]|$)/, "ya no quiero estar", "yo"],
  [/\b(no vale la pena|para que) (vivir|seguir viviendo|seguir viva)\b|\b(mi vida|vivir) (ya )?no tiene sentido\b|\bno tiene sentido (vivir|seguir viviendo|seguir viva)\b/, "vivir no tiene sentido", "yo"],
  [/\bno se que h?acer con mi vida\b/, "no sé qué hacer con mi vida", "yo"],
  [/\b(estoy|estamos) en peligro\b(?!\s+de\b)/, "en peligro ahora", "yo"],
  // Riesgo de OTRA persona (la niña o adolescente), contado por la cuidadora (H-05).
  [new RegExp(`\\b(quiere|quisiera|queria|desea|deseaba|habla de|hablo de|piensa en|penso en) (morir(se)?|matarse|suicidarse|quitarse la vida|hacerse dano|cortarse(?! ${PELO}))\\b(?!\\s+de\\s+(la\\s+)?${NO_ES_RIESGO})`), "quiere morir (ella)", "ella"],
  [/\bse (quiere|queria|quisiera) (morir|matar|suicidar|quitar la vida)\b|\bse (quiere|queria) (cortar|hacer dano)\b(?! (el|las|los|la) (pelo|cabello|unas|fleco|flequillo))/, "quiere morir (ella)", "ella"],
  [/\b(ya )?no quiere (seguir )?(vivir|existir|estar viva|despertar)\b(?!\s+(en|cerca|lejos|alla|aca|aqui|con)\b)/, "no quiere vivir (ella)", "ella"],
  [/\bse (corta|corto|cortaba|ha cortado|esta cortando|ha estado cortando) (los brazos|las munecas|las piernas|la piel|el brazo|la muneca|la pierna|con)\b|\bse esta cortando\b/, "autolesión (ella)", "ella"],
  [/\b(intento|trato de|ha intentado|quiso) (matarse|suicidarse|quitarse la vida|tomarse (todas )?las pastillas)\b/, "intento (ella)", "ella"],
];

// Quién habla en un mensaje con riesgo (H-05):
//   "tercera"  = la cuidadora cuenta el riesgo de la niña o adolescente («Mi hija dijo: “me quiero morir”»);
//   "primera"  = la cuidadora habla de sí misma;
//   "ambigua"  = no se sabe (aparece otra persona, pero la frase de riesgo no se le atribuye con claridad).
const OTRA_PERSONA = /\b(mi|la|nuestra|una|su|tu|esta|esa) (hija|hijita|nieta|nietecita|alumna|estudiante|nina|ninita|sobrina|adolescente|chica|nena|hijastra|ahijada|hijo|nieto|alumno|sobrino|nino|paciente|bebe|peque)\b|\bella\b/;
const VERBO_QUE_CUENTA = /\b(?:me |nos |le |te )?(dijo|dice|decia|ha dicho|escribio|escribe|escribia|grito|grita|gritaba|conto|confeso|comento|anda diciendo|amenaza|amenazo|repite|repitio|menciono|dibujo|publico|susurro|llora diciendo|lloraba diciendo|habla de|hablo de)\b/g;

function coincidencias(t) {
  const r = [];
  for (const [patron, motivo, quien] of PATRONES_CRISIS) {
    const m = patron.exec(t);
    if (m) r.push({ motivo, quien, indice: m.index });
  }
  return r;
}

// ¿La frase de riesgo que empieza en «indice» es una cita de lo que dijo otra persona?
// Sí, si antes aparece otra persona y un verbo de decir, y entre ese verbo y la frase hay
// a lo sumo 2 palabras (p. ej. «que», «anoche») y ninguna es «yo».
function esCitaDeOtra(t, indice) {
  const antes = t.slice(0, indice);
  if (!OTRA_PERSONA.test(antes)) return false;
  let ultimo = null;
  for (const m of antes.matchAll(VERBO_QUE_CUENTA)) ultimo = m;
  if (!ultimo) return false;
  const entre = antes.slice(ultimo.index + ultimo[0].length).match(/[a-z]+/g) || [];
  return entre.length <= 2 && !entre.includes("yo");
}

export function sujetoCrisis(texto) {
  const t = normalizarEscritura(texto);
  const lista = coincidencias(t);
  if (!lista.length) return null;
  const deElla = lista.some((c) => c.quien === "ella");
  const propias = lista.filter((c) => c.quien === "yo" && !esCitaDeOtra(t, c.indice));
  if (!propias.length) return "tercera";
  if (deElla || OTRA_PERSONA.test(t)) return "ambigua";
  return "primera";
}

// Ítem 9 del PHQ-9: cualquier valor > 0 es alerta. Acepta números y palabras.
export function valorRespuestaEscala(texto) {
  const t = normalizar(texto).trim();
  const num = t.match(/^\s*([0-3])\b/);
  if (num) return Number(num[1]);
  if (/\b(nunca|ningun|ninguno|para nada|nada)\b/.test(t)) return 0;
  if (/\bmas de la mitad\b/.test(t)) return 2;
  if (/\b(casi todos|todos los dias|siempre|casi siempre)\b/.test(t)) return 3;
  if (/\b(varios dias|algunos dias|a veces|unos dias)\b/.test(t)) return 1;
  return null;
}

// -> { detectado, motivo, sujeto }   sujeto: "primera" | "tercera" | "ambigua" | null
export function detectarCrisis(texto, contexto = {}) {
  const t = normalizarEscritura(texto);
  if (contexto && contexto.enItemPHQ9) {
    const v = valorRespuestaEscala(texto);
    if (v !== null && v > 0) return { detectado: true, motivo: `PHQ-9 ítem 9 = ${v}`, sujeto: "primera" };
  }
  const lista = coincidencias(t);
  if (lista.length) return { detectado: true, motivo: lista[0].motivo, sujeto: sujetoCrisis(texto) };
  return { detectado: false, motivo: null, sujeto: null };
}

// ---------------------------------------------------------------- maltrato
// Solo frases donde ALGUIEN le hace daño a la niña. No cuentan "mi hija me
// pega" ni "se golpea la cabeza" (pueden ser conductas de la niña, no maltrato).
const PATRONES_MALTRATO = [
  [/\b(le|les) (pega|pegan|pegaba|pegaban|pego|pegue|pegamos|dan golpes|da golpes|daba golpes|dio golpes|dieron golpes|da correa|dan correa|da rejo|da chancla|da palo|dan palo)\b/, "golpes a la niña"],
  [/\bla (golpea|golpean|golpeaba|golpeaban|golpeo|golpee|golpeamos|maltrata|maltratan|maltrataba|maltrataban|quema|queman|quemo|amarra|amarran|amarraba|ahorca|ahorcan|patea|patean|pateo)\b/, "maltrato físico a la niña"],
  [/\b(golpearla|pegarle|maltratarla|quemarla|amarrarla|patearla)\b/, "maltrato físico a la niña"],
  [/\babus\w*\s+(sexual\w*|de ella|de mi hija|de mi nieta|de la nina)\b|\babusaron de\b|\babusa de\b|\babusan de\b/, "abuso", "sexual"],
  [/\bla (toca|tocan|tocaba|tocaban|toco) (en )?(sus partes|indebidamente|sus partes intimas|donde no)\b/, "abuso sexual", "sexual"],
  [/\b(maltrato|maltratan|maltrata) (a|hacia|contra) (la nina|mi hija|mi nieta|la bebe|mi bebe)\b/, "maltrato a la niña"],
  [/\bviolencia sexual\b/, "violencia sexual", "sexual"],
  [/\bviolencia intrafamiliar\b/, "violencia"],
  [/\b(hacerle dano|lastimarla|hacerle algo malo) a (la nina|mi hija|mi nieta)\b|\b(ganas|miedo|temo) (de )?(hacerle dano|lastimarla|pegarle|golpearla)\b/, "riesgo de daño a la niña"],
  [/\bla (abandonaron|abandona|abandonan|abandono)\b/, "abandono de la niña"],
  // 2026-11-10 · auditoría externa (H-02): contacto o tocamientos no consentidos y abuso sexual
  // dicho de forma indirecta. Siempre con un calificativo («sin su permiso», «sus partes», «cosas
  // que no le gustan»…), para no saltar con «le toca lavar los platos» o «se toca» (conducta propia).
  // «le toca lavar» (= es su turno) no cuenta: tras «toca» no puede venir un verbo en infinitivo.
  [/\b(la|le|les) (toca|tocan|tocaba|tocaban|toco|tocaron|ha tocado|han tocado|manosea|manosean|manoseaba|manoseo|manosearon|acaricia|acarician|acariciaba|besa|besan|besaba)\b(?!\s+[a-z]+(ar|er|ir)\b)[^.!?\n]{0,40}?\b(sin (su )?permiso|sin que (ella )?quiera|aunque (ella )?no quiere|donde no (debe|debia|le gusta)|(sus|las) partes( intimas| privadas)?|sus intimidades|indebidamente|a escondidas|de forma rara|de manera rara|(por )?debajo de (la|su) ropa)\b/, "contacto no consentido", "sexual"],
  [/\b(la|le|les) (toca|tocan|tocaba|tocaban|toco|tocaron|ha tocado|han tocado) (sus|las) (partes|nalgas|senos|pechos|piernas)\b/, "contacto no consentido", "sexual"],
  [/\b(le|la|les) (hace|hacen|hacia|hacian|hizo|hicieron|ha hecho|han hecho) cosas (que no le gusta(n|ban)?|que no le gustaron|raras|feas|de adultos|sexuales|en sus partes)\b/, "contacto no consentido", "sexual"],
  [/\b(le|les) (mostro|muestra|muestran|mostraron|ensena|enseno|ensenaron|pasa|paso|manda|mando|mandaron|envia|envio|pone|puso) (videos|fotos|imagenes|peliculas|cosas|paginas)( de| para)? (adultos|porno\w*|sexuales|de sexo|desnud\w*)\b|\ble (mostro|muestra|muestran|mostraron|ensena|enseno|pone|puso) (pornografia|porno)\b/, "material sexual a la niña", "sexual"],
  [/\b(le|la) (pide|piden|pidio|pidieron|pedia|obliga|obligan|obligo) (a )?(mandar |enviar |tomarse )?(fotos|videos) (desnuda|sin ropa|intimas?|en ropa interior)\b|\b(la|le) (obliga|obligan|obligo|obligaron) a (tocarlo|tocarla|tocarle|desvestirse|quitarse la ropa|ver (videos|peliculas|fotos) (de adultos|porno\w*))\b/, "explotación o abuso sexual", "sexual"],
  [/\bla (violaron|violo|viola|violan|violaba)\b|\bviolacion sexual\b|\b(acoso|abuso) sexual\b|\b(la|le) acosa(n|ba|ban|ron)? sexualmente\b/, "abuso sexual", "sexual"],
];

// -> { detectado, motivo, tipo }   tipo: "sexual" (respuesta de protección sin pedir detalles) | "maltrato"
export function detectarMaltrato(texto) {
  const t = normalizarEscritura(texto);
  for (const [patron, motivo, tipo] of PATRONES_MALTRATO) {
    if (patron.test(t)) return { detectado: true, motivo, tipo: tipo || "maltrato" };
  }
  return { detectado: false, motivo: null, tipo: null };
}

// ---------------------------------------------------------------- puntajes (H-14)
// Pedidos de puntaje, nivel o porcentaje sobre la neurodivergencia («Del 1 al 10, ¿qué tan
// autista es?», «¿Qué nivel de autismo tiene?»). Respuesta fija (prompt.RESPUESTA_PUNTAJE), sin modelo.
// No salta con «¿Qué tan común es el autismo en niñas?» ni con la escala de dolor de «Sus ciclos».
const TEMA_ND = /\bautis\w*|\btea\b|\btdah\b|\bespectro\b|\bneurodivergen\w*|\basperger\b|\bhiperactiv\w*/;
const ESCALA = /\b(del?|en una escala del?) \d+ (al?|hasta el?) \d+\b|\bescala\b/;
const PIDE_PUNTAJE = [
  /\bque tan (autista|neurodivergente|hiperactiva|tdah|asperger|dentro del espectro)\b/,
  /\bque tan (grave|severo|severa|fuerte|leve|alto|alta|profundo|avanzado) (es |esta |seria )?(su |el )?(autismo|tea|tdah|espectro)\b/,
  /\b(que|cual|cuanto|cuanta)( es)?( su| el)? (nivel|grado|porcentaje|puntaje|puntuacion|calificacion)( de| del)? (autismo|tea|tdah|espectro|neurodivergencia|autista|asperger)\b/,
];
export function pidePuntaje(texto) {
  const t = normalizarEscritura(texto);
  if (!TEMA_ND.test(t)) return false;
  if (PIDE_PUNTAJE.some((p) => p.test(t))) return true;
  // Una escala («del 1 al 10») y el tema en la misma frase.
  return t.split(/[.!?\n]/).some((f) => ESCALA.test(f) && TEMA_ND.test(f));
}

// ---------------------------------------------------------------- diagnóstico (salida)
// Se busca en minúsculas CON tildes, porque "sí tiene autismo" (afirmación)
// no es lo mismo que "si tiene autismo" (condicional: "no puedo decirte si...").
const PATRONES_DIAGNOSTICO = [
  [/\bsí,?\s+(tiene|presenta|es)\s+(autismo|tea\b|autista|un trastorno del espectro)/, "afirma autismo"],
  [/\bno\s+(tiene|presenta)\s+(autismo|tea\b|un trastorno del espectro)/, "descarta autismo"],
  [/\b(es|son)\s+(claramente\s+|seguramente\s+|probablemente\s+|definitivamente\s+)?autistas?\b/, "afirma que es autista"],
  [/\bno\s+es\s+autista\b/, "descarta que sea autista"],
  [/\bprobabilidad(es)?\s+(alta\s+|baja\s+)?(de\s+)?(que\s+(tenga|sea)\s+)?(autismo|tea\b|autista)/, "probabilidad de autismo"],
  [/\b(muy\s+)?probable\s+que\s+(tenga\s+(autismo|tea\b)|sea\s+autista)/, "probabilidad de autismo"],
  [/\bpuntaje\s+(de|en|del)\s+(el\s+)?(autismo|tea\b|m-?chat|espectro)/, "puntaje de autismo"],
  [/\d+\s*%[^.\n]{0,40}(autismo|\btea\b|autista|espectro)|(autismo|\btea\b|autista|espectro)[^.\n]{0,40}\d+\s*%/, "porcentaje junto a autismo"],
  [/\bcumple\s+(con\s+)?(los\s+|todos\s+los\s+)?criterios\b/, "cumple criterios"],
  [/\b(tiene|presenta)\s+(rasgos|signos|síntomas)\s+(claros\s+)?(de\s+autismo|autistas|de\s+tea\b)/, "atribuye rasgos de autismo"],
  // 2026-11-10 (guía de lenguaje de Natalia): «está / no está dentro del espectro» y
  // «presenta / no presenta / tiene autismo, TDAH o una neurodivergencia» sobre ella.
  [/\bno\s+est[aá]\s+dentro\s+del\s+espectro/, "descarta el espectro"],
  [/\b(sí,?\s+)?est[aá]\s+(claramente\s+|seguramente\s+|probablemente\s+|definitivamente\s+)?dentro\s+del\s+espectro/, "afirma que está dentro del espectro"],
  [/\b(no\s+)?(presenta|tiene|padece|sufre\s+de)\s+(claramente\s+|seguramente\s+|probablemente\s+)?(autismo|tea\b|tdah\b|una\s+neurodivergencia|otra\s+neurodivergencia|neurodivergencia|un\s+trastorno\s+del\s+espectro|trastorno\s+del\s+espectro)/, "atribuye o descarta una neurodivergencia"],
  [/\b(es|son)\s+(claramente\s+|seguramente\s+|probablemente\s+|definitivamente\s+)?neurodivergentes?\b/, "afirma que es neurodivergente"],
];

// Frases cercanas (antes de la coincidencia) que indican que el modelo está
// diciendo justamente que NO puede diagnosticar: no se bloquean.
const SALVEDADES = /(no\s+(te\s+)?puedo|no\s+podemos|no\s+es\s+posible|no\s+se\s+puede|nadie\s+(te\s+)?puede|solo\s+(un|una)\b|sólo\s+(un|una)\b|\bsi\s+tiene\s+o\b|decir(te|le)?\s+si\b|saber\s+si\b|determinar\s+si\b|determinamos\s+si\b|confirmar\s+si\b|no\s+significa|no\s+sé\s+si\b|no\s+lo\s+sé|no\s+diagnosticamos)/;
// 2026-11-10 · Salvedades pegadas a la coincidencia (precisión sobre cobertura):
// - sujeto genérico: «cuando una niña está dentro del espectro…», «muchas adolescentes que presentan…»;
// - eco de lo que contó la cuidadora: «como nos cuentas que tu hija está dentro del espectro…».
const SUJETO_GENERICO = /\b(una|cada|cualquier|toda|muchas|algunas|las|otras)\s+(niñas?|adolescentes?|personas?|chicas?)(\s+o\s+adolescentes?)?\s+(que\s+)?$/;
const ECO_DE_LA_CUIDADORA = /\b(como|según)\s+(nos|me)\s+(cuentas|contaste|dices|dijiste|indicas)(\s+que)?\s+((tu|la|su)\s+(hija|nieta|niña|adolescente|alumna|estudiante)\s+|ella\s+)?$/;

export function filtrarDiagnostico(respuesta) {
  const t = String(respuesta ?? "").toLowerCase();
  for (const [patron, motivo] of PATRONES_DIAGNOSTICO) {
    const g = new RegExp(patron.source, "g");
    let m;
    while ((m = g.exec(t)) !== null) {
      const antes = t.slice(Math.max(0, m.index - 70), m.index);
      // Condicional "si (tu hija) es autista": un "si" sin tilde hasta 3 palabras
      // antes no es afirmación. ("creo que es autista" sí se bloquea.)
      const condicional = /(^|[^\p{L}])si\s+(\S+\s+){0,3}$/u.test(antes) || /(^|[^\p{L}])si\s*$/u.test(antes);
      // «…está dentro del espectro autista o presenta otra neurodivergencia»: la segunda mitad
      // sigue la suerte de la primera, que ya se revisó como coincidencia propia.
      const segundaMitad = /dentro\s+del\s+espectro(\s+autista)?,?\s+o\s+(no\s+)?$/.test(antes);
      const generico = SUJETO_GENERICO.test(antes) || ECO_DE_LA_CUIDADORA.test(antes) || segundaMitad;
      if (!SALVEDADES.test(antes) && !condicional && !generico) {
        return { bloqueado: true, motivo: `${motivo}: «${m[0].trim()}»` };
      }
      if (m.index === g.lastIndex) g.lastIndex++;
    }
  }
  return { bloqueado: false, motivo: null };
}

// ---------------------------------------------------------------- citas (spec v2, 2026-11-02)
// REGLA v2 (spec.md, «v2 · Experta conversacional», punto 4). La agente puede
// conversar, acompañar y explicar autismo, desarrollo, crianza y autocuidado con
// su conocimiento general SIN cita. La verificación bloquea solo dos cosas:
//   (a) una cita [fuente: id] cuyo id no está entre los fragmentos de este turno;
//   (b) un dato de Colombia o una cifra de instrumento, si la respuesta no trae
//       NINGUNA cita. Cuenta como dato (frase por frase, texto sin tildes):
//       - ley, decreto, resolución o sentencia CON número («Ley 2628»), o «por ley» /
//         «la ley obliga, establece, ordena, exige, garantiza…»;
//       - tutela como trámite: en la misma frase hay pasos o plazos (número, días,
//         plazo, juez, juzgado, radicar, requisitos, fallo, impugnar, desacato);
//       - EPS o Supersalud como trámite: en la misma frase hay derecho de petición,
//         queja, reclamo, PQR, autorización, negativa por escrito, plazo, número,
//         «está obligada», «tiene que / debe darte…», MIPRES, copago, etc.;
//       - ICBF como trámite: restablecimiento de derechos, PARD, defensor(ía) de
//         familia, proceso, medida de protección, plazo o número (no basta
//         «llama al ICBF, línea 141»: eso es remisión de seguridad y siempre pasa);
//       - teléfono de más de 3 dígitos (01 8000…, 7 o más dígitos seguidos, o
//         «línea / teléfono / llama al» + 4 o más dígitos);
//       - puntaje, rango o punto de corte de un instrumento (PHQ, GAD, M-CHAT,
//         DSM, CIE): la frase nombra el instrumento y trae otra cifra.
// NO bloquea: saludos, apoyo emocional, explicaciones generales, señales en
// general, «habla con tu EPS», «pregúntale al pediatra», las líneas 106/123/141,
// ni una frase que dice «no lo sé / no sé» sin dar cifras.
// Precisión sobre cobertura: ante la duda, deja pasar (lo crítico de verdad
// —crisis, maltrato, diagnóstico— lo cubren los otros candados).
const PATRON_CITA = /\[\s*fuente\s*:\s*([^\]]+)\]/gi;
// Formas en que el agente reconoce que no sabe un dato o no puede darlo (2026-11-02:
// ampliada con las formas naturales de la v2: «no te lo puedo dar», «no tengo los
// teléfonos», «no puedo decirte si…», «no lo sabemos con certeza»).
const FRASE_NO_SE = /no lo s[eé]|no (te |se )?lo (puedo|podr[ií]a) (dar|decir)|no puedo (decirte|afirmarte|asegurarte)|no tengo (esa |esta |los |las |el |la )?(informaci[oó]n|dato|datos|tel[eé]fonos?|n[uú]meros?|cifra)|no est[aá] en (mi|la) biblioteca|no lo sabemos/i;
// Variante por frase, sobre texto normalizado: la frase declara no saber.
const FRASE_NO_SE_NORM = /\b(no lo se|no se (el|la|los|las|cual|cuanto|cuantos|exactamente|con certeza)|no tengo (ese|esa|esos|el) (dato|numero|informacion)|no conozco)\b/;
// Líneas de ayuda que el agente siempre puede dar (no son «datos sin fuente»).
const LINEAS_DE_AYUDA = /\b(106|123|141|155|192)\b/g;

// Reglas de (b). Cada una recibe una frase normalizada (sin tildes, minúsculas)
// con las líneas de ayuda ya quitadas, y devuelve true si es un dato que exige cita.
const DATOS_QUE_EXIGEN_CITA = [
  ["ley o norma con número", (f) => /\b(ley|leyes|decreto|decretos|resolucion|resoluciones|circular|acuerdo)\s+(n\S{0,3}\s*)?\d{2,}/.test(f) || /\bsentencia\s+[tcsu]\s*-?\s*\d+/.test(f) || /\barticulo\s+\d+/.test(f)],
  ["afirmación de lo que dice la ley", (f) => /\bpor ley\b|\bla ley (te |le |les )?(dice|obliga|establece|ordena|exige|garantiza|da derecho)\b/.test(f)],
  ["tutela como trámite", (f) => /\btutelas?\b/.test(f) && /\d|\b(plazo|plazos|termino|terminos|dias|horas|semanas|meses|juez|jueza|juzgado|radicar|radica|requisito|requisitos|pasos|fallo|impugnar|impugnacion|desacato)\b/.test(f)],
  ["EPS o Supersalud como trámite", (f) => /\b(eps|supersalud|superintendencia)\b/.test(f) && (/\d/.test(f) || /\b(derecho de peticion|queja|quejas|reclamo|reclamos|pqrs?d?|autorizacion|autorizaciones|negativa por escrito|negacion por escrito|por escrito|plazo|plazos|obligad[ao]s?|tiene que (darte|dar|entregar|autorizar|responder|garantizar)|debe (darte|dar|entregar|autorizar|responder|garantizar)|mipres|copago|copagos|cuota moderadora|portabilidad|traslado de eps|junta medica)\b/.test(f))],
  ["ICBF como trámite", (f) => /\bicbf\b|bienestar familiar/.test(f) && (/\d/.test(f) || /\b(restablecimiento|pard|defensor|defensora|defensoria|proceso|medida de proteccion|medidas de proteccion|plazo|custodia|requisitos)\b/.test(f))],
  ["teléfono", (f) => {
    if (/\b01\s*-?\s*8000\b/.test(f)) return true;
    // Fechas (2026-11-02, 02/11/2026) y años sueltos (2013, 2026) no son teléfonos.
    const g = f.replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(19|20)\d{2}\b/g, " ");
    return /(\d[\s-]?){7,}/.test(g) || /\b(linea|telefono|tel|celular|whatsapp|llama al|llamar al|marca el|marcar el|numero)\b\D{0,15}(\d[\s-]?){4,}/.test(g);
  }],
  ["cifra de instrumento", (f) => {
    if (!/\b(phq|gad|m-?chat|dsm|cie|puntaje|puntajes|puntuacion|punto de corte|puntos de corte)\b/.test(f)) return false;
    // Se quitan los nombres con número («PHQ-9», «GAD-7», «DSM-5», «CIE-11») y se mira si queda otra cifra.
    const sinNombres = f.replace(/\b(phq|gad|dsm|cie|icd)\s*-?\s*\d+\b/g, " ").replace(/\bm-?chat(-?r)?(\/?f)?\b/g, " ");
    return /\d/.test(sinNombres);
  }],
];

// Devuelve los motivos de (b) que aparecen en la respuesta (lista vacía si ninguno).
export function datosQueExigenCita(respuesta) {
  const sinCitas = String(respuesta ?? "").replace(PATRON_CITA, " ");
  const frases = sinCitas.split(/(?<=[.!?;:])\s+|\n+/).map((x) => normalizar(x)).filter((x) => x.trim());
  const motivos = [];
  for (const frase of frases) {
    const f = ` ${frase.replace(LINEAS_DE_AYUDA, " ")} `;
    // Una frase que dice que no sabe el dato, sin dar cifras, no es una afirmación.
    if (FRASE_NO_SE_NORM.test(f) && !/\d/.test(f)) continue;
    for (const [motivo, regla] of DATOS_QUE_EXIGEN_CITA) {
      if (regla(f)) motivos.push(`${motivo}: «${frase.trim().slice(0, 80)}»`);
    }
  }
  return motivos;
}

export function extraerCitas(respuesta) {
  const ids = [];
  for (const m of String(respuesta ?? "").matchAll(PATRON_CITA)) {
    for (const id of m[1].split(/[,;]/)) {
      const limpio = id.trim();
      if (limpio) ids.push(limpio);
    }
  }
  return ids;
}

// verificarCitas(respuesta, fragmentos) -> { ok, falla, motivo, citas, invalidas }
// falla: null | "cita-inexistente" (caso a) | "dato-sin-cita" (caso b).
export function verificarCitas(respuesta, fragmentosEntregados = []) {
  const texto = String(respuesta ?? "");
  const validos = new Set((fragmentosEntregados || []).map((f) => f && f.id_fuente).filter(Boolean));
  const citas = extraerCitas(texto);
  // (a) toda cita debe apuntar a un fragmento entregado en este turno.
  const invalidas = citas.filter((id) => !validos.has(id));
  if (invalidas.length) {
    return { ok: false, falla: "cita-inexistente", motivo: `cita a una fuente que no se entregó: ${invalidas.join(", ")}`, citas, invalidas };
  }
  // (b) datos de Colombia o cifras de instrumentos: exigen al menos una cita en la respuesta.
  if (!citas.length) {
    const motivos = datosQueExigenCita(texto);
    if (motivos.length) {
      return { ok: false, falla: "dato-sin-cita", motivo: `dato de Colombia o cifra de instrumento sin cita · ${motivos.join(" · ")}`, citas, invalidas };
    }
  }
  return { ok: true, falla: null, motivo: null, citas, invalidas };
}

export { FRASE_NO_SE };
