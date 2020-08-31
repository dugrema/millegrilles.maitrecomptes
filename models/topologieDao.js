const debug = require('debug')('millegrilles:maitrecomptes:comptesUsagers')

class Topologie {

  constructor(amqDao) {
    this.amqDao = amqDao
    this.idmg = amqDao.pki.idmg
    this.proprietairePresent = false
  }

  getListeApplications = async (securite) => {

    const domaineAction = 'Topologie.listeApplicationsDeployees'
    const requete = { securite }

    var listeApplications = []
    try {
      debug("Requete info applications securite %s", securite)
      listeApplications = await this.amqDao.transmettreRequete(
        domaineAction, requete, {decoder: true})

      debug("Reponse applications")
      debug(listeApplications)

      // Trier
      listeApplications.sort((a,b)=>{
        return a.application.localeCompare(b.application)
      })
    } catch(err) {
      debug("Erreur traitement liste applications\n%O", err)
    }

    return listeApplications

  }

}

// Fonction qui injecte l'acces aux comptes usagers dans req
function init(amqDao) {
  const topologieDao = new Topologie(amqDao)

  const injecterTopologie = async (req, res, next) => {
    debug("Injection req.topologieDao")
    req.topologieDao = topologieDao  // Injecte db de comptes
    next()
  }

  return {injecterTopologie}
}

module.exports = {init}
