import { useState, useCallback } from 'react'
import Button from 'react-bootstrap/Button'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'

import { useTranslation, Trans } from 'react-i18next'

import useWorkers from './WorkerContext'

import { BoutonAjouterWebauthn } from './WebAuthn'

function AjouterMethode(props) {
    const {fermer, confirmationCb, erreurCb} = props

    const { t } = useTranslation()
    const workers = useWorkers()

    const [desactiverAutres, setDesactiverAutres] = useState(false)
    const handlerDesactiverAutres = useCallback(event => setDesactiverAutres(!!event.target.checked), [setDesactiverAutres])

    const succesCb = useCallback(()=>{
        let message = 'Nouvelle cle de securite ajoutee.'
        if(desactiverAutres) message += ' Toutes les autres cles de securite ont ete desactivees'
        confirmationCb(message)
        fermer()
    }, [desactiverAutres, confirmationCb, fermer])

    return (
        <div>
            <Row>
                <Col xs={10} md={11}><h2><Trans>AjouterMethode.titre</Trans></h2></Col>
                <Col xs={2} md={1} className="bouton"><Button onClick={fermer} variant="secondary"><i className='fa fa-remove'/></Button></Col>

                <p><Trans>AjouterMethode.description</Trans></p>

                <Form>
                    <Form.Group controlId="formCheckbox">
                        <Form.Check 
                            type="checkbox" 
                            label={t('AjouterMethode.checkbox-desactiver')} 
                            value='true'
                            checked={!!desactiverAutres} 
                            onChange={handlerDesactiverAutres} />
                    </Form.Group>
                </Form>

                <p></p>

                <Row>
                    <Col>
                        <BoutonAjouterWebauthn 
                            workers={workers}
                            resetMethodes={desactiverAutres}
                            confirmationCb={succesCb}
                            erreurCb={erreurCb}
                            variant="primary">
                            <Trans>AjouterMethode.bouton</Trans>
                        </BoutonAjouterWebauthn>
                    </Col>
                </Row>
            </Row>
        </div>
    )
}

export default AjouterMethode
