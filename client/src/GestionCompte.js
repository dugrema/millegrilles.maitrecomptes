import {useCallback} from 'react'

import Button from 'react-bootstrap/Button'
import Col from 'react-bootstrap/Col'
import Row from 'react-bootstrap/Row'

import {BoutonAjouterWebauthn} from './WebAuthn'

function GestionCompte(props) {

    const { workers, setSectionAfficher, usagerDbLocal, confirmationCb, erreurCb } = props

    const retourCb = useCallback( () => setSectionAfficher(''), [setSectionAfficher])

    return (
        <>
            <h1>Gestion compte</h1>

            <Button onClick={retourCb}>Retour</Button>

            <h2>Authentification</h2>

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
        </>
    )
}

export default GestionCompte
