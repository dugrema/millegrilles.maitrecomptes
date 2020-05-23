const debug = require('debug')('millegrilles:comptesUsagers');

class ComptesUsagers {

  cacheComptes = {}

  chargerCompte = nomUsager => {
    const compte = this.cacheComptes[nomUsager]
    if(compte) {
      compte.dateAcces = new Date()  // Update dernier acces au compte
      return compte
    }
    return null
  }

  setCompte = (nomUsager, compte) => {
    compte.dateAcces = new Date()  // Insere date d'acces au compte
    this.cacheComptes[nomUsager] = compte
  }

}

// Fonction qui injecte l'acces aux comptes usagers dans req
function init() {
  const comptesUsagers = new ComptesUsagers()

  const middleware = (req, res, next) => {
    debug("Injection req.comptesUsagers")
    req.comptesUsagers = comptesUsagers  // Injecte db de comptes
    extraireUsager(req)  // Injecte l'usager sous req.nomUsager

    next()
  }

  return middleware
}

function extraireUsager(req) {

  const nomUsager = req.nomUsager  // Doit avoir ete lu par sessions.js
  if(nomUsager) {
    debug('Nom usager %s', nomUsager)

    // Extraire compte usager s'il existe
    const compte = req.comptesUsagers.chargerCompte(nomUsager)
    if(compte) {
      req.compteUsager = compte
    }
  }

}

module.exports = {init}
