import { wrap as comlinkWrap } from 'comlink'

import { getUsager } from '@dugrema/millegrilles.reactjs'

// import ChiffrageWorker from '@dugrema/millegrilles.reactjs/lib/browser/chiffrage.worker'
import ConnexionWorker from './connexion.worker'

export async function setupWorkers() {
  const [
    // chiffrage, 
    connexion
  ] = await Promise.all([
    // initialiserWorkerChiffrage(),
    initialiserConnexion(),
  ])

  console.debug("Workers prets")
  return {
    // chiffrage, 
    connexion
  }
}

async function initialiserWorkerChiffrage(callbackCleMillegrille) {
  throw new Error("fix me")
  // const workerInstance = new ChiffrageWorker()
  // const webWorker = await comlinkWrap(workerInstance)
  // return { workerInstance, webWorker }
}

async function initialiserConnexion() {
  const workerInstance = new ConnexionWorker()
  const webWorker = await comlinkWrap(workerInstance)
  return { workerInstance, webWorker }
}

export async function preparerWorkersAvecCles(nomUsager, workers) {
  // Initialiser certificat de MilleGrille et cles si presentes
  // Sert aussi a initialiser/upgrader la base de donnees si nouvelle
  const usager = await getUsager(nomUsager, {upgrade: true})

  // Charger cle privee pour obtenir methodes sign et decrypt

  if(usager && usager.certificat) {
    console.debug("Usager charge : %O", usager)

    const certificat = usager.certificat,
          ca = usager.ca,
          clePriveePem = usager.clePriveePem
    // const clesPrivees = await getClesPrivees(nomUsager)

    // Initialiser le CertificateStore
    const promises = workers.map(async worker=>{

      if(!worker) return

      try {
        await worker.initialiserCertificateStore(ca, {isPEM: true, DEBUG: true})
      } catch(err) {
        // console.debug("Methode initialiserCertificateStore non presente sur worker")
      }

      console.debug("Initialiser formatteur message")
      return worker.initialiserFormatteurMessage(
        usager.certificat,
        clePriveePem,
        {
          DEBUG: true
        }
      )
    })
    await Promise.all(promises)
  } else {
    throw new Error("Pas de cert")
  }
}
