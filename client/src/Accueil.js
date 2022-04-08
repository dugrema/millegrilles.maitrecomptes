import {useState, useEffect, useCallback} from 'react'
import Alert from 'react-bootstrap/Alert'

import {BoutonAjouterWebauthn, BoutonMajCertificatWebauthn} from './WebAuthn'
import Applications from './Applications'

function Accueil(props) {
    const { 
        workers, etatAuthentifie, usagerDbLocal, setUsagerDbLocal, 
        resultatAuthentificationUsager, 
        confirmationCb, erreurCb, 
    } = props
    const { connexion } = workers
    const { nomUsager } = usagerDbLocal

    const [infoUsagerBackend, setInfoUsagerBackend] = useState('')

    useEffect(()=>{
        if(etatAuthentifie !== true || !connexion) return
        console.debug("Nouvelle requete chargerCompteUsager")
        // Charge le compte usager (via userId du certificat)
        connexion.chargerCompteUsager()
            .then(infoUsagerBackend=>setInfoUsagerBackend(infoUsagerBackend))
            .catch(err=>{
                console.error("Erreur chargerCompteUsager : %O", err)
                erreurCb(err)
            })
    }, [etatAuthentifie, connexion, setInfoUsagerBackend, erreurCb])

    if(!infoUsagerBackend) return 'Chargement en cours'

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
                etatAuthentifie={etatAuthentifie} />
        </>
    )
}

export default Accueil

function DemanderEnregistrement(props) {

    const { workers, usagerDbLocal, infoUsagerBackend, confirmationCb, erreurCb } = props

    const [webauthnActif, setWebauthnActif] = useState(true)  // Par defaut, on assume actif (pas de warning).

    const confirmationEnregistrement = useCallback(message=>{
        setWebauthnActif(true)  // Toggle alert
        confirmationCb(message)
    }, [confirmationCb, setWebauthnActif])

    useEffect(()=>{
        if(usagerDbLocal && infoUsagerBackend) {
            const fingerprintCourant = usagerDbLocal.fingerprintPk
            const webauthn = infoUsagerBackend.webauthn
            const activations = infoUsagerBackend.activations_par_fingerprint_pk

            if(activations && activations[fingerprintCourant]) {
                const infoActivation = activations[fingerprintCourant]
                if(infoActivation.associe === false) {
                    // Le navigateur est debloque - on affiche le warning
                    return setWebauthnActif(false)
                }
            } 
            
            if(webauthn) {
                const credentials = infoUsagerBackend.webauthn || []
                const actif = credentials.length > 0
                // S'assurer qu'on a au moins 1 credential webauthn sur le compte
                return setWebauthnActif(actif)
            } 
            
        }

        // Aucune methode webauthn trouvee
        setWebauthnActif(false)
    }, [usagerDbLocal, infoUsagerBackend])

    return (
        <Alert show={!webauthnActif} variant="warning">
            <p>
                Votre compte est debloque sur ce navigateur. Pour augmenter votre niveau de securite, il faut 
                ajouter au moins une methode d'authentification forte.
            </p>

            <p>Cliquez sur le bouton Ajouter pour enregistrer une nouvelle methode.</p>

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

