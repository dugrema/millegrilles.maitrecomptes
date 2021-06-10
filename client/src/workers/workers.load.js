import { wrap as comlinkWrap } from 'comlink'

import { getCertificats, getClesPrivees } from '@dugrema/millegrilles.common/lib/browser/dbUsager'

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
