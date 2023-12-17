import { wrap, releaseProxy } from 'comlink'

import { usagerDao } from '@dugrema/millegrilles.reactjs'

let _block = false

export function setupWorkers() {
    //if(_block) throw new Error("double init")
    //_block = true

    // Chiffrage et x509 sont combines, reduit taille de l'application
    const connexion = wrapWorker(new Worker(new URL('./connexion.worker', import.meta.url), {type: 'module'}))
  
    const workerInstances = { connexion }
  
    const workers = Object.keys(workerInstances).reduce((acc, item)=>{
        acc[item] = workerInstances[item].proxy
        return acc
      }, {})

    // Pseudo-worker
    workers.usagerDao = usagerDao                   // IDB usager

    // Wiring
    //console.info("WIRE WORKERS start")
    const ready = wireWorkers(workers)
    //console.info("WIRE WORKERS OK")

    return { workerInstances, workers, ready }
}

async function wireWorkers(workers) {
    const { connexion } = workers
    
    const location = new URL(window.location)
    location.pathname = '/fiche.json'
    // console.debug("Charger fiche ", location.href)
  
    const axiosImport = await import('axios')
    const axios = axiosImport.default
    const reponse = await axios.get(location.href)

    try {
        const fiche = reponse.data || {}
        const contenuFiche = JSON.parse(fiche.contenu)
        // console.debug("wireWorkers avec fiche ", contenuFiche)
        const ca = contenuFiche.ca
        if(ca) {
            // console.debug("initialiserCertificateStore (connexion, chiffrage)")
            await connexion.initialiserCertificateStore(ca, {isPEM: true, DEBUG: false})
        }
    } catch(err) {
        console.error("wireWorkers Erreur chargement fiche ", err)
        throw err
    }
}

function wrapWorker(worker) {
    const proxy = wrap(worker)
    return {proxy, worker}
}

export function cleanupWorkers(workers) {
    console.info("Cleanup workers")
    Object.values(workers).forEach((workerInstance) => {
        try {
            const {worker, proxy} = workerInstance
            try {
                const resultat = proxy.disconnectCleanup()
                    .then(()=>{
                        console.debug("CleanupWorkers disconnect cleanup result : %O", resultat)
                    })
                    .catch(err=>console.warn("Disconnect cleanup error : %O", err))
            } catch(err) {
                console.warning("cleanupWorkers Erreur ", err)
            }
            proxy[releaseProxy]()
            worker.terminate()
        } catch(err) {
            console.warn("Errreur fermeture worker : %O\n(Workers: %O)", err, workers)
        }
    })
}
