// ---------------------------------------------------------------------------
// La version téléphone du tableau de bord : les calculs, en fonctions pures (essayées dans
// electron/telephone-page.test.cjs, avec Node). Aucune dépendance : ce module marche tel quel dans le navigateur du
// téléphone (`<script type="module">`) et dans Node 22 (WebCrypto et DecompressionStream y sont globaux).
//
// Ce qui vient du PC (le contrat « L'instantané du téléphone » de docs/format-des-donnees.md) est déjà rangé par
// electron/telephone.cjs ; ici, seulement ce qui dépend de l'heure du téléphone : les « il y a 4 min », les jours de
// l'agenda, ce qui ne compte plus passé son `jusqu_au`, la fraîcheur de ce que le PC a envoyé.
// Le français est celui de la grande page (src/app/temps.ts, src/app/accueil-attend.ts) : mêmes mots, mêmes règles.
// ---------------------------------------------------------------------------

/** La version de l'instantané que cette page sait lire. */
export const VERSION_INSTANTANE = 1;
/** Ce qui est lié au chiffrement : la même chaîne que electron/telephone.cjs (`AAD`). */
export const AAD = 'tableau-telephone:v1';

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const texte = (v) => (typeof v === 'string' ? v.trim() : '');
const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const liste = (v) => (Array.isArray(v) ? v : []);
const majuscule = (t) => t.charAt(0).toLocaleUpperCase('fr-FR') + t.slice(1);
const numeroDuJour = (date) => (date.getDate() === 1 ? '1er' : String(date.getDate()));

// ---------------------------------------------------------------------------
// Le temps
// ---------------------------------------------------------------------------

/** Une date ISO 8601 (ou une Date) lue en `Date` ; `null` si elle est illisible. */
export function lireDate(valeur) {
  if (valeur instanceof Date) return Number.isNaN(valeur.getTime()) ? null : valeur;
  if (typeof valeur !== 'string' || valeur.trim() === '') return null;
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Un jour `AAAA-MM-JJ` lu en date locale (minuit) ; `null` s'il n'existe pas (30 février…). */
export function lireJour(jour) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texte(jour));
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return date.getMonth() === Number(m[2]) - 1 && date.getDate() === Number(m[3]) ? date : null;
}

/** Le jour local d'une date, `AAAA-MM-JJ`. */
export function jourLocal(date) {
  const deux = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}`;
}

/** Nombre de jours de calendrier de `date` à `maintenant` (0 : le même jour, 1 : la veille, -1 : le lendemain). */
export function joursDEcart(date, maintenant) {
  const a = Date.UTC(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  const b = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((a - b) / JOUR);
}

/** « 20 h 14 », « 7 h 05 ». */
export function heureFrancaise(date) {
  return `${date.getHours()}\u00a0h\u00a0${String(date.getMinutes()).padStart(2, '0')}`;
}

/** « 15 nov. », « 1er déc. », « 3 mars 2025 » (l'année seulement si ce n'est pas celle de `maintenant`). */
export function dateCourte(valeur, maintenant) {
  const date = lireDate(valeur) ?? lireJour(valeur);
  if (!date) return '';
  const annee = date.getFullYear() === maintenant.getFullYear() ? '' : ` ${date.getFullYear()}`;
  return `${numeroDuJour(date)} ${MOIS_COURTS[date.getMonth()]}${annee}`;
}

/** « aujourd'hui », « hier », « lundi » (moins de 7 jours), « le 12 nov. ». */
export function jourFrancais(date, maintenant) {
  const jours = joursDEcart(date, maintenant);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return 'hier';
  if (jours < 7) return JOURS[date.getDay()];
  return `le ${dateCourte(date, maintenant)}`;
}

/**
 * Le temps écoulé, comme sur la grande page : « à l'instant », « il y a 4 min », « il y a 2 h » (même jour, moins de
 * 12 h), « hier à 23 h 10 », « lundi à 14 h 05 », « le 12 nov. ». Une date illisible donne "".
 */
export function tempsFrancais(valeur, maintenant) {
  const date = lireDate(valeur);
  if (!date) return '';
  const ecart = maintenant.getTime() - date.getTime();
  if (ecart < MINUTE) return "à l'instant";
  if (ecart < HEURE) return `il y a ${Math.floor(ecart / MINUTE)} min`;
  const jour = jourFrancais(date, maintenant);
  if (jour === "aujourd'hui" && ecart < 12 * HEURE) return `il y a ${Math.floor(ecart / HEURE)} h`;
  return jour.startsWith('le ') ? jour : `${jour} à ${heureFrancaise(date)}`;
}

/** « 25 min », « 3 h », « 2 j » (arrondi vers le bas, 1 min au moins). */
export function dureeFrancaise(millisecondes) {
  const minutes = Math.max(1, Math.floor(millisecondes / MINUTE));
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) {
    const reste = minutes % 60;
    return heures < 3 && reste > 0 ? `${heures} h ${String(reste).padStart(2, '0')}` : `${heures} h`;
  }
  return `${Math.floor(heures / 24)} j`;
}

/** « depuis 10 min », « depuis 3 h », « depuis hier », « depuis lundi », « depuis le 12 novembre ». */
export function depuisEnClair(depuis, maintenant) {
  if (!depuis) return '';
  const ecart = maintenant.getTime() - depuis.getTime();
  if (ecart < MINUTE) return 'depuis un instant';
  if (ecart < HEURE) return `depuis ${Math.floor(ecart / MINUTE)} min`;
  const jour = jourFrancais(depuis, maintenant);
  if (jour === "aujourd'hui") return `depuis ${Math.floor(ecart / HEURE)} h`;
  if (jour === 'hier' || !jour.startsWith('le ')) return `depuis ${jour}`;
  const annee = depuis.getFullYear() === maintenant.getFullYear() ? '' : ` ${depuis.getFullYear()}`;
  return `depuis le ${numeroDuJour(depuis)} ${MOIS[depuis.getMonth()]}${annee}`;
}

/** « Mardi 24 novembre » : le titre de la journée, en haut de « Aujourd'hui ». */
export function journeeEnLettres(maintenant) {
  return `${majuscule(JOURS[maintenant.getDay()])} ${numeroDuJour(maintenant)} ${MOIS[maintenant.getMonth()]}`;
}

/** Le titre d'un jour de l'agenda : « Aujourd'hui », « Demain », « Hier », « Jeudi 26 », puis « Lundi 8 déc. ». */
export function titreDuJour(jour, maintenant) {
  const date = lireJour(jour);
  if (!date) return '';
  const ecart = -joursDEcart(date, maintenant);
  if (ecart === 0) return "Aujourd'hui";
  if (ecart === 1) return 'Demain';
  if (ecart === -1) return 'Hier';
  if (ecart > 1 && ecart < 7) return `${majuscule(JOURS[date.getDay()])} ${numeroDuJour(date)}`;
  return `${majuscule(JOURS[date.getDay()])} ${dateCourte(date, maintenant)}`;
}

/**
 * Les espaces insécables du français, pour qu'une ligne étroite ne coupe jamais « 23 h 40 » ni ne laisse un « : » ou
 * un « ? » seul en début de ligne : avant `: ; ! ? »`, après `«`, et autour du « h » des heures.
 */
export function typographie(t) {
  return String(t ?? '')
    .replace(/(\d) h(?= |$|\b)/g, '$1\u00a0h')
    .replace(/(\d\u00a0h) (\d{2})\b/g, '$1\u00a0$2')
    .replace(/ ([:;!?»])/g, '\u00a0$1')
    .replace(/« /g, '«\u00a0');
}

// ---------------------------------------------------------------------------
// Les nombres
// ---------------------------------------------------------------------------

const ENTIERS = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const DECIMAUX = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const UNE_DECIMALE = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nombreFini = (n) => typeof n === 'number' && Number.isFinite(n);

/** « 1 284 » ; « — » quand on ne sait pas (jamais 0 inventé). */
export function nombre(n) {
  return nombreFini(n) ? ENTIERS.format(n) : '—';
}

/** « 1,04 € » ; « — » quand on ne sait pas. */
export function euros(n) {
  return nombreFini(n) ? `${DECIMAUX.format(n)} €` : '—';
}

/** « 12,4 k » au-delà de 10 000, sinon le nombre entier : pour les petites cases. */
export function nombreCourt(n) {
  if (!nombreFini(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `${UNE_DECIMALE.format(n / 1_000_000)} M`;
  if (Math.abs(n) >= 10_000) return `${UNE_DECIMALE.format(n / 1000)} k`;
  return ENTIERS.format(n);
}

/** L'écart à montrer sous un chiffre : « +12 », « +0,12 € », « −3 » ; "" s'il est nul ou inconnu. */
export function ecartEnClair(n, { enEuros = false } = {}) {
  if (!nombreFini(n) || Math.abs(n) < (enEuros ? 0.005 : 0.5)) return '';
  const signe = n > 0 ? '+' : '−';
  const valeur = Math.abs(n);
  return `${signe}${enEuros ? `${DECIMAUX.format(valeur)} €` : ENTIERS.format(valeur)}`;
}

/** Le multiple d'une vidéo : « ×2,4 », « ×0,8 » ; "" sans valeur. */
export function multipleEnClair(valeur) {
  return nombreFini(valeur) ? `×${UNE_DECIMALE.format(valeur)}` : '';
}

/**
 * Le tracé d'une petite courbe (attribut `d` d'un `<path>`) dans une boîte `largeur` × `hauteur` : les cases `null`
 * sont sautées, il faut au moins deux points. "" sinon.
 */
export function traceDeCourbe(valeurs, largeur, hauteur, marge = 2) {
  const points = [];
  liste(valeurs).forEach((v, i) => {
    if (nombreFini(v)) points.push([i, v]);
  });
  if (points.length < 2) return '';
  const n = liste(valeurs).length - 1;
  const min = Math.min(...points.map((p) => p[1]));
  const max = Math.max(...points.map((p) => p[1]));
  const etendue = max - min || 1;
  const x = (i) => marge + (i / n) * (largeur - 2 * marge);
  const y = (v) => hauteur - marge - ((v - min) / etendue) * (hauteur - 2 * marge);
  return points.map(([i, v], k) => `${k === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
}

// ---------------------------------------------------------------------------
// La fraîcheur de ce que le PC a envoyé
// ---------------------------------------------------------------------------

/**
 * `ton` : `frais` (le PC a parlé dans les temps), `ancien` (un envoi manque : en veille ?), `vieux` (plus de 3 h).
 * `court` : « il y a 4 min » ; `phrase` : ce que dit le bandeau quand ce n'est pas frais.
 */
export function fraicheur(genereLe, maintenant, battementMs = 30 * MINUTE) {
  const date = lireDate(genereLe);
  if (!date) return { ton: 'vieux', court: '', phrase: "Ton PC n'a encore rien envoyé." };
  const age = maintenant.getTime() - date.getTime();
  const court = tempsFrancais(date, maintenant);
  if (age <= battementMs + 15 * MINUTE) return { ton: 'frais', court, phrase: '' };
  const depuis = dureeFrancaise(age);
  const jour = jourFrancais(date, maintenant);
  const quand = jour === "aujourd'hui" ? heureFrancaise(date) : `${jour} à ${heureFrancaise(date)}`;
  const etat = age <= 3 * HEURE ? 'il est peut-être en veille' : 'il est sans doute éteint';
  return {
    ton: age <= 3 * HEURE ? 'ancien' : 'vieux',
    court,
    phrase: `Rien reçu de ton PC depuis ${depuis}\u00a0: ${etat}. Dernières nouvelles\u00a0: ${quand}.`,
  };
}

// ---------------------------------------------------------------------------
// Les noms
// ---------------------------------------------------------------------------

/** Le nom court d'un projet (comme la légende de l'agenda) : sans « Le », « La », « Ton »… en tête, sans parenthèse finale. */
export function nomCourt(nom) {
  const brut = texte(nom);
  let court = brut.replace(/\s*\([^()]*\)\s*$/, '');
  court = court.replace(/^(?:(?:les|le|la|ton|ta|tes)\s+|l['’])/i, '').trim();
  if (!court) return brut;
  return majuscule(court);
}

/** Coupé au mot à `max` signes, « … » ajouté s'il a été coupé. */
export function couperAuMot(titre, max = 120) {
  const net = texte(titre).replace(/\s+/g, ' ');
  if (net.length <= max) return net;
  let coupe = net.slice(0, max);
  if (net[max] !== ' ') {
    const espace = coupe.lastIndexOf(' ');
    if (espace > 0) coupe = coupe.slice(0, espace);
  }
  return `${coupe.replace(/[\s,;:.\-–—]+$/, '')}…`;
}

// ---------------------------------------------------------------------------
// Ce qui t'attend sur tes pages (les règles de src/app/accueil-attend.ts, lot 22)
// ---------------------------------------------------------------------------

const RELANCE_MS = 3 * JOUR;
/** L'`id` d'une conversation sur le téléphone : 12 signes hex (electron/telephone.cjs, `idDeConversation`). */
const MOTIF_CONVERSATION = /^[0-9a-f]{12}$/;

function vraiJour(v) {
  if (typeof v !== 'string') return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return '';
  const [a, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(a, mois - 1, jour));
  return d.getUTCFullYear() === a && d.getUTCMonth() === mois - 1 && d.getUTCDate() === jour ? v : '';
}

function elementSur(element) {
  if (!estObjet(element)) return null;
  const genre = element.genre;
  const pageUrl = texte(element.page_url);
  if ((genre !== 'choix' && genre !== 'geste') || !pageUrl) return null;
  const repondu = texte(element.repondu_le) ? element.repondu_le : null;
  return {
    genre,
    cle: `${pageUrl}:${texte(element.id)}`,
    projet: texte(element.projet),
    pageUrl,
    pageTitre: texte(element.page_titre),
    conversation: MOTIF_CONVERSATION.test(texte(element.conversation)) ? texte(element.conversation) : '',
    titre: texte(element.titre) || (genre === 'choix' ? 'Un choix sans titre' : 'Un geste sans titre'),
    detail: texte(element.detail),
    reponse: texte(element.reponse),
    depuis: lireDate(texte(element.depuis)),
    repondu: repondu ? lireDate(repondu) : null,
    estRepondu: repondu !== null,
    facultatif: element.facultatif === true,
    attendDe: texte(element.attend_de).replace(/\s+/g, ' '),
    ensemble: texte(element.ensemble).replace(/\s+/g, ' '),
    jusquAu: vraiJour(element.jusqu_au),
  };
}

function nomDuProjetAttend(s, liens) {
  if (!s.projet) return s.pageTitre || 'Ta page';
  const noms = estObjet(liens?.noms) ? liens.noms : {};
  return nomCourt(Object.hasOwn(noms, s.projet) ? noms[s.projet] : s.projet);
}

function debutDeMeta(s, nom, liens) {
  const pieces = [nom];
  const suivis = estObjet(liens?.suivis) ? liens.suivis : {};
  const suivi = s.projet && Object.hasOwn(suivis, s.projet) ? suivis[s.projet] : '';
  if (s.projet && s.pageTitre && suivi !== s.pageUrl && s.pageTitre !== nom) pieces.push(s.pageTitre);
  return pieces;
}

function ligneAttend(s, meta, liens, extra = {}) {
  const titre = couperAuMot(s.titre);
  return {
    cle: s.cle,
    titre,
    titreEntier: titre === s.titre ? '' : s.titre,
    meta,
    page: s.pageUrl,
    genre: s.genre,
    detail: s.detail,
    projet: s.projet,
    projetNom: nomDuProjetAttend(s, liens),
    elements: [s],
    ...extra,
  };
}

function ligneEnAttente(s, liens, maintenant) {
  const pieces = debutDeMeta(s, nomDuProjetAttend(s, liens), liens);
  pieces.push(s.genre === 'choix' ? 'un choix' : 'un geste');
  const depuis = depuisEnClair(s.depuis, maintenant);
  if (depuis) pieces.push(depuis);
  return ligneAttend(s, pieces.join(' · '), liens);
}

function ligneRepondue(s, liens, maintenant) {
  const pieces = debutDeMeta(s, nomDuProjetAttend(s, liens), liens);
  const ecart = s.repondu ? maintenant.getTime() - s.repondu.getTime() : 0;
  if (s.repondu && ecart > RELANCE_MS) {
    pieces.push(`répondu il y a ${Math.floor(ecart / JOUR)} jours, pas encore repris`);
  } else {
    const quand = s.repondu ? tempsFrancais(s.repondu, maintenant) : '';
    pieces.push(quand ? `répondu ${quand}` : 'répondu');
  }
  return ligneAttend(s, pieces.join(' · '), liens, { reponse: s.reponse });
}

const instant = (d) => (d ? d.getTime() : Number.POSITIVE_INFINITY);
const avant = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function enumerer(morceaux) {
  if (morceaux.length <= 1) return morceaux.join('');
  return `${morceaux.slice(0, -1).join(', ')} et ${morceaux[morceaux.length - 1]}`;
}

function nomsDistincts(elements, liens) {
  const noms = [];
  for (const s of elements) {
    const nom = nomDuProjetAttend(s, liens);
    if (!noms.includes(nom)) noms.push(nom);
  }
  return noms;
}

function compteEnClair(choix, gestes) {
  const c = choix > 0 ? `${choix} choix` : '';
  const g = gestes > 0 ? `${gestes} ${gestes === 1 ? 'geste' : 'gestes'}` : '';
  return c && g ? `${c} et ${g}` : c || g;
}

function ligneEnsemble(texteEnsemble, membres, liens, maintenant) {
  const noms = nomsDistincts(membres, liens);
  const montres = noms.slice(0, 3);
  const reste = noms.length - montres.length;
  const projets = reste > 0 ? `${montres.join(', ')} et ${reste} ${reste === 1 ? 'autre' : 'autres'}` : enumerer(montres);
  const choix = membres.filter((s) => s.genre === 'choix').length;
  const pieces = [projets, compteEnClair(choix, membres.length - choix)];
  const depuis = depuisEnClair(membres[0].depuis, maintenant);
  if (depuis) pieces.push(depuis);
  const titre = couperAuMot(texteEnsemble);
  const pages = new Set(membres.map((s) => s.pageUrl));
  return {
    cle: `ensemble:${texteEnsemble.toLowerCase()}`,
    titre,
    titreEntier: titre === texteEnsemble ? '' : texteEnsemble,
    meta: pieces.join(' · '),
    page: pages.size === 1 ? membres[0].pageUrl : '',
    genre: choix > 0 ? 'choix' : 'geste',
    detail: '',
    projet: membres[0].projet,
    projetNom: nomDuProjetAttend(membres[0], liens),
    membres: membres.map((s) => ligneEnAttente(s, liens, maintenant)),
    elements: membres,
  };
}

function lignesDe(elements, liens, maintenant) {
  const tries = [...elements].sort((a, b) => avant(instant(a.depuis), instant(b.depuis)));
  const ensembles = new Map();
  for (const s of tries) {
    if (!s.ensemble) continue;
    const cle = s.ensemble.toLowerCase();
    ensembles.set(cle, [...(ensembles.get(cle) ?? []), s]);
  }
  const lignes = [];
  const faits = new Set();
  for (const s of tries) {
    const cle = s.ensemble.toLowerCase();
    const membres = s.ensemble ? (ensembles.get(cle) ?? []) : [];
    if (membres.length < 2) lignes.push(ligneEnAttente(s, liens, maintenant));
    else if (!faits.has(cle)) {
      faits.add(cle);
      lignes.push(ligneEnsemble(s.ensemble, membres, liens, maintenant));
    }
  }
  return lignes;
}

function lignesRepondues(reponses, liens, maintenant) {
  const parProjet = new Map();
  for (const s of reponses) {
    const cle = s.projet || `page:${s.pageUrl}`;
    parProjet.set(cle, [...(parProjet.get(cle) ?? []), s]);
  }
  return [...parProjet.entries()].map(([cle, reps]) => {
    if (reps.length === 1) return ligneRepondue(reps[0], liens, maintenant);
    const depuis = depuisEnClair(reps[0].repondu, maintenant);
    const pages = new Set(reps.map((s) => s.pageUrl));
    return {
      cle: `repondues:${cle}`,
      titre: nomDuProjetAttend(reps[0], liens),
      titreEntier: '',
      meta: depuis ? `${reps.length} réponses · ${depuis}` : `${reps.length} réponses`,
      page: pages.size === 1 ? reps[0].pageUrl : '',
      genre: 'choix',
      detail: '',
      projet: reps[0].projet,
      projetNom: nomDuProjetAttend(reps[0], liens),
      membres: reps.map((s) => ligneRepondue(s, liens, maintenant)),
    };
  });
}

/**
 * Ce qui t'attend sur tes pages. Un élément dont `jusqu_au` est avant le jour du téléphone ne compte plus (le jour même,
 * il compte). Quatre familles : `lignes` (pour toi), `plusTard` (« si tu veux »), `ailleurs` (on attend quelqu'un),
 * `repondues` (rien à faire). `nombre` compte les choses pour toi (un ensemble compte pour un) ; `projets`, leurs noms.
 */
export function calculerAttend(attend, liens, maintenant) {
  const vide = { vide: true, resume: '', nombre: 0, projets: [], lignes: [], plusTard: [], ailleurs: [], repondues: [] };
  const aujourdhui = jourLocal(maintenant);
  const vus = new Set();
  const surs = [];
  for (const element of liste(attend?.elements)) {
    const s = elementSur(element);
    if (!s || vus.has(s.cle)) continue;
    vus.add(s.cle);
    if (s.jusquAu && s.jusquAu < aujourdhui) continue;
    surs.push(s);
  }
  if (surs.length === 0) return vide;
  const enAttente = surs.filter((s) => !s.estRepondu);
  const repondues = lignesRepondues(
    surs.filter((s) => s.estRepondu).sort((a, b) => avant(instant(a.repondu), instant(b.repondu))),
    liens,
    maintenant,
  );
  const ailleursBruts = enAttente.filter((s) => s.attendDe);
  const plusTardBruts = enAttente.filter((s) => !s.attendDe && s.facultatif);
  const pourToi = enAttente.filter((s) => !s.attendDe && !s.facultatif);
  const lignes = lignesDe(pourToi, liens, maintenant);
  const plusTard = lignesDe(plusTardBruts, liens, maintenant);
  const ailleurs = [...ailleursBruts]
    .sort((a, b) => avant(instant(a.depuis), instant(b.depuis)))
    .map((s) => {
      const l = ligneEnAttente(s, liens, maintenant);
      return { ...l, meta: `attend ${s.attendDe} · ${l.meta}` };
    });
  const projets = nomsDistincts([...pourToi].sort((a, b) => avant(instant(a.depuis), instant(b.depuis))), liens);
  let resume = 'Tu as répondu à tout sur tes pages.';
  if (lignes.length > 0) {
    const montres = projets.slice(0, 4);
    const reste = projets.length - montres.length;
    const noms = reste > 0 ? `${montres.join(', ')} et ${reste} ${reste === 1 ? 'autre projet' : 'autres projets'}` : enumerer(montres);
    resume = `${lignes.length} ${lignes.length === 1 ? 'chose' : 'choses'} pour toi : ${noms}`;
  } else if (plusTard.length > 0 || ailleurs.length > 0) resume = "Rien d'urgent pour toi.";
  return { vide: false, resume, nombre: lignes.length, projets, lignes, plusTard, ailleurs, repondues };
}

// ---------------------------------------------------------------------------
// Une question ne compte qu'une fois (mêmes règles que src/app/une-fois.ts, lot 24-5, plan JS 2.3 et 2.4)
// ---------------------------------------------------------------------------

/** Avec la même conversation, une chose posée jusqu'à 30 min après l'heure où elle t'a rendu la main compte encore. */
export const MARGE_APRES_MS = 30 * MINUTE;
/** Sans conversation (règle B, seulement si `FUSION_ATTEND_AVEC_RENVOI`) : 10 min après la main. */
export const MARGE_SANS_CONVERSATION_MS = 10 * MINUTE;
/** Le tour qui t'a rendu la main : jusqu'à 60 min avant ; plus tôt, c'est une autre demande. */
export const TOUR_MS = 60 * MINUTE;
/** Même Stop : `maj` et `a_toi_le` écrits avec la même heure, à 2 s près. */
export const MEME_STOP_MS = 2000;
/**
 * Une conversation ✋ qui a aussi un « ❓ » du même Stop ne fusionne pas avec les choses de sa page (question 7.1 du plan,
 * posée à Lucas). `true` : la règle B (sans conversation) s'applique aussi, et A perd sa condition « pas de renvoi frais »,
 * comme dans src/app/une-fois.ts : les deux constantes changent ensemble.
 */
export const FUSION_ATTEND_AVEC_RENVOI = false;

const ADRESSE = /(?:\s*:)?\s*[a-z][a-z0-9+.-]*:\/\/[^\s]*[^\s.,;:!?)»…]/gi;
/** Le « ❓ » d'une conversation dit-il encore quelque chose, une fois les adresses retirées (`nettoyerAToi` de la grande page) ? */
const choixNonVide = (choix) => texte(choix).replace(ADRESSE, ' ').replace(/[\s:]+/g, ' ').trim() !== '';

/** Renvoi frais : `a_toi_le` lisible, à 2 s de la main (même Stop), et un « ❓ » non vide. */
function renvoiFrais(c, h) {
  const posee = lireDate(c.a_toi_le);
  return posee !== null && Math.abs(posee.getTime() - h.getTime()) <= MEME_STOP_MS && choixNonVide(c.choix);
}

/** La règle B : sans conversation, la même page (non vide), dans le tour, et pas avant le début de la conversation (moins 10 min). */
function memePageDansLeTour(c, h, depuis, pageUrl) {
  const page = texte(c.page);
  const debut = lireDate(c.debut);
  if (page === '' || page !== pageUrl || !debut) return false;
  const d = depuis.getTime();
  return d >= h.getTime() - TOUR_MS && d <= h.getTime() + MARGE_SANS_CONVERSATION_MS && d >= debut.getTime() - MARGE_SANS_CONVERSATION_MS;
}

/** Une chose posée sur une page est-elle la même affaire que cette conversation ✋ (`memeAffaire`, rang 0) ? */
function memeAffaire(c, h, e, avecRenvoi) {
  if (e.conversation !== '' && e.conversation !== c.id) return false;
  if (!e.depuis) return false;
  const d = e.depuis.getTime();
  if (e.conversation !== '') {
    if (!avecRenvoi && renvoiFrais(c, h)) return false;
    return d >= h.getTime() - TOUR_MS && d <= h.getTime() + MARGE_APRES_MS;
  }
  return avecRenvoi && memePageDansLeTour(c, h, e.depuis, e.pageUrl);
}

/**
 * Une question ne compte qu'une fois : les conversations ✋ (`groupe` « besoin », `etat` « attend ») dont la chose est aussi
 * une ligne « pour toi » de tes pages. Seul le rang 0 existe ici : le téléphone n'additionne pas les conversations finies,
 * leur renvoi ne compte nulle part. Rend `cles` (les clés des lignes de `calculerAttend(...).lignes` qui entrent dans une
 * conversation) et `nombre` (leur nombre : ce qu'il faut retirer de `attend.nombre + besoin`).
 * Dans le doute, aucune fusion : une ligne de page qui va avec deux conversations, une ligne d'ensemble sur plusieurs
 * pages, une conversation avec plus d'une ligne de page qui va avec elle.
 */
export function uneFoisTelephone(conversations, attend, liens, maintenant, options = {}) {
  const avecRenvoi = options.avecRenvoi ?? FUSION_ATTEND_AVEC_RENVOI;
  const cles = new Set();
  const candidates = [];
  for (const c of liste(conversations)) {
    if (!estObjet(c) || c.groupe !== 'besoin' || c.etat !== 'attend' || texte(c.id) === '') continue;
    const h = lireDate(c.maj);
    if (h) candidates.push({ c, h });
  }
  if (candidates.length === 0) return { cles, nombre: 0 };
  const lignes = calculerAttend(attend, liens, maintenant).lignes;
  if (lignes.length === 0) return { cles, nombre: 0 };

  const conversationsDe = new Map();
  const lignesDe = candidates.map(({ c, h }) => {
    const indices = [];
    lignes.forEach((ligne, i) => {
      if (ligne.elements.length === 0 || !ligne.elements.every((e) => memeAffaire(c, h, e, avecRenvoi))) return;
      indices.push(i);
      conversationsDe.set(i, (conversationsDe.get(i) ?? 0) + 1);
    });
    return indices;
  });
  const douteuse = (i) => (conversationsDe.get(i) ?? 0) > 1 || lignes[i].page === '';
  for (const indices of lignesDe) {
    const gardees = indices.filter((i) => !douteuse(i));
    if (indices.length === 1 && gardees.length === 1) cles.add(lignes[gardees[0]].cle);
  }
  return { cles, nombre: cles.size };
}

// ---------------------------------------------------------------------------
// Les conversations
// ---------------------------------------------------------------------------

/**
 * Les conversations du PC rangées pour l'écran : `besoin` (la plus ancienne d'abord : elle attend depuis longtemps),
 * `travail` et `finies` (la plus récente d'abord), avec le temps écoulé en mots.
 */
export function rangerConversations(conversations, maintenant) {
  const rangement = { besoin: [], travail: [], finies: [] };
  for (const c of liste(conversations)) {
    if (!estObjet(c) || !Object.hasOwn(rangement, c.groupe)) continue;
    rangement[c.groupe].push({ ...c, temps: tempsFrancais(c.maj, maintenant) });
  }
  const ms = (c) => lireDate(c.maj)?.getTime() ?? 0;
  rangement.besoin.sort((a, b) => ms(a) - ms(b));
  rangement.travail.sort((a, b) => ms(b) - ms(a));
  rangement.finies.sort((a, b) => ms(b) - ms(a));
  return rangement;
}

// ---------------------------------------------------------------------------
// L'agenda
// ---------------------------------------------------------------------------

/** « 18 h » ou « 10 h 30 » en minutes depuis minuit ; `null` sans heure lisible. */
export function minutesDeLHeure(heure) {
  const m = /(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i.exec(texte(heure));
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  return h > 23 || min > 59 ? null : h * 60 + min;
}

function trierDuJour(a, b) {
  const ma = minutesDeLHeure(a.heure) ?? Number.POSITIVE_INFINITY;
  const mb = minutesDeLHeure(b.heure) ?? Number.POSITIVE_INFINITY;
  return (ma === mb ? 0 : ma < mb ? -1 : 1) || texte(a.titre).localeCompare(texte(b.titre), 'fr');
}

/**
 * L'agenda vu du téléphone, d'après le jour du téléphone (et non celui du PC) :
 * - `bande` : les `joursBande` jours à partir d'aujourd'hui, chacun avec ses couleurs (trois au plus) et son nombre ;
 * - `aRevoir` : ce qui était prévu avant aujourd'hui et n'est ni fait ni annulé ;
 * - `jours` : aujourd'hui puis les jours à venir qui ont quelque chose (`joursMax` au plus d'ici) ;
 * - `sansDate` : ce qui n'a pas encore de jour ; `faits` : ce qui est fait depuis 7 jours au plus.
 * Une date sur plusieurs jours (`debut` … `date`) compte chaque jour de sa période (une fois dans la liste : au jour
 * de sa fin, ou aujourd'hui si elle est en cours).
 */
export function vueAgenda(evenements, maintenant, { joursBande = 14, joursMax = 60 } = {}) {
  const aujourdhui = jourLocal(maintenant);
  const debutDuJour = lireJour(aujourdhui);
  const enJour = (date) => jourLocal(date);
  const plus = (n) => enJour(new Date(debutDuJour.getFullYear(), debutDuJour.getMonth(), debutDuJour.getDate() + n));
  const limite = plus(joursMax);
  const aRevoir = [];
  const sansDate = [];
  const faits = [];
  const parJour = new Map();
  const ajouter = (jour, e) => parJour.set(jour, [...(parJour.get(jour) ?? []), e]);
  const ilYa7 = plus(-7);
  for (const e of liste(evenements)) {
    if (!estObjet(e)) continue;
    const statut = e.statut === 'fait' || e.statut === 'annule' ? e.statut : 'prevu';
    const jour = lireJour(e.date) ? e.date : '';
    if (statut === 'annule') continue;
    if (statut === 'fait') {
      if (jour && jour >= ilYa7 && jour <= aujourdhui) faits.push(e);
      continue;
    }
    if (!jour) {
      sansDate.push(e);
      continue;
    }
    const debut = lireJour(e.debut) ? e.debut : jour;
    if (jour < aujourdhui) aRevoir.push(e);
    else if (debut <= aujourdhui) ajouter(aujourdhui, { ...e, enCours: debut < aujourdhui });
    else if (jour <= limite) ajouter(jour, e);
  }
  const jours = [...parJour.keys()]
    .sort()
    .map((jour) => ({ jour, titre: titreDuJour(jour, maintenant), evenements: parJour.get(jour).sort(trierDuJour) }));
  if (!parJour.has(aujourdhui)) jours.unshift({ jour: aujourdhui, titre: "Aujourd'hui", evenements: [] });

  // La bande : chaque jour de la période d'une date compte (une semaine d'écriture se voit tous les jours).
  const bande = [];
  for (let i = 0; i < joursBande; i++) {
    const jour = plus(i);
    const date = lireJour(jour);
    const ceJour = liste(evenements).filter((e) => {
      if (!estObjet(e) || e.statut === 'annule' || e.statut === 'fait' || !lireJour(e.date)) return false;
      const debut = lireJour(e.debut) ? e.debut : e.date;
      return debut <= jour && jour <= e.date;
    });
    const couleurs = [];
    for (const e of ceJour.sort(trierDuJour)) {
      const c = texte(e.couleur);
      if (c && !couleurs.includes(c)) couleurs.push(c);
    }
    bande.push({
      jour,
      court: JOURS_COURTS[date.getDay()].replace('.', ''),
      numero: date.getDate(),
      aujourdhui: i === 0,
      finDeSemaine: date.getDay() === 0 || date.getDay() === 6,
      nombre: ceJour.length,
      couleurs: couleurs.slice(0, 3),
    });
  }
  aRevoir.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : trierDuJour(a, b)));
  faits.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
  return { bande, aRevoir, jours, sansDate, faits };
}

// ---------------------------------------------------------------------------
// Le chiffrement : AES-256-GCM, clé tirée de la phrase par PBKDF2-SHA256 (la même chose que electron/telephone.cjs et
// outils/telephone.py)
// ---------------------------------------------------------------------------

/** La phrase telle qu'on la compare : NFKC, minuscules, sans espaces ni tirets (« KQ7M-X2PD » = « kq7mx2pd »). */
export function normaliserPhrase(phrase) {
  return String(phrase ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-‐‑‒–—_.]+/g, '');
}

function octetsDeBase64(b64) {
  const binaire = atob(b64);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return octets;
}

/** La clé AES-GCM tirée de la phrase (non extractible : elle ne sort jamais de WebCrypto). */
export async function deriverCle(phrase, selBase64, iterations, subtle = globalThis.crypto.subtle) {
  const base = await subtle.importKey('raw', new TextEncoder().encode(normaliserPhrase(phrase)), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: octetsDeBase64(selBase64), iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
}

/** Vrai si l'enveloppe a la forme attendue (sans rien déchiffrer). */
export function enveloppeValide(e) {
  return (
    estObjet(e) &&
    e.v === 1 &&
    e.alg === 'AES-256-GCM' &&
    estObjet(e.kdf) &&
    e.kdf.nom === 'PBKDF2-SHA256' &&
    Number.isInteger(e.kdf.iterations) &&
    e.kdf.iterations >= 100_000 &&
    typeof e.kdf.sel === 'string' &&
    typeof e.iv === 'string' &&
    typeof e.chiffre === 'string'
  );
}

/**
 * Déchiffre l'enveloppe publiée (`donnees.json`) avec la clé : rend l'instantané. Une mauvaise clé (ou une enveloppe
 * touchée) lève une erreur `{ code: 'cle' }` ; une forme inconnue, `{ code: 'forme' }`.
 */
export async function dechiffrer(enveloppe, cle, subtle = globalThis.crypto.subtle) {
  if (!enveloppeValide(enveloppe)) throw Object.assign(new Error('forme inconnue'), { code: 'forme' });
  let clair;
  try {
    clair = await subtle.decrypt(
      { name: 'AES-GCM', iv: octetsDeBase64(enveloppe.iv), additionalData: new TextEncoder().encode(AAD) },
      cle,
      octetsDeBase64(enveloppe.chiffre),
    );
  } catch {
    throw Object.assign(new Error('mauvaise phrase'), { code: 'cle' });
  }
  let octets = new Uint8Array(clair);
  if (enveloppe.compression === 'gzip') {
    const flux = new Blob([octets]).stream().pipeThrough(new DecompressionStream('gzip'));
    octets = new Uint8Array(await new Response(flux).arrayBuffer());
  }
  const instantane = JSON.parse(new TextDecoder().decode(octets));
  if (!estObjet(instantane) || instantane.version !== VERSION_INSTANTANE) {
    throw Object.assign(new Error('version inconnue'), { code: 'forme' });
  }
  return instantane;
}
