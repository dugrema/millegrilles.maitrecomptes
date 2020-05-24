const debug = require('debug')('millegrilles:comptesUsagers')

class ComptesUsagers {

  constructor(amqDao) {
    this.amqDao = amqDao
  }

  cacheComptes = {}

  chargerCompte = async (nomUsager) => {
    // const compte = this.cacheComptes[nomUsager]
    // if(compte) {
    //   compte.dateAcces = new Date()  // Update dernier acces au compte
    //   return compte
    // }
    // return null

    const domaineAction = 'MaitreDesComptes.chargerUsager'
    const requete = {nomUsager}
    debug("Requete compte usager %s", nomUsager)
    const compteUsager = await this.amqDao.transmettreRequete(
      domaineAction, requete, {decoder: true})

    if(compteUsager.nomUsager) {
      debug("Requete compte usager, recu %s : %s", nomUsager, compteUsager)
      return compteUsager
    } else {
      debug("Requete compte usager, compte %s inexistant", nomUsager)
      return false
    }

  }

  inscrireCompte = async (nomUsager, compte) => {
    compte.dateAcces = new Date()  // Insere date d'acces au compte
    this.cacheComptes[nomUsager] = compte
  }

  changerMotdepasse = async (nomUsager, motdepasse) => {

  }

  supprimerMotdepasse = async (nomUsager) => {

  }

  ajouterCle = async (nomUsager, cle) => {

  }

  supprimerCles = async (nomUsager) => {

  }

  supprimerUsager = async (nomUsager) => {

  }

}

// Fonction qui injecte l'acces aux comptes usagers dans req
function init(amqDao) {
  const comptesUsagers = new ComptesUsagers(amqDao)

  const middleware = async (req, res, next) => {
    debug("Injection req.comptesUsagers")
    req.comptesUsagers = comptesUsagers  // Injecte db de comptes
    await extraireUsager(req)  // Injecte l'usager sous req.nomUsager
    next()
  }

  return middleware
}

async function extraireUsager(req) {

  const nomUsager = req.nomUsager  // Doit avoir ete lu par sessions.js
  if(nomUsager) {
    debug('Nom usager %s', nomUsager)

    // Extraire compte usager s'il existe
    const compte = await req.comptesUsagers.chargerCompte(nomUsager)
    if(compte) {
      req.compteUsager = compte
    }
  }

}

module.exports = {init}
