// ---------------------------------------------------------------------------
// La version téléphone du tableau de bord : la page. Elle lit `donnees.json` (l'instantané chiffré que le PC publie),
// le déchiffre avec la clé tirée de la phrase de Lucas (gardée dans ce téléphone seulement, dans IndexedDB, sans
// pouvoir en sortir), et le montre en quatre onglets pensés pour le pouce : Aujourd'hui, À toi, Agenda, Chiffres.
// Lecture seule : rien ne repart vers le PC. Tout le texte passe par `textContent` (jamais de HTML venu des données).
// Les calculs sont dans calcul.js (essayés avec Node) ; ici, seulement le dessin et les gestes.
// ---------------------------------------------------------------------------
import * as C from './calcul.js';

const ONGLETS = [
  { id: 'aujourdhui', libelle: "Aujourd'hui", titre: "Aujourd'hui", icone: 'soleil' },
  { id: 'atoi', libelle: 'À toi', titre: 'À toi', icone: 'main' },
  { id: 'agenda', libelle: 'Agenda', titre: 'Agenda', icone: 'agenda' },
  { id: 'chiffres', libelle: 'Chiffres', titre: 'Tes chiffres', icone: 'courbe' },
];
const RAFRAICHIR_MS = 2 * 60_000;
const ATTENTE_PREMIER_ENVOI_MS = 30_000;
const HORLOGE_MS = 30_000;
const SEUIL_TIRER = 72;
let derniereTouche = 0;

// ---------------------------------------------------------------------------
// Les icônes : les tracés de la grande page (src/app/icone-trait.ts), plus ceux des onglets
// ---------------------------------------------------------------------------

const TRACES = {
  soleil: 'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 1 0 0-9 M12 2.5v2 M12 19.5v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M2.5 12h2 M19.5 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4',
  courbe: 'M3.5 19.5h17 M5 15.5l4-4.5 3.5 3 6.5-7.5 M15.5 6.5H19v3.5',
  agenda: 'M4.5 6.5h15v13h-15z M4.5 10.5h15 M8.5 4v4 M15.5 4v4',
  ouvrir: 'M14 4h6v6 M20 4l-9 9 M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 3 18.5v-12A1.5 1.5 0 0 1 4.5 5H10',
  points: 'M12 5a1 1 0 1 0 0 2 1 1 0 1 0 0-2 M12 11a1 1 0 1 0 0 2 1 1 0 1 0 0-2 M12 17a1 1 0 1 0 0 2 1 1 0 1 0 0-2',
  rafraichir: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3 M19.5 4.5v3.7h-3.7',
  chevron: 'M6.5 9.5 12 15l5.5-5.5',
  droite: 'M9.5 6.5 15 12l-5.5 5.5',
  attention: 'M10.3 4.3 3.1 17a2 2 0 0 0 1.7 3h14.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z M12 9.5v4 M12 16.9h.01',
  oeil: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 1 0 0-5.6',
  lune: 'M20 14.6A8.3 8.3 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6Z',
  limite: 'M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 1 0 0-17.2 M5.9 18.1 18.1 5.9',
  imprevu: 'M10.3 4.3 3.1 17a2 2 0 0 0 1.7 3h14.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z M12 9.5v4 M12 16.9h.01',
  question: 'M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 1 0 0-17.2 M9.6 9.5a2.5 2.5 0 0 1 4.85.8c0 1.7-2.45 2.3-2.45 2.3 M12 16.4h.01',
  main: 'M8 15.6V6.4a1.4 1.4 0 0 1 2.8 0V11 M10.8 10.6V4.9a1.4 1.4 0 0 1 2.8 0v5.7 M13.6 10.6V6.2a1.4 1.4 0 0 1 2.8 0v7.3a7 7 0 0 1-7 7h-.4a6 6 0 0 1-4.5-2l-2.6-3a1.45 1.45 0 0 1 2.2-1.9L8 15.6',
  cadenas: 'M7 11V8a5 5 0 0 1 10 0v3 M5.5 11h13a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V12a1 1 0 0 1 1-1z',
  sablier: 'M6.5 3.5h11 M6.5 20.5h11 M8 3.5v3a4 4 0 0 0 1.4 3L12 12l2.6-2.5a4 4 0 0 0 1.4-3v-3 M8 20.5v-3a4 4 0 0 1 1.4-3L12 12l2.6 2.5a4 4 0 0 1 1.4 3v3',
  ouverte: 'M12 4.6a7.4 7.4 0 1 0 0 14.8 7.4 7.4 0 1 0 0-14.8',
  travail: 'M12 4.6a7.4 7.4 0 1 0 0 14.8 7.4 7.4 0 1 0 0-14.8',
  finie: 'M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 1 0 0-17.2 M8.5 12.3l2.4 2.4 4.7-5',
  fermee: 'M7 7l10 10 M17 7 7 17',
};
const PLEINS = { travail: 'M12 7.6a4.4 4.4 0 0 1 0 8.8Z' };
const TIRETS = { ouverte: '2.4 3.1' };
const SVG = 'http://www.w3.org/2000/svg';

function icone(nom, classe = '') {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icone ${classe}`.trim());
  const trace = document.createElementNS(SVG, 'path');
  trace.setAttribute('d', TRACES[nom] ?? TRACES.ouverte);
  if (TIRETS[nom]) trace.setAttribute('stroke-dasharray', TIRETS[nom]);
  svg.append(trace);
  if (PLEINS[nom]) {
    const plein = document.createElementNS(SVG, 'path');
    plein.setAttribute('d', PLEINS[nom]);
    plein.setAttribute('class', 'plein');
    svg.append(plein);
  }
  return svg;
}

// ---------------------------------------------------------------------------
// Petits outils du dessin (jamais de HTML : `textContent` seulement)
// ---------------------------------------------------------------------------

/** `el('p', { classe: 'x', texte: '…', attrs: {…}, sur: { click } }, enfant…)`. */
function el(nom, options = {}, ...enfants) {
  const n = document.createElement(nom);
  if (options.classe) n.className = options.classe;
  if (options.texte !== undefined) n.textContent = C.typographie(options.texte);
  for (const [k, v] of Object.entries(options.attrs ?? {})) {
    if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const [k, v] of Object.entries(options.sur ?? {})) n.addEventListener(k, v);
  if (options.couleur) n.style.setProperty('--c', options.couleur);
  for (const e of enfants.flat()) if (e !== null && e !== undefined && e !== false) n.append(typeof e === 'string' ? C.typographie(e) : e);
  return n;
}

/** Un lien qui s'ouvre hors de la page (une page claude.ai s'ouvre dans l'appli Claude si elle est installée). */
function lienExterne(adresse, options = {}, ...enfants) {
  const sur = /^https:\/\//.test(adresse ?? '');
  return el(sur ? 'a' : 'div', { ...options, attrs: { ...(options.attrs ?? {}), ...(sur ? { href: adresse, target: '_blank', rel: 'noopener noreferrer' } : {}) } }, ...enfants);
}

const pluriel = (n, un, plusieurs) => `${C.nombre(n)} ${n === 1 ? un : plusieurs}`;

// ---------------------------------------------------------------------------
// La clé, gardée dans ce téléphone (IndexedDB ; repli en mémoire si le navigateur le refuse)
// ---------------------------------------------------------------------------

const BASE = 'tableau-telephone';
let cleEnMemoire = null;

function base() {
  return new Promise((resoudre, rejeter) => {
    const demande = indexedDB.open(BASE, 1);
    demande.onupgradeneeded = () => demande.result.createObjectStore('cles');
    demande.onsuccess = () => resoudre(demande.result);
    demande.onerror = () => rejeter(demande.error);
  });
}

async function operation(mode, faire) {
  const b = await base();
  try {
    return await new Promise((resoudre, rejeter) => {
      const t = b.transaction('cles', mode);
      const r = faire(t.objectStore('cles'));
      t.oncomplete = () => resoudre(r?.result);
      t.onerror = () => rejeter(t.error);
    });
  } finally {
    b.close();
  }
}

async function lireCle() {
  try {
    return (await operation('readonly', (s) => s.get('cle'))) ?? cleEnMemoire;
  } catch {
    return cleEnMemoire;
  }
}

async function rangerCle(valeur) {
  cleEnMemoire = valeur;
  try {
    await operation('readwrite', (s) => s.put(valeur, 'cle'));
    return true;
  } catch {
    return false;
  }
}

async function oublierCle() {
  cleEnMemoire = null;
  try {
    await operation('readwrite', (s) => s.delete('cle'));
  } catch {
    /* rien à oublier */
  }
}

// ---------------------------------------------------------------------------
// L'état de la page
// ---------------------------------------------------------------------------

const etat = {
  phase: 'chargement', // chargement | attente (rien publié) | verrou | pret
  cle: null, // { cle: CryptoKey, sel, iterations }
  enveloppe: null,
  instantane: null,
  verifieLe: null,
  horsLigne: false,
  enCours: false,
  erreurVerrou: '',
  phraseChangee: false,
  onglet: lireOngletDeLAdresse() ?? lireOngletGarde() ?? 'aujourdhui',
  vue: 'pages',
  ouverts: new Set(),
  jourChoisi: '',
  installation: null,
};

function lireOngletDeLAdresse() {
  const id = location.hash.replace('#', '');
  return ONGLETS.some((o) => o.id === id) ? id : null;
}

function lireOngletGarde() {
  try {
    const id = localStorage.getItem('onglet');
    return ONGLETS.some((o) => o.id === id) ? id : null;
  } catch {
    return null;
  }
}

function garderOnglet(id) {
  try {
    localStorage.setItem('onglet', id);
  } catch {
    /* sans stockage : l'onglet repart d'« Aujourd'hui » */
  }
}

// ---------------------------------------------------------------------------
// Le réseau
// ---------------------------------------------------------------------------

async function chargerEnveloppe() {
  const reponse = await fetch(`donnees.json?t=${Date.now()}`, { cache: 'no-store' });
  if (reponse.status === 404) return null;
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
  return reponse.json();
}

const memeKdf = (a, kdf) => a && kdf && a.sel === kdf.sel && a.iterations === kdf.iterations;

async function ouvrirEnveloppe(enveloppe) {
  if (!C.enveloppeValide(enveloppe)) throw Object.assign(new Error('forme'), { code: 'forme' });
  if (!etat.cle) etat.cle = await lireCle();
  if (!etat.cle || !memeKdf(etat.cle, enveloppe.kdf)) {
    etat.phraseChangee = Boolean(etat.cle);
    etat.phase = 'verrou';
    etat.enveloppe = enveloppe;
    return false;
  }
  etat.instantane = await C.dechiffrer(enveloppe, etat.cle.cle);
  etat.enveloppe = enveloppe;
  etat.phase = 'pret';
  return true;
}

async function rafraichir({ manuel = false } = {}) {
  if (etat.enCours) return;
  etat.enCours = true;
  dessinerFraicheur();
  const avant = etat.instantane?.genere_le;
  const phaseAvant = etat.phase;
  try {
    const enveloppe = await chargerEnveloppe();
    etat.horsLigne = false;
    etat.verifieLe = new Date();
    if (enveloppe === null) {
      etat.phase = etat.instantane ? 'pret' : 'attente';
    } else if (!etat.enveloppe || enveloppe.iv !== etat.enveloppe.iv || etat.phase !== 'pret') {
      await ouvrirEnveloppe(enveloppe);
    }
    if (manuel) {
      const apres = etat.instantane?.genere_le;
      avis(apres && apres !== avant ? 'À jour.' : `Rien de neuf : ton PC a envoyé ${C.tempsFrancais(apres, new Date()) || 'rien encore'}.`);
    }
  } catch (erreur) {
    if (erreur?.code === 'cle') {
      etat.phase = 'verrou';
      etat.phraseChangee = true;
      etat.cle = null;
    } else if (erreur?.code === 'forme') {
      avis('Le PC envoie une version que cette page ne connaît pas : recharge la page.');
    } else {
      etat.horsLigne = true;
      if (manuel) avis('Pas de réseau : je réessaie dans un moment.');
    }
  } finally {
    etat.enCours = false;
    // Le verrou n'est redessiné que s'il vient d'arriver : jamais pendant que Lucas tape sa phrase.
    if (etat.phase !== 'verrou' || phaseAvant !== 'verrou') dessiner();
  }
}

// ---------------------------------------------------------------------------
// Le dessin
// ---------------------------------------------------------------------------

const racine = document.getElementById('appli');
let elements = null; // { barre, titre, fraicheur, contenu, onglets: Map, tirer, avis, feuille }

function dessiner() {
  const maintenant = new Date();
  if (etat.phase === 'chargement') return;
  if (etat.phase === 'verrou') return dessinerVerrou();
  if (etat.phase === 'attente') return dessinerAttente();
  if (!elements) construireCadre();
  const defilement = window.scrollY;
  const bandeAvant = elements.contenu.querySelector('.bande')?.scrollLeft ?? 0;
  const ecran = ONGLETS.find((o) => o.id === etat.onglet) ?? ONGLETS[0];
  elements.titre.textContent = ecran.titre;
  const corps = { aujourdhui: ecranAujourdhui, atoi: ecranAToi, agenda: ecranAgenda, chiffres: ecranChiffres }[ecran.id](
    etat.instantane,
    maintenant,
  );
  elements.contenu.replaceChildren(corps);
  window.scrollTo(0, defilement);
  const bande = elements.contenu.querySelector('.bande');
  if (bande) bande.scrollLeft = bandeAvant;
  dessinerOnglets(maintenant);
  dessinerFraicheur();
}

/** Le cadre : la barre du haut, l'écran, les onglets du bas, l'indicateur « tirer », le message, la feuille du menu. */
function construireCadre() {
  const titre = el('h1', { classe: 'barre-titre' });
  const fraicheur = el('button', { classe: 'fraicheur', attrs: { type: 'button' }, sur: { click: () => rafraichir({ manuel: true }) } });
  const menu = el('button', { classe: 'bouton-icone', attrs: { type: 'button', 'aria-label': 'Menu' }, sur: { click: ouvrirFeuille } }, icone('points'));
  const barre = el('header', { classe: 'barre' }, titre, fraicheur, menu);
  const contenu = el('main', { attrs: { id: 'contenu', tabindex: '-1' } });
  const onglets = new Map();
  const nav = el('nav', { classe: 'onglets', attrs: { 'aria-label': 'Onglets' } });
  for (const o of ONGLETS) {
    const bouton = el(
      'button',
      { classe: 'onglet', attrs: { type: 'button' }, sur: { click: () => allerA(o.id) } },
      el('span', { classe: 'icone-onglet' }, icone(o.icone)),
      el('span', { texte: o.libelle }),
    );
    onglets.set(o.id, bouton);
    nav.append(bouton);
  }
  const tirer = el('div', { classe: 'tirer', attrs: { 'aria-hidden': 'true' } }, icone('rafraichir'));
  const message = el('div', { classe: 'avis', attrs: { role: 'status', 'aria-live': 'polite' } });
  const feuille = el('dialog', { classe: 'feuille', attrs: { 'aria-labelledby': 'titre-feuille' } });
  feuille.addEventListener('click', (e) => {
    if (e.target === feuille) feuille.close();
  });
  racine.replaceChildren(barre, tirer, contenu, nav, message, feuille);
  elements = { barre, titre, fraicheur, contenu, onglets, tirer, avis: message, feuille };
  brancherTirer();
}

function allerA(id, { vue = null } = {}) {
  const change = etat.onglet !== id;
  etat.onglet = id;
  if (vue) etat.vue = vue;
  garderOnglet(id);
  history.replaceState(null, '', `#${id}`);
  dessiner();
  if (change || vue) window.scrollTo({ top: 0 });
}

function dessinerOnglets(maintenant) {
  const i = etat.instantane;
  const attend = C.calculerAttend(i.attend, i.liens, maintenant);
  const besoin = (i.conversations ?? []).filter((c) => c.groupe === 'besoin').length;
  // Une affaire posée à la fois sur une page et par une conversation ✋ ne compte qu'une fois (lot 24-5).
  const uneFois = C.uneFoisTelephone(i.conversations, i.attend, i.liens, maintenant);
  const compte = { atoi: attend.nombre + besoin - uneFois.nombre };
  for (const [id, bouton] of elements.onglets) {
    const actif = id === etat.onglet;
    if (actif) bouton.setAttribute('aria-current', 'page');
    else bouton.removeAttribute('aria-current');
    bouton.querySelector('.badge')?.remove();
    const n = compte[id] ?? 0;
    bouton.setAttribute('aria-label', n > 0 ? `${ONGLETS.find((o) => o.id === id).libelle}, ${n} pour toi` : ONGLETS.find((o) => o.id === id).libelle);
    if (n > 0) bouton.append(el('span', { classe: 'badge', texte: n > 99 ? '99+' : String(n), attrs: { 'aria-hidden': 'true' } }));
  }
  const total = compte.atoi;
  document.title = total > 0 ? `(${total}) Tableau de bord` : 'Tableau de bord';
  try {
    if (total > 0) navigator.setAppBadge?.(total)?.catch?.(() => {});
    else navigator.clearAppBadge?.()?.catch?.(() => {});
  } catch {
    /* pas de pastille sur l'icône ici */
  }
}

function dessinerFraicheur() {
  if (!elements || !etat.instantane) return;
  const maintenant = new Date();
  const f = C.fraicheur(etat.instantane.genere_le, maintenant, (etat.instantane.envoi?.battement_min ?? 30) * 60_000);
  const b = elements.fraicheur;
  b.className = `fraicheur ${etat.horsLigne ? 'hors-ligne' : f.ton}${etat.enCours ? ' occupee' : ''}`;
  b.textContent = etat.horsLigne ? 'Hors ligne' : f.court || '—';
  b.setAttribute(
    'aria-label',
    `${etat.horsLigne ? 'Hors ligne. ' : ''}Ton PC a envoyé ${f.court || 'rien encore'}. Toucher pour rafraîchir.`,
  );
}

let minuteurAvis = null;
function avis(message) {
  if (!elements) return;
  elements.avis.textContent = message;
  elements.avis.classList.add('visible');
  clearTimeout(minuteurAvis);
  minuteurAvis = setTimeout(() => elements.avis.classList.remove('visible'), 2600);
}

// ---------------------------------------------------------------------------
// Les morceaux communs aux écrans
// ---------------------------------------------------------------------------

function bandeauFraicheur(i, maintenant) {
  const f = C.fraicheur(i.genere_le, maintenant, (i.envoi?.battement_min ?? 30) * 60_000);
  if (etat.horsLigne) {
    return el('div', { classe: 'bandeau', attrs: { role: 'note' } }, icone('attention', 'petite'), el('p', { texte: `Pas de réseau. Ce que tu vois date de ${C.tempsFrancais(i.genere_le, maintenant)}.` }));
  }
  if (f.ton === 'frais') return null;
  return el('div', { classe: 'bandeau', attrs: { role: 'note' } }, icone('attention', 'petite'), el('p', { texte: f.phrase }));
}

function carte(titre, { compte = '', classe = '' } = {}, ...enfants) {
  return el(
    'section',
    { classe: `carte ${classe}`.trim() },
    el('div', { classe: 'carte-entete' }, el('h2', { texte: titre }), compte !== '' ? el('span', { classe: 'compte', texte: compte }) : null),
    ...enfants,
  );
}

function toutVoir(texte, faire) {
  return el('button', { classe: 'tout-voir', attrs: { type: 'button' }, sur: { click: faire } }, el('span', { texte }), icone('droite', 'petite'));
}

/** Une ligne de « Ce qui t'attend » : toucher ouvre sa page (dans l'appli Claude) ; un ensemble se déplie. */
function ligneAttend(l, { or = true, aussi = null } = {}) {
  // `aussi` : les clés des lignes qui sont aussi dans une conversation ✋ (`uneFoisTelephone().cles`).
  const meta = aussi?.has(l.cle) ? `${l.meta} · aussi dans une conversation` : l.meta;
  const corps = el('div', { classe: 'ligne-corps' }, el('div', { classe: 'ligne-titre', texte: l.titre }), el('div', { classe: 'ligne-meta', texte: meta }));
  if (l.detail) corps.append(el('div', { classe: 'ligne-texte', texte: C.couperAuMot(l.detail, 160) }));
  if (l.reponse) corps.append(el('div', { classe: 'ligne-texte', texte: `Ta réponse : ${l.reponse}` }));
  const classe = `ligne${or ? ' or' : ''}`;
  const couleur = couleurDuProjet(l.projet);
  if (l.membres?.length && !l.page) {
    const ouvert = etat.ouverts.has(l.cle);
    const bouton = el(
      'button',
      {
        classe,
        couleur,
        attrs: { type: 'button', 'aria-expanded': ouvert ? 'true' : 'false' },
        sur: { click: () => basculer(l.cle) },
      },
      corps,
      el('span', { classe: 'ligne-fin' }, el('span', { classe: 'pastille', texte: String(l.membres.length) }), icone('chevron', 'petite')),
    );
    return ouvert ? el('div', {}, bouton, el('div', { classe: 'membres' }, l.membres.map((m) => ligneAttend(m, { or })))) : bouton;
  }
  return lienExterne(l.page, { classe, couleur, attrs: { 'aria-label': `${l.titre}. ${meta}. Ouvrir sa page.` } }, corps, el('span', { classe: 'ligne-fin' }, icone('ouvrir', 'petite')));
}

function couleurDuProjet(projet) {
  const p = (etat.instantane?.pages ?? []).find((x) => x.id === projet);
  if (p) return p.couleur;
  const d = (etat.instantane?.agenda ?? []).find((x) => x.projet === projet);
  return d ? d.couleur : '';
}

function basculer(cle) {
  if (etat.ouverts.has(cle)) etat.ouverts.delete(cle);
  else etat.ouverts.add(cle);
  dessiner();
}

/** Une conversation : son icône d'état, son titre, son projet et l'heure ; toucher la déplie (ce que Claude dit, ta demande). */
function carteConversation(c, { detaillee = false } = {}) {
  const ouvert = detaillee || etat.ouverts.has(`conv:${c.id}`);
  const meta = el('div', { classe: 'conv-meta' });
  if (c.projet) meta.append(el('span', { classe: 'point', couleur: c.couleur, attrs: { 'aria-hidden': 'true' } }), c.projet);
  if (c.note) meta.append(c.projet ? ` · ${c.note}` : c.note);
  const corps = el(
    'div',
    { classe: 'conv-corps' },
    el('div', { classe: 'conv-haut' }, el('span', { classe: 'conv-titre', texte: c.titre }), el('span', { classe: 'conv-temps', texte: c.temps })),
    c.projet || c.note ? meta : null,
    c.ligne ? el('div', { classe: 'conv-ligne', texte: c.ligne }) : null,
  );
  if (c.a_toi && c.groupe !== 'travail') corps.append(el('div', { classe: 'encadre or' }, el('strong', { texte: 'À toi : ' }), c.a_toi));
  if (c.choix && c.groupe !== 'travail') corps.append(el('div', { classe: 'encadre' }, el('strong', { texte: '❓ ' }), c.choix));
  if (ouvert) {
    const details = el('div', { classe: 'conv-details' });
    if (c.demande) details.append(el('p', { texte: `Ta dernière demande : ${c.demande}` }));
    if (c.debut) details.append(el('p', { texte: `Ouverte ${C.tempsFrancais(c.debut, new Date())}.` }));
    if (c.memeDossier) details.append(el('p', { texte: "Une autre conversation travaille dans le même dossier." }));
    if (c.groupe === 'besoin') details.append(el('p', { texte: 'Pour lui répondre, il faut ton PC.' }));
    corps.append(details);
  }
  if (c.page && c.groupe !== 'travail') {
    corps.append(el('div', { classe: 'rangee-boutons' }, lienExterne(c.page, { classe: 'bouton or' }, 'Ouvrir sa page', icone('ouvrir', 'petite'))));
  }
  return el(
    'div',
    {
      classe: `conv${ouvert ? ' ouverte' : ''}`,
      attrs: { role: 'button', tabindex: '0', 'aria-expanded': ouvert ? 'true' : 'false' },
      sur: {
        click: (e) => {
          if (!e.target.closest('a')) basculer(`conv:${c.id}`);
        },
        keydown: (e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('a')) {
            e.preventDefault();
            basculer(`conv:${c.id}`);
          }
        },
      },
    },
    el('span', { classe: `conv-icone ${c.icone?.ton ?? 'doux'}`, attrs: { title: c.icone?.libelle, role: 'img', 'aria-label': c.icone?.libelle } }, icone(c.icone?.nom ?? 'ouverte')),
    corps,
  );
}

/** Une date de l'agenda. */
function ligneDate(e, maintenant, { avecJour = false } = {}) {
  const heure = e.heure || (e.enCours ? 'en cours' : 'journée');
  const meta = [e.projetNom];
  if (avecJour && e.date) meta.unshift(C.titreDuJour(e.date, maintenant));
  if (e.debut && e.date && e.debut !== e.date && !avecJour) meta.push(`du ${C.dateCourte(e.debut, maintenant)} au ${C.dateCourte(e.date, maintenant)}`);
  const pastilles = el('div', { classe: 'pastilles' });
  if (e.qui === 'toi') pastilles.append(el('span', { classe: 'pastille or', texte: 'à toi' }));
  if (e.source === 'echeance') pastilles.append(el('span', { classe: 'pastille', texte: 'échéance' }));
  if (e.statut === 'fait') pastilles.append(el('span', { classe: 'pastille', texte: 'fait' }));
  const ouvert = etat.ouverts.has(`date:${e.id}`);
  const corps = el(
    'div',
    { classe: 'ligne-corps' },
    el('div', { classe: 'ligne-titre', texte: e.titre }),
    el('div', { classe: 'ligne-meta', texte: meta.filter(Boolean).join(' · ') }),
    ouvert && e.detail ? el('div', { classe: 'ligne-texte', texte: e.detail }) : null,
    ouvert && e.quand ? el('div', { classe: 'ligne-meta', texte: `Prévu : ${e.quand}` }) : null,
    pastilles.childElementCount ? pastilles : null,
  );
  return el(
    'button',
    {
      classe: `ligne${e.statut === 'fait' ? ' faite' : ''}`,
      couleur: e.couleur,
      attrs: { type: 'button', 'aria-expanded': e.detail ? (ouvert ? 'true' : 'false') : null },
      sur: { click: () => (e.detail || e.quand ? basculer(`date:${e.id}`) : null) },
    },
    avecJour ? null : el('span', { classe: 'date-heure', texte: heure }),
    corps,
    e.detail ? el('span', { classe: 'ligne-fin' }, icone('chevron', 'petite')) : null,
  );
}

function repli(titre, nombre, contenu, { cle, note = '' } = {}) {
  const d = el(
    'details',
    { classe: 'repli', attrs: { open: etat.ouverts.has(cle) } },
    el('summary', {}, titre, el('span', { texte: ` (${nombre})` }), icone('chevron', 'petite')),
    el('div', { classe: 'repli-corps' }, note ? el('p', { classe: 'repli-note', texte: note }) : null, contenu),
  );
  d.addEventListener('toggle', () => {
    if (d.open) etat.ouverts.add(cle);
    else etat.ouverts.delete(cle);
  });
  return d;
}

function ecartEl(valeur, enEuros = false) {
  const t = C.ecartEnClair(valeur, { enEuros });
  return t ? el('span', { classe: `ecart${valeur < 0 ? ' baisse' : ''}`, texte: t }) : null;
}

function courbeEl(valeurs, classe = '') {
  const d = C.traceDeCourbe(valeurs, 300, classe === 'petite' ? 32 : 56);
  if (!d) return null;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 300 ${classe === 'petite' ? 32 : 56}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', `courbe ${classe}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', d);
  svg.append(p);
  return svg;
}

// ---------------------------------------------------------------------------
// Aujourd'hui : le coup d'œil
// ---------------------------------------------------------------------------

function ecranAujourdhui(i, maintenant) {
  const attend = C.calculerAttend(i.attend, i.liens, maintenant);
  const conv = C.rangerConversations(i.conversations, maintenant);
  const agenda = C.vueAgenda(i.agenda, maintenant);
  const duJour = agenda.jours.find((j) => j.jour === C.jourLocal(maintenant))?.evenements ?? [];
  const f = C.fraicheur(i.genere_le, maintenant, (i.envoi?.battement_min ?? 30) * 60_000);

  const ecran = el(
    'div',
    { classe: 'ecran' },
    el('header', { classe: 'entete-jour' }, el('h1', { texte: C.journeeEnLettres(maintenant) }), el('p', { texte: `Ton PC a envoyé ${f.court || 'rien encore'}.` })),
    bandeauFraicheur(i, maintenant),
    el(
      'div',
      { classe: 'tuiles' },
      tuile(attend.nombre, attend.nombre === 1 ? 'chose pour toi' : 'choses pour toi', attend.nombre > 0, () => allerA('atoi', { vue: 'pages' })),
      tuile(conv.besoin.length, conv.besoin.length === 1 ? "conversation t'attend" : "conversations t'attendent", conv.besoin.length > 0, () => allerA('atoi', { vue: 'conversations' })),
      tuile(duJour.length, duJour.length === 1 ? "date aujourd'hui" : "dates aujourd'hui", false, () => allerA('agenda')),
    ),
  );

  // Ce qui t'attend : les trois plus anciennes.
  if (!attend.vide) {
    const c = carte("Ce qui t'attend", { classe: attend.nombre > 0 ? 'or' : '' }, el('p', { classe: 'carte-resume', texte: attend.resume }));
    const aussi = C.uneFoisTelephone(i.conversations, i.attend, i.liens, maintenant).cles;
    for (const l of attend.lignes.slice(0, 3)) c.append(ligneAttend(l, { aussi }));
    const autres = attend.lignes.length - 3;
    c.append(toutVoir(autres > 0 ? `Tout voir (${pluriel(autres, 'autre', 'autres')} pour toi)` : 'Tout voir sur tes pages', () => allerA('atoi', { vue: 'pages' })));
    ecran.append(c);
  }

  // En ce moment : les conversations.
  const compteEnCours = [conv.besoin.length ? `${conv.besoin.length} pour toi` : '', conv.travail.length ? `${conv.travail.length} au travail` : ''].filter(Boolean).join(' · ');
  const enCours = carte('En ce moment', { compte: compteEnCours, classe: conv.besoin.length ? 'or' : '' });
  if (conv.besoin.length === 0 && conv.travail.length === 0) {
    enCours.append(el('p', { classe: 'carte-vide', texte: conv.finies.length ? `Rien ne tourne. ${pluriel(conv.finies.length, 'conversation finie', 'conversations finies')} ces dernières 24 h.` : 'Aucune conversation ne tourne.' }));
  } else {
    for (const c of conv.besoin.slice(0, 4)) enCours.append(carteConversation(c));
    for (const c of conv.travail.slice(0, Math.max(0, 5 - Math.min(conv.besoin.length, 4)))) enCours.append(carteConversation(c));
  }
  enCours.append(toutVoir('Toutes les conversations', () => allerA('atoi', { vue: 'conversations' })));
  ecran.append(enCours);

  // Au programme : aujourd'hui, puis la prochaine date.
  const prog = carte('Au programme');
  if (duJour.length) for (const e of duJour.slice(0, 5)) prog.append(ligneDate(e, maintenant));
  else prog.append(el('p', { classe: 'carte-vide', texte: "Rien de prévu aujourd'hui." }));
  const suivant = agenda.jours.find((j) => j.jour > C.jourLocal(maintenant));
  if (suivant) {
    prog.append(el('div', { classe: 'carte-resume carte-sous', texte: `Ensuite, ${suivant.titre.toLocaleLowerCase('fr-FR')}\u00a0:` }));
    for (const e of suivant.evenements.slice(0, 2)) prog.append(ligneDate(e, maintenant));
  }
  if (agenda.aRevoir.length) prog.append(el('div', { classe: 'pastilles' }, el('span', { classe: 'pastille retard', texte: `${pluriel(agenda.aRevoir.length, 'date passée', 'dates passées')} à revoir` })));
  prog.append(toutVoir("Tout l'agenda", () => allerA('agenda')));
  ecran.append(prog);

  // Les soucis.
  const s = i.soucis ?? {};
  if ((s.ouverts ?? []).length || (s.notes ?? []).length) {
    const c = carte('Soucis', { compte: String((s.ouverts ?? []).length + (s.notes ?? []).length) });
    for (const x of s.ouverts ?? []) {
      c.append(
        el(
          'div',
          { classe: 'ligne', couleur: 'var(--retard)' },
          el(
            'div',
            { classe: 'ligne-corps' },
            el('div', { classe: 'ligne-titre', texte: x.titre || (x.genre === 'silencieuse' ? 'Une conversation silencieuse' : 'Un imprévu') }),
            el('div', { classe: 'ligne-meta', texte: [x.projet, { imprevu: 'imprévu', limite: 'limite', silencieuse: 'sans nouvelles' }[x.genre] ?? '', C.tempsFrancais(x.heure, maintenant)].filter(Boolean).join(' · ') }),
            x.ligne ? el('div', { classe: 'ligne-texte', texte: x.ligne }) : null,
          ),
        ),
      );
    }
    for (const n of s.notes ?? []) c.append(el('div', { classe: 'ligne' }, el('div', { classe: 'ligne-corps' }, el('div', { classe: 'ligne-texte', texte: n.texte }), el('div', { classe: 'ligne-meta', texte: `ta note, ${C.tempsFrancais(n.cree_le, maintenant)}` }))));
    ecran.append(c);
  }

  // Les chiffres en bref.
  const r = i.reseaux ?? {};
  if (r.fichier === 'ok') {
    const vuesGagnees = (r.videos ?? []).reduce((t, v) => (v.ecart === null || v.ecart === undefined ? t : (t ?? 0) + v.ecart), null);
    const c = carte('Tes chiffres', { compte: r.releve?.fin ? `relevé ${C.tempsFrancais(r.releve.fin, maintenant)}` : '' });
    c.append(
      el(
        'div',
        { classe: 'grands-chiffres' },
        grandChiffre(C.nombre(r.total?.installations), 'installations de tes jeux', ecartEl(r.total?.ecartInstallations)),
        grandChiffre(C.euros(r.total?.gains), 'gagnés depuis la sortie', ecartEl(r.total?.ecartGains, true)),
      ),
    );
    if (vuesGagnees !== null) c.append(el('p', { classe: 'carte-resume', texte: `${C.ecartEnClair(vuesGagnees) || '+0'} vues sur tes vidéos depuis la mesure d'avant.` }));
    c.append(toutVoir('Tous tes chiffres', () => allerA('chiffres')));
    ecran.append(c);
  }
  return ecran;
}

function tuile(n, libelle, or, faire) {
  return el(
    'button',
    { classe: `tuile${or ? ' or' : ''}`, attrs: { type: 'button', 'aria-label': `${n} ${libelle}` }, sur: { click: faire } },
    el('span', { classe: 'tuile-nombre', texte: C.nombre(n) }),
    el('span', { classe: 'tuile-libelle', texte: libelle }),
  );
}

function grandChiffre(valeur, libelle, ecart) {
  return el('div', { classe: 'grand-chiffre' }, el('span', { classe: 'valeur', texte: valeur }), el('span', { classe: 'libelle', texte: libelle }), ecart);
}

// ---------------------------------------------------------------------------
// À toi : tes pages et tes conversations
// ---------------------------------------------------------------------------

function ecranAToi(i, maintenant) {
  const attend = C.calculerAttend(i.attend, i.liens, maintenant);
  const conv = C.rangerConversations(i.conversations, maintenant);
  const segment = (vue, libelle, n) =>
    el(
      'button',
      { classe: 'segment', attrs: { type: 'button', 'aria-pressed': etat.vue === vue ? 'true' : 'false' }, sur: { click: () => allerA('atoi', { vue }) } },
      libelle,
      n > 0 ? el('span', { classe: 'pastille or', texte: String(n) }) : null,
    );
  const ecran = el('div', { classe: 'ecran' }, el('div', { classe: 'segments' }, segment('pages', 'Sur tes pages', attend.nombre), segment('conversations', 'Conversations', conv.besoin.length)), bandeauFraicheur(i, maintenant));

  if (etat.vue === 'conversations') {
    if (conv.besoin.length + conv.travail.length + conv.finies.length === 0) {
      ecran.append(carte('Conversations', {}, el('p', { classe: 'carte-vide', texte: "Aucune conversation ces dernières 24 h. Celles qui t'attendent apparaîtront ici." })));
      return ecran;
    }
    if (conv.besoin.length) ecran.append(carte('Ont besoin de toi', { compte: String(conv.besoin.length), classe: 'or' }, conv.besoin.map((c) => carteConversation(c))));
    if (conv.travail.length) ecran.append(carte('Au travail', { compte: String(conv.travail.length) }, conv.travail.map((c) => carteConversation(c))));
    if (conv.finies.length) ecran.append(repli('Finies ces 24 h', conv.finies.length, conv.finies.map((c) => carteConversation(c)), { cle: 'repli:finies' }));
    ecran.append(el('p', { classe: 'note-pale', texte: "Une conversation se reprend sur ton PC ; une page s'ouvre ici, dans l'appli Claude." }));
    return ecran;
  }

  if (attend.vide) {
    ecran.append(carte('Sur tes pages', {}, el('p', { classe: 'carte-vide', texte: "Rien sur tes pages. Les choix et les gestes qui t'attendent apparaîtront ici." })));
  } else {
    const c = carte('Pour toi', { compte: attend.nombre ? String(attend.nombre) : '', classe: attend.nombre ? 'or' : '' }, el('p', { classe: 'carte-resume', texte: attend.resume }));
    const aussi = C.uneFoisTelephone(i.conversations, i.attend, i.liens, maintenant).cles;
    for (const l of attend.lignes) c.append(ligneAttend(l, { aussi }));
    ecran.append(c);
    if (attend.plusTard.length) ecran.append(repli('Quand tu as un moment', attend.plusTard.length, attend.plusTard.map((l) => ligneAttend(l, { or: false })), { cle: 'repli:plus-tard', note: 'Si tu veux : rien ne presse.' }));
    if (attend.ailleurs.length) ecran.append(repli("On attend quelqu'un", attend.ailleurs.length, attend.ailleurs.map((l) => ligneAttend(l, { or: false })), { cle: 'repli:ailleurs' }));
    if (attend.repondues.length) ecran.append(repli('Déjà répondu, rien à faire pour toi', attend.repondues.length, attend.repondues.map((l) => ligneAttend(l, { or: false })), { cle: 'repli:repondues' }));
    if (i.attend?.maj) ecran.append(el('p', { classe: 'note-pale', texte: `Liste vue sur tes pages ${C.tempsFrancais(i.attend.maj, maintenant)}.` }));
  }

  const pages = i.pages ?? [];
  if (pages.length) {
    ecran.append(el('h2', { classe: 'titre-section' }, 'Tes pages de suivi', el('span', { texte: String(pages.length) })));
    const c = el('section', { classe: 'carte' });
    for (const p of pages) {
      c.append(lienExterne(p.adresse, { classe: 'ligne', couleur: p.couleur, attrs: { 'aria-label': `Ouvrir la page de ${p.nom}` } }, el('div', { classe: 'ligne-corps' }, el('div', { classe: 'ligne-titre', texte: p.nom })), el('span', { classe: 'ligne-fin' }, icone('ouvrir', 'petite'))));
    }
    ecran.append(c);
  }
  return ecran;
}

// ---------------------------------------------------------------------------
// Agenda : la bande des quinze jours, puis jour par jour
// ---------------------------------------------------------------------------

function ecranAgenda(i, maintenant) {
  const a = C.vueAgenda(i.agenda, maintenant);
  const aujourdhui = C.jourLocal(maintenant);
  const ecran = el('div', { classe: 'ecran' }, bandeauFraicheur(i, maintenant));
  const bande = el('div', { classe: 'bande', attrs: { role: 'group', 'aria-label': 'Les quinze prochains jours' } });
  for (const j of a.bande) {
    const n = j.nombre;
    bande.append(
      el(
        'button',
        {
          classe: `jour-bande${j.aujourdhui ? ' aujourdhui' : ''}${j.finDeSemaine ? ' fin-de-semaine' : ''}`,
          attrs: {
            type: 'button',
            'aria-pressed': etat.jourChoisi === j.jour ? 'true' : 'false',
            'aria-label': `${C.titreDuJour(j.jour, maintenant)} : ${n ? pluriel(n, 'date', 'dates') : 'rien'}`,
          },
          sur: { click: () => choisirJour(j.jour) },
        },
        el('span', { classe: 'court', texte: j.court }),
        el('span', { classe: 'numero', texte: String(j.numero) }),
        el('span', { classe: 'points' }, j.couleurs.map((c) => el('i', { couleur: c }))),
      ),
    );
  }
  ecran.append(bande);

  if (a.aRevoir.length) {
    ecran.append(carte('À revoir', { compte: String(a.aRevoir.length), classe: 'retard' }, el('p', { classe: 'carte-resume', texte: "Prévu avant aujourd'hui, ni fait ni annulé." }), a.aRevoir.slice(0, 20).map((e) => ligneDate(e, maintenant, { avecJour: true }))));
  }
  for (const j of a.jours) {
    const section = el('section', { classe: 'jour', attrs: { id: `jour-${j.jour}` } }, el('h2', { classe: 'jour-titre' }, j.titre, j.evenements.length ? el('span', { texte: pluriel(j.evenements.length, 'date', 'dates') }) : null));
    const liste = el('div', { classe: 'carte' });
    if (j.evenements.length === 0) liste.append(el('p', { classe: 'carte-vide', texte: j.jour === aujourdhui ? "Rien de prévu aujourd'hui." : 'Rien ce jour-là.' }));
    else for (const e of j.evenements) liste.append(ligneDate(e, maintenant));
    section.append(liste);
    ecran.append(section);
  }
  if (etat.jourChoisi && !a.jours.some((j) => j.jour === etat.jourChoisi)) {
    // Un jour choisi dans la bande sans rien ce jour-là : dit en clair.
    ecran.append(el('p', { classe: 'note-pale', texte: `${C.titreDuJour(etat.jourChoisi, maintenant)} : rien de prévu.` }));
  }
  if (a.sansDate.length) ecran.append(repli('Sans date', a.sansDate.length, a.sansDate.map((e) => ligneDate(e, maintenant)), { cle: 'repli:sans-date' }));
  if (a.faits.length) ecran.append(repli('Fait ces 7 derniers jours', a.faits.length, a.faits.map((e) => ligneDate(e, maintenant, { avecJour: true })), { cle: 'repli:faits' }));
  ecran.append(el('p', { classe: 'note-pale', texte: 'Les mêmes dates sont dans ton Google Agenda «\u00a0Orwen\u00a0», avec leurs rappels.' }));
  return ecran;
}

function choisirJour(jour) {
  etat.jourChoisi = etat.jourChoisi === jour ? '' : jour;
  dessiner();
  const cible = document.getElementById(`jour-${jour}`);
  if (cible && etat.jourChoisi) cible.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

// ---------------------------------------------------------------------------
// Chiffres : jeux, vidéos, comptes
// ---------------------------------------------------------------------------

function ecranChiffres(i, maintenant) {
  const r = i.reseaux ?? {};
  const ecran = el('div', { classe: 'ecran' }, bandeauFraicheur(i, maintenant));
  if (r.fichier !== 'ok') {
    ecran.append(carte('Tes chiffres', {}, el('p', { classe: 'carte-vide', texte: "Pas encore de relevé : ton PC le fait une fois par jour, après 8 h." })));
    return ecran;
  }
  ecran.append(
    el('p', {
      classe: 'releve',
      texte: r.releve?.fin
        ? `Relevé ${C.tempsFrancais(r.releve.fin, maintenant)}${r.releve.ok ? '' : ', avec un souci'}. Les écarts comparent à la mesure d'avant.`
        : "Les écarts comparent à la mesure d'avant.",
    }),
  );

  // Les jeux.
  const jeux = r.jeux ?? [];
  if (jeux.length) {
    const total = r.total ?? {};
    const c = carte('Tes jeux', { compte: pluriel(jeux.length, 'jeu', 'jeux') });
    c.append(
      el(
        'div',
        { classe: 'grands-chiffres' },
        grandChiffre(C.nombre(total.installations), 'installations', ecartEl(total.ecartInstallations)),
        grandChiffre(C.euros(total.gains), 'gagnés', ecartEl(total.ecartGains, true)),
      ),
    );
    const courbe = courbeEl(total.courbe?.installations);
    if (courbe) c.append(el('div', { attrs: { role: 'img', 'aria-label': 'La courbe des installations de tous tes jeux depuis la première sortie' } }, courbe));
    for (const j of jeux) {
      const bloc = el(
        'div',
        { classe: 'jeu' },
        el('div', { classe: 'jeu-nom' }, el('span', { classe: 'point', couleur: j.couleur, attrs: { 'aria-hidden': 'true' } }), j.nom),
        el(
          'div',
          { classe: 'jeu-chiffres' },
          el('div', {}, el('span', { classe: 'valeur', texte: C.nombre(j.installations) }), el('span', { classe: 'note-pale', texte: 'installations ' }), ecartEl(j.ecartInstallations)),
          el('div', {}, el('span', { classe: 'valeur', texte: C.euros(j.gains) }), el('span', { classe: 'note-pale', texte: 'gagnés ' }), ecartEl(j.ecartGains, true)),
        ),
        courbeEl(j.courbe?.installations, 'petite'),
      );
      const notes = [];
      if (j.chiffres_au) notes.push(`chiffres au ${C.dateCourte(j.chiffres_au, maintenant)}`);
      if (j.visiteurs7j !== null && j.visiteurs7j !== undefined) notes.push(`${C.nombre(j.visiteurs7j)} visiteurs de sa fiche en 7 jours`);
      if (notes.length) bloc.append(el('p', { classe: 'note-pale', texte: notes.join(' · ') }));
      if (j.manque) bloc.append(el('p', { classe: 'note-pale', texte: j.manque }));
      c.append(bloc);
    }
    ecran.append(c);
  }

  // Les vidéos.
  const videos = r.videos ?? [];
  if (videos.length) {
    ecran.append(el('h2', { classe: 'titre-section' }, 'Tes vidéos', el('span', { texte: String(videos.length) })));
    const d = r.decompte ?? {};
    const chips = el('div', { classe: 'pastilles' });
    if (d.publiee) chips.append(el('span', { classe: 'pastille', texte: pluriel(d.publiee, 'publiée', 'publiées') }));
    if (d.programmee) chips.append(el('span', { classe: 'pastille lune', texte: pluriel(d.programmee, 'programmée', 'programmées') }));
    if (d.faite) chips.append(el('span', { classe: 'pastille', texte: pluriel(d.faite, 'faite, à publier', 'faites, à publier') }));
    if (d.a_faire) chips.append(el('span', { classe: 'pastille', texte: pluriel(d.a_faire, 'à faire', 'à faire') }));
    if (chips.childElementCount) ecran.append(chips);
    const c = el('section', { classe: 'carte' });
    for (const v of videos.slice(0, 6)) c.append(ligneVideo(v, maintenant));
    ecran.append(c);
    if (videos.length > 6) ecran.append(repli('Les vidéos d\'avant', videos.length - 6, videos.slice(6).map((v) => ligneVideo(v, maintenant)), { cle: 'repli:videos' }));
  }

  // Les comptes.
  const comptes = r.comptes ?? {};
  const blocs = [];
  for (const [cle, nom] of [['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['instagram', 'Instagram']]) {
    const x = comptes[cle];
    if (!x) continue;
    const chiffres = el('div', { classe: 'compte-chiffres' });
    if (x.abonnes !== null) chiffres.append(petitChiffre(C.nombre(x.abonnes), 'abonnés'));
    if (x.vues !== null) chiffres.append(petitChiffre(C.nombreCourt(x.vues), 'vues en tout'));
    if (x.publications !== null) chiffres.append(petitChiffre(C.nombre(x.publications), 'publications'));
    blocs.push(el('div', { classe: 'compte' }, el('div', { classe: 'compte-nom' }, nom, x.maj ? el('span', { classe: 'note-pale', texte: ` · ${C.tempsFrancais(x.maj, maintenant)}` }) : null), chiffres.childElementCount ? chiffres : null, x.probleme ? el('p', { classe: 'probleme', texte: x.probleme }) : null));
  }
  const site = comptes.site;
  if (site) {
    const chiffres = el('div', { classe: 'compte-chiffres' }, petitChiffre(C.nombre(site.veille), 'visites hier'), petitChiffre(C.nombre(site.j7), 'en 7 jours'), petitChiffre(C.nombre(site.j28), 'en 28 jours'));
    const bloc = el('div', { classe: 'compte' }, el('div', { classe: 'compte-nom' }, 'orwen.fr', site.maj ? el('span', { classe: 'note-pale', texte: ` · ${C.tempsFrancais(site.maj, maintenant)}` }) : null), chiffres);
    if (site.clicsPlay !== null) bloc.append(el('p', { classe: 'note-pale', texte: `${pluriel(site.clicsPlay, 'clic', 'clics')} vers Google Play en 7 jours.` }));
    if ((site.pages ?? []).length) bloc.append(el('p', { classe: 'note-pale', texte: `Les plus vues : ${site.pages.slice(0, 3).map((p) => `${p.titre} (${C.nombre(p.j7)})`).join(', ')}.` }));
    if (site.probleme) bloc.append(el('p', { classe: 'probleme', texte: site.probleme }));
    blocs.push(bloc);
  }
  if (blocs.length) {
    ecran.append(el('h2', { classe: 'titre-section' }, 'Tes comptes'));
    ecran.append(el('section', { classe: 'carte' }, blocs));
  }

  if ((r.accroches ?? []).length) {
    ecran.append(el('h2', { classe: 'titre-section' }, 'Les accroches qui marchent'));
    const c = el('section', { classe: 'carte' });
    for (const a of r.accroches) {
      c.append(el('div', { classe: 'ligne' }, el('div', { classe: 'ligne-corps' }, el('div', { classe: 'ligne-titre', texte: a.nom }), el('div', { classe: 'ligne-meta', texte: `${C.multipleEnClair(a.multiple)} tes vues habituelles · ${pluriel(a.videos ?? 0, 'vidéo', 'vidéos')}` }))));
    }
    ecran.append(c);
  }
  if (r.avertissements) ecran.append(el('p', { classe: 'note-pale', texte: `${pluriel(r.avertissements, 'remarque', 'remarques')} sur le dernier relevé : le détail est sur ton PC, onglet Réseaux.` }));
  return ecran;
}

function petitChiffre(valeur, libelle) {
  return el('div', {}, el('span', { classe: 'valeur', texte: valeur }), el('span', { classe: 'libelle', texte: libelle }));
}

const ETATS_VIDEO = { publiee: 'publiée', programmee: 'programmée', faite: 'faite', a_faire: 'à faire' };

function ligneVideo(v, maintenant) {
  const cle = `video:${v.id}`;
  const ouvert = etat.ouverts.has(cle);
  const meta = [v.projetNom, v.date ? C.dateCourte(v.date, maintenant) : '', v.en_retard ? 'en retard' : ETATS_VIDEO[v.etat] ?? ''].filter(Boolean).join(' · ');
  const corps = el('div', { classe: 'ligne-corps' }, el('div', { classe: 'ligne-titre', texte: v.titre }), el('div', { classe: 'ligne-meta', texte: meta }));
  if (v.multiple !== null || v.formule) {
    const p = el('div', { classe: 'pastilles' });
    if (v.multiple !== null) p.append(el('span', { classe: 'pastille lune', texte: `${C.multipleEnClair(v.multiple)} l'habitude` }));
    if (v.formule) p.append(el('span', { classe: 'pastille', texte: v.formule }));
    corps.append(p);
  }
  if (ouvert) {
    const reseaux = el('div', { classe: 'video-reseaux' });
    for (const x of v.reseaux ?? []) {
      const texte = x.vues !== null ? `${C.nombre(x.vues)} vues${x.likes !== null ? ` · ${C.nombre(x.likes)} j'aime` : ''}${x.commentaires !== null ? ` · ${C.nombre(x.commentaires)} comm.` : ''}` : ETATS_VIDEO[x.etat] ?? (x.etat === 'pas_encore' ? 'pas encore' : 'pas de chiffre');
      reseaux.append(lienExterne(x.url, { classe: 'video-reseau' }, el('span', { classe: 'nom', texte: x.libelle }), el('span', { classe: 'note-pale', texte }), x.url ? icone('ouvrir', 'petite') : null));
    }
    corps.append(reseaux);
  }
  return el(
    'div',
    {
      classe: 'ligne',
      couleur: v.couleur,
      attrs: { role: 'button', tabindex: '0', 'aria-expanded': ouvert ? 'true' : 'false' },
      sur: {
        click: (e) => (e.target.closest('a') ? null : basculer(cle)),
        keydown: (e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('a')) {
            e.preventDefault();
            basculer(cle);
          }
        },
      },
    },
    corps,
    el('span', { classe: 'video-vues' }, el('span', { classe: 'valeur', texte: v.vues === null ? '—' : C.nombreCourt(v.vues) }), ecartEl(v.ecart)),
  );
}

// ---------------------------------------------------------------------------
// La feuille du menu
// ---------------------------------------------------------------------------

function ouvrirFeuille() {
  const f = elements.feuille;
  const i = etat.instantane;
  const maintenant = new Date();
  const genere = C.lireDate(i?.genere_le);
  const contenu = [
    el('div', { classe: 'poignee', attrs: { 'aria-hidden': 'true' } }),
    el('h2', { texte: 'Ton tableau de bord', attrs: { id: 'titre-feuille' } }),
    el('p', { texte: genere ? `Ton PC a envoyé ${C.tempsFrancais(genere, maintenant)} (à ${C.heureFrancaise(genere)}).` : "Ton PC n'a encore rien envoyé." }),
    etat.verifieLe ? el('p', { texte: `Vérifié ${C.tempsFrancais(etat.verifieLe, maintenant)}.` }) : null,
    el('button', { classe: 'bouton large', texte: 'Rafraîchir maintenant', attrs: { type: 'button' }, sur: { click: () => { f.close(); rafraichir({ manuel: true }); } } }),
  ];
  if (etat.installation) {
    contenu.push(el('button', { classe: 'bouton large discret', texte: "Mettre sur l'écran d'accueil", attrs: { type: 'button' }, sur: { click: installer } }));
  } else if (!matchMedia('(display-mode: standalone)').matches) {
    contenu.push(el('p', { classe: 'note-pale', texte: "Pour l'avoir comme une appli : menu ⋮ de Chrome, puis « Ajouter à l'écran d'accueil »." }));
  }
  contenu.push(
    el('button', { classe: 'bouton large discret', texte: 'Verrouiller ce téléphone', attrs: { type: 'button' }, sur: { click: verrouiller } }),
    el('p', { classe: 'note-pale', texte: `Ton PC envoie ses nouvelles quand quelque chose change (toutes les ${i?.envoi?.ecart_min ?? 10} min au plus souvent) et au moins toutes les ${i?.envoi?.battement_min ?? 30} min quand il est allumé. Tout est chiffré sur ton PC ; ta phrase ne quitte jamais ce téléphone.` }),
    el('button', { classe: 'bouton large discret', texte: 'Fermer', attrs: { type: 'button' }, sur: { click: () => f.close() } }),
  );
  f.replaceChildren(...contenu.filter(Boolean));
  f.showModal();
}

async function installer() {
  const evenement = etat.installation;
  etat.installation = null;
  elements.feuille.close();
  if (!evenement) return;
  evenement.prompt();
  try {
    await evenement.userChoice;
  } catch {
    /* refusé : rien */
  }
}

async function verrouiller() {
  elements?.feuille.close();
  await oublierCle();
  etat.cle = null;
  etat.instantane = null;
  etat.phraseChangee = false;
  etat.phase = 'verrou';
  elements = null;
  dessiner();
}

// ---------------------------------------------------------------------------
// Le verrou et l'attente
// ---------------------------------------------------------------------------

function dessinerVerrou() {
  elements = null;
  document.title = 'Tableau de bord';
  const champ = el('input', {
    attrs: {
      id: 'phrase',
      type: 'password',
      autocomplete: 'current-password',
      autocapitalize: 'none',
      autocorrect: 'off',
      spellcheck: 'false',
      enterkeyhint: 'go',
      required: true,
      'aria-describedby': 'erreur-phrase',
    },
  });
  const voir = el('button', { classe: 'bouton-icone', attrs: { type: 'button', 'aria-label': 'Afficher la phrase', 'aria-pressed': 'false' } }, icone('oeil'));
  voir.addEventListener('click', () => {
    const visible = champ.type === 'password';
    champ.type = visible ? 'text' : 'password';
    voir.setAttribute('aria-pressed', visible ? 'true' : 'false');
    champ.focus();
  });
  const erreur = el('p', { classe: 'erreur', texte: etat.erreurVerrou, attrs: { id: 'erreur-phrase', role: 'alert' } });
  const bouton = el('button', { classe: 'bouton large', texte: 'Ouvrir', attrs: { type: 'submit' } });
  const formulaire = el('form', { attrs: { novalidate: true } }, el('label', { texte: 'Ta phrase', attrs: { for: 'phrase' } }), el('div', { classe: 'champ' }, champ, voir), bouton, erreur);
  formulaire.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!C.normaliserPhrase(champ.value)) {
      erreur.textContent = 'Tape ta phrase.';
      return;
    }
    bouton.disabled = true;
    bouton.textContent = "J'ouvre…";
    erreur.textContent = '';
    const resultat = await ouvrirAvecPhrase(champ.value);
    if (!resultat.ok) {
      bouton.disabled = false;
      bouton.textContent = 'Ouvrir';
      erreur.textContent = resultat.message;
      champ.select();
    }
  });
  const intro = etat.phraseChangee
    ? 'Ta phrase a changé sur ton PC : tape la nouvelle. Elle reste sur ce téléphone.'
    : "Tape la phrase que ton PC t'a donnée. Elle reste sur ce téléphone : rien d'autre ne la voit.";
  racine.replaceChildren(
    el(
      'main',
      { classe: 'verrou' },
      el('img', { attrs: { src: 'icone.svg', alt: '' } }),
      el('h1', { texte: 'Ton tableau de bord' }),
      el('p', { texte: intro }),
      formulaire,
      el('p', { classe: 'aide' }, 'Plus de phrase ? Sur ton PC : ', el('code', { texte: 'py -3 -I outils\\telephone.py phrase' })),
    ),
  );
  setTimeout(() => champ.focus(), 50);
}

async function ouvrirAvecPhrase(phrase) {
  try {
    let enveloppe = etat.enveloppe;
    if (!enveloppe) enveloppe = await chargerEnveloppe();
    if (!enveloppe) return { ok: false, message: "Ton PC n'a encore rien envoyé : réessaie dans quelques minutes." };
    if (!C.enveloppeValide(enveloppe)) return { ok: false, message: 'Le PC envoie une version que cette page ne connaît pas : recharge la page.' };
    const cle = await C.deriverCle(phrase, enveloppe.kdf.sel, enveloppe.kdf.iterations);
    const instantane = await C.dechiffrer(enveloppe, cle);
    const valeur = { cle, sel: enveloppe.kdf.sel, iterations: enveloppe.kdf.iterations };
    const garde = await rangerCle(valeur);
    etat.cle = valeur;
    etat.enveloppe = enveloppe;
    etat.instantane = instantane;
    etat.verifieLe = new Date();
    etat.phase = 'pret';
    etat.erreurVerrou = '';
    etat.phraseChangee = false;
    dessiner();
    if (!garde) avis("Ce navigateur n'a pas gardé ta phrase : il te la redemandera.");
    return { ok: true };
  } catch (erreur) {
    if (erreur?.code === 'cle') return { ok: false, message: "Ce n'est pas la bonne phrase. Majuscules, espaces et tirets ne comptent pas." };
    return { ok: false, message: 'Pas de réseau : réessaie dans un moment.' };
  }
}

function dessinerAttente() {
  elements = null;
  racine.replaceChildren(
    el(
      'main',
      { classe: 'verrou' },
      el('img', { attrs: { src: 'icone.svg', alt: '' } }),
      el('h1', { texte: 'Presque prêt' }),
      el('p', { texte: "Ton PC n'a encore rien envoyé. Il le fait dans les 2 minutes après l'installation, s'il est allumé ; je regarde toutes les 30 secondes." }),
      el('button', { classe: 'bouton large', texte: 'Regarder maintenant', attrs: { type: 'button' }, sur: { click: () => rafraichir({ manuel: true }) } }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Tirer pour rafraîchir (le navigateur ne le fait pas dans une appli posée sur l'écran d'accueil)
// ---------------------------------------------------------------------------

function brancherTirer() {
  let depart = null;
  let ecart = 0;
  let vibre = false;
  const indicateur = () => elements?.tirer;
  window.addEventListener(
    'touchstart',
    (e) => {
      if (window.scrollY > 0 || e.touches.length !== 1 || e.target.closest('.bande, dialog')) return;
      depart = e.touches[0].clientY;
      ecart = 0;
      vibre = false;
    },
    { passive: true },
  );
  window.addEventListener(
    'touchmove',
    (e) => {
      if (depart === null || !indicateur()) return;
      ecart = Math.max(0, e.touches[0].clientY - depart);
      const pret = ecart > SEUIL_TIRER;
      const t = indicateur();
      t.style.opacity = String(Math.min(1, ecart / SEUIL_TIRER));
      t.style.transform = `translateY(${Math.min(ecart, SEUIL_TIRER * 1.4) * 0.6 - 24}px) rotate(${ecart * 2}deg)`;
      t.classList.toggle('pret', pret);
      if (pret && !vibre) {
        vibre = true;
        navigator.vibrate?.(8);
      }
    },
    { passive: true },
  );
  const fin = async () => {
    if (depart === null) return;
    const lance = ecart > SEUIL_TIRER;
    depart = null;
    const t = indicateur();
    if (!t) return;
    if (lance) {
      t.classList.add('en-cours');
      t.style.transform = `translateY(${SEUIL_TIRER * 0.6 - 24}px)`;
      await rafraichir({ manuel: true });
    }
    const t2 = indicateur();
    if (t2) {
      t2.classList.remove('en-cours', 'pret');
      t2.style.opacity = '0';
      t2.style.transform = '';
    }
  };
  window.addEventListener('touchend', fin, { passive: true });
  window.addEventListener('touchcancel', fin, { passive: true });
}

// ---------------------------------------------------------------------------
// Le départ
// ---------------------------------------------------------------------------

async function demarrer() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    etat.installation = e;
  });
  window.addEventListener('hashchange', () => {
    const id = lireOngletDeLAdresse();
    if (id && id !== etat.onglet && etat.phase === 'pret') allerA(id);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') rafraichir();
  });
  window.addEventListener('online', () => rafraichir());
  setInterval(() => {
    if (document.visibilityState === 'visible') rafraichir();
  }, RAFRAICHIR_MS);
  // Les « il y a 4 min » se remettent à l'heure toutes les 30 s, jamais sous le doigt de Lucas.
  window.addEventListener('pointerdown', () => (derniereTouche = Date.now()), { passive: true });
  window.addEventListener('scroll', () => (derniereTouche = Date.now()), { passive: true });
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (etat.phase === 'pret' && !document.querySelector('dialog[open]') && Date.now() - derniereTouche > 5000) dessiner();
    if (etat.phase === 'attente') rafraichir();
  }, HORLOGE_MS);
  setInterval(() => {
    if (etat.phase === 'attente' && document.visibilityState === 'visible') rafraichir();
  }, ATTENTE_PREMIER_ENVOI_MS);
  etat.phase = 'chargement';
  etat.cle = await lireCle();
  try {
    const enveloppe = await chargerEnveloppe();
    etat.verifieLe = new Date();
    if (!enveloppe) etat.phase = 'attente';
    else await ouvrirEnveloppe(enveloppe);
  } catch (erreur) {
    if (erreur?.code === 'cle') {
      etat.phraseChangee = true;
      etat.cle = null;
    }
    etat.phase = 'verrou';
    if (erreur?.code !== 'cle') etat.erreurVerrou = navigator.onLine ? '' : "Pas de réseau pour l'instant.";
  }
  dessiner();
}

demarrer();
