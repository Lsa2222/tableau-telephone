# Tableau de bord, version téléphone

Ce dépôt est publié tout seul par le tableau de bord de Lucas (son appli de bureau), en un seul commit qui remplace le
précédent : il n'a pas d'historique, et il ne faut rien y écrire à la main.

- `index.html`, `appli.js`, `calcul.js`, `style.css`, `sw.js` : la page, faite pour un téléphone.
- `donnees.json` : le tableau de bord, **chiffré sur le PC** avant de partir (AES-256-GCM, clé tirée d'une phrase par
  PBKDF2-SHA256, 600 000 tours). Sans la phrase, il est illisible ; la phrase n'est ni ici, ni sur le PC.

La source est dans le dépôt privé du tableau de bord (`telephone/`, `electron/telephone.cjs`, `outils/telephone.py`).
