import {useState, useEffect} from 'react'
import Alert from 'react-bootstrap/Alert'

import {BoutonAjouterWebauthn} from './WebAuthn'

function Accueil(props) {
    console.debug("Proppies : %O", props)

    const { workers, usagerDbLocal, confirmationCb, erreurCb } = props

    return (
        <>
            <h1>Accueil</h1>
            <DemanderEnregistrement 
                workers={workers} 
                usagerDbLocal={usagerDbLocal}
                confirmationCb={confirmationCb}
                erreurCb={erreurCb} />
        </>
    )
}

export default Accueil

function DemanderEnregistrement(props) {

    const { workers, usagerDbLocal, confirmationCb, erreurCb } = props
    const { connexion } = workers
    const { nomUsager } = usagerDbLocal

    const [webauthnActif, setWebauthnActif] = useState(true)

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
                confirmationCb={confirmationCb}
                erreurCb={erreurCb}
                variant="secondary">
                Ajouter methode
            </BoutonAjouterWebauthn>

        </Alert>
    )


}