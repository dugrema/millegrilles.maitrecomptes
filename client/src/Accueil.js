import {useState, useEffect, useCallback} from 'react'
import Alert from 'react-bootstrap/Alert'

import {BoutonAjouterWebauthn, BoutonMajCertificatWebauthn} from './WebAuthn'
import Applications from './Applications'

function Accueil(props) {
    const { 
        workers, etatConnexion, usagerDbLocal, setUsagerDbLocal, 
        resultatAuthentificationUsager, 
        confirmationCb, erreurCb, 
    } = props
    const { connexion } = workers
    const { nomUsager } = usagerDbLocal

    const [formatteurReady, setFormatteurReady] = useState(false)
    const [infoUsagerBackend, setInfoUsagerBackend] = useState('')

    useEffect(()=>{
        // Attendre le formatteur de messages - requis sur changement de certificat (e.g. inscription)
        attendreFormatteurMessage(connexion, setFormatteurReady)
            .catch(err=>erreurCb(err))
    }, [connexion, setFormatteurReady, erreurCb])

    useEffect(()=>{
        if(!formatteurReady) return
        connexion.chargerCompteUsager()
            .then(infoUsagerBackend=>setInfoUsagerBackend(infoUsagerBackend))
            .catch(err=>erreurCb(err))
    }, [formatteurReady, connexion, nomUsager, setInfoUsagerBackend, erreurCb])

    if(!formatteurReady) return 'Chargement en cours'

    return (
        <>
            <h1>Accueil</h1>
            <DemanderEnregistrement 
                workers={workers} 
                usagerDbLocal={usagerDbLocal}
                infoUsagerBackend={infoUsagerBackend}
                confirmationCb={confirmationCb}
                erreurCb={erreurCb} />

            <UpdateCertificat
                workers={workers} 
                usagerDbLocal={usagerDbLocal}
                setUsagerDbLocal={setUsagerDbLocal}
                infoUsagerBackend={infoUsagerBackend}
                resultatAuthentificationUsager={resultatAuthentificationUsager}
                confirmationCb={confirmationCb}
                erreurCb={erreurCb} />

            <Applications 
                workers={workers} 
                etatConnexion={etatConnexion} />
        </>
    )
}

export default Accueil

async function attendreFormatteurMessage(connexion, setFormatteurReady, count) {
    count = count || 1
    if(count > 20) throw new Error("Formatteur de message n'est pas pret")

    const ready = await connexion.isFormatteurReady()
    if(!ready) {
        setTimeout(() => attendreFormatteurMessage(connexion, setFormatteurReady, ++count), 100)
    } else {
        setFormatteurReady(ready)
    }
}

function DemanderEnregistrement(props) {

    const { workers, usagerDbLocal, infoUsagerBackend, confirmationCb, erreurCb } = props
    // const { connexion } = workers
    // const { nomUsager } = usagerDbLocal

    const [webauthnActif, setWebauthnActif] = useState(false)
    const confirmationEnregistrement = useCallback(message=>{
        setWebauthnActif(true)  // Toggle alert
        confirmationCb(message)
    }, [confirmationCb, setWebauthnActif])

    useEffect(()=>{
        if(usagerDbLocal && infoUsagerBackend) {
            const fingerprintCourant = usagerDbLocal.fingerprintPk
            const webauthn = infoUsagerBackend.webauthn
            const activations = infoUsagerBackend.activations_par_fingerprint_pk
            console.debug("!!! fingerprint : %s, Activations : %O", fingerprintCourant, activations)
            if(activations && activations[fingerprintCourant]) {
                const infoActivation = activations[fingerprintCourant]
                if(infoActivation.associe === false) {
                    return setWebauthnActif(false)
                }
            } else if(webauthn) {
                const credentials = infoUsagerBackend.webauthn || []
                const actif = credentials.length > 0
                return setWebauthnActif(actif)
            } 
        }

        setWebauthnActif(true)
    }, [usagerDbLocal, infoUsagerBackend])

    // useEffect(()=>{
    //     connexion.getInfoUsager(nomUsager)
    //         .then(etatUsagerBackend=>{
    //             console.debug("Etat usager backend : %O", etatUsagerBackend)
    //             const actif = etatUsagerBackend.challengeWebauthn?true:false
    //             setWebauthnActif(actif)
    //         })
    //         .catch(err=>console.error("Erreur chargement usager : %O", err))
    // }, [connexion, setWebauthnActif, nomUsager])

    return (
        <Alert show={!webauthnActif} variant="warning">
            <p>
                Ajouter au moins une methode d'authentification.
            </p>
            <BoutonAjouterWebauthn 
                workers={workers}
                usagerDbLocal={usagerDbLocal}
                confirmationCb={confirmationEnregistrement}
                erreurCb={erreurCb}
                variant="secondary">
                Ajouter methode
            </BoutonAjouterWebauthn>

        </Alert>
    )
}

function UpdateCertificat(props) {
    const { 
        workers, usagerDbLocal, setUsagerDbLocal, infoUsagerBackend, 
        resultatAuthentificationUsager, confirmationCb, erreurCb, 
    } = props

    const [versionObsolete, setVersionObsolete] = useState(false)

    const confirmationCertificatCb = useCallback( resultat => {
        // console.debug("Resultat update certificat : %O", resultat)
        confirmationCb(resultat)
    }, [confirmationCb])

    useEffect(()=>{
        console.debug("UsagerDBLocal : %O, infoUsagerBackend : %O", usagerDbLocal, infoUsagerBackend)
        if(infoUsagerBackend && usagerDbLocal) {
            const versionLocale = usagerDbLocal.delegations_version,
                versionBackend = infoUsagerBackend.delegations_version

            if(!versionBackend) {
                setVersionObsolete(false)  // Desactiver si on n'a pas d'info du backend
            } else {
                setVersionObsolete(versionLocale !== versionBackend)
            }
        }
    }, [usagerDbLocal, infoUsagerBackend])

    return (
        <Alert variant='info' show={versionObsolete}>
            <Alert.Heading>Nouveau certificat disponible</Alert.Heading>
            <p>
                De nouvelles informations ou droits d'acces sont disponibles pour votre compte. 
                Cliquez sur le bouton <i>Mettre a jour</i> et suivez les instructions pour mettre a jour 
                le certificat de securite sur ce navigateur.
            </p>

            <BoutonMajCertificatWebauthn 
                workers={workers}
                usagerDbLocal={usagerDbLocal}
                setUsagerDbLocal={setUsagerDbLocal}
                resultatAuthentificationUsager={resultatAuthentificationUsager}
                confirmationCb={confirmationCertificatCb}
                erreurCb={erreurCb}            
                variant="secondary">
                Mettre a jour
            </BoutonMajCertificatWebauthn>
        </Alert>
    )
}

