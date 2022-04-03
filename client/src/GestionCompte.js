import {useState, useCallback} from 'react'

import Button from 'react-bootstrap/Button'
import Col from 'react-bootstrap/Col'
import Row from 'react-bootstrap/Row'
import Alert from 'react-bootstrap/Alert'

import {BoutonAjouterWebauthn} from './WebAuthn'
import ChargerCleMillegrille, {authentiferCleMillegrille} from './ChargerCleMillegrille'
import {getUserIdFromCertificat} from './comptesUtil'

function GestionCompte(props) {

    const { workers, setSectionAfficher, usagerDbLocal, confirmationCb, erreurCb } = props

    const [sectionGestion, setSectionGestion] = useState('')

    const retourCb = useCallback( () => setSectionAfficher(''), [setSectionAfficher])

    let Page
    switch(sectionGestion) {
        case 'SectionActiverDelegation': Page = SectionActiverDelegation; break
        default: Page = SectionGestionComptes
    }

    return (
        <>
            <h1>Gestion compte</h1>

            <Page 
                workers={workers}
                usagerDbLocal={usagerDbLocal}
                setSectionGestion={setSectionGestion}
                confirmationCb={confirmationCb}
                erreurCb={erreurCb}
                retourCb={retourCb}
            />
        </>
    )
}

export default GestionCompte

function SectionGestionComptes(props) {

    const {workers, usagerDbLocal, setSectionGestion, confirmationCb, erreurCb, retourCb} = props

    const activerDelegation = useCallback(()=>setSectionGestion('SectionActiverDelegation'), [setSectionGestion])

    return (
        <>
            <h2>Authentification</h2>

            <Button onClick={retourCb}>Retour</Button>

            <p>Controle des methodes d'authentification pour votre compte.</p>

            <Row>
                <Col md={8}>
                    Ajouter un token d'authentification <br/>
                    (e.g. lecteur d'empreinte, token de securite USB, etc.)
                </Col>
                <Col md={4}>
                    <BoutonAjouterWebauthn 
                        workers={workers}
                        usagerDbLocal={usagerDbLocal}
                        confirmationCb={confirmationCb}
                        erreurCb={erreurCb}
                        variant="secondary">
                        Ajouter methode
                    </BoutonAjouterWebauthn>
                </Col>
            </Row>

            <Row>
                <Col md={8}>
                    Activer delegation globale (administrateur).
                </Col>
                <Col md={4}>
                    <Button variant="secondary" onClick={activerDelegation}>Activer delegation</Button>
                </Col>
            </Row>  
        </>      
    )
}

function SectionActiverDelegation(props) {

    const {workers, usagerDbLocal, setSectionGestion, erreurCb} = props

    const [cleMillegrille, setCleMillegrille] = useState('')

    const retourCb = useCallback(()=>setSectionGestion(''), [setSectionGestion])
    const activerCb = useCallback(()=>{
        activerDelegation(workers, usagerDbLocal, cleMillegrille)
            .catch(err=>erreurCb(err))
    }, [workers, usagerDbLocal, cleMillegrille, erreurCb])

    return (
        <>
            <h2>Activer delegation</h2>

            <Button variant="secondary" onClick={retourCb}>Retour</Button>

            <p>
                Cette section permet d'utiliser la cle de millegrille pour ajouter une delegation globale
                de type proprietaire (administrateur). 
            </p>

            <ChargerCleMillegrille 
                setCleMillegrille={setCleMillegrille}
                erreurCb={erreurCb} />

            <hr />

            <Alert show={cleMillegrille?true:false} variant="primary">
                <Alert.Heading>Cle prete</Alert.Heading>
                La cle de MilleGrille est prete. Cliquez sur Activer pour ajouter le role 
                de delegation globale a votre compte.
            </Alert>

            <Button disabled={cleMillegrille?false:true} onClick={activerCb}>Activer</Button>
        </>
    )
}

async function activerDelegation(workers, usagerDbLocal, cleMillegrille) {

    const { connexion } = workers
    const { nomUsager, certificat } = usagerDbLocal

    const preuve = await authentiferCleMillegrille(workers, nomUsager, cleMillegrille, {activerDelegation: true})
    console.debug("Preuve signee : %O", preuve)

    const userId = getUserIdFromCertificat(certificat.join(''))

    const commande = {
        confirmation: preuve,
        userId,
    }
    console.debug("Commande activer delegation : %O", commande)

    const reponse = await connexion.activerDelegationParCleMillegrille(commande)
    console.debug("Reponse activerDelegation : %O", reponse)
}
