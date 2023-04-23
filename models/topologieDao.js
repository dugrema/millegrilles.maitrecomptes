const debug = require('debug')('topologieDao')
// const { verifierSignatureCertificat } = require('@dugrema/millegrilles.common/lib/authentification')
// const { validerChaineCertificats, extraireExtensionsMillegrille } = require('@dugrema/millegrilles.common/lib/forgecommon')
const { extraireExtensionsMillegrille } = require('@dugrema/millegrilles.utiljs/src/forgecommon')
const { verifierSignatureMessage } = require('@dugrema/millegrilles.nodejs/src/validateurMessage')

// const { extraireExtensionsMillegrille } = forgecommon
// const { verifierSignatureMessage } = validateurMessage  // require('@dugrema/millegrilles.common/lib/validateurMessage')

const { setCacheValue, getCacheValue, expireCacheValue } = require('./cache')

const CACHE_APPLICATIONS = 'applications'

class TopologieDao {

  constructor(amqDao) {
    this.amqDao = amqDao
    this.pki = amqDao.pki
    this.idmg = this.pki.idmg
    this.proprietairePresent = false
  }

  getListeApplications = async (params) => {
    /* Recupere la liste d'applications accessible a l'usager. Le certificat
       est utilise pour determiner le niveau d'acces. */

    debug("topologieDao.getListeApplications %O", params)

    const cacheValue = getCacheValue(CACHE_APPLICATIONS)
    let listeApplicationsReponse = null
    if(cacheValue) {
      debug("topologieDao.getListeApplications Utilisation cache applications ", cacheValue)
      listeApplicationsReponse = JSON.parse(cacheValue.contenu).resultats
    } else {
      debug("topologieDao.getListeApplications Cache miss sur liste applications")

      const domaine = 'CoreTopologie'
      const action = 'listeApplicationsDeployees'
      const requete = {}

      try {
        debug("Requete info applications securite")
        const reponse = await this.amqDao.transmettreRequete(
          domaine, requete, {action, exchange: '2.prive', decoder: true})
        debug("Reponse serveur : ", reponse)

        if(!reponse || reponse.ok === false || !reponse.resultats) {
          return {ok: false, err: 'Reponse serveur ok === false'}
        }
        setCacheValue(CACHE_APPLICATIONS, reponse['__original'])
        listeApplicationsReponse = reponse.resultats
      } catch(err) {
        console.error("topologieDao.getListeApplications Erreur chargement liste applications : %O", err)
        return {ok: false, err: ''+err}
      }
    }

    try {
      debug("Reponse applications\n%O", listeApplicationsReponse)

      // Extraire le niveau de securite du certificat usager
      // delegationGlobale === 3.protege, compte_prive === 2.prive sinon 1.public
      const cert = await this.pki.validerCertificat(params['certificat'])
      const valide = await verifierSignatureMessage(params, cert)
      const extensions = extraireExtensionsMillegrille(cert)
      debug("Resultat verification demande apps : valide?%s, ext: %O", valide, extensions)

      let niveauSecurite = 1,
          roles = extensions.roles || [],
          delegationGlobale = extensions.delegationGlobale || ''

      if(!valide) {
        niveauSecurite = 1
      } else if(['proprietaire', 'delegue'].includes(delegationGlobale)) {
        niveauSecurite = 3
      } else if(roles.includes('compte_prive')) {
        niveauSecurite = 2
      }

      const listeApplications = listeApplicationsReponse.filter(item=>{
        const securiteApp = Number(item.securite.split('.')[0])
        return securiteApp <= niveauSecurite
      })

      return listeApplications
    } catch(err) {
      debug("topologieDao.getListeApplications Erreur traitement liste applications\n%O", err)
      expireCacheValue(CACHE_APPLICATIONS)  // Clear cache
      return {ok: false, err: ''+err}
    }

  }
}

// // Fonction qui injecte l'acces aux comptes usagers dans req
// function init(amqDao) {
//   const topologieDao = new Topologie(amqDao)
//
//   const injecterTopologie = async (req, res, next) => {
//     debug("Injection req.topologieDao")
//     req.topologieDao = topologieDao  // Injecte db de comptes
//     next()
//   }
//
//   return {injecterTopologie}
// }

module.exports = {TopologieDao}
