import {wrap as comlinkWrap, /* releaseProxy*/ } from 'comlink'
// import axios from 'axios'

import { getCertificats, getClesPrivees } from '@dugrema/millegrilles.common/lib/browser/dbUsager'
// import { splitPEMCerts } from '@dugrema/millegrilles.common/lib/forgecommon'

import ChiffrageWorker from '@dugrema/millegrilles.common/lib/browser/chiffrage.worker'
import ConnexionWorker from './connexion.worker'

export async function setupWorkers() {
  const [chiffrage, connexion] = await Promise.all([
    initialiserWorkerChiffrage(),
    initialiserConnexion(),
  ])

  console.debug("Workers prets")
  return {chiffrage, connexion}
}

// export function cleanupWorkers(app) {
//   /* Fonction pour componentWillUnmount : cleanupWorkers(this) */
//
//   try {
//     if(app.state.chiffrageWorker) {
//       // console.debug("Nettoyage worker chiffrage, release proxy")
//       app.state.chiffrageWorker[releaseProxy]()
//       app.state.chiffrageInstance.terminate()
//       app.setState({chiffrageWorker: null, chiffrageInstance: null})
//     }
//   } catch(err) {console.error("Erreur fermeture worker chiffrage")}
//
//   try {
//     if(app.state.connexionWorker) {
//       // console.debug("Nettoyage worker connnexion, release proxy")
//       app.state.connexionWorker[releaseProxy]()
//       app.state.connexionInstance.terminate()
//       app.setState({connexionWorker: null, connexionInstance: null})
//     }
//   } catch(err) {console.error("Erreur fermeture worker connexion")}
//
//   try {
//     if(app.state.x509Worker) {
//       // console.debug("Nettoyage worker x509, release proxy")
//       app.state.x509Worker[releaseProxy]()
//       app.state.x509Instance.terminate()
//       app.setState({x509Worker: null, x509Instance: null})
//     }
//   } catch(err) {console.error("Erreur fermeture worker x509")}
//
//   try {
//     if(app.state.resourceResolverWorker) {
//       // console.debug("Nettoyage worker x509, release proxy")
//       app.state.resourceResolverWorker[releaseProxy]()
//       app.state.resourceResolverInstance.terminate()
//       app.setState({resourceResolverWorker: null, resourceResolverInstance: null})
//     }
//   } catch(err) {console.error("Erreur fermeture worker resourceResolver")}
// }

async function initialiserWorkerChiffrage(callbackCleMillegrille) {
  const workerInstance = new ChiffrageWorker()
  const webWorker = await comlinkWrap(workerInstance)
  return { workerInstance, webWorker }
}

async function initialiserConnexion() {
  const workerInstance = new ConnexionWorker()
  const webWorker = await comlinkWrap(workerInstance)
  return { workerInstance, webWorker }
}

export async function preparerWorkersAvecCles(nomUsager, workers) {
  // Initialiser certificat de MilleGrille et cles si presentes
  const certInfo = await getCertificats(nomUsager)
  if(certInfo && certInfo.fullchain) {
    const fullchain = certInfo.fullchain
    const clesPrivees = await getClesPrivees(nomUsager)

    // Initialiser le CertificateStore
    const promises = workers.map(async worker=>{

      try {
        await worker.initialiserCertificateStore([...fullchain].pop(), {isPEM: true, DEBUG: false})
      } catch(err) {
        // console.debug("Methode initialiserCertificateStore non presente sur worker")
      }

      // console.debug("Initialiser formatteur message")
      return worker.initialiserFormatteurMessage({
        certificatPem: certInfo.fullchain,
        clePriveeSign: clesPrivees.signer,
        clePriveeDecrypt: clesPrivees.dechiffrer,
        DEBUG: false
      })
    })
    await Promise.all(promises)
  } else {
    throw new Error("Pas de cert")
  }
}
