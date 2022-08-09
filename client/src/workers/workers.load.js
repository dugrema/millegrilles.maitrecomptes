import { wrap } from 'comlink'

// import ConnexionWorker from './connexion.worker'
import { usagerDao } from '@dugrema/millegrilles.reactjs'

export function setupWorkers() {
  const connexion = chargerConnexionWorker()
  return { connexion }
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

function chargerConnexionWorker() {
  const worker = new Worker(new URL('./connexion.worker', import.meta.url), {type: 'module'})
  const proxy = wrap(worker)
  console.debug("Nouveau worker (%O) / proxy (%O) initialises", worker, proxy)
  return {proxy, worker}
}