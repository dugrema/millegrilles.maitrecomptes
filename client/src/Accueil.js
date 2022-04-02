import {useState, useEffect, useCallback} from 'react'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'

import {BoutonAjouterWebauthn} from './WebAuthn'
import Applications from './Applications'

function Accueil(props) {
    console.debug("Proppies : %O", props)

    const { 
        workers, etatConnexion, usagerDbLocal, resultatAuthentificationUsager, 
        confirmationCb, erreurCb, 
    } = props
    const { connexion } = workers
    const { nomUsager } = usagerDbLocal

    const [infoUsagerBackend, setInfoUsagerBackend] = useState('')

    useEffect(()=>{
        connexion.chargerCompteUsager()
            .then(infoUsagerBackend=>{
                console.debug("Etat usager backend : %O", infoUsagerBackend)
                setInfoUsagerBackend(infoUsagerBackend)
            })
            .catch(err=>erreurCb(err))
    }, [connexion, nomUsager, setInfoUsagerBackend, erreurCb])

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

function DemanderEnregistrement(props) {

    const { workers, usagerDbLocal, infoUsagerBackend, confirmationCb, erreurCb } = props
    // const { connexion } = workers
    // const { nomUsager } = usagerDbLocal

    const [webauthnActif, setWebauthnActif] = useState(true)
    const confirmationEnregistrement = useCallback(message=>{
        setWebauthnActif(true)  // Toggle alert
        confirmationCb(message)
    }, [confirmationCb, setWebauthnActif])

    useEffect(()=>{
        const credentials = infoUsagerBackend.webauthn || []
        const actif = credentials.length > 0
        setWebauthnActif(actif)
    }, [infoUsagerBackend])

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
        workers, usagerDbLocal, infoUsagerBackend, resultatAuthentificationUsager, 
        confirmationCb, erreurCb, 
    } = props
    // const { connexion } = workers
    // const { nomUsager } = usagerDbLocal

    const [versionObsolete, setVersionObsolete] = useState(true)
    // const confirmationEnregistrement = useCallback(message=>{
    //     setWebauthnActif(true)  // Toggle alert
    //     confirmationCb(message)
    // }, [confirmationCb, setWebauthnActif])

    useEffect(()=>{
        console.debug("UsagerDBLocal : %O, resultat auth : %O", usagerDbLocal, infoUsagerBackend)
        const versionLocale = usagerDbLocal.delegations_version,
              versionBackend = infoUsagerBackend.delegations_version
        setVersionObsolete(versionLocale !== versionBackend)
    }, [usagerDbLocal, infoUsagerBackend])

    return (
        <Alert variant='info' show={versionObsolete}>
            <Alert.Heading>Nouveau certificat disponible</Alert.Heading>
            <p>
                De nouvelles informations ou droits d'acces sont disponibles pour votre compte. 
                Cliquez sur le bouton <i>Mettre a jour</i> et suivez les instructions pour mettre a jour 
                le certificat de securite sur ce navigateur.
            </p>

            <Button variant="secondary">Mettre a jour</Button>
        </Alert>
    )

    // return (
    //     <Alert show={!webauthnActif} variant="warning">
    //         <p>
    //             Ajouter au moins une methode d'authentification.
    //         </p>
    //         <BoutonAjouterWebauthn 
    //             workers={workers}
    //             usagerDbLocal={usagerDbLocal}
    //             confirmationCb={confirmationEnregistrement}
    //             erreurCb={erreurCb}
    //             variant="secondary">
    //             Ajouter methode
    //         </BoutonAjouterWebauthn>

    //     </Alert>
    // )

}

