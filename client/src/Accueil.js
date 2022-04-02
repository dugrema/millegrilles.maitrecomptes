import {useState, useEffect, useCallback} from 'react'
import Alert from 'react-bootstrap/Alert'

import {BoutonAjouterWebauthn} from './WebAuthn'
import Applications from './Applications'

function Accueil(props) {
    console.debug("Proppies : %O", props)

    const { workers, etatConnexion, usagerDbLocal, confirmationCb, erreurCb } = props

    return (
        <>
            <h1>Accueil</h1>
            <DemanderEnregistrement 
                workers={workers} 
                usagerDbLocal={usagerDbLocal}
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

    const { workers, usagerDbLocal, confirmationCb, erreurCb } = props
    const { connexion } = workers
    const { nomUsager } = usagerDbLocal

    const [webauthnActif, setWebauthnActif] = useState(true)
    const confirmationEnregistrement = useCallback(message=>{
        setWebauthnActif(true)  // Toggle alert
        confirmationCb(message)
    }, [confirmationCb, setWebauthnActif])

    useEffect(()=>{
        connexion.getInfoUsager(nomUsager)
            .then(etatUsagerBackend=>{
                console.debug("Etat usager backend : %O", etatUsagerBackend)
                const actif = etatUsagerBackend.challengeWebauthn?true:false
                setWebauthnActif(actif)
            })
            .catch(err=>console.error("Erreur chargement usager : %O", err))
    }, [connexion, setWebauthnActif, nomUsager])

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