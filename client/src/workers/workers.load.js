import { wrap as comlinkWrap } from 'comlink'

import { getUsager } from '@dugrema/millegrilles.reactjs'

import ConnexionWorker from './connexion.worker'
import { usagerDao } from '@dugrema/millegrilles.reactjs'

export async function setupWorkers() {
  const [
    connexion
  ] = await Promise.all([
    initialiserConnexion(),
  ])
  return {
    connexion
  }
}

async function initialiserConnexion() {
  const workerInstance = new ConnexionWorker()
  const webWorker = comlinkWrap(workerInstance)
  return { workerInstance, webWorker }
}

export async function preparerWorkersAvecCles(nomUsager, workers) {
  // Initialiser certificat de MilleGrille et cles si presentes
  // Sert aussi a initialiser/upgrader la base de donnees si nouvelle
  const usager = await usagerDao.getUsager(nomUsager)

  // Charger cle privee pour obtenir methodes sign et decrypt

  if(usager && usager.certificat) {
    console.debug("Usager charge : %O", usager)

    const ca = usager.ca,
          clePriveePem = usager.clePriveePem

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
          DEBUG: false
        }
      )
    })
    await Promise.all(promises)
  } else {
    throw new Error("Pas de cert")
  }
}
