import { useState, useCallback } from 'react'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'

import ChargerCleMillegrille, {authentiferCleMillegrille} from './ChargerCleMillegrille'
import {getUserIdFromCertificat} from './comptesUtil'

function SectionActiverDelegation(props) {

    const {workers, usagerDbLocal, setSectionGestion, confirmationCb, erreurCb, fermer} = props

    const [cleMillegrille, setCleMillegrille] = useState('')

    const retourCb = useCallback(()=>setSectionGestion(''), [setSectionGestion])
    const activerCb = useCallback(()=>{
        activerDelegation(workers, usagerDbLocal, cleMillegrille)
            .then(()=>confirmationCb('Delegation activee avec succes'))
            .catch(err=>erreurCb(err))
    }, [workers, usagerDbLocal, cleMillegrille, confirmationCb, erreurCb])

    return (
        <>
            <Row>
                <Col xs={10} md={11}><h2>Activer delegation</h2></Col>
                <Col xs={2} md={1} className="bouton"><Button onClick={fermer} variant="secondary"><i className='fa fa-remove'/></Button></Col>
            </Row>

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

export default SectionActiverDelegation

async function activerDelegation(workers, usagerDbLocal, cleMillegrille) {

    const { connexion } = workers
    const { nomUsager, certificat } = usagerDbLocal

    const preuve = await authentiferCleMillegrille(workers, nomUsager, cleMillegrille, {activerDelegation: true})
    // console.debug("Preuve signee : %O", preuve)

    const userId = getUserIdFromCertificat(certificat.join(''))

    const commande = {
        confirmation: preuve,
        userId,
    }
    // console.debug("Commande activer delegation : %O", commande)

    const reponse = await connexion.activerDelegationParCleMillegrille(commande)
    if(reponse.err) throw new Error(reponse.err)

    return reponse
}
