import { proxy } from 'comlink'

const URL_SOCKET = '/millegrilles/socket.io'

export async function connecter(workers, setUsagerState, setEtatConnexion, setEtatFormatteurMessage) {
    // console.debug("!!! setEtatConnexion :%O, setEtatFormatteur : %O", setEtatConnexion, setEtatFormatteurMessage)
    const { connexion } = workers
  
    // console.debug("Set callbacks connexion worker")
    const location = new URL(window.location.href)
    location.pathname = URL_SOCKET
    console.info("Connecter a %O", location.href)

    // Preparer callbacks
    const setUsagerCb = proxy( usager => setUsager(workers, usager, setUsagerState) )
    const setEtatConnexionCb = proxy(setEtatConnexion)
    const setEtatFormatteurMessageCb = proxy(setEtatFormatteurMessage)

    // await connexion.setCallbacks(setEtatConnexionCb, setUsagerCb, setEtatFormatteurMessageCb)

    // // return connexion.connecter(location.href, {DEBUG: true})
    // return connexion.connecter(location.href, {reconnectionDelay: 5_000})

    await connexion.configurer(location.href, setEtatConnexionCb, setUsagerCb, setEtatFormatteurMessageCb, 
        {DEBUG: true, reconnectionDelay: 5_000})

    return connexion.connecter()
}

// export async function connecter(workers, setUsagerState, setEtatConnexion, setEtatFormatteurMessage) {
//     const { connexion } = workers
  
//     // console.debug("Set callbacks connexion worker")
//     const location = new URL(window.location.href)
//     location.pathname = CONST_APP_URL

//     // Preparer callbacks
//     const setUsagerCb = proxy( usager => setUsager(workers, usager, setUsagerState) )
//     const setEtatConnexionCb = proxy(setEtatConnexion)
//     const setEtatFormatteurMessageCb = proxy(setEtatFormatteurMessage)
//     await connexion.setCallbacks(setEtatConnexionCb, setUsagerCb, setEtatFormatteurMessageCb)

//     // try {
//     //     const axiosImport = await import('axios')
//     //     const axios = axiosImport.default
//     //     await axios.get('/auth/verifier_usager')
//     // } catch(err) {
//     //     const response = err.response || {}
//     //     if(response.status === 401) {
//     //         // Ok, session n'est pas active
//     //         console.debug("Session n'est pas active")
//     //     } else {
//     //         console.error("Erreur init session : %O", err)
//     //         throw new Error(err)
//     //     }
//     // }

//     console.info("Connecter a %O", location.href)
//     return connexion.connecter(location.href, {DEBUG: true})
// }

export async function setUsager(workers, nomUsager, setUsagerState, opts) {
    opts = opts || {}

    console.debug("setUsager nomUsager %O, opts %O", nomUsager, opts)

    // Desactiver usager si deja connecte - permet de reauthentifier 
    // (i.e. useEtatPret === false tant que socket serveur pas pret)
    await setUsagerState('')

    if(!nomUsager) return  // Unset de l'usager/session

    // console.debug("setUsager '%s'", nomUsager)
    const { usagerDao, forgecommon } = await import('@dugrema/millegrilles.reactjs')
    const { pki } = await import('@dugrema/node-forge')
    const { extraireExtensionsMillegrille } = forgecommon
    const usager = await usagerDao.getUsager(nomUsager)
    // console.debug("Usager info : %O", usager)
    
    if(usager && usager.certificat) {
        const { connexion } = workers
        const fullchain = usager.certificat

        const certificatPem = fullchain.join('')

        // Init cles privees
        await connexion.initialiserFormatteurMessage(certificatPem, usager.clePriveePem, {DEBUG: false})
    
        const certForge = pki.certificateFromPem(fullchain[0])
        const extensions = extraireExtensionsMillegrille(certForge)
        const userId = extensions.userId

        // Authentifier
        console.debug("setUsager Authentifier %s, %O", nomUsager, extensions)
        const reponseAuthentifier = await workers.connexion.authentifier(null, {noCallback: true})
        console.debug("setUsager Reponse authentifier : %O", reponseAuthentifier)

        const { protege: socketIoAuth, delegations_date, delegations_version, certificat, ca } = reponseAuthentifier

        await setUsagerState({...usager, userId, nomUsager, extensions, auth: socketIoAuth, socketioAuth: socketIoAuth, 
            /*updates: {delegations_date, delegations_version, certificat, ca}*/ 
        })
    } else {
        console.warn("Pas de certificat pour l'usager %O", usager)
    }

}
